// KOR — ateş: taş çemberli ocak, çapraz kütükler, boyuta göre önceden üretilmiş katmanlı alev kareleri,
// kıvılcım / kor / duman parçacıkları.
import { hash2 } from '../core/util.js';
import { Pix, cached } from './pix.js';
import { PAL, bayer } from './palette.js';

export const FLAME_SIZES = [[10, 14], [14, 20], [18, 26], [22, 32], [28, 40], [34, 50], [42, 62]];
export const FLAME_FRAMES = 8;

function flamePix(si, f) {
  const [w, h] = FLAME_SIZES[si];
  const p = new Pix(w, h);
  const t = f / FLAME_FRAMES * Math.PI * 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (x + 0.5 - w / 2) / (w / 2);
    const v = (h - 1 - y + 0.5) / h;
    const sway = (Math.sin(v * 5 - t) * 0.1 + Math.sin(v * 11 + t * 2) * 0.05) * v * 1.4;
    const uu = u - sway;
    let env = Math.pow(1 - v, 0.72);
    if (v < 0.14) env *= 0.78 + v / 0.14 * 0.22;
    const n = Math.sin(x * 1.7 + t * 2) * 0.5 + Math.sin(x * 0.9 - t + y * 0.35) * 0.5;
    const edge = env * (1 + 0.22 * n * v) * 0.98;
    if (Math.abs(uu) >= edge) continue;
    const it = (1 - Math.abs(uu) / edge) * (1 - v * 0.82) + (bayer(x, y) - 0.5) * 0.16;
    const c = it > 0.62 ? PAL.E6 : it > 0.46 ? PAL.E5 : it > 0.31 ? PAL.E4 : it > 0.17 ? PAL.E3 : it > 0.07 ? PAL.E2 : PAL.E1;
    p.set(x, y, c);
  }
  // kopan alev dilleri
  for (let k = 0; k < 3; k++) {
    const ph = (f / FLAME_FRAMES + k / 3) % 1;
    const by = Math.floor(h * (0.55 + ph * 0.42));
    const bx = Math.floor(w / 2 + Math.sin(k * 2.3 + t) * w * 0.2);
    const y = h - 1 - by;
    const c = ph < 0.45 ? PAL.E3 : PAL.E2;
    p.set(bx, y, c);
    if (ph < 0.5 && w > 12) { p.set(bx + 1, y, c); p.set(bx, y + 1, PAL.E2); }
  }
  return p;
}

const flameTable = new Map();
export function flameFrame(si, f) {
  si = Math.max(0, Math.min(FLAME_SIZES.length - 1, si | 0));
  f = ((f % FLAME_FRAMES) + FLAME_FRAMES) % FLAME_FRAMES;
  const k = si * 16 + f;
  let c = flameTable.get(k);
  if (c) return c;
  const [w, h] = FLAME_SIZES[si];
  c = cached('fl' + si + '_' + f, w, h, (x) => flamePix(si, f).drawTo(x));
  flameTable.set(k, c);
  return c;
}

// eski API: fireFrame(i, small)
export function fireFrame(i, small) { return flameFrame(small ? 1 : 3, i); }

