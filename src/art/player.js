// KOR — üç sınıfın sprite'ları. Her sınıfın kendi silueti var:
//   baltaci: geniş omuz, kürk omuzluk, kızıl bere, sakal, sırtta sepet, elde büyük balta
//   okcu:    ince gövde, sivri kukuleta, uçuşan pelerin, sırtta sadak, elde yay
//   buyucu:  yere kadar cübbe, sivri şapka, ak sakal, ucunda kor yanan asa
// 28x32 kare, ayak noktası (14,29). Yönler: r (sağ), l (sağın aynası), d (ön), u (arka).
// Pozlar: idle0-1, walk0-3, wind (hazırlık), strike (darbe/bırakma), dash (atılma), hurt (hasar).
import { Pix, rotatePix, cached } from './pix.js';
import { PAL } from './palette.js';

export const PW = 28;
export const PH = 32;
export const PFOOT_X = 14;
export const PFOOT_Y = 29;
export const POSES = ['idle0', 'idle1', 'walk0', 'walk1', 'walk2', 'walk3', 'wind', 'strike', 'dash', 'hurt'];
export const CLASS_KEYS = ['baltaci', 'okcu', 'buyucu'];
// eski palet anahtarları (classes.js → palette) sınıf kimliğine çevrilir
const ALIAS = { ember: 'baltaci', moss: 'okcu', frost: 'buyucu' };
export const classKey = k => ALIAS[k] || (CLASS_KEYS.includes(k) ? k : 'baltaci');

const P = PAL;
const CX = 14, GY = 26, OY = 3;      // tasarım ızgarası 28x29; kareye OY kadar aşağı kopyalanır
const SKIN = P.N1, SKIN_D = P.N0;

function info(pose) {
  const walk = pose.startsWith('walk') ? +pose[4] : pose === 'dash' ? 0 : -1;
  const idle = pose.startsWith('idle') ? +pose[4] : -1;
  return {
    pose, walk, idle,
    bob: (walk === 1 || walk === 3) ? -1 : idle === 1 ? 1 : 0,
    lean: pose === 'wind' ? -1 : pose === 'strike' ? 1 : pose === 'dash' ? 2 : pose === 'hurt' ? -2 : 0,
    atk: pose === 'wind' || pose === 'strike',
  };
}

// ---- ortak bacaklar ----
function legsSide(p, ph, pants, pantsD, boot) {
  if (ph === 0 || ph === 2) {
    const a = ph === 0 ? pantsD : pants, b = ph === 0 ? pants : pantsD;
    p.rect(CX - 4, 22, 2, 4, a); p.rect(CX - 5, GY - 1, 1, 1, a); p.rect(CX - 5, GY, 3, 1, boot);
    p.rect(CX + 1, 22, 2, 4, b); p.rect(CX + 1, GY, 3, 1, boot);
  } else if (ph === 1 || ph === 3) {
    p.rect(CX - 2, 22, 2, 4, pantsD); p.rect(CX - 2, GY - 1, 3, 1, boot);
    p.rect(CX, 22, 2, 4, pants); p.rect(CX, GY, 3, 1, boot);
  } else {
    p.rect(CX - 3, 22, 2, 4, pantsD); p.rect(CX - 3, GY, 3, 1, boot);
    p.rect(CX, 22, 2, 4, pants); p.rect(CX, GY, 3, 1, boot);
  }
}
function legsFront(p, ph, pants, boot) {
  const l1 = ph === 0 ? 1 : 0, l2 = ph === 2 ? 1 : 0;
  p.rect(CX - 3, 21, 2, 5 - l1, pants); p.rect(CX - 3, GY - l1, 2, 1, boot);
  p.rect(CX + 1, 21, 2, 5 - l2, pants); p.rect(CX + 1, GY - l2, 2, 1, boot);
}
function weave(p, x0, y0, w, h) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p.set(x0 + x, y0 + y, (x + y) % 2 ? P.W3 : P.W4);
  p.rect(x0, y0, w, 1, P.W5); p.rect(x0, y0 + h - 1, w, 1, P.W2);
}

