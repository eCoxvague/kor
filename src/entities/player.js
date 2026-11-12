// KOR — oyuncu: hareket, birincil saldırı (sınıfa göre), atılma, sıcaklık
import { clamp, dist, angDiff, TAU, easeOut } from '../core/util.js';
import { playerFrames, playerFrame, axeFrame, bowFrame, staffTip, basketLogs, PFOOT_X, PFOOT_Y, AXE_SIZE, BOW_SIZE } from '../art/sprites.js';
import { Projectile } from './projectile.js';
import { HIT_STOP } from '../systems/fx.js';

export const LOCK_ARC = Math.PI / 3;   // yakın dövüş hedef yardımı: nişan yönünün ±60°'si
const COMBO_TIME = 1.2;                // son vuruştan sonra kombo canlı kalma süresi (sn)

export class Player {
  constructor(game) {
    this.game = game;
    this.cls = game.cls;
    this.classId = game.classId;
    this.prim = this.cls.primary;
    // zamanlama: savurma toplam süresi ve "darbe karesi" (girişten en çok ~90 ms)
    this.windup = this.prim.windup;
    this.swingDur = this.prim.swing;
    this.x = game.world.altar.x;
    this.y = game.world.altar.y + 44;
    this.vx = 0; this.vy = 0;
    this.bx = 0; this.by = 0;           // sekme (kilitli ağaç) itmesi
    this.r = 7;
    this.facing = -Math.PI / 2;
    this.keyAng = this.facing;          // klavye modunda son hareket yönü
    this.hp = game.stats.maxHp;
    this.warmth = game.stats.maxWarmth;
    this.carried = 0;
    this.walkT = 0; this.moving = false;
    this.swingT = 0; this.swinging = false; this.hitDone = false;
    this.cd = 0;
    this.attackBuf = 0;                 // savurma sürerken basılan tuş kısa süre hatırlanır
    this.attacks = 0;                   // gerçekleşen birincil saldırı (darbe) sayısı
    this.lastHitAt = -99;            // son darbenin oyun zamanı
    this.lock = null;                   // son kilitlenen hedef { kind, ref, ang }
    this.combo = 0; this.comboT = 0;
    this.dashT = 0; this.dashCdT = 0; this.dashDir = { x: 0, y: 0 };
    this.hurtT = 0; this.invuln = 0;
    this.frames = playerFrames();
    this.trail = [];
    this.aim = { x: 1, y: 0 };
    this.coldT = 0; this.scorchT = 0;
    this.lunge = 0;
    this.animT = 0;          // görsel: bekleme nefesi
    this.dmgReduce = 0;
  }

  get maxHp() { return this.game.stats.maxHp; }
  get maxWarmth() { return this.game.stats.maxWarmth; }
  get isMelee() { return this.prim.type === 'melee'; }
  // savurmanın hangi evrede olduğu (çizim için): 'idle' | 'wind' | 'strike' | 'recover'
  get swingPhase() {
    if (!this.swinging) return 'idle';
    if (this.swingT < this.windup) return 'wind';
    return this.swingT < this.windup + 0.1 ? 'strike' : 'recover';
  }
  // büyücü: ısı düşükken büyü zayıflar ama kilitlenmez (0.45..1)
  heatPower() {
    return 0.45 + 0.55 * clamp(this.warmth / (this.maxWarmth * 0.4), 0, 1);
  }

  // yüz yönü: fare modunda fareye, klavye modunda hareket yönüne (savurma sırasında kilitli).
  // Game.update saldırıdan ÖNCE de çağırır, böylece ilk vuruş eski nişanla gitmez.
  updateAim(input) {
    const mode = input.mode || 'mouse';
    const ax = input.axis;
    if (ax.x || ax.y) this.keyAng = Math.atan2(ax.y, ax.x);
    if (this.swinging) return;
    if (mode === 'mouse') {
      const mw = input.mouseWorld;
      const adx = mw.x - this.x, ady = mw.y - this.y;
      if (Math.hypot(adx, ady) > 4) { this.facing = Math.atan2(ady, adx); this.aim = { x: adx, y: ady }; }
    } else if (ax.x || ax.y) {
      this.facing = this.keyAng; this.aim = { x: Math.cos(this.keyAng), y: Math.sin(this.keyAng) };
    }
  }