// ocak: 56x28, merkez (28,14). İç yüzler ateşe bakar (aydınlık).
export function hearthSprite() {
  return cached('hearth', 56, 28, (x) => {
    const p = new Pix(56, 28);
    // kül yatağı
    p.ellipse(28, 15, 19, 8, (nx, ny, px, py) => {
      const d = nx * nx + ny * ny;
      if (d < 0.35) return hash2(px, py, 4) < 0.25 ? PAL.E1 : bayer(px, py) < 0.5 ? PAL.W1 : PAL.A0;
      return bayer(px, py) < 0.5 ? PAL.W0 : PAL.W1;
    });
    // taşlar
    const N = 13;
    for (let i = 0; i < N; i++) {
      const a = i / N * Math.PI * 2 + 0.2;
      const sx = 28 + Math.cos(a) * 22, sy = 14.5 + Math.sin(a) * 9.5;
      const rx = 3.6 + hash2(i, 1, 2) * 1.4, ry = 2.6 + hash2(i, 2, 2) * 0.9;
      const toC = [-(Math.cos(a)), -(Math.sin(a))];
      p.ellipse(sx, sy, rx, ry, (nx, ny, px, py) => {
        const lit = nx * toC[0] + ny * toC[1];
        const top = -ny;
        const s = lit * 0.6 + top * 0.5 + (bayer(px, py) - 0.5) * 0.3;
        return s > 0.55 ? PAL.A2 : s > 0.1 ? PAL.A1 : s > -0.35 ? PAL.A0 : PAL.C3;
      });
    }
    p.outline(PAL.C0);
    p.drawTo(x);
  });
}

// çapraz kütükler: 34x16, merkez alt (17,13); burnt=true sönük/kömürleşmiş
export function hearthLogs(burnt = false) {
  return cached('hlogs' + (burnt ? 'b' : ''), 34, 16, (x) => {
    const p = new Pix(34, 16);
    const bark = burnt ? [PAL.W0, PAL.W1, PAL.A0] : [PAL.W1, PAL.W3, PAL.W4];
    const logs = [[4, 13, 26, 6], [30, 13, 8, 5], [9, 4, 24, 13]];
    for (const [x0, y0, x1, y1] of logs) {
      for (let o = -1; o <= 1; o++) p.line(x0, y0 + o, x1, y1 + o, bark[o + 1]);
      p.set(x0, y0, burnt ? PAL.A0 : PAL.W5); p.set(x0, y0 - 1, burnt ? PAL.A1 : PAL.W5);
    }
    // kor ağızları
    p.paint(16, 9, PAL.E2); p.paint(17, 10, burnt ? PAL.E0 : PAL.E3); p.paint(14, 10, PAL.E1); p.paint(20, 9, PAL.E1);
    p.outline(PAL.C0);
    p.drawTo(x);
  });
}

// parçacıklar
export function sparkSprite(v) {
  return cached('sp2' + (v % 4), 2, 2, (x) => {
    x.fillStyle = v % 2 ? PAL.E5 : PAL.E4; x.fillRect(0, 0, 2, 2);
    x.fillStyle = PAL.E6; x.fillRect(0, 0, 1, 1);
  });
}
export function emberParticle(v) {
  return cached('ep2' + (v % 3), 2, 2, (x) => {
    x.fillStyle = [PAL.E3, PAL.E4, PAL.E2][v % 3]; x.fillRect(0, 0, v % 3 === 2 ? 1 : 2, v % 3 === 2 ? 1 : 2);
    x.fillStyle = PAL.E5; x.fillRect(0, 0, 1, 1);
  });
}
export function smokePuff(size) {
  const s = Math.max(1, Math.min(4, size | 0));
  return cached('smk' + s, s + 2, s + 2, (x) => {
    const p = new Pix(s + 2, s + 2);
    p.ellipse((s + 2) / 2, (s + 2) / 2, (s + 2) / 2, (s + 2) / 2, (nx, ny) => (nx + ny < -0.3 ? PAL.C4 : PAL.C3));
    p.drawTo(x);
  });
}
export function ashMote(v) {
  return cached('am' + (v % 2), 2, 2, (x) => {
    x.fillStyle = v % 2 ? PAL.A1 : PAL.A0; x.fillRect(0, 0, 2, 1);
    x.fillStyle = PAL.A2; x.fillRect(0, 1, 1, 1);
  });
}
export function shardSprite() {
  return cached('shard2', 4, 4, (x) => {
    const p = new Pix(4, 4);
    p.grid(['.ss.', 'sCCs', '.sA.', '..A.']);
    p.drawTo(x);
  });
}