// =====================================================================
// BALTACI
// =====================================================================
function fur(p, x0, x1, y0, rows) {
  for (let j = 0; j < rows; j++) for (let x = x0; x <= x1; x++) {
    if (j === rows - 1 && (x + x0) % 2) continue;                    // püsküllü alt kenar
    if (j === 0 && (x === x0 || x === x1)) continue;
    p.set(x, y0 + j, j === 0 ? P.A3 : j === rows - 1 ? P.A1 : (x * 3 + j) % 4 === 0 ? P.A3 : P.A2);
  }
}
function bigAxe(p, hx, top, bot, side) {
  // sap + büyük ağız; side: +1 ağız sağa, -1 sola
  for (let y = top; y <= bot; y++) p.set(hx, y, (y - top) % 5 === 3 ? P.W3 : P.W4);
  const s = side;
  for (let j = -1; j <= 5; j++) {
    const w = j === -1 || j === 5 ? 2 : j === 0 || j === 4 ? 3 : 4;
    for (let i = 1; i <= w; i++) p.set(hx + s * i, top + j, i === w ? P.A3 : i === 1 ? P.A1 : P.S);
  }
  p.set(hx - s, top + 1, P.A1); p.set(hx - s, top + 2, P.A1);         // arka çıkıntı
  p.set(hx, top + 1, P.W2); p.set(hx, top + 3, P.W2);
}
function baltaci(p, dir, o) {
  const b = o.bob, L = dir === 'r' ? o.lean : 0, ph = o.walk;
  const T = P.E1, TD = P.E0, TL = P.E2;
  if (dir === 'r') {
    weave(p, 6 + (L < 0 ? -1 : 0), 13 + b, 4, 8);
    p.line(10, 14 + b, 11, 17 + b, P.W2);
    legsSide(p, ph, P.W2, P.W1, P.W0);
    for (let y = 14 + b; y <= 22; y++) {
      const t = (y - 14 - b) / (8 - b), sh = Math.round(L * (1 - t));
      for (let x = 10 + sh; x <= 18 + sh; x++) {
        if (y === 22 && (x + (ph < 0 ? 0 : ph)) % 3 === 0) continue;
        p.set(x, y, x >= 17 + sh ? TD : x <= 10 + sh ? TL : T);
      }
    }
    p.rect(10, 19, 9, 1, P.W1); p.set(15, 19, P.E4);
    fur(p, 8 + L, 19 + L, 12 + b, 4);
    // baş: kızıl bere, sakal
    const hx = 12 + L, hy = 4 + b;
    p.rect(hx + 1, hy + 3, 6, 5, SKIN);
    p.rect(hx, hy + 3, 2, 5, P.W2);                                     // ense saçı
    p.rect(hx + 1, hy, 6, 3, P.E2); p.rect(hx, hy + 1, 8, 2, P.E2); p.rect(hx + 2, hy, 3, 1, P.E3);
    p.rect(hx, hy + 3, 8, 1, P.E1); p.set(hx + 1, hy - 1, P.A3); p.set(hx + 2, hy - 1, P.A2);   // ponpon
    p.set(hx + 5, hy + 5, P.C0); p.set(hx + 7, hy + 6, SKIN); p.set(hx + 6, hy + 4, SKIN_D);
    p.rect(hx + 3, hy + 7, 5, 3, P.W3); p.rect(hx + 4, hy + 10, 4, 1, P.W3); p.rect(hx + 5, hy + 11, 2, 1, P.W2);
    p.rect(hx + 3, hy + 7, 1, 3, P.W2); p.set(hx + 7, hy + 9, P.W4); p.set(hx + 6, hy + 8, P.W4);
    if (o.atk) { p.rect(15 + L, 15 + b, 5, 2, SKIN); p.rect(15 + L, 17 + b, 4, 1, SKIN_D); p.rect(18 + L, 15 + b, 1, 2, P.W3); }
    else {
      const sway = ph === 0 ? 1 : ph === 2 ? -1 : 0;
      bigAxe(p, 20, 7 + b - sway, 22 + b - sway, 1);
      p.rect(16 + L, 15 + b, 2, 4, SKIN); p.rect(18, 17 + b, 3, 2, SKIN); p.rect(16 + L, 18 + b, 2, 1, P.W3);
      p.set(18, 19 + b, SKIN_D);
    }
  } else if (dir === 'd') {
    for (let y = 12 + b; y <= 18 + b; y++) { p.set(7, y, y % 2 ? P.W3 : P.W4); p.set(20, y, y % 2 ? P.W4 : P.W3); }
    p.set(7, 12 + b, P.W5); p.set(20, 12 + b, P.W5);
    legsFront(p, ph, P.W2, P.W0);
    for (let y = 15 + b; y <= 22; y++) for (let x = 10; x <= 18; x++) {
      if (y === 22 && (x + (ph < 0 ? 0 : ph)) % 3 === 0) continue;
      p.set(x, y, x >= 17 ? TD : x === 10 ? TL : T);
    }
    p.rect(10, 19, 9, 1, P.W1); p.rect(13, 19, 2, 1, P.E4);
    // kollar
    p.rect(8, 15 + b, 2, 5, SKIN); p.rect(8, 18 + b, 2, 1, P.W3); p.set(8, 15 + b, SKIN_D);
    if (o.atk) { p.rect(11, 16 + b, 7, 2, SKIN); p.rect(11, 18 + b, 7, 1, SKIN_D); p.rect(13, 16 + b, 3, 2, P.W3); }
    else {
      const sway = ph === 0 ? 1 : ph === 2 ? -1 : 0;
      bigAxe(p, 21, 8 + b - sway, 23 + b - sway, 1);
      p.rect(19, 15 + b, 2, 4, SKIN); p.rect(20, 18 + b, 2, 2, SKIN); p.set(19, 18 + b, P.W3);
    }
    fur(p, 8, 20, 12 + b, 4);
    const hy = 3 + b;
    p.rect(11, hy + 4, 7, 5, SKIN);
    p.rect(11, hy + 1, 7, 3, P.E2); p.rect(12, hy, 5, 1, P.E2); p.rect(12, hy + 1, 3, 1, P.E3);
    p.rect(11, hy + 4, 7, 1, P.E1); p.set(14, hy - 1, P.A3); p.set(15, hy - 1, P.A2);
    p.set(12, hy + 6, P.C0); p.set(16, hy + 6, P.C0); p.set(14, hy + 7, SKIN_D);
    p.rect(11, hy + 8, 7, 3, P.W3); p.rect(12, hy + 11, 5, 1, P.W3); p.rect(13, hy + 12, 3, 1, P.W2);
    p.rect(13, hy + 8, 3, 1, P.W2); p.set(11, hy + 9, P.W2); p.set(17, hy + 9, P.W2); p.set(17, hy + 10, P.W2);
  } else {
    legsFront(p, ph, P.W1, P.W0);
    for (let y = 15 + b; y <= 22; y++) for (let x = 10; x <= 18; x++) {
      if (y === 22 && (x + (ph < 0 ? 0 : ph)) % 3 === 0) continue;
      p.set(x, y, x >= 17 ? TD : T);
    }
    p.rect(8, 15 + b, 2, 5, SKIN_D); p.rect(19, 15 + b, 2, 5, SKIN_D);
    if (!o.atk) { const sway = ph === 0 ? 1 : ph === 2 ? -1 : 0; bigAxe(p, 6, 8 + b - sway, 23 + b - sway, -1); p.rect(6, 18 + b, 3, 2, SKIN_D); }
    else p.rect(11, 14 + b, 7, 2, SKIN_D);
    fur(p, 8, 20, 12 + b, 4);
    const hy = 3 + b;
    p.rect(11, hy + 1, 7, 4, P.E2); p.rect(12, hy, 5, 1, P.E2); p.rect(11, hy + 4, 7, 1, P.E1);
    p.set(14, hy - 1, P.A3); p.set(15, hy - 1, P.A2);
    p.rect(11, hy + 5, 7, 4, P.W2); p.rect(12, hy + 5, 5, 3, P.W3);
    weave(p, 10, 13 + b, 9, 8); p.rect(10, 17 + b, 9, 1, P.W2);
  }
}

