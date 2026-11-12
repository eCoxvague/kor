// KOR — beceri ağacı ekranı. Sade düzen: sınıfın 3 dalı = 3 sütun; her sütunda ÜSTTEN ALTA 4 satır
// (kademe 1 en üstte), satırlar arasında tek düz bağlantı. Her satırda: büyük ikon kutusu, düğümün ADI,
// seviye pipleri, yetenekse tuş rozeti, sağda bedel etiketi. Altta sabit ayrıntı şeridi (hiçbir düğümü örtmez).
// Durumlar: ALINDI (dolu, dal renginde) · ALINABİLİR (parlak çerçeve + nabız + altın bedel) ·
// PUAN YETMİYOR (bedel kırmızı) · KİLİTLİ (soluk + kilit, bağlantı sönük).
// Yerleşim branch + tier'dan hesaplanır (düğüm verisinde piksel yok).
import { vrnd } from '../systems/fx.js';
import { PAL } from './palette.js';
import { drawText, textWidth, wrapText } from './font.js';
import { icon, nodeIcon } from './icons.js';
import { panel } from './hud.js';
import { nodesOf, nodeCost, nodeUnlocked, computeStats, prevNode } from '../systems/skills.js';
import { CLASSES } from '../systems/classes.js';
import { ABILITIES } from '../systems/abilities.js';
import { sfx } from '../core/audio.js';

// dal renk anahtarı (classes.js → branches[].color)
export const BRANCH_COL = {
  chop: { main: PAL.S, hi: PAL.A3, lo: '#26303c', name: PAL.S },
  ember: { main: PAL.E3, hi: PAL.E5, lo: '#3a1408', name: PAL.E4 },
  root: { main: PAL.G4, hi: PAL.G5, lo: '#1c2a16', name: PAL.G5 },
  bow: { main: PAL.W5, hi: PAL.E5, lo: '#2c1e12', name: PAL.W5 },
  trail: { main: PAL.G4, hi: PAL.G5, lo: '#1c2a16', name: PAL.G5 },
  flame: { main: PAL.E3, hi: PAL.E5, lo: '#3a1408', name: PAL.E4 },
  frost: { main: PAL.F, hi: PAL.A3, lo: '#16283a', name: PAL.F },
  ash: { main: PAL.A2, hi: PAL.A3, lo: '#262321', name: PAL.A2 },
};
export const CLASS_COL = { baltaci: PAL.E3, okcu: PAL.G5, buyucu: PAL.F };

// ---- yerleşim ----
const COL_X = [8, 164, 320], COL_W = 152;
const HEAD_Y = 24, HEAD_H = 28;
const ROW_Y0 = 55, ROW_PITCH = 40, ROW_H = 36;
export const LABEL_Y = 23;                        // AL / YETMİYOR etiketinin satır içi y'si (drawText üst kenarı)
const BOX = 26;                                   // ikon kutusu (12x12 ikon 2 kat büyütülür)
const STRIP = { x: 6, y: 220, w: 468, h: 46 };

const PCT = new Set(['critChance', 'burnChance', 'dodge', 'freeze']);
const MULT = new Set(['woodMult', 'xpGain', 'emberGain', 'abilityPower', 'fuelRate', 'heatCostMul']);
const ABIL = new Set(Object.keys(ABILITIES));
const STAT_NAME = {
  damage: 'Hasar', attackSpeed: 'Vuruş hızı', critChance: 'Kritik', critMult: 'Kritik çarpanı', reach: 'Erişim',
  arc: 'Açı', woodMult: 'Odun', targets: 'Hedef', lifesteal: 'Can/vuruş', burnChance: 'Yakma şansı', burnDps: 'Yakma',
  lightRadius: 'Işık', fuelRate: 'Tüketim', abilityPower: 'Yetenek gücü', emberGain: 'Kor', maxHp: 'Can',
  moveSpeed: 'Hız', maxWarmth: 'Isı', warmthDrain: 'Isı kaybı', magnet: 'Toplama', carry: 'Taşıma',
  dashCd: 'Atılma', xpGain: 'Deneyim', warmthRegen: 'Isınma', multishot: 'Ok', pierce: 'Delme', blastRadius: 'Patlama',
  dodge: 'Kaçınma', heatCostMul: 'Isı bedeli', killWarmth: 'Öldürünce ısı', chill: 'Yavaşlatma', freeze: 'Donma',
};
for (const a of ABIL) STAT_NAME[a] = 'Seviye';
function fmtStat(stat, v) {
  if (PCT.has(stat)) return Math.round(v * 100) + '%';
  if (MULT.has(stat)) return 'x' + v.toFixed(2);
  if (ABIL.has(stat)) return String(Math.round(v));
  return String(Math.round(v * 100) / 100);
}

