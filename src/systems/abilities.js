// KOR — yetenekler (sınıf başına 4: tuşlar 1-2-3-Q)
//   baltacı: kor dalgası, ateş halkası, kül peçesi, ocak öfkesi
//   okçu:    ok yağmuru, delici ok, geri sıçrama, kor yağmuru
//   büyücü:  alev dalgası, ayaz halkası, buz kalkanı, meteor
import { dist, TAU, clamp } from '../core/util.js';
import { Projectile } from '../entities/projectile.js';
import { CLASSES, CLASS_IDS, ABILITY_KEYS } from './classes.js';
import { PAL } from '../art/palette.js';
import { HIT_STOP } from './fx.js';
import { discSprite, crystalSprite, tongueSprite, arrowSprite, meteorSprite } from '../art/fxart.js';

export const ABILITIES = {
  // baltacı
  wave:      { cls: 'baltaci', name: 'Kor Dalgası', cd: 2.6, cost: 10, icon: 'ab_wave' },
  ring:      { cls: 'baltaci', name: 'Ateş Halkası', cd: 5.0, cost: 18, icon: 'ab_ring' },
  veil:      { cls: 'baltaci', name: 'Kül Peçesi', cd: 8.0, cost: 22, icon: 'ab_veil' },
  wrath:     { cls: 'baltaci', name: 'Ocak Öfkesi', cd: 14.0, cost: 40, icon: 'ab_wrath' },
  // okçu
  rain:      { cls: 'okcu', name: 'Ok Yağmuru', cd: 6.0, cost: 12, icon: 'ab_rain' },
  lance:     { cls: 'okcu', name: 'Delici Ok', cd: 4.0, cost: 10, icon: 'ab_lance' },
  leap:      { cls: 'okcu', name: 'Geri Sıçrama', cd: 7.0, cost: 14, icon: 'ab_leap' },
  emberRain: { cls: 'okcu', name: 'Kor Yağmuru', cd: 15.0, cost: 36, icon: 'ab_emberRain' },
  // büyücü
  flamewave: { cls: 'buyucu', name: 'Alev Dalgası', cd: 3.5, cost: 14, icon: 'ab_flamewave' },
  frostring: { cls: 'buyucu', name: 'Ayaz Halkası', cd: 6.0, cost: 16, icon: 'ab_frostring' },
  ward:      { cls: 'buyucu', name: 'Buz Kalkanı', cd: 10.0, cost: 20, icon: 'ab_ward' },
  meteor:    { cls: 'buyucu', name: 'Meteor', cd: 14.0, cost: 40, icon: 'ab_meteor' },
};
// tuş ve yuva sırası sınıf verisinden gelir
for (const cid of CLASS_IDS) CLASSES[cid].abilities.forEach((id, i) => { ABILITIES[id].key = ABILITY_KEYS[i]; ABILITIES[id].slot = i; });
export const ALL_ABILITY_IDS = Object.keys(ABILITIES);

const zeroCd = () => Object.fromEntries(ALL_ABILITY_IDS.map(id => [id, 0]));

export class AbilitySystem {
  constructor(game) {
    this.game = game;
    this.cd = zeroCd();
    this.rings = [];
    this.clouds = [];
    this.zones = [];     // ok/kor yağmuru, tuzak: alan içinde periyodik hasar
    this.strikes = [];   // meteor: gecikmeli düşüş
    this.wrathT = 0;
    this.veilT = 0;
    this.shieldPow = 0.4;
  }
  reset() {
    this.cd = zeroCd();
    this.rings.length = 0; this.clouds.length = 0; this.zones.length = 0; this.strikes.length = 0;
    this.wrathT = 0; this.veilT = 0;
  }

  has(id) { return (this.game.stats[id] || 0) > 0 && this.game.cls.abilities.includes(id); }
  level(id) { return this.has(id) ? this.game.stats[id] : 0; }
  // ısı bedeli (büyücüde ISI tutumu ile düşer)
  cost(id) { return ABILITIES[id].cost * this.game.stats.heatCostMul; }
  maxCd(id) { return ABILITIES[id].cd * (1 - Math.min(0.35, this.level(id) * 0.05)); }

