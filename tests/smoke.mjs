// KOR duman testi: elle yazılmış DOM/Canvas/AudioContext taklitleriyle oyunu Node içinde çalıştırır.
// Çalıştır: npm test
import assert from 'node:assert/strict';

// ---------- tohumlu rastgelelik ----------
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let seedRng = mulberry32(12345);
Math.random = () => seedRng();
const reseed = n => { seedRng = mulberry32(n); };

// ---------- DOM taklidi ----------
const noop = () => {};
class El {
  constructor(tag = 'div') {
    this.tag = tag; this.children = []; this.style = {}; this.dataset = {};
    this._cls = new Set(); this.textContent = ''; this._html = ''; this.width = 300; this.height = 150;
    this.listeners = {}; this.offsetWidth = 0; this.title = ''; this.className = '';
    const self = this;
    this.classList = {
      add(...c) { c.forEach(x => self._cls.add(x)); },
      remove(...c) { c.forEach(x => self._cls.delete(x)); },
      toggle(c, f) { const on = f === undefined ? !self._cls.has(c) : !!f; on ? self._cls.add(c) : self._cls.delete(c); return on; },
      contains(c) { return self._cls.has(c); },
    };
    this._q = new Map();
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = v; this.children = []; this._q.clear(); }
  appendChild(c) { this.children.push(c); return c; }
  remove() {}
  querySelector(sel) { if (!this._q.has(sel)) this._q.set(sel, new El()); return this._q.get(sel); }
  querySelectorAll() { return []; }
  setAttribute() {}
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  getBoundingClientRect() { return { left: 0, top: 0, width: this.width, height: this.height }; }
  getContext() { return this._ctx ||= makeCtx(); }
  fire(t, ev) { (this.listeners[t] || []).forEach(f => f(ev)); }
}
function makeCtx() {
  const store = {};
  return new Proxy(store, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop: noop });
      if (k === 'measureText') return () => ({ width: 10 });
      return noop;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
const els = new Map();
const globalListeners = {};
globalThis.window = globalThis;
globalThis.document = {
  getElementById(id) {
    if (!els.has(id)) {
      const e = new El(id === 'game' ? 'canvas' : 'div');
      if (id === 'game') { e.width = 480; e.height = 270; }
      els.set(id, e);
    }
    return els.get(id);
  },
  createElement: tag => new El(tag),
  get hidden() { return false; },
};
globalThis.addEventListener = (t, f) => { (globalListeners[t] ||= []).push(f); };
globalThis.requestAnimationFrame = noop;
const gain = () => ({ value: 0, setValueAtTime: noop, exponentialRampToValueAtTime: noop, linearRampToValueAtTime: noop });
globalThis.AudioContext = class {
  constructor() { this.sampleRate = 44100; this.currentTime = 0; this.state = 'running'; this.destination = {}; }
  createGain() { return { gain: gain(), connect: noop }; }
  createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; }
  createBufferSource() { return { connect: noop, start: noop, stop: noop }; }
  createBiquadFilter() { return { type: '', frequency: gain(), Q: { value: 0 }, connect: noop }; }
  createOscillator() { return { type: '', frequency: gain(), connect: noop, start: noop, stop: noop }; }
  resume() {}
};

// ---------- yardımcılar ----------
const results = [];
async function test(name, fn) {
  try { await fn(); results.push([name, true]); console.log('  ok   ' + name); }
  catch (e) { results.push([name, false]); console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); }
}
const keyEv = code => ({ code, preventDefault: noop });
const heldKeys = new Set();
const press = code => { heldKeys.add(code); (globalListeners.keydown || []).forEach(f => f(keyEv(code))); };
const release = code => { heldKeys.delete(code); (globalListeners.keyup || []).forEach(f => f(keyEv(code))); };
const releaseAll = () => { for (const k of [...heldKeys]) release(k); };
const canvas = document.getElementById('game');
const aimAt = (g, wx, wy) => canvas.fire('mousemove', { clientX: wx - g.cam.x, clientY: wy - g.cam.y });
const DT = 1 / 60;
function step(g) { g.update(DT); g.draw(); }
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function nonFinite(root) {
  const seen = new Set(), bad = [];
  (function walk(o, path) {
    if (o === null || typeof o === 'function') return;
    if (typeof o === 'number') { if (!Number.isFinite(o)) bad.push(path + '=' + o); return; }
    if (typeof o !== 'object' || seen.has(o) || o instanceof El) return;
    seen.add(o);
    if (o instanceof Set || o instanceof Map) return;
    for (const k of Object.keys(o)) {
      if (k === 'ctx' || k === 'lctx' || k === 'canvas' || k === 'light' || k === 'frames' || k === '_vignette') continue;
      walk(o[k], path + '.' + k);
    }
  })(root, 'game');
  return bad;
}

const { Game, AUTO_REPEAT, TREE_FLASH } = await import('../src/game.js');
const { HIT_STOP } = await import('../src/systems/fx.js');
const { nodeRect, LABEL_Y } = await import('../src/art/treeui.js');
const { computeStats, NODES, nodesOf, buyNode, nodeUnlocked, nodeCost, prevNode, nodeById } = await import('../src/systems/skills.js');
const { CLASSES, CLASS_IDS, classBars } = await import('../src/systems/classes.js');
const { ABILITIES } = await import('../src/systems/abilities.js');
const { TREE_TIERS } = await import('../src/world/world.js');
const { mouseState } = await import('../src/core/input.js');
const { fitScale } = await import('../src/core/util.js');
const { FONT_CHARS, wrapText } = await import('../src/art/font.js');
const { Enemy } = await import('../src/entities/enemy.js');
const game = new Game(canvas);          // localStorage yok: yine de çalışmalı
const startBtn = document.getElementById('startBtn');
const retryBtn = document.getElementById('retryBtn');
const changeBtn = document.getElementById('changeBtn');
const node = id => NODES.find(n => n.id === id);

// bir sınıfla temiz oyun başlat (sınıf seçim ekranından geçer)
function pickClass(cid) {
  releaseAll();
  game.openClassSelect();
  assert.equal(game.state, 'classSelect');
  assert.ok(game.selectClass(cid));
  assert.equal(game.state, 'play');
  game.spawnT = 1e9;           // test sırasında düşman çıkmasın
  game.enemies.length = 0;
  return game.player;
}
const aliveOf = type => game.world.trees.filter(t => !t.dead && t.type === type);
const nearestOf = (type, p = game.fire) => aliveOf(type).sort((a, b) => dist(a, p) - dist(b, p))[0];
// tek ağaç dışında hepsini sustur: ok/büyü başka ağaca takılmasın
function isolate(tree) {
  for (const t of game.world.trees) if (t !== tree) { t.dead = true; t.delayed = 1e9; }
}
function place(x, y) {
  const p = game.player;
  p.x = x; p.y = y; game.cam.x = x - 240; game.cam.y = y - 135;
  game.fire.fuel = 200;
  p.warmth = game.stats.maxWarmth;
}
// tüm düğümleri sırayla al (puan sınırsız)
function buyAll(cid = game.classId) {
  for (const n of nodesOf(cid)) {
    for (let i = 0; i < n.max; i++) { game.points += 50; game.tryBuy(n); }
  }
}

console.log('KOR duman testi');

await test('baslik -> sinif secimi -> oyun akisi', () => {
  game.draw();
  assert.equal(game.state, 'title');
  startBtn.onclick();
  assert.equal(game.state, 'classSelect');
  game.draw(); game.draw();
  assert.ok(document.getElementById('title').classList.contains('hidden'));
  assert.ok(!document.getElementById('classSel').classList.contains('hidden'));
  // klavye: D ile sonraki, A ile onceki, Enter ile sec
  game.classIdx = 0;
  press('KeyD'); release('KeyD'); assert.equal(game.classIdx, 1);
  press('ArrowRight'); release('ArrowRight'); assert.equal(game.classIdx, 2);
  press('KeyD'); release('KeyD'); assert.equal(game.classIdx, 0, 'basa sarmadi');
  press('KeyA'); release('KeyA'); assert.equal(game.classIdx, 2);
  press('Enter'); release('Enter');
  assert.equal(game.state, 'play'); assert.equal(game.classId, 'buyucu');
  // ESC ile geri (sinif secimi -> baslik)
  game.openClassSelect(); press('Escape'); release('Escape');
  assert.equal(game.state, 'title');
  // fare ile tikla
  startBtn.onclick();
  document.getElementById('clsBtn1').onclick();
  assert.equal(game.state, 'play'); assert.equal(game.classId, 'okcu');
  game.openClassSelect(); press('Space'); release('Space');
  assert.equal(game.state, 'play');
  assert.equal(game.selectClass('yok'), false);
});

