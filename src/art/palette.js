// KOR — sınırlı palet (32 renk + 2 ten tonu; sınıf portreleri için eklendi). Sıcak kor rampası ile soğuk gece rampası karşıtlığı.
export const PAL = {
  // soğuk gece / gölge rampası
  C0: '#07080f', C1: '#0e1120', C2: '#1a2038', C3: '#2b3352', C4: '#4a5578',
  // yaprak ve çim
  G0: '#16261a', G1: '#20361f', G2: '#2e4a26', G3: '#45662f', G4: '#6b8c3a', G5: '#a3b65a',
  // odun ve toprak
  W0: '#140d0a', W1: '#24170f', W2: '#3a2617', W3: '#573a22', W4: '#7d5733', W5: '#a87c4a',
  // kor ve ateş
  E0: '#5c120b', E1: '#9a240f', E2: '#d8461a', E3: '#ff7a26', E4: '#ffb447', E5: '#ffe08a', E6: '#fff6d6',
  // kül ve kemik
  A0: '#4a4541', A1: '#7a736a', A2: '#b3aa9b', A3: '#e9e0cc',
  // vurgular
  R: '#c8352a', F: '#8fd3ff', S: '#a9bccb', V: '#b9a6ff',
  // ten (sınıf sprite'ları): açık, gölge
  N1: '#e2ad84', N0: '#b77a55',
};

// ikon/ızgara çizimleri için tek harf eşlemesi
export const CH = {
  k: PAL.C0, x: PAL.C1, n: PAL.C2, m: PAL.C3, b: PAL.C4,
  q: PAL.G0, p: PAL.G1, g: PAL.G2, G: PAL.G3, l: PAL.G4, L: PAL.G5,
  K: PAL.W0, d: PAL.W1, D: PAL.W2, h: PAL.W3, H: PAL.W4, j: PAL.W5,
  e: PAL.E0, r: PAL.E1, o: PAL.E2, O: PAL.E3, y: PAL.E4, Y: PAL.E5, W: PAL.E6,
  a: PAL.A0, A: PAL.A1, c: PAL.A2, C: PAL.A3,
  R: PAL.R, f: PAL.F, s: PAL.S, v: PAL.V,
};

const rgbCache = new Map();
export function rgb(hex) {
  let v = rgbCache.get(hex);
  if (!v) {
    const n = parseInt(hex.slice(1), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache.set(hex, v);
  }
  return v;
}

// Bayer 4x4 düzenli dither eşiği (0..1)
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x, y) => (B4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
