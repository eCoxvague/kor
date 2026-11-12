// KOR — dikişsiz zemin (dünya koordinatlı gürültü, parça parça önbellek), taş, çalı, kütük, odun parçaları
import { hash2 } from '../core/util.js';
import { cached, Pix } from './pix.js';
import { PAL, rgb, bayer } from './palette.js';

export const CHUNK = 256;

function vn(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// bölge: 0 çim, 1 toprak, 2 yanık geçiş, 3 çıplak ocak toprağı
function zoneAt(wx, wy, altar) {
  const dA = Math.hypot(wx - altar.x, (wy - altar.y) * 1.25);
  const n2 = vn(wx / 17, wy / 17, 2);
  const th = bayer(wx, wy) - 0.5;
  if (dA < 50 + (n2 - 0.5) * 16 + th * 6) return 3;
  if (dA < 98 + (n2 - 0.5) * 30) {
    const t = (dA - 50) / 48;
    return bayer(wx, wy) * 0.9 + 0.05 > t ? 2 : 0;
  }
  const dirt = vn(wx / 110, wy / 110, 4) * 0.75 + n2 * 0.25 + th * 0.1;
  return dirt > 0.64 ? 1 : 0;
}

const GRASS = [PAL.G0, PAL.G0, PAL.G1, PAL.G2];
function baseColor(wx, wy, zone, altar) {
  const n1 = vn(wx / 52, wy / 52, 1), n2 = vn(wx / 17, wy / 17, 2), n3 = vn(wx / 6, wy / 6, 3);
  const v = n1 * 0.5 + n2 * 0.32 + n3 * 0.18 + (bayer(wx, wy) - 0.5) * 0.18;
  if (zone === 3) {
    const dA = Math.hypot(wx - altar.x, (wy - altar.y) * 1.25);
    if (dA < 26 && v > 0.5 && bayer(wx, wy) < 0.3) return PAL.A0;
    return v < 0.4 ? PAL.W1 : v < 0.62 ? PAL.W2 : PAL.W3;
  }
  if (zone === 2) return v < 0.5 ? PAL.W0 : PAL.W1;
  if (zone === 1) return v < 0.46 ? PAL.W1 : v < 0.7 ? PAL.W2 : PAL.G0;
  return v < 0.36 ? GRASS[0] : v < 0.55 ? GRASS[2] : v < 0.74 ? GRASS[2] : GRASS[3];
}

// tek parça: CHUNK x CHUNK, dünya (cx*CHUNK, cy*CHUNK) noktasından başlar
export function groundChunk(cx, cy, altar) {
  return cached('gc' + cx + '_' + cy, CHUNK, CHUNK, (x, w, h) => {
    const img = x.createImageData ? x.createImageData(w, h) : null;
    if (!img || !img.data) return;
    const d = img.data;
    const X0 = cx * CHUNK, Y0 = cy * CHUNK;
    const put = (px, py, hex) => {
      px -= X0; py -= Y0;
      if (px < 0 || py < 0 || px >= w || py >= h) return;
      const c = rgb(hex), i = (py * w + px) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    };
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      const wx = X0 + px, wy = Y0 + py;
      put(wx, wy, baseColor(wx, wy, zoneAt(wx, wy, altar), altar));
    }
    // ayrıntı damgaları: 9px hücre başına en çok bir tane, dünya hücresine bağlı (dikişsiz)
    const C = 9;
    for (let gy = Math.floor((Y0 - 8) / C); gy <= Math.floor((Y0 + h + 8) / C); gy++) {
      for (let gx = Math.floor((X0 - 8) / C); gx <= Math.floor((X0 + w + 8) / C); gx++) {
        const r = hash2(gx, gy, 7);
        const sx = gx * C + Math.floor(hash2(gx, gy, 8) * C), sy = gy * C + Math.floor(hash2(gx, gy, 9) * C);
        const z = zoneAt(sx, sy, altar);
        if (z === 0) {
          if (r < 0.30) {                   // çim tutamı
            const tall = 2 + Math.floor(hash2(gx, gy, 10) * 3);
            const tip = r < 0.07 ? PAL.G4 : PAL.G3;
            for (let b = -1; b <= 1; b++) {
              const bh = tall - Math.abs(b) - (b === 1 && r < 0.15 ? 1 : 0);
              for (let k = 0; k < bh; k++) put(sx + b + (k === bh - 1 && b ? b : 0), sy - k, k === bh - 1 ? tip : PAL.G2);
            }
            put(sx, sy + 1, PAL.G0);
          } else if (r < 0.315) {           // küçük çiçek
            put(sx, sy, PAL.G3); put(sx, sy - 1, r < 0.308 ? PAL.E5 : PAL.V);
          } else if (r < 0.345) {           // düşmüş yaprak
            put(sx, sy, PAL.W4); put(sx + 1, sy, PAL.W3);
          } else if (r < 0.36) {            // dal
            for (let k = 0; k < 4; k++) put(sx + k, sy + (k > 1 ? 1 : 0), PAL.W3);
          } else if (r < 0.385) {           // çakıl
            put(sx, sy, PAL.A1); put(sx + 1, sy, PAL.A0); put(sx, sy + 1, PAL.C1); put(sx + 1, sy + 1, PAL.C1);
          }
        } else if (z === 1) {
          if (r < 0.12) { put(sx, sy, PAL.A0); put(sx + 1, sy, PAL.A1); put(sx, sy + 1, PAL.W0); }
          else if (r < 0.2) { put(sx, sy, PAL.W3); put(sx + 1, sy + 1, PAL.W3); put(sx + 2, sy + 1, PAL.W3); }
          else if (r < 0.3) { put(sx, sy, PAL.G2); put(sx, sy - 1, PAL.G3); }
        } else if (z === 2) {
          if (r < 0.25) { put(sx, sy, PAL.C0); put(sx + 1, sy, PAL.W0); }
          else if (r < 0.32) { put(sx, sy, PAL.G1); put(sx, sy - 1, PAL.G2); }
        } else {
          if (r < 0.3) { put(sx, sy, PAL.C0); put(sx + 1, sy, PAL.C1); }
          else if (r < 0.45) put(sx, sy, PAL.A1);
        }
      }
    }
    x.putImageData(img, 0, 0);
  });
}

