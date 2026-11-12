// KOR — net piksel ölçekleme. Tuval, CİHAZ pikselinde 480x270'in tam sayı katı olur ve tam cihaz
// pikseline oturur: Windows %125/%150 ölçek ya da tarayıcı yakınlaştırmasında yazı bulanmaz, pikseller eşit kalır.
// Pencere 480x270 cihaz pikselinden küçükse kesirli sığdırılır ve yumuşak örnekleme açılır (html.soft):
// en yakın komşu küçültme bitmap fontun satırlarını yutardı.
export function installFit() {
  if (typeof document === 'undefined' || !document.documentElement || !document.documentElement.style) return;
  const root = document.documentElement, st = root.style;
  if (typeof st.setProperty !== 'function') return;
  const fit = () => {
    const dpr = window.devicePixelRatio || 1;
    const dw = Math.floor(window.innerWidth * dpr), dh = Math.floor(window.innerHeight * dpr);
    if (!(dw > 0 && dh > 0)) return;              // pencere henüz ölçülmemiş: CSS yedeği kalır, sonra yeniden denenir
    const n = Math.floor(Math.min(dw / 480, dh / 270));
    let pw, ph;                                   // cihaz pikseli cinsinden tuval boyutu
    if (n >= 1) { pw = 480 * n; ph = 270 * n; }
    else { const k = Math.min(dw / 480, dh / 270); pw = Math.max(1, Math.floor(480 * k)); ph = Math.max(1, Math.floor(270 * k)); }
    st.setProperty('--cw', (pw / dpr) + 'px');
    st.setProperty('--ch', (ph / dpr) + 'px');
    st.setProperty('--cx', (Math.max(0, Math.floor((dw - pw) / 2)) / dpr) + 'px');
    st.setProperty('--cy', (Math.max(0, Math.floor((dh - ph) / 2)) / dpr) + 'px');
    if (root.classList) root.classList.toggle('soft', n < 1);
    if (root.dataset) root.dataset.scale = n >= 1 ? String(n) : 'kesirli';
  };
  fit();
  window.addEventListener('resize', fit);
  window.addEventListener('load', fit);
  if (window.requestAnimationFrame) window.requestAnimationFrame(fit);
  setTimeout(fit, 120);
  // tarayıcı yakınlaştırması / ekran değişimi: devicePixelRatio değişince yeniden hesapla
  if (window.matchMedia) {
    const watch = () => {
      const mq = window.matchMedia('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx)');
      const on = () => { fit(); watch(); };
      if (mq.addEventListener) mq.addEventListener('change', on, { once: true });
    };
    watch();
  }
}