  update(dt, input) {
    const g = this.game, s = g.stats;
    const ax = input.axis;
    this.updateAim(input);

    // hareket (savururken yavaşlar, kilitlenmez)
    const slow = this.swinging ? (this.isMelee ? 0.6 : 0.8) : 1;
    const speed = s.moveSpeed * slow * (this.warmth <= 0 ? 0.6 : 1);
    if (this.dashT > 0) {
      this.dashT -= dt;
      const k = 430;
      this.vx = this.dashDir.x * k;
      this.vy = this.dashDir.y * k;
      if (this.trail.length < 40 && (this.trail.length === 0 || Math.hypot(this.x - this.trail[this.trail.length - 1].x, this.y - this.trail[this.trail.length - 1].y) > 12)) this.trail.push({ x: this.x, y: this.y, t: 0.22, f: this.facing, dir: this.dirName(), pose: 'walk' + (((this.walkT | 0) % 4)) });
    } else {
      const tx = ax.x * speed, ty = ax.y * speed;
      this.vx += (tx - this.vx) * Math.min(1, dt * 14);
      this.vy += (ty - this.vy) * Math.min(1, dt * 14);
    }
    this.x += (this.vx + this.bx) * dt; this.y += (this.vy + this.by) * dt;
    const decay = Math.max(0, 1 - dt * 12);
    this.bx *= decay; this.by *= decay;
    // dünya sınırları + ağaç çarpışması
    const W = g.world, pad = 16;
    this.x = clamp(this.x, pad, W.w - pad); this.y = clamp(this.y, pad, W.h - pad);
    for (const t of W.trees) {
      if (t.dead) continue;
      const d = dist(this.x, this.y, t.x, t.y);
      const min = t.radius * 0.55 + this.r;
      if (d < min && d > 0.001) {
        const nx = (this.x - t.x) / d, ny = (this.y - t.y) / d;
        this.x = t.x + nx * min; this.y = t.y + ny * min;
      }
    }

    this.animT += dt;
    this.moving = Math.hypot(this.vx, this.vy) > 18;
    if (this.moving) this.walkT += dt * (this.dashT > 0 ? 18 : 9);

    // savurma: darbe karesinde hasar, sonra toparlanma
    if (this.swinging) {
      this.swingT += dt;
      if (!this.hitDone && this.swingT >= this.windup) { this.hitDone = true; this.performHit(); }
      if (this.swingT >= this.swingDur) { this.swinging = false; this.swingT = 0; }
    }
    this.cd = Math.max(0, this.cd - dt);
    this.attackBuf = Math.max(0, this.attackBuf - dt);
    this.lunge = Math.max(0, this.lunge - dt * 6);

    // kombo zamanlayıcı
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }

