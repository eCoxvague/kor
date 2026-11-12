// KOR — başlık, sınıf seçimi, duraklatma ve ölüm ekranları (canvas): arkada canlı orman ve ateş
import { cached } from './pix.js';
import { PAL } from './palette.js';
import { drawText, textWidth, wrapText } from './font.js';
import { CLASSES, CLASS_IDS, classBars } from '../systems/classes.js';
import { panel, bar } from './hud.js';
import { edgeGlow } from './light.js';
import { vrnd } from '../systems/fx.js';
import { playerFrame, axeFrame, bowFrame, PW, PH, PFOOT_Y, AXE_SIZE, BOW_SIZE } from './player.js';
import { arrowSprite, orbSprite, impactSprite } from './fxart.js';
import { stumpSprite } from './terrain.js';
import { icon } from './icons.js';
import { isMuted } from '../core/audio.js';

// DOM düğmeleriyle aynı yer (index.html / style.css yüzdeleri bununla eşleşir)
export const BTN = { x: 180, y: 150, w: 120, h: 22 };
// ölüm ekranındaki ikinci düğme (SINIF DEĞİŞTİR)
export const BTN2 = { x: 180, y: 190, w: 120, h: 16 };
// sınıf seçim kartları (index.html / style.css yüzdeleri bununla eşleşir)
export const CARD = { x0: 16, y: 26, w: 144, h: 218, gap: 8 };

// sınıf rengi: [ana, parlak, koyu zemin]
export const CLASS_TONE = {
  baltaci: [PAL.E3, PAL.E5, '#2a1008'],
  okcu: [PAL.G4, PAL.G5, '#14200f'],
  buyucu: [PAL.F, PAL.A3, '#101c2e'],
};
const BARS_COL = [
  { fill: PAL.R, hi: '#ff6a52', lo: PAL.E0, bg: '#2a0a08' },
  { fill: PAL.G4, hi: PAL.G5, lo: PAL.G2, bg: PAL.C1 },
  { fill: PAL.E3, hi: PAL.E5, lo: PAL.E1, bg: PAL.C1 },
  { fill: PAL.F, hi: PAL.A3, lo: PAL.C4, bg: PAL.C1 },
];
const easeOut = t => 1 - (1 - t) * (1 - t);
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

const LOGO_S = 7;
export function logoSprite() {
  const tw = textWidth('KOR', LOGO_S);
  const pad = 10, w = tw + pad * 2, h = 12 * LOGO_S + pad;
  return cached('logo', w, h, (x) => {
    const y0 = -2 * LOGO_S + pad / 2;
    // dış parıltı (dither'lı halka)
    x.globalAlpha = 0.35;
    for (const [dx, dy] of [[-4, 0], [4, 0], [0, -4], [0, 4], [-3, -3], [3, 3], [-3, 3], [3, -3]]) drawText(x, 'KOR', pad + dx, y0 + dy, { color: PAL.E1, scale: LOGO_S });
    x.globalAlpha = 1;
    drawText(x, 'KOR', pad, y0, { color: PAL.C0, scale: LOGO_S, outline: PAL.C0, thick: true });
    // bantlı kor dolgusu: üst sıcak beyaz → alt koyu kızıl
    const bands = [PAL.E6, PAL.E5, PAL.E4, PAL.E3, PAL.E3, PAL.E2, PAL.E1];
    const top = y0 + 3 * LOGO_S, bh = LOGO_S;
    for (let i = 0; i < bands.length; i++) {
      x.save();
      x.beginPath(); x.rect(0, top + i * bh, w, bh); x.clip();
      drawText(x, 'KOR', pad, y0, { color: bands[i], scale: LOGO_S });
      x.restore();
    }
  });
}

export class Screens {
  constructor() {
    this.embers = []; this.t = 0; this.hover = 0;   // hover: 0 yok, 1 ana düğme, 2 ikinci düğme
    this.mode = ''; this.prevMode = ''; this.modeT = 0;   // ekran geçişi: hangi ekran, ne kadar süredir
    this.lift = [0, 0, 0]; this.lastIdx = -1; this.pop = 0; this.demoT = 0;
  }