await test('sinif verisi: 3 sinif, metinler, cubuklar, yazi tipi karakterleri', () => {
  assert.deepEqual(CLASS_IDS, ['baltaci', 'okcu', 'buyucu']);
  const ok = s => [...s].every(ch => FONT_CHARS.includes(ch) || FONT_CHARS.includes(ch.toUpperCase()));
  for (const cid of CLASS_IDS) {
    const c = CLASSES[cid];
    assert.equal(c.id, cid);
    assert.ok(c.name && c.tagline && c.tagline.length <= 40, 'tagline kisa degil: ' + c.tagline);
    assert.ok(c.desc.length >= 2 && c.desc.length <= 3);
    assert.ok(c.baseStats && c.primary && c.branches.length === 3 && c.abilities.length === 4);
    const texts = [c.name, c.tagline, c.primary.name, ...c.desc, ...c.branches.flatMap(b => [b.name, b.hint]),
      ...c.nodes.flatMap(n => [n.name, n.desc]), ...c.abilities.map(a => ABILITIES[a].name)];
    for (const t of texts) assert.ok(ok(t), `yazi tipinde olmayan karakter: ${t}`);
    const b = classBars(c);
    for (const k of ['hp', 'speed', 'dmg', 'range']) assert.ok(b[k] > 0 && b[k] <= 1, `${cid}.${k}`);
  }
  assert.ok(CLASSES.baltaci.baseStats.maxHp > CLASSES.okcu.baseStats.maxHp && CLASSES.okcu.baseStats.maxHp > CLASSES.buyucu.baseStats.maxHp, 'can sirasi baltaci > okcu > buyucu degil');
  assert.ok(CLASSES.okcu.baseStats.moveSpeed > CLASSES.baltaci.baseStats.moveSpeed);
});

await test('(a) her sinif: 3600 adim tohumlu rastgele girdi, yetenekler dahil, sayilar sonlu', () => {
  for (const cid of CLASS_IDS) {
    reseed(777);
    pickClass(cid);
    buyAll(cid);
    assert.ok(CLASSES[cid].abilities.every(a => game.abilities.has(a)), cid + ': yetenekler acilmadi');
    game.spawnT = 8;           // gercek dusman akisi
    let restarts = 0;
    const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
    const held = new Set();
    for (let i = 0; i < 3600; i++) {
      if (i % 12 === 0) {
        for (const k of keys) {
          const on = Math.random() < 0.4;
          if (on && !held.has(k)) { press(k); held.add(k); }
          if (!on && held.has(k)) { release(k); held.delete(k); }
        }
        const on = Math.random() < 0.6;
        if (on && !held.has('Space')) { press('Space'); held.add('Space'); }
        if (!on && held.has('Space')) { release('Space'); held.delete('Space'); }
        canvas.fire('mousemove', { clientX: Math.random() * 480, clientY: Math.random() * 270 });
      }
      if (i % 25 === 0) { press('KeyE'); release('KeyE'); }
      if (i % 40 === 0) { press('ShiftLeft'); release('ShiftLeft'); }
      if (i % 30 === 5) { press('Digit1'); release('Digit1'); }
      if (i % 45 === 7) { press('Digit2'); release('Digit2'); }
      if (i % 50 === 9) { press('Digit3'); release('Digit3'); }
      if (i % 90 === 11) { press('KeyQ'); release('KeyQ'); }
      if (i === 900) {
        press('KeyF'); step(game); assert.ok(game.treeOpen);
        press('Escape'); step(game); assert.ok(!game.treeOpen); release('Escape'); release('KeyF');
      }
      if (i === 1500) { press('KeyP'); step(game); assert.ok(game.paused); press('KeyP'); release('KeyP'); assert.ok(!game.paused); }
      if (game.state === 'death') { restarts++; retryBtn.onclick(); assert.equal(game.classId, cid); }
      step(game);
      if (i % 300 === 0) assert.deepEqual(nonFinite(game), [], cid);
    }
    for (const k of held) release(k);
    assert.deepEqual(nonFinite(game), [], cid);
    console.log(`       ${cid}: olum/yeniden ${restarts}, dusman ${game.enemies.length}, sure ${game.time.toFixed(1)}sn, vurus ${game.player.attacks}`);
  }
});

function freshGame() {
  releaseAll();
  pickClass('baltaci');
}

await test('(b) baltaci: agac kesince odun sayisi artar (huş 3-4 vuruş)', () => {
  freshGame();
  const p = game.player;
  const tree = nearestOf('birch', p);
  isolate(tree);
  place(tree.x, tree.y + 22);
  const before = p.carried, stumps = game.world.stumps.length;
  let hits = 0;
  press('Space');
  for (let i = 0; i < 600 && !tree.dead; i++) { aimAt(game, tree.x, tree.y); step(game); hits = Math.max(hits, tree.hitCount); }
  release('Space');
  assert.ok(tree.dead, 'agac kesilemedi');
  assert.ok(hits >= 2 && hits <= 4, 'huş ' + hits + ' vurusta devrildi (beklenen 3-4)');
  assert.equal(game.world.stumps.length, stumps + 1);
  for (let i = 0; i < 400 && game.pickups.length; i++) {
    const k = game.pickups[0];
    p.x += Math.sign(k.x - p.x) * 1.2; p.y += Math.sign(k.y - p.y) * 1.2;
    aimAt(game, k.x, k.y); step(game);
  }
  assert.ok(p.carried > before, `odun artmadi: ${before} -> ${p.carried}`);
});

for (const cid of CLASS_IDS) {
  await test(`(b) ${cid}: birincil saldiri birch agacini devirir ve odun toplanir (${CLASSES[cid].primary.type})`, () => {
    pickClass(cid);
    const p = game.player;
    const tree = nearestOf('birch', p);
    isolate(tree);
    const melee = p.isMelee;
    place(tree.x, tree.y + (melee ? 22 : 110));   // menzilliler uzaktan
    const treePos = { x: tree.x, y: tree.y };   // devrilince agac baska yerde yeniden dogar
    const startDist = dist(p, treePos);
    let hits = 0, hp0 = game.stats.maxHp;
    press('Space');
    for (let i = 0; i < 900 && !tree.dead; i++) {
      aimAt(game, tree.x, tree.y); step(game);
      hits = Math.max(hits, tree.hitCount);
      p.hp = hp0;
    }
    release('Space');
    assert.ok(tree.dead, cid + ': agac devrilmedi');
    assert.ok(Math.abs(dist(p, treePos) - startDist) < 30, 'oyuncu yerinden oynadi');
    assert.ok(hits >= 2 && hits <= 9, cid + ': vurus sayisi ' + hits);
    const before = p.carried;
    for (let i = 0; i < 600 && game.pickups.length; i++) {
      const k = game.pickups[0];
      p.x += Math.sign(k.x - p.x) * 1.6; p.y += Math.sign(k.y - p.y) * 1.6;
      aimAt(game, k.x, k.y); step(game);
    }
    assert.ok(p.carried > before, `${cid}: odun toplanmadi ${before} -> ${p.carried}`);
  });
}

await test('agac katmanlari: huş ~4, meşe en çok ~8 vuruş (baltaci, yukseltmesiz)', () => {
  freshGame();
  const p = game.player;
  for (const [type, lo, hi] of [['birch', 3, 4], ['oak', 5, 8]]) {
    const tree = nearestOf(type, p);
    isolate(tree);
    place(tree.x, tree.y + 24);
    let hits = 0;
    press('Space');
    for (let i = 0; i < 900 && !tree.dead; i++) { aimAt(game, tree.x, tree.y); step(game); hits = Math.max(hits, tree.hitCount); }
    release('Space');
    assert.ok(tree.dead, type + ' devrilmedi');
    assert.ok(hits >= lo && hits <= hi, `${type}: ${hits} vurus (beklenen ${lo}-${hi})`);
    freshGame();
  }
});

await test('agac hasar evresi (0-3), son vurus yonu/zamani alanlari', () => {
  freshGame();
  const tree = nearestOf('oak');
  isolate(tree);
  place(tree.x + 30, tree.y + 4);
  const t0 = game.time;
  assert.equal(tree.dmgStage, 0); assert.equal(tree.hitCount, 0);
  const stages = [];
  game.time = 5;
  let last = null;
  for (let i = 0; i < 20 && !tree.dead; i++) {
    game.hitTree(tree, 8, false, false, Math.PI);   // sagdan sola vurus
    if (!tree.dead) { stages.push(tree.dmgStage); last = { dir: tree.hitDir, ang: tree.hitAng, t: tree.lastHitT, n: tree.hitCount }; }
  }
  assert.ok(stages[0] <= 1 && stages.at(-1) >= 2, 'evreler ' + stages);
  assert.ok(stages.every((s, i) => i === 0 || s >= stages[i - 1]), 'evre geri gitti');
  assert.ok(stages.every(s => s >= 0 && s <= 3));
  assert.equal(last.dir, -1);
  assert.ok(Math.abs(last.ang - Math.PI) < 1e-9);
  assert.equal(last.t, 5);
  assert.equal(last.n, stages.length);
  // devrilince yeniden dogan agacin vurus durumu sifirlanir
  assert.ok(tree.dead); assert.equal(tree.dmgStage, 0); assert.equal(tree.hitCount, 0);
  game.time = t0;
});