// rockSprite(v): 16x11 taş (sol-üstten çizilir), v = 0..3
export function rockSprite(v) {
  const k = ((v % 4) + 4) % 4;
  return cached('rk2' + k, 16, 11, (x) => {
    const p = new Pix(16, 11);
    const rx = 6 + (k % 2), ry = 3.6 + (k === 2 ? 0.6 : 0);
    p.ellipse(8, 6.2, rx, ry, (nx, ny, px, py) => {
      const s = -nx * 0.6 - ny * 0.8 + (bayer(px, py) - 0.5) * 0.4;
      return s > 0.55 ? PAL.A2 : s > 0.05 ? PAL.A1 : s > -0.5 ? PAL.A0 : PAL.C3;
    });
    if (k === 1) p.ellipse(12, 7.5, 3, 2.2, (nx, ny) => (-nx * 0.6 - ny * 0.8 > 0.2 ? PAL.A1 : PAL.A0));
    if (k >= 2) { p.paint(5, 3, PAL.G3); p.paint(6, 3, PAL.G3); p.paint(7, 3, PAL.G2); p.paint(6, 4, PAL.G2); p.paint(9, 3, PAL.G2); }
    p.paint(10, 6, PAL.C3); p.paint(11, 7, PAL.C3);
    p.outline(PAL.C0);
    p.drawTo(x);
  });
}

// bushSprite(v): 18x14 çalı, v = 0..4
export function bushSprite(v) {
  const k = ((v % 5) + 5) % 5;
  return cached('bs2' + k, 18, 14, (x) => {
    const p = new Pix(18, 14);
    const blobs = [[6, 8, 4.2], [11, 7, 4.6], [9, 5, 3.6], [13, 9.5, 3.4], [5, 10, 3]];
    if (k % 2) blobs.push([8, 9, 3.6]);
    for (let i = 0; i < blobs.length; i++) {
      const [bx, by, r] = blobs[i];
      const bias = i < 2 ? -0.15 : 0.05;
      p.ellipse(bx + (k % 3) - 1, by, r, r * 0.9, (nx, ny, px, py) => {
        const s = -nx * 0.55 - ny * 0.85 + bias + (bayer(px, py) - 0.5) * 0.5;
        return s > 0.6 ? PAL.G4 : s > 0.1 ? PAL.G3 : s > -0.4 ? PAL.G2 : PAL.G1;
      });
    }
    for (let i = 0; i < 18; i++) if (p.get(i, 12) && !p.get(i, 13)) p.set(i, 12, PAL.G0);
    if (k === 1 || k === 4) { p.paint(7, 6, PAL.R); p.paint(12, 8, PAL.R); p.paint(10, 4, PAL.R); p.paint(7, 5, PAL.A3); }
    p.outline(PAL.C0);
    p.drawTo(x);
  });
}

