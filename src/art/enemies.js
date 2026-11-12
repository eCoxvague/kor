// KOR — yaratıklar: közgezer (cinder), gölge (shade), kül kurdu (wolf), kolos.
// Her biri 4 kare; ayak noktası meta.fx/fy; gözler meta.eyes[frame] ile karanlıkta ayrıca parlatılır.
import { hash2 } from '../core/util.js';
import { Pix, cached } from './pix.js';
import { PAL, bayer } from './palette.js';

export const ENEMY_META = {
  cinder: { w: 18, h: 18, fx: 9, fy: 16 },
  shade:  { w: 18, h: 26, fx: 9, fy: 24 },
  wolf:   { w: 28, h: 20, fx: 14, fy: 18 },
  kolos:  { w: 36, h: 40, fx: 18, fy: 38 },
};
// göz pikselleri [x,y] kare başına (aynalamada x çevrilir)
const EYES = { cinder: [], shade: [], wolf: [], kolos: [] };

function cinder(f) {
  const p = new Pix(18, 18);
  const sq = [[5, 0, 6], [4.2, 1, 6.8], [5.6, -2, 5.6], [5, -1, 6]][f];
  const [ry, yo, rx] = sq;
  const cy = 11 + yo;
  // ayaklar
  p.rect(5 + (f % 2), 15, 2, 2, PAL.W0); p.rect(11 - (f % 2), 15, 2, 2, PAL.W0);
  p.ellipse(9, cy, rx, ry, (nx, ny, x, y) => {
    const s = -nx * 0.55 - ny * 0.85 + (bayer(x, y) - 0.5) * 0.4;
    return s > 0.55 ? PAL.A0 : s > -0.1 ? PAL.W1 : PAL.W0;
  });
  // kor çatlakları
  const crack = f % 2 ? PAL.E3 : PAL.E2;
  p.paint(5, cy + 1, crack); p.paint(6, cy + 2, crack); p.paint(7, cy + 2, PAL.E1);
  p.paint(12, cy - 1, crack); p.paint(13, cy, crack); p.paint(11, cy + 3, PAL.E1); p.paint(10, cy + 3, crack);
  // ağız
  p.paint(8, cy + 1, PAL.E2); p.paint(9, cy + 1, PAL.E3); p.paint(10, cy + 1, PAL.E2);
  // alev tutamı
  const fl = [[0, 0, 1, 1, 0], [0, 1, 1, 0, 0], [1, 1, 0, 0, 1], [0, 1, 0, 1, 0]][f];
  const top = cy - ry;
  p.rect(7, top - 1, 4, 2, PAL.E3); p.rect(8, top - 3, 2, 2, PAL.E4); p.set(8 + fl[0], top - 4, PAL.E5);
  if (fl[1]) p.set(7, top - 2, PAL.E2);
  if (fl[2]) p.set(10, top - 2, PAL.E2);
  if (fl[3]) p.set(9, top - 5, PAL.E4);
  p.outline(PAL.C0);
  const eyes = [[7, cy - 1], [7, cy - 2], [11, cy - 1], [11, cy - 2]];
  for (const [x, y] of eyes) p.set(x, y, PAL.E6);
  EYES.cinder[f] = eyes;
  return p;
}

function shade(f) {
  const p = new Pix(18, 26);
  const yo = [0, -1, -1, 0][f];
  // gövde: aşağı doğru incelen, yırtık uç
  for (let y = 11 + yo; y <= 23; y++) {
    const t = (y - 11 - yo) / (12 - yo);
    const half = 5.4 * (1 - t * 0.72) + Math.sin(t * 9 + f * 1.6) * 0.9;
    const cx = 9 + Math.sin(t * 5 + f * 1.57) * 1.4 * t;
    for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
      const nx = (x + 0.5 - cx) / Math.max(0.8, half);
      if (Math.abs(nx) > 1) continue;
      if (t > 0.7 && hash2(x, y + f * 7, 3) < (t - 0.7) * 2.2) continue;
      p.set(x, y, nx < -0.55 ? PAL.C3 : nx > 0.5 ? PAL.C1 : PAL.C2);
    }
  }
  // pençe kollar
  const a = f % 2;
  p.line(4, 13 + yo, 1, 16 + yo + a, PAL.C2); p.set(1, 17 + yo + a, PAL.C3); p.set(0, 16 + yo + a, PAL.C3);
  p.line(14, 13 + yo, 17, 16 + yo - a + 1, PAL.C2); p.set(17, 17 + yo - a + 1, PAL.C3);
  // kukuleta
  p.ellipse(9, 8 + yo, 5.6, 6, (nx, ny) => (nx * -0.6 + ny * -0.8 > 0.5 ? PAL.C3 : nx > 0.45 ? PAL.C1 : PAL.C2));
  p.set(9, 1 + yo, PAL.C2); p.set(8, 2 + yo, PAL.C3);
  p.ellipse(9, 9.5 + yo, 3.4, 2.8, PAL.C0);
  p.outline(PAL.C0);
  // soğuk kenar ışığı
  for (let y = 0; y < 26; y++) for (let x = 0; x < 18; x++) {
    if (p.get(x, y) === PAL.C3 && !p.get(x - 1, y - 1) && bayer(x, y) < 0.5) p.set(x, y, PAL.V);
  }
  const eyes = [[7, 9 + yo], [8, 9 + yo], [10, 9 + yo], [11, 9 + yo]];
  for (const [x, y] of eyes) p.set(x, y, PAL.A3);
  p.set(7, 10 + yo, PAL.V); p.set(11, 10 + yo, PAL.V);
  EYES.shade[f] = eyes;
  return p;
}