// ---------- (c) beceri agaci ----------
for (const cid of CLASS_IDS) {
  await test(`(c) ${cid}: 3 dal x 4 kademe duz zincir, kilit, computeStats, 4 yetenek acilir ve kullanilir`, () => {
    const c = CLASSES[cid];
    assert.equal(c.nodes.length, 12);
    for (const b of c.branches) {
      const chain = c.nodes.filter(n => n.branch === b.id).sort((x, y) => x.tier - y.tier);
      assert.deepEqual(chain.map(n => n.tier), [1, 2, 3, 4], cid + '/' + b.id);
      chain.forEach((n, i) => {
        assert.ok(n.name.split(/\s+/).length <= 2, 'ad cok uzun: ' + n.name);
        assert.ok(/\d/.test(n.desc), 'aciklamada sayi yok: ' + n.desc);
        assert.ok(n.desc.length <= 60 && !n.desc.includes('. '), 'aciklama tek kisa cumle degil: ' + n.desc);
        assert.ok(wrapText(n.desc, 220).length <= 2, 'aciklama ipucu seridine (2 satir) sigmiyor: ' + n.desc);
        assert.ok(n.max >= 1 && n.max <= 3 && n.cost >= 1 && n.stat);
        assert.ok(!('x' in n) && !('y' in n) && !('req' in n), 'konum ya da capraz gereksinim var: ' + n.id);
        assert.equal(n.cls, cid);
        assert.equal(prevNode(n), i === 0 ? null : chain[i - 1], 'zincir bozuk: ' + n.id);
      });
    }
    // 4. kademe ve tier 1'in ustunde olanlar kilitli; sirayla alinca stat degisir
    pickClass(cid);
    const c4 = c.nodes.filter(n => n.tier === 4);
    for (const n of c.nodes.filter(n => n.tier > 1)) {
      assert.equal(nodeUnlocked(n, game.owned), false);
      game.points = 99;
      const r = buyNode(n, game.owned, 99, cid);
      assert.equal(r.ok, false, 'kilitli dugum alindi: ' + n.id);
      game.tryBuy(n);
      assert.equal(game.owned[n.id], undefined);
      assert.equal(game.points, 99);
    }
    assert.ok(c4.length === 3);
    for (const b of c.branches) {
      for (const n of c.nodes.filter(m => m.branch === b.id).sort((x, y) => x.tier - y.tier)) {
        game.points = 99;
        const before = computeStats(game.owned, cid);
        game.tryBuy(n);
        assert.equal(game.owned[n.id], 1, 'alinamadi: ' + n.id);
        const after = computeStats(game.owned, cid);
        assert.ok(after[n.stat] !== before[n.stat], `${n.id}: ${n.stat} degismedi`);
        assert.deepEqual(game.stats, after);
      }
    }
    // baska sinifin dugumu alinamaz
    const other = nodesOf(CLASS_IDS.find(x => x !== cid))[0];
    game.points = 99; game.tryBuy(other);
    assert.equal(game.owned[other.id], undefined, 'baska sinifin dugumu alindi');
    // 4 yetenek: acilir ve kullanilinca hata vermez
    assert.equal(c.abilities.length, 4);
    for (const id of c.abilities) {
      assert.ok(game.abilities.has(id), 'yetenek acilmadi: ' + id);
      assert.ok(ABILITIES[id].key && ['1', '2', '3', 'Q'].includes(ABILITIES[id].key));
    }
    const p = game.player;
    const tree = nearestOf('birch', p);
    place(tree.x, tree.y + 70);
    game.enemies.push(new Enemy(game, 'cinder', p.x, p.y - 50, 1));
    for (const id of c.abilities) {
      p.warmth = game.stats.maxWarmth; game.abilities.cd[id] = 0;
      aimAt(game, p.x, p.y - 50);
      step(game);
      assert.equal(game.abilities.cast(id), true, 'yetenek kullanilamadi: ' + id);
      for (let i = 0; i < 120; i++) { aimAt(game, p.x, p.y - 50); p.hp = game.stats.maxHp; step(game); }
      assert.ok(game.abilities.cd[id] > 0 || game.abilities.maxCd(id) < 2, 'bekleme baslamadi: ' + id);
    }
    assert.deepEqual(nonFinite(game), [], cid);
  });
}

await test('(c) tuslarla yetenek: 1-2-3-Q sinifin yetenegini kullanir, kilitliyse kullanmaz', () => {
  for (const cid of CLASS_IDS) {
    pickClass(cid);
    const ab = CLASSES[cid].abilities;
    game.player.warmth = game.stats.maxWarmth;
    press('Digit1'); step(game); release('Digit1');
    assert.equal(game.abilities.cd[ab[0]], 0, 'kilitliyken bekleme basladi');
    buyAll(cid);
    game.player.warmth = game.stats.maxWarmth;
    const keys = ['Digit1', 'Digit2', 'Digit3', 'KeyQ'];
    keys.forEach((k, i) => {
      game.player.warmth = game.stats.maxWarmth;
      press(k); step(game); release(k);
      assert.ok(game.abilities.cd[ab[i]] > 0, `${cid}: ${k} -> ${ab[i]} calismadi`);
    });
  }
});

await test('(d) buyucu: buyu ISI harcar; isi sifira yakinken de saldirabilir (zayif)', () => {
  const p = pickClass('buyucu');
  place(game.world.w - 220, 220);          // atesten uzak: isi yenilenmesin
  game.stats.critChance = 0;
  p.warmth = game.stats.maxWarmth;
  const w0 = p.warmth, a0 = p.attacks;
  press('Space');
  for (let i = 0; i < 150; i++) { aimAt(game, p.x + 80, p.y); step(game); }
  release('Space');
  const shots = p.attacks - a0;
  assert.ok(shots >= 2, 'buyucu atis yapmadi: ' + shots);
  const spent = w0 - p.warmth;
  assert.ok(spent >= shots * CLASSES.buyucu.primary.heat * 0.9, `isi harcanmadi: ${spent} / ${shots} atis`);
  // zayif ama kilitli degil
  for (let i = 0; i < 120; i++) step(game);   // topun gitmesini bekle
  game.projectiles.length = 0;
  p.warmth = game.stats.maxWarmth; p.cd = 0; p.swinging = false;
  p.startSwing(); for (let i = 0; i < 12; i++) { aimAt(game, p.x + 80, p.y); step(game); }
  const strong = game.projectiles.find(x => x.kind === 'orb');
  const full = strong ? strong.blast.dmg : null;
  assert.ok(full > 0, 'tam isi kuresi yok');
  game.projectiles.length = 0;
  for (let i = 0; i < 30; i++) step(game);
  p.warmth = 0.5; p.cd = 0; p.swinging = false;
  const n0 = p.attacks;
  p.startSwing(); for (let i = 0; i < 12; i++) { p.warmth = Math.min(p.warmth, 0.5); aimAt(game, p.x + 80, p.y); step(game); }
  assert.equal(p.attacks, n0 + 1, 'isi bitince saldiramadi');
  const weak = game.projectiles.find(x => x.kind === 'orb');
  assert.ok(weak, 'zayif kure yok');
  assert.ok(weak.blast.dmg > 0 && weak.blast.dmg < full * 0.7, `isi dusukken buyu guclu: ${weak.blast.dmg} vs ${full}`);
  assert.ok(p.warmth >= 0);
});

await test('buyucu: kure patlamasi alandaki birden cok agaca ve yaratiga vurur', () => {
  const p = pickClass('buyucu');
  const a = nearestOf('birch', p);
  isolate(a);
  // iki ek agac kur (ayni noktaya yakin)
  const b = game.world.trees.find(t => t !== a && t.type === 'birch');
  const c = game.world.trees.find(t => t !== a && t !== b && t.type === 'birch');
  for (const [t, dx] of [[b, 18], [c, -18]]) { t.dead = false; t.delayed = 0; t.hp = t.maxHp; t.x = a.x + dx; t.y = a.y + 6; }
  const e = new Enemy(game, 'cinder', a.x, a.y + 12, 1); e.hp = e.maxHp = 500; game.enemies.push(e);
  game.fire.fuel = 200;
  game.explode(a.x, a.y, { r: 40, dmg: 10, treeMul: 1, primary: true });
  assert.ok(a.hp < a.maxHp && b.hp < b.maxHp && c.hp < c.maxHp, 'agaclar vurulmadi');
  assert.ok(e.hp < e.maxHp, 'yaratik vurulmadi');
});

await test('okcu: ok ilk carptigi agaca vurur; ucundaki ikinci agac etkilenmez', () => {
  const p = pickClass('okcu');
  const a = nearestOf('birch', p);
  const b = game.world.trees.find(t => t !== a && t.type === 'birch');
  for (const t of game.world.trees) if (t !== a && t !== b) { t.dead = true; t.delayed = 1e9; }
  b.x = a.x; b.y = a.y - 60; b.dead = false; b.hp = b.maxHp;
  place(a.x, a.y + 100);
  game.stats.critChance = 0;
  press('Space');
  for (let i = 0; i < 60; i++) { aimAt(game, a.x, a.y); step(game); }
  release('Space');
  assert.ok(a.hp < a.maxHp || a.dead, 'ilk agac vurulmadi');
  assert.equal(b.hp, b.maxHp, 'ok ilk agaci delip gecti');
});

await test('okcu: delici ok hat boyunca birden cok agaca vurur', () => {
  const p = pickClass('okcu');
  buyAll('okcu');
  const a = nearestOf('birch', p);
  const b = game.world.trees.find(t => t !== a && t.type === 'birch');
  for (const t of game.world.trees) if (t !== a && t !== b) { t.dead = true; t.delayed = 1e9; }
  b.x = a.x; b.y = a.y - 50; b.dead = false; b.hp = b.maxHp;
  place(a.x, a.y + 90);
  p.warmth = game.stats.maxWarmth;
  aimAt(game, a.x, a.y); step(game);
  assert.ok(game.abilities.cast('lance'));
  for (let i = 0; i < 60; i++) { aimAt(game, a.x, a.y); step(game); }
  assert.ok((a.hp < a.maxHp || a.dead) && (b.hp < b.maxHp || b.dead), 'delici ok iki agaca da vurmadi');
});