// =====================================================================
// OKÇU
// =====================================================================
function restBow(p, x, top, side) {
  // dik duran yay: sırtı side yönüne bakar, kiriş iç tarafta
  const prof = [0, 1, 2, 2, 3, 3, 3, 3, 3, 3, 3, 2, 2, 1, 0];
  for (let i = 0; i < prof.length; i++) {
    p.set(x + side * prof[i], top + i, i === 0 || i === prof.length - 1 ? P.A3 : i % 4 === 1 ? P.W5 : P.W4);
    if (i > 0 && i < prof.length - 1 && prof[i] > 0) p.set(x, top + i, P.A1);
  }
  p.set(x + side * 3, top + 7, P.W2);                                   // kabza sargısı
}
function okcu(p, dir, o) {
  const b = o.bob, L = dir === 'r' ? o.lean : 0, ph = o.walk;
  const H = P.G2, HD = P.G1, HL = P.G3, HK = P.G0;
  const flut = ph === 1 || ph === 3 ? 1 : 0, dashy = o.pose === 'dash' ? 2 : 0;
  if (dir === 'r') {
    // pelerin (arkada uçuşur)
    for (let y = 13 + b; y <= 22; y++) {
      const t = (y - 13 - b) / 9;
      const x0 = Math.round(11 - t * (2.2 + flut + dashy * 1.4) + L * (1 - t));
      for (let x = x0; x <= 12; x++) { if (y === 22 && (x + flut) % 2) continue; p.set(x, y, x === x0 ? HK : HD); }
    }
    // sadak ve oklar
    p.rect(9 + L, 12 + b, 2, 7, P.W4); p.rect(9 + L, 12 + b, 1, 7, P.W3); p.rect(9 + L, 12 + b, 2, 1, P.W5); p.set(10 + L, 18 + b, P.W2);
    p.set(9 + L, 11 + b, P.A2); p.set(9 + L, 10 + b, P.A2); p.set(8 + L, 9 + b, P.R); p.set(9 + L, 9 + b, P.A3);
    p.set(10 + L, 11 + b, P.A2); p.set(10 + L, 10 + b, P.A3); p.set(11 + L, 9 + b, P.R);
    legsSide(p, ph, P.W3, P.W2, P.W0);
    for (let y = 14 + b; y <= 21; y++) {
      const t = (y - 14 - b) / (7 - b), sh = Math.round(L * (1 - t));
      for (let x = 12 + sh; x <= 16 + sh + (y >= 20 ? 1 : 0); x++) p.set(x, y, x >= 16 + sh ? HD : x === 12 + sh ? HL : H);
    }
    p.rect(12, 19, 5, 1, P.W1); p.set(15, 19, P.G5);
    // kukuleta
    const hx = 14.5 + L, hy = 9 + b;
    p.ellipse(hx, hy, 4.1, 4.2, (nx, ny) => (nx * -0.6 + ny * -0.8 > 0.4 ? HL : nx > 0.5 || ny > 0.62 ? HD : H));
    p.set(10 + L, 6 + b, H); p.set(9 + L, 5 + b, H); p.set(8 + L, 5 + b, HD); p.set(10 + L, 5 + b, HL); p.set(9 + L, 4 + b, HL);
    p.rect(15 + L, 8 + b, 4, 3, SKIN); p.set(15 + L, 8 + b, HK); p.set(15 + L, 9 + b, HK); p.set(15 + L, 10 + b, SKIN_D);
    p.set(17 + L, 9 + b, P.C0); p.rect(15 + L, 11 + b, 4, 1, P.G5); p.set(19 + L, 10 + b, SKIN);
    p.set(16 + L, 6 + b, P.G5); p.set(17 + L, 7 + b, P.G5); p.set(18 + L, 7 + b, P.G5);
    if (o.atk) {
      p.rect(15 + L, 15 + b, 5, 2, HD); p.set(20 + L, 15 + b, SKIN); p.set(20 + L, 16 + b, SKIN);
      if (o.pose === 'wind') { p.rect(12 + L, 15 + b, 3, 1, HL); p.set(11 + L, 15 + b, SKIN); }
    } else {
      const sway = ph === 0 ? 1 : ph === 2 ? -1 : 0;
      restBow(p, 18, 8 + b - sway, 1);
      p.rect(15 + L, 15 + b, 2, 2, HD); p.rect(17 + L, 15 + b - sway, 2, 2, HD); p.set(19, 15 + b - sway, SKIN); p.set(20, 15 + b - sway, SKIN);
    }
  } else if (dir === 'd') {
    // sadak omuz üstünden görünür
    p.set(9, 8 + b, P.R); p.set(10, 7 + b, P.A3); p.set(9, 9 + b, P.A2); p.set(10, 8 + b, P.A2); p.set(10, 9 + b, P.A2); p.rect(9, 10 + b, 2, 3, P.W4);
    for (let y = 13 + b; y <= 22; y++) {
      const w = 1 + ((y - 13 - b) >> 2) + (y > 19 ? flut + dashy : 0);
      for (let i = 0; i < w; i++) { p.set(10 - i, y, i === w - 1 ? HK : HD); p.set(18 + i, y, i === w - 1 ? HK : HD); }
    }
    legsFront(p, ph, P.W3, P.W0);
    for (let y = 14 + b; y <= 21; y++) for (let x = 11; x <= 17; x++) p.set(x, y, x >= 16 ? HD : x === 11 ? HL : H);
    p.rect(11, 19, 7, 1, P.W1); p.set(14, 19, P.G5);
    p.line(11, 14 + b, 16, 18 + b, P.W4);                               // sadak kayışı
    const hy = 9 + b;
    p.ellipse(14.5, hy, 4.6, 4.5, (nx, ny) => (nx * -0.6 + ny * -0.8 > 0.4 ? HL : nx > 0.55 || ny > 0.65 ? HD : H));
    p.set(14, hy - 5, H); p.set(15, hy - 5, HD);
    p.rect(12, hy - 1, 5, 3, SKIN); p.rect(12, hy - 2, 5, 1, HK); p.set(13, hy, P.C0); p.set(15, hy, P.C0);
    p.rect(12, hy + 2, 5, 1, P.G5); p.rect(12, hy + 1, 5, 1, SKIN_D);
    if (o.atk) { p.rect(10, 15 + b, 9, 2, HD); p.rect(13, 16 + b, 3, 1, SKIN); }
    else {
      const sway = ph === 0 ? 1 : ph === 2 ? -1 : 0;
      p.rect(9, 14 + b, 2, 4, HD); p.set(9, 18 + b, SKIN);
      restBow(p, 20, 9 + b - sway, 1);
      p.rect(18, 14 + b, 2, 3, HD); p.rect(20, 16 + b - sway, 2, 1, SKIN);
    }
  } else {
    legsFront(p, ph, P.W2, P.W0);
    if (!o.atk) { const sway = ph === 0 ? 1 : ph === 2 ? -1 : 0; restBow(p, 8, 9 + b - sway, -1); p.rect(7, 16 + b - sway, 2, 1, SKIN_D); }
    else p.rect(10, 14 + b, 9, 2, HD);
    for (let y = 13 + b; y <= 22; y++) {
      const w = 4 + ((y - 13 - b) / 4 | 0) + (y > 19 ? flut : 0);
      for (let x = 14 - w; x <= 14 + w; x++) {
        if (y === 22 && (x + flut) % 3 === 0) continue;
        p.set(x, y, x === 14 - w || x === 14 + w ? HK : (x === 12 || x === 16) && y > 15 ? HD : H);
      }
    }
    const hy = 9 + b;
    p.ellipse(14.5, hy, 4.6, 4.5, (nx, ny) => (ny < -0.5 ? HL : nx > 0.55 || ny > 0.6 ? HD : H));
    p.set(14, hy - 5, H); p.set(15, hy - 5, HD); p.line(14, hy - 2, 14, hy + 3, HD);
    // sırtta çapraz sadak
    for (let i = 0; i < 7; i++) { p.set(11 + i, 20 + b - i, P.W4); p.set(12 + i, 20 + b - i, P.W3); }
    p.set(18, 13 + b, P.W5); p.set(19, 12 + b, P.A2); p.set(20, 11 + b, P.A3); p.set(19, 11 + b, P.R); p.set(20, 12 + b, P.A2); p.set(21, 10 + b, P.R);
  }
}

