// KOR — dünya: arazi, ağaçlar, dekor, ateş sunağı
import { Rng, dist, clamp, rand } from '../core/util.js';

export const WORLD = { w: 2600, h: 2000 };
// unlock: ağaca hasar verebilmek için gereken en düşük oyuncu seviyesi (1 = hep açık)
// hp: baltacıyla huş ~4, meşe ~8, demir ~25, kor ağacı ~50 vuruş
export const TREE_TIERS = {
  birch: { hp: 26, wood: 1, xp: 4, radius: 13, unlock: 1, name: 'Huş' },
  oak:   { hp: 64, wood: 4, xp: 16, radius: 17, unlock: 1, name: 'Meşe' },
  iron:  { hp: 260, wood: 18, xp: 55, radius: 21, unlock: 6, name: 'Demir Ağaç' },
  ember: { hp: 800, wood: 90, xp: 260, radius: 25, unlock: 12, name: 'Kor Ağacı' },
};

// hasar evresi 0..3 (çizim: çentik / çatlak / eğilme). hp doluyken 0, çok azken 3.
export function damageStage(hp, maxHp) {
  const f = maxHp > 0 ? hp / maxHp : 1;
  return f > 0.75 ? 0 : f > 0.5 ? 1 : f > 0.25 ? 2 : 3;
}
// ağacın vuruş durumu alanlarını sıfırla (doğuş / yeniden doğuş)
export function resetTreeHitState(t) {
  t.dmgStage = 0; t.hitAng = 0; t.hitDir = 1; t.lastHitT = -99; t.hitCount = 0; t.denyT = 0;
}

export class World {
  constructor() { this.w = WORLD.w; this.h = WORLD.h; this.reset(); }
  reset() {
    const r = new Rng(20261111);
    this.trees = []; this.rocks = []; this.bushes = []; this.stumps = []; this.burnt = [];
    this.altar = { x: WORLD.w / 2, y: WORLD.h / 2 };
    // ağaç yerleşimi: halkalar halinde katmanlar
    const rings = [
      { type: 'birch', count: 78, rmin: 130, rmax: 640 },
      { type: 'oak', count: 54, rmin: 380, rmax: 900 },
      { type: 'iron', count: 34, rmin: 700, rmax: 1120 },
      { type: 'ember', count: 18, rmin: 980, rmax: 1250 },
    ];
    for (const ring of rings) {
      for (let i = 0; i < ring.count; i++) {
        let tries = 0, x, y, ok = false;
        while (tries++ < 40 && !ok) {
          const a = r.range(0, Math.PI * 2), d = r.range(ring.rmin, ring.rmax);
          x = this.altar.x + Math.cos(a) * d; y = this.altar.y + Math.sin(a) * d * 0.82;
          if (x < 40 || y < 40 || x > WORLD.w - 40 || y > WORLD.h - 40) continue;
          ok = !this.trees.some(t => dist(t.x, t.y, x, y) < 40);
        }
        if (!ok) continue;
        const def = TREE_TIERS[ring.type];
        this.trees.push({
          x, y, type: ring.type, hp: def.hp, maxHp: def.hp, radius: def.radius,
          variant: r.int(0, 3), wobble: 0, hurt: 0, dead: false, burning: 0, seed: r.next(),
          dmgStage: 0, hitAng: 0, hitDir: 1, lastHitT: -99, hitCount: 0, denyT: 0,
        });
      }
    }
    for (let i = 0; i < 130; i++) {
      const a = r.range(0, Math.PI * 2), d = r.range(90, 1280);
      this.rocks.push({ x: this.altar.x + Math.cos(a) * d, y: this.altar.y + Math.sin(a) * d * .82, v: r.int(0, 3) });
    }
    for (let i = 0; i < 190; i++) {
      const a = r.range(0, Math.PI * 2), d = r.range(70, 1300);
      this.bushes.push({ x: this.altar.x + Math.cos(a) * d, y: this.altar.y + Math.sin(a) * d * .82, v: r.int(0, 4) });
    }
    this.trees.sort((a, b) => a.y - b.y);
  }
  treeAt(x, y, pad = 0) {
    for (const t of this.trees) {
      if (t.dead) continue;
      if (dist(x, y, t.x, t.y) < t.radius + pad) return t;
    }
    return null;
  }
  // görünür ağaçlar (kamera kırpma)
  visible(cam, w, h) {
    const out = [];
    for (const t of this.trees) {
      if (t.x > cam.x - 40 && t.x < cam.x + w + 40 && t.y > cam.y - 80 && t.y < cam.y + h + 40) out.push(t);
    }
    return out;
  }
}
