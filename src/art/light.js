// KOR — ışık sprite'ları: bantlı + dither'lı radyal delikler/parıltılar, kenar uyarısı, vinyet.
// Hepsi yarıçapa göre önbelleklenir; kare başı gradient/canvas üretilmez.
import { cached, imageFill } from './pix.js';
import { bayer } from './palette.js';

const BANDS = 6;
// yarıçap kademesi: küçükte 2px, büyükte 4px (önbellek sınırlı kalır)
const qr = r => (r < 40 ? Math.max(2, Math.round(r / 2) * 2) : Math.min(200, Math.round(r / 4) * 4));
const qp = p => Math.max(0.05, Math.min(1, Math.round(p * 20) / 20));   // parlaklık 0.05 adım

function banded(v, x, y) {
  const lv = v * BANDS;
  const b = Math.floor(lv);
  return (bayer(x, y) < lv - b ? b + 1 : b) / BANDS;
}

// lightHole(r): karanlık katmanından destination-out ile oyulacak delik (düşük çözünürlük pikseli)
export function lightHole(rIn) {
  const r = qr(rIn);
  return cached('lh' + r, r * 2, r * 2, (x, w, h) => {
    imageFill(x, w, h, (px, py, out) => {
      const d = Math.hypot(px + 0.5 - r, py + 0.5 - r) / r;
      if (d >= 1) return;
      const f = 1 - d;
      const v = Math.min(1, f * f * (3 - 2 * f) * 1.25);
      const a = banded(v, px, py);
      if (a <= 0) return;
      out[0] = 0; out[1] = 0; out[2] = 0; out[3] = (a * 255) | 0;
    });
  });
}

// lightGlow(r, rgb): 'lighter' ile eklenen sıcak parıltı
export function lightGlow(rIn, col = [255, 140, 50], peakIn = 0.5) {
  const r = qr(rIn), peak = qp(peakIn);
  return cached('lg' + r + col.join(',') + peak, r * 2, r * 2, (x, w, h) => {
    imageFill(x, w, h, (px, py, out) => {
      const d = Math.hypot(px + 0.5 - r, py + 0.5 - r) / r;
      if (d >= 1) return;
      const f = 1 - d;
      const a = banded(f * f, px, py) * peak;
      if (a <= 0) return;
      out[0] = col[0]; out[1] = col[1]; out[2] = col[2]; out[3] = (a * 255) | 0;
    });
  });
}

// ekran kenarı parıltısı (uyarı nabzı) — beyaz üretilir, renkli kopya önbelleklenir
function edgeBase(w, h) {
  return cached('edgeB' + w + 'x' + h, w, h, (x) => {
    imageFill(x, w, h, (px, py, out) => {
      const ex = Math.min(px, w - 1 - px) / (w * 0.22), ey = Math.min(py, h - 1 - py) / (h * 0.26);
      const e = Math.min(ex, ey);
      if (e >= 1) return;
      const a = banded(Math.pow(1 - e, 1.6), px, py);
      if (a <= 0) return;
      out[0] = 255; out[1] = 255; out[2] = 255; out[3] = (a * 255) | 0;
    });
  });
}
export function edgeGlow(color, w = 240, h = 135) {
  return cached('edge' + color + w, w, h, (x) => {
    x.drawImage(edgeBase(w, h), 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color; x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = 'source-over';
  });
}

export function vignette(w = 240, h = 135) {
  return cached('vig' + w, w, h, (x) => {
    imageFill(x, w, h, (px, py, out) => {
      const dx = (px + 0.5 - w / 2) / (w / 2), dy = (py + 0.5 - h / 2) / (h / 2);
      const d = Math.hypot(dx * 0.9, dy);
      if (d < 0.62) return;
      const a = banded(Math.min(1, (d - 0.62) / 0.75), px, py) * 0.62;
      out[0] = 3; out[1] = 3; out[2] = 10; out[3] = (a * 255) | 0;
    });
  });
}

// zemin gölgesi: dither'lı yumuşak elips (tam çözünürlük)
export function shadowEllipse(rx, ry, alphaIn = 0.42) {
  const alpha = qp(alphaIn);
  rx = Math.max(2, Math.round(rx)); ry = Math.max(1, Math.round(ry));
  return cached('sh' + rx + 'x' + ry + alpha, rx * 2, ry * 2, (x, w, h) => {
    imageFill(x, w, h, (px, py, out) => {
      const nx = (px + 0.5 - rx) / rx, ny = (py + 0.5 - ry) / ry;
      const d = nx * nx + ny * ny;
      if (d >= 1) return;
      const v = d < 0.45 ? 1 : d < 0.75 ? (bayer(px, py) < 0.6 ? 1 : 0.6) : (bayer(px, py) < 0.4 ? 0.6 : 0);
      if (!v) return;
      out[0] = 4; out[1] = 4; out[2] = 12; out[3] = (v * alpha * 255) | 0;
    });
  });
}