function wolf(f) {
  const p = new Pix(28, 20);
  const bob = [0, -1, 0, -1][f];
  const fo = [2, 0, -2, 0][f], bo = [-2, 0, 2, 0][f];
  // arka bacaklar (uzak)
  p.rect(9 - bo, 13 + bob, 2, 5 - bob, PAL.A0); p.rect(19 + fo, 13 + bob, 2, 5 - bob, PAL.A0);
  // kuyruk
  const tw = f % 2;
  p.line(5, 10 + bob, 2, 7 + bob - tw, PAL.A1); p.line(4, 10 + bob, 1, 8 + bob - tw, PAL.A1);
  p.set(1, 6 + bob - tw, PAL.A2); p.set(0, 7 + bob - tw, PAL.A2);
  // gövde
  p.ellipse(13, 11 + bob, 8.5, 4, (nx, ny, x, y) => {
    const s = -ny * 0.9 - nx * 0.2 + (bayer(x, y) - 0.5) * 0.4;
    return s > 0.5 ? PAL.A2 : s > -0.3 ? PAL.A1 : PAL.A0;
  });
  // yele ve kor sırt çatlakları
  p.ellipse(18, 9 + bob, 4, 4.2, (nx, ny, x, y) => (-ny > 0.3 || bayer(x, y) < 0.2 ? PAL.A2 : PAL.A1));
  for (let x = 8; x <= 18; x += 2) p.paint(x, 7 + bob + (x % 4 ? 1 : 0), f % 2 && x % 4 ? PAL.E3 : PAL.E2);
  // baş
  p.ellipse(22, 8 + bob, 3.4, 3, (nx, ny) => (ny < -0.3 ? PAL.A2 : PAL.A1));
  p.rect(23, 9 + bob, 4, 2, PAL.A1); p.rect(23, 10 + bob, 4, 1, PAL.A0);
  p.set(27, 9 + bob, PAL.C0);
  p.set(20, 4 + bob, PAL.A1); p.set(20, 5 + bob, PAL.A1); p.set(21, 5 + bob, PAL.A2); p.set(22, 4 + bob, PAL.A1); p.set(22, 5 + bob, PAL.A1);
  p.set(24, 11 + bob, PAL.E2);
  // yakın bacaklar
  p.rect(7 + bo, 13 + bob, 2, 5 - bob, PAL.A1); p.rect(17 - fo, 13 + bob, 2, 5 - bob, PAL.A1);
  p.rect(7 + bo, 17, 3, 1, PAL.A0); p.rect(17 - fo, 17, 3, 1, PAL.A0);
  p.outline(PAL.C0);
  const eyes = [[23, 7 + bob], [24, 7 + bob]];
  p.set(23, 7 + bob, PAL.E5); p.set(24, 7 + bob, PAL.E6);
  EYES.wolf[f] = eyes;
  return p;
}