    // bekleme süreleri
    this.dashCdT = Math.max(0, this.dashCdT - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    for (let i = this.trail.length - 1; i >= 0; i--) {
      this.trail[i].t -= dt; if (this.trail[i].t <= 0) this.trail.splice(i, 1);
    }

    // sıcaklık
    const altar = W.altar;
    const dAltar = dist(this.x, this.y, altar.x, altar.y);
    const nearFire = dAltar < g.fire.warmRadius;
    if (nearFire && g.fire.fuel > 0) {
      this.warmth = Math.min(this.maxWarmth, this.warmth + s.warmthRegen * 1.6 * dt);
    } else {
      this.warmth = Math.max(0, this.warmth - s.warmthDrain * dt);
    }
    if (this.warmth <= 0) {
      this.coldT += dt;
      if (this.coldT > 0.7) {
        this.coldT = 0;
        this.hurt(3 + g.night * 3, null, true);
      }
      g.fx.smoke(this.x, this.y - 4, 1);
    } else this.coldT = 0;

    // ısı: ateşin tam üstünde durmak yakar
    if (g.fire.fuel > 0 && dAltar < 16 + g.fire.level * 1.5) {
      this.scorchT += dt;
      if (this.scorchT > 0.5) { this.scorchT = 0; this.hurt(3, null); }
    } else this.scorchT = 0;

    if (this.hurtT <= 0 && this.invuln <= 0 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + 0.8 * dt);
    if (this.hurtT <= 0 && this.hp < this.maxHp && nearFire && g.fire.fuel > 0) {
      this.hp = Math.min(this.maxHp, this.hp + 2.5 * dt);
    }
  }

  // ---------- saldırı ----------
  startSwing() {
    if (this.swinging || this.cd > 0) return false;
    this.swinging = true; this.swingT = 0; this.hitDone = false;
    this.attackBuf = 0;
    const comboSpeed = 1 + Math.min(this.combo, 10) * 0.03;      // kombo: kesim hızı +%30'a kadar
    this.cd = 1 / (this.game.stats.attackSpeed * comboSpeed);
    this.facing = this.resolveAim().ang;
    return true;
  }

  // yönü ve (varsa) kilitlenen hedefi bulur. Fare modunda nişan, klavye modunda hareket yönü + en yakın hedef.
  resolveAim() {
    const g = this.game, mode = g.inputMode;
    const base = mode === 'keys' ? this.keyAng : Math.atan2(this.aim.y, this.aim.x);
    if (this.isMelee) {
      const lock = this.findMeleeLock(base, mode);
      return { ang: lock ? lock.ang : base, lock, dist: 0 };
    }
    const pt = g.aimPoint(this.prim.range);
    return { ang: pt.ang, lock: null, dist: pt.dist };
  }

  findMeleeLock(base, mode) {
    const g = this.game, reach = g.stats.reach + 8;
    let best = null, bs = Infinity;
    const consider = (kind, ref, d, bias) => {
      const a = Math.atan2(ref.y - this.y, ref.x - this.x);
      const diff = Math.abs(angDiff(base, a));
      if (mode === 'mouse' && diff > LOCK_ARC) return;
      const score = (mode === 'mouse' ? diff * 50 : 0) + d * 0.5 + bias;
      if (score < bs) { bs = score; best = { kind, ref, ang: a }; }
    };
    for (const t of g.world.trees) {
      if (t.dead) continue;
      const d = dist(this.x, this.y, t.x, t.y);
      if (d - t.radius * 0.5 > reach) continue;
      consider('tree', t, d, g.canCut(t) ? 0 : 60);      // kilitli ağaç son seçenek
    }
    for (const e of g.enemies) {
      if (e.dead) continue;
      const d = dist(this.x, this.y, e.x, e.y);
      if (d > reach + e.r) continue;
      consider('enemy', e, d, -10);
    }
    return best;
  }

  registerHit() {
    this.combo++; this.comboT = COMBO_TIME;
  }

  rollDamage() {
    const s = this.game.stats;
    const comboMult = 1 + Math.min(this.combo, 10) * 0.055;
    let dmg = s.damage * comboMult;
    const crit = Math.random() < s.critChance;
    if (crit) dmg *= s.critMult;
    return { dmg, crit };
  }

  performHit() {
    this.attacks++;
    this.lastHitAt = this.game.time;
    const t = this.prim.type;
    if (t === 'arrow') return this.fireArrows();
    if (t === 'orb') return this.fireOrb();
    return this.swingAxe();
  }

