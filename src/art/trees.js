// KOR — ağaçlar: dolu, katmanlı yaprak kümeleri; ışık sol-üstten (ateşin solundaki ağaçlar aynalanır),
// koyu alt gölge, 1px koyu dış hat, türe özgü siluet.
import { Rng, hash2 } from '../core/util.js';
import { Pix, cached } from './pix.js';
import { PAL, bayer } from './palette.js';

export const TREE_INFO = {
  birch: { w: 28, h: 60, base: 57, canopy: 20, glow: false },
  oak:   { w: 52, h: 62, base: 59, canopy: 22, glow: false },
  iron:  { w: 40, h: 72, base: 69, canopy: 30, glow: false },
  ember: { w: 56, h: 74, base: 71, canopy: 24, glow: true },
};

const LX = -0.55, LY = -0.83;

function trunk(p, cx, yTop, yBot, wTop, wBot, pal, bend = 0, phase = 0) {
  for (let y = yTop; y <= yBot; y++) {
    const t = (y - yTop) / Math.max(1, yBot - yTop);
    let ww = Math.round(wTop + (wBot - wTop) * t);
    if (y >= yBot - 1) ww += (y === yBot ? 4 : 2);
    const x0 = Math.round(cx - ww / 2 + bend * Math.sin(t * Math.PI + phase));
    for (let i = 0; i < ww; i++) {
      const f = i / Math.max(1, ww - 1);
      const c = f < 0.2 ? pal[2] : f > 0.75 ? pal[0] : pal[1];
      p.set(x0 + i, y, c);
    }
  }
}

// canopy: yaprak kümeleri; pal koyu→açık (5 ton)
function canopy(p, mask, blobs, pal, top, height, seed, hot) {
  for (const b of blobs) {
    const [bx, by, r, bias = 0, sq = 1] = b;
    const ph = hash2(bx | 0, by | 0, seed) * 6.28;
    for (let y = Math.floor(by - r - 2); y <= Math.ceil(by + r + 2); y++) {
      for (let x = Math.floor(bx - r - 2); x <= Math.ceil(bx + r + 2); x++) {
        const dx = x + 0.5 - bx, dy = (y + 0.5 - by) / sq;
        const d = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx);
        const re = r * (1 + 0.12 * Math.sin(ang * 5 + ph) + 0.06 * Math.sin(ang * 9 - ph));
        if (d > re) continue;
        const nx = dx / re, ny = dy / re;
        const lam = nx * LX + ny * LY;
        const g = ((top + height * 0.45) - y) / height * 0.7;
        const clump = (hash2(x >> 1, y >> 1, seed + 3) - 0.5) * 0.36;
        const s = lam * 0.62 + g + bias + clump + (bayer(x, y) - 0.5) * 0.32;
        const i = s > 0.6 ? 4 : s > 0.24 ? 3 : s > -0.12 ? 2 : s > -0.46 ? 1 : 0;
        if (x < 0 || y < 0 || x >= p.w || y >= p.h) continue;
        p.set(x, y, pal[i]);
        mask[y * p.w + x] = 1;
        if (hot && i >= 3 && hash2(x, y, seed + 9) < 0.07) p.set(x, y, PAL.E5);
      }
    }
  }
  // koyu alt gölge: yaprak kümesinin alt kenarı
  for (let y = p.h - 1; y >= 0; y--) for (let x = 0; x < p.w; x++) {
    if (!mask[y * p.w + x]) continue;
    const below1 = y + 1 < p.h ? mask[(y + 1) * p.w + x] : 0;
    const below2 = y + 2 < p.h ? mask[(y + 2) * p.w + x] : 0;
    if (!below1) p.set(x, y, pal[0]);
    else if (!below2 && bayer(x, y) < 0.6) p.set(x, y, pal[1]);
  }
}

// gövdenin yaprak altında kalan kısmını karart
function trunkShade(p, mask, shadeCol) {
  for (let x = 0; x < p.w; x++) {
    let last = -99;
    for (let y = 0; y < p.h; y++) {
      if (mask[y * p.w + x]) { last = y; continue; }
      if (p.get(x, y) && y - last <= 3) p.set(x, y, y - last <= 2 || bayer(x, y) < 0.5 ? shadeCol : p.get(x, y));
    }
  }
}

function jitter(r, blobs, amt) {
  return blobs.map(b => [b[0] + r.range(-amt, amt), b[1] + r.range(-amt, amt), b[2] * r.range(0.9, 1.1), b[3] || 0, b[4] || 1]);
}

