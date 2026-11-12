// KOR — oyun çekirdeği
import { clamp, dist, lerp, rand, randInt, pick, TAU, fmt, easeOut } from './core/util.js';
import { bindInput, axis, key, keyDown, mouseState, endFrameInput, anyDir } from './core/input.js';
import { initAudio, resumeAudio, sfx, setMusicIntensity, isMuted, setMuted } from './core/audio.js';
import { World, TREE_TIERS, damageStage, resetTreeHitState } from './world/world.js';
import { Fire } from './world/fire.js';
import { Player } from './entities/player.js';
import { Enemy } from './entities/enemy.js';
import { Fx, HIT_STOP } from './systems/fx.js';
import { AbilitySystem, ABILITIES } from './systems/abilities.js';
import { computeStats, buyNode } from './systems/skills.js';
import { CLASSES, CLASS_IDS, DEFAULT_CLASS, isClass } from './systems/classes.js';
import {
  treeSprite, treeFlash, TREE_INFO, groundChunk, CHUNK, rockSprite, bushSprite, stumpSprite, logPiece, ashOrb,
  lightHole, lightGlow, vignette, shadowEllipse, ENEMY_META, PAL, drawText,
} from './art/sprites.js';
import { Hud } from './art/hud.js';
import { Screens } from './art/screens.js';
import { SkillTreeView } from './art/treeui.js';
import { vrnd } from './systems/fx.js';
import { notchSprite, notchInfo, lockBadge } from './art/fxart.js';
import { installFit } from './art/fit.js';

export const FUEL_PER_WOOD = 4;   // 1 odun birimi = 4 yakıt
export const FEED_PER_POINT = 26; // her 26 yakıt = 1 kor puanı
export const AUTO_REPEAT = true;  // saldırı tuşu basılı tutulunca vuruş kendiliğinden tekrarlanır
// vuruşta ağaç flaşı: en çok 2 çizim karesi, yalnızca gövdenin alt kısmı (darbe çevresi), düşük opaklık.
// Yapraklar beyaza kesmez. Kare sayacı çizimde düşer: hit-stop dünyayı dondursa da flaş uzamaz.
export const TREE_FLASH = Object.freeze({ frames: 2, time: 0.035, alpha: 0.35, band: 20 });
export const MOUSE_IDLE = 1.5;    // sn: fare bu kadar kıpırdamazsa "klavye modu" (yüz yönü hareket yönü, en yakın hedef)

