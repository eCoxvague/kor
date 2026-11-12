// KOR — oyun içi HUD (canvas, bitmap font, piksel çerçeve). DOM HUD erişilebilirlik için gizli tutulur.
// Sınıfa uyar: sol panelde sınıf rozeti/rengi; büyücüde ısı çubuğu KAYNAK olarak okunur (atışta azalır,
// zayıflama eşiği işaretli, düşükken uyarı); atılma kutusu (okçuda vurgulu); sınıfa özel yetenek ikonları.
import { clamp } from '../core/util.js';
import { cached, imageFill } from './pix.js';
import { PAL } from './palette.js';
import { drawText, textWidth } from './font.js';
import { icon } from './icons.js';
import { edgeGlow } from './light.js';
import { ABILITIES } from '../systems/abilities.js';

export const SLOT = { x0: 190, y: 242, size: 22, gap: 4 };
// yetenek kutuları sınıfın yeteneklerini gösterir: g.cls.abilities (1-2-3-Q sırası)
export const DASH_SLOT = { x: 160, y: 242, w: 24, h: 22 };
const CLS_COL = { baltaci: [PAL.E3, PAL.E5], okcu: [PAL.G4, PAL.G5], buyucu: [PAL.F, PAL.A3] };

// piksel çerçeveli panel
export function panel(ctx, x, y, w, h, tone = 'wood', alpha = 0.84) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = PAL.C0; ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
  ctx.fillStyle = PAL.C0;
  ctx.fillRect(x, y - 1, w, 1); ctx.fillRect(x, y + h, w, 1); ctx.fillRect(x - 1, y, 1, h); ctx.fillRect(x + w, y, 1, h);
  const hi = tone === 'ember' ? PAL.E2 : tone === 'cold' ? PAL.C4 : tone === 'gold' ? PAL.E4 : tone === 'moss' ? PAL.G4 : PAL.W3;
  const lo = tone === 'ember' ? PAL.E0 : tone === 'cold' ? PAL.C2 : tone === 'gold' ? PAL.W3 : tone === 'moss' ? PAL.G2 : PAL.W1;
  ctx.fillStyle = hi; ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y, 1, h);
  ctx.fillStyle = lo; ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x + w - 1, y, 1, h);
  ctx.fillStyle = PAL.A1;
  ctx.fillRect(x + 1, y + 1, 1, 1); ctx.fillRect(x + w - 2, y + 1, 1, 1); ctx.fillRect(x + 1, y + h - 2, 1, 1); ctx.fillRect(x + w - 2, y + h - 2, 1, 1);
}

// bölmeli çubuk
export function bar(ctx, x, y, w, h, frac, c, seg = 0) {
  frac = clamp(frac, 0, 1);
  ctx.fillStyle = PAL.C0; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = c.bg || PAL.C1; ctx.fillRect(x, y, w, h);
  const fw = Math.round(w * frac);
  if (fw > 0) {
    ctx.fillStyle = c.fill; ctx.fillRect(x, y, fw, h);
    ctx.fillStyle = c.hi; ctx.fillRect(x, y, fw, 1);
    if (h > 2) { ctx.fillStyle = c.lo; ctx.fillRect(x, y + h - 1, fw, 1); }
    if (fw < w) { ctx.fillStyle = c.hi; ctx.fillRect(x + fw - 1, y, 1, h); }
  }
  if (seg > 0) {
    ctx.fillStyle = PAL.C0;
    ctx.globalAlpha = 0.6;
    for (let sx = seg; sx < w; sx += seg) ctx.fillRect(x + Math.round(sx), y + 1, 1, h - 1);
    ctx.globalAlpha = 1;
  }
}