  // ekran değişimini izle (başlık ↔ sınıf seçimi yumuşak geçiş için)
  enter(mode, dt) {
    if (this.mode !== mode) { this.prevMode = this.mode; this.mode = mode; this.modeT = 0; }
    else this.modeT += dt;
    this.t += dt;
  }

  tickEmbers(dt, W, H, rate) {
    if (vrnd() < dt * rate) this.embers.push({ x: W / 2 + (vrnd() - 0.5) * 160, y: H * 0.36 + vrnd() * 20, vx: (vrnd() - 0.5) * 12, vy: -12 - vrnd() * 20, life: 1.5 + vrnd() * 1.5, ph: vrnd() * 6 });
    for (let i = this.embers.length - 1; i >= 0; i--) {
      const e = this.embers[i];
      e.life -= dt; if (e.life <= 0) { this.embers.splice(i, 1); continue; }
      e.x += (e.vx + Math.sin(e.life * 4 + e.ph) * 10) * dt; e.y += e.vy * dt;
    }
  }
  drawEmbers(ctx) {
    for (const e of this.embers) {
      ctx.globalAlpha = Math.min(1, e.life);
      ctx.fillStyle = e.life > 1.2 ? PAL.E5 : PAL.E3;
      ctx.fillRect(Math.round(e.x), Math.round(e.y), e.life > 2 ? 2 : 1, e.life > 2 ? 2 : 1);
    }
    ctx.globalAlpha = 1;
  }

  button(ctx, label, t) {
    const hov = this.hover === 1;
    panel(ctx, BTN.x, BTN.y, BTN.w, BTN.h, hov ? 'gold' : 'ember', hov ? 0.95 : 0.85);
    if (hov) { ctx.globalAlpha = 0.25; ctx.fillStyle = PAL.E3; ctx.fillRect(BTN.x + 1, BTN.y + 1, BTN.w - 2, BTN.h - 2); ctx.globalAlpha = 1; }
    drawText(ctx, label, BTN.x + BTN.w / 2, BTN.y + 5, { color: hov ? PAL.E6 : PAL.E4, align: 'center', shadow: PAL.C0 });
    // köşe korları
    const on = Math.sin(t * 5) > 0;
    ctx.fillStyle = on ? PAL.E5 : PAL.E3;
    ctx.fillRect(BTN.x - 4, BTN.y + 9, 2, 2); ctx.fillRect(BTN.x + BTN.w + 2, BTN.y + 9, 2, 2);
  }

  topShade(ctx, W, h, a = 0.16) {
    ctx.fillStyle = PAL.C0;
    for (let i = 0; i < 6; i++) { ctx.globalAlpha = a; ctx.fillRect(0, 0, W, h - i * (h / 6)); }
    ctx.globalAlpha = 1;
  }

  // başlık içeriği (alpha ve dikey kayma ile: geçişlerde de kullanılır)
  titleContent(g, ctx, a, dy) {
    const W = g.W, t = this.t;
    const logo = logoSprite();
    const ly = 6 + Math.round(Math.sin(t * 1.3) * 1) + dy;
    ctx.globalAlpha = a * (0.85 + Math.sin(t * 3.1) * 0.1 + Math.sin(t * 7.7) * 0.05);
    ctx.drawImage(logo, (W - logo.width) >> 1, ly);
    ctx.globalAlpha = a;
    drawText(ctx, 'ORMAN  ATEŞİ  BEKLİYOR', W / 2, 96 + dy, { color: PAL.E4, align: 'center', outline: PAL.C0 });
    drawText(ctx, 'Odunu kes. Ateşe at. Karanlık yaklaşmadan güçlen.', W / 2, 114 + dy, { color: PAL.A3, align: 'center', outline: PAL.C0 });
    drawText(ctx, 'Ateş seni ısıtır — fazlası yakar.', W / 2, 127 + dy, { color: PAL.A2, align: 'center', outline: PAL.C0 });
    this.button(ctx, 'ORMANA GİR', t);
    panel(ctx, 70, 236 - dy, W - 140, 28, 'wood', 0.7 * a);
    ctx.globalAlpha = a;
    drawText(ctx, 'WASD hareket · SOL TIK / BOŞLUK kes · E ateşe at', W / 2, 239 - dy, { color: PAL.A2, align: 'center' });
    drawText(ctx, 'F ağaç · 1-2-3-Q yetenek · SHIFT atıl · ESC dur · M ses', W / 2, 251 - dy, { color: PAL.A1, align: 'center' });
    ctx.globalAlpha = 1;
  }

