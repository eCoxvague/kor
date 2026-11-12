// KOR — ateş sunağı: yakıt, ışık, sıcaklık, yakma alanı
import { clamp, dist, rand, lerp } from '../core/util.js';
import { vrnd } from '../systems/fx.js';
import { flameFrame, hearthSprite, hearthLogs, FLAME_SIZES } from '../art/sprites.js';

export const DEAD_GRACE = 12; // sn: ateş sönünce bu süre içinde yeniden yakılabilir

export class Fire {
  constructor(game) {
    const a = game.world.altar;
    this.x = a.x; this.y = a.y;
    this.fuel = 26;          // yakıt (odun birimi)
    this.maxFuel = 200;
    this.level = 1;          // ateş seviyesi (yükseltme ile artar)
    this.flare = 0;          // yetenek parlaması
    this.t = 0;
    this.frame = 0;
    this.animT = 0;
    this.embers = [];
    this.depositQueue = [];
    this.deadT = 0;          // ateşin sönük kaldığı süre
    this.burst = 0;          // görsel: odun atınca alev patlaması (0..1)
    this.flick = 1;          // görsel: ışık titremesi çarpanı
  }
  reset(game) { this.fuel = 26; this.level = 1; this.flare = 0; this.deadT = 0; this.embers.length = 0; this.depositQueue.length = 0; this.burst = 0; }

  get warmRadius() { return 62 + this.level * 12 + Math.min(this.fuel, 60) * 0.5; }
  get lightRadius() { return 90 + this.level * 14 + Math.min(this.fuel, 80) * 0.9 + this.flare * 90; }
  get area() { return null; }

  update(dt, game) {
    this.t += dt;
    // yakıt tüketimi (sadece oyuncu ateşten uzaktayken de yanar)
    const drain = 0.30 * game.stats.fuelRate * (0.6 + game.night * 0.55);
    this.fuel = Math.max(0, this.fuel - drain * dt);
    this.flare = Math.max(0, this.flare - dt * 0.8);
    // ateş uzun süre sönük kalırsa oyun biter
    if (this.fuel <= 0) {
      this.deadT += dt;
      if (this.deadT > DEAD_GRACE) game.onPlayerDeath('ATEŞ SÖNDÜ, KARANLIK GELDİ');
    } else this.deadT = 0;

    this.animate(dt, game);

    // düşman yakma alanı: ateşin çevresindeki küçük alan
    if (this.fuel > 0) {
      const R = 34 + this.level * 4 + this.flare * 30;
      for (const e of game.enemies) {
        if (e.dead) continue;
        if (dist(e.x, e.y, this.x, this.y) < R) {
          e.hurt((6 + this.level * 3) * dt, game.player);
          e.flameT = Math.min(1.2, (e.flameT || 0) + dt * 2);
        }
      }
    }
  }

  // yalnızca görsel: alev karesi, titreme, kor ve duman (başlık ekranında da çalışır)
  animate(dt, game) {
    this.animT += dt;
    const spd = 0.085 - Math.min(0.03, this.burst * 0.03);
    if (this.animT > spd) { this.animT = 0; this.frame = (this.frame + 1) % 8; }
    this.burst = Math.max(0, this.burst - dt * 1.6);
    const tt = this.t;
    this.flick = 1 + Math.sin(tt * 13.1) * 0.025 + Math.sin(tt * 7.3 + 1) * 0.03 + Math.sin(tt * 23.7) * 0.015;
    if (this.fuel > 0) {
      const s = this.scale();
      if (vrnd() < dt * (8 + this.flare * 30 + this.burst * 40) * (0.4 + this.fuel / this.maxFuel)) {
        game.fx.embers(this.x + (vrnd() * 16 - 8) * s, this.y - 10 * s, 1, 6);
      }
      if (vrnd() < dt * 3.2) game.fx.smoke(this.x + (vrnd() * 8 - 4), this.y - 26 * s, 1);
    } else if (vrnd() < dt * 4) game.fx.smoke(this.x + (vrnd() * 10 - 5), this.y - 6, 1);
  }

  scale() { return 0.55 + Math.min(1, this.fuel / 90) * 0.55 + this.level * 0.08 + this.flare * 0.35; }
  intensity() { return clamp(this.fuel / 60, 0, 1) * (1 + this.flare); }

  addFuel(amount, game) {
    const before = this.fuel;
    this.fuel = Math.min(this.maxFuel, this.fuel + amount);
    const gained = this.fuel - before;
    this.flare = Math.min(1.6, this.flare + 0.35 + amount * 0.01);
    this.burst = 1;
    game.fx.ring(this.x, this.y, 34 + gained, '#ffb447', 0.45, 2);
    game.fx.ring(this.x, this.y - 4, 18 + gained * 0.5, '#fff6d6', 0.25, 1);
    game.fx.spark(this.x, this.y - 8, 12 + (gained | 0), 140);
    game.fx.embers(this.x, this.y - 14, 10 + Math.min(20, gained | 0), 10);
    game.fx.text(this.x, this.y - 40, '+' + (gained | 0), '#ffe08a', 10);
    game.fx.shake(2, 0.12);
    game.sfx.feed();
    return gained;
  }

  // alev boyut sınıfı (önceden üretilmiş karelerden)
  sizeIndex() {
    const s = this.scale() + this.burst * 0.45;
    return clamp(Math.round((s - 0.6) / 0.27), 0, FLAME_SIZES.length - 1);
  }

  draw(ctx, cam) {
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
    ctx.drawImage(hearthSprite(), x - 28, y - 12);
    if (this.fuel > 0) {
      const si = this.sizeIndex();
      ctx.drawImage(hearthLogs(false), x - 17, y - 11);
      const f = flameFrame(si, this.frame);
      const w = f.width, h = f.height;
      ctx.drawImage(f, x - (w >> 1), y - h + 1);
      // iç çekirdek: bir boy küçük, kayık kare (katmanlı canlılık)
      if (si > 0) {
        const g = flameFrame(si - 1, this.frame + 3);
        ctx.globalAlpha = 0.85;
        ctx.drawImage(g, x - (g.width >> 1), y - g.height + 1);
        ctx.globalAlpha = 1;
      }
    } else {
      ctx.drawImage(hearthLogs(true), x - 17, y - 11);
      if (Math.sin(this.t * 3) > 0.3) { ctx.fillStyle = '#9a240f'; ctx.fillRect(x - 1, y - 5, 2, 1); }
    }
  }
}