// ---------- (e) basili tutma ----------
await test('(e) basili tutma: tek sefer basili birakilinca birden cok vurus olur', () => {
  assert.equal(AUTO_REPEAT, true);
  const p = freshGameP();
  place(p.x, p.y);
  const n0 = p.attacks;
  press('Space');                                  // yalnizca bir kez basilir, tekrar basilmaz
  for (let i = 0; i < 180; i++) step(game);        // 3 sn
  release('Space');
  const n = p.attacks - n0;
  assert.ok(n >= 5, `3 sn'de yalnizca ${n} vurus`);
  // fare ile de ayni
  const m0 = p.attacks;
  canvas.fire('mousedown', { clientX: 240, clientY: 100, button: 0 });
  for (let i = 0; i < 180; i++) step(game);
  globalListeners.mouseup.forEach(f => f({}));
  assert.ok(p.attacks - m0 >= 5, 'fare basili tutma tekrarlamadi');
  const after = p.attacks;
  for (let i = 0; i < 60; i++) step(game);
  assert.equal(p.attacks, after, 'birakinca vurmaya devam etti');
});
function freshGameP() { freshGame(); return game.player; }

await test('vurus zamanlamasi: girisden darbe karesine en cok ~90 ms, savururken hareket kilitlenmez', () => {
  for (const cid of CLASS_IDS) {
    const p = pickClass(cid);
    assert.ok(CLASSES[cid].primary.windup <= 0.09, cid + ' windup');
    place(p.x, p.y + 400);
    p.cd = 0; p.swinging = false;
    const n0 = p.attacks;
    let frames = 0;
    press('Space');
    for (; frames < 30 && p.attacks === n0; frames++) { aimAt(game, p.x + 50, p.y); step(game); }
    release('Space');
    assert.equal(p.attacks, n0 + 1);
    assert.ok(frames * DT <= 0.092, `${cid}: darbe ${Math.round(frames * DT * 1000)} ms sonra`);
    assert.equal(p.swingPhase === 'wind', false, 'darbe sonrasi hala hazirlik evresinde');
    // savururken yuru
    p.cd = 0; p.swinging = false; p.vx = p.vy = 0;
    press('Space'); press('KeyD');
    const x0 = p.x;
    for (let i = 0; i < 24; i++) step(game);
    release('Space'); release('KeyD');
    assert.ok(p.x - x0 > 8, cid + ': savururken hareket kilitlendi');
  }
});

await test('yumusak hedef yardimi: nisan 40 derece kaciksa da vurus agaca kilitlenir, 100 derece kaciksa kilitlenmez', () => {
  freshGame();
  const p = game.player;
  const tree = nearestOf('oak', p);
  isolate(tree);
  place(tree.x, tree.y + 26);
  // agac tam kuzeyde (-90 derece); fare 40 derece saga
  const aimAng = -Math.PI / 2 + 40 * Math.PI / 180;
  press('Space');
  for (let i = 0; i < 40; i++) { aimAt(game, p.x + Math.cos(aimAng) * 60, p.y + Math.sin(aimAng) * 60); step(game); }
  release('Space');
  assert.ok(tree.hitCount > 0, '40 derece kacik nisan agaca kilitlenmedi');
  const hits = tree.hitCount;
  for (let i = 0; i < 40; i++) step(game);
  game.player.cd = 0;
  const far = -Math.PI / 2 + 100 * Math.PI / 180;
  press('Space');
  for (let i = 0; i < 40; i++) { aimAt(game, p.x + Math.cos(far) * 60, p.y + Math.sin(far) * 60); step(game); }
  release('Space');
  assert.equal(tree.hitCount, hits, '100 derece kacik nisan bile agaca vurdu');
});

// ---------- (f) klavye-only ----------
await test('(f) klavye-only: fare kipirdamadan agaca dogru yuruyup bosluga basili tutunca agac devrilir', () => {
  freshGame();
  const p = game.player;
  const tree = nearestOf('birch', p);
  isolate(tree);
  place(tree.x + 3, tree.y + 70);
  const act0 = mouseState().act;
  game.mouseIdle = 99; game._lastAct = act0;
  press('KeyW'); press('Space');
  let i = 0;
  for (; i < 900 && !tree.dead; i++) step(game);                  // hic aimAt yok
  release('KeyW'); release('Space');
  assert.equal(mouseState().act, act0, 'test fareyi oynatti');
  assert.equal(game.inputMode, 'keys');
  assert.ok(tree.dead, 'klavye ile agac devrilmedi');
});

await test('(f) klavye-only menzilli: okcu ve buyucu en yakin hedefe atar', () => {
  for (const cid of ['okcu', 'buyucu']) {
    const p = pickClass(cid);
    const tree = nearestOf('birch', p);
    isolate(tree);
    place(tree.x - 30, tree.y + 100);
    game.mouseIdle = 99; game._lastAct = mouseState().act;
    press('Space');
    for (let i = 0; i < 500 && !tree.dead; i++) step(game);
    release('Space');
    assert.equal(game.inputMode, 'keys');
    assert.ok(tree.dead, cid + ': en yakin hedefe atmadi');
  }
});

// ---------- (g) kilitli agaclar ----------
for (const cid of CLASS_IDS) {
  await test(`(g) ${cid}: demir agac kilidi, sart yokken hasar almaz, sart saglaninca alir`, () => {
    const p = pickClass(cid);
    const iron = nearestOf('iron', game.fire);
    isolate(iron);
    const melee = p.isMelee;
    place(iron.x, iron.y + (melee ? 30 : 90));
    game.stats.critChance = 0;
    assert.equal(game.canCut(iron), false);
    const need = TREE_TIERS.iron.unlock;
    assert.ok(need > 1);
    const toast0 = game.hud.toastMsg;
    game.level = need - 1;
    const d0 = game.denyCount;
    press('Space');
    for (let i = 0; i < 150; i++) { aimAt(game, iron.x, iron.y); p.hp = game.stats.maxHp; step(game); }
    release('Space');
    assert.equal(iron.hp, iron.maxHp, cid + ': kilitli agac hasar aldi');
    assert.ok(game.denyCount > d0, 'uyari/sekme olmadi');
    assert.match(game.hud.toastMsg, /yetmiyor/);
    assert.ok(iron.wobble >= 0);
    // sart saglaninca (sekmeyle uzaklasmis olabilir: geri don)
    game.level = need;
    place(iron.x, iron.y + (melee ? 30 : 90));
    assert.equal(game.canCut(iron), true);
    press('Space');
    for (let i = 0; i < 150; i++) { aimAt(game, iron.x, iron.y); p.hp = game.stats.maxHp; step(game); }
    release('Space');
    assert.ok(iron.hp < iron.maxHp || iron.dead, cid + ': sart saglanmasina ragmen hasar almadi');
  });
}

await test('(g) alan hasari ve yetenekler de kilitli agaci gecemez', () => {
  const p = pickClass('buyucu');
  const iron = nearestOf('iron', game.fire);
  isolate(iron);
  game.level = 1;
  game.explode(iron.x, iron.y, { r: 60, dmg: 999, treeMul: 1, primary: true });
  game.explode(iron.x, iron.y, { r: 60, dmg: 999, treeMul: 1, primary: false });
  assert.equal(iron.hp, iron.maxHp);
  // devrilen agac yeniden dogarken cani dolar: yalniz can'a bakmak yetmez
  assert.equal(iron.dead, false, 'kilitli agac alan hasariyla devrildi');
  assert.equal(iron.hitCount, 0);
});

// ---------- (h) duraklatma ----------
await test('(h) duraklatma ve beceri agaci acikken oyun zamani ilerlemez', () => {
  const p = freshGameP();
  game.spawnT = 3;
  game.enemies.push(new Enemy(game, 'cinder', p.x + 80, p.y, 1));
  for (let i = 0; i < 30; i++) step(game);
  const snap = () => ({ t: game.time, d: game.dayT, fuel: game.fire.fuel, ex: game.enemies[0].x, px: p.x, w: p.warmth });
  // ESC: duraklat
  press('Escape'); release('Escape');
  assert.equal(game.paused, true);
  assert.equal(game.state, 'play');
  const a = snap();
  press('KeyD');
  for (let i = 0; i < 120; i++) step(game);
  release('KeyD');
  assert.deepEqual(snap(), a, 'duraklatilmisken oyun ilerledi');
  press('Escape'); release('Escape');
  assert.equal(game.paused, false);
  for (let i = 0; i < 30; i++) step(game);
  assert.ok(game.time > a.t + 0.4, 'devam etmedi');
  // beceri agaci
  press('KeyF'); release('KeyF');
  assert.equal(game.treeOpen, true);
  const b = snap();
  for (let i = 0; i < 120; i++) step(game);
  assert.deepEqual(snap(), b, 'beceri agaci acikken oyun ilerledi');
  press('Escape'); release('Escape');          // once agaci kapatir, duraklatmaz
  assert.equal(game.treeOpen, false); assert.equal(game.paused, false);
  // agac aciksa duraklatma yok, pause iken F agaci acmaz
  press('KeyP'); release('KeyP'); assert.equal(game.paused, true);
  press('KeyF'); release('KeyF'); assert.equal(game.treeOpen, false);
  press('KeyP'); release('KeyP');
  assert.equal(game.paused, false);
});

await test('ses acma/kapama (M) ve tam sayi olcekleme', async () => {
  const { isMuted } = await import('../src/core/audio.js');
  freshGame();
  assert.equal(isMuted(), false);
  press('KeyM'); release('KeyM'); assert.equal(isMuted(), true);
  step(game);
  press('KeyM'); release('KeyM'); assert.equal(isMuted(), false);
  assert.equal(fitScale(1920, 1080), 4);
  assert.equal(fitScale(1280, 720), 2);
  assert.equal(fitScale(959, 539), 1);
  assert.equal(fitScale(2000, 700), 2);       // yukseklik sinirlar
  assert.equal(fitScale(1000, 2000), 2);      // genislik sinirlar
  assert.ok(fitScale(240, 135) === 0.5);      // pencere kucukse kesirli
  for (const [w, h] of [[390, 844], [1280, 720], [1366, 768], [2560, 1440]]) {
    const s = fitScale(w, h);
    assert.ok(s >= 1 ? Number.isInteger(s) : s > 0, `${w}x${h}`);
    assert.ok(480 * s <= w + 1e-6 && 270 * s <= h + 1e-6);
  }
});

