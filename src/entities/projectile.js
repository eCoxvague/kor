// KOR — fırlatma nesneleri: kor dalgası, ok, kor küresi, delici ok
// kind: 'wave' (varsayılan, yalnız yaratık) | 'arrow' | 'orb' | 'lance'
// o: { kind, z, treeMul, pierce, blast, primary, crit }
//   treeMul > 0  → ağaçlara da çarpar, ağaca dmg*treeMul vurur
//   pierce       → çarptıktan sonra geçebileceği ek hedef sayısı
//   blast        → { r, dmg, treeMul, ... } çarpınca ya da ömrü bitince Game.explode ile patlar
//   primary      → birincil saldırı: vuruş kombo sayar, ağaçtan odun cezası yok
import { dist } from '../core/util.js';
import { arrowSprite, orbSprite, crescentSprite } from '../art/fxart.js';

export class Projectile {
  constructor(game, x, y, ang, speed, life, dmg, color, r = 4, bounce = 0, o = {}) {
    this.game = game;
    this.x = x; this.y = y;
    this.ang = ang;
    this.vx = Math.cos(ang) * speed;
    this.vy = Math.sin(ang) * speed;
    this.life = life; this.maxLife = life;
    this.dmg = dmg;
    this.color = color;
    this.r = r;
    this.bounce = bounce;
    this.dead = false;
    this.hit = new Set();
    this.kind = o.kind || 'wave';
    this.z = o.z || 0;
    this.treeMul = o.treeMul || 0;
    this.pierce = o.pierce || 0;
    this.blast = o.blast || null;
    this.primary = !!o.primary;
    this.crit = !!o.crit;
  }

  update(dt) {
    if (this.dead) return;
    const g = this.game;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.life -= dt;
    const W = g.world;
    if (this.x < 4 || this.x > W.w - 4 || this.y < 4 || this.y > W.h - 4) { this.dead = true; return; }
    // çarpışma: yaratıklar
    for (const e of g.enemies) {
      if (e.dead || this.hit.has(e)) continue;
      if (dist(this.x, this.y, e.x, e.y) < this.r + e.r) {
        this.hit.add(e);
        if (this.blast) { this.detonate(); return; }
        e.hurt(this.dmg, g.player);
        g.fx.spark(e.x, e.y - 2, 4, 80, this.kind === 'arrow' ? '#e9e0cc' : '#ff6a1a');
        if (this.primary) g.player.registerHit();
        if (this.afterHit()) return;
      }
    }
    // çarpışma: ağaçlar (ilk çarptığına hasar verir)
    if (this.treeMul > 0) {
      for (const t of W.trees) {
        if (t.dead || this.hit.has(t)) continue;
        if (dist(this.x, this.y, t.x, t.y) < t.radius * 0.7 + this.r) {
          this.hit.add(t);
          if (this.blast) { this.detonate(); return; }
          const done = g.hitTree(t, this.dmg * this.treeMul, this.crit, !this.primary, this.ang);
          if (done && this.primary) g.player.registerHit();
          // ok gövdeye saplanır ve kısa süre orada kalır (yalnızca görsel)
          if (done && !t.dead && this.kind === 'arrow') { g.fx.stick(t, this.ang, this.color === '#ff8a2a' ? 'fire' : 'arrow'); g.sfx.stick(); }
          if (this.afterHit()) return;
        }
      }
    }
    if (this.life <= 0) {
      if (this.blast) this.detonate(); else this.dead = true;
    }
  }

  // hedefe değdikten sonra: delme / sekme / ölüm. true = mermi bitti
  afterHit() {
    if (this.pierce > 0) { this.pierce--; return false; }
    if (this.bounce > 0) { this.bounce--; this.vx *= -1; this.vy *= -1; return false; }
    this.dead = true;
    return true;
  }

  detonate() {
    if (this.dead) return;
    this.dead = true;
    this.game.explode(this.x, this.y, { ...this.blast, primary: this.primary });
  }

  draw(ctx, cam) {
    if (this.dead) return;
    const t = this.life / this.maxLife;
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y - this.z);
    const sp = Math.hypot(this.vx, this.vy) || 1, dx = this.vx / sp, dy = this.vy / sp;
    const fr = (this.life * 24) | 0;
    if (this.kind === 'arrow' || this.kind === 'lance') {
      const lance = this.kind === 'lance', fire = this.color === '#ff8a2a';
      // iz: arkada sönen çizgi
      const n = lance ? 14 : 6;
      for (let i = 2; i < n; i++) {
        ctx.globalAlpha = (1 - i / n) * (lance ? 0.9 : 0.5);
        ctx.fillStyle = lance ? (i < 6 ? '#ffe08a' : '#ffb447') : fire ? '#ff7a26' : '#e9e0cc';
        ctx.fillRect(Math.round(x - dx * (i * 2 + 6)), Math.round(y - dy * (i * 2 + 6)), lance && i < 7 ? 2 : 1, lance && i < 7 ? 2 : 1);
      }
      ctx.globalAlpha = 1;
      ctx.drawImage(arrowSprite(this.ang, lance ? 'lance' : fire ? 'fire' : 'arrow'), x - 12, y - 12);
      if (fire && fr % 2) { ctx.fillStyle = '#ffe08a'; ctx.fillRect(x - Math.round(dx * 2), y - Math.round(dy * 2) - 1, 1, 1); }
      return;
    }
    if (this.kind === 'orb') {
      const cold = false;                                   // küre hep kor rengi; ayaz etkisi patlamada görünür
      const cols = cold ? ['#8fd3ff', '#4a5578', '#2b3352'] : ['#ff7a26', '#d8461a', '#9a240f'];
      for (let i = 4; i >= 1; i--) {
        const s = 6 - i, wob = ((fr + i) % 2) ? 1 : -1;
        ctx.fillStyle = cols[Math.min(2, i - 1)];
        ctx.fillRect(Math.round(x - dx * i * 4 - dy * wob) - (s >> 1), Math.round(y - dy * i * 4 + dx * wob) - (s >> 1), s, s);
      }
      ctx.drawImage(orbSprite(fr, cold ? 'frost' : 'fire'), x - 5, y - 5);
      return;
    }
    // kor dalgası: alev hilali + arkasında iki sönük kopya
    ctx.globalAlpha = Math.min(1, t * 1.6) * 0.35;
    ctx.drawImage(crescentSprite(this.ang), Math.round(x - dx * 9) - 10, Math.round(y - dy * 9) - 10);
    ctx.globalAlpha = Math.min(1, t * 1.6) * 0.6;
    ctx.drawImage(crescentSprite(this.ang), Math.round(x - dx * 5) - 10, Math.round(y - dy * 5) - 10);
    ctx.globalAlpha = Math.min(1, t * 1.6);
    ctx.drawImage(crescentSprite(this.ang), x - 10, y - 10);
    ctx.globalAlpha = 1;
  }
}