  drawTitle(g, ctx, dt) {
    this.enter('title', dt);
    const W = g.W, H = g.H;
    this.tickEmbers(dt, W, H, 10);
    // sınıf seçiminden dönüş: içerik yukarıdan yerine süzülür
    const k = this.prevMode === 'classSelect' ? easeOut(clamp01(this.modeT / 0.3)) : 1;
    this.topShade(ctx, W, 150 + (1 - k) * 120);
    this.titleContent(g, ctx, k, Math.round((1 - k) * -14));
    this.drawEmbers(ctx);
  }

  // ---------- SINIF SEÇİMİ ----------
  // kart içi küçük sahne: büyütülmüş portre bekler; seçili kartta ara sıra saldırı gösterisi
  scene(ctx, cid, x, y, w, h, sel, T) {
    const tone = CLASS_TONE[cid];
    ctx.fillStyle = tone[2]; ctx.fillRect(x, y, w, h);
    // arkada sınıf renginde kademeli hale
    ctx.fillStyle = tone[0];
    for (let i = 0; i < 4; i++) { ctx.globalAlpha = sel ? 0.07 : 0.03; ctx.fillRect(x + 8 + i * 8, y + 6 + i * 6, w - 16 - i * 16, h - 22 - i * 8); }
    ctx.globalAlpha = 1;
    const gy = y + h - 9;                                        // zemin çizgisi
    ctx.fillStyle = PAL.G1; ctx.fillRect(x, gy, w, h - (gy - y));
    ctx.fillStyle = PAL.G2; ctx.fillRect(x, gy, w, 1);
    ctx.fillStyle = PAL.G3; for (let i = 3; i < w; i += 9) ctx.fillRect(x + i, gy - 1 + ((i * 7) % 3), 2, 1);
    const S = 3, c = CLASSES[cid], melee = c.primary.type === 'melee';
    // gösteri döngüsü: 0..1.25 bekle, hazırlık, darbe, sonuç
    const cyc = sel ? T % 2.3 : 0, wind = cyc >= 1.25 && cyc < 1.45, strike = cyc >= 1.45 && cyc < 1.7;
    const since = cyc - 1.45;                                    // darbeden beri
    const pose = wind ? 'wind' : strike ? 'strike' : 'idle' + (((T / 0.6) | 0) % 2);
    const px = x + (melee ? 12 : 4), py = gy - PFOOT_Y * S + 3;
    // hedef: kütük
    const st = stumpSprite(0), sx = x + w - (melee ? 44 : 40), sy = gy - 28;
    const hitNow = sel && since >= (melee ? 0 : 0.2) && since < (melee ? 0.12 : 0.34);
    ctx.drawImage(st, sx + (hitNow ? 1 : 0), sy, 40, 40);
    ctx.drawImage(playerFrame('r', pose, 'n', cid), px, py, PW * S, PH * S);
    const hx = px + 14 * S, hy = py + 19 * S;                     // el hizası
    if (melee && (wind || strike)) {
      const k = wind ? (cyc - 1.25) / 0.2 : Math.min(1, since / 0.1);
      const ang = wind ? -1.3 - 0.8 * easeOut(k) : -2.1 + 3.2 * easeOut(k);
      ctx.drawImage(axeFrame(ang), hx + Math.round(Math.cos(ang) * 10) - AXE_SIZE * S / 2, hy + Math.round(Math.sin(ang) * 8) - AXE_SIZE * S / 2, AXE_SIZE * S, AXE_SIZE * S);
    } else if (c.primary.type === 'arrow' && (wind || strike)) {
      ctx.drawImage(bowFrame(0, wind), hx + 8 - BOW_SIZE * S / 2, hy - 6 - BOW_SIZE * S / 2, BOW_SIZE * S, BOW_SIZE * S);
    }
    if (sel && since >= 0 && since < 0.6) {
      const tx = sx + 12, ty = sy + 16;
      if (melee) {
        if (since < 0.12) ctx.drawImage(impactSprite(since < 0.06 ? 0 : 1), tx - 15, ty - 15, 30, 30);
        this.chips(ctx, tx, ty, since, -1);
      } else {
        const fly = 0.2, k = since / fly;
        const x0 = hx + 26, yy = hy - 8;
        if (k < 1) {
          const fx = x0 + (tx - x0) * k;
          if (c.primary.type === 'arrow') ctx.drawImage(arrowSprite(0, 'arrow'), Math.round(fx) - 36, yy - 24, 48, 48);
          else {
            ctx.fillStyle = PAL.E2; ctx.fillRect(Math.round(fx) - 22, yy - 3, 6, 6); ctx.fillStyle = PAL.E3; ctx.fillRect(Math.round(fx) - 14, yy - 4, 8, 8);
            ctx.drawImage(orbSprite((T * 20) | 0), Math.round(fx) - 11, yy - 11, 22, 22);
          }
        } else if (c.primary.type === 'arrow') {
          ctx.drawImage(arrowSprite(0, 'arrow'), tx - 36 + (since < 0.3 ? 1 : 0), yy - 24, 48, 48);    // saplandı
          if (since < 0.32) ctx.drawImage(impactSprite(since < 0.26 ? 0 : 1), tx - 7, yy - 7);
          this.chips(ctx, tx, ty, since - fly, -1);
        } else {
          const b = (since - fly) / 0.4, R = 8 + easeOut(clamp01(b)) * 22;
          ctx.fillStyle = b < 0.3 ? PAL.E6 : b < 0.6 ? PAL.E4 : PAL.E2;
          if (b < 0.25) ctx.fillRect(tx - 8, yy - 8, 16, 16);
          for (let i = 0; i < 26; i++) { const a = i / 26 * 6.283; ctx.fillRect(Math.round(tx + Math.cos(a) * R), Math.round(yy + Math.sin(a) * R), b < 0.5 ? 3 : 2, b < 0.5 ? 3 : 2); }
        }
      }
    }
  }
  chips(ctx, x, y, age, dir) {
    if (age < 0 || age > 0.45) return;
    ctx.fillStyle = PAL.W5;
    for (let i = 0; i < 6; i++) {
      const vx = dir * (40 + i * 22), vy = -70 - (i % 3) * 30;
      ctx.fillStyle = i % 2 ? PAL.W5 : PAL.E5;
      ctx.fillRect(Math.round(x + vx * age), Math.round(y + vy * age + 320 * age * age), 3, 2);
    }
  }