// ---------- odun miknatisi ----------
await test('devrilen ağacın odunu oyuncuya doğru çekilir; sepet doluyken yerde kalir', () => {
  const p = pickClass('okcu');
  place(p.x, p.y);
  game.pickups.push({ x: p.x + 60, y: p.y, vx: 0, vy: 0, type: 'birch', t: 0, life: 20, val: 2, fell: true });
  const c0 = p.carried;
  for (let i = 0; i < 90; i++) step(game);
  assert.equal(p.carried, c0 + 2, 'miknatis odunu cekmedi');
  // sepet dolu
  p.carried = game.stats.carry;
  game.pickups.push({ x: p.x + 40, y: p.y, vx: 0, vy: 0, type: 'birch', t: 0, life: 20, val: 2, fell: true });
  for (let i = 0; i < 180; i++) step(game);
  assert.equal(p.carried, game.stats.carry);
  assert.equal(game.pickups.filter(k => k.type === 'birch').length, 1, 'dolu sepette odun yerde kalmadi');
  assert.ok(dist(game.pickups.find(k => k.type === 'birch'), p) > 12);
  // okcunun miknatisi baltacidan genis
  assert.ok(computeStats({}, 'okcu').magnet > computeStats({}, 'baltaci').magnet);
});

await test('kombo: art arda vuruslar kesim hizini kisa sureli artirir', () => {
  const p = freshGameP();
  p.combo = 0;
  p.cd = 0; p.swinging = false; p.startSwing();
  const slow = p.cd;
  for (let i = 0; i < 10; i++) p.registerHit();
  assert.ok(p.comboT > 0);
  p.cd = 0; p.swinging = false; p.startSwing();
  assert.ok(p.cd < slow * 0.85, `kombo hizi artirmadi ${slow} -> ${p.cd}`);
  for (let i = 0; i < 100; i++) step(game);      // kombo biter
  assert.equal(p.combo, 0);
});

// ---------- eski testler (yeni API) ----------
await test('(c-eski) odunu atese atinca ates degeri artar', () => {
  freshGame();
  const p = game.player, f = game.fire;
  p.x = f.x + 30; p.y = f.y; p.carried = 10;
  const fuel0 = f.fuel;
  press('KeyE'); step(game); release('KeyE');
  assert.ok(f.fuel > fuel0 + 30, `ates artmadi: ${fuel0} -> ${f.fuel}`);
  assert.equal(p.carried, 0);
  assert.ok(game.totalFed > 0);
  p.x = f.x + 300; p.carried = 5; const fuel1 = f.fuel;
  press('KeyE'); step(game); release('KeyE');
  assert.equal(p.carried, 5);
  assert.ok(f.fuel <= fuel1);
});

await test('(d-eski) beceri satin alma computeStats sonucunu degistirir', () => {
  freshGame();
  game.points = 3;
  const before = computeStats(game.owned, 'baltaci').damage;
  assert.equal(game.stats.damage, before);
  game.toggleTree(true); assert.ok(game.treeOpen);
  game.tryBuy(node('swift'));                // edge ister, kilitli
  assert.equal(game.owned.swift, undefined);
  assert.equal(game.points, 3);
  game.tryBuy(node('edge'));
  assert.equal(game.owned.edge, 1);
  assert.equal(game.points, 2);
  assert.ok(game.stats.damage > before, 'hasar degismedi');
  assert.equal(computeStats(game.owned, 'baltaci').damage, game.stats.damage);
  game.toggleTree(false);
});

// ---------- cila: agac ekrani klavyesi, hit-stop, toplama zinciri, agac flasi ----------
const keyRepeat = code => (globalListeners.keydown || []).forEach(f => f({ code, repeat: true, preventDefault: noop }));

await test('agac ekrani klavye: Enter satin alir, Bosluk ALMAZ, basili tutma tekrari ikinci kez almaz', () => {
  freshGame();
  game.points = 20;
  press('KeyF'); release('KeyF');
  assert.equal(game.treeOpen, true);
  const v = game.treeView;
  assert.ok(v, 'agac gorunumu yok');
  v.current(); v.sel = node('edge');
  // Bosluk (saldiri tusu): puan harcamaz, ret sarsintisi da yapmaz
  press('Space'); release('Space');
  assert.equal(game.owned.edge, undefined, 'Bosluk satin aldi');
  assert.equal(game.points, 20, 'Bosluk puan harcadi');
  assert.equal(v.denyT, 0);
  keyRepeat('Space');
  assert.equal(game.owned.edge, undefined);
  // Enter: bir kez alir
  const cost1 = nodeCost(node('edge'), 0);
  press('Enter');
  assert.equal(game.owned.edge, 1, 'Enter satin almadi');
  assert.equal(game.points, 20 - cost1);
  // tus basili: tarayici tekrar (repeat) olaylari ikinci kez almaz
  for (let i = 0; i < 5; i++) keyRepeat('Enter');
  assert.equal(game.owned.edge, 1, 'basili tutma tekrari yeniden satin aldi');
  assert.equal(game.points, 20 - cost1);
  release('Enter');
  // birakip yeniden basinca alir (NumpadEnter de gecerli)
  press('NumpadEnter'); release('NumpadEnter');
  assert.equal(game.owned.edge, 2);
  // ok tuslari gezinir, satin almaz
  const p0 = game.points;
  press('ArrowDown'); release('ArrowDown');
  assert.equal(v.sel, node('swift'));
  assert.equal(game.points, p0);
  press('Escape'); release('Escape');
  assert.equal(game.treeOpen, false);
});

await test('agac ekrani: AL / YETMIYOR etiketi ile satirin alt cercevesi arasinda en az 2 piksel bosluk', () => {
  // yazi tipi: buyuk harf satirlari 3..9 (font.js); cerceve satirin son pikseli (h - 1)
  for (const n of nodesOf('baltaci')) {
    const h = nodeRect(n).h;
    const gap = (h - 1) - (LABEL_Y + 9) - 1;
    assert.ok(gap >= 2, `etiket cerceveye ${gap} px kala bitiyor`);
  }
});

await test('hit-stop: sabitlerin ust sinirlari; art arda vuruslar birikmez (en uzunu kalir)', () => {
  assert.ok(HIT_STOP.hit <= 0.04, 'normal ' + HIT_STOP.hit);
  assert.ok(HIT_STOP.crit <= 0.07, 'kritik ' + HIT_STOP.crit);
  assert.ok(HIT_STOP.fell <= 0.09, 'devrilme ' + HIT_STOP.fell);
  assert.ok(HIT_STOP.deny <= 0.02, 'ret ' + HIT_STOP.deny);
  assert.ok(HIT_STOP.blast <= 0.025 && HIT_STOP.blastBig <= 0.07, 'patlama');
  assert.ok(Object.values(HIT_STOP).every(v => v > 0 && v <= 0.12));
  assert.ok(Object.isFrozen(HIT_STOP));
  freshGame();
  const tree = nearestOf('oak');
  isolate(tree);
  tree.hp = tree.maxHp = 1e6;
  const fx = game.fx;
  fx.hitStop = 0;
  game.hitTree(tree, 1, false, false, 0);
  assert.equal(fx.hitStop, HIT_STOP.hit, 'tek normal vurus');
  game.hitTree(tree, 1, false, false, 0);
  game.hitTree(tree, 1, false, false, 0);
  assert.equal(fx.hitStop, HIT_STOP.hit, 'art arda vuruslarda donma birikti');
  game.hitTree(tree, 1, true, false, 0);
  assert.equal(fx.hitStop, HIT_STOP.crit, 'kritik');
  game.hitTree(tree, 1, false, false, 0);
  assert.equal(fx.hitStop, HIT_STOP.crit, 'kritik + normal birikti');
  // devrilme
  fx.hitStop = 0; tree.hp = 1;
  game.hitTree(tree, 99, false, false, 0);
  assert.ok(tree.dead);
  assert.equal(fx.hitStop, HIT_STOP.fell);
  // ret (kilitli agac) ve patlama
  freshGame();
  const iron = nearestOf('iron');
  isolate(iron);
  game.level = 1; game.fx.hitStop = 0;
  game.hitTree(iron, 5, false, false, 0);
  game.hitTree(iron, 5, false, false, 0);
  assert.equal(game.fx.hitStop, HIT_STOP.deny);
  const p = game.player;
  for (const big of [false, true]) {
    game.fx.hitStop = 0;
    dummy(p.x + 10, p.y); dummy(p.x - 10, p.y);
    game.explode(p.x, p.y, { r: 40, dmg: 1, treeMul: 0, primary: false, big });
    game.explode(p.x, p.y, { r: 40, dmg: 1, treeMul: 0, primary: false, big });
    assert.equal(game.fx.hitStop, big ? HIT_STOP.blastBig : HIT_STOP.blast);
  }
  game.fx.hitStop = 0;
});