const branchIdx = node => Math.max(0, CLASSES[node.cls].branches.findIndex(b => b.id === node.branch));
// satır kutusu: { x, y, w, h }
export function nodeRect(node) {
  return { x: COL_X[branchIdx(node)], y: ROW_Y0 + (node.tier - 1) * ROW_PITCH, w: COL_W, h: ROW_H };
}
// düğümün ekran konumu (ikon kutusunun merkezi)
export function nodePos(node) {
  const r = nodeRect(node);
  return { x: r.x + 4 + BOX / 2, y: r.y + 5 + BOX / 2 };
}
export const branchCenter = (cls, branchId) => COL_X[Math.max(0, CLASSES[cls].branches.findIndex(b => b.id === branchId))] + COL_W / 2;

// tuş rozeti: [1] [2] [3] [Q]
export function keyCap(ctx, x, y, ch, on = true) {
  ctx.fillStyle = PAL.C0; ctx.fillRect(x - 1, y - 1, 13, 13);
  ctx.fillStyle = on ? PAL.A2 : PAL.C4; ctx.fillRect(x, y, 11, 11);
  ctx.fillStyle = on ? PAL.C1 : PAL.C0; ctx.fillRect(x + 1, y + 1, 9, 8);
  ctx.fillStyle = on ? PAL.A0 : PAL.C3; ctx.fillRect(x + 1, y + 9, 9, 1);
  drawText(ctx, ch, x + 6, y - 1, { color: on ? PAL.E5 : PAL.C4, align: 'center' });
}

export class SkillTreeView {
  constructor(game) {
    this.game = game;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 480; this.canvas.height = 270;
    this.canvas.className = 'tree-canvas';
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.mx = -99; this.my = -99; this.hover = null;
    this.sel = null; this.selCls = '';
    this.flashes = []; this.sparks = [];
    this.time = 0; this.last = 0; this.denyT = 0; this.denyNode = null;
    const pos = e => {
      const r = this.canvas.getBoundingClientRect();
      this.mx = (e.clientX - r.left) / (r.width || 480) * 480;
      this.my = (e.clientY - r.top) / (r.height || 270) * 270;
    };
    this.canvas.addEventListener('mousemove', e => { pos(e); this.pick(); });
    this.canvas.addEventListener('mouseleave', () => { this.mx = this.my = -99; this.hover = null; });
    this.canvas.addEventListener('mousedown', e => { pos(e); this.pick(); if (this.hover) this.buy(this.hover); });
  }

  nodes() { return nodesOf(this.game.classId); }

  pick() {
    const prev = this.hover;
    this.hover = null;
    for (const n of this.nodes()) {
      const r = nodeRect(n);
      if (this.mx >= r.x && this.mx < r.x + r.w && this.my >= r.y - 2 && this.my < r.y + r.h + 2) { this.hover = n; break; }
    }
    if (this.hover && this.hover !== prev) { this.sel = this.hover; sfx.uiMove(); }
  }

  // seçili düğüm: yoksa ilk alınabilir düğüm (ayrıntı şeridi hiç boş kalmaz)
  current() {
    const g = this.game, nodes = this.nodes();
    if (this.selCls !== g.classId || !this.sel || this.sel.cls !== g.classId) {
      this.selCls = g.classId;
      this.sel = nodes.find(n => this.nodeState(n, g.owned, g.points) === 'afford')
        || nodes.find(n => { const s = this.nodeState(n, g.owned, g.points); return s === 'open' || s === 'ownedOpen'; })
        || nodes[0];
    }
    return this.sel;
  }

  buy(node) {
    const before = this.game.owned[node.id] | 0;
    this.game.tryBuy(node);
    if ((this.game.owned[node.id] | 0) === before) { this.denyT = 0.25; this.denyNode = node; }
  }