// yerel depolama (yoksa ya da engelliyse oyun yine çalışır)
const LS = { cls: 'kor.class', best: 'kor.best', mute: 'kor.mute' };
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* yok say */ } }
function loadBest() {
  try { const o = JSON.parse(lsGet(LS.best) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
}

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.W = canvas.width; this.H = canvas.height;
    // ışık katmanı
    // ışık katmanı: yarım çözünürlükte tek offscreen canvas (2x büyütülür → pikselli ışık)
    this.light = document.createElement('canvas');
    this.light.width = this.W >> 1; this.light.height = this.H >> 1;
    this.lctx = this.light.getContext('2d');
    this.lctx.imageSmoothingEnabled = false;
    this.hud = new Hud();
    this.screens = new Screens();
    this.treeView = null;
    this._lastDraw = 0; this._dt = 1 / 60;
    this._dl = [];
    this.deathT = 0;
    this.cam = { x: 0, y: 0 };
    this.state = 'title';
    this.world = new World();
    this.fx = new Fx();
    // sınıf: son seçilen (yoksa baltacı)
    const saved = lsGet(LS.cls);
    this.classId = isClass(saved) ? saved : DEFAULT_CLASS;
    this.cls = CLASSES[this.classId];
    this.classIdx = CLASS_IDS.indexOf(this.classId);   // sınıf seçim ekranındaki imleç
    this.best = loadBest();                             // { sınıf: { time, level } }
    this.lastRun = null;                                // son ölümün özeti (ölüm ekranı için)
    this.inputMode = 'keys';                            // 'mouse' | 'keys' (son girdi)
    this.mouseIdle = 99; this._lastAct = mouseState().act;
    this.stats = computeStats({}, this.classId);
    this.fire = new Fire(this);
    this.player = new Player(this);
    this.abilities = new AbilitySystem(this);
    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    this.owned = {};
    this.points = 0;
    this.xp = 0; this.level = 1; this.xpNext = 24;
    this.carried = 0;
    this.totalFed = 0; this.totalHarvest = 0;
    this.time = 0; this.dayT = 0; this.night = 0;
    this.spawnT = 6;
    this.killCount = 0; this.feedAcc = 0;
    this.deathCause = '';
    this.autoDepositT = 0;
    this.keysDown = new Set();
    this.sfx = sfx;
    this.paused = false;
    this.emberFlash = 0;
    this.denyCount = 0; this._denyToastT = -99;
    this._colChain = 0; this._colAt = -9;
    setMuted(lsGet(LS.mute) === '1');
    bindInput(canvas);
    this.bindUI();
    this.fx.onLand = () => sfx.thud && sfx.thud();
    installFit();
    // yalnızca ?demo=... ile: ekran görüntüsü / ölçüm botu (normal oyunu etkilemez)
    if (typeof location !== 'undefined' && /[?&]demo=/.test(location.search || '')) {
      import('./demo.js').then(m => m.runDemo(this)).catch(e => console.error(e));
    }
  }

  bindUI() {
    // başlık: ORMANA GİR → sınıf seçimi. Ölüm: TEKRAR → aynı sınıf, SINIF DEĞİŞTİR → seçim ekranı.
    document.getElementById('startBtn').onclick = () => this.openClassSelect();
    document.getElementById('retryBtn').onclick = () => this.start();
    document.getElementById('changeBtn').onclick = () => this.openClassSelect();
    for (const id of ['startBtn', 'retryBtn', 'changeBtn']) {
      const b = document.getElementById(id);
      b.addEventListener('mouseenter', () => { this.screens.hover = id === 'changeBtn' ? 2 : 1; });
      b.addEventListener('mouseleave', () => { this.screens.hover = 0; });
    }
    CLASS_IDS.forEach((cid, i) => {
      const b = document.getElementById('clsBtn' + i);
      b.onclick = () => this.selectClass(cid);
      b.addEventListener('mouseenter', () => { if (this.classIdx !== i) sfx.uiMove(); this.classIdx = i; this._lastIdx = i; });
    });
    addEventListener('keydown', e => this.onKey(e.code, e.repeat));
    this.treeOpen = false;
    this.buildTreeUI();
  }

  onKey(c, repeat = false) {
    const st = this.state;
    if (c === 'KeyM') { this.toggleMute(); return; }
    if (st === 'classSelect') {
      const n = CLASS_IDS.length;
      if (c === 'KeyA' || c === 'ArrowLeft') this.classIdx = (this.classIdx + n - 1) % n;
      else if (c === 'KeyD' || c === 'ArrowRight') this.classIdx = (this.classIdx + 1) % n;
      else if (c === 'Digit1' || c === 'Digit2' || c === 'Digit3') this.classIdx = +c.slice(5) - 1;
      if (this.classIdx !== this._lastIdx) { this._lastIdx = this.classIdx; sfx.uiMove(); }
      if (c === 'KeyA' || c === 'ArrowLeft' || c === 'KeyD' || c === 'ArrowRight' || c.startsWith('Digit')) return;
      if (c === 'Enter' || c === 'NumpadEnter' || c === 'Space') this.selectClass(CLASS_IDS[this.classIdx]);
      else if (c === 'Escape') this.backToTitle();
      return;
    }
    if (st === 'title') { if (c === 'Enter' || c === 'NumpadEnter') this.openClassSelect(); return; }
    if (st === 'death') {
      if (c === 'KeyR') this.start();
      else if (c === 'KeyC') this.openClassSelect();
      return;
    }
    if (st !== 'play') return;
    // beceri ağacı açıkken ok tuşları/WASD gezinir, Enter satın alır (Boşluk almaz)
    if (this.treeOpen && this.treeView && this.treeView.onKey(c, repeat)) return;
    if (c === 'Escape') {
      if (this.treeOpen) this.toggleTree(false);
      else this.togglePause();
    } else if (c === 'KeyP') { if (!this.treeOpen) this.togglePause(); }
    else if (c === 'KeyF') { if (!this.paused) this.toggleTree(); }
    else if (c === 'KeyC' && this.paused) this.openClassSelect();
  }

  togglePause(on) {
    if (this.state !== 'play') return;
    this.paused = on === undefined ? !this.paused : !!on;
    sfx.pickup();
  }

  toggleMute() {
    setMuted(!isMuted());
    lsSet(LS.mute, isMuted() ? '1' : '0');
    this.toast(isMuted() ? 'Ses kapalı (M)' : 'Ses açık (M)');
  }

  // ---------- sınıf seçimi ----------
  // game.state: 'title' → 'classSelect' → 'play' ↔ (paused bayrağı) → 'death'
  openClassSelect() {
    this.state = 'classSelect';
    this.paused = false; this.treeOpen = false;
    document.getElementById('tree').classList.add('hidden');
    document.getElementById('title').classList.add('hidden');
    document.getElementById('death').classList.add('hidden');
    document.getElementById('classSel').classList.remove('hidden');
    this.classIdx = Math.max(0, CLASS_IDS.indexOf(this.classId));
    this.screens.hover = 0;
  }

  backToTitle() {
    this.state = 'title';
    document.getElementById('classSel').classList.add('hidden');
    document.getElementById('title').classList.remove('hidden');
  }

  // sınıfı seç ve oyunu bu sınıfla temiz başlat
  selectClass(id) {
    if (!isClass(id)) return false;
    this.classId = id; this.cls = CLASSES[id];
    this.classIdx = CLASS_IDS.indexOf(id);
    lsSet(LS.cls, id);
    this.start();
    return true;
  }

  // aynı sınıfla (ölünce TEKRAR) temiz başlangıç
  start() {
    initAudio(); resumeAudio();
    document.getElementById('title').classList.add('hidden');
    document.getElementById('death').classList.add('hidden');
    document.getElementById('classSel').classList.add('hidden');
    this.screens.hover = 0;
    this.reset();
    this.state = 'play';
  }

  reset() {
    this.cls = CLASSES[this.classId];
    this.paused = false;
    this.world.reset();
    this.fx.reset();
    this.abilities.reset();
    this.enemies.length = 0;
    this.projectiles.length = 0;
    this.pickups.length = 0;
    this.owned = {};
    this.points = 0;
    this.xp = 0; this.level = 1; this.xpNext = 24;
    this.stats = computeStats(this.owned, this.classId);
    this.fire.reset(this);
    this.fire.x = this.world.altar.x; this.fire.y = this.world.altar.y;
    this.player = new Player(this);
    this.player.hp = this.stats.maxHp;
    this.player.warmth = this.stats.maxWarmth;
    this.time = 0; this.dayT = 0; this.night = 0;
    this.feedAcc = 0; this.spawnT = 12; this.killCount = 0; this.totalFed = 0; this.totalHarvest = 0;
    this.cam.x = this.player.x - this.W / 2; this.cam.y = this.player.y - this.H / 2;
    this.treeOpen = false;
    this.lastRun = null;
    this.mouseIdle = 99; this._lastAct = mouseState().act; this.inputMode = 'keys';
    this.denyCount = 0; this._denyToastT = -99;
    this._colChain = 0; this._colAt = -9;      // toplama zinciri: yeni oyunda ilk odunun sesi taban perdeden başlar
    const bar = document.getElementById('skillBar');
    bar.dataset.built = '';                 // yetenek kutuları yeni sınıfa göre yeniden kurulur
    document.getElementById('tree').classList.add('hidden');
    this.tierFlags = { birch: true, oak: false, iron: false, ember: false };
    this.toast('Orman seni bekliyor. Odun kes, ateşi besle.');
  }

  // oyuncuya yakın ışık/ateş yükseltmeleri
  recompute() {
    const oldMax = this.stats.maxHp;
    this.stats = computeStats(this.owned, this.classId);
    if (this.player) {
      this.player.hp = Math.min(this.stats.maxHp, this.player.hp + Math.max(0, this.stats.maxHp - oldMax));
    }
  }

  toggleTree(open) {
    const el = document.getElementById('tree');
    this.treeOpen = open === undefined ? !this.treeOpen : open;
    el.classList.toggle('hidden', !this.treeOpen);
    if (this.treeOpen) { this.buildTreeUI(); sfx.pickup(); } else sfx.buy();
  }

  toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('on');
    if (this.hud) this.hud.toast(msg);
    clearTimeout(this._tt);
    this._tt = setTimeout(() => t.classList.remove('on'), 2100);
  }

  onPlayerDeath(cause) {
    if (this.state !== 'play') return;
    this.state = 'death';
    this.deathT = 0;
    this.deathCause = cause || (this.player.warmth <= 0 ? 'KARANLIK SENİ SARDI' : 'ORMAN KANINI İÇTİ');
    this.paused = false;
    sfx.fireDeath();
    this.fx.screenFlash('#7a1010', 0.7);
    this.fx.ash(this.player.x, this.player.y - 8, 22, 8);
    this.fx.embers(this.player.x, this.player.y - 6, 8, 8);
    // en iyi skor: sınıf başına hayatta kalınan süre (eşitlikte seviye)
    const time = Math.floor(this.time), prev = this.best[this.classId];
    const isBest = !prev || time > prev.time || (time === prev.time && this.level > prev.level);
    if (isBest) { this.best[this.classId] = { time, level: this.level }; lsSet(LS.best, JSON.stringify(this.best)); }
    this.lastRun = {
      classId: this.classId, className: this.cls.name, time, level: this.level, kills: this.killCount,
      fed: Math.floor(this.totalFed), isBest, best: this.best[this.classId], prevBest: prev || null,
    };
    const el = document.getElementById('death');
    document.getElementById('deathTitle').textContent = this.deathCause;
    document.getElementById('deathStats').textContent =
      `${this.cls.name} · Seviye ${this.level} · Kesilen ${this.killCount} · Beslenen ${this.totalFed} kor · ${fmt(time)} sn` +
      (isBest ? ' · YENİ REKOR' : ` · En iyi ${fmt(this.best[this.classId].time)} sn`);
    setTimeout(() => { if (this.state === 'death') el.classList.remove('hidden'); }, 550);
  }

  gainXp(amount) {
    this.xp += amount * this.stats.xpGain;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = Math.floor(this.xpNext * 1.28 + 6);
      this.points++;
      this.player.hp = Math.min(this.stats.maxHp, this.player.hp + 30);
      sfx.levelup();
      // kısa kutlama: altın patlama halkası, yükselen korlar (büyük yazı HUD'da)
      this.fx.blast(this.player.x, this.player.y - 6, 44, 'gold', false);
      this.fx.ring(this.player.x, this.player.y, 30, '#ffe08a', 0.6, 2);
      this.fx.spark(this.player.x, this.player.y - 8, 18, 140, '#ffe08a');
      this.fx.embers(this.player.x, this.player.y - 6, 12, 12);
      this.toast('Kor puanı kazandın — F ile ağacı aç');
      this.recompute();
    }
  }

  // ağaç bu oyuncunun gücüne açık mı? (TREE_TIERS.unlock = en düşük seviye)
  canCut(t) { return this.level >= TREE_TIERS[t.type].unlock; }

  // kilitli ağaca vuruş: hasar yok, kısa uyarı ve sekme
  treeDenied(t, ability, ang) {
    if (ability) return;                                   // alan yetenekleri sessizce geçer
    const p = this.player, tier = TREE_TIERS[t.type];
    this.denyCount++;
    t.wobble = 0.55; t.denyT = 0.4;
    const a = ang === null || ang === undefined ? Math.atan2(t.y - p.y, t.x - p.x) : ang;
    t.hitAng = a; t.hitDir = Math.cos(a) >= 0 ? 1 : -1; t.bendDir = t.hitDir;
    if (p.isMelee) p.bump(a, 150);
    // metalik sekme: temas noktasında çelik kıvılcım, "tınk", kısa uyarı
    const cx = t.x - t.hitDir * ((notchInfo(t.type).w >> 1) + 2), cy = t.y - 5;
    this.fx.impact(cx, cy, 'steel', false);
    this.fx.spark(cx, cy, 6, 110, '#a9bccb');
    this.fx.spark(cx, cy, 2, 70, '#e9e0cc');
    this.fx.shake(1.6, 0.1);
    this.fx.stop(HIT_STOP.deny);
    sfx.clank();
    if (this.time - this._denyToastT > 1.2) {
      this.fx.text(t.x, t.y - 40, 'SEVİYE ' + tier.unlock, '#a9bccb', 8);
      this._denyToastT = this.time;
      this.toast(`${this.cls.weak} — ${tier.name} için SEVİYE ${tier.unlock} gerek`);
    }
  }

  // dmg: ağaca işleyen hasar. ang: vuruş yönü (oyuncudan ağaca, rad). ability: alan yeteneği (odun %60)
  // dönüş: hasar uygulandı mı (kilitli ağaçta false)
  hitTree(t, dmg, crit = false, ability = false, ang = null) {
    if (t.dead) return false;
    if (!this.canCut(t)) { this.treeDenied(t, ability, ang); return false; }
    t.hp -= dmg;
    t.hurt = TREE_FLASH.time; t.flashN = TREE_FLASH.frames;
    t.wobble = 1;
    // ağaç tepkisi verisi (çizim tarafı için): son vuruş yönü / zamanı, vuruş sayısı, hasar evresi 0-3
    const a = ang === null || ang === undefined ? Math.atan2(t.y - this.player.y, t.x - this.player.x) : ang;
    t.hitAng = a; t.hitDir = Math.cos(a) >= 0 ? 1 : -1;
    t.lastHitT = this.time; t.hitCount = (t.hitCount | 0) + 1;
    t.dmgStage = t.hp <= 0 ? 3 : damageStage(t.hp, t.maxHp);
    t.bendDir = t.hitDir;      // görsel: vuruş yönüne esneme
    const tier = TREE_TIERS[t.type];
    const I = TREE_INFO[t.type];
    const vr = (a2, b2) => b2 + vrnd() * (a2 - b2);
    // odun/taş düşür
    if (t.hp <= 0) {
      t.dead = true;
      const mult = this.stats.woodMult * (ability ? 0.6 : 1);
      const total = Math.max(1, Math.round(tier.wood * mult * (t.type === 'ember' ? 1.4 : 1)));
      const xpGain = Math.round(tier.xp);
      this.spawnDrops(t.x, t.y - 6, total, t.type);
      this.gainXp(xpGain);
      this.world.stumps.push({ x: t.x, y: t.y, v: t.variant % 2, t: 0 });
      if (this.world.stumps.length > 60) this.world.stumps.shift();
      // devrilme: gövde dibinden yana yatar, yere çarpınca toz ve yaprak
      const mirror = t.x < this.fire.x;
      this.fx.fall(treeSprite(t.type, t.variant, mirror), t.x, t.y + 4, I.w >> 1, I.base, t.bendDir, t.type);
      const cx = t.x - t.hitDir * ((notchInfo(t.type).w >> 1) + 1), cy = t.y - 4;
      this.fx.impact(cx, cy, 'hot', true);
      this.fx.chips(cx, cy, 18, t.type, -t.hitDir);
      this.fx.chips(t.x, t.y - 4, 6, t.type);
      this.fx.leaves(t.x, t.y - I.base + I.canopy, 12, t.type, I.w * 0.35);
      this.fx.spark(cx, cy, 8, 130);
      this.fx.shake(5, 0.22);
      this.fx.stop(HIT_STOP.fell);
      sfx.felled();
      if (crit) { this.fx.text(t.x, t.y - 30, 'KOP!', '#ffe08a', 12); sfx.crit(); }
      else this.fx.text(t.x, t.y - 28, Math.round(dmg), '#e9e0cc', 8);
      // yeni ağaç yeniden doğar (döngü)
      this.respawnTree(t, 9 + rand(6));
    } else {
      t.wasHurt = true;
      // darbe: temas noktasında kıvılcım, talaş vuruşun tersine fışkırır, tepeden yaprak dökülür
      const cx = t.x - t.hitDir * ((notchInfo(t.type).w >> 1) + 1), cy = t.y - 4 - vr(3, 0);
      this.fx.impact(cx, cy, 'hot', crit);
      this.fx.chips(cx, cy, crit ? 11 : 6, t.type, -t.hitDir);
      this.fx.leaves(t.x + vr(8, -8), t.y - I.base + I.canopy, crit ? 6 : 3, t.type, I.w * 0.32);
      this.fx.spark(cx, cy, crit ? 6 : 3, 100);
      if (crit) { this.fx.text(t.x, t.y - 28, Math.round(dmg) + '!', '#ffb447', 12); sfx.crit(); }
      else this.fx.text(t.x, t.y - 26, Math.round(dmg), '#e9e0cc', 8);
      sfx.chop(crit ? 1.4 : 1, this.player.combo);
      this.fx.shake(crit ? 3 : 1.8, crit ? 0.16 : 0.1);
      this.fx.stop(crit ? HIT_STOP.crit : HIT_STOP.hit);
      if (t.hp / t.maxHp < 0.34) t.lowHp = true;
    }
    return true;
  }

  // alan hasarı (büyücü küresi, yağmurlar, meteor...). o: { r, dmg, treeMul, primary, falloff, burn, slow, chill, freeze, quiet, big }
  // merkez tam hasar, kenar (1 - falloff) kadar. Yaratık ve ağaçları birlikte vurur.
  explode(x, y, o) {
    const p = this.player, fall = o.falloff === undefined ? 0.4 : o.falloff;
    const ability = !o.primary;
    let hit = false;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = dist(x, y, e.x, e.y), reach = o.r + e.r;
      if (d > reach) continue;
      e.hurt(o.dmg * (1 - fall * d / reach), p);
      hit = true;
      const bd = typeof o.burn === 'number' ? o.burn : o.burn ? 10 : 0;
      if (bd > 0) e.burnDps = Math.max(e.burnDps, bd);
      const slowT = (o.slow ? 0.8 : 0) + (o.chill > 0 ? 1 + 0.8 * o.chill : 0);
      if (slowT > 0) e.slowT = Math.max(e.slowT, slowT);
      if (o.freeze > 0 && Math.random() < o.freeze) e.freezeT = Math.max(e.freezeT, 1.2);
    }
    if (o.treeMul > 0) {
      for (const t of this.world.trees) {
        if (t.dead) continue;
        const d = dist(x, y, t.x, t.y), reach = o.r + t.radius * 0.6;
        if (d > reach) continue;
        const ang = Math.atan2(t.y - y, t.x - x);
        if (this.hitTree(t, o.dmg * o.treeMul * (1 - fall * d / reach), false, ability, ang)) { hit = true; t.scorchAt = this.time; t.scorchCold = o.chill > 0 || o.freeze > 0 ? 1 : 0; }
      }
    }
    if (hit && o.primary) p.registerHit();
    if (!o.quiet) {
      const cold = o.chill > 0 || o.freeze > 0;
      this.fx.blast(x, y, o.r, cold ? 'frost' : 'fire', !!o.big);
      this.fx.spark(x, y - 2, o.big ? 26 : 9, o.big ? 210 : 120, cold ? '#8fd3ff' : undefined);
      if (!cold) this.fx.embers(x, y, o.big ? 10 : 3, o.r * 0.5);
      if (o.big) { this.fx.smoke(x, y, 8); this.fx.dust(x, y + 4, 14, o.r * 0.7); }
      this.fx.shake(o.big ? 6 : 1.4, o.big ? 0.3 : 0.08);
      if (hit) this.fx.stop(o.big ? HIT_STOP.blastBig : HIT_STOP.blast);
      sfx.boom(!!o.big);
    }
    return hit;
  }

  // imleç altındaki hedefi bul: ağaç gövdesi/tepesi (sprite kutusu) ya da yaratık. Yoksa null.
  pickAt(wx, wy) {
    let best = null, bd = Infinity;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = dist(wx, wy, e.x, e.y - 4);
      if (d < e.r + 6 && d < bd) { bd = d; best = { x: e.x, y: e.y, kind: 'enemy', ref: e }; }
    }
    if (best) return best;
    for (const t of this.world.trees) {
      if (t.dead) continue;
      const I = TREE_INFO[t.type];
      if (Math.abs(wx - t.x) <= I.w * 0.4 && wy >= t.y + 4 - I.base && wy <= t.y + 6) {
        const d = dist(wx, wy, t.x, t.y);
        if (d < bd) { bd = d; best = { x: t.x, y: t.y, kind: 'tree', ref: t }; }
      }
    }
    return best;
  }

  // oyuncuya en yakın hedef (yaratık önce; yoksa kesilebilir ağaç)
  nearestTarget(range, wantTrees = true) {
    const p = this.player;
    let best = null, bd = range;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = dist(p.x, p.y, e.x, e.y);
      if (d < bd) { bd = d; best = { x: e.x, y: e.y, kind: 'enemy', ref: e }; }
    }
    if (best || !wantTrees) return best;
    bd = range;
    for (const t of this.world.trees) {
      if (t.dead || !this.canCut(t)) continue;
      const d = dist(p.x, p.y, t.x, t.y);
      if (d < bd) { bd = d; best = { x: t.x, y: t.y, kind: 'tree', ref: t }; }
    }
    return best;
  }

  // menzilli saldırı / yetenek hedefi: fare modunda imleç (ağaç tepesine tıklamak gövdeyi hedefler),
  // klavye modunda en yakın hedef, yoksa bakılan yön. { x, y, ang, dist, kind }
  aimPoint(maxDist = 250) {
    const p = this.player;
    let pt = null;
    if (this.inputMode === 'mouse') {
      const mw = this.input ? this.input.mouseWorld : mouseState().world;
      pt = this.pickAt(mw.x, mw.y) || { x: mw.x, y: mw.y, kind: 'ground' };
    } else {
      pt = this.nearestTarget(maxDist);
      if (!pt) {
        const a = p.keyAng !== undefined ? p.keyAng : p.facing;
        pt = { x: p.x + Math.cos(a) * 110, y: p.y + Math.sin(a) * 110, kind: 'ground' };
      }
    }
    let dx = pt.x - p.x, dy = pt.y - p.y, d = Math.hypot(dx, dy);
    if (d < 6) { dx = Math.cos(p.facing); dy = Math.sin(p.facing); d = 6; }
    const ang = Math.atan2(dy, dx);
    if (d > maxDist) { pt = { ...pt, x: p.x + Math.cos(ang) * maxDist, y: p.y + Math.sin(ang) * maxDist }; d = maxDist; }
    return { x: pt.x, y: pt.y, ang, dist: d, kind: pt.kind };
  }

  // total: toplam odun birimi; en çok 8 parçaya bölünür (her parça val birim taşır)
  spawnDrops(x, y, total, type) {
    const pieces = Math.min(8, Math.max(1, Math.floor(total)));
    const base = Math.floor(total / pieces), rem = Math.floor(total) % pieces;
    for (let i = 0; i < pieces; i++) {
      const a = rand(Math.PI * 2), d = rand(18, 4);
      this.pickups.push({
        x, y, vx: Math.cos(a) * d * 2.4, vy: Math.sin(a) * d * 2.4 - 30,
        type: type, t: 0, life: 20, val: base + (i < rem ? 1 : 0), fell: type !== 'ash',
      });
    }
  }

  respawnTree(t, delay) {
    const altar = this.world.altar;
    const ringRange = {
      birch: [130, 640], oak: [380, 900], iron: [700, 1120], ember: [980, 1250],
    }[t.type];
    let x = 0, y = 0, ok = false;
    for (let tries = 0; tries < 30 && !ok; tries++) {
      const a = rand(TAU), d = rand(ringRange[1], ringRange[0]);
      x = altar.x + Math.cos(a) * d; y = altar.y + Math.sin(a) * d * 0.82;
      if (x < 40 || y < 40 || x > this.world.w - 40 || y > this.world.h - 40) continue;
      ok = !this.world.trees.some(o => !o.dead && dist(o.x, o.y, x, y) < 44);
    }
    if (ok) { t.x = x; t.y = y; t.variant = randInt(0, 3); }
    t.hp = t.maxHp; t.dead = true; t.delayed = delay; t.wobble = 0; t.hurt = 0;
    t.lowHp = false; t.wasHurt = false;
    resetTreeHitState(t);
    // sıralamayı koru
    this.world.trees.sort((a, b) => a.y - b.y);
  }

  enemyKilled(e) {
    if (e._counted) return;
    e._counted = true;
    this.killCount++;
    this.gainXp(e.xp);
    if (this.stats.killWarmth > 0) this.player.warmth = Math.min(this.stats.maxWarmth, this.player.warmth + this.stats.killWarmth);
    this.points += e.kind === 'kolos' ? 2 : 0;
    if (e.kind === 'kolos') {
      this.toast('KOLOS DÜŞTÜ — +2 kor puanı');
      this.fx.screenFlash('#ffb347', 0.4);
    }
    // kül topları
    const n = e.kind === 'kolos' ? 10 : randInt(0, 2);
    for (let i = 0; i < n; i++) this.spawnDrops(e.x, e.y, 1, 'ash');
  }

  update(dt) {
    const p = this.player;
    // duraklatma ya da beceri ağacı açıkken oyun zamanı (time, gece döngüsü, ateş, yaratık) ilerlemez
    if (this.paused) { endFrameInput(); return; }
    const m = mouseState();
    m.world.x = m.x + this.cam.x; m.world.y = m.y + this.cam.y;
    if (this.treeOpen) {
      this.input = { axis: { x: 0, y: 0 }, mouseWorld: m.world, mode: this.inputMode };
      this.fx.update(dt);
      this.updateHud();
      endFrameInput();
      return;
    }
    this.time += dt;
    this.dayT += dt;

    const cycle = 95;
    const phase = (this.dayT % cycle) / cycle;
    this.night = phase > 0.62 ? Math.min(1, (phase - 0.62) / 0.18) : 0;
    setMusicIntensity(this.night);

    // son girdi: fare yakın zamanda oynadıysa (ya da basılıysa) fare modu; değilse klavye modu
    if (m.act !== this._lastAct) { this._lastAct = m.act; this.mouseIdle = 0; } else this.mouseIdle += dt;
    this.inputMode = (this.mouseIdle <= MOUSE_IDLE || m.down) ? 'mouse' : 'keys';

    const input = { axis: axis(), mouseWorld: m.world, mode: this.inputMode };
    this.input = input;

    // saldırı: basılı tutunca kendiliğinden tekrarlar; savurma sürerken basılan tuş kısa süre hatırlanır
    p.updateAim(input);                       // ilk vuruş güncel nişanla gitsin
    const pressed = m.justDown || keyDown('Space');
    const held = m.down || key('Space');
    if (pressed) p.attackBuf = 0.15;
    if ((AUTO_REPEAT && held) || p.attackBuf > 0) p.startSwing();
    if ((keyDown('ShiftLeft') || keyDown('ShiftRight'))) p.dash();
    const ab = this.cls.abilities;
    if (keyDown('Digit1')) this.abilities.cast(ab[0]);
    if (keyDown('Digit2')) this.abilities.cast(ab[1]);
    if (keyDown('Digit3')) this.abilities.cast(ab[2]);
    if (keyDown('KeyQ')) this.abilities.cast(ab[3]);
    if (keyDown('KeyE')) this.tryDeposit();

    p.update(dt, input);
    this.abilities.update(dt);
    this.fire.update(dt, this);

    for (const t of this.world.trees) {
      if (t.wobble > 0) t.wobble = Math.max(0, t.wobble - dt * 3.2);
      if (t.hurt > 0) t.hurt -= dt;
      if (t.denyT > 0) t.denyT = Math.max(0, t.denyT - dt);
      if (t.dead && t.delayed > 0) {
        t.delayed -= dt;
        if (t.delayed <= 0) {
          t.dead = false; t.hp = t.maxHp; t.lowHp = false; t.wasHurt = false;
          resetTreeHitState(t);
          this.fx.ring(t.x, t.y, 18, '#6f8f3f', 0.5, 1);
          this.fx.chips(t.x, t.y - 4, 5);
        }
      }
    }

    this.updatePickups(dt, p);

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dead) { this.enemies.splice(i, 1); continue; }
      if (dist(e.x, e.y, p.x, p.y) > 900) { this.enemies.splice(i, 1); continue; }
      e.update(dt);
    }
    this.separateEnemies();
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.update(dt);
      if (pr.dead) this.projectiles.splice(i, 1);
    }

    this.spawnLogic(dt);
    this.fx.update(dt);

    const mouseLook = this.inputMode === 'mouse';
    const lookX = mouseLook ? clamp((m.x - this.W / 2) * 0.12, -22, 22) : 0;
    const lookY = mouseLook ? clamp((m.y - this.H / 2) * 0.09, -16, 16) : 0;
    this.cam.x = lerp(this.cam.x, p.x - this.W / 2 + lookX, Math.min(1, dt * 6));
    this.cam.y = lerp(this.cam.y, p.y - this.H / 2 + lookY, Math.min(1, dt * 6));
    this.cam.x = clamp(this.cam.x, 0, this.world.w - this.W);
    this.cam.y = clamp(this.cam.y, 0, this.world.h - this.H);

    this.updateHud();
    endFrameInput();
  }

  // düşmanlar üst üste yığılmasın
  separateEnemies() {
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const min = a.r + b.r - 2;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2);
        const nx = d > 0.001 ? dx / d : 1, ny = d > 0.001 ? dy / d : 0;
        const push = (min - d) * 0.5;
        a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
      }
    }
  }

  // yerdeki odun/kül: devrilince kısa sıçrar, sonra yakındaysa oyuncuya doğru çekilir (mıknatıs).
  // Sepet doluyken odun çekilmez ve yerde kalır.
  updatePickups(dt, p) {
    const mag = this.stats.magnet;
    const full = p.carried >= this.stats.carry;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i];
      k.t += dt; k.life -= dt;
      const isWood = k.type !== 'ash';
      const d = dist(k.x, k.y, p.x, p.y);
      const magR = isWood ? mag + 22 : mag;       // odun biraz geniş yarıçaptan çekilir
      const homing = k.t > 0.3 && d < magR && !(isWood && full);
      if (homing) {
        const a = Math.atan2(p.y - k.y, p.x - k.x);
        const spd = 110 + 300 * (1 - d / magR);
        k.vx += (Math.cos(a) * spd - k.vx) * Math.min(1, dt * 9);
        k.vy += (Math.sin(a) * spd - k.vy) * Math.min(1, dt * 9);
      } else {
        k.vy += 190 * dt;
        k.vx *= (1 - dt * 3.4);
        if (k.vy > 0 && k.t > 0.4) k.vy *= 0.3;
      }
      k.x += k.vx * dt; k.y += k.vy * dt;
      if (isWood && full && d < magR) k.life = Math.max(k.life, 6);   // sepet doluyken yerde bekler
      if (d < 10) {
        if (isWood && full) continue;
        this.collect(k); this.pickups.splice(i, 1); continue;
      }
      if (k.life <= 0) this.pickups.splice(i, 1);
    }
  }

  collect(k) {
    if (k.type === 'ash') {
      this.gainXp(3);
      this.fx.spark(k.x, k.y, 3, 70);
      sfx.pickup();
      return;
    }
    const amount = Math.max(1, k.val | 0);
    this.player.carried = Math.min(this.stats.carry, this.player.carried + amount);
    this.totalHarvest += amount;
    this.fx.spark(k.x, k.y, 3, 60);
    // küçük "+N" ve tok toplama sesi (art arda toplamada perde yükselir)
    this._colChain = this.time - this._colAt < 0.5 ? Math.min(8, (this._colChain | 0) + 1) : 0;
    this._colAt = this.time;
    this.fx.text(this.player.x, this.player.y - 22, '+' + amount, '#ffe08a', 7, -34);
    sfx.collect(this._colChain);
    if (this.player.carried >= this.stats.carry) {
      if (!this._fullWarned) { this.toast('Sırt sepeti dolu — ateşe dön ve boşalt'); this._fullWarned = true; }
    } else this._fullWarned = false;
  }

  tryDeposit() {
    const p = this.player;
    const d = dist(p.x, p.y, this.fire.x, this.fire.y);
    if (d > 58) { this.toast('Ateşe daha yakın ol (E)'); sfx.deny(); return; }
    if (p.carried <= 0) { this.toast('Taşıyacak odun yok'); sfx.deny(); return; }
    const amount = p.carried;
    this.fx.toss(p.x, p.y, this.fire.x, this.fire.y, Math.min(5, 1 + (amount >> 2)), 'oak');
    const gained = this.fire.addFuel(amount * FUEL_PER_WOOD * this.stats.emberGain, this);
    p.carried = 0;
    this.totalFed += gained;
    this.feedAcc += gained;
    const fp = Math.floor(this.feedAcc / FEED_PER_POINT);
    this.feedAcc -= fp * FEED_PER_POINT;
    this.points += fp;
    this.gainXp(amount * 0.8);
    this.fire.level = 1 + Math.floor(this.totalFed / 130);
    sfx.deposit(amount);
    this.toast('Ateş beslendi');
    this.fx.screenFlash('#ff8a2a', 0.14);
  }

  spawnLogic(dt) {
    this.spawnT -= dt;
    const nightMul = 1 + this.night * 1.0;
    if (this.spawnT > 0) return;
    this.spawnT = Math.max(2.4, (6.5 - this.time * 0.008) / nightMul);
    const cap = 2 + Math.floor(this.time / 40) + (this.night > 0.5 ? 1 : 0);
    if (this.enemies.length >= Math.min(cap, 24)) return;

    const kinds = ['cinder'];
    if (this.time > 90) kinds.push('shade');
    if (this.time > 170) kinds.push('wolf');
    const kind = pick(kinds);
    let x = 0, y = 0, ok = false;
    for (let i = 0; i < 16 && !ok; i++) {
      const a = rand(TAU), d = rand(200, 300);
      x = this.player.x + Math.cos(a) * d;
      y = this.player.y + Math.sin(a) * d;
      if (x < 30 || y < 30 || x > this.world.w - 30 || y > this.world.h - 30) continue;
      if (dist(x, y, this.fire.x, this.fire.y) < 160) continue;
      ok = true;
    }
    if (ok) {
      const tier = 1 + this.time / 300;
      this.enemies.push(new Enemy(this, kind, x, y, tier));
    }
    if (this.time > 150 && Math.random() < 0.12 && !this.enemies.some(e => e.kind === 'kolos')) {
      const a = rand(TAU);
      this.enemies.push(new Enemy(this, 'kolos', this.player.x + Math.cos(a) * 250, this.player.y + Math.sin(a) * 250, 1 + this.time / 220));
      this.toast('Yer sarsılıyor... KOLOS uyanıyor.');
      this.fx.shake(6, 0.6);
    }
  }

  updateHud() {
    const s = this.stats, p = this.player;
    document.getElementById('wood').textContent = `${p.carried}/${Math.round(s.carry)}`;
    const fuelPct = clamp(this.fire.fuel / 90, 0, 1) * 100;
    document.getElementById('fireBar').style.width = fuelPct + '%';
    document.getElementById('fireState').textContent =
      this.fire.fuel <= 0 ? 'SÖNÜK' : this.fire.fuel < 20 ? 'ZAYIF' : this.fire.fuel < 55 ? 'YANIYOR' : 'KÜKRÜYOR';
    const wp = clamp(p.warmth / s.maxWarmth, 0, 1) * 100;
    const hb = document.getElementById('heatBar');
    hb.style.width = wp + '%';
    hb.classList.toggle('hot', wp < 30);
    document.getElementById('heatState').textContent = this.cls.resource
      ? `${this.cls.resource} ${Math.round(p.warmth)}/${Math.round(s.maxWarmth)}`    // büyücü: ısı = kaynak
      : p.warmth <= 0 ? 'DONUYOR' : p.warmth / s.maxWarmth < .3 ? 'ÜŞÜYOR' : 'ILIK';
    document.getElementById('lvl').textContent = this.level;
    document.getElementById('xpMiniFill').style.width = clamp(this.xp / this.xpNext * 100, 0, 100) + '%';
    document.getElementById('pts').textContent = this.points;
    const comboEl = document.getElementById('combo');
    if (p.combo >= 3 && p.combo !== this._lastCombo) {
      comboEl.textContent = 'x' + p.combo;
      comboEl.classList.remove('pop');
      void comboEl.offsetWidth;
      comboEl.classList.add('pop');
      comboEl.style.opacity = 1;
      clearTimeout(this._ct);
      this._ct = setTimeout(() => comboEl.style.opacity = 0, 380);
    }
    this._lastCombo = p.combo;
    this.updateSkillBar();
  }

  updateSkillBar() {
    const bar = document.getElementById('skillBar');
    const ids = this.cls.abilities;
    if (bar.dataset.built !== this.classId) {
      bar.innerHTML = ids.map(id =>
        `<div class="slot" data-id="${id}"><span class="k">${ABILITIES[id].key}</span><span class="ic"></span></div>`).join('');
      bar.dataset.built = this.classId;
      ids.forEach(id => {
        const el = bar.querySelector(`[data-id="${id}"]`);
        el.style.pointerEvents = 'auto';
        el.onclick = () => this.abilities.cast(id);
      });
    }
    for (const id of ids) {
      const el = bar.querySelector(`[data-id="${id}"]`);
      const owned = this.abilities.has(id);
      el.classList.toggle('on', owned);
      const label = ABILITIES[id].name + (owned ? '' : ' (kilitli)');
      if (el.title !== label) { el.title = label; el.setAttribute('aria-label', label); }
      const cd = this.abilities.cd[id] || 0;
      let cdEl = el.querySelector('.cd');
      if (cd > 0.05) {
        if (!cdEl) { cdEl = document.createElement('div'); cdEl.className = 'cd'; el.appendChild(cdEl); }
        cdEl.textContent = cd.toFixed(1);
      } else if (cdEl) cdEl.remove();
    }
  }

  // ---------- ÇİZİM ----------
  // başlık/ölüm ekranında dünya donuk ama ateş ve kıvılcımlar yaşar
  ambient(dt) {
    this.fire.t += dt;
    this.fire.animate(dt, this);
    if (this.state === 'title' || this.state === 'classSelect') {
      const t = this.fire.t;
      this.cam.x = this.fire.x - this.W / 2 + Math.sin(t * 0.15) * 14;
      this.cam.y = this.fire.y - 206 + Math.cos(t * 0.11) * 3;
      // başlıkta kor taşıyıcı ateşin yanında bekler (oyuna başlayınca yeni oyuncu oluşur)
      this.player.x = this.fire.x + 40; this.player.y = this.fire.y + 6;
      this.player.facing = Math.PI;
    }
  }

  draw() {
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    let dt = this._lastDraw ? (now - this._lastDraw) / 1000 : 1 / 60;
    this._lastDraw = now;
    dt = clamp(dt, 0, 0.1);
    this._dt = dt;
    if (this.state !== 'play') this.ambient(dt);
    if (this.state === 'death') this.deathT += dt;
    const cur = this.state === 'play' && !this.treeOpen && !this.paused ? 'none' : 'default';
    if (this.canvas.style && this.canvas.style.cursor !== cur) this.canvas.style.cursor = cur;
    const ctx = this.ctx;
    const sh = this.fx.shakeOffset();
    const cam = { x: Math.round(this.cam.x - sh.x), y: Math.round(this.cam.y - sh.y) };
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = false;
    this.drawGround(ctx, cam);
    this.drawDecor(ctx, cam);
    this.drawShadows(ctx, cam);
    this.drawPickups(ctx, cam);
    this.abilities.draw(ctx, cam);
    this.drawSorted(ctx, cam);
    this.fx.drawWorld(ctx, cam);
    this.fx.drawSlashes(ctx, cam);
    this.drawLighting(cam);
    // karanlığın üstünde parlayanlar
    this.abilities.drawGlow(ctx, cam);
    this.fx.drawGlow(ctx, cam);
    this.player.drawGlow(ctx, cam);
    for (const e of this.enemies) e.drawEyes(ctx, cam);
    for (const pr of this.projectiles) pr.draw(ctx, cam);
    this.fx.drawTexts(ctx, cam);
    this.drawOverlays(dt);
    if (this.treeOpen && this.treeView) this.treeView.draw(dt);
  }

  drawGround(ctx, cam) {
    const x0 = Math.max(0, Math.floor(cam.x / CHUNK)), x1 = Math.floor((cam.x + this.W) / CHUNK);
    const y0 = Math.max(0, Math.floor(cam.y / CHUNK)), y1 = Math.floor((cam.y + this.H) / CHUNK);
    ctx.fillStyle = PAL.G0;
    ctx.fillRect(0, 0, this.W, this.H);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      ctx.drawImage(groundChunk(cx, cy, this.world.altar), cx * CHUNK - cam.x, cy * CHUNK - cam.y);
    }
  }

  inView(x, y, m, cam) { return x > cam.x - m && x < cam.x + this.W + m && y > cam.y - m && y < cam.y + this.H + m; }

  drawDecor(ctx, cam) {
    for (const r of this.world.rocks) {
      if (!this.inView(r.x, r.y, 30, cam)) continue;
      ctx.drawImage(rockSprite(r.v), (r.x - cam.x) | 0, (r.y - cam.y) | 0);
    }
    for (const b of this.world.bushes) {
      if (!this.inView(b.x, b.y, 30, cam)) continue;
      ctx.drawImage(bushSprite(b.v), (b.x - cam.x) | 0, (b.y - cam.y) | 0);
    }
    for (const s of this.world.stumps) {
      if (!this.inView(s.x, s.y, 30, cam)) continue;
      ctx.drawImage(stumpSprite(s.v), (s.x - cam.x - 10) | 0, (s.y - cam.y - 10) | 0);
    }
  }

  // zemine düşen gölgeler: ağaçlarınki ateşin ters yönüne kayar
  drawShadows(ctx, cam) {
    const fx = this.fire.x, fy = this.fire.y;
    for (const t of this.world.visible(cam, this.W, this.H)) {
      if (t.dead) continue;
      const I = TREE_INFO[t.type];
      const dx = t.x - fx, dy = t.y - fy, d = Math.hypot(dx, dy) || 1;
      const k = Math.min(6, 900 / d);
      const spr = shadowEllipse(I.w * 0.36, 4 + (t.type === 'oak' || t.type === 'ember' ? 1 : 0));
      ctx.drawImage(spr, Math.round(t.x - cam.x + dx / d * k) - (spr.width >> 1), Math.round(t.y - cam.y + 4 + dy / d * k * 0.5) - (spr.height >> 1));
    }
    for (const e of this.enemies) {
      if (!this.inView(e.x, e.y, 40, cam)) continue;
      const M = ENEMY_META[e.kind];
      const spr = shadowEllipse(M.w * 0.32, e.kind === 'kolos' ? 4 : 2.5);
      const lift = e.kind === 'shade' ? 3 : 0;
      ctx.drawImage(spr, Math.round(e.x - cam.x) - (spr.width >> 1), Math.round(e.y - cam.y + 4 + lift) - (spr.height >> 1));
    }
    this.player.drawShadow(ctx, cam, shadowEllipse(6, 2.5));
  }

  drawSorted(ctx, cam) {
    const dl = this._dl;
    dl.length = 0;
    for (const t of this.world.visible(cam, this.W, this.H)) if (!t.dead) dl.push({ y: t.y, k: 0, o: t });
    for (const f of this.fx.falls) dl.push({ y: f.y - 4, k: 1, o: f });
    for (const e of this.enemies) if (this.inView(e.x, e.y, 50, cam)) dl.push({ y: e.y, k: 2, o: e });
    for (const c of this.fx.corpses) dl.push({ y: c.y, k: 3, o: c });
    dl.push({ y: this.player.y, k: 4, o: this.player });
    dl.push({ y: this.fire.y, k: 5, o: this.fire });
    dl.sort((a, b) => a.y - b.y);
    for (const d of dl) {
      if (d.k === 0) this.drawTree(ctx, d.o, cam);
      else if (d.k === 1) this.fx.drawFall(ctx, d.o, cam);
      else if (d.k === 3) this.fx.drawCorpse(ctx, d.o, cam);
      else d.o.draw(ctx, cam);
    }
  }

  drawTree(ctx, t, cam) {
    const I = TREE_INFO[t.type];
    const mirror = t.x < this.fire.x;          // ateş sağda kalıyorsa ışık sağdan
    const spr = treeSprite(t.type, t.variant, mirror);
    const bx = Math.round(t.x - cam.x), by = Math.round(t.y - cam.y) + 4;
    const x0 = bx - (I.w >> 1), y0 = by - I.base;
    const st = t.dmgStage | 0, dir = t.bendDir || t.hitDir || 1;
    // darbe tepkisi: vuruş yönüne sert esner, yaylanarak döner; ilk anda basılır sonra uzar (squash & stretch)
    const w = t.wobble > 0 ? t.wobble : 0, ph = 1 - w;
    const lean = st >= 3 ? t.hitDir * 2.4 : st === 2 ? t.hitDir * 1 : 0;       // kopmak üzere: kalıcı yatıklık
    const amp = dir * 5.2 * w * w * Math.cos(ph * 9.5) + lean;
    const sy = 1 - 0.075 * w * Math.cos(ph * 12);
    const moving = w > 0 || lean !== 0;
    if (moving) this.drawSliced(ctx, spr, x0, y0, I, amp, sy, w, ph);
    else ctx.drawImage(spr, x0, y0);
    if (t.hurt > 0 && t.flashN > 0) {
      // kısmi flaş: gövdenin dibindeki bant (darbe noktası çevresi) kırpılır; ikinci karede yarı opaklık
      ctx.save();
      ctx.beginPath(); ctx.rect(x0, by - TREE_FLASH.band, I.w, TREE_FLASH.band + 2); ctx.clip();
      ctx.globalAlpha = TREE_FLASH.alpha * t.flashN / TREE_FLASH.frames;
      const fl = treeFlash(t.type, t.variant, mirror);
      if (moving) this.drawSliced(ctx, fl, x0, y0, I, amp, sy, w, ph); else ctx.drawImage(fl, x0, y0);
      ctx.restore();
      ctx.globalAlpha = 1;
      t.flashN--;
    }
    // gövdede hasar evresi: çentik → derin yarık → kopmak üzere
    const tw = notchInfo(t.type).w;
    if (st > 0) {
      const n = notchSprite(t.type, st, t.hitDir);
      ctx.drawImage(n, bx - (tw >> 1) - 2 - (mirror && (tw & 1) ? 1 : 0), by - 12);
    }
    // büyücü küresiyle yakılan gövde: kısa süre kor gibi parlar
    const sAge = t.scorchAt === undefined ? 99 : this.time - t.scorchAt;
    if (sAge < 1.3) {
      const fr = (this.fx.time * 12) | 0, n = sAge < 0.5 ? 6 : 3;
      for (let i = 0; i < n; i++) {
        const hx = ((i * 7 + fr * 3 + (t.variant | 0)) % (tw + 2)) - (tw >> 1) - 1, hy = (i * 5 + fr * 2) % 16;
        ctx.fillStyle = t.scorchCold ? ((i + fr) % 2 ? PAL.F : PAL.A3) : ((i + fr) % 2 ? PAL.E4 : PAL.E5);
        ctx.fillRect(bx + hx, by - 4 - hy, 1, 1);
      }
    }
    // kor ağacı: yapraklardan kor dökülür
    if (t.type === 'ember' && vrnd() < this._dt * 2.2) this.fx.embers(t.x + (vrnd() - 0.5) * 30, t.y - 40 + vrnd() * 16, 1, 4);
    // kilitli ağaca vuruş: kısa süre kilit rozeti
    if (t.denyT > 0) {
      const lb = lockBadge(), hop = Math.round(Math.sin(Math.min(1, (0.4 - t.denyT) / 0.18) * Math.PI) * 3);
      ctx.drawImage(lb, bx - 4, by - 30 - hop);
    }
    // can çubuğu: bölmeli; az kalınca kızarır
    if (t.hp < t.maxHp) {
      const wdt = Math.min(30, I.w - 8);
      const x = bx - (wdt >> 1), y = y0 - 5;
      ctx.fillStyle = PAL.C0; ctx.fillRect(x - 1, y - 1, wdt + 2, 5);
      ctx.fillStyle = PAL.W1; ctx.fillRect(x, y, wdt, 3);
      const f = Math.round(wdt * clamp(t.hp / t.maxHp, 0, 1));
      ctx.fillStyle = t.lowHp ? PAL.E2 : PAL.G4; ctx.fillRect(x, y, f, 3);
      ctx.fillStyle = t.lowHp ? PAL.E4 : PAL.G5; ctx.fillRect(x, y, f, 1);
      ctx.fillStyle = PAL.C0;
      for (let q = 1; q < 4; q++) ctx.fillRect(x + Math.round(wdt * q / 4), y + 1, 1, 2);
    }
  }

  // esneme: 4px yatay şeritler, tepeye doğru artan kayma (piksel kalır); sy dikey basılma/uzama;
  // w > 0 iken tepe yaprakları ayrıca silkelenir
  drawSliced(ctx, spr, x0, y0, I, amp, sy = 1, w = 0, ph = 0) {
    const H = I.base + 1, gy = y0 + H;
    for (let r = 0; r < spr.height; r += 4) {
      const f = Math.max(0, 1 - (r + 2) / H);
      let off = Math.round(amp * f * f);
      if (w > 0 && r < H * 0.6) off += Math.round(Math.sin(ph * 46 + r * 0.9) * 1.7 * w);
      const h = Math.min(4, spr.height - r);
      const dy = Math.round(gy - (H - r) * sy), dh = Math.round(gy - (H - r - h) * sy) - dy;
      if (dh > 0) ctx.drawImage(spr, 0, r, spr.width, h, x0 + off, dy, spr.width, dh);
    }
  }

  drawPickups(ctx, cam) {
    const t = this.time;
    for (const k of this.pickups) {
      if (!this.inView(k.x, k.y, 20, cam)) continue;
      const px = Math.round(k.x - cam.x), py = Math.round(k.y - cam.y);
      const bob = Math.round(Math.sin(t * 6 + k.x) * 1);
      ctx.drawImage(shadowEllipse(3, 1, 0.35), px - 3, py + 2);
      if (k.type === 'ash') ctx.drawImage(ashOrb(), px - 2, py - 3 + bob);
      else {
        // oyuncuya çekilirken arkasında kısa iz
        const sp = Math.hypot(k.vx, k.vy);
        if (sp > 90 && k.t > 0.3) {
          ctx.fillStyle = PAL.E5; ctx.fillRect(Math.round(px - k.vx / sp * 5), Math.round(py - k.vy / sp * 5), 1, 1);
          ctx.fillStyle = PAL.W5; ctx.fillRect(Math.round(px - k.vx / sp * 8), Math.round(py - k.vy / sp * 8), 1, 1);
        }
        ctx.drawImage(logPiece(k.type), px - 4, py - 4 + bob);
        if (k.type === 'ember' && Math.sin(t * 9 + k.x) > 0) { ctx.fillStyle = PAL.E5; ctx.fillRect(px + 2, py - 3 + bob, 1, 1); }
      }
    }
  }

  drawLighting(cam) {
    const ctx = this.ctx, lc = this.lctx;
    const LW = this.light.width, LH = this.light.height, k = LW / this.W;
    const night = this.state === 'title' || this.state === 'classSelect' ? 0.85 : this.night;
    lc.globalCompositeOperation = 'source-over';
    lc.globalAlpha = 1;
    lc.clearRect(0, 0, LW, LH);
    const dark = Math.round(Math.min(0.84, 0.46 + night * 0.38) * 100) / 100;
    lc.fillStyle = 'rgba(10,14,42,' + dark + ')';
    lc.fillRect(0, 0, LW, LH);
    lc.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r, s) => {
      if (r <= 1 || s <= 0) return;
      const sx = x * k, sy = y * k;
      if (sx < -r * k - 4 || sy < -r * k - 4 || sx > LW + r * k + 4 || sy > LH + r * k + 4) return;
      const spr = lightHole(r * k);
      lc.globalAlpha = Math.min(1, s);
      lc.drawImage(spr, Math.round(sx - spr.width / 2), Math.round(sy - spr.height / 2));
    };
    const f = this.fire;
    const fxs = f.x - cam.x, fys = f.y - cam.y - 10;
    const fr = f.fuel > 0 ? f.lightRadius * f.flick : 26;
    hole(fxs, fys, fr, f.fuel > 0 ? 1 : 0.4);
    const p = this.player;
    hole(p.x - cam.x, p.y - cam.y - 8, this.stats.lightRadius, 0.7);
    const vis = this.world.visible(cam, this.W, this.H);
    for (const t of vis) if (!t.dead && t.type === 'ember') hole(t.x - cam.x, t.y - cam.y - 30, 52, 0.6);
    for (const e of this.enemies) {
      if (e.kind === 'cinder') hole(e.x - cam.x, e.y - cam.y - 6, 22, 0.4);
      if (e.flameT > 0.05) hole(e.x - cam.x, e.y - cam.y - 8, 26 + e.flameT * 18, 0.35 * e.flameT);
    }
    for (const pr of this.projectiles) hole(pr.x - cam.x, pr.y - cam.y - pr.z, pr.kind === 'arrow' ? 12 : 24, pr.kind === 'arrow' ? 0.3 : 0.55);
    for (const b of this.fx.blasts) hole(b.x - cam.x, b.y - cam.y, b.r * 0.9 + 22, 0.75 * (1 - b.t / b.dur));
    for (const h of this.fx.hits) hole(h.x - cam.x, h.y - cam.y, h.big ? 30 : 18, 0.5);
    for (const l of this.abilities.lights()) hole(l.x - cam.x, l.y - cam.y, l.r, l.a);
    for (const t of vis) if (!t.dead && t.scorchAt !== undefined && this.time - t.scorchAt < 1.3) hole(t.x - cam.x, t.y - cam.y - 10, 26, 0.45 * (1 - (this.time - t.scorchAt) / 1.3));
    let n = 0;
    for (const q of this.fx.parts) {
      if (q.kind !== 'spark' && q.kind !== 'ember') continue;
      if (++n > 48) break;
      hole(q.x - cam.x, q.y - cam.y, 10, 0.3);
    }
    lc.globalAlpha = 1;
    lc.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.light, 0, 0, this.W, this.H);

    // sıcak parıltı (eklemeli, pikselli bantlar)
    ctx.globalCompositeOperation = 'lighter';
    if (f.fuel > 0) {
      const bq = Math.round(f.burst * 10) / 10;   // patlama 0.1 adım
      const g = lightGlow(fr * k * 0.95, [255, 120, 40], 0.3 + Math.min(0.12, bq * 0.12));
      const s2 = g.width / k;
      ctx.drawImage(g, Math.round(fxs - s2 / 2), Math.round(fys - s2 / 2), s2, s2);
      if (bq > 0) {
        const g2 = lightGlow(26 * k * (1 + bq * 0.5), [255, 150, 50], bq * 0.35);
        const s3 = g2.width / k;
        ctx.drawImage(g2, Math.round(fxs - s3 / 2), Math.round(fys - 4 - s3 / 2), s3, s3);
      }
    }
    for (const t of vis) {
      if (t.dead || t.type !== 'ember') continue;
      const g = lightGlow(44 * k, [255, 80, 30], 0.22);
      const s2 = g.width / k;
      ctx.drawImage(g, Math.round(t.x - cam.x - s2 / 2), Math.round(t.y - cam.y - 30 - s2 / 2), s2, s2);
    }
    const lg = lightGlow(18 * k, [255, 160, 70], 0.16);
    const ls = lg.width / k;
    ctx.drawImage(lg, Math.round(p.x - cam.x - ls / 2 + 2), Math.round(p.y - cam.y - 7 - ls / 2), ls, ls);
    ctx.globalCompositeOperation = 'source-over';
  }

  drawOverlays(dt) {
    const ctx = this.ctx;
    ctx.drawImage(vignette(), 0, 0, this.W, this.H);
    if (this.fx.flash > 0) {
      ctx.globalAlpha = Math.min(0.7, this.fx.flash);
      ctx.fillStyle = this.fx.flashCol;
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.globalAlpha = 1;
    }
    if (this.state === 'play') {
      if (!this.treeOpen) {
        this.hud.draw(this, ctx, this.paused ? 0 : dt);
        // nişangâh: pikselli
        const m = mouseState();
        const mx = Math.round(m.x), my = Math.round(m.y);
        const c = this.player.cd > 0 ? PAL.A1 : PAL.E5;
        ctx.fillStyle = PAL.C0;
        ctx.fillRect(mx - 5, my - 1, 4, 3); ctx.fillRect(mx + 2, my - 1, 4, 3); ctx.fillRect(mx - 1, my - 5, 3, 4); ctx.fillRect(mx - 1, my + 2, 3, 4);
        ctx.fillStyle = c;
        ctx.fillRect(mx - 4, my, 3, 1); ctx.fillRect(mx + 2, my, 3, 1); ctx.fillRect(mx, my - 4, 1, 3); ctx.fillRect(mx, my + 2, 1, 3);
      }
      if (this.paused) this.screens.drawPause(this, ctx, dt); else this.screens.enter('play', dt);
    } else if (this.state === 'title') this.screens.drawTitle(this, ctx, dt);
    else if (this.state === 'classSelect') this.screens.drawClassSelect(this, ctx, dt);
    else if (this.state === 'death') this.screens.drawDeath(this, ctx, dt, this.deathT);
    if (isMuted()) drawText(ctx, 'SES KAPALI (M)', this.W - 4, this.H - 11, { color: PAL.A1, align: 'right', shadow: PAL.C0 });
  }

  // ---------- BECERİ AĞACI UI ----------
  buildTreeUI() {
    const root = document.getElementById('treeCols');
    if (!this.treeView) {
      this.treeView = new SkillTreeView(this);
      root.innerHTML = '';
      root.appendChild(this.treeView.canvas);
    }
    // erişilebilirlik için düğüm durumları DOM'da da tutulur
    root.dataset.owned = Object.keys(this.owned).map(k => k + ':' + this.owned[k]).join(',');
  }

  tryBuy(node) {
    const res = buyNode(node, this.owned, this.points, this.classId);
    if (!res.ok) { this.toast(res.msg); sfx.deny(); return; }
    this.points -= res.cost;
    this.owned[node.id] = res.level;
    this.recompute();
    sfx.buy();
    this.buildTreeUI();
    if (this.treeView) this.treeView.bought(node);
    document.getElementById('pts').textContent = this.points;
    if (node.ability && res.level === 1) this.toast(node.name + ' açıldı — tuş: ' + ABILITIES[node.ability].key);
  }
}
