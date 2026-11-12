// KOR — düşmanlar: közgezer, gölge, kül kurdu, kolos
import { clamp, dist, rand } from '../core/util.js';
import { enemySprite, enemyEyes, ENEMY_META } from '../art/sprites.js';

const KINDS = {
  cinder:  { hp: 24, dmg: 6, spd: 52, r: 9,  xp: 6,  wood: 0, name: 'Kozgezer' },
  shade:   { hp: 34, dmg: 9, spd: 44, r: 9,  xp: 8,  wood: 0, name: 'Gölge' },
  wolf:    { hp: 95, dmg: 15, spd: 72, r: 10, xp: 16, wood: 0, name: 'Kül Kurdu' },
  kolos:   { hp: 620, dmg: 40, spd: 30, r: 13, xp: 80, wood: 2, name: 'Kolos' },
};

export class Enemy {
  constructor(game, kind, x, y, tier = 1) {
    this.game = game;
    this.kind = kind;
    const def = KINDS[kind];
    const s = game.stats;
    this.hp = def.hp * tier * (1 + game.night * 0.18);
    this.maxHp = this.hp;
    this.dmg = def.dmg * (1 + game.night * 0.12);
    this.spd = def.spd * (1 + game.night * 0.04);
    this.r = def.r;
    this.xp = def.xp * tier;
    this.wood = def.wood * tier;
    this.name = def.name;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.dead = false;
    this.hurtT = 0; this.flashT = 0;
    this.flameT = 0;
    this.slowT = 0; this.freezeT = 0;
    this.atkCd = 0;
    this.frame = 0; this.animT = 0;
    this.burnDps = 0;
    this.kx = 0; this.ky = 0;   // görsel: geri tepme ofseti
    this.flip = false;          // görsel: sola bakış
  }

