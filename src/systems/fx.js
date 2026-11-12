// KOR — parçacık, uçan yazı, ekran sarsıntısı, hit-stop, devrilen ağaç, küle dağılan yaratık
import { easeOut, easeIn } from '../core/util.js';

// görsel rastgelelik ayrı üreteçten: efektler oyun mantığının Math.random dizisini etkilemez
let vs = 0x9e3779b9;
export function vrnd() { vs ^= vs << 13; vs >>>= 0; vs ^= vs >> 17; vs ^= vs << 5; vs >>>= 0; return vs / 4294967296; }
const rand = (a = 1, b = 0) => b + vrnd() * (a - b);
import { logPiece, sparkSprite, chipSprite, emberParticle, shardSprite, leafSprite, smokePuff, ashMote, enemyDeath, ENEMY_META } from '../art/sprites.js';
import { drawText } from '../art/font.js';
import { PAL } from '../art/palette.js';
import { impactSprite, arrowSprite, discSprite, dustPuff, tone } from '../art/fxart.js';

const MAX_PARTS = 700;

// vuruş donması (hit-stop) süreleri, sn. Tek kaynak burası: kodun başka yerinde çıplak sayı olmaz.
// Donmalar birikmez: Fx.stop() süreyi toplamaz, en uzununu tutar (Math.max).
export const HIT_STOP = Object.freeze({
  hit: 0.04,        // ağaca / yaratığa normal vuruş
  crit: 0.07,       // kritik vuruş
  fell: 0.09,       // ağaç devrilme
  deny: 0.02,       // kilitli ağaçtan sekme (ret)
  blast: 0.025,     // küçük patlama
  blastBig: 0.07,   // büyük patlama
  wrath: 0.11,      // Ocak Öfkesi (nihai yetenek)
});

export class Fx {
  constructor() {
    this.parts = []; this.texts = []; this.rings = []; this.slashes = [];
    this.falls = []; this.corpses = [];
    this.hits = []; this.blasts = []; this.stuck = [];
    this.shakeT = 0; this.shakeMag = 0; this.hitStop = 0; this.flash = 0; this.flashCol = '#fff';
    this.time = 0;
    this.onLand = null;
  }
  reset() {
    this.parts.length = 0; this.texts.length = 0; this.rings.length = 0; this.slashes.length = 0;
    this.falls.length = 0; this.corpses.length = 0;
    this.hits.length = 0; this.blasts.length = 0; this.stuck.length = 0;
    this.shakeT = 0; this.shakeMag = 0; this.hitStop = 0; this.flash = 0;
  }
  _push(p) { if (this.parts.length < MAX_PARTS) this.parts.push(p); }