const pixCache = new Map();
export function treePix(type, variant) {
  const key = type + variant;
  if (pixCache.has(key)) return pixCache.get(key);
  const I = TREE_INFO[type];
  const p = new Pix(I.w, I.h);
  const mask = new Uint8Array(I.w * I.h);
  const r = new Rng(variant * 977 + type.length * 131 + 7);
  const seed = variant * 13 + type.length;
  if (type === 'birch') {
    const cx = 14;
    trunk(p, cx, 12, I.base, 3, 4, [PAL.A1, PAL.A2, PAL.A3], r.range(-1, 1), r.range(0, 2));
    for (let i = 0; i < 9; i++) {           // benekli kabuk
      const y = 34 + r.int(0, 21), x = cx - 2 + r.int(0, 3);
      p.paint(x, y, PAL.W0); if (r.next() > 0.5) p.paint(x + 1, y, PAL.W0);
    }
    p.line(cx, 40, cx - 5, 34, PAL.A1); p.line(cx + 1, 37, cx + 5, 31, PAL.A1);
    canopy(p, mask, jitter(r, [
      [14, 12, 6.5, -0.25], [10, 22, 6.5, -0.2], [18, 24, 6.5, -0.2],
      [14, 8, 6], [11, 16, 6.5], [17, 17, 6], [13, 25, 7], [16, 31, 5.5], [11, 31, 5], [14, 36, 3.8],
    ], 1.2), [PAL.G1, PAL.G2, PAL.G3, PAL.G4, PAL.G5], 2, 38, seed);
    trunkShade(p, mask, PAL.A0);
  } else if (type === 'oak') {
    const cx = 26;
    trunk(p, cx, 24, I.base, 6, 8, [PAL.W1, PAL.W3, PAL.W4], r.range(-1.2, 1.2));
    p.line(cx - 2, 44, cx - 9, 37, PAL.W2); p.line(cx + 2, 42, cx + 9, 36, PAL.W2);
    p.set(cx - 1, 50, PAL.W1); p.set(cx, 51, PAL.W1); p.set(cx + 1, 47, PAL.W2);
    canopy(p, mask, jitter(r, [
      [26, 14, 12, -0.25], [12, 25, 9, -0.22], [40, 25, 9, -0.22],
      [19, 14, 10], [33, 14, 10], [26, 24, 12], [13, 31, 8.5], [39, 31, 8.5], [26, 33, 9], [26, 7, 8],
    ], 1.5), [PAL.G0, PAL.G1, PAL.G2, PAL.G3, PAL.G4], 0, 42, seed);
    trunkShade(p, mask, PAL.W0);
  } else if (type === 'iron') {
    const cx = 20;
    trunk(p, cx, 40, I.base, 4, 5, [PAL.C1, PAL.C3, PAL.C4]);
    const tiers = [[2, 17, 7], [11, 28, 10], [21, 39, 13], [32, 51, 16], [43, 61, 18]];
    const pal = [PAL.C1, PAL.C2, PAL.C3, PAL.C4, PAL.S];
    tiers.forEach(([ay, by, hw], ti) => {
      hw += r.range(-1, 1);
      for (let y = ay; y <= by; y++) {
        const t = (y - ay) / (by - ay);
        const half = Math.max(0.6, hw * t);
        for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
          const nx = (x + 0.5 - cx) / Math.max(1, half);
          if (Math.abs(nx) > 1) continue;
          if (y >= by - 1 && ((x + ti) % 3 === 0)) continue;     // testere kenar
          if (y === by - 2 && ((x + ti) % 6 === 0)) continue;
          const g = (1 - t) * 0.45 - 0.15 - ti * 0.04;
          const s = -nx * 0.75 + g + (bayer(x, y) - 0.5) * 0.35 + (hash2(x >> 1, y, seed) - 0.5) * 0.3;
          let i = s > 0.55 ? 4 : s > 0.2 ? 3 : s > -0.15 ? 2 : s > -0.5 ? 1 : 0;
          if (i === 4 && hash2(x, y, seed + 5) > 0.45) i = 3;
          p.set(x, y, pal[i]);
          mask[y * p.w + x] = 1;
        }
      }
    });
    // metal parıltı çizgileri
    for (let i = 0; i < 5; i++) { const y = 8 + i * 11 + r.int(0, 3); p.paint(cx - 3 - (i >> 1), y, PAL.S); p.paint(cx - 2 - (i >> 1), y + 1, PAL.S); }
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      if (mask[y * p.w + x] && !(y + 1 < p.h && mask[(y + 1) * p.w + x])) p.set(x, y, PAL.C0);
    }
    trunkShade(p, mask, PAL.C0);
  } else {
    const cx = 28;
    trunk(p, cx, 30, I.base, 6, 9, [PAL.W0, PAL.W1, PAL.W2], 2.2, r.range(0, 1));
    for (let i = 0; i < 6; i++) {           // kor çatlakları
      const y = 46 + r.int(0, 22), x = cx - 3 + r.int(0, 5);
      p.paint(x, y, PAL.E1); p.paint(x, y + 1, PAL.E2); if (r.next() > 0.5) p.paint(x + 1, y + 2, PAL.E1);
    }
    p.line(cx - 2, 46, cx - 12, 36, PAL.W1); p.line(cx + 3, 44, cx + 12, 34, PAL.W1);
    canopy(p, mask, jitter(r, [
      [28, 20, 13, -0.2], [14, 28, 10, -0.2], [42, 28, 10, -0.2],
      [20, 18, 10, 0, 1.15], [36, 18, 10, 0, 1.15], [28, 28, 12], [16, 36, 8], [40, 36, 8], [28, 9, 8, 0, 1.2],
      [21, 5, 4, 0.1, 1.4], [35, 5, 4, 0.1, 1.4], [28, 2, 3, 0.2, 1.4],
    ], 1.5), [PAL.E0, PAL.E1, PAL.E2, PAL.E3, PAL.E4], 0, 44, seed, true);
    trunkShade(p, mask, PAL.W0);
  }
  p.outline(type === 'ember' ? PAL.W0 : PAL.C0);
  pixCache.set(key, p);
  return p;
}

// treeSprite(type, variant, mirror): dış hat dahil; mirror = ışık sağ-üstten
const table = new Map();
function lookup(kind, type, variant, mirror, make) {
  const v = ((variant % 4) + 4) % 4;
  const k = kind + type + v + (mirror ? 1 : 0);
  let c = table.get(k);
  if (!c) {
    const I = TREE_INFO[type];
    c = cached('t' + k, I.w, I.h, (x) => { let p = treePix(type, v); if (mirror) p = p.mirror(); make(p).drawTo(x); });
    table.set(k, c);
  }
  return c;
}
export const treeSprite = (type, variant = 0, mirror = false) => lookup('s', type, variant, mirror, p => p);
export const treeFlash = (type, variant = 0, mirror = false) => lookup('f', type, variant, mirror, p => p.silhouette(PAL.A3));