// bekleme süpürmesi maskesi (0..23 adım), 20x20
function sweepMask(step) {
  return cached('sweep' + step, 20, 20, (x) => {
    const frac = step / 24;
    imageFill(x, 20, 20, (px, py, out) => {
      let a = Math.atan2(px + 0.5 - 10, -(py + 0.5 - 10));
      if (a < 0) a += Math.PI * 2;
      if (a / (Math.PI * 2) < 1 - frac) return;
      out[0] = 7; out[1] = 8; out[2] = 15; out[3] = 190;
    });
  });
}

const BARS = {
  hp: { fill: PAL.R, hi: '#ff6a52', lo: PAL.E0, bg: '#2a0a08' },
  hpLow: { fill: PAL.E2, hi: PAL.E5, lo: PAL.E0, bg: '#2a0a08' },
  warm: { fill: PAL.E3, hi: PAL.E5, lo: PAL.E1, bg: PAL.C1 },
  cold: { fill: PAL.F, hi: PAL.A3, lo: PAL.C4, bg: PAL.C1 },
  weak: { fill: PAL.R, hi: PAL.E4, lo: PAL.E0, bg: '#2a0a08' },
  fire: { fill: PAL.E3, hi: PAL.E5, lo: PAL.E1, bg: '#1c0805' },
  fireLow: { fill: PAL.E1, hi: PAL.E3, lo: PAL.E0, bg: '#1c0805' },
  xp: { fill: PAL.E4, hi: PAL.E6, lo: PAL.W3, bg: PAL.C1 },
  carry: { fill: PAL.W4, hi: PAL.W5, lo: PAL.W2, bg: PAL.C1 },
};

// ilk dakikanın 3 adımı: kes → ateşe at → F ile güçlen
const COACH = [
  ['KES', 'Ağaca yaklaş: SOL TIK ya da BOŞLUK (basılı tut)'],
  ['ATEŞE AT', 'Odunu ateşe götür ve E ile at'],
  ['GÜÇLEN', 'Kor puanın var: F ile beceri ağacını aç'],
];

export class Hud {
  constructor() {
    this.prevCd = {}; this.ready = {};
    this.combo = 0; this.comboPop = 0; this.comboShow = 0;
    this.toastMsg = ''; this.toastT = 0;
    this.time = 0;
    this.prevPts = 0; this.ptsPop = 0;
    this.prevLevel = 1; this.lvlT = 0;                 // seviye atlama kutlaması
    this.prevWarm = -1; this.spendT = 0; this.spendFrom = 0;   // büyücü: harcanan ısı parlaması
    this.dashReady = 0; this.prevDash = 0;
    this.coachStep = -1; this.coachT = 0; this.coachDone = 0;
  }
  toast(msg) { this.toastMsg = msg; this.toastT = 2.4; }

