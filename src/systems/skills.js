// KOR — beceri ağacı hesabı (sınıfa göre). Veri: classes.js
import { CLASSES, ALL_NODES, DEFAULT_CLASS, isClass } from './classes.js';

export const BASE_STATS = {
  damage: 6, attackSpeed: 2.2, critChance: .06, critMult: 2.0,
  reach: 27, arc: 1.55, targets: 2,
  woodMult: 1, xpGain: 1, emberGain: 1,
  maxHp: 100, moveSpeed: 80, maxWarmth: 100, warmthDrain: 2.0, warmthRegen: 10,
  fuelRate: 1, lightRadius: 76, magnet: 26, carry: 20, lifesteal: 0,
  burnChance: 0, burnDps: 0, dashCd: 1.5, abilityPower: 1,
  // menzilli / büyücü
  multishot: 1, pierce: 0, blastRadius: 30, dodge: 0, heatCostMul: 1, killWarmth: 0, chill: 0, freeze: 0,
  // yetenek seviyeleri (0 = kapalı)
  wave: 0, ring: 0, veil: 0, wrath: 0,
  rain: 0, lance: 0, leap: 0, emberRain: 0,
  flamewave: 0, frostring: 0, ward: 0, meteor: 0,
};

// tüm sınıfların düğümleri (kimlikler benzersiz)
export const NODES = ALL_NODES;
export const nodesOf = (classId = DEFAULT_CLASS) => CLASSES[isClass(classId) ? classId : DEFAULT_CLASS].nodes;
export const branchesOf = (classId = DEFAULT_CLASS) => CLASSES[isClass(classId) ? classId : DEFAULT_CLASS].branches;
export const nodeById = id => ALL_NODES.find(n => n.id === id) || null;
// aynı daldaki bir alt kademe düğümü (tier 1 için null)
export function prevNode(node) {
  if (node.tier <= 1) return null;
  return CLASSES[node.cls].nodes.find(n => n.branch === node.branch && n.tier === node.tier - 1) || null;
}

export function nodeCost(node, owned) { return node.cost + owned * node.step; }

export function computeStats(owned = {}, classId = DEFAULT_CLASS) {
  const cls = CLASSES[isClass(classId) ? classId : DEFAULT_CLASS];
  const s = { ...BASE_STATS, ...cls.baseStats };
  for (const node of cls.nodes) {
    const lv = owned[node.id] | 0;
    if (!lv) continue;
    if (node.stat) s[node.stat] = (s[node.stat] || 0) + node.per * lv;
    if (node.stat2) s[node.stat2] = (s[node.stat2] || 0) + node.per2 * lv;
  }
  s.arc = Math.min(s.arc, 3.4);
  s.fuelRate = Math.max(.3, s.fuelRate);
  s.warmthDrain = Math.max(.6, s.warmthDrain);
  s.dashCd = Math.max(.45, s.dashCd);
  s.attackSpeed = Math.min(s.attackSpeed, 9);
  s.lightRadius = Math.min(s.lightRadius, 190);
  s.heatCostMul = Math.max(.4, s.heatCostMul);
  s.dodge = Math.min(.5, s.dodge);
  s.multishot = Math.min(4, Math.max(1, Math.floor(s.multishot)));
  s.pierce = Math.max(0, Math.floor(s.pierce));
  s.freeze = Math.min(.6, s.freeze);
  return s;
}

// kademe zinciri: tier N, aynı daldaki tier N-1 düğümünün >=1 seviyesini ister
export function nodeUnlocked(node, owned) {
  const prev = prevNode(node);
  return !prev || (owned[prev.id] | 0) >= 1;
}

// classId verilirse başka sınıfın düğümü alınamaz
export function buyNode(node, owned, points, classId) {
  if (classId && node.cls !== classId) return { ok: false, msg: 'bu sınıfın düğümü değil' };
  const lv = owned[node.id] | 0;
  if (lv >= node.max) return { ok: false, msg: 'zaten dolu' };
  if (!nodeUnlocked(node, owned)) return { ok: false, msg: 'önceki düğüm gerekli' };
  const cost = nodeCost(node, lv);
  if (points < cost) return { ok: false, msg: 'yetersiz kor puanı' };
  return { ok: true, cost, level: lv + 1 };
}

export const TOTAL_NODES = ALL_NODES.reduce((a, n) => a + n.max, 0);
