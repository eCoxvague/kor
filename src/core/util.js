// KOR — yardımcılar
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 1, b = 0) => b + Math.random() * (a - b);
export const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const pick = arr => arr[(Math.random() * arr.length) | 0];
export const dist2 = (x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; };
export const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
export const approach = (v, t, d) => v < t ? Math.min(v + d, t) : Math.max(v - d, t);
export const easeOut = t => 1 - (1 - t) * (1 - t);
export const easeIn = t => t * t;
export const easeInOut = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
export function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
export function fmt(n) {
  if (n < 1000) return String(Math.floor(n));
  if (n < 1e6) return (n / 1e3).toFixed(n < 1e4 ? 1 : 0) + 'B';
  return (n / 1e6).toFixed(1) + 'M';
}
// deterministik hash tabanlı gürültü
export function hash2(x, y, seed = 0) {
  let h = x * 374761393 + y * 668265263 + seed * 2147483647;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export class Rng {
  constructor(seed = 1) { this.s = seed >>> 0; }
  next() { this.s ^= this.s << 13; this.s >>>= 0; this.s ^= this.s >> 17; this.s ^= this.s << 5; this.s >>>= 0; return this.s / 4294967296; }
  range(a, b) { return a + this.next() * (b - a); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
}
// tuvalin ekrana sığan en büyük TAM SAYI katı (pikseller eşit görünsün). Pencere 480x270'ten küçükse kesirli sığdırır.
export function fitScale(winW, winH, baseW = 480, baseH = 270) {
  const k = Math.min(winW / baseW, winH / baseH);
  if (!(k > 0)) return 1;
  return k >= 1 ? Math.floor(k) : k;
}
export function makeCanvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  return { c, x };
}