// =====================================================================
// BÜYÜCÜ
// =====================================================================
const TIPS = new Map();      // asa ucu (kor) konumu: dir+pose → [x, y] (kare koordinatı)
function staff(p, x0, y0, x1, y1, big, key) {
  // (x0,y0) alt uç, (x1,y1) korun merkezi
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) {
    const t = i / Math.max(1, n);
    p.set(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), i % 5 === 2 ? P.W3 : P.W4);
  }
  // kıvrık baş + kor
  const cx = x1, cy = y1;
  p.set(cx - 1, cy + 1, P.W4); p.set(cx - 2, cy, P.W4); p.set(cx - 2, cy - 1, P.W3); p.set(cx - 1, cy - 2, P.W4); p.set(cx, cy - 2, P.W4); p.set(cx + 1, cy - 2, P.W3);
  p.set(cx + 2, cy - 1, P.W4); p.set(cx + 2, cy, P.W3);
  p.rect(cx - 1, cy - 1, 3, 2, P.E3); p.set(cx, cy - 1, P.E5); p.set(cx, cy, P.E4); p.set(cx + 1, cy - 1, P.E4);
  if (big) {
    p.rect(cx - 1, cy - 1, 3, 3, P.E4); p.rect(cx, cy - 1, 2, 2, P.E5); p.set(cx, cy, P.E6);
    p.set(cx - 3, cy - 3, P.E4); p.set(cx + 3, cy - 2, P.E3); p.set(cx + 1, cy - 4, P.E5); p.set(cx + 3, cy + 1, P.E4);
  }
  TIPS.set(key, [cx, cy + OY]);
}
function hat(p, cx, y, dir) {
  // y: kenarlık satırı. Uç arkaya kıvrılır.
  const C = P.C3, CL = P.C4, CD = P.C2;
  p.rect(cx - 5, y, 11, 1, CD); p.rect(cx - 4, y - 1, 9, 1, C); p.rect(cx - 4, y - 1, 3, 1, CL);
  p.rect(cx - 3, y - 2, 7, 1, P.V); p.set(cx + 3, y - 2, P.C4);                                  // bant
  if (dir !== 'u') p.set(cx + (dir === 'r' ? 2 : 0), y - 2, P.E5);                               // kor tokası
  const rows = dir === 'r' ? [[-3, 3], [-3, 2], [-3, 1], [-4, 0], [-5, -2], [-6, -4]] : [[-3, 3], [-2, 3], [-2, 2], [-1, 2], [0, 3], [2, 4]];
  rows.forEach(([a, bb], i) => {
    for (let x = cx + a; x <= cx + bb; x++) p.set(x, y - 3 - i, x === cx + a ? CL : x === cx + bb && i < 4 ? CD : C);
  });
}
function buyucu(p, dir, o) {
  const b = o.bob, L = dir === 'r' ? o.lean : 0, ph = o.walk;
  const R0 = P.C3, RL = P.C4, RD = P.C2;
  const sw = ph === 0 ? 1 : ph === 2 ? -1 : 0;
  const key = dir + o.pose;
  if (dir === 'r') {
    for (let y = 13 + b; y <= GY; y++) {
      const t = (y - 13 - b) / (13 - b), sh = Math.round(L * (1 - t) + sw * t);
      const x0 = Math.round(12 - t * 2.4) + sh, x1 = Math.round(16 + t * 2.6) + sh;
      for (let x = x0; x <= x1; x++) {
        let c = x >= x1 - 1 ? RD : x === x0 ? RL : R0;
        if (y === GY) c = (x + (ph < 0 ? 0 : ph)) % 2 ? P.F : P.C4;
        else if (y === GY - 1) c = P.V;
        p.set(x, y, c);
      }
    }
    for (let y = 16 + b; y <= GY - 2; y++) p.set(13 + Math.round(L * (1 - (y - 13) / 13)), y, RD);    // kıvrım
    p.rect(11, 19, 8, 1, P.V); p.set(16, 19, P.E4); p.set(16, 20, P.V); p.set(16, 21, P.V);
    if (ph === 0) p.rect(18 + sw, GY, 2, 1, P.W0); else if (ph === 2) p.rect(9, GY, 2, 1, P.W0);
    // baş
    const hx = 14 + L, hy = 9 + b;
    p.rect(hx, hy, 4, 3, SKIN); p.set(hx, hy, SKIN_D); p.set(hx + 2, hy + 1, P.C0); p.set(hx + 4, hy + 1, SKIN); p.rect(hx - 1, hy, 1, 3, P.A2);
    const br = [[0, 4], [0, 4], [0, 3], [1, 3], [1, 2], [2, 2]];
    br.forEach(([a, bb], i) => { for (let x = hx + a; x <= hx + bb; x++) p.set(x, hy + 2 + i, x === hx + a ? P.A2 : P.A3); });
    hat(p, hx + 1, hy - 1, 'r');
    // kol + asa
    if (o.pose === 'wind') {
      staff(p, 18 + L, 22 + b, 20 + L, 3 + b, true, key);
      p.rect(15 + L, 14 + b, 4, 3, RL); p.rect(15 + L, 16 + b, 4, 1, RD); p.set(19 + L, 13 + b, SKIN); p.set(19 + L, 14 + b, SKIN);
    } else if (o.pose === 'strike') {
      staff(p, 15 + L, 21 + b, 25, 9 + b, true, key);
      p.rect(15 + L, 15 + b, 5, 3, RL); p.rect(15 + L, 17 + b, 5, 1, RD); p.set(20 + L, 15 + b, SKIN); p.set(20 + L, 16 + b, SKIN);
    } else {
      staff(p, 21, GY + b - Math.abs(sw), 21, 5 + b - Math.abs(sw), false, key);
      p.rect(15 + L, 15 + b, 4, 3, RL); p.rect(15 + L, 17 + b, 4, 1, RD); p.rect(19 + L, 15 + b, 2, 2, SKIN); p.set(21, 15 + b, SKIN_D);
    }
  } else {
    const back = dir === 'u';
    for (let y = 13 + b; y <= GY; y++) {
      const t = (y - 13 - b) / (13 - b);
      const hw = Math.round(3.6 + t * 2.6);
      for (let x = 14 - hw + (sw < 0 ? -1 : 0); x <= 14 + hw + (sw > 0 ? 1 : 0); x++) {
        let c = x >= 14 + hw - 1 ? RD : x <= 14 - hw && !back ? RL : R0;
        if (y === GY) c = (x + (ph < 0 ? 0 : ph)) % 2 ? P.F : P.C4;
        else if (y === GY - 1) c = P.V;
        p.set(x, y, c);
      }
    }
    if (!back) {
      for (let y = 16 + b; y <= GY - 2; y++) p.set(14, y, RD);
      p.rect(10, 19, 9, 1, P.V); p.set(14, 19, P.E4);
    } else { for (let y = 15 + b; y <= GY - 2; y++) { p.set(12, y, RD); p.set(16, y, RD); } p.rect(10, 19, 9, 1, P.V); }
    const hy = 9 + b;
    if (!back) {
      p.rect(12, hy, 5, 3, SKIN); p.set(13, hy + 1, P.C0); p.set(15, hy + 1, P.C0);
      const br = [[11, 17], [11, 17], [12, 16], [12, 16], [13, 15], [13, 15], [14, 14]];
      br.forEach(([a, bb], i) => { for (let x = a; x <= bb; x++) p.set(x, hy + 2 + i, x === a || x === bb ? P.A2 : P.A3); });
      p.set(14, hy + 2, SKIN_D);
    } else { p.rect(11, hy, 7, 3, P.A2); p.rect(12, hy, 5, 4, P.A3); p.set(14, hy + 4, P.A2); }
    hat(p, 14, hy - 1, dir);
    const sx = back ? 5 : 22, hs = back ? 1 : -1;
    if (o.pose === 'wind') {
      staff(p, sx, 22 + b, sx, 2 + b, true, key);
      p.rect(back ? 7 : 18, 13 + b, 3, 3, RL); p.set(sx + hs, 13 + b, SKIN);
    } else if (o.pose === 'strike') {
      const ty = back ? 6 : 15, tx = back ? 9 : 19;
      staff(p, tx, back ? 20 + b : 23 + b, tx, ty + b, true, key);
      p.rect(back ? 9 : 16, 15 + b, 4, 3, RL); p.set(tx, 17 + b, SKIN);
    } else {
      staff(p, sx, GY + b - Math.abs(sw), sx, 5 + b - Math.abs(sw), false, key);
      p.rect(back ? 7 : 18, 15 + b, 3, 3, RL); p.rect(back ? 7 : 18, 17 + b, 3, 1, RD); p.rect(back ? 5 : 21, 16 + b, 2, 2, back ? SKIN_D : SKIN);
      p.rect(back ? 19 : 8, 15 + b, 2, 4, back ? RD : RL); if (!back) p.set(8, 19 + b, SKIN);
    }
  }
}