  update(dt) {
    const g = this.game;
    const px = g.player.x, py = g.player.y;
    const d = dist(this.x, this.y, px, py);
    const facing = g.player.facing;

    // oyuncuya doğru hareket (daha yakın olduğunda yavaşlar)
    if (this.slowT > 0) this.slowT = Math.max(0, this.slowT - dt);
    const frozen = this.freezeT > 0;                 // donmuş: ne yürür ne vurur
    if (frozen) this.freezeT = Math.max(0, this.freezeT - dt);
    const slowMul = frozen ? 0 : this.slowT > 0 ? 0.45 : 1;
    let tx = px, ty = py;
    const hold = this.r + g.player.r - 2;   // oyuncunun üstüne binmesin
    if (d < hold) { tx = this.x; ty = this.y; }
    const nx = (tx - this.x) / d || 0, ny = (ty - this.y) / d || 0;
    this.vx += (nx * this.spd * slowMul - this.vx) * Math.min(1, dt * 10);
    this.vy += (ny * this.spd * slowMul - this.vy) * Math.min(1, dt * 10);
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.x = clamp(this.x, 8, g.world.w - 8); this.y = clamp(this.y, 8, g.world.h - 8);

    // ateş alanında burning
    if (g.fire.area) {
      const dd = dist(this.x, this.y, g.fire.area.x, g.fire.area.y);
      if (dd < g.fire.area.r) {
        this.flameT = Math.min(this.flameT + dt, 1.2);
        this.hurt(g.stats.burnDps * dt, g.player);
      }
    }

    // yakma dot
    if (this.burnDps > 0) {
      this.hurt(this.burnDps * dt, g.player);
      this.flameT = Math.min(this.flameT + dt * 2, 1.2);
    }
    this.flameT = Math.max(0, this.flameT - dt * 0.9);

    // saldırı: oyuncuya temas
    if (this.atkCd > 0) this.atkCd -= dt;
    if (!frozen && d < this.r + g.player.r + 4 && this.atkCd <= 0) {
      g.player.hurt(this.dmg, this);
      this.atkCd = 1.0;
      g.fx.shake(2.5, 0.14);
    }

    this.hurtT = Math.max(0, this.hurtT - dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this.animT += dt;
    if (this.animT > (this.kind === 'wolf' ? 0.09 : this.kind === 'kolos' ? 0.2 : 0.13)) { this.animT = 0; this.frame = (this.frame + 1) % 4; }
    this.kx *= Math.max(0, 1 - dt * 14); this.ky *= Math.max(0, 1 - dt * 14);
    if (this.vx > 6) this.flip = false; else if (this.vx < -6) this.flip = true;
  }

  hurt(amount, src) {
    this.hp -= amount;
    this.hurtT = 0.14;
    if (amount >= 1) this.flashT = 0.08;   // görsel: yanma gibi sürekli küçük hasar flaş yapmaz
    if (src) {
      const g = this.game;
      if (amount >= 1) {                       // görsel geri tepme (konumu değiştirmez)
        const ka = Math.atan2(this.y - src.y, this.x - src.x);
        const kick = this.kind === 'kolos' ? 1.5 : 4;
        this.kx = Math.cos(ka) * kick; this.ky = Math.sin(ka) * kick;
      }
      if (Math.random() < g.stats.burnChance) this.burnDps = Math.max(this.burnDps, g.stats.burnDps || 0);
      if (Math.random() < 0.7) {
        const ang = Math.atan2(this.y - src.y, this.x - src.x);
        for (let i = 0; i < 5; i++) {
          g.fx.spark(this.x + Math.cos(ang) * 4, this.y + Math.sin(ang) * 4 - 2, 1, 90, '#e04a0f');
        }
      }
    }
    if (this.hp <= 0 && !this.dead) {
      this.die(src);
    }
  }

  die(src) {
    this.dead = true;
    const g = this.game;
    g.enemyKilled(this);
    g.fx.spark(this.x, this.y - 2, 10, 110);
    g.fx.corpse(this.kind, this.x + this.kx, this.y + this.ky, this.kind === 'wolf' && this.flip);
    g.fx.ash(this.x, this.y - 6, this.kind === 'kolos' ? 30 : 12, this.kind === 'kolos' ? 14 : 6);
    g.fx.text(this.x, this.y - 16, '+' + this.xp, '#ffb347', 7);
    g.fx.shake(2.5, 0.12);
    if (this.kind === 'kolos') g.fx.shards(this.x, this.y - 2, 16);
    g.sfx.enemyDie();
  }

  draw(ctx, cam) {
    const M = ENEMY_META[this.kind];
    const x = Math.round(this.x + this.kx - cam.x), y = Math.round(this.y + this.ky - cam.y);
    const flash = this.flashT > 0;
    const mirror = this.kind === 'wolf' ? this.flip : false;
    const spr = enemySprite(this.kind, this.frame, flash, mirror);
    const px = x - M.fx, py = y + 4 - M.fy;
    ctx.drawImage(spr, px, py);
    // yanma: üstünde titrek alev pikselleri
    if (this.flameT > 0.05) {
      const n = Math.min(6, 2 + (this.flameT * 4) | 0);
      for (let i = 0; i < n; i++) {
        const fx = px + 3 + ((i * 7 + this.frame * 3) % Math.max(4, M.w - 6));
        const fy = py + 2 + ((i * 5 + this.frame * 2) % 6);
        ctx.fillStyle = i % 2 ? '#ffb447' : '#ff7a26';
        ctx.fillRect(fx, fy, 1, 2);
      }
    }
    // can çubuğu (pikselli)
    if (this.hp < this.maxHp) {
      const wdt = this.kind === 'kolos' ? 28 : 14;
      const bx = x - (wdt >> 1), by = py - 4;
      ctx.fillStyle = '#07080f'; ctx.fillRect(bx - 1, by - 1, wdt + 2, 4);
      ctx.fillStyle = '#5c120b'; ctx.fillRect(bx, by, wdt, 2);
      ctx.fillStyle = '#ff7a26'; ctx.fillRect(bx, by, Math.max(0, Math.round(wdt * this.hp / this.maxHp)), 2);
      ctx.fillStyle = '#ffe08a'; ctx.fillRect(bx, by, Math.max(0, Math.round(wdt * this.hp / this.maxHp)), 1);
    }
  }

  // karanlığın üstünde: parlayan gözler
  drawEyes(ctx, cam) {
    const M = ENEMY_META[this.kind];
    const x = Math.round(this.x + this.kx - cam.x), y = Math.round(this.y + this.ky - cam.y);
    const mirror = this.kind === 'wolf' ? this.flip : false;
    const px = x - M.fx, py = y + 4 - M.fy;
    const col = this.kind === 'shade' ? '#e9e0cc' : '#ffe08a';
    const halo = this.kind === 'shade' ? '#b9a6ff' : '#ff7a26';
    const eyes = enemyEyes(this.kind, this.frame);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = halo;
    for (const [ex, ey] of eyes) ctx.fillRect(px + (mirror ? M.w - 1 - ex : ex) - 1, py + ey - 1, 3, 3);
    ctx.globalAlpha = 1;
    ctx.fillStyle = col;
    for (const [ex, ey] of eyes) ctx.fillRect(px + (mirror ? M.w - 1 - ex : ex), py + ey, 1, 1);
  }
}