function kolos(f) {
  const p = new Pix(36, 40);
  const bob = [0, 1, 0, 1][f];
  const la = [0, -2, 0, 2][f], ra = -la;
  // bacaklar
  p.rect(11, 30, 5, 8, PAL.W1); p.rect(21, 30, 5, 8, PAL.W1);
  p.rect(11, 30, 2, 8, PAL.W2); p.rect(21, 30, 2, 8, PAL.W2);
  p.rect(10, 37, 7, 1, PAL.W0); p.rect(20, 37, 7, 1, PAL.W0);
  // kollar (gövdenin arkasından)
  for (const [sx, dy] of [[7, la], [29, ra]]) {
    p.ellipse(sx, 22 + bob + dy, 3.4, 8, (nx, ny, x, y) => (nx * -0.6 + ny * -0.8 > 0.3 ? PAL.A1 : bayer(x, y) < 0.5 ? PAL.A0 : PAL.W2));
    p.ellipse(sx, 31 + bob + dy, 4, 3, (nx, ny) => (ny < -0.2 ? PAL.A1 : PAL.A0));
  }
  // gövde
  p.ellipse(18, 20 + bob, 11, 10, (nx, ny, x, y) => {
    const s = -nx * 0.55 - ny * 0.85 + (hash2(x >> 1, y >> 1, 5) - 0.5) * 0.5 + (bayer(x, y) - 0.5) * 0.3;
    return s > 0.6 ? PAL.A1 : s > 0.1 ? PAL.A0 : s > -0.4 ? PAL.W2 : PAL.W1;
  });
  // omuz kayaları + yosun
  for (const sx of [9, 27]) p.ellipse(sx, 13 + bob, 5, 4.2, (nx, ny, x, y) => (nx * -0.6 + ny * -0.8 > 0.4 ? PAL.A2 : nx * -0.6 + ny * -0.8 > -0.2 ? PAL.A1 : PAL.A0));
  p.set(7, 10 + bob, PAL.G3); p.set(8, 10 + bob, PAL.G2); p.set(26, 10 + bob, PAL.G3); p.set(29, 11 + bob, PAL.G2);
  // erimiş çatlaklar ve göğüs çekirdeği
  const hot = f % 2 ? PAL.E4 : PAL.E3;
  p.line(14, 15 + bob, 17, 20 + bob, PAL.E2); p.line(22, 16 + bob, 19, 20 + bob, PAL.E2);
  p.line(18, 23 + bob, 16, 27 + bob, PAL.E1); p.line(19, 23 + bob, 22, 26 + bob, PAL.E1);
  p.ellipse(18, 21 + bob, 2.4, 2.2, hot); p.set(18, 21 + bob, PAL.E5);
  // gömük baş
  p.ellipse(18, 9 + bob, 4.2, 3.6, (nx, ny) => (ny < -0.3 ? PAL.A1 : PAL.A0));
  p.outline(PAL.C0);
  const eyes = [[16, 9 + bob], [17, 9 + bob], [18, 9 + bob], [19, 9 + bob], [20, 9 + bob]];
  for (const [x, y] of eyes) p.set(x, y, PAL.E5);
  p.set(18, 9 + bob, PAL.E6);
  EYES.kolos[f] = eyes;
  return p;
}

const MAKERS = { cinder, shade, wolf, kolos };
const pixCache = new Map();
function enemyPix(kind, f) {
  const k = kind + f;
  let p = pixCache.get(k);
  if (!p) { p = MAKERS[kind](f); pixCache.set(k, p); }
  return p;
}

const table = new Map();
// enemySprite(kind, frame, flash, mirror)
export function enemySprite(kind, frame = 0, flash = false, mirror = false) {
  const f = ((frame % 4) + 4) % 4;
  const k = kind + f + (flash ? 'f' : '') + (mirror ? 'm' : '');
  let c = table.get(k);
  if (c) return c;
  const M = ENEMY_META[kind];
  c = cached('en2' + k, M.w, M.h, (x) => {
    let p = enemyPix(kind, f);
    if (mirror) p = p.mirror();
    if (flash) p = p.silhouette(PAL.E6);
    p.drawTo(x);
  });
  table.set(k, c);
  return c;
}
export function enemyEyes(kind, frame) {
  const f = ((frame % 4) + 4) % 4;
  enemyPix(kind, f);
  return EYES[kind][f] || [];
}
// ölüm: 4 karelik küle dağılma
export function enemyDeath(kind, step, mirror = false) {
  const s = Math.max(0, Math.min(3, step | 0));
  const M = ENEMY_META[kind];
  return cached('ed' + kind + s + (mirror ? 'm' : ''), M.w, M.h, (x) => {
    let p = enemyPix(kind, 0);
    if (mirror) p = p.mirror();
    const keep = 0.85 - s * 0.24;
    p = p.map((c, px, py) => {
      const h = hash2(px, py, 77);
      if (h > keep + (py / M.h) * 0.25) return null;
      if (h > keep - 0.12) return PAL.E3;
      return s === 0 ? (h < 0.4 ? PAL.A1 : PAL.A0) : (h < 0.5 ? PAL.A0 : PAL.A1);
    });
    p.drawTo(x);
  });
}