const DRAW = { baltaci, okcu, buyucu };

export function playerPix(dir, pose, cls = 'baltaci') {
  const g = new Pix(PW, PH - OY);
  DRAW[classKey(cls)](g, dir === 'l' ? 'r' : dir, info(pose));
  const p = new Pix(PW, PH);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) { const c = g.d[y * g.w + x]; if (c) p.set(x, y + OY, c); }
  p.outline(PAL.C0);
  return p;
}

// büyücünün asa ucundaki korun kare içi konumu (parıltı çizimi için); l yönünde aynalanır
export function staffTip(dir, pose) {
  const d = dir === 'l' ? 'r' : dir, k = d + pose;
  if (!TIPS.has(k)) playerPix(d, pose, 'buyucu');
  const t = TIPS.get(k) || [21, 8];
  return dir === 'l' ? [PW - 1 - t[0], t[1]] : t;
}

// sırtta taşınan odun (taşırken) — ayrı katman, sınıfa göre yeri değişir
export function basketLogs(dir, cls = 'baltaci') {
  const ck = classKey(cls);
  return cached('blog' + dir + ck, PW, PH, (x) => {
    const p = new Pix(PW, PH);
    const d = dir === 'l' ? 'r' : dir;
    const lg = (lx, ly, w, a) => { p.rect(lx, ly, w, 2, a ? P.W4 : P.W5); p.set(lx, ly, P.W3); p.set(lx + w - 1, ly + 1, P.W3); };
    if (ck === 'baltaci') {
      if (d === 'r') { lg(5, 13, 3, 0); lg(7, 12, 3, 1); lg(6, 15, 4, 0); }
      else if (d === 'u') { for (let i = 0; i < 4; i++) lg(10 + i * 2, 13 + (i % 2), 3, i % 2); }
      else { lg(6, 13, 2, 0); lg(20, 13, 2, 1); }
    } else {
      // okçu / büyücü: sırtta iple bağlı küçük demet
      const oy = ck === 'buyucu' ? 2 : 3;
      if (d === 'r') { lg(7, 14 + oy, 4, 0); lg(6, 16 + oy, 4, 1); p.set(9, 15 + oy, P.A1); }
      else if (d === 'u') { lg(10, 14 + oy, 9, 0); lg(11, 16 + oy, 8, 1); p.rect(14, 14 + oy, 1, 4, P.A1); }
      else { lg(8, 15 + oy, 2, 0); lg(19, 15 + oy, 2, 1); }
    }
    p.outline(PAL.C0);
    (dir === 'l' ? p.mirror() : p).drawTo(x);
  });
}