  draw(g, ctx, dt) {
    this.time += dt;
    const p = g.player, s = g.stats, t = this.time;
    const W = g.W, H = g.H;
    const cc = CLS_COL[g.classId] || CLS_COL.baltaci;

    // ---- uyarı kenar nabızları ----
    const hpF = clamp(p.hp / s.maxHp, 0, 1);
    const wF = clamp(p.warmth / s.maxWarmth, 0, 1);
    const fuel = g.fire.fuel;
    if (hpF < 0.3) {
      const beat = Math.pow(Math.max(0, Math.sin(t * 7)), 6) + Math.pow(Math.max(0, Math.sin(t * 7 - 0.7)), 8) * 0.6;
      ctx.globalAlpha = 0.25 + beat * 0.55 * (1 - hpF / 0.3 * 0.5);
      ctx.drawImage(edgeGlow(PAL.R), 0, 0, W, H);
    }
    if (wF < 0.3) {
      ctx.globalAlpha = 0.25 + (Math.sin(t * 3) * 0.5 + 0.5) * 0.3;
      ctx.drawImage(edgeGlow(PAL.F), 0, 0, W, H);
    }
    if (fuel < 15) {
      ctx.globalAlpha = (fuel <= 0 ? 0.45 : 0.22) + (Math.sin(t * 4.2) * 0.5 + 0.5) * 0.3;
      ctx.drawImage(edgeGlow(fuel <= 0 ? PAL.C4 : PAL.E2), 0, 0, W, H);
    }
    ctx.globalAlpha = 1;

    // ---- sol panel: sınıf rozeti, can, ısı, sepet ----
    const res = g.cls.resource;
    panel(ctx, 4, 4, 142, 55);
    ctx.fillStyle = cc[0]; ctx.fillRect(5, 5, 140, 11);
    ctx.fillStyle = PAL.C0; ctx.globalAlpha = 0.72; ctx.fillRect(5, 5, 140, 11); ctx.globalAlpha = 1;
    ctx.fillStyle = cc[0]; ctx.fillRect(5, 5, 3, 11);
    drawText(ctx, g.cls.name, 12, 3, { color: cc[1], shadow: PAL.C0 });
    drawText(ctx, g.cls.primary.name, 142, 3, { color: PAL.A1, align: 'right' });

    const hpLow = hpF < 0.3;
    ctx.drawImage(icon('hp'), 6 + (hpLow && Math.sin(t * 14) > 0.6 ? 1 : 0), 18);
    bar(ctx, 20, 21, 76, 6, hpF, hpLow ? BARS.hpLow : BARS.hp, 76 / Math.max(1, Math.round(s.maxHp / 20)));
    drawText(ctx, Math.ceil(p.hp) + '/' + Math.round(s.maxHp), 100, 18, { color: hpLow ? PAL.E5 : PAL.A3, shadow: PAL.C0 });

    const cold = wF < 0.3;
    if (res) {
      // büyücü: ısı = büyü kaynağı. Atışta azalan kısım kısa süre parlar; %40 altı büyüyü zayıflatır (çentik).
      const weak = p.heatPower() < 0.999;
      if (this.prevWarm >= 0 && p.warmth < this.prevWarm - 1.5) { this.spendT = 0.28; this.spendFrom = this.prevWarm / s.maxWarmth; }
      this.prevWarm = p.warmth;
      this.spendT = Math.max(0, this.spendT - dt);
      ctx.drawImage(icon('orb', weak ? 'g' : 'n'), 6, 30);
      bar(ctx, 20, 33, 76, 7, wF, weak ? BARS.weak : BARS.warm);
      if (this.spendT > 0) {
        const x0 = 20 + Math.round(76 * wF), x1 = 20 + Math.round(76 * clamp(this.spendFrom, 0, 1));
        ctx.globalAlpha = this.spendT / 0.28; ctx.fillStyle = PAL.E6; ctx.fillRect(x0, 33, Math.max(1, x1 - x0), 7); ctx.globalAlpha = 1;
      }
      const mk = 20 + Math.round(76 * 0.4);
      ctx.fillStyle = PAL.C0; ctx.fillRect(mk - 1, 31, 3, 2); ctx.fillStyle = PAL.A3; ctx.fillRect(mk, 31, 1, 3);
      drawText(ctx, res + ' ' + Math.round(p.warmth), 100, 30, { color: weak ? (Math.sin(t * 8) > 0 ? PAL.R : PAL.E4) : PAL.E5, shadow: PAL.C0 });
      if (weak) {
        ctx.globalAlpha = 0.65 + Math.sin(t * 6) * 0.35;
        drawText(ctx, 'ISI DÜŞÜK — BÜYÜ ZAYIF, ATEŞE DÖN', 6, 61, { color: PAL.R, outline: PAL.C0 });
        ctx.globalAlpha = 1;
      }
    } else {
      ctx.drawImage(icon(cold ? 'cold' : 'heat'), 6, 31);
      bar(ctx, 20, 34, 76, 5, wF, cold ? BARS.cold : BARS.warm);
      const hs = p.warmth <= 0 ? 'DONUYOR' : cold ? 'ÜŞÜYOR' : 'ILIK';
      drawText(ctx, hs, 100, 30, { color: cold ? PAL.F : PAL.E4, shadow: PAL.C0 });
    }

    ctx.drawImage(icon('basket'), 6, 44);
    const carry = Math.round(s.carry);
    const full = p.carried >= carry;
    drawText(ctx, p.carried + '/' + carry, 20, 43, { color: full ? PAL.E5 : PAL.A3, shadow: PAL.C0 });
    const cx0 = 20 + textWidth(p.carried + '/' + carry) + 5;
    bar(ctx, cx0, 48, 140 - cx0 - (full ? 28 : 0), 3, p.carried / carry, BARS.carry);
    if (full) drawText(ctx, 'DOLU', 142, 43, { color: Math.sin(t * 6) > 0 ? PAL.E5 : PAL.E3, align: 'right', shadow: PAL.C0 });

    // ---- orta panel: ateş ----
    const fx = 172, fw = 136;
    const fState = fuel <= 0 ? 'SÖNÜK' : fuel < 20 ? 'ZAYIF' : fuel < 55 ? 'YANIYOR' : 'KÜKRÜYOR';
    const fLow = fuel < 15;
    panel(ctx, fx, 4, fw, 26, fLow && Math.sin(t * 6) > 0 ? 'ember' : 'wood');
    ctx.drawImage(icon('flame'), fx + 3, 6 + (fuel > 0 && Math.sin(t * 9) > 0.7 ? -1 : 0));
    drawText(ctx, 'ATEŞ', fx + 18, 6, { color: PAL.A2, shadow: PAL.C0 });
    drawText(ctx, fState, fx + fw - 5, 6, { color: fuel <= 0 ? PAL.C4 : fLow ? PAL.E3 : PAL.E5, align: 'right', shadow: PAL.C0 });
    bar(ctx, fx + 18, 21, fw - 24, 5, fuel / 90, fLow ? BARS.fireLow : BARS.fire, (fw - 24) / 6);
    if (fuel > 0 && fuel < 90) {
      // titrek uç
      const tip = fx + 18 + Math.round((fw - 24) * clamp(fuel / 90, 0, 1));
      ctx.fillStyle = Math.sin(t * 20) > 0 ? PAL.E6 : PAL.E5; ctx.fillRect(tip - 1, 20, 1, 1);
    }
    if (fLow) {
      const msg = fuel <= 0 ? 'ATEŞ SÖNDÜ! ODUN AT (E)' : 'ATEŞ SÖNÜYOR!';
      ctx.globalAlpha = 0.6 + Math.sin(t * 6) * 0.4;
      drawText(ctx, msg, fx + fw / 2, 34, { color: fuel <= 0 ? PAL.F : PAL.E4, align: 'center', outline: PAL.C0 });
      ctx.globalAlpha = 1;
    }

    // ---- sağ panel: seviye + XP, kor puanı ----
    const rx = 350, rw = 126;
    panel(ctx, rx, 4, rw, 26, 'wood');
    ctx.drawImage(icon('star'), rx + 3, 6);
    drawText(ctx, 'SEVİYE', rx + 18, 6, { color: PAL.A2, shadow: PAL.C0 });
    drawText(ctx, String(g.level), rx + rw - 5, 6, { color: PAL.E5, align: 'right', shadow: PAL.C0 });
    bar(ctx, rx + 18, 22, rw - 24, 3, g.xp / g.xpNext, BARS.xp);
    if (g.points !== this.prevPts) { if (g.points > this.prevPts) this.ptsPop = 0.4; this.prevPts = g.points; }
    this.ptsPop = Math.max(0, this.ptsPop - dt);
    const hasPts = g.points > 0;
    panel(ctx, rx + 40, 34, rw - 40, 16, hasPts ? 'gold' : 'wood');
    ctx.drawImage(icon('ember'), rx + 43, 36 - (this.ptsPop > 0.2 ? 1 : 0));
    drawText(ctx, String(g.points), rx + 58, 36, { color: hasPts ? PAL.E5 : PAL.A1, shadow: PAL.C0, scale: 1 });
    if (hasPts) {
      ctx.globalAlpha = 0.55 + Math.sin(t * 5) * 0.45;
      drawText(ctx, '[F] AĞAÇ', rx + rw - 4, 36, { color: PAL.E4, align: 'right', shadow: PAL.C0 });
      ctx.globalAlpha = 1;
    } else drawText(ctx, 'KOR', rx + rw - 4, 36, { color: PAL.A0, align: 'right' });

    // ---- yetenek kutuları + atılma ----
    for (let i = 0; i < 4; i++) this.drawSlot(g, ctx, g.cls.abilities[i], SLOT.x0 + i * (SLOT.size + SLOT.gap), SLOT.y, dt);
    this.drawDash(g, ctx, dt, cc);

    // ---- kombo: her vuruşta büyüyerek zıplar ----
    if (p.combo !== this.combo) { if (p.combo > this.combo && p.combo >= 2) this.comboPop = 0.24; this.combo = p.combo; }
    this.comboPop = Math.max(0, this.comboPop - dt);
    if (p.combo >= 2 && p.comboT > 0) {
      const k = this.comboPop / 0.24;
      const sc = k > 0.45 ? 3 : 2;
      const hop = Math.round(Math.sin(k * Math.PI) * 4);
      const col = p.combo >= 10 ? PAL.E6 : p.combo >= 6 ? PAL.E5 : PAL.E4;
      ctx.globalAlpha = Math.min(1, p.comboT * 2.5);
      drawText(ctx, 'x' + p.combo, W - 12, 118 - (sc - 2) * 8 - hop, { color: k > 0.45 ? PAL.E6 : col, scale: sc, align: 'right', outline: PAL.C0, thick: true });
      drawText(ctx, 'KOMBO', W - 12, 142, { color: PAL.E3, align: 'right', outline: PAL.C0 });
      // kombo süresi çizgisi
      ctx.fillStyle = PAL.C0; ctx.fillRect(W - 46, 156, 35, 3);
      ctx.fillStyle = PAL.E3; ctx.fillRect(W - 45, 157, Math.round(33 * clamp(p.comboT / 1.2, 0, 1)), 1);
      ctx.globalAlpha = 1;
    }

    // ---- ateş yönü oku (ateş ekran dışındaysa) ----
    const sxF = g.fire.x - g.cam.x, syF = g.fire.y - g.cam.y;
    if (sxF < -6 || sxF > W + 6 || syF < -6 || syF > H + 6) {
      const pxs = p.x - g.cam.x, pys = p.y - g.cam.y;
      const a = Math.atan2(syF - pys, sxF - pxs);
      const ex = clamp(W / 2 + Math.cos(a) * 400, 18, W - 18), ey = clamp(H / 2 + Math.sin(a) * 400, 70, H - 40);
      ctx.globalAlpha = 0.75 + Math.sin(t * 4) * 0.25;
      ctx.drawImage(icon('flame'), (ex - 6) | 0, (ey - 6) | 0);
      ctx.fillStyle = PAL.E4;
      for (let k = 0; k < 3; k++) ctx.fillRect(Math.round(ex + Math.cos(a) * (9 + k)) - 1, Math.round(ey + Math.sin(a) * (9 + k)) - 1, 3 - k, 3 - k);
      ctx.globalAlpha = 1;
    }

    this.drawLevelUp(g, ctx, dt);
    if (!g.paused) this.drawCoach(g, ctx, dt);

    // ---- bildirim ----
    if (this.toastT > 0 && !g.paused) {
      this.toastT -= dt;
      const a = Math.min(1, this.toastT / 0.3, (2.4 - this.toastT) / 0.15 + 0.2);
      const tw = textWidth(this.toastMsg);
      ctx.globalAlpha = Math.max(0, a);
      panel(ctx, (W - tw) / 2 - 7 | 0, 220, tw + 14, 15, 'ember', 0.78);
      drawText(ctx, this.toastMsg, W / 2, 222, { color: PAL.E5, align: 'center', shadow: PAL.C0 });
      ctx.globalAlpha = 1;
    }
  }

