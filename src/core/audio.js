// KOR — tamamen prosedürel WebAudio ses motoru
let ac = null, master = null, musicGain = null, sfxGain = null, started = false;
let noiseBuf = null;
const live = new Set();

export function initAudio() {
  if (started) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  master = ac.createGain(); master.gain.value = muted ? 0 : 0.55; master.connect(ac.destination);
  sfxGain = ac.createGain(); sfxGain.gain.value = 0.9; sfxGain.connect(master);
  musicGain = ac.createGain(); musicGain.gain.value = 0.0; musicGain.connect(master);
  // gürültü tamponu
  const len = Math.floor(ac.sampleRate * 1.2);
  noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  started = true;
  startMusic();
}
export const audioReady = () => started;
export function resumeAudio() { if (ac && ac.state === 'suspended') ac.resume(); }
export function setMaster(v) { if (master) master.gain.value = muted ? 0 : v; }
// M tuşu: sesi aç/kapat (ses motoru henüz başlamadıysa da durum hatırlanır)
let muted = false;
export const isMuted = () => muted;
export function setMuted(m) { muted = !!m; if (master) master.gain.value = muted ? 0 : 0.55; }

// ses çeşitlemesi için ayrı üreteç: oyun mantığının Math.random dizisini etkilemez
let as = 0x2545f491;
function ar() { as ^= as << 13; as >>>= 0; as ^= as >> 17; as ^= as << 5; as >>>= 0; return as / 4294967296; }
function env(g, t, a, d, peak = 1) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function noise(dur, filterType, freq, q, gain, slideTo, when = 0) {
  if (!started) return;
  const t = ac.currentTime + when;
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
  const g = ac.createGain(); env(g, t, 0.002, dur, gain);
  s.connect(f); f.connect(g); g.connect(sfxGain);
  if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  s.start(t); s.stop(t + dur + 0.05);
}
function tone(freq, dur, type, gain, slideTo, when = 0) {
  if (!started) return;
  const t = ac.currentTime + when;
  const o = ac.createOscillator(); o.type = type; o.frequency.value = freq;
  const g = ac.createGain(); env(g, t, 0.004, dur, gain);
  o.connect(g); g.connect(sfxGain);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  o.start(t); o.stop(t + dur + 0.05);
}