const GHOST = { baltaci: [P.E3, P.E2], okcu: [P.G5, P.G4], buyucu: [P.F, P.C4] };
const frameTable = new Map();
// playerFrame(dir, pose, variant, cls): variant 'n' normal, 'f' beyaz flaş, 'g' atılma hayaleti.
// cls: sınıf kimliği ya da eski palet anahtarı ('ember' | 'moss' | 'frost').
export function playerFrame(dir, pose, variant = 'n', cls = 'baltaci') {
  const ck = classKey(cls);
  const k = dir + pose + variant + ck;
  let c = frameTable.get(k);
  if (c) return c;
  c = cached('pf' + k, PW, PH, (x) => {
    let p = playerPix(dir, pose, ck);
    if (dir === 'l') p = p.mirror();
    if (variant === 'f') p = p.silhouette(PAL.A3);
    else if (variant === 'g') { const gc = GHOST[ck]; p = p.map((c2, px, py) => ((px + py) % 2 ? gc[0] : gc[1])); }
    p.drawTo(x);
  });
  frameTable.set(k, c);
  return c;
}

// eski API uyumu: playerFrames() → yürüme kareleri (sağ)
export function playerFrames() {
  return { 0: playerFrame('r', 'walk0'), 1: playerFrame('r', 'walk1'), 2: playerFrame('r', 'walk2'), 3: playerFrame('r', 'walk3') };
}

