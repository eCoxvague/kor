// KOR — vuruş/yetenek efekt sprite'ları: darbe kıvılcımı, ok, kor küresi, alev hilali, gövde çentikleri,
// patlama diski, buz kristali. Hepsi sabit sayıda anahtarla önbelleklenir (zaman/konum anahtarı yok).
import { Pix, cached } from './pix.js';
import { PAL, bayer } from './palette.js';

const P = PAL;
export const TONES = {
  hot: [P.E6, P.E5, P.E4, P.E3, P.E1],
  fire: [P.E6, P.E5, P.E4, P.E3, P.E1],
  steel: [P.A3, P.S, P.A2, P.C4, P.C3],
  frost: [P.A3, P.F, P.F, P.C4, P.C3],
  moss: [P.A3, P.G5, P.G4, P.G3, P.G2],
  ash: [P.A3, P.A2, P.A1, P.A0, P.C3],
  gold: [P.E6, P.E5, P.E4, P.W5, P.W3],
};
export const tone = t => TONES[t] || TONES.hot;

// darbe kıvılcımı: 2 kare (0 büyük yıldız, 1 sönen), 15x15, merkez (7,7)
export function impactSprite(frame, t = 'hot') {
  return cached('imp' + frame + t, 15, 15, (x) => {
    const c = tone(t), p = new Pix(15, 15);
    if (frame === 0) {
      for (let i = 1; i <= 6; i++) { const col = i < 4 ? c[0] : c[1]; p.set(7 + i, 7, col); p.set(7 - i, 7, col); p.set(7, 7 + i, col); p.set(7, 7 - i, col); }
      for (let i = 1; i <= 3; i++) { const col = i < 2 ? c[0] : c[2]; p.set(7 + i, 7 + i, col); p.set(7 - i, 7 - i, col); p.set(7 + i, 7 - i, col); p.set(7 - i, 7 + i, col); }
      p.rect(5, 6, 5, 3, c[0]); p.rect(6, 5, 3, 5, c[0]);
    } else {
      for (let i = 2; i <= 4; i++) { p.set(7 + i, 7, c[2]); p.set(7 - i, 7, c[2]); p.set(7, 7 + i, c[2]); p.set(7, 7 - i, c[2]); }
      p.set(9, 9, c[3]); p.set(5, 5, c[3]); p.set(9, 5, c[3]); p.set(5, 9, c[3]);
      p.rect(6, 7, 3, 1, c[1]); p.rect(7, 6, 1, 3, c[1]);
    }
    p.drawTo(x);
  });
}