  spark(x, y, n = 8, spd = 90, col) {
    for (let i = 0; i < n; i++) {
      const a = rand(Math.PI * 2);
      const s = rand(spd, spd * .35);
      this._push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life: rand(.45, .2), max: .45, g: 180, kind: 'spark', v: (vrnd() * 4) | 0, col });
    }
  }
  // chips(x,y,n,type): talaş, ağaç türünün renginde
  chips(x, y, n = 7, type = 'oak', dir = 0) {
    for (let i = 0; i < n; i++) {
      // dir verilirse talaş o yöne (vuruşun tersine) yelpaze gibi fışkırır
      const a = dir ? (dir > 0 ? 0 : Math.PI) + rand(0.75, -0.75) : rand(Math.PI * 2);
      const s = dir ? rand(150, 55) : rand(85, 30);
      this._push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6 - (dir ? 62 : 45), life: rand(.75, .4), max: .75, g: 300, kind: 'chip', v: (vrnd() * 3) | 0, type, floor: y + rand(10, 4) });
    }
  }
  leaves(x, y, n = 5, type = 'oak', spread = 12) {
    for (let i = 0; i < n; i++) {
      this._push({ x: x + rand(spread, -spread), y: y + rand(spread * .6, -spread * .6), vx: rand(20, -20), vy: rand(-10, -40), life: rand(1.6, .9), max: 1.6, g: 40, kind: 'leaf', v: (vrnd() * 2) | 0, type, ph: rand(6) });
    }
  }
  embers(x, y, n = 3, spread = 14) {
    for (let i = 0; i < n; i++) {
      this._push({ x: x + rand(spread, -spread), y: y + rand(spread * .4, -spread * .4), vx: rand(14, -14), vy: rand(-24, -60), life: rand(1.6, .7), max: 1.6, g: -8, kind: 'ember', v: (vrnd() * 3) | 0, ph: rand(6) });
    }
  }
  smoke(x, y, n = 2) {
    for (let i = 0; i < n; i++) {
      this._push({ x: x + rand(6, -6), y, vx: rand(8, -8), vy: rand(-14, -32), life: rand(1.8, 1), max: 1.8, g: -4, kind: 'smoke', v: 0 });
    }
  }
  dust(x, y, n = 8, spread = 16) {
    for (let i = 0; i < n; i++) {
      const a = rand(Math.PI * 2);
      this._push({ x: x + Math.cos(a) * rand(spread), y: y + Math.sin(a) * rand(spread * .4), vx: Math.cos(a) * rand(30, 8), vy: -rand(14, 2), life: rand(.9, .5), max: .9, g: 10, kind: 'dust', v: 0 });
    }
  }
  ash(x, y, n = 10, spread = 8) {
    for (let i = 0; i < n; i++) {
      this._push({ x: x + rand(spread, -spread), y: y + rand(spread, -spread), vx: rand(18, -18), vy: rand(-10, -45), life: rand(1.3, .6), max: 1.3, g: -10, kind: 'ash', v: (vrnd() * 2) | 0, ph: rand(6) });
    }
  }
  // odun atma: oyuncudan ateşe kavisle uçan kütükler (yalnızca görsel)
  toss(x0, y0, x1, y1, n = 3, type = 'oak') {
    for (let i = 0; i < n; i++) {
      const dur = 0.28 + i * 0.05;
      this._push({ kind: 'toss', x: x0, y: y0, x0: x0 + rand(4, -4), y0: y0 - 8, x1: x1 + rand(6, -6), y1: y1 - 6, t: -i * 0.05, dur, life: dur + 0.3, max: dur + 0.3, vx: 0, vy: 0, g: 0, type, v: 0 });
    }
  }
  shards(x, y, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = rand(Math.PI * 2);
      this._push({ x, y, vx: Math.cos(a) * rand(130, 40), vy: Math.sin(a) * rand(130, 40) - 30, life: rand(.6, .3), max: .6, g: 300, kind: 'shard', v: 0 });
    }
  }
  text(x, y, str, col = '#e9c46a', size = 8, vy = -26) {
    this.texts.push({ x, y, str: String(str), col, size, life: .9, max: .9, vy, vx: rand(8, -8) });
  }
  ring(x, y, r, col = '#ff8a2a', life = .35, width = 2) {
    this.rings.push({ x, y, r: 0, rmax: r, col, life, max: life, width });
  }
  slash(x, y, a, reach, arc, life = .16) {
    this.slashes.push({ x, y, a, reach, arc, life, max: life });
  }
  // devrilen ağaç: spr = sprite, ax/ay = sprite içindeki gövde dibi, dir = ±1
  fall(spr, x, y, ax, ay, dir, type, glow) {
    this.falls.push({ spr, x, y, ax, ay, dir: dir || 1, type, t: 0, dur: 0.62, fade: 0.55, landed: false, glow });
  }
  corpse(kind, x, y, mirror) {
    this.corpses.push({ kind, x, y, mirror, t: 0, dur: 0.5 });
  }
  // darbe kıvılcımı: temas noktasında 2 karelik yıldız (karanlığın üstünde çizilir)
  impact(x, y, t = 'hot', big = false) {
    if (this.hits.length < 24) this.hits.push({ x, y, tone: t, big, t: 0 });
  }
  // patlama: çekirdek diski + genişleyen pikselli alev halkası. r = gerçek etki yarıçapı
  blast(x, y, r, t = 'fire', big = false) {
    if (this.blasts.length < 24) this.blasts.push({ x, y, r, tone: t, big, t: 0, dur: big ? 0.55 : 0.34, seed: (vrnd() * 97) | 0 });
  }
  // saplanan ok: ağaç devrilene ya da süre dolana kadar gövdede kalır
  stick(tree, ang, kind = 'arrow') {
    if (this.stuck.length >= 24) this.stuck.shift();
    this.stuck.push({ tree, ang, kind, ox: -Math.cos(ang) * 3 + rand(1.5, -1.5), oy: -9 - rand(8) - Math.sin(ang) * 2, t: 2.2 });
  }
  shake(mag, t = .18) { this.shakeMag = Math.max(this.shakeMag, mag); this.shakeT = Math.max(this.shakeT, t); }
  stop(t = HIT_STOP.hit) { this.hitStop = Math.max(this.hitStop, t); }
  screenFlash(col = '#fff2c0', a = .35) { this.flash = a; this.flashCol = col; }

  update(dt) {
    this.time += dt;
    if (this.hitStop > 0) { this.hitStop -= dt; }
    if (this.shakeT > 0) { this.shakeT -= dt; if (this.shakeT <= 0) this.shakeMag = 0; }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.4);
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts[i] = this.parts[this.parts.length - 1]; this.parts.pop(); continue; }
      if (p.kind === 'toss') {
        p.t += dt;
        const k = Math.max(0, Math.min(1, p.t / p.dur));
        p.x = p.x0 + (p.x1 - p.x0) * k; p.y = p.y0 + (p.y1 - p.y0) * k - Math.sin(k * Math.PI) * 22;
        if (p.t >= p.dur) { p.life = 0; }
        continue;
      }
      p.vy += p.g * dt;
      if (p.kind === 'leaf') { p.vx = Math.sin(p.life * 7 + p.ph) * 18; if (p.vy > 22) p.vy = 22; }
      else if (p.kind === 'ember' || p.kind === 'ash') p.vx += Math.sin(p.life * 5 + p.ph) * 30 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 'chip' && p.y > p.floor) { p.y = p.floor; p.vy *= -0.35; p.vx *= 0.5; }
      p.vx *= (1 - dt * 2);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i]; t.life -= dt; t.y += t.vy * dt; t.x += t.vx * dt; t.vy *= (1 - dt * 2.2); t.vx *= (1 - dt * 3);
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.life -= dt;
      r.r = r.rmax * easeOut(1 - r.life / r.max);
      if (r.life <= 0) this.rings.splice(i, 1);
    }
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const s = this.slashes[i]; s.life -= dt;
      if (s.life <= 0) this.slashes.splice(i, 1);
    }
    for (let i = this.falls.length - 1; i >= 0; i--) {
      const f = this.falls[i];
      f.t += dt;
      if (!f.landed && f.t >= f.dur) {
        f.landed = true;
        const tipX = f.x + f.dir * (f.ay * 0.75);
        this.dust(tipX - f.dir * 10, f.y, 12, 22);
        this.leaves(tipX - f.dir * 6, f.y - 4, 10, f.type, 16);
        this.chips(f.x, f.y - 2, 5, f.type);
        this.shake(3.2, 0.16);
        if (this.onLand) this.onLand(f);
      }
      if (f.t > f.dur + f.fade) this.falls.splice(i, 1);
    }
    for (let i = this.hits.length - 1; i >= 0; i--) { const h = this.hits[i]; h.t += dt; if (h.t > 0.1) this.hits.splice(i, 1); }
    for (let i = this.blasts.length - 1; i >= 0; i--) { const b = this.blasts[i]; b.t += dt; if (b.t > b.dur) this.blasts.splice(i, 1); }
    for (let i = this.stuck.length - 1; i >= 0; i--) { const a = this.stuck[i]; a.t -= dt; if (a.t <= 0 || a.tree.dead) this.stuck.splice(i, 1); }
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i];
      c.t += dt;
      if (c.t >= c.dur) this.corpses.splice(i, 1);
    }
  }

  // dünya katmanı (karanlıktan önce): talaş, yaprak, duman, toz, kül, kırık
  drawWorld(ctx, cam) {
    const ox = -cam.x, oy = -cam.y;
    for (const p of this.parts) {
      const k = p.kind;
      if (k === 'spark' || k === 'ember') continue;
      const a = Math.min(1, p.life / (p.max * .5));
      const px = (p.x + ox) | 0, py = (p.y + oy) | 0;
      if (k === 'toss') { if (p.t >= 0) { ctx.globalAlpha = 1; ctx.drawImage(logPiece(p.type), px - 4, py - 3); } }
      else if (k === 'chip') { ctx.globalAlpha = a; ctx.drawImage(chipSprite(p.type, p.v), px, py); }
      else if (k === 'leaf') { ctx.globalAlpha = a; ctx.drawImage(leafSprite(p.type, ((p.life * 6) | 0) % 2), px, py); }
      else if (k === 'smoke') {
        const age = 1 - p.life / p.max;
        ctx.globalAlpha = Math.min(1, p.life / 0.6) * 0.32;
        ctx.drawImage(smokePuff(1 + age * 3.5), px, py);
      } else if (k === 'dust') { ctx.globalAlpha = a * 0.7; ctx.drawImage(dustPuff(1 + (1 - p.life / p.max) * 3.5), px, py); }
      else if (k === 'ash') { ctx.globalAlpha = a; ctx.drawImage(ashMote(p.v), px, py); }
      else if (k === 'shard') { ctx.globalAlpha = a; ctx.drawImage(shardSprite(), px, py); }
    }
    ctx.globalAlpha = 1;
    for (const a of this.stuck) {
      ctx.globalAlpha = Math.min(1, a.t * 3);
      const wob = a.t > 2.05 ? Math.round(Math.sin(a.t * 90) * 1) : 0;
      ctx.drawImage(arrowSprite(a.ang, a.kind), Math.round(a.tree.x + a.ox + ox) - 12, Math.round(a.tree.y + a.oy + oy) - 12 + wob);
    }
    ctx.globalAlpha = 1;
    for (const r of this.rings) this.drawRing(ctx, r, ox, oy);
    ctx.globalAlpha = 1;
  }

  drawRing(ctx, r, ox, oy) {
    const a = r.life / r.max;
    ctx.globalAlpha = Math.min(1, a * 1.2);
    ctx.fillStyle = r.col;
    const n = Math.max(12, Math.min(140, (r.r * 1.6) | 0));
    const w = r.width > 2 ? 2 : r.width;
    const cx = r.x + ox, cy = r.y + oy;
    for (let i = 0; i < n; i++) {
      const ang = i / n * Math.PI * 2;
      ctx.fillRect((cx + Math.cos(ang) * r.r) | 0, (cy + Math.sin(ang) * r.r * 0.8) | 0, w, w);
    }
  }

  // savurma izi: pikselli hilal
  drawSlashes(ctx, cam) {
    const ox = -cam.x, oy = -cam.y;
    for (const s of this.slashes) {
      const a = s.life / s.max;
      const prog = 1 - a;
      const layers = [[0, PAL.E6, 1], [2, PAL.E4, 0.9], [4, PAL.E2, 0.6]];
      const n = Math.max(8, (s.arc * s.reach / 1.6) | 0);
      const from = Math.min(0.85, prog * 1.1);
      for (const [inset, col, al] of layers) {
        ctx.globalAlpha = al * Math.min(1, a * 1.6);
        ctx.fillStyle = col;
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          if (t < from) continue;
          const ang = s.a - s.arc / 2 + s.arc * t;
          const thick = Math.sin(t * Math.PI);
          if (inset && thick < inset * 0.18) continue;
          const rr = s.reach * 0.92 - inset * (0.6 + thick * 0.6);
          const w = thick > 0.55 ? 2 : 1;
          ctx.fillRect((s.x + ox + Math.cos(ang) * rr) | 0, (s.y + oy + Math.sin(ang) * rr * 0.85) | 0, w, w);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  drawFall(ctx, f, cam) {
    const x = (f.x - cam.x) | 0, y = (f.y - cam.y) | 0;
    const k = Math.min(1, f.t / f.dur);
    // önce ağır ağır yatar, sonra hızlanır (k^3); açı kademeli → pikseller titremez
    let ang = f.dir * (Math.PI / 2 - 0.1) * k * k * k;
    if (f.landed) ang = f.dir * ((Math.PI / 2 - 0.1) - Math.sin(Math.min(1, (f.t - f.dur) / 0.25) * Math.PI) * 0.06);
    const fade = f.landed ? 1 - (f.t - f.dur) / f.fade : 1;
    ctx.save();
    ctx.globalAlpha = Math.max(0, fade);
    ctx.translate(x, y);
    ctx.rotate(Math.round(ang * 20) / 20);
    ctx.drawImage(f.spr, -f.ax, -f.ay);
    ctx.restore();
  }

  drawCorpse(ctx, c, cam) {
    const M = ENEMY_META[c.kind];
    const step = Math.min(3, (c.t / c.dur * 4) | 0);
    ctx.globalAlpha = 1 - (c.t / c.dur) * 0.4;
    ctx.drawImage(enemyDeath(c.kind, step, c.mirror), (c.x - cam.x - M.fx) | 0, (c.y - cam.y + 4 - M.fy - step) | 0);
    ctx.globalAlpha = 1;
  }

  // ışık katmanı (karanlıktan sonra): kıvılcım ve korlar kendi ışığıyla parlar
  drawGlow(ctx, cam) {
    const ox = -cam.x, oy = -cam.y;
    for (const p of this.parts) {
      if (p.kind !== 'spark' && p.kind !== 'ember') continue;
      const a = Math.min(1, p.life / (p.max * .5));
      ctx.globalAlpha = a;
      const px = (p.x + ox) | 0, py = (p.y + oy) | 0;
      if (p.kind === 'spark') {
        if (p.col) { ctx.fillStyle = p.col; ctx.fillRect(px, py, 2, 2); }
        else ctx.drawImage(sparkSprite(p.v), px, py);
      } else ctx.drawImage(emberParticle(p.v), px, py);
    }
    ctx.globalAlpha = 1;
    for (const b of this.blasts) this.drawBlast(ctx, b, ox, oy);
    for (const h of this.hits) {
      const fr = h.t < 0.05 ? 0 : 1, spr = impactSprite(fr, h.tone);
      const px = Math.round(h.x + ox), py = Math.round(h.y + oy);
      if (h.big && fr === 0) ctx.drawImage(spr, px - 15, py - 15, 30, 30);
      else ctx.drawImage(spr, px - 7, py - 7);
    }
    ctx.globalAlpha = 1;
  }

  drawBlast(ctx, b, ox, oy) {
    const k = Math.min(1, b.t / b.dur), c = tone(b.tone);
    const cx = Math.round(b.x + ox), cy = Math.round(b.y + oy);
    const rr = b.r * easeOut(k);
    if (k < 0.3) {                                   // çekirdek: parlak dolu disk
      const d = discSprite(Math.max(4, b.r * (0.35 + k * 1.2)), b.tone, 1);
      ctx.drawImage(d, cx - (d.width >> 1), cy - (d.height >> 1));
    } else if (k < 0.62) {                           // dağılan duman/alev dokusu
      const d = discSprite(Math.max(4, rr * 0.9), b.tone, 0.5);
      ctx.globalAlpha = 1 - (k - 0.3) / 0.4;
      ctx.drawImage(d, cx - (d.width >> 1), cy - (d.height >> 1));
      ctx.globalAlpha = 1;
    }
    // halka: etki yarıçapına kadar genişler, sonra parçalanır
    const n = Math.max(14, Math.min(150, (rr * 1.25) | 0));
    const th = k < 0.35 ? 3 : k < 0.7 ? 2 : 1;
    const col = k < 0.25 ? c[0] : k < 0.5 ? c[1] : k < 0.72 ? c[2] : k < 0.88 ? c[3] : c[4];
    ctx.fillStyle = col;
    for (let i = 0; i < n; i++) {
      if (k > 0.6 && ((i * 7 + b.seed) % 10) / 10 < (k - 0.6) * 2.2) continue;
      const a = i / n * Math.PI * 2;
      const wob = ((i * 5 + b.seed) % 3) - 1;
      ctx.fillRect(Math.round(cx + Math.cos(a) * (rr + wob)) - (th >> 1), Math.round(cy + Math.sin(a) * (rr + wob)) - (th >> 1), th, th);
    }
    if (k < 0.7) {                                   // dışa uzanan alev dilleri
      ctx.fillStyle = c[2];
      for (let i = 0; i < n; i += 4) {
        const a = (i + (b.seed % 4)) / n * Math.PI * 2, e = rr + 3 + ((i + b.seed) % 5);
        ctx.fillRect(Math.round(cx + Math.cos(a) * e), Math.round(cy + Math.sin(a) * e), 1, 2);
      }
    }
  }

  // uçan yazılar: bitmap font, koyu hat; büyük olanlar (kritik) önce şişip oturur
  drawTexts(ctx, cam) {
    const ox = -cam.x, oy = -cam.y;
    for (const t of this.texts) {
      const age = t.max - t.life;
      ctx.globalAlpha = Math.min(1, t.life / (t.max * .45));
      let scale = t.size >= 10 ? 2 : 1;
      if (t.size >= 10 && age < 0.07) scale = 3;
      drawText(ctx, t.str, t.x + ox, t.y + oy - 6 * scale, { color: t.col, scale, align: 'center', outline: PAL.C0, thick: scale > 1 });
    }
    ctx.globalAlpha = 1;
  }

  // geriye uyumluluk: hepsini çiz
  draw(ctx, cam) { this.drawWorld(ctx, cam); this.drawSlashes(ctx, cam); this.drawGlow(ctx, cam); this.drawTexts(ctx, cam); }

  shakeOffset() {
    if (this.shakeT <= 0) return { x: 0, y: 0 };
    const m = Math.min(6, this.shakeMag * Math.min(1, this.shakeT / .18));
    return { x: Math.round(rand(m, -m)), y: Math.round(rand(m, -m)) };
  }
}