// balta: kabza ucu çevresinde döndürülmüş 32 kare, 32x32, kabza merkezde (16,16)
const AXE_STEPS = 32;
function axeBase() {
  const p = new Pix(20, 18);
  p.line(1, 9, 13, 9, P.W4); p.line(1, 10, 13, 10, P.W3);
  p.rect(12, 4, 3, 11, P.S); p.rect(13, 3, 2, 13, P.S);
  p.rect(15, 3, 1, 13, P.A3); p.set(16, 4, P.A3); p.set(16, 14, P.A3); p.rect(16, 5, 1, 9, P.E6);
  p.rect(12, 5, 1, 9, P.A1);
  p.set(11, 8, P.A1); p.set(11, 11, P.A1);
  p.outline(PAL.C0);
  return p;
}
let AXE_SRC = null;
export const AXE_SIZE = 32;
export function axeFrame(ang) {
  const a = ((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const i = Math.round(a / (Math.PI * 2) * AXE_STEPS) % AXE_STEPS;
  return cached('axe' + i, AXE_SIZE, AXE_SIZE, (x) => {
    if (!AXE_SRC) AXE_SRC = axeBase();
    rotatePix(AXE_SRC, i / AXE_STEPS * Math.PI * 2, AXE_SIZE, 2, 9.5).drawTo(x);
  });
}

// yay: nişan yönüne dönük 32 açı x 2 durum (drawn: gerili + ok takılı; değilse bırakılmış). 32x32, merkez (16,16)
export const BOW_SIZE = 32;
export function bowFrame(ang, drawn) {
  const a = ((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const i = Math.round(a / (Math.PI * 2) * 32) % 32;
  return cached('bow' + i + (drawn ? 'd' : 'r'), BOW_SIZE, BOW_SIZE, (x) => {
    const p = new Pix(BOW_SIZE, BOW_SIZE);
    const th = i / 32 * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
    const R = (lx, ly) => [Math.round(15.5 + lx * c - ly * s), Math.round(15.5 + lx * s + ly * c)];
    const seg = (ax, ay, bx, by, col) => { const A = R(ax, ay), B = R(bx, by); p.line(A[0], A[1], B[0], B[1], col); };
    const limb = drawn ? [[1, -9], [4, -7], [6, -4], [7, 0], [6, 4], [4, 7], [1, 9]] : [[2, -10], [5, -8], [7, -4], [8, 0], [7, 4], [5, 8], [2, 10]];
    const tipA = limb[0], tipB = limb[limb.length - 1];
    if (drawn) { seg(tipA[0], tipA[1], -4, 0, P.A2); seg(-4, 0, tipB[0], tipB[1], P.A2); seg(-4, 0, 9, 0, P.W5); seg(10, 0, 11, 0, P.A3); const f = R(-5, 0); p.set(f[0], f[1], P.R); }
    else seg(tipA[0], tipA[1], tipB[0], tipB[1], P.A2);
    for (let k = 0; k < limb.length - 1; k++) seg(limb[k][0], limb[k][1], limb[k + 1][0], limb[k + 1][1], k === 2 || k === 3 ? P.W5 : P.W4);
    const g0 = R(7, 0); p.set(g0[0], g0[1], P.W2);
    const ta = R(tipA[0], tipA[1]), tb = R(tipB[0], tipB[1]); p.set(ta[0], ta[1], P.A3); p.set(tb[0], tb[1], P.A3);
    p.outline(PAL.C0);
    p.drawTo(x);
  });
}
