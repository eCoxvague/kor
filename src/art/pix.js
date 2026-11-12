// KOR — piksel tamponu ve önbellek yardımcıları (tüm sprite üreticileri bunları kullanır)
import { makeCanvas } from '../core/util.js';
import { CH, rgb } from './palette.js';

const cache = new Map();
// cached(key,w,h,draw): bir kez çizilir, sonra hep aynı canvas döner
export function cached(key, w, h, draw) {
  let c = cache.get(key);
  if (c) return c;
  const m = makeCanvas(w, h);
  draw(m.x, w, h);
  cache.set(key, m.c);
  return m.c;
}
export const cacheSize = () => cache.size;
export const cacheKeys = () => [...cache.keys()];

// imageFill: piksel başına renk (ImageData). Node test taklidinde ImageData yoksa sessizce atlar.
export function imageFill(x, w, h, fn) {
  const img = x.createImageData ? x.createImageData(w, h) : null;
  if (!img || !img.data) return false;
  const d = img.data, out = [0, 0, 0, 0];
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      out[3] = 0;
      fn(px, py, out);
      if (!out[3]) continue;
      const i = (py * w + px) * 4;
      d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2]; d[i + 3] = out[3];
    }
  }
  x.putImageData(img, 0, 0);
  return true;
}
export function setRGB(out, hex, a = 255) { const c = rgb(hex); out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; out[3] = a; }

// Pix: renk dizgilerinden oluşan küçük ızgara; anahat, aynalama, siluet üretir
export class Pix {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Array(w * h).fill(null); this.tag = null; }
  set(x, y, c) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.d[y * this.w + x] = c;
  }
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.d[y * this.w + x];
  }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  // yalnızca dolu piksellerin üstüne boya
  paint(x, y, c) { if (this.get(x, y)) this.set(x, y, c); }
  line(x0, y0, x1, y1, c) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  // elips içi: fn(nx,ny,x,y) renk döndürür (null = boş bırak)
  ellipse(cx, cy, rx, ry, fn) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny > 1) continue;
        const c = typeof fn === 'string' ? fn : fn(nx, ny, x, y);
        if (c) this.set(x, y, c);
      }
    }
  }
  // "...k.." biçiminde satırlar; harfler palette.CH ya da verilen haritadan
  grid(rows, ox = 0, oy = 0, map = CH) {
    for (let j = 0; j < rows.length; j++) {
      const r = rows[j];
      for (let i = 0; i < r.length; i++) {
        const ch = r[i];
        if (ch === '.' || ch === ' ') continue;
        const c = map[ch];
        if (c) this.set(ox + i, oy + j, c);
      }
    }
  }
  // boş ve dolu bir komşusu olan her piksele anahat rengi (4 komşu)
  outline(c, diag = false) {
    const add = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.get(x, y)) continue;
      if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1) ||
        (diag && (this.get(x - 1, y - 1) || this.get(x + 1, y - 1) || this.get(x - 1, y + 1) || this.get(x + 1, y + 1)))) add.push(x, y);
    }
    for (let i = 0; i < add.length; i += 2) this.set(add[i], add[i + 1], c);
    return this;
  }
  map(fn) { const p = new Pix(this.w, this.h); for (let i = 0; i < this.d.length; i++) p.d[i] = this.d[i] ? fn(this.d[i], i % this.w, (i / this.w) | 0) : null; return p; }
  mirror() { const p = new Pix(this.w, this.h); for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) p.d[y * this.w + x] = this.d[y * this.w + (this.w - 1 - x)]; return p; }
  silhouette(c) { return this.map(() => c); }
  clone() { const p = new Pix(this.w, this.h); p.d = this.d.slice(); return p; }
  // satır boyunca aynı renk koşularını tek fillRect ile çiz
  drawTo(x, ox = 0, oy = 0) {
    for (let y = 0; y < this.h; y++) {
      let run = null, start = 0;
      for (let i = 0; i <= this.w; i++) {
        const c = i < this.w ? this.d[y * this.w + i] : null;
        if (c !== run) {
          if (run) { x.fillStyle = run; x.fillRect(ox + start, oy + y, i - start, 1); }
          run = c; start = i;
        }
      }
    }
  }
  toCanvas(key) { return cached(key, this.w, this.h, (x) => this.drawTo(x)); }
}

// en yakın komşu döndürme (balta gibi küçük sprite'lar için temiz pikseller)
export function rotatePix(src, ang, size, ax, ay) {
  const p = new Pix(size, size);
  const c = Math.cos(-ang), s = Math.sin(-ang), cx = size / 2, cy = size / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    const sx = Math.floor(ax + dx * c - dy * s), sy = Math.floor(ay + dx * s + dy * c);
    const v = src.get(sx, sy);
    if (v) p.set(x, y, v);
  }
  return p;
}