await test('hit-stop: kaynakta .stop( cagrilarinda ve hitStop atamalarinda cipak sayi yok (hepsi HIT_STOP)', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const root = new URL('../src/', import.meta.url);
  const files = readdirSync(root, { recursive: true }).map(f => String(f).split('\\').join('/')).filter(f => f.endsWith('.js') && f !== 'core/audio.js');
  assert.ok(files.length > 20 && files.includes('entities/player.js'), 'kaynak dosyalari bulunamadi');
  const bad = [];
  let calls = 0;
  for (const f of files) {
    readFileSync(new URL(f, root), 'utf8').split(/\r?\n/).forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '');
      for (const m of code.matchAll(/\bfx\.stop\(([^)]*)\)/g)) {
        calls++;
        if (/\d/.test(m[1].replace(/HIT_STOP\.\w+/g, ''))) bad.push(f + ':' + (i + 1) + ' ' + m[0]);
      }
      // hitStop'a dogrudan sayi atamasi: yalnizca sifirlama (= 0) serbest
      const a = code.match(/hitStop\s*\+?=(?!=)\s*([^;]+)/);
      if (a && /\d/.test(a[1]) && a[1].trim() !== '0') bad.push(f + ':' + (i + 1) + ' ' + a[0]);
    });
  }
  assert.ok(calls >= 6, 'fx.stop cagrilari taranamadi: ' + calls);
  assert.deepEqual(bad, [], 'cipak hit-stop sayisi');
});

await test('TEKRAR: reset() toplama zincirini (_colChain/_colAt) sifirlar, ilk odun sesi taban perdede', () => {
  const p = freshGameP();
  const pitches = [];
  const orig = game.sfx.collect;
  game.sfx.collect = n => { pitches.push(n); };
  try {
    const wood = () => ({ x: p.x, y: p.y, vx: 0, vy: 0, type: 'birch', t: 1, life: 20, val: 1 });
    game.time = 40;
    game.collect(wood()); game.collect(wood()); game.collect(wood());
    assert.deepEqual(pitches, [0, 1, 2]);
    assert.equal(game._colChain, 2); assert.equal(game._colAt, 40);
    retryBtn.onclick();                       // TEKRAR -> start() -> reset()
    assert.equal(game.time, 0);
    assert.equal(game._colChain, 0, '_colChain sifirlanmadi');
    assert.ok(game.time - game._colAt >= 0.5, '_colAt sifirlanmadi: ' + game._colAt);
    pitches.length = 0;
    game.time = 0.1;
    game.collect(wood());
    assert.deepEqual(pitches, [0], 'TEKRAR sonrasi ilk toplama perdesi yanlis');
  } finally { game.sfx.collect = orig; }
});

await test('agac flasi: en cok 2 kare, kismi (kirpilmis) ve opakligi en cok %35; hit-stop surerken de biter', () => {
  assert.ok(TREE_FLASH.frames <= 2 && TREE_FLASH.time <= 0.035 && TREE_FLASH.alpha <= 0.35);
  const p = freshGameP();
  const tree = nearestOf('oak', p);
  isolate(tree);
  place(tree.x, tree.y + 24);
  tree.hp = tree.maxHp = 1e6;
  const ctx = game.ctx;
  let clips = 0, maxA = 0, inFlash = false;
  ctx.clip = () => { clips++; inFlash = true; };
  ctx.restore = () => { inFlash = false; };
  ctx.drawImage = () => { if (inFlash) maxA = Math.max(maxA, ctx.globalAlpha); };
  try {
    game.draw();
    assert.equal(clips, 0, 'vurus yokken flas cizildi');
    game.hitTree(tree, 1, false, false, 0);
    assert.ok(tree.wobble > 0, 'sarsilma kalkmis');
    // hit-stop: dunya donuk (update yok), yalnizca cizim
    for (let i = 0; i < 6; i++) game.draw();
    assert.equal(clips, 2, 'flas ' + clips + ' kare cizildi (beklenen 2)');
    assert.ok(maxA > 0 && maxA <= 0.35 + 1e-9, 'flas opakligi ' + maxA);
    // oyun zamaniyla da biter: cizim olmasa bile 3 adim sonra flas yok
    game.hitTree(tree, 1, false, false, 0);
    for (let i = 0; i < 3; i++) game.update(DT);
    game.draw();
    assert.equal(clips, 2, 'sure dolduktan sonra flas cizildi');
  } finally { delete ctx.clip; delete ctx.restore; delete ctx.drawImage; game.fx.hitStop = 0; }
});

await test('abilities.lights(): ayni tampon dizi ve nesneler yeniden kullanilir, degerler dogru', () => {
  const p = freshGameP();
  const ab = game.abilities;
  assert.equal(ab.lights().length, 0);
  ab.rings.push({ x: 10, y: 20, r: 30, life: 1, max: 2 });
  ab.wrathT = 0.5;
  const a = ab.lights();
  assert.equal(a.length, 2);
  assert.deepEqual(a[0], { x: 10, y: 20, r: 60, a: 0.25 });
  assert.deepEqual(a[1], { x: p.x, y: p.y - 6, r: 46, a: 0.25 });
  const o0 = a[0], o1 = a[1];
  ab.rings[0].x = 11;
  const b = ab.lights();
  assert.equal(b, a, 'her cagrida yeni dizi');
  assert.ok(b[0] === o0 && b[1] === o1, 'her cagrida yeni nesne');
  assert.equal(b[0].x, 11);
  ab.rings.length = 0; ab.wrathT = 0;
  assert.equal(ab.lights().length, 0);
  ab.wrathT = 1;
  const c = ab.lights();
  assert.equal(c.length, 1);
  assert.ok(c[0] === o0, 'havuz nesnesi yeniden kullanilmadi');
  assert.deepEqual(c[0], { x: p.x, y: p.y - 6, r: 46, a: 0.5 });
  ab.wrathT = 0;
});

// ---------- (j) olum ve sinif degistirme ----------
let storage = null;
await test('(j) olum -> TEKRAR ayni sinifla temiz baslar; sinif degisince oncekinin dugum/yetenekleri sizmaz', async () => {
  const p0 = pickClass('okcu');
  buyAll('okcu');
  assert.ok(game.abilities.has('rain'));
  game.projectiles.push({ dead: false, update() {}, draw() {} });
  game.abilities.zones.push({ kind: 'rain', x: 0, y: 0, r: 10, life: 5, max: 5, tick: 9, every: 1, dmg: 1, treeMul: 0, burn: 0, slow: false });
  game.level = 5; game.xp = 10; game.killCount = 7; game.totalFed = 99; game.time = 300;
  game.player.carried = 12; game.fire.fuel = 150; game.fire.level = 4;
  game.pickups.push({ x: 0, y: 0, vx: 0, vy: 0, type: 'birch', t: 0, life: 9, val: 1 });
  game.fx.text(1, 1, 'x');
  game.world.trees[0].dead = true;
  game.player.hurt(1e6, null, true);
  assert.equal(game.state, 'death');
  assert.ok(game.deathCause.length > 0);
  assert.equal(game.lastRun.classId, 'okcu');
  retryBtn.onclick();                        // olum ekrani zamanlayicisi dolmadan
  await new Promise(r => setTimeout(r, 700));
  assert.ok(document.getElementById('death').classList.contains('hidden'), 'olum ekrani yeniden acildi');
  assert.equal(game.state, 'play');
  assert.equal(game.classId, 'okcu', 'olunce sinif degisti');
  assert.equal(game.player.classId, 'okcu');
  assert.deepEqual(game.owned, {});
  assert.equal(game.points, 0);
  assert.equal(game.level, 1); assert.equal(game.xp, 0);
  assert.equal(game.killCount, 0); assert.equal(game.totalFed, 0);
  assert.equal(game.time, 0);
  assert.equal(game.player.carried, 0);
  assert.equal(game.player.hp, game.stats.maxHp);
  assert.deepEqual(game.stats, computeStats({}, 'okcu'));
  assert.equal(game.fire.fuel, 26); assert.equal(game.fire.level, 1);
  assert.equal(game.pickups.length, 0); assert.equal(game.enemies.length, 0); assert.equal(game.projectiles.length, 0);
  assert.equal(game.abilities.zones.length, 0);
  assert.equal(game.fx.texts.length, 0);
  assert.equal(game.lastRun, null);
  assert.ok(game.world.trees.every(t => !t.dead), 'olu agac kaldi');
  assert.ok(CLASSES.okcu.abilities.every(a => !game.abilities.has(a)), 'okcu yetenekleri sizdi');
  assert.deepEqual(nonFinite(game), []);

  // sinif degistir: olum ekranindaki SINIF DEGISTIR -> secim -> buyucu
  game.player.hurt(1e6, null, true);
  assert.equal(game.state, 'death');
  changeBtn.onclick();
  assert.equal(game.state, 'classSelect');
  assert.equal(game.selectClass('buyucu'), true);
  assert.equal(game.classId, 'buyucu');
  assert.equal(game.player.classId, 'buyucu');
  assert.deepEqual(game.owned, {});
  assert.deepEqual(game.stats, computeStats({}, 'buyucu'));
  for (const id of [...CLASSES.okcu.abilities, ...CLASSES.baltaci.abilities]) {
    assert.equal(game.stats[id], 0, id + ' sizdi');
    assert.equal(game.abilities.has(id), false);
    assert.equal(game.abilities.cast(id), false);
  }
  assert.equal(game.abilities.zones.length, 0);
  // eski sinifin dugumu yeni sinifta alinamaz
  game.points = 99; game.tryBuy(node('draw')); game.tryBuy(node('edge'));
  assert.deepEqual(game.owned, {});
  // duraklatilmisken C ile sinif degistir
  press('Escape'); release('Escape'); assert.equal(game.paused, true);
  press('KeyC'); release('KeyC');
  assert.equal(game.state, 'classSelect'); assert.equal(game.paused, false);
  game.selectClass('baltaci');
  assert.equal(game.stats.maxHp, computeStats({}, 'baltaci').maxHp);
});