// ok: 16 açı. kind: 'arrow' | 'fire' (alevli uç) | 'lance' (uzun, parlak). 24x24, uç merkezde (12,12)
export function arrowSprite(ang, kind = 'arrow') {
  const a = ((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const i = Math.round(a / (Math.PI * 2) * 16) % 16;
  return cached('arw' + i + kind, 24, 24, (x) => {
    const p = new Pix(24, 24), th = i / 16 * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
    const len = kind === 'lance' ? 11 : 8;
    const at = d => [Math.round(12 - c * d), Math.round(12 - s * d)];
    for (let d = 0; d <= len; d++) {
      const [px, py] = at(d);
      let col = kind === 'lance' ? (d < 3 ? P.E6 : d < 7 ? P.E5 : P.E4) : d < 2 ? (kind === 'fire' ? P.E4 : P.S) : d >= len - 1 ? P.A3 : P.W5;
      if (d === 0) col = kind === 'fire' ? P.E6 : kind === 'lance' ? P.E6 : P.A3;
      p.set(px, py, col);
    }
    // tüy
    const [fx, fy] = at(len);
    p.set(Math.round(fx - s), Math.round(fy + c), kind === 'lance' ? P.E3 : P.R);
    p.set(Math.round(fx + s), Math.round(fy - c), kind === 'lance' ? P.E3 : P.R);
    p.outline(P.C0);
    p.drawTo(x);
  });
}

// kor küresi: 4 kare titreme. 11x11, merkez (5,5)
export function orbSprite(frame, t = 'fire') {
  const f = frame & 3;
  return cached('orb' + f + t, 11, 11, (x) => {
    const c = tone(t), p = new Pix(11, 11);
    p.ellipse(5.5, 5.5, 4.2, 4.2, (nx, ny) => {
      const d = Math.hypot(nx + 0.15, ny + 0.2);
      return d < 0.34 ? c[0] : d < 0.62 ? c[1] : d < 0.86 ? c[2] : c[3];
    });
    const fl = [[1, 2], [9, 3], [2, 9], [8, 8]][f], fl2 = [[9, 7], [3, 1], [8, 1], [1, 6]][f];
    p.set(fl[0], fl[1], c[2]); p.set(fl2[0], fl2[1], c[3]);
    p.outline(c[4]);
    p.drawTo(x);
  });
}

// alev hilali (kor dalgası): 16 açı, 20x20, merkez (10,10)
export function crescentSprite(ang, t = 'fire') {
  const a = ((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const i = Math.round(a / (Math.PI * 2) * 16) % 16;
  return cached('crs' + i + t, 20, 20, (x) => {
    const c = tone(t), p = new Pix(20, 20), th = i / 16 * Math.PI * 2;
    for (let y = 0; y < 20; y++) for (let xx = 0; xx < 20; xx++) {
      const dx = xx + 0.5 - 10, dy = y + 0.5 - 10;
      const lx = dx * Math.cos(th) + dy * Math.sin(th), ly = -dx * Math.sin(th) + dy * Math.cos(th);
      const d1 = Math.hypot(lx + 4, ly), d2 = Math.hypot(lx + 8.5, ly * 0.9);
      if (d1 > 8.5 || d2 < 8.6 || lx < -1.5) continue;
      const k = (8.5 - d1) / 3.2;
      p.set(xx, y, k < 0.3 ? c[0] : k < 0.6 ? c[1] : k < 0.85 ? c[2] : c[3]);
    }
    p.outline(c[4]);
    p.drawTo(x);
  });
}

// gövde çentiği: stage 1..3, dir = vuruş yönü (+1: darbe soldan gelir, çentik gövdenin solunda açılır)
const TRUNK_W = { birch: 4, oak: 8, iron: 5, ember: 9 };
const FRESH = { birch: [P.E5, P.A3], oak: [P.E5, P.W5], iron: [P.A3, P.S], ember: [P.E5, P.E3] };
export const notchInfo = type => ({ w: TRUNK_W[type] || 6, h: 9 });
export function notchSprite(type, stage, dir) {
  const w = (TRUNK_W[type] || 6) + 4, h = 9, st = Math.max(1, Math.min(3, stage | 0));
  return cached('ntc' + type + st + (dir > 0 ? 'r' : 'l'), w, h, (x) => {
    const p = new Pix(w, h), tw = TRUNK_W[type] || 6, fr = FRESH[type] || FRESH.oak;
    const depth = Math.max(2, Math.round(tw * (st === 1 ? 0.5 : st === 2 ? 0.75 : 0.95)));
    const hh = st === 1 ? 1 : st === 2 ? 2 : 3;
    for (let j = -hh; j <= hh; j++) {
      const d = Math.max(1, Math.round(depth * (1 - Math.abs(j) / (hh + 1))));
      for (let i = 0; i < d; i++) {
        const col = j < 0 ? (i === 0 && j === -1 ? fr[1] : P.W0) : j === 0 ? (i === d - 1 ? P.W0 : fr[1]) : fr[0];
        p.set(2 + i, 4 + j, col);
      }
    }
    if (st >= 2) { p.set(1, 4 + hh, fr[0]); p.set(0, 5 + hh > h - 1 ? h - 1 : 5 + hh, fr[1]); }           // kıymık
    if (st === 3) {
      // yukarı yürüyen çatlak + karşı tarafta kalan ince bağ
      p.set(2 + depth - 1, 1, P.W0); p.set(2 + depth - 2, 0, P.W0); p.set(2 + depth - 1, 2, P.W0);
      p.set(2 + depth, 5, P.W0); p.set(1, 3 - hh, fr[0]);
    }
    (dir > 0 ? p : p.mirror()).drawTo(x);
  });
}

// patlama çekirdeği: dither'lı dolu disk. r 4px adımla kademelenir (en çok 36 boy x ton)
export function discSprite(rIn, t = 'fire', dense = 1) {
  const r = Math.max(4, Math.min(144, Math.round(rIn / 4) * 4)), dk = dense >= 1 ? 2 : dense >= 0.5 ? 1 : 0;
  return cached('dsc' + r + t + dk, r * 2, r * 2, (x) => {
    const c = tone(t), p = new Pix(r * 2, r * 2);
    for (let y = 0; y < r * 2; y++) for (let xx = 0; xx < r * 2; xx++) {
      const d = Math.hypot(xx + 0.5 - r, y + 0.5 - r) / r;
      if (d >= 1) continue;
      const b = bayer(xx, y);
      if (dk === 2) p.set(xx, y, d < 0.45 ? c[0] : d < 0.7 ? (b < 0.5 ? c[0] : c[1]) : d < 0.88 ? c[2] : (b < 0.6 ? c[3] : null));
      else if (dk === 1) { if (b < 0.55 - d * 0.3) p.set(xx, y, d < 0.6 ? c[2] : c[3]); }
      else if (b < 0.2 + (d > 0.9 ? 0.25 : 0)) p.set(xx, y, d > 0.86 ? c[3] : c[4]);
    }
    p.drawTo(x);
  });
}

// buz kristali: 3 boy, 7x9
export function crystalSprite(v) {
  const k = ((v % 3) + 3) % 3;
  return cached('cry' + k, 7, 9, (x) => {
    const p = new Pix(7, 9);
    const rows = [['..C..', '.CfC.', '.fff.', 'CfbfC', '.fbf.', '.bbb.', '..b..'], ['.C.', 'CfC', 'fff', 'fbf', '.b.'], ['C', 'f', 'f', 'b']][k];
    p.grid(rows, k === 0 ? 1 : k === 1 ? 2 : 3, k === 0 ? 1 : 2, { C: P.A3, f: P.F, b: P.C4 });
    p.outline(P.C2);
    p.drawTo(x);
  });
}

// küçük alev dili: 3 kare, 5x7
export function tongueSprite(f, t = 'fire') {
  const k = ((f % 3) + 3) % 3;
  return cached('tng' + k + t, 5, 7, (x) => {
    const c = tone(t), p = new Pix(5, 7);
    const rows = [['..1..', '..2..', '.121.', '.202.', '32023', '.303.', '..3..'], ['.1...', '.2...', '.21..', '1202.', '32023', '.303.', '..3..'], ['...1.', '...2.', '..12.', '.2021', '32023', '.303.', '..3..']][k];
    p.grid(rows, 0, 0, { 0: c[0], 1: c[2], 2: c[1], 3: c[3] });
    p.drawTo(x);
  });
}

// meteor: 13x13 kızgın kaya
export function meteorSprite() {
  return cached('meteor', 13, 13, (x) => {
    const p = new Pix(13, 13);
    p.ellipse(6.5, 6.5, 5.2, 5.2, (nx, ny) => {
      const d = Math.hypot(nx, ny), l = nx * 0.6 + ny * 0.8;
      return d > 0.8 ? (l > 0 ? P.E5 : P.E2) : l > 0.35 ? P.E6 : l > -0.1 ? P.E4 : l > -0.5 ? P.E1 : P.W1;
    });
    p.set(4, 4, P.W0); p.set(5, 6, P.W1); p.set(7, 4, P.W0);
    p.outline(P.E0);
    p.drawTo(x);
  });
}

// toz bulutu: toprak renkli küçük öbek (devrilme / sıçrama), 1..4 boy
export function dustPuff(size) {
  const s = Math.max(1, Math.min(4, size | 0));
  return cached('dst' + s, s + 3, s + 2, (x) => {
    const p = new Pix(s + 3, s + 2);
    p.ellipse((s + 3) / 2, (s + 2) / 2, (s + 3) / 2, (s + 2) / 2, (nx, ny) => (ny < -0.2 ? P.A2 : nx + ny < 0.2 ? P.A1 : P.W4));
    p.drawTo(x);
  });
}

// kilit rozeti (kilitli ağaç uyarısı): 9x10
export function lockBadge() {
  return cached('lockb', 9, 10, (x) => {
    const p = new Pix(9, 10);
    p.grid(['..sss..', '.s...s.', '.s...s.', 'CCCCCCC', 'CAAkAAC', 'CAAkAAC', 'CCCCCCC'], 1, 1, { s: P.S, C: P.A3, A: P.A1, k: P.C0 });
    p.outline(P.C0);
    p.drawTo(x);
  });
}