  // klavye: ok tuşları / WASD gezinir, yalnızca Enter satın alır (Boşluk saldırı tuşudur: yanlışlıkla puan harcatmasın).
  // Basılı tutma tekrarı (repeat) satın almaz. true = tuş işlendi.
  onKey(code, repeat = false) {
    const cur = this.current();
    if (!cur) return false;
    let col = branchIdx(cur), tier = cur.tier;
    const mv = { ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1] }[code];
    if (mv) {
      col = (col + mv[0] + 3) % 3; tier = Math.max(1, Math.min(4, tier + mv[1]));
      const br = CLASSES[cur.cls].branches[col];
      const n = this.nodes().find(q => q.branch === br.id && q.tier === tier);
      if (n && n !== this.sel) { this.sel = n; sfx.uiMove(); }
      return true;
    }
    if (code === 'Enter' || code === 'NumpadEnter') {
      if (!repeat) this.buy(cur);
      return true;
    }
    return false;
  }

  bought(node) {
    const r = nodeRect(node), p = nodePos(node);
    const col = BRANCH_COL[this.colorOf(node)].hi;
    this.flashes.push({ r, x: p.x, y: p.y, t: 0, col });
    for (let i = 0; i < 22; i++) {
      const a = vrnd() * Math.PI * 2, s = 30 + vrnd() * 80;
      this.sparks.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life: 0.4 + vrnd() * 0.4, col: i % 2 ? col : PAL.E6 });
    }
    this.sel = node;
  }

  colorOf(node) { return CLASSES[node.cls].branches.find(b => b.id === node.branch).color; }

  // 'max' | 'ownedAfford' | 'ownedOpen' | 'afford' | 'open' | 'locked'
  nodeState(n, owned, points) {
    const lv = owned[n.id] | 0;
    if (lv >= n.max) return 'max';
    if (lv === 0 && !nodeUnlocked(n, owned)) return 'locked';
    const can = points >= nodeCost(n, lv);
    if (lv > 0) return can ? 'ownedAfford' : 'ownedOpen';
    return can ? 'afford' : 'open';
  }

  // iki satır arası tek düz bağlantı + ok ucu
  link(ctx, x, y0, y1, state, col, t) {
    ctx.fillStyle = PAL.C0; ctx.fillRect(x - 2, y0, 6, y1 - y0);
    if (state === 'locked') {
      ctx.fillStyle = PAL.C3;
      for (let y = y0 + 1; y < y1 - 1; y += 3) ctx.fillRect(x, y, 2, 1);          // sönük, kesik çizgi
      return;
    }
    ctx.fillStyle = state === 'lit' ? col.main : PAL.A0;
    ctx.fillRect(x, y0, 2, y1 - y0 - 2);
    ctx.fillRect(x - 2, y1 - 4, 6, 1); ctx.fillRect(x - 1, y1 - 3, 4, 1); ctx.fillRect(x, y1 - 2, 2, 1);
    if (state === 'lit') {
      const k = Math.floor(((t * 1.6) % 1) * (y1 - y0 - 2));
      ctx.fillStyle = col.hi; ctx.fillRect(x, y0 + k, 2, 2);
    }
  }

  draw(dt) {
    const g = this.game, ctx = this.ctx;
    this.time += dt;
    this.denyT = Math.max(0, this.denyT - dt);
    const t = this.time;
    const owned = g.owned, points = g.points;
    const cls = CLASSES[g.classId], nodes = nodesOf(g.classId);
    const cur = this.current();
    // opak zemin
    ctx.globalAlpha = 1;
    ctx.fillStyle = PAL.C0; ctx.fillRect(0, 0, 480, 270);
    ctx.fillStyle = '#0b0c16'; ctx.fillRect(0, 22, 480, 196);

    // ---- üst şerit: sınıf adı + kor puanı ----
    const cc = CLASS_COL[g.classId] || PAL.E3;
    ctx.fillStyle = cc; ctx.fillRect(6, 5, 3, 14);
    drawText(ctx, cls.name + ' AĞACI', 14, 0, { color: cc, scale: 2 });
    const has = points > 0;
    panel(ctx, 376, 3, 98, 18, has ? 'gold' : 'wood', 1);
    ctx.drawImage(icon('ember'), 379, 6);
    drawText(ctx, 'KOR PUANI', 394, 6, { color: has ? PAL.E4 : PAL.A1, shadow: PAL.C0 });
    drawText(ctx, String(points), 469, 6, { color: has ? PAL.E6 : PAL.A1, align: 'right', shadow: PAL.C0 });
    drawText(ctx, 'OK TUŞLARI gez · ENTER al · F kapat', 370, 6, { color: PAL.A1, align: 'right' });

    // ---- dal başlıkları ----
    cls.branches.forEach((br, i) => {
      const x = COL_X[i], col = BRANCH_COL[br.color];
      ctx.fillStyle = col.lo; ctx.fillRect(x, HEAD_Y, COL_W, HEAD_H);
      ctx.fillStyle = col.main; ctx.fillRect(x, HEAD_Y, COL_W, 2); ctx.fillRect(x, HEAD_Y, 2, HEAD_H);
      ctx.fillStyle = PAL.C0; ctx.fillRect(x, HEAD_Y + HEAD_H - 1, COL_W, 1);
      drawText(ctx, br.name, x + 8, HEAD_Y - 3, { color: col.name, scale: 2 });
      drawText(ctx, br.hint, x + 8, HEAD_Y + 16, { color: PAL.A2 });
      // dal ilerlemesi: alınan seviye / toplam
      const bn = nodes.filter(n => n.branch === br.id);
      const got = bn.reduce((a, n) => a + (owned[n.id] | 0), 0), tot = bn.reduce((a, n) => a + n.max, 0);
      drawText(ctx, got + '/' + tot, x + COL_W - 5, HEAD_Y + 3, { color: got ? col.hi : PAL.A0, align: 'right' });
    });

    // ---- bağlantılar: her düğümden bir alttakine ----
    for (const n of nodes) {
      const pn = prevNode(n);
      if (!pn) continue;
      const a = nodeRect(pn), b = nodeRect(n), col = BRANCH_COL[this.colorOf(n)];
      const st = this.nodeState(n, owned, points);
      const lit = (owned[n.id] | 0) > 0;
      this.link(ctx, a.x + 4 + BOX / 2 - 1, a.y + 5 + BOX, b.y + 5, lit ? 'lit' : st === 'locked' ? 'locked' : 'open', col, t + b.x * 0.013);
    }

    for (const n of nodes) this.drawNode(ctx, n, owned, points, t, n === cur);

    // ---- satın alma parlaması ----
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      if (f.t > 0.5) { this.flashes.splice(i, 1); continue; }
      const k = f.t / 0.5;
      if (k < 0.3) { ctx.globalAlpha = 0.6 * (1 - k / 0.3); ctx.fillStyle = PAL.E6; ctx.fillRect(f.r.x, f.r.y, f.r.w, f.r.h); }
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = f.col;
      const R = 12 + k * 26;
      for (let a = 0; a < 28; a++) {
        const an = a / 28 * Math.PI * 2;
        ctx.fillRect(Math.round(f.x + Math.cos(an) * R), Math.round(f.y + Math.sin(an) * R), 2, 2);
      }
      ctx.globalAlpha = 1;
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      if (s.life <= 0) { this.sparks.splice(i, 1); continue; }
      s.vy += 120 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
      ctx.fillStyle = s.col; ctx.globalAlpha = Math.min(1, s.life * 3);
      ctx.fillRect(Math.round(s.x), Math.round(s.y), 2, 2);
    }
    ctx.globalAlpha = 1;

    this.drawStrip(ctx, cur, owned, points);
  }

  drawNode(ctx, n, owned, points, t, selected) {
    const r = nodeRect(n), col = BRANCH_COL[this.colorOf(n)];
    const st = this.nodeState(n, owned, points);
    const lv = owned[n.id] | 0;
    const locked = st === 'locked', can = st === 'afford' || st === 'ownedAfford', got = lv > 0;
    const pulse = Math.sin(t * 5.5 + r.x * 0.02) * 0.5 + 0.5;
    const shake = this.denyT > 0 && this.denyNode === n ? Math.round(Math.sin(this.denyT * 80) * 2) : 0;
    const x = r.x + shake, y = r.y;

    // satır zemini + çerçeve
    ctx.fillStyle = locked ? '#090a12' : got ? col.lo : PAL.C1;
    ctx.fillRect(x, y, r.w, r.h);
    let frame = locked ? PAL.C2 : got ? col.main : PAL.C3;
    if (can) frame = pulse > 0.5 ? PAL.E5 : PAL.E4;
    if (st === 'max') frame = PAL.E4;
    ctx.fillStyle = frame;
    ctx.fillRect(x, y, r.w, 1); ctx.fillRect(x, y + r.h - 1, r.w, 1); ctx.fillRect(x, y, 1, r.h); ctx.fillRect(x + r.w - 1, y, 1, r.h);
    if (can) {                                     // alınabilir: dışta nabız atan ikinci çerçeve
      ctx.globalAlpha = 0.25 + pulse * 0.6;
      ctx.fillStyle = PAL.E3;
      ctx.fillRect(x - 1, y - 1, r.w + 2, 1); ctx.fillRect(x - 1, y + r.h, r.w + 2, 1); ctx.fillRect(x - 1, y, 1, r.h); ctx.fillRect(x + r.w, y, 1, r.h);
      ctx.globalAlpha = 1;
    }

    // ikon kutusu
    const bx = x + 4, by = y + 5;
    ctx.fillStyle = PAL.C0; ctx.fillRect(bx - 1, by - 1, BOX + 2, BOX + 2);
    ctx.fillStyle = locked ? PAL.C2 : got ? col.hi : col.main; ctx.fillRect(bx, by, BOX, BOX);
    ctx.fillStyle = locked ? PAL.C0 : got ? col.main : PAL.C1; ctx.fillRect(bx + 1, by + 1, BOX - 2, BOX - 2);
    if (got) { ctx.fillStyle = col.lo; ctx.fillRect(bx + 2, by + 2, BOX - 4, BOX - 4); }
    ctx.drawImage(icon(nodeIcon(n), locked ? 'd' : 'n'), bx + 1, by + 1, 24, 24);
    if (locked) ctx.drawImage(icon('lock'), bx + 14, by + 14);

    // ad (her zaman görünür)
    const nameCol = locked ? PAL.C4 : got ? PAL.E6 : can ? PAL.A3 : PAL.A2;
    drawText(ctx, n.name, x + 35, y + 1, { color: nameCol, shadow: PAL.C0 });

    // seviye pipleri
    const py = y + 17;
    for (let i = 0; i < n.max; i++) {
      const px = x + 35 + i * 11;
      ctx.fillStyle = PAL.C0; ctx.fillRect(px - 1, py - 1, 11, 8);
      ctx.fillStyle = i < lv ? (st === 'max' ? PAL.E5 : col.hi) : locked ? PAL.C2 : PAL.C3;
      ctx.fillRect(px, py, 9, 6);
      if (i < lv) { ctx.fillStyle = st === 'max' ? PAL.E4 : col.main; ctx.fillRect(px, py + 4, 9, 2); }
      else { ctx.fillStyle = PAL.C1; ctx.fillRect(px + 1, py + 1, 7, 4); }
    }
    drawText(ctx, lv + '/' + n.max, x + 35 + n.max * 11 + 3, y + 14, { color: locked ? PAL.C4 : got ? col.hi : PAL.A1 });

    // yetenek: tuş rozeti
    if (n.ability) keyCap(ctx, x + 35 + textWidth(n.name) + 5, y + 2, ABILITIES[n.ability].key, !locked);

    // sağ etiket: bedel / TAM / kilit
    const tx = x + r.w - 5;
    if (st === 'max') {
      drawText(ctx, 'TAM', tx, y + 12, { color: PAL.E5, align: 'right', shadow: PAL.C0 });
    } else if (locked) {
      ctx.drawImage(icon('lock'), tx - 12, y + 12);
    } else {
      const cost = nodeCost(n, lv);
      const cw = textWidth(String(cost)) + 19;
      const cx0 = tx - cw, cy0 = y + 8;
      ctx.fillStyle = PAL.C0; ctx.fillRect(cx0 - 1, cy0 - 1, cw + 2, 16);
      ctx.fillStyle = can ? (pulse > 0.5 ? PAL.E5 : PAL.E4) : PAL.R; ctx.fillRect(cx0, cy0, cw, 14);
      ctx.fillStyle = can ? '#3a1408' : '#2a0a08'; ctx.fillRect(cx0 + 1, cy0 + 1, cw - 2, 12);
      ctx.drawImage(icon('ember', can ? 'n' : 'g'), cx0 + 2, cy0 + 1);
      drawText(ctx, String(cost), tx - 3, cy0 + 1, { color: can ? PAL.E6 : PAL.R, align: 'right' });
      // büyük harf satırları y+26..y+32: alt çerçeveyle (y+35) arada 2 px boşluk kalır
      drawText(ctx, can ? 'AL' : 'YETMİYOR', tx, y + LABEL_Y, { color: can ? PAL.E4 : PAL.R, align: 'right' });
    }

    // seçim imleci: köşe parantezleri
    if (selected) {
      ctx.fillStyle = PAL.E6;
      const a = 5, x0 = x - 2, y0 = y - 2, x1 = x + r.w + 1, y1 = y + r.h + 1;
      ctx.fillRect(x0, y0, a, 1); ctx.fillRect(x0, y0, 1, a); ctx.fillRect(x1 - a + 1, y0, a, 1); ctx.fillRect(x1, y0, 1, a);
      ctx.fillRect(x0, y1, a, 1); ctx.fillRect(x0, y1 - a + 1, 1, a); ctx.fillRect(x1 - a + 1, y1, a, 1); ctx.fillRect(x1, y1 - a + 1, 1, a);
    }
  }

  // altta sabit ayrıntı şeridi: ikon, ad, tek cümle açıklama, "şimdi → sonra", bedel
  drawStrip(ctx, n, owned, points) {
    const { x: X, y: Y, w: W, h: H } = STRIP;
    if (!n) return;
    const lv = owned[n.id] | 0, col = BRANCH_COL[this.colorOf(n)];
    const st = this.nodeState(n, owned, points);
    const locked = st === 'locked', can = st === 'afford' || st === 'ownedAfford';
    ctx.fillStyle = PAL.C0; ctx.fillRect(X - 1, Y - 1, W + 2, H + 2);
    ctx.fillStyle = col.lo; ctx.fillRect(X, Y, W, H);
    ctx.fillStyle = col.main; ctx.fillRect(X, Y, W, 1); ctx.fillRect(X, Y, 2, H);
    ctx.fillStyle = PAL.C0; ctx.fillRect(X + 8, Y + 8, 30, 30);
    ctx.fillStyle = col.main; ctx.fillRect(X + 9, Y + 9, 28, 28);
    ctx.fillStyle = PAL.C1; ctx.fillRect(X + 10, Y + 10, 26, 26);
    ctx.drawImage(icon(nodeIcon(n), locked ? 'd' : 'n'), X + 11, Y + 11, 24, 24);
    // sol: ad + seviye + açıklama
    const lx = X + 46;
    const nw = drawText(ctx, n.name, lx, Y + 2, { color: col.name, shadow: PAL.C0 });
    drawText(ctx, 'Seviye ' + lv + '/' + n.max, lx + nw + 10, Y + 2, { color: PAL.A2 });
    if (n.ability) { keyCap(ctx, lx + nw + 10 + textWidth('Seviye ' + lv + '/' + n.max) + 8, Y + 4, ABILITIES[n.ability].key); }
    wrapText(n.desc, 228).slice(0, 2).forEach((l, i) => drawText(ctx, l, lx, Y + 16 + i * 11, { color: PAL.A3 }));
    // sağ: şimdi → sonra, bedel
    const rx = X + 286;
    ctx.fillStyle = PAL.C0; ctx.fillRect(rx - 8, Y + 5, 1, H - 10);
    const cur = computeStats(owned, n.cls);
    const nxt = computeStats({ ...owned, [n.id]: Math.min(n.max, lv + 1) }, n.cls);
    let ry = Y + 2;
    for (const stat of [n.stat, n.stat2].filter(Boolean)) {
      const a = fmtStat(stat, cur[stat] || 0), b = fmtStat(stat, nxt[stat] || 0);
      const w0 = drawText(ctx, (STAT_NAME[stat] || stat) + ': ', rx, ry, { color: PAL.A2 });
      const w1 = drawText(ctx, a, rx + w0, ry, { color: PAL.A3 });
      if (st !== 'max') drawText(ctx, ' → ' + b, rx + w0 + w1, ry, { color: PAL.E5 });
      ry += 11;
    }
    const by = Y + H - 15;
    if (st === 'max') drawText(ctx, 'TAM GÜÇ — daha fazla alınamaz', rx, by, { color: PAL.E4 });
    else if (locked) {
      const pn = prevNode(n);
      drawText(ctx, 'KİLİTLİ — önce al: ' + (pn ? pn.name : '-'), rx, by, { color: PAL.R });
    } else {
      const cost = nodeCost(n, lv);
      ctx.drawImage(icon('ember', can ? 'n' : 'g'), rx, by - 1);
      const w0 = drawText(ctx, 'Bedel ' + cost, rx + 14, by, { color: can ? PAL.E5 : PAL.R });
      drawText(ctx, can ? 'ENTER / TIKLA: AL' : 'kor puanı yetmiyor (' + points + ')', rx + 14 + w0 + 10, by, { color: can ? PAL.E4 : PAL.R });
    }
  }
}