  swingAxe() {
    const g = this.game, s = g.stats;
    const reach = s.reach + 8;
    const arc = s.arc;
    const { ang, lock } = this.resolveAim();
    this.facing = ang; this.lock = lock;
    const { dmg, crit } = this.rollDamage();
    let treeHit = false, anyEnemy = false, killed = 0;
    g.sfx.swing();

    if (lock && lock.kind === 'tree') treeHit = g.hitTree(lock.ref, dmg, crit, false, ang);
    let targets = s.targets;
    for (const e of g.enemies) {
      if (e.dead) continue;
      const d = dist(this.x, this.y, e.x, e.y);
      if (d > reach + e.r) continue;
      const a = Math.atan2(e.y - this.y, e.x - this.x);
      if (Math.abs(angDiff(ang, a)) > arc / 2) continue;
      e.hurt(dmg, this);
      anyEnemy = true;
      if (e.dead) killed++;
      if (--targets <= 0) break;
    }
    g.fx.slash(this.x, this.y - 4, ang, reach, arc, 0.16);
    if (anyEnemy) {
      if (s.lifesteal) this.hp = Math.min(this.maxHp, this.hp + s.lifesteal);
      g.fx.stop(crit ? HIT_STOP.crit : HIT_STOP.hit);
      g.fx.shake(crit ? 3.2 : 1.5, crit ? 0.2 : 0.12);
    } else if (treeHit) {
      g.fx.shake(1.2, 0.1);
    } else {
      g.fx.shake(0.3, 0.05);
    }
    if (anyEnemy || treeHit) this.registerHit();
    this.lunge = crit ? 1 : 0.6;
    return killed;
  }

  fireArrows() {
    const g = this.game, s = g.stats, pr = this.prim;
    const { ang } = this.resolveAim();
    this.facing = ang;
    const { dmg, crit } = this.rollDamage();
    const n = s.multishot;
    const each = dmg * (1 - 0.15 * (n - 1));
    const tip = s.burnChance > 0 ? '#ff8a2a' : '#cfd8e3';
    for (let i = 0; i < n; i++) {
      const a = ang + (i - (n - 1) / 2) * 0.13;
      g.projectiles.push(new Projectile(g, this.x + Math.cos(a) * 9, this.y + Math.sin(a) * 9, a, pr.speed, pr.range / pr.speed, each, tip, 3, 0,
        { kind: 'arrow', z: 8, treeMul: pr.treeMul, pierce: s.pierce, primary: true, crit }));
    }
    g.sfx.shoot();
    this.lunge = 0.3;
  }

  fireOrb() {
    const g = this.game, s = g.stats, pr = this.prim;
    const { ang, dist: aimD } = this.resolveAim();
    this.facing = ang;
    const power = this.heatPower();
    // büyü ısıyı harcar; ısı bitse de atış yapılır (zayıf)
    this.warmth = Math.max(0, this.warmth - pr.heat * s.heatCostMul);
    const { dmg, crit } = this.rollDamage();
    const d = dmg * power;
    const travel = clamp(aimD || pr.range, 24, pr.range);   // imlecin olduğu yerde patlar
    g.projectiles.push(new Projectile(g, this.x + Math.cos(ang) * 9, this.y + Math.sin(ang) * 9, ang, pr.speed, travel / pr.speed, d, '#ff8a2a', 4, 0, {
      kind: 'orb', z: 8, treeMul: pr.treeMul, primary: true, crit,
      blast: { r: s.blastRadius * (0.8 + 0.2 * power), dmg: d, treeMul: pr.treeMul, chill: s.chill, freeze: s.freeze },
    }));
    g.sfx.cast();
    g.fx.ring(this.x + Math.cos(ang) * 8, this.y - 6 + Math.sin(ang) * 5, 8, '#ffb447', 0.18, 1);
    this.lunge = 0.3;
  }