// katmanlı efektler: gövde (alçak ton), çatırtı (süzülmüş gürültü), tını (kısa parlak ton)
export const sfx = {
  // kesim: tok gövde + ince "çıt" + odun yankısı. combo ilerledikçe perde hafifçe yükselir.
  chop(power = 1, combo = 0) {
    const pc = 1 + Math.min(10, combo) * 0.035, j = 0.96 + Math.random() * 0.08, j2 = Math.random();
    tone(128 * pc * j, 0.11, 'sine', 0.36 * power, 52 * pc);                          // tok gövde
    tone(64 * pc, 0.09, 'triangle', 0.2 * power, 40);                                  // alt vuruş
    noise(0.022, 'highpass', 3200, 0.9, 0.34 * power);                                 // ince "çıt"
    noise(0.05, 'bandpass', (1700 + Math.random() * 500) * pc, 1.8, 0.36 * power, 620 + j2 * 80); // talaş çatırtısı
    noise(0.13, 'lowpass', 640, 0.8, 0.2 * power, 140, 0.012);                         // odun yankısı
    tone(330 * pc * j, 0.045, 'triangle', 0.07 * power, 215 * pc);
  },
  crit() {
    tone(95, 0.16, 'sine', 0.4, 40);
    noise(0.16, 'bandpass', 2800, 2.2, 0.45, 600);
    tone(1250, 0.12, 'square', 0.05, 900); tone(1870, 0.1, 'square', 0.035, 1300);   // metal tını
  },
  felled() {
    // kopma: sert çatırtı dizisi + gıcırdayarak yatma + hışırtı (yere çarpma ayrı: thud)
    tone(96, 0.14, 'sine', 0.42, 44);
    for (let i = 0; i < 5; i++) noise(0.028, 'bandpass', 1300 + ar() * 2400, 2.6, 0.34 - i * 0.04, 500, i * 0.035 + ar() * 0.015);
    tone(170, 0.5, 'sawtooth', 0.06, 62, 0.05);                                       // gıcırtı
    noise(0.4, 'bandpass', 520, 4, 0.16, 240, 0.05);
    noise(0.6, 'lowpass', 900, 1, 0.34, 80, 0.14);                                    // devrilme hışırtısı
  },
  thud() { tone(70, 0.35, 'sine', 0.5, 32); noise(0.3, 'lowpass', 400, 0.7, 0.45, 60); noise(0.4, 'highpass', 2500, 0.6, 0.08, 6000); },
  deposit(n = 1) { for (let i = 0; i < Math.min(n, 5); i++) { tone(140 - i * 8, 0.08, 'sine', 0.18, 70, i * 0.06); noise(0.05, 'bandpass', 1200, 2, 0.12, 500, i * 0.06); } },
  feed() {
    noise(0.7, 'highpass', 300, 0.7, 0.35, 2200);                                     // alev yükselişi
    tone(80, 0.6, 'sawtooth', 0.12, 45);                                              // uğultu
    for (let i = 0; i < 6; i++) noise(0.03, 'bandpass', 1500 + Math.random() * 2500, 3, 0.18, null, 0.08 + Math.random() * 0.5); // çıtırtı
  },
  hurt() { noise(0.22, 'lowpass', 700, 1, 0.5, 120); tone(160, 0.2, 'square', 0.14, 70); },
  dash() { noise(0.18, 'highpass', 900, .7, 0.22, 2600); },
  skill() { tone(300, 0.22, 'sawtooth', 0.13, 900); noise(0.3, 'bandpass', 1800, 1, 0.3, 400); },
  levelup() { [440, 554, 659, 880].forEach((f, i) => tone(f, 0.24, 'triangle', 0.13, null, i * 0.08)); tone(1320, 0.4, 'sine', 0.07, null, 0.32); noise(0.5, 'highpass', 4000, 0.7, 0.07, 9000, 0.3); },
  buy() { tone(660, 0.1, 'square', 0.1, 990); tone(990, 0.12, 'triangle', 0.08, 1320, 0.06); },
  deny() { tone(150, 0.13, 'square', 0.11, 100); },
  // kilitli ağaçtan sekme: tok metalik "tınk"
  clank() {
    tone(1180, 0.16, 'triangle', 0.16, 1120); tone(1770, 0.11, 'sine', 0.09, 1700); tone(2630, 0.07, 'sine', 0.05);
    tone(120, 0.07, 'sine', 0.3, 60); noise(0.03, 'highpass', 4200, 1, 0.22);
  },
  // odun toplama: kısa tok "tok" (art arda toplamada perde yükselir)
  collect(n = 0) { const f = 190 + Math.min(8, n) * 22; tone(f, 0.06, 'sine', 0.24, f * 0.55); noise(0.025, 'bandpass', 1500, 2, 0.12); tone(f * 2.5, 0.04, 'triangle', 0.05, f * 2); },
  uiMove() { tone(520, 0.03, 'square', 0.035); },
  uiPick() { tone(420, 0.05, 'triangle', 0.07, 640); noise(0.03, 'highpass', 3000, 1, 0.05); },
  stick() { tone(210, 0.05, 'sine', 0.2, 110); noise(0.03, 'bandpass', 2400, 2, 0.2, 900); },
  frost() { tone(1400, 0.3, 'sine', 0.08, 2100); tone(2100, 0.25, 'triangle', 0.05, 2900, 0.04); noise(0.3, 'highpass', 5000, 0.8, 0.12, 9000); },
  enemyDie() { noise(0.3, 'lowpass', 500, 1, 0.4, 80); tone(220, 0.25, 'sawtooth', 0.1, 55); noise(0.6, 'highpass', 3000, 0.5, 0.08, 8000, 0.05); },
  fireDeath() { noise(1.2, 'lowpass', 600, .7, 0.6, 40); },
  swing() { noise(0.11, 'highpass', 1500, .8, 0.16, 4000); },
  pickup() { tone(780, 0.09, 'triangle', 0.09, 1180); },
  // yay: kiriş tınlaması (hızlı sönen iki ton) + ok ıslığı
  shoot() {
    tone(240, 0.11, 'triangle', 0.17, 150); tone(482, 0.07, 'sawtooth', 0.045, 300);
    noise(0.014, 'highpass', 3000, 1, 0.2); noise(0.1, 'bandpass', 2600, 1.2, 0.12, 5600, 0.01);
  },
  cast() { tone(380, 0.14, 'sine', 0.12, 720); noise(0.12, 'bandpass', 1500, 1, 0.1, 3200); },
  boom(big = false) { tone(big ? 70 : 110, big ? 0.5 : 0.25, 'sawtooth', big ? 0.3 : 0.18, big ? 28 : 40); noise(big ? 0.6 : 0.3, 'lowpass', 900, 1, big ? 0.5 : 0.32, big ? 60 : 120); noise(0.05, 'bandpass', 2200, 1.5, 0.16, 700); },
};

// ortam: düşük ateş uğultusu + ara sıra çıtırtı
function startMusic() {
  musicGain.gain.linearRampToValueAtTime(0.16, ac.currentTime + 3);
  const drone = ac.createOscillator(); drone.type = 'sawtooth'; drone.frequency.value = 55;
  const df = ac.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 260;
  const dg = ac.createGain(); dg.gain.value = 0.35;
  drone.connect(df); df.connect(dg); dg.connect(musicGain); drone.start();
  const fifth = ac.createOscillator(); fifth.type = 'sine'; fifth.frequency.value = 82.5;
  const fg = ac.createGain(); fg.gain.value = 0.16;
  fifth.connect(fg); fg.connect(musicGain); fifth.start();
  const lfo = ac.createOscillator(); lfo.frequency.value = 0.08;
  const lg = ac.createGain(); lg.gain.value = 90;
  lfo.connect(lg); lg.connect(df.frequency); lfo.start();
  const crackle = () => {
    if (!started) return;
    noise(0.05 + Math.random() * 0.07, 'bandpass', 900 + Math.random() * 2600, 3, 0.05 + Math.random() * 0.06);
    setTimeout(crackle, 180 + Math.random() * 900);
  };
  setTimeout(crackle, 400);
}
export function setMusicIntensity(v) {
  if (musicGain) musicGain.gain.value = 0.1 + v * 0.18;
}