await test('en iyi skor (sinif basina) ve yerel depolama; depolama yokken de calisir', async () => {
  // depolama yok: calisiyor (ilk Game zaten boyle kuruldu)
  pickClass('baltaci');
  game.time = 77.9; game.level = 4;
  game.player.hurt(1e6, null, true);
  assert.equal(game.lastRun.time, 77); assert.equal(game.lastRun.isBest, true);
  assert.deepEqual(game.best.baltaci, { time: 77, level: 4 });
  // ikinci olum daha kisa: rekor degil
  pickClass('baltaci'); game.time = 30; game.player.hurt(1e6, null, true);
  assert.equal(game.lastRun.isBest, false); assert.equal(game.best.baltaci.time, 77);
  // baska sinifin rekoru ayri
  pickClass('okcu'); game.time = 4000; game.level = 2; game.player.hurt(1e6, null, true);
  assert.equal(game.lastRun.isBest, true); assert.equal(game.best.okcu.time, 4000); assert.equal(game.best.baltaci.time, 77);
  // depolama taklidi
  storage = {};
  globalThis.localStorage = { getItem: k => (k in storage ? storage[k] : null), setItem: (k, v) => { storage[k] = String(v); } };
  pickClass('buyucu'); game.time = 9999; game.player.hurt(1e6, null, true);
  assert.ok(JSON.parse(storage['kor.best']).buyucu.time === 9999);
  assert.equal(storage['kor.class'], 'buyucu');
  // ozel durum: depolama hata verirse oyun yine calisir
  globalThis.localStorage = { getItem() { throw new Error('yasak'); }, setItem() { throw new Error('yasak'); } };
  pickClass('okcu'); step(game);
  assert.equal(game.classId, 'okcu');
  globalThis.localStorage = { getItem: k => (k in storage ? storage[k] : null), setItem: (k, v) => { storage[k] = String(v); } };
});

// ---------- diger ----------
await test('ates uzun sure sonunca oyun biter, kisa surede yeniden yakilabilir', () => {
  freshGame();
  game.fire.fuel = 0;
  for (let i = 0; i < 60 * 5; i++) step(game);
  assert.equal(game.state, 'play');
  game.player.carried = 5; game.player.x = game.fire.x + 30; game.player.y = game.fire.y;
  press('KeyE'); step(game); release('KeyE');
  assert.ok(game.fire.fuel > 0);
  game.fire.fuel = 0;
  for (let i = 0; i < 60 * 14 && game.state === 'play'; i++) step(game);
  assert.equal(game.state, 'death');
  assert.match(game.deathCause, /ATEŞ/);
});

await test('dusman vurulunca beyaz flas gecer, ust uste binmez', () => {
  freshGame();
  const p = game.player;
  const e = new Enemy(game, 'cinder', p.x + 60, p.y, 1);
  game.enemies.push(e);
  e.hurt(1, p);
  assert.ok(e.flashT > 0);
  for (let i = 0; i < 30; i++) step(game);
  assert.equal(e.flashT, 0, 'flashT hic azalmadi');
  assert.ok(Math.hypot(e.x - p.x, e.y - p.y) > 5, 'dusman oyuncunun uzerine bindi');
});

await test('dusman oyuncuya yaklasip hasar verir', () => {
  freshGame();
  const p = game.player;
  p.x = game.world.w - 200; p.y = 200;      // atesten uzak (ates yakmasin)
  const e = new Enemy(game, 'cinder', p.x + 60, p.y, 1);
  game.enemies.push(e);
  let hurt = false;
  for (let i = 0; i < 300 && !hurt; i++) { step(game); hurt = p.hurtT > 0; }
  assert.ok(hurt, 'dusman oyuncuya hic vuramadi');
});

await test('donma ve yavaslatma: buz yetenekleri yaratigi durdurur', () => {
  const p = pickClass('buyucu');
  place(game.world.w - 300, 300);
  const e = new Enemy(game, 'cinder', p.x + 60, p.y, 1);
  game.enemies.push(e);
  e.freezeT = 1;
  const x0 = e.x;
  for (let i = 0; i < 30; i++) step(game);
  assert.ok(Math.abs(e.x - x0) < 1, 'donmus yaratik yurudu');
  assert.equal(p.hurtT, 0);
  game.explode(e.x, e.y, { r: 30, dmg: 1, treeMul: 0, primary: false, chill: 2, quiet: true });
  assert.ok(e.slowT > 2);
});

// ---------- (k) olu dugum yok: her dugumun her seviyesi olculebilir bir oyun etkisi yapar ----------
// Yontem: dugumun tek bir stat anahtari yalitilir (digerleri ayni kalir), o stat'a ozel kucuk bir oyun
// senaryosu (sonda) iki kez kosulur; sonuc farkli olmali. computeStats farki da aciklamadaki adimla (per) eslesmeli.
function withRandom(v, fn) {
  const old = Math.random; Math.random = () => v;
  try { return fn(); } finally { Math.random = old; }
}
function probeSetup(cid, stats) {
  const p = pickClass(cid);
  game.recompute = noop;              // seviye atlama stat'lari geri yazmasin (sonda bitince silinir)
  game.stats = stats;
  p.hp = stats.maxHp; p.warmth = stats.maxWarmth;
  game.fire.fuel = 200;
  return p;
}
function dummy(x, y) {
  const e = new Enemy(game, 'cinder', x, y, 1);
  e.hp = 1e6; e.spd = 0; game.enemies.push(e);
  return e;
}
const r2 = v => Math.round(v * 100) / 100;
// birincil saldiri: A hedefte, B patlama yaricapinin hemen disinda
function attackRun(cid, stats, rnd, steps) {
  const p = probeSetup(cid, stats); isolate(null);
  const d = p.isMelee ? 26 : 60;
  const A = dummy(p.x + d, p.y), B = dummy(p.x + d + 32, p.y);
  let slow = 0, frz = 0;
  withRandom(rnd, () => {
    press('Space');
    for (let i = 0; i < steps; i++) { game.update(DT); slow = Math.max(slow, A.slowT); frz += A.freezeT > 0 ? 1 : 0; }
    release('Space');
  });
  return [r2(1e6 - A.hp), r2(1e6 - B.hp), A.burnDps, r2(slow), frz, p.attacks];
}
const PROBES = {
  dps: (cid, st) => attackRun(cid, st, 0.5, 300),
  chance: (cid, st) => { const o = []; for (let k = 0; k < 20; k++) o.push(attackRun(cid, st, 0.025 + k * 0.05, 60)); return o; },
  wood: (cid, st) => {
    const p = probeSetup(cid, st);
    const tree = nearestOf('oak', p); isolate(tree);
    withRandom(0.5, () => game.hitTree(tree, 1e9));
    return game.pickups.filter(k => k.type !== 'ash').reduce((a, k) => a + k.val, 0);
  },
  hp: (cid, st) => {
    const p = probeSetup(cid, st);
    let n = 0;
    while (game.state === 'play' && n < 1000) { p.hurt(10, null, true); n++; }
    return n;
  },
  cold: (cid, st) => {
    const p = probeSetup(cid, st); isolate(null);
    p.x = game.fire.x + 400;
    let n = 0;
    while (p.warmth > 0 && n < 9000) { game.update(DT); n++; }
    return n;
  },
  regen: (cid, st) => {
    const p = probeSetup(cid, st);
    p.warmth = 1;
    for (let i = 0; i < 30; i++) game.update(DT);
    return r2(p.warmth);
  },
  carry: (cid, st) => {
    const p = probeSetup(cid, st);
    for (let i = 0; i < 80; i++) game.pickups.push({ x: p.x, y: p.y, vx: 0, vy: 0, type: 'birch', t: 1, life: 20, val: 1 });
    for (let i = 0; i < 30; i++) game.update(DT);
    return p.carried;
  },
  speed: (cid, st) => {
    const p = probeSetup(cid, st); isolate(null);
    const x0 = p.x;
    press('KeyD'); for (let i = 0; i < 60; i++) game.update(DT); release('KeyD');
    return r2(p.x - x0);
  },
  magnet: (cid, st) => {
    const p = probeSetup(cid, st); isolate(null);
    const base = computeStats({}, cid).magnet + 22;
    for (const extra of [6, 16, 26, 36]) game.pickups.push({ x: p.x - base - extra, y: p.y, vx: 0, vy: 0, type: 'birch', t: 1, life: 20, val: 1 });
    for (let i = 0; i < 150; i++) game.update(DT);
    return p.carried;
  },
  dash: (cid, st) => {
    const p = probeSetup(cid, st); isolate(null);
    p.facing = Math.PI / 2;
    let n = 0;
    for (let i = 0; i < 300; i++) { if (p.dash()) n++; game.update(DT); }
    return n;
  },
  dodge: (cid, st) => {
    const p = probeSetup(cid, st);
    let n = 0;
    for (let k = 0; k < 100; k++) {
      p.invuln = 0; p.hp = st.maxHp;
      withRandom(0.005 + k / 100, () => p.hurt(1, null));
      if (p.hp < st.maxHp) n++;
    }
    return n;
  },
  heat: (cid, st) => {
    const p = probeSetup(cid, st); isolate(null);
    p.x = game.fire.x + 400;
    withRandom(0.5, () => { press('Space'); for (let i = 0; i < 120; i++) game.update(DT); release('Space'); });
    return r2(p.warmth);
  },
  deposit: (cid, st) => {
    const p = probeSetup(cid, st);
    p.carried = 10; game.fire.fuel = 10;
    game.tryDeposit();
    return r2(game.fire.fuel);
  },
  killWarmth: (cid, st) => {
    const p = probeSetup(cid, st);
    p.warmth = 50;
    const e = dummy(p.x + 100, p.y);
    withRandom(0.5, () => e.hurt(1e9, p));
    return r2(p.warmth);
  },
};
// yetenek sondasi: yetenegi kullan, 5 sn izle (hasar, yakma, yavaslatma, kalkan, yer degistirme)
function abilityProbe(cid, st, id) {
  const p = probeSetup(cid, st); isolate(null);
  p.facing = 0; p.keyAng = 0;
  const A = dummy(p.x + 40, p.y), x0 = p.x, y0 = p.y;
  let slow = 0, frz = 0, shield = 0, ok = false;
  withRandom(0.5, () => {
    game.update(DT);
    ok = game.abilities.cast(id);
    for (let i = 0; i < 300; i++) { game.update(DT); slow = Math.max(slow, A.slowT); frz += A.freezeT > 0 ? 1 : 0; shield += p.dmgReduce > 0 ? 1 : 0; }
  });
  return [ok, r2(1e6 - A.hp), A.burnDps, r2(slow), frz, shield, r2(Math.hypot(p.x - x0, p.y - y0))];
}
const STAT_PROBE = {
  damage: 'dps', attackSpeed: 'dps', multishot: 'dps', blastRadius: 'dps', chill: 'dps',
  critChance: 'chance', burnChance: 'chance', burnDps: 'chance', freeze: 'chance',
  woodMult: 'wood', maxHp: 'hp', maxWarmth: 'cold', warmthRegen: 'regen', carry: 'carry', moveSpeed: 'speed',
  magnet: 'magnet', dashCd: 'dash', dodge: 'dodge', heatCostMul: 'heat', emberGain: 'deposit', killWarmth: 'killWarmth',
};
const probeMemo = new Map();
function runProbe(cid, stat, stats) {
  const first = CLASSES[cid].abilities[0];
  const isAbility = CLASSES[cid].abilities.includes(stat);
  const name = isAbility ? 'ability:' + stat : stat === 'abilityPower' ? 'ability:' + first : STAT_PROBE[stat];
  assert.ok(name, stat + ' icin sonda tanimli degil (yeni stat eklendiyse sonda da ekle)');
  const st = stat === 'abilityPower' ? { ...stats, [first]: 1 } : stats;
  const key = cid + '|' + name + '|' + JSON.stringify(st);
  if (!probeMemo.has(key)) {
    try {
      probeMemo.set(key, JSON.stringify(name.startsWith('ability:') ? abilityProbe(cid, st, name.slice(8)) : PROBES[name](cid, st)));
    } finally { delete game.recompute; releaseAll(); }
  }
  return probeMemo.get(key);
}
for (const cid of CLASS_IDS) {
  await test('(k) ' + cid + ': 12 dugumun her seviyesi olculebilir oyun etkisi yapar (olu dugum yok)', () => {
    let checked = 0;
    for (const n of CLASSES[cid].nodes) {
      const pairs = [[n.stat, n.per]];
      if (n.stat2) pairs.push([n.stat2, n.per2]);
      for (const [stat, per] of pairs) {
        for (let lv = 1; lv <= n.max; lv++) {
          const full = computeStats({ [n.id]: lv }, cid);
          const prev = computeStats({ [n.id]: lv - 1 }, cid)[stat];
          assert.ok(Math.abs(full[stat] - prev - per) < 1e-9, n.id + ' sv' + lv + ': ' + stat + ' ' + prev + ' -> ' + full[stat] + ', aciklamadaki adim ' + per);
          const alt = { ...full, [stat]: prev };          // yalnizca bu stat bir onceki seviyede
          const a = runProbe(cid, stat, full), b = runProbe(cid, stat, alt);
          assert.notEqual(a, b, 'olu dugum: ' + n.id + ' sv' + lv + ' (' + stat + ') oyunda fark yaratmiyor: ' + a);
          checked++;
        }
      }
    }
    assert.ok(checked >= 12);
    assert.equal(game.recompute, Game.prototype.recompute);
  });
}