  // seviye atlama: kısa kutlama yazısı (büyüyüp oturur, iki yana ışın çizgileri)
  drawLevelUp(g, ctx, dt) {
    if (g.level > this.prevLevel) this.lvlT = 1.7;
    this.prevLevel = g.level;
    if (this.lvlT <= 0) return;
    this.lvlT -= dt;
    const age = 1.7 - this.lvlT, W = g.W;
    const a = Math.min(1, this.lvlT / 0.35);
    const sc = age < 0.07 ? 4 : 3, y = 66 - (sc - 3) * 6;
    const txt = 'SEVİYE ' + g.level;
    const tw = textWidth(txt, 3);
    ctx.globalAlpha = a;
    const ext = Math.round(Math.min(1, age / 0.25) * 60);
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = [PAL.E6, PAL.E4, PAL.E2][i];
      const yy = 84 + i * 3 - 3, len = Math.max(0, ext - i * 14);
      ctx.fillRect(W / 2 - tw / 2 - 8 - len, yy, len, 1); ctx.fillRect(W / 2 + tw / 2 + 8, yy, len, 1);
    }
    drawText(ctx, txt, W / 2, y, { color: age < 0.12 ? PAL.E6 : PAL.E5, scale: sc, align: 'center', outline: PAL.C0, thick: true });
    drawText(ctx, '+1 KOR PUANI', W / 2, 104, { color: PAL.E4, align: 'center', outline: PAL.C0 });
    ctx.globalAlpha = 1;
  }

  // ilk dakikada oyuncuya sıradaki adımı söyler; adım tamamlanınca kaybolur
  drawCoach(g, ctx, dt) {
    const bought = Object.keys(g.owned).length > 0;
    let step = -1;
    if (g.totalHarvest <= 0 && g.totalFed <= 0) step = g.time < 45 ? 0 : -1;
    else if (g.totalFed <= 0) step = g.time < 75 ? 1 : -1;
    else if (!bought && g.points > 0 && g.time < 150) step = 2;
    if (step !== this.coachStep) { this.coachStep = step; this.coachT = 0; }
    this.coachT += dt;
    if (step < 0) return;
    const W = g.W, t = this.time;
    const a = Math.min(1, this.coachT / 0.3);
    const msg = COACH[step][1];
    const w = Math.max(206, textWidth(msg) + 16), x = (W - w) >> 1, y = 190 + Math.round((1 - a) * 6);
    ctx.globalAlpha = a;
    panel(ctx, x, y, w, 26, 'gold', 0.86);
    // 3 adımlı ilerleme: KES › ATEŞE AT › GÜÇLEN
    let cx = x + 6;
    COACH.forEach(([name], i) => {
      const done = i < step, cur = i === step;
      const lbl = (i + 1) + ' ' + name;
      if (cur) { ctx.fillStyle = Math.sin(t * 6) > 0 ? PAL.E4 : PAL.E3; ctx.fillRect(cx - 2, y + 2, textWidth(lbl) + 4, 11); }
      drawText(ctx, lbl, cx, y + 1, { color: cur ? PAL.C0 : done ? PAL.G5 : PAL.A0 });
      cx += textWidth(lbl) + 6;
      if (i < 2) { drawText(ctx, '>', cx, y + 1, { color: PAL.A0 }); cx += 10; }
    });
    drawText(ctx, msg, x + 6, y + 13, { color: PAL.A3 });
    ctx.globalAlpha = 1;
  }

  // atılma kutusu: SHIFT, bekleme süpürmesi; okçuda sınıf renginde vurgulu
  drawDash(g, ctx, dt, cc) {
    const p = g.player, s = g.stats, D = DASH_SLOT;
    const dcd = clamp(p.dashCdT / Math.max(0.01, s.dashCd), 0, 1), rdy = dcd <= 0;
    if (this.prevDash > 0 && rdy) this.dashReady = 0.3;
    this.prevDash = dcd;
    this.dashReady = Math.max(0, this.dashReady - dt);
    const archer = g.classId === 'okcu';
    panel(ctx, D.x, D.y, D.w, D.h, rdy ? (archer ? 'moss' : 'wood') : 'cold', 0.86);
    // çift ok ucu (»)
    ctx.fillStyle = rdy ? (archer ? cc[1] : PAL.E4) : PAL.A0;
    for (const ox of [5, 11]) for (let i = 0; i < 5; i++) ctx.fillRect(D.x + ox + (i < 3 ? i : 4 - i), D.y + 4 + i, 3, 1);
    ctx.fillStyle = PAL.C2; ctx.fillRect(D.x + 3, D.y + 11, D.w - 6, 2);
    ctx.fillStyle = rdy ? (archer ? cc[0] : PAL.E3) : PAL.F; ctx.fillRect(D.x + 3, D.y + 11, Math.round((D.w - 6) * (1 - dcd)), 2);
    drawText(ctx, 'SHIFT', D.x + D.w / 2, D.y + 15, { mini: true, color: rdy ? PAL.A3 : PAL.A1, align: 'center' });
    if (this.dashReady > 0) {
      ctx.globalAlpha = this.dashReady / 0.3; ctx.fillStyle = PAL.E6;
      ctx.fillRect(D.x, D.y, D.w, 1); ctx.fillRect(D.x, D.y + D.h - 1, D.w, 1); ctx.fillRect(D.x, D.y, 1, D.h); ctx.fillRect(D.x + D.w - 1, D.y, 1, D.h);
      ctx.globalAlpha = 1;
    }
  }

  drawSlot(g, ctx, id, x, y, dt) {
    const ab = g.abilities, def = ABILITIES[id];
    const owned = ab.has(id);
    const cd = ab.cd[id] || 0;
    const maxCd = ab.maxCd(id);
    const prev = this.prevCd[id] || 0;
    if (prev > 0.05 && cd <= 0.05 && owned) this.ready[id] = 0.3;
    this.prevCd[id] = cd;
    this.ready[id] = Math.max(0, (this.ready[id] || 0) - dt);
    const S = SLOT.size;
    const canAfford = g.player.warmth >= ab.cost(id);
    const ic = def.icon || id;
    panel(ctx, x, y, S, S, owned ? (cd > 0.05 ? 'wood' : 'ember') : 'cold', 0.86);
    if (owned) {
      ctx.drawImage(icon(ic, canAfford ? 'n' : 'g'), x + 5, y + 6);
      if (cd > 0.05) {
        const step = clamp(Math.ceil(cd / maxCd * 24), 0, 24);
        ctx.drawImage(sweepMask(step), x + 1, y + 1);
        drawText(ctx, cd >= 10 ? String(Math.ceil(cd)) : cd.toFixed(1), x + S / 2, y + 9, { mini: true, color: PAL.A3, align: 'center' });
      }
      if (this.ready[id] > 0) {
        ctx.globalAlpha = this.ready[id] / 0.3;
        ctx.fillStyle = PAL.E6;
        ctx.fillRect(x, y, S, 1); ctx.fillRect(x, y + S - 1, S, 1); ctx.fillRect(x, y, 1, S); ctx.fillRect(x + S - 1, y, 1, S);
        ctx.globalAlpha = 1;
      }
    } else {
      ctx.drawImage(icon(ic, 'd'), x + 5, y + 6);
      ctx.drawImage(icon('lock'), x + 8, y + 9);
    }
    ctx.fillStyle = PAL.C0; ctx.fillRect(x + 1, y + 1, 5, 7);
    drawText(ctx, def.key, x + 2, y + 2, { mini: true, color: owned ? PAL.E5 : PAL.A1 });
  }
}