  drawClassSelect(g, ctx, dt) {
    this.enter('classSelect', dt);
    const W = g.W, t = this.t, mt = this.modeT;
    this.tickEmbers(dt, W, g.H, 6);
    this.topShade(ctx, W, 270, 0.16 * Math.min(1, mt / 0.25 + 0.4));
    // başlıktan geliş: başlık yukarı kayarak silinir
    if (this.prevMode === 'title' && mt < 0.22) this.titleContent(g, ctx, 1 - mt / 0.22, Math.round(-mt / 0.22 * 16));
    const tk = easeOut(clamp01(mt / 0.25));
    ctx.globalAlpha = tk;
    drawText(ctx, 'SINIF SEÇ', W / 2, 2 - Math.round((1 - tk) * 8), { color: PAL.E4, scale: 2, align: 'center', outline: PAL.C0, thick: true });
    ctx.globalAlpha = 1;
    if (g.classIdx !== this.lastIdx) { if (this.lastIdx >= 0) this.pop = 0.16; this.lastIdx = g.classIdx; this.demoT = 0.9; }
    this.pop = Math.max(0, this.pop - dt); this.demoT += dt;

    CLASS_IDS.forEach((cid, i) => {
      const c = CLASSES[cid], bars = classBars(c), tone = CLASS_TONE[cid];
      const sel = g.classIdx === i;
      this.lift[i] += ((sel ? 1 : 0) - this.lift[i]) * Math.min(1, dt * 16);
      const k = easeOut(clamp01((mt - 0.08 - i * 0.07) / 0.3));           // sırayla alttan gelir
      if (k <= 0) return;
      const bump = sel && this.pop > 0 ? Math.round(Math.sin(this.pop / 0.16 * Math.PI) * 3) : 0;
      const x = CARD.x0 + i * (CARD.w + CARD.gap), w = CARD.w, h = CARD.h;
      const y = CARD.y + 4 - Math.round(this.lift[i] * 4) - bump + Math.round((1 - k) * 30);
      ctx.globalAlpha = k;
      // gövde + çerçeve
      ctx.fillStyle = PAL.C0; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      ctx.fillStyle = '#0c0d18'; ctx.fillRect(x, y, w, h);
      this.scene(ctx, cid, x + 3, y + 3, w - 6, 84, sel, sel ? this.demoT : t + i * 0.37);
      ctx.fillStyle = sel ? tone[1] : PAL.W2;
      ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
      if (sel) {
        ctx.fillStyle = tone[0];
        ctx.fillRect(x + 1, y + 1, w - 2, 1); ctx.fillRect(x + 1, y + h - 2, w - 2, 1); ctx.fillRect(x + 1, y + 1, 1, h - 2); ctx.fillRect(x + w - 2, y + 1, 1, h - 2);
        ctx.globalAlpha = k * (0.35 + Math.sin(t * 5) * 0.2);                  // dış parıltı
        ctx.fillRect(x - 2, y - 2, w + 4, 1); ctx.fillRect(x - 2, y + h + 1, w + 4, 1); ctx.fillRect(x - 2, y - 1, 1, h + 2); ctx.fillRect(x + w + 1, y - 1, 1, h + 2);
        ctx.globalAlpha = k;
        ctx.fillStyle = PAL.E6;                                                // köşe pırıltıları
        for (const [qx, qy] of [[x - 1, y - 1], [x + w - 2, y - 1], [x - 1, y + h - 2], [x + w - 2, y + h - 2]]) ctx.fillRect(qx, qy, 3, 3);
      }
      ctx.fillStyle = sel ? tone[0] : PAL.W1; ctx.fillRect(x + 3, y + 87, w - 6, 1);
      // etiketler (sahne üstünde)
      if (g.classId === cid) drawText(ctx, 'SON SEÇİLEN', x + 6, y + 3, { color: PAL.A2, shadow: PAL.C0 });
      if (c.resource) drawText(ctx, 'KAYNAK: ' + c.resource, x + w - 6, y + 3, { color: PAL.F, align: 'right', shadow: PAL.C0 });
      // ad + tek satır tanım
      drawText(ctx, c.name, x + w / 2, y + 86, { color: sel ? tone[1] : PAL.A2, scale: 2, align: 'center', outline: PAL.C0 });
      wrapText(c.tagline, w - 12).slice(0, 2).forEach((l, q) => drawText(ctx, l, x + w / 2, y + 109 + q * 10, { color: sel ? PAL.A3 : PAL.A1, align: 'center' }));
      // değer çubukları
      [['CAN', bars.hp], ['HIZ', bars.speed], ['HASAR', bars.dmg], ['MENZİL', bars.range]].forEach(([l, v], q) => {
        const by = y + 131 + q * 10;
        drawText(ctx, l, x + 7, by, { color: sel ? PAL.A2 : PAL.A1 });
        bar(ctx, x + 48, by + 3, w - 56, 5, v, BARS_COL[q], (w - 56) / 5);
      });
      // maddeler: + güçlü / - zayıf
      let ty = y + 173;
      for (const line of c.desc) {
        const weak = line.startsWith('Zayıf');
        const txt = line.replace(/^(Güçlü|Zayıf):\s*/, '');
        ctx.fillStyle = weak ? PAL.R : PAL.G5;
        ctx.fillRect(x + 7, ty + 6, 5, 1); if (!weak) ctx.fillRect(x + 9, ty + 4, 1, 5);
        const ls = wrapText(txt, w - 24).slice(0, 2);
        ls.forEach((l, q) => drawText(ctx, l, x + 16, ty + q * 10, { color: weak ? '#e0705f' : PAL.G5 }));
        ty += ls.length * 10 + 1;
      }
      if (!sel) { ctx.globalAlpha = 0.26 * k; ctx.fillStyle = PAL.C0; ctx.fillRect(x, y, w, h); }
      ctx.globalAlpha = 1;
    });
    // alt satır: seçili sınıfın en iyi skoru + kontrol ipucu
    const cid = CLASS_IDS[g.classIdx] || CLASS_IDS[0], best = g.best && g.best[cid];
    ctx.globalAlpha = tk;
    drawText(ctx, best ? CLASSES[cid].name + ' — EN İYİ: ' + best.time + ' sn · SEVİYE ' + best.level : CLASSES[cid].name + ' — henüz rekor yok', W / 2, 247, { color: best ? PAL.E4 : PAL.A1, align: 'center', outline: PAL.C0 });
    drawText(ctx, 'A / D seç  ·  ENTER / BOŞLUK onayla  ·  ESC geri', W / 2, 258, { color: PAL.A2, align: 'center', outline: PAL.C0 });
    ctx.globalAlpha = 1;
    this.drawEmbers(ctx);
  }

