// KOR — yalnızca URL'de ?demo=... varken yüklenir (game.js dinamik içe aktarır). Normal oyunu etkilemez.
//   ?demo=1            başlığı geçer, basit bot ağaç keser / ateşe atar / savaşır
//   ?demo=tree         beceri ağacı açık (bazı düğümler alınmış, &hover=<id> üstüne gelinmiş)
//   ?demo=night&t=200  ileri zaman, gece, tüm yaratık türleri
//   ?demo=hud          düşük can / sönen ateş uyarıları, yetenek beklemeleri
//   ?demo=death        ölüm ekranı      ?demo=title  başlık ekranı      ?demo=class  sınıf seçim ekranı
//   ?demo=chop&phase=hit|fall|land|deny|stage&tree=oak   kesme anını dondurur (darbe / devrilme / yere çarpma / kilitli sekme / hasar evreleri)
//   ?demo=abilities&i=0..3&after=0.35   sınıfın i. yeteneğini atar ve 'after' sn sonra kareyi dondurur
//   ?demo=pause   duraklatma ekranı      ?demo=levelup  seviye atlama kutlaması      ?demo=coach  ilk ipucu
//   &class=baltaci|okcu|buyucu  sınıf seç (varsayılan baltaci; sınıf seçimi atlanır)
//   &rt=1  oyunu yalnızca rAF sürer (gerçek zamanlı ölçüm)
//   &at=fire|oak|iron|ember  kameranın yeri   &perf=1  kare süresi ölçümü (document.title + #demoLog)
import { NODES } from './systems/skills.js';
import { CLASSES, isClass } from './systems/classes.js';
import { Enemy } from './entities/enemy.js';
import { nodePos as nodePosOf } from './art/treeui.js';
import { cacheSize } from './art/pix.js';
import { atlasCount } from './art/font.js';