  update(dt) {
    const g = this.game;
    for (const k in this.cd) this.cd[k] = Math.max(0, this.cd[k] - dt);
    this.wrathT = Math.max(0, this.wrathT - dt);
    this.veilT = Math.max(0, this.veilT - dt);

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.r += r.spd * dt; r.life -= dt;
      r.hitT -= dt;
      if (r.hitT <= 0) {
        r.hitT = 0.12;
        for (const e of g.enemies) {
          if (e.dead) continue;
          const d = dist(r.x, r.y, e.x, e.y);
          if (Math.abs(d - r.r) < 14 + e.r) {
            e.hurt(r.dmg * 0.3, g.player);
            if (r.frost) {
              e.slowT = Math.max(e.slowT, r.slow || 2);
              if (Math.random() < 0.08 * r.lvl) e.freezeT = Math.max(e.freezeT, 1.0);
            } else if (Math.random() < 0.5) e.burnDps = Math.max(e.burnDps, 6);
          }
        }
        for (const t of g.world.trees) {
          if (t.dead) continue;
          if (Math.abs(dist(r.x, r.y, t.x, t.y) - r.r) < 16) g.hitTree(t, r.dmg * 0.2, false, true);
        }
      }
      if (r.life <= 0) this.rings.splice(i, 1);
    }
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.life -= dt;
      c.tick -= dt;
      if (c.tick <= 0) {
        c.tick = 0.35;
        for (const e of g.enemies) {
          if (e.dead) continue;
          if (dist(c.x, c.y, e.x, e.y) < c.r) {
            e.hurt(c.dmg, g.player);
            e.slowT = Math.max(e.slowT, c.frost ? 1.4 : 0.8);
            if (!c.frost) e.burnDps = Math.max(e.burnDps, 4);
          }
        }
      }
      if (c.life <= 0) this.clouds.splice(i, 1);
    }
    // alan bölgeleri (yağmurlar, tuzak)
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.life -= dt; z.tick -= dt;
      if (z.tick <= 0) {
        z.tick = z.every;
        g.explode(z.x, z.y, { r: z.r, dmg: z.dmg, treeMul: z.treeMul, primary: false, quiet: true, burn: z.burn, slow: z.slow, falloff: 0.1 });
        if (z.kind !== 'snare') g.fx.spark(z.x + (Math.random() - 0.5) * z.r * 1.4, z.y + (Math.random() - 0.5) * z.r * 1.4, 2, 70, z.burn ? '#ff8a2a' : '#e9e0cc');
      }
      if (z.life <= 0) this.zones.splice(i, 1);
    }
    // meteor: gecikme dolunca düşer
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const m = this.strikes[i];
      m.t += dt;
      if (m.t >= m.delay) {
        g.explode(m.x, m.y, { r: m.r, dmg: m.dmg, treeMul: 0.9, primary: false, burn: 14, big: true, falloff: 0.3 });
        g.fx.shake(8, 0.4); g.fx.screenFlash('#ffd28a', 0.4);
        this.strikes.splice(i, 1);
      }
    }
    g.player.dmgReduce = this.veilT > 0 ? this.shieldPow : 0;
  }

  cast(id) {
    const g = this.game, s = g.stats, p = g.player;
    if (!ABILITIES[id] || !g.cls.abilities.includes(id)) return false;
    if (!this.has(id)) { g.toast('Bu yetenek kilitli — beceri ağacından aç'); g.sfx.deny(); return false; }
    if (this.cd[id] > 0) return false;
    const def = ABILITIES[id];
    const cost = this.cost(id);
    if (p.warmth < cost) { g.toast('Sıcaklık yetersiz'); g.sfx.deny(); return false; }
    const lvl = this.level(id);
    const ap = s.abilityPower;
    this.cd[id] = this.maxCd(id);
    p.warmth -= cost;
    g.sfx.skill();
    const aim = g.aimPoint(260);

    switch (id) {
      // ---------- baltacı ----------
      case 'wave': {
        const n = 1 + lvl;
        const dmg = (9 + lvl * 7) * ap;
        for (let i = 0; i < n; i++) {
          const a = p.facing + (i - (n - 1) / 2) * 0.19;
          const pr = new Projectile(g, p.x + Math.cos(a) * 10, p.y + Math.sin(a) * 10 - 3, a, 260, 0.62, dmg, i % 2 ? '#ffd27a' : '#ff8a2a', 4 + lvl * 0.4);
          pr.isAbility = true;
          g.projectiles.push(pr);
        }
        g.fx.blast(p.x + Math.cos(p.facing) * 10, p.y - 4 + Math.sin(p.facing) * 6, 14, 'fire');
        g.fx.shake(2, 0.1);
        break;
      }
      case 'ring':
        this.rings.push({ x: p.x, y: p.y, r: 12, spd: 210, life: 1.1, max: 1.1, dmg: (16 + lvl * 14) * ap, hitT: 0, lvl });
        g.fx.shake(3, 0.16);
        g.fx.screenFlash('#ff8a2a', 0.12);
        g.fx.blast(p.x, p.y - 4, 20, 'fire');
        break;
      case 'veil':
        this.clouds.push({ x: p.x, y: p.y, r: 54 + lvl * 10, life: 3.2 + lvl * 0.7, max: 3.2 + lvl * 0.7, dmg: (5 + lvl * 6) * ap, tick: 0 });
        this.veilT = 3.0 + lvl * 0.6; this.shieldPow = 0.4;
        g.fx.blast(p.x, p.y, 54 + lvl * 10, 'ash');
        g.fx.smoke(p.x, p.y, 10);
        break;
      case 'wrath': {
        const dmg = (55 + lvl * 40) * ap;
        const R = 96 + lvl * 26;
        g.explode(p.x, p.y, { r: R, dmg, treeMul: 0.7, primary: false, burn: 18, quiet: true, falloff: 0.45 });
        this.wrathT = 4.5 + lvl;
        g.fire.flare = 1;
        g.fx.blast(p.x, p.y, R, 'fire', true);
        g.fx.blast(p.x, p.y, R * 0.55, 'gold', true);
        g.fx.spark(p.x, p.y, 34, 220);
        g.fx.embers(p.x, p.y, 16, R * 0.5);
        g.fx.shake(9, 0.5);
        g.fx.stop(HIT_STOP.wrath);
        g.fx.screenFlash('#ffd28a', 0.55);
        break;
      }
      // ---------- okçu ----------
      case 'rain':
      case 'emberRain': {
        const ember = id === 'emberRain';
        const life = ember ? 3.4 + lvl * 0.5 : 2.6 + lvl * 0.4;
        this.zones.push({
          kind: ember ? 'ember' : 'rain', x: aim.x, y: aim.y, r: (ember ? 70 : 50) + lvl * 8,
          life, max: life, tick: 0, every: 0.22,
          dmg: (ember ? 12 + lvl * 7 : 7 + lvl * 4) * ap, treeMul: ember ? 0.45 : 0.35, burn: ember ? 10 : 0, slow: false,
        });
        g.fx.blast(aim.x, aim.y, (ember ? 70 : 50) + lvl * 8, ember ? 'fire' : 'steel');
        break;
      }
      case 'lance': {
        const a = aim.ang;
        g.projectiles.push(new Projectile(g, p.x + Math.cos(a) * 10, p.y + Math.sin(a) * 10, a, 650, 0.46, (20 + lvl * 12) * ap, '#fff2c0', 4, 0,
          { kind: 'lance', z: 8, treeMul: 0.8, pierce: 99 }));
        p.facing = a;
        g.fx.shake(2, 0.1);
        break;
      }
      case 'leap': {
        const a = Math.atan2(aim.y - p.y, aim.x - p.x);
        this.zones.push({ kind: 'snare', x: p.x, y: p.y, r: 36 + lvl * 6, life: 4 + lvl, max: 4 + lvl, tick: 0, every: 0.4, dmg: (4 + lvl * 3) * ap, treeMul: 0, burn: 0, slow: true });
        p.dashTo(-Math.cos(a), -Math.sin(a), 0.2, 0.45);
        g.fx.blast(p.x, p.y, 36 + lvl * 6, 'moss');
        g.fx.dust(p.x, p.y + 2, 8, 12);
        break;
      }
      // ---------- büyücü ----------
      case 'flamewave': {
        const n = 3 + lvl, a0 = aim.ang;
        const dmg = (10 + lvl * 6) * ap;
        for (let i = 0; i < n; i++) {
          const a = a0 + (i - (n - 1) / 2) * 0.17;
          g.projectiles.push(new Projectile(g, p.x + Math.cos(a) * 10, p.y + Math.sin(a) * 10, a, 250, 0.5, dmg, i % 2 ? '#ffd27a' : '#ff8a2a', 4, 0, {
            kind: 'orb', z: 8, treeMul: 0.8,
            blast: { r: 22 + lvl * 3, dmg, treeMul: 0.8, chill: s.chill, freeze: s.freeze },
          }));
        }
        p.facing = a0;
        g.fx.blast(p.x + Math.cos(a0) * 10, p.y - 6 + Math.sin(a0) * 6, 16, 'fire');
        g.fx.shake(2, 0.1);
        break;
      }
      case 'frostring':
        this.rings.push({ x: p.x, y: p.y, r: 12, spd: 190, life: 1.2, max: 1.2, dmg: (10 + lvl * 8) * ap, hitT: 0, lvl, frost: true, slow: 1.8 + lvl * 0.5 });
        g.fx.shake(2, 0.12);
        g.fx.screenFlash('#8fd3ff', 0.12);
        g.fx.blast(p.x, p.y - 4, 20, 'frost');
        g.sfx.frost();
        break;
      case 'ward':
        this.clouds.push({ x: p.x, y: p.y, r: 46 + lvl * 8, life: 3 + lvl * 0.8, max: 3 + lvl * 0.8, dmg: (3 + lvl * 3) * ap, tick: 0, frost: true });
        this.veilT = 3.2 + lvl * 0.8; this.shieldPow = 0.55;
        g.fx.blast(p.x, p.y, 46 + lvl * 8, 'frost');
        g.sfx.frost();
        break;
      case 'meteor': {
        const d = 0.85;
        this.strikes.push({ x: aim.x, y: aim.y, t: 0, delay: d, r: 62 + lvl * 10, dmg: (60 + lvl * 35) * ap });
        break;
      }
    }
    return true;
  }

  // ---------- ÇİZİM ----------
  // Zemin katmanı (karanlıktan önce, varlıkların altında): etki alanı sınırları ve zemin dokusu.
  // Parlayan kısımlar drawGlow'da (karanlığın üstünde) çizilir. Hepsi önbellekli sprite + fillRect; kare başı canvas yok.
  dashRing(ctx, cx, cy, r, col, col2, spin = 0, w = 1) {
    // kesik çizgili halka: 6 dolu + 2 boş piksel; spin ile yavaşça döner
    const n = Math.max(16, Math.min(420, (r * 2.4) | 0));
    for (let i = 0; i < n; i++) {
      const q = (i + spin) % 8;
      if (q >= 6) continue;
      const a = i / n * TAU;
      ctx.fillStyle = q === 0 && col2 ? col2 : col;
      ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), w, w);
    }
  }

  draw(ctx, cam) {
    const ox = -cam.x | 0, oy = -cam.y | 0;
    const T = this.game.fx.time, spin = (T * 8) | 0;
    for (const c of this.clouds) {
      const a = Math.min(1, c.life / 0.8), tn = c.frost ? 'frost' : 'ash';
      const cx = Math.round(c.x + ox), cy = Math.round(c.y + oy);
      const d = discSprite(c.r, tn, 0);
      ctx.globalAlpha = a * 0.8;
      ctx.drawImage(d, cx - (d.width >> 1), cy - (d.height >> 1));
      // içeride dönen bulut öbekleri
      const puff = discSprite(c.frost ? 8 : 12, tn, 0.5);
      ctx.globalAlpha = a * (c.frost ? 0.5 : 0.75);
      for (let i = 0; i < 9; i++) {
        const ang = i / 9 * TAU + T * (i % 2 ? 0.5 : -0.35), rr = c.r * (i % 3 === 0 ? 0.25 : i % 3 === 1 ? 0.55 : 0.78);
        ctx.drawImage(puff, Math.round(cx + Math.cos(ang) * rr) - (puff.width >> 1), Math.round(cy + Math.sin(ang) * rr) - (puff.height >> 1));
      }
    }
    for (const z of this.zones) {
      const a = Math.min(1, z.life / 0.6);
      const cx = Math.round(z.x + ox), cy = Math.round(z.y + oy);
      ctx.globalAlpha = a;
      if (z.kind === 'snare') {
        // dikenli tuzak dişleri
        for (let i = 0; i < 10; i++) {
          const ang = i / 10 * TAU + 0.3, rr = z.r * (i % 2 ? 0.8 : 0.36);
          const px = Math.round(cx + Math.cos(ang) * rr), py = Math.round(cy + Math.sin(ang) * rr);
          ctx.fillStyle = PAL.G3; ctx.fillRect(px - 2, py, 5, 1);
          ctx.fillStyle = PAL.G5; ctx.fillRect(px - 1, py - 1, 1, 1); ctx.fillRect(px + 1, py - 1, 1, 1); ctx.fillRect(px, py - 2, 1, 1);
        }
      } else {
        const ember = z.kind === 'ember';
        const d = discSprite(z.r, ember ? 'fire' : 'ash', 0);
        ctx.globalAlpha = a * (ember ? 0.5 : 0.6);
        ctx.drawImage(d, cx - (d.width >> 1), cy - (d.height >> 1));
      }
    }
    for (const m of this.strikes) {
      const k = clamp(m.t / m.delay, 0, 1);
      const cx = Math.round(m.x + ox), cy = Math.round(m.y + oy);
      ctx.globalAlpha = 1;
      // tehlike alanı: seyrek kor dokusu + büyüyen gölge
      const ar = discSprite(m.r, 'fire', 0);
      ctx.globalAlpha = 0.35 + 0.35 * k;
      ctx.drawImage(ar, cx - (ar.width >> 1), cy - (ar.height >> 1));
      const sh = discSprite(Math.max(4, m.r * 0.45 * k), 'ash', 0.5);
      ctx.globalAlpha = 0.5;
      ctx.drawImage(sh, cx - (sh.width >> 1), cy - (sh.height >> 1));
    }
    ctx.globalAlpha = 1;
  }

  // karanlığın üstünde parlayan kısımlar
  drawGlow(ctx, cam) {
    const g = this.game, p = g.player;
    const ox = -cam.x | 0, oy = -cam.y | 0;
    const T = g.fx.time, fr = (T * 12) | 0, spin = (T * 8) | 0;
    // etki alanı sınırları: karanlıkta da net görünsün diye ışık katmanının üstünde
    for (const c of this.clouds) {
      ctx.globalAlpha = Math.min(1, c.life / 0.8);
      this.dashRing(ctx, Math.round(c.x + ox), Math.round(c.y + oy), c.r, c.frost ? PAL.F : PAL.A2, PAL.A3, spin, 2);
    }
    for (const z of this.zones) {
      const cx = Math.round(z.x + ox), cy = Math.round(z.y + oy);
      ctx.globalAlpha = Math.min(1, z.life / 0.6);
      if (z.kind === 'snare') { this.dashRing(ctx, cx, cy, z.r, PAL.G5, PAL.A3, spin, 2); this.dashRing(ctx, cx, cy, z.r * 0.55, PAL.G4, null, -spin); }
      else this.dashRing(ctx, cx, cy, z.r, z.kind === 'ember' ? PAL.E3 : PAL.A3, z.kind === 'ember' ? PAL.E5 : PAL.S, spin, 2);
    }
    for (const m of this.strikes) {
      // meteor hedef işareti: tam yarıçap sınırı + daralan iç halka + artı
      const k = clamp(m.t / m.delay, 0, 1), cx = Math.round(m.x + ox), cy = Math.round(m.y + oy);
      ctx.globalAlpha = 1;
      this.dashRing(ctx, cx, cy, m.r, PAL.E2, PAL.E4, spin, 2);
      this.dashRing(ctx, cx, cy, Math.max(3, m.r * (1 - k)), PAL.E4, PAL.E6, -spin);
      ctx.fillStyle = PAL.E5;
      ctx.fillRect(cx - 6, cy, 4, 1); ctx.fillRect(cx + 3, cy, 4, 1); ctx.fillRect(cx, cy - 6, 1, 4); ctx.fillRect(cx, cy + 3, 1, 4);
    }
    ctx.globalAlpha = 1;
    // genişleyen halkalar: ateş → alev dilleri, ayaz → buz kristalleri
    for (const r of this.rings) {
      const a = r.life / r.max;
      const cx = r.x + ox, cy = r.y + oy;
      const n = Math.max(14, Math.min(96, (r.r * 0.42) | 0));
      ctx.globalAlpha = Math.min(1, a * 1.6);
      ctx.fillStyle = r.frost ? PAL.A3 : PAL.E6;
      const m = Math.max(20, Math.min(200, (r.r * 1.3) | 0));
      for (let i = 0; i < m; i++) { const an = i / m * TAU; ctx.fillRect(Math.round(cx + Math.cos(an) * (r.r - 3)), Math.round(cy + Math.sin(an) * (r.r - 3)), 1, 1); }
      ctx.fillStyle = r.frost ? PAL.F : PAL.E3;
      for (let i = 0; i < m; i += 2) { const an = i / m * TAU; ctx.fillRect(Math.round(cx + Math.cos(an) * (r.r - 6)), Math.round(cy + Math.sin(an) * (r.r - 6)), 1, 1); }
      for (let i = 0; i < n; i++) {
        const an = i / n * TAU + (r.frost ? 0 : T * 0.6);
        const px = Math.round(cx + Math.cos(an) * r.r), py = Math.round(cy + Math.sin(an) * r.r);
        if (r.frost) ctx.drawImage(crystalSprite(i), px - 3, py - 5);
        else ctx.drawImage(tongueSprite(i + fr, 'fire'), px - 2, py - 5);
      }
    }
    // yağmurlar: gökten düşen oklar / korlar
    for (const z of this.zones) {
      if (z.kind === 'snare') continue;
      const a = Math.min(1, z.life / 0.6), ember = z.kind === 'ember';
      const cx = z.x + ox, cy = z.y + oy, n = ember ? 12 : 8;
      ctx.globalAlpha = a;
      for (let i = 0; i < n; i++) {
        const ph = (T * (ember ? 1.7 : 2.4) + i * 0.377) % 1;
        const cyc = Math.floor(T * (ember ? 1.7 : 2.4) + i * 0.377);
        const an = (i * 2.4 + cyc * 1.7) % TAU, rr = z.r * (0.12 + 0.8 * (((i * 37 + cyc * 13) % 10) / 10));
        const lx = cx + Math.cos(an) * rr, ly = cy + Math.sin(an) * rr;
        const h = (1 - ph) * 56;
        const px = Math.round(lx + h * 0.32), py = Math.round(ly - h);
        if (ph > 0.86) {                                // yere değdi: küçük çarpma
          ctx.fillStyle = ember ? PAL.E6 : PAL.A3;
          ctx.fillRect(Math.round(lx) - 2, Math.round(ly), 5, 1); ctx.fillRect(Math.round(lx), Math.round(ly) - 2, 1, 4);
          if (ember) ctx.drawImage(tongueSprite(i + fr, 'fire'), Math.round(lx) - 2, Math.round(ly) - 6);
          else ctx.drawImage(arrowSprite(1.9, 'arrow'), Math.round(lx) - 12, Math.round(ly) - 13);
        } else if (ember) {
          ctx.fillStyle = PAL.E1; ctx.fillRect(px + 2, py - 6, 1, 3);
          ctx.fillStyle = PAL.E3; ctx.fillRect(px + 1, py - 3, 1, 3);
          ctx.fillStyle = PAL.E5; ctx.fillRect(px, py, 2, 2);
          ctx.fillStyle = PAL.E6; ctx.fillRect(px, py + 1, 1, 1);
        } else ctx.drawImage(arrowSprite(1.9, 'arrow'), px - 12, py - 12);
      }
    }
    // meteor: sağ üstten süzülür, arkasında alev izi
    for (const m of this.strikes) {
      const k = clamp(m.t / m.delay, 0, 1), e = k * k;
      const px = Math.round(m.x + ox + (1 - e) * 80), py = Math.round(m.y + oy - (1 - e) * 190);
      ctx.globalAlpha = 1;
      const cols = [PAL.E5, PAL.E4, PAL.E3, PAL.E2, PAL.E1, PAL.E0];
      for (let i = 5; i >= 0; i--) {
        const s = 9 - i, q = (i + 1) * 5;
        ctx.fillStyle = cols[i];
        ctx.fillRect(px + Math.round(q * 0.39) - (s >> 1) + ((fr + i) % 2), py - q - (s >> 1), s, s);
      }
      ctx.drawImage(meteorSprite(), px - 6, py - 6);
    }
    // kalkanlar: kül peçesi / buz kalkanı oyuncuyu sarar
    if (this.veilT > 0) {
      const frost = this.shieldPow > 0.5;
      const cx = Math.round(p.x + ox), cy = Math.round(p.y + oy) - 9;
      ctx.globalAlpha = Math.min(1, this.veilT * 2);
      if (frost) {
        for (let i = 0; i < 6; i++) {
          const an = i / 6 * TAU + T * 1.6;
          ctx.drawImage(crystalSprite(i % 2), Math.round(cx + Math.cos(an) * 13) - 3, Math.round(cy + Math.sin(an) * 9) - 4);
        }
        this.dashRing(ctx, cx, cy, 15, PAL.F, PAL.A3, spinOf(T));
      } else {
        for (let i = 0; i < 10; i++) {
          const an = i / 10 * TAU - T * 2.2, rr = 11 + (i % 3) * 2;
          ctx.fillStyle = i % 2 ? PAL.A2 : PAL.A1;
          ctx.fillRect(Math.round(cx + Math.cos(an) * rr), Math.round(cy + Math.sin(an) * rr * 0.75), 2, 2);
        }
        this.dashRing(ctx, cx, cy, 15, PAL.A1, PAL.A3, spinOf(T));
      }
    }
    // ocak öfkesi: oyuncunun çevresinde dönen alevler
    if (this.wrathT > 0) {
      const cx = Math.round(p.x + ox), cy = Math.round(p.y + oy) - 6;
      ctx.globalAlpha = Math.min(1, this.wrathT);
      for (let i = 0; i < 6; i++) {
        const an = i / 6 * TAU + T * 3;
        ctx.drawImage(tongueSprite(i + fr, 'fire'), Math.round(cx + Math.cos(an) * 14) - 2, Math.round(cy + Math.sin(an) * 9) - 4);
      }
    }
    ctx.globalAlpha = 1;
  }

  // karanlık katmanında açılacak ışık delikleri: [{ x, y, r, a }] (dünya koordinatı)
  lights() {
    // ayırmasız: dönen dizi ve içindeki nesneler her karede yeniden kullanılır (çağıran saklamamalı)
    const out = this._lights || (this._lights = []);
    this._lightN = 0;
    const p = this.game.player;
    for (const r of this.rings) this._light(r.x, r.y, r.r + 30, 0.5 * (r.life / r.max));
    for (const z of this.zones) if (z.kind === 'ember') this._light(z.x, z.y, z.r + 18, 0.45 * Math.min(1, z.life / 0.6));
    for (const m of this.strikes) { const k = clamp(m.t / m.delay, 0, 1); this._light(m.x, m.y, 24 + m.r * 0.7 * k, 0.25 + 0.5 * k); }
    for (const c of this.clouds) if (c.frost) this._light(c.x, c.y, c.r + 10, 0.22 * Math.min(1, c.life / 0.8));
    if (this.wrathT > 0) this._light(p.x, p.y - 6, 46, 0.5 * Math.min(1, this.wrathT));
    if (this.veilT > 0 && this.shieldPow > 0.5) this._light(p.x, p.y - 8, 30, 0.3);
    if (out.length !== this._lightN) out.length = this._lightN;
    return out;
  }
  // ışık tamponuna yaz: havuzdaki nesne yeniden doldurulur, yalnızca havuz büyürken yeni nesne ayrılır
  _light(x, y, r, a) {
    const pool = this._lightPool || (this._lightPool = []);
    const i = this._lightN++;
    const l = pool[i] || (pool[i] = { x: 0, y: 0, r: 0, a: 0 });
    l.x = x; l.y = y; l.r = r; l.a = a;
    this._lights[i] = l;
  }
}
const spinOf = T => (T * 10) | 0;