  // ---------- DURAKLATMA ----------
  drawPause(g, ctx, dt) {
    this.enter('pause', dt);
    const W = g.W, H = g.H, tone = CLASS_TONE[g.classId] || CLASS_TONE.baltaci;
    const k = easeOut(clamp01(this.modeT / 0.15));
    ctx.globalAlpha = 0.62 * k; ctx.fillStyle = PAL.C0; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    const X = 110, Y = 46 + Math.round((1 - k) * 8), PWd = 260, PHt = 178;
    panel(ctx, X, Y, PWd, PHt, 'wood', 0.96);
    ctx.fillStyle = tone[0]; ctx.fillRect(X + 1, Y + 1, PWd - 2, 2);
    drawText(ctx, 'DURAKLATILDI', W / 2, Y + 4, { color: PAL.E4, scale: 2, align: 'center', outline: PAL.C0 });
    // sınıf rozeti + gidişat
    ctx.fillStyle = tone[2]; ctx.fillRect(X + 8, Y + 30, PWd - 16, 34);
    ctx.fillStyle = tone[0]; ctx.fillRect(X + 8, Y + 30, 2, 34);
    ctx.drawImage(playerFrame('d', 'idle' + (((this.t / 0.6) | 0) % 2), 'n', g.classId), X + 12, Y + 30);
    drawText(ctx, g.cls.name, X + 44, Y + 32, { color: tone[1], shadow: PAL.C0 });
    drawText(ctx, 'SEVİYE ' + g.level + '  ·  ' + Math.floor(g.time) + ' sn  ·  KOR PUANI ' + g.points, X + 44, Y + 45, { color: PAL.A2 });
    // kontroller
    const rows = [['WASD', 'hareket'], ['SOL TIK / BOŞLUK', 'saldır (basılı tut)'], ['E', 'odunu ateşe at'], ['F', 'beceri ağacı'], ['1  2  3  Q', 'yetenekler'], ['SHIFT', 'atıl']];
    rows.forEach(([kk, v], i) => {
      const ry = Y + 70 + i * 13;
      drawText(ctx, kk, X + 118, ry, { color: PAL.E5, align: 'right' });
      drawText(ctx, v, X + 128, ry, { color: PAL.A3 });
    });
    ctx.fillStyle = PAL.W2; ctx.fillRect(X + 8, Y + 151, PWd - 16, 1);
    drawText(ctx, 'ESC devam  ·  C sınıf değiştir  ·  M ses: ' + (isMuted() ? 'KAPALI' : 'AÇIK'), W / 2, Y + 157, { color: PAL.E4, align: 'center' });
  }