export function runDemo(game) {
  const q = new URLSearchParams(location.search);
  const mode = q.get('demo');
  const log = document.createElement('pre');
  log.id = 'demoLog';
  log.style.cssText = 'position:fixed;left:0;bottom:0;margin:0;font:10px monospace;color:#7a736a;opacity:.0;pointer-events:none';
  document.body.appendChild(log);
  const errors = [];
  const report = (k, v) => { log.dataset[k] = v; log.textContent = JSON.stringify(log.dataset); console.log('KORDEMO ' + k + ': ' + v); };
  window.addEventListener('error', e => { errors.push(String(e.message)); report('errors', errors.join(' | ')); });
  window.addEventListener('unhandledrejection', e => { errors.push('promise: ' + (e.reason && e.reason.message || e.reason)); report('errors', errors.join(' | ')); });
  const ce = console.error.bind(console);
  console.error = (...a) => { errors.push(a.map(String).join(' ')); report('errors', errors.join(' | ')); ce(...a); };
  report('errors', '');

  const canvas = game.canvas;
  let frozen = false, freezeIf = null, frozenDraws = 0;      // kareyi dondurma (ekran görüntüsü için)
  const key = (code, down) => dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));
  const held = new Set();
  const hold = (code, on) => {
    if (on && !held.has(code)) { key(code, true); held.add(code); }
    if (!on && held.has(code)) { key(code, false); held.delete(code); }
  };
  const aim = (wx, wy) => {
    const r = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: r.left + (wx - game.cam.x) / 480 * r.width, clientY: r.top + (wy - game.cam.y) / 270 * r.height }));
  };
  const node = id => NODES.find(n => n.id === id);
  const place = (where) => {
    const p = game.player, f = game.fire;
    if (where === 'fire' || !where) return;
    const types = { oak: 'oak', iron: 'iron', ember: 'ember', birch: 'birch' };
    const t = game.world.trees.filter(t => t.type === types[where]).sort((a, b) => Math.hypot(a.x - f.x, a.y - f.y) - Math.hypot(b.x - f.x, b.y - f.y))[0];
    if (t) { p.x = t.x - 34; p.y = t.y + 24; game.cam.x = p.x - 240; game.cam.y = p.y - 150; }
  };
  const spawnAround = (kinds, rmin = 50, rmax = 110) => {
    const p = game.player;
    kinds.forEach((k, i) => {
      const a = i / kinds.length * Math.PI * 2 + 0.4, d = rmin + (i % 3) * (rmax - rmin) / 2;
      game.enemies.push(new Enemy(game, k, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d * 0.7, 1 + game.time / 300));
    });
  };

  // kare süresi ölçümü: update + draw süresi (gerçek tarayıcı)
  if (q.get('perf')) {
    const od = game.draw.bind(game), ou = game.update.bind(game);
    let dSum = 0, uSum = 0, dN = 0, uN = 0, dMax = 0;
    game.draw = () => { const t0 = performance.now(); od(); const d = performance.now() - t0; dSum += d; dN++; dMax = Math.max(dMax, d); };
    game.update = (dt) => { const t0 = performance.now(); ou(dt); uSum += performance.now() - t0; uN++; };
    setInterval(() => {
      if (!dN) return;
      const s = `draw ${(dSum / dN).toFixed(2)}ms (max ${dMax.toFixed(1)}) update ${(uSum / Math.max(1, uN)).toFixed(2)}ms kare ${dN} agac ${game.world.trees.length} dusman ${game.enemies.length} parcacik ${game.fx.parts.length}`;
      report('perf', s);
      document.title = 'PERF ' + s;
    }, 500);
  }

  // başsız tarayıcının sanal zamanında rAF seyrek çalışır: ekran görüntüsü için oyunu zamanlayıcıyla sür
  // &rt=1: gerçek zamanlı ölçüm (CDP ile): oyunu yalnızca ana döngü (rAF) sürer
  if (!q.get('rt')) {
    const STEP = 1 / 60;
    setInterval(() => {
      if (!frozen) {
        if (game.state === 'play' && game.fx.hitStop > 0) { game.fx.hitStop -= STEP; game.fx.update(STEP * 0.35); }
        else if (game.state === 'play') game.update(STEP);
        else game.fx.update(STEP);
        // dondur: ana döngü (rAF) de oyunu ilerletmesin
        if (freezeIf && freezeIf()) { frozen = true; game.update = () => {}; game.fx.update = () => {}; report('frozen', 't=' + game.time.toFixed(2)); }
      } else if (++frozenDraws > 2) {
        game.draw = () => {};                // HUD/ekran animasyonları da dursun (kare sabit kalır)
        return;
      }
      game.draw();
    }, 1000 / 60);
  }
  // önbellek büyümesi ölçümü: her 10 sn'de toplam önbellek girdisi
  if (q.get('cache')) {
    let sec = 0;
    setInterval(() => { sec += 10; report('cache' + sec, cacheSize() + ' sprite + ' + atlasCount() + ' font atlas'); }, 10000);
    // yük: her 2 sn odun atışı (alev patlaması) + yetenekler
    setInterval(() => { if (game.state === 'play') { game.fire.addFuel(12, game); game.player.hp = game.stats.maxHp; } }, 2000);
    // yük: yetenekler sırayla (efekt sprite'ları da ölçüme girsin)
    let ai = 0;
    setInterval(() => { if (game.state === 'play') { game.player.warmth = game.stats.maxWarmth; game.abilities.cast(game.cls.abilities[ai++ % 4]); } }, 1500);
  }
  if (mode === 'title') return;
  if (mode === 'class') {
    // &idx=0..2 imleç; &tr=0.15 başlıktan geçişin o anını dondurur
    setTimeout(() => {
      game.openClassSelect();
      if (q.get('idx')) game.classIdx = +q.get('idx');
      if (q.get('tr')) setTimeout(() => { game.draw = () => {}; report('frozen', 'gecis'); }, +q.get('tr') * 1000);
    }, q.get('tr') ? 600 : 0);
    return;
  }
  // demo sınıf seçimini atlar; kayıtlı sınıfı değiştirmez
  const cid = isClass(q.get('class')) ? q.get('class') : 'baltaci';
  game.classId = cid; game.cls = CLASSES[cid];
  game.start();
  const ranged = !game.player.isMelee;
  const tierNodes = max => game.cls.nodes.filter(n => n.tier <= max);
  if (q.get('t')) { game.time = +q.get('t'); }
  place(q.get('at'));

  if (mode === 'tree') {
    // varsayılan: karışık durum (alınmış + alınabilir + puan yetmiyor + kilitli birlikte). &state=full: çoğu alınmış
    const N = game.cls.nodes, br = game.cls.branches.map(b => b.id);
    const at = (b, t) => N.find(n => n.branch === br[b] && n.tier === t);
    const buy = n => { game.points += 9; game.tryBuy(n); };
    if (q.get('state') === 'full') { for (const n of N) for (let i = 0; i < n.max; i++) if (n.tier < 4 || i < 1) buy(n); game.points = 6; }
    else if (q.get('state') === 'new') game.points = 1;
    else { buy(at(0, 1)); buy(at(0, 1)); buy(at(0, 1)); buy(at(0, 2)); buy(at(1, 1)); game.points = 1; }
    game.toggleTree(true);
    const hv = q.get('hover') || game.cls.nodes[3].id;
    setTimeout(() => {
      const n = node(hv);
      const v = game.treeView;
      const pos = nodePosOf(n);
      const r = v.canvas.getBoundingClientRect();
      v.canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: r.left + pos.x / 480 * r.width, clientY: r.top + pos.y / 270 * r.height }));
      if (q.get('buy')) v.canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: r.left + pos.x / 480 * r.width, clientY: r.top + pos.y / 270 * r.height }));
    }, 300);
    return;
  }
  const manual = mode === 'chop' || mode === 'abilities' || mode === 'pause' || mode === 'levelup';
  if (mode === 'chop') {
    game.spawnT = 1e9;
    const phase = q.get('phase') || 'hit', p = game.player, f = game.fire;
    const type = phase === 'deny' ? 'iron' : (q.get('tree') || 'oak');
    const near = game.world.trees.filter(t => t.type === type).sort((a, b) => Math.hypot(a.x - f.x, a.y - f.y) - Math.hypot(b.x - f.x, b.y - f.y));
    const tr = near[0];
    const d = ranged ? 74 : 24;
    p.x = tr.x - d; p.y = tr.y + 3; game.cam.x = tr.x - 240; game.cam.y = tr.y - 150;
    if (phase === 'stage') {
      // yan yana üç hasar evresi
      near.slice(0, 3).forEach((t, i) => { t.hp = t.maxHp * [0.7, 0.45, 0.15][i]; t.dmgStage = i + 1; t.hitDir = 1; t.bendDir = 1; t.lowHp = i === 2; });
      near.slice(0, 3).forEach((t, i) => { if (i) { t.x = tr.x + i * 62; t.y = tr.y + (i % 2) * 6; } });
    } else {
      if (phase === 'fall' || phase === 'land') tr.hp = 1;
      else if (phase === 'hit') { tr.hp = tr.maxHp * 0.62; tr.dmgStage = 1; }
      const want = phase === 'hit' ? +(q.get('n') || 2) : 1;
      setTimeout(() => {
        const iv = setInterval(() => { if (!frozen) { aim(tr.x, tr.y - 4); hold('Space', true); } else { hold('Space', false); clearInterval(iv); } }, 16);
      }, 300);
      if (phase === 'hit') freezeIf = () => tr.hitCount >= want && game.fx.hits.length + game.fx.blasts.length > 0;
      if (phase === 'deny') freezeIf = () => tr.denyT > 0 && tr.denyT < 0.37;
      if (phase === 'fall') freezeIf = () => game.fx.falls.length > 0 && game.fx.falls[0].t > +(q.get('after') || 0.42);
      if (phase === 'land') freezeIf = () => game.fx.falls.length > 0 && game.fx.falls[0].landed && game.fx.falls[0].t > 0.7;
    }
  }
  if (mode === 'abilities') {
    game.spawnT = 1e9;
    for (const n of game.cls.nodes) for (let i = 0; i < (n.ability ? 2 : 1); i++) { game.points += 9; game.tryBuy(n); }
    game.points = 0;
    if (q.get('night')) game.dayT = 95 * 0.86;
    const p = game.player;
    p.x = game.fire.x - 30; p.y = game.fire.y + 96; game.cam.x = p.x - 240; game.cam.y = p.y - 150;
    p.warmth = game.stats.maxWarmth;
    spawnAround(['cinder', 'shade', 'cinder', 'wolf', 'cinder'], 55, 95);
    const id = game.cls.abilities[+(q.get('i') || 0)];
    let castAt = -1;
    setTimeout(() => {
      aim(p.x + 70, p.y - 12);
      setTimeout(() => { game.player.warmth = game.stats.maxWarmth; game.abilities.cast(id); castAt = game.time; }, 80);
    }, 500);
    const after = +(q.get('after') || 0.35);
    freezeIf = () => castAt >= 0 && game.time - castAt >= after;
  }
  if (mode === 'pause') setTimeout(() => game.togglePause(true), 900);
  if (mode === 'levelup') {
    game.spawnT = 1e9;
    let at = -1;
    setTimeout(() => { game.gainXp(game.xpNext); at = game.time; }, 500);
    freezeIf = () => at >= 0 && game.time - at >= +(q.get('after') || 0.3);
  }
  if (mode === 'death') {
    game.time = 187; game.level = 6; game.killCount = 23; game.totalFed = 214;
    if (q.get('best')) game.best[cid] = { time: 240, level: 8 };
    setTimeout(() => { game.player.hurt(1e6, null, true); }, 400); return;
  }
  if (mode === 'night') {
    game.dayT = 95 * 0.86;
    game.level = 7; game.points = 2; game.xp = game.xpNext * 0.6;
    for (const n of tierNodes(3)) { game.points += 4; game.tryBuy(n); }
    game.points = 2;
    game.spawnT = 1e9;
    spawnAround(['cinder', 'shade', 'wolf', 'kolos', 'cinder', 'shade'], 60, 120);
  }
  if (mode === 'hud') {
    for (const n of tierNodes(3)) { game.points += 4; game.tryBuy(n); }
    game.points = 3;
    game.player.hp = game.stats.maxHp * 0.2;
    game.player.warmth = game.stats.maxWarmth * 0.2;
    if (q.get('ok')) { game.player.hp = game.stats.maxHp; game.fire.fuel = 60; game.player.warmth = game.stats.maxWarmth * (cid === 'buyucu' ? 0.3 : 0.8); }
    else game.fire.fuel = 9;
    game.player.carried = 12;
    game.spawnT = 1e9;
    setTimeout(() => { game.abilities.cast(game.cls.abilities[1]); game.abilities.cast(game.cls.abilities[0]); }, 200);
  }

  if (q.get('bench')) {
    game.spawnT = 1e9;
    game.dayT = 95 * 0.86;
    const kinds = ['cinder', 'shade', 'wolf', 'cinder', 'shade'];
    for (let i = 0; i < 39; i++) spawnAround([kinds[i % kinds.length]], 40 + (i % 7) * 25, 200);
    spawnAround(['kolos'], 120, 120);
    setInterval(() => { const p = game.player; game.fx.spark(p.x, p.y - 10, 6, 120); game.fx.chips(p.x, p.y, 4, 'oak'); game.fx.smoke(p.x, p.y, 2); game.fx.leaves(p.x, p.y - 20, 2, 'oak'); }, 33);
    setInterval(() => { for (const e of game.enemies) if (e.hp < e.maxHp * 0.3) e.hp = e.maxHp; game.player.hp = game.stats.maxHp; }, 200);
  }

  // bot: ağaç kes, odunu ateşe at, yakına gelen yaratıkla savaş
  const stride = q.get('stride') !== '0';
  const oldUpdate = game.update.bind(game);
  let lastE = 0;
  game.update = (dt) => {
    const g = game, p = g.player, f = g.fire;
    if (g.state === 'play' && mode !== 'hud' && !manual && stride) {
      const near = g.enemies.filter(e => !e.dead && Math.hypot(e.x - p.x, e.y - p.y) < (ranged ? 150 : 70))
        .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
      let tx = null, ty = null, target = null, atk = false;
      if (near) {
        target = [near.x, near.y]; atk = true;
        const nd = Math.hypot(near.x - p.x, near.y - p.y);
        if (ranged) { if (nd < 70) { tx = p.x - (near.x - p.x); ty = p.y - (near.y - p.y); } }   // menzilli: mesafeyi koru
        else if (nd > 22) { tx = near.x; ty = near.y; }
      } else if (p.carried >= 6 || (f.fuel < 15 && p.carried > 0)) {
        tx = f.x + 34; ty = f.y + 16; target = [f.x, f.y];
        if (Math.hypot(p.x - f.x, p.y - f.y) < 50 && g.time - lastE > 0.5) { lastE = g.time; key('KeyE', true); key('KeyE', false); }
      } else if (g.pickups.some(k => k.type !== 'ash')) {
        const k = g.pickups.find(k => k.type !== 'ash'); tx = k.x; ty = k.y;
      } else {
        const tree = g.world.trees.filter(t => !t.dead && (t.type === 'birch' || t.type === (q.get('at') || 'birch')))
          .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
        if (tree) {
          target = [tree.x, tree.y - 4];
          if (ranged) { if (Math.hypot(tree.x - p.x, tree.y - p.y) > 90) { tx = tree.x; ty = tree.y + 60; } else atk = true; }
          else if (Math.hypot(tree.x - p.x, tree.y + 16 - p.y) > 8) { tx = tree.x - 6; ty = tree.y + 16; } else atk = true;
        }
      }
      if (tx !== null) { hold('KeyA', tx < p.x - 3); hold('KeyD', tx > p.x + 3); hold('KeyW', ty < p.y - 3); hold('KeyS', ty > p.y + 3); }
      else for (const k of ['KeyA', 'KeyD', 'KeyW', 'KeyS']) hold(k, false);
      if (target) aim(target[0], target[1]);
      hold('Space', atk);
      for (const n of g.cls.nodes) { if (n.ability || n.tier > 2) continue; const lv = g.owned[n.id] | 0; if (lv < n.max && g.points >= n.cost + lv * n.step) g.tryBuy(n); }
    }
    oldUpdate(dt);
  };
  if (mode === '1' && q.get('enemies')) setTimeout(() => spawnAround(['cinder', 'shade'], 70, 100), 2500);
}