// stumpSprite(v): 20x20 kütük, merkez (10,10)
export function stumpSprite(v) {
  const k = ((v % 2) + 2) % 2;
  return cached('st2' + k, 20, 20, (x) => {
    const p = new Pix(20, 20);
    p.rect(5, 9, 10, 6, PAL.W2);
    p.rect(4, 13, 12, 2, PAL.W2);
    for (let y = 9; y < 15; y++) { p.set(5, y, PAL.W3); p.set(14, y, PAL.W1); p.set(13, y, PAL.W1); }
    p.rect(3, 14, 2, 1, PAL.W2); p.rect(15, 14, 2, 1, PAL.W1);
    p.ellipse(10, 8.5, 5.4, 2.6, (nx, ny) => {
      const d = nx * nx + ny * ny;
      return d > 0.7 ? PAL.W3 : d > 0.4 ? PAL.W5 : d > 0.15 ? PAL.W4 : PAL.W5;
    });
    p.set(10, 8, PAL.W3);
    if (k) { p.set(6, 11, PAL.W1); p.set(9, 12, PAL.W1); p.set(11, 10, PAL.W3); }
    else { p.set(12, 6, PAL.G3); p.set(13, 6, PAL.G2); p.set(8, 12, PAL.W1); }
    p.outline(PAL.W0);
    p.drawTo(x);
  });
}

const LOG_COL = {
  birch: [PAL.A3, PAL.A2, PAL.A0, PAL.W5],
  oak: [PAL.W4, PAL.W3, PAL.W2, PAL.W5],
  iron: [PAL.S, PAL.C4, PAL.C3, PAL.A2],
  ember: [PAL.E3, PAL.E1, PAL.W1, PAL.E5],
};
// logPiece(type): 9x6 odun parçası (merkezden çizilir)
export function logPiece(type) {
  const c = LOG_COL[type] || LOG_COL.oak;
  return cached('log' + type, 9, 6, (x) => {
    const p = new Pix(9, 6);
    p.rect(1, 1, 6, 3, c[1]);
    p.rect(1, 1, 6, 1, c[0]);
    p.rect(1, 3, 6, 1, c[2]);
    if (type === 'birch') { p.set(3, 2, PAL.W0); p.set(5, 1, PAL.W0); }
    p.rect(6, 1, 2, 3, c[3]); p.set(7, 2, c[2]);
    p.outline(PAL.W0);
    p.drawTo(x);
  });
}
// ashOrb: 5x5 kül küresi (deneyim)
export function ashOrb() {
  return cached('ash2', 5, 5, (x) => {
    const p = new Pix(5, 5);
    p.grid(['.AA.', 'ACcA', 'AcAa', '.Aa.'], 0, 0);
    p.set(1, 1, PAL.A3);
    p.outline(PAL.C1);
    p.drawTo(x);
  });
}

// küçük parçacıklar
export function chipSprite(type, v = 0) {
  const c = LOG_COL[type] || LOG_COL.oak;
  return cached('chp' + type + (v % 3), 3, 2, (x) => {
    x.fillStyle = c[v % 3 === 2 ? 3 : 0]; x.fillRect(0, 0, v % 2 ? 2 : 3, 1);
    x.fillStyle = c[1]; x.fillRect(0, 1, v % 2 ? 3 : 2, 1);
  });
}
const LEAF_COL = {
  birch: [PAL.G5, PAL.G4], oak: [PAL.G3, PAL.G2], iron: [PAL.S, PAL.C4], ember: [PAL.E4, PAL.E2],
};
export function leafSprite(type, v = 0) {
  const c = LEAF_COL[type] || LEAF_COL.oak;
  return cached('lf' + type + (v % 2), 3, 2, (x) => {
    x.fillStyle = c[0]; x.fillRect(v % 2, 0, 2, 1);
    x.fillStyle = c[1]; x.fillRect(v % 2 ? 0 : 1, 1, 2, 1);
  });
}