// ---------- (i) denge: sinifa uygun bot ilk 2 dakikada hayatta kalir ve puan alir ----------
function runBot(cid, seed) {
  reseed(seed);
  pickClass(cid);
  game.spawnT = 12;            // gercek spawn akisi
  const g = game, p = g.player;
  const ranged = !p.isMelee;
  const held = new Set();
  const hold = (code, on) => {
    if (on && !held.has(code)) { press(code); held.add(code); }
    if (!on && held.has(code)) { release(code); held.delete(code); }
  };
  let gotPoint = false, minHp = 1e9;
  const D = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  for (let i = 0; i < 7200 && g.state === 'play'; i++) {
    const fx = g.fire.x, fy = g.fire.y;
    const dFire = Math.hypot(p.x - fx, p.y - fy);
    let tx = null, ty = null, aim = null, atk = false;
    const range = ranged ? 150 : 70;
    const near = g.enemies.filter(e => !e.dead && D(e, p) < range).sort((a, b) => D(a, p) - D(b, p))[0];
    const manaLow = cid === 'buyucu' && p.warmth < 22;
    if (near && !manaLow) {
      aim = [near.x, near.y]; atk = true;
      const nd = D(near, p);
      if (ranged) { if (nd < 75) { tx = p.x - (near.x - p.x) * 2; ty = p.y - (near.y - p.y) * 2; } }   // mesafeyi koru
      else if (nd > 24) { tx = near.x; ty = near.y; }
    } else if (p.warmth < 40 || p.carried >= 8 || (g.fire.fuel < 15 && p.carried > 0) || manaLow) {
      tx = fx; ty = fy + 36;
      if (dFire < 50) { press('KeyE'); release('KeyE'); }
      if (p.warmth < 40 && p.carried === 0 && dFire < 60) { tx = null; ty = null; }
    } else if (g.pickups.some(k => k.type !== 'ash')) {
      const k = g.pickups.find(k => k.type !== 'ash'); tx = k.x; ty = k.y;
    } else {
      const tree = g.world.trees.filter(t => !t.dead && (t.type === 'birch' || (t.type === 'oak' && g.stats.damage > 10)))
        .sort((a, b) => D(a, p) - D(b, p))[0];
      if (tree) {
        const d = D(tree, p);
        aim = [tree.x, tree.y];
        if (ranged) { if (d > 95) { tx = tree.x; ty = tree.y + 70; } else atk = true; }
        else if (d > 24) { tx = tree.x; ty = tree.y; } else atk = true;
      }
    }
    if (tx !== null) {
      hold('KeyA', tx < p.x - 4); hold('KeyD', tx > p.x + 4); hold('KeyW', ty < p.y - 4); hold('KeyS', ty > p.y + 4);
    } else for (const k of ['KeyA', 'KeyD', 'KeyW', 'KeyS']) hold(k, false);
    if (aim) aimAt(g, aim[0], aim[1]);
    hold('Space', atk);
    // ilk puanlari sinifin ilk dugumlerine harca (yetenek dugumleri sonra)
    for (const n of g.cls.nodes) { if (n.tier <= 2 && !n.ability && g.points >= nodeCost(n, g.owned[n.id] | 0) && (g.owned[n.id] | 0) < n.max && nodeUnlocked(n, g.owned)) { g.tryBuy(n); break; } }
    if (g.level > 1 || g.points > 0 || Object.keys(g.owned).length) gotPoint = true;
    minHp = Math.min(minHp, p.hp);
    if (process.env.DBG && i % 300 === 0) console.log(i / 60, Math.round(p.hp), Math.round(p.warmth), g.enemies.length, g.night.toFixed(2), p.carried, Math.round(g.fire.fuel));
    step(g);
  }
  for (const k of held) release(k);
  return { alive: g.state === 'play', gotPoint, minHp, level: g.level, fuel: g.fire.fuel, fed: g.totalFed, kills: g.killCount, t: g.time, attacks: p.attacks, harvest: g.totalHarvest };
}
const botStats = {};
for (const cid of CLASS_IDS) {
  for (const seed of [1, 2, 3]) {
    await test(`(i) denge: ${cid} botu (tohum ${seed}) 120 sn hayatta, ilk puani alir`, () => {
      const r = runBot(cid, seed);
      (botStats[cid] ||= []).push(r);
      console.log('       ' + JSON.stringify({ ...r, minHp: Math.round(r.minHp), fuel: Math.round(r.fuel), t: Math.round(r.t), fed: Math.round(r.fed) }));
      assert.ok(r.alive, cid + ' botu oldu');
      assert.ok(r.gotPoint, 'puan alinamadi');
      assert.ok(r.fed > 0, 'ates beslenmedi');
    });
  }
}

await test('son secilen sinif hatirlanir (yeni oyun acilisinda)', () => {
  pickClass('okcu');
  assert.equal(storage['kor.class'], 'okcu');
  const g2 = new Game(canvas);
  assert.equal(g2.classId, 'okcu');
  assert.equal(g2.cls.id, 'okcu');
  assert.equal(g2.state, 'title');
  assert.deepEqual(g2.stats, computeStats({}, 'okcu'));
});

const failed = results.filter(r => !r[1]).length;
console.log(`\n${results.length - failed}/${results.length} test gecti`);
process.exit(failed ? 1 : 0);