  dash() {
    const g = this.game;
    if (this.dashCdT > 0 || this.dashT > 0) return false;
    const ax = g.input.axis;
    let dx = ax.x, dy = ax.y;
    if (!dx && !dy) { dx = Math.cos(this.facing); dy = Math.sin(this.facing); }
    const m = Math.hypot(dx, dy) || 1;
    this.dashDir = { x: dx / m, y: dy / m };
    this.dashT = 0.16;
    this.dashCdT = g.stats.dashCd;
    this.invuln = Math.max(this.invuln, 0.22);
    g.sfx.dash();
    g.fx.ring(this.x, this.y + 4, 14, '#ffb447', 0.25, 1);
    return true;
  }

  // yetenekler için: verilen yönde kısa, bekleme gerektirmeyen atılma
  dashTo(dx, dy, dur = 0.18, invuln = 0.4) {
    const m = Math.hypot(dx, dy) || 1;
    this.dashDir = { x: dx / m, y: dy / m };
    this.dashT = dur;
    this.invuln = Math.max(this.invuln, invuln);
    this.game.sfx.dash();
  }

  // kilitli ağaçtan sekme
  bump(ang, power = 150) {
    this.bx = -Math.cos(ang) * power; this.by = -Math.sin(ang) * power;
  }

  hurt(amount, src, ignoreInvuln) {
    const g = this.game;
    if (!ignoreInvuln && this.invuln > 0) return;
    if (!ignoreInvuln && g.stats.dodge > 0 && Math.random() < g.stats.dodge) {
      this.invuln = Math.max(this.invuln, 0.3);
      g.fx.text(this.x, this.y - 18, 'KAÇTI', '#8fd3ff', 8);
      return;
    }
    if (this.dmgReduce) amount *= (1 - this.dmgReduce);
    this.hp -= amount;
    this.hurtT = 0.32;
    this.invuln = Math.max(this.invuln, 0.6);
    g.fx.shake(4, 0.24);
    g.fx.text(this.x, this.y - 18, '-' + Math.round(amount), '#ff5a4a', 9);
    g.fx.screenFlash('#7a1010', 0.2);
    g.sfx.hurt();
    this.combo = 0;
    if (this.hp <= 0) { this.hp = 0; g.onPlayerDeath(); }
  }

  // görsel: bakış yönü (fareye göre) → r / l / d / u
  dirName() {
    const c = Math.cos(this.facing), sn = Math.sin(this.facing);
    if (Math.abs(c) >= Math.abs(sn) * 0.9) return c >= 0 ? 'r' : 'l';
    return sn > 0 ? 'd' : 'u';
  }

  // savurma sırasında balta açısı: hazırlık → vuruş → takip
  axeAngle() {
    const k = clamp(this.swingT / this.swingDur, 0, 1), f = this.facing;
    const wk = this.windup / this.swingDur;
    // darbe karesinde (k = wk) balta tam hedefin üstündedir: önce hızla kalkar, sonra iner; ardından takip
    if (k < wk) {
      const u = k / wk;
      return u < 0.35 ? f - 1.3 - 0.8 * (u / 0.35) : f - 2.1 + 2.1 * Math.pow((u - 0.35) / 0.65, 2);
    }
    if (k < wk + 0.3) return f + 1.15 * easeOut((k - wk) / 0.3);
    return f + 1.15 + 0.2 * ((k - wk - 0.3) / (1 - wk - 0.3));
  }

  drawShadow(ctx, cam, spr) {
    ctx.drawImage(spr, Math.round(this.x - cam.x) - (spr.width >> 1), Math.round(this.y - cam.y) + 1 - (spr.height >> 1));
  }

  // çizimde kullanılan poz adı
  poseName() {
    if (this.swinging) return this.swingT < this.windup ? 'wind' : 'strike';
    if (this.dashT > 0) return 'dash';
    if (this.hurtT > 0.2) return 'hurt';
    if (this.moving) return 'walk' + (((this.walkT | 0) % 4));
    return 'idle' + (((this.animT / 0.6) | 0) % 2);
  }