  // ---------- ÖLÜM ----------
  drawDeath(g, ctx, dt, since) {
    this.enter('death', dt);
    const W = g.W, H = g.H, t = this.t;
    const k = Math.min(1, since / 0.8);
    const run = g.lastRun;        // { className, time, level, best, isBest, kills, fed, ... }
    ctx.globalAlpha = 0.6 * k; ctx.fillStyle = '#12040a'; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.7 * k; ctx.drawImage(edgeGlow(PAL.E0), 0, 0, W, H);
    ctx.globalAlpha = 1;
    if (since < 0.55) return;
    const a = Math.min(1, (since - 0.55) / 0.5);
    ctx.globalAlpha = a;
    const title = g.deathCause || 'KARANLIK ALDI';
    const sc = textWidth(title, 2) > W - 30 ? 1 : 2;
    drawText(ctx, title, W / 2, 20 - (1 - a) * 8, { color: PAL.E3, scale: sc, align: 'center', outline: PAL.C0, thick: true });
    const tone = CLASS_TONE[run ? run.classId : g.classId] || CLASS_TONE.baltaci;
    drawText(ctx, (run ? run.className + '  ·  ' : '') + 'ateş bir gün yeniden yanar', W / 2, 48, { color: PAL.A2, align: 'center', outline: PAL.C0 });
    // özet: 4 kutu
    const stats = [
      ['SÜRE', (run ? run.time : Math.floor(g.time)) + ' sn'], ['SEVİYE', String(run ? run.level : g.level)],
      ['YARATIK', String(run ? run.kills : g.killCount)], ['BESLENEN', String(run ? run.fed : (g.totalFed | 0))],
    ];
    const bx = 96, bw = 68, gap = 6;
    stats.forEach(([l, v], i) => {
      const x = bx + i * (bw + gap);
      panel(ctx, x, 66, bw, 36, 'wood', 0.9 * a);
      ctx.globalAlpha = a;
      ctx.fillStyle = tone[0]; ctx.fillRect(x + 1, 67, bw - 2, 1);
      drawText(ctx, l, x + bw / 2, 68, { color: PAL.A1, align: 'center' });
      drawText(ctx, v, x + bw / 2, 78, { color: PAL.E5, scale: textWidth(v, 2) > bw - 6 ? 1 : 2, align: 'center' });
    });
    // en iyi skor (sınıf başına)
    if (run && run.best) {
      const blink = run.isBest && Math.sin(t * 6) > 0;
      const txt = run.isBest ? 'YENİ REKOR!  ' + run.best.time + ' sn · SEVİYE ' + run.best.level
        : 'EN İYİ  ' + run.best.time + ' sn · SEVİYE ' + run.best.level;
      panel(ctx, 140, 110, 200, 17, run.isBest ? 'gold' : 'wood', 0.9 * a);
      ctx.globalAlpha = a;
      if (run.isBest) ctx.drawImage(icon('star'), 144, 112);
      drawText(ctx, txt, W / 2 + (run.isBest ? 6 : 0), 112, { color: blink ? PAL.E6 : run.isBest ? PAL.E4 : PAL.A2, align: 'center' });
    }
    this.button(ctx, 'TEKRAR  (R)', t);
    // ikinci düğme: sınıf değiştir (C)
    const h2 = this.hover === 2;
    panel(ctx, BTN2.x, BTN2.y, BTN2.w, BTN2.h, h2 ? 'gold' : 'wood', (h2 ? 0.95 : 0.85) * a);
    ctx.globalAlpha = a;
    drawText(ctx, 'SINIF DEĞİŞTİR  (C)', BTN2.x + BTN2.w / 2, BTN2.y + 3, { color: h2 ? PAL.E6 : PAL.A3, align: 'center', shadow: PAL.C0 });
    drawText(ctx, 'R tekrar  ·  C sınıf değiştir  ·  M ses', W / 2, 216, { color: PAL.A1, align: 'center', outline: PAL.C0 });
    ctx.globalAlpha = 1;
  }
}