  draw(ctx, cam) {
    if (this.hp <= 0 && this.game.state === 'death') return;      // öldü: küle dağıldı (fx.ash)
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
    const cid = this.classId;
    for (const t of this.trail) {
      ctx.globalAlpha = (t.t / 0.22) * 0.45;
      ctx.drawImage(playerFrame(t.dir, 'dash', 'g', cid), Math.round(t.x - cam.x) - PFOOT_X, Math.round(t.y - cam.y) + 2 - PFOOT_Y);
    }
    ctx.globalAlpha = 1;
    const dir = this.dirName();
    const pose = this.poseName();
    const variant = this.hurtT > 0.22 ? 'f' : 'n';
    // darbe anında küçük ileri hamle (yalnızca görsel)
    const lg = this.lunge > 0 ? Math.round(this.lunge * 2) : 0;
    const px = x - PFOOT_X + Math.round(Math.cos(this.facing) * lg), py = y + 2 - PFOOT_Y + Math.round(Math.sin(this.facing) * lg * 0.6);
    let alpha = 1;
    if (this.hurtT > 0 && variant === 'n') alpha = Math.sin(this.hurtT * 70) > 0 ? 1 : 0.35;
    if (this.warmth <= 0) alpha *= 0.8;
    ctx.globalAlpha = alpha;
    const logs = this.carried > 0;
    if (logs && dir !== 'u') ctx.drawImage(basketLogs(dir, cid), px, py);
    let ax = 0, ay = 0, wpn = null, half = 16;
    if (this.swinging && this.isMelee) {
      const ang = this.axeAngle();
      ax = x + Math.round(Math.cos(ang) * 4); ay = y - 9 + Math.round(Math.sin(ang) * 3);
      wpn = axeFrame(ang); half = AXE_SIZE >> 1;
    } else if (this.swinging && this.prim.type === 'arrow') {
      ax = x + Math.round(Math.cos(this.facing) * 4); ay = y - 9 + Math.round(Math.sin(this.facing) * 3);
      wpn = bowFrame(this.facing, this.swingT < this.windup); half = BOW_SIZE >> 1;
    }
    if (wpn && dir === 'u') ctx.drawImage(wpn, ax - half, ay - half);
    ctx.drawImage(playerFrame(dir, pose, variant, cid), px, py);
    if (logs && dir === 'u') ctx.drawImage(basketLogs(dir, cid), px, py);
    if (wpn && dir !== 'u') ctx.drawImage(wpn, ax - half, ay - half);
    ctx.globalAlpha = 1;
  }

  // karanlığın üstünde: büyücünün asa ucundaki kor (titrer; büyü anında parlar)
  drawGlow(ctx, cam) {
    if (this.prim.type !== 'orb' || (this.hp <= 0 && this.game.state === 'death')) return;
    const dir = this.dirName(), pose = this.poseName();
    const tip = staffTip(dir, pose);
    const x = Math.round(this.x - cam.x) - PFOOT_X + tip[0], y = Math.round(this.y - cam.y) + 2 - PFOOT_Y + tip[1];
    const weak = this.heatPower() < 0.999;
    const fl = ((this.animT * 12) | 0) % 3;
    ctx.fillStyle = weak ? '#9a240f' : fl ? '#ffe08a' : '#fff6d6';
    ctx.fillRect(x, y - 1, 1, 1);
    if (!weak && fl === 1) { ctx.fillStyle = '#ffb447'; ctx.fillRect(x + (dir === 'l' ? -2 : 2), y - 3, 1, 1); }
    if (pose === 'strike') {
      ctx.fillStyle = '#fff6d6';
      ctx.fillRect(x - 1, y - 2, 3, 3); ctx.fillRect(x - 3, y - 1, 7, 1); ctx.fillRect(x, y - 4, 1, 7);
    }
  }
}
