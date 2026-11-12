// KOR — sınıflar: baltacı, okçu, büyücü.
// Her sınıf: kimlik, metinler, temel değerler, birincil saldırı, 3 dal x 4 düğüm (düz zincir), 4 yetenek (1-2-3-Q).
// Düğümde piksel konumu YOK: arayüz (branch, tier) çiftinden yerleştirir. Düğümler tier sırasıyla alınır:
// tier N düğümü, aynı daldaki tier N-1 düğümünün en az 1. seviyesini ister (çapraz gereksinim yok).

export const CLASS_IDS = ['baltaci', 'okcu', 'buyucu'];
export const ABILITY_KEYS = ['1', '2', '3', 'Q'];

// n(...) kısaltması: [id, branch, tier, name, desc, max, cost, step, stat, per, extra]
function node(cls, id, branch, tier, name, desc, max, cost, step, stat, per, extra = {}) {
  return { id, cls, branch, tier, name, desc, max, cost, step, stat, per, ...extra };
}

const baltaciNodes = [
  // BALTA: kesim gücü, hız, kritik, verim
  node('baltaci', 'edge', 'chop', 1, 'Keskin Ağız', 'Kesim hasarı +2', 3, 1, 1, 'damage', 2),
  node('baltaci', 'swift', 'chop', 2, 'Hızlı Salınım', 'Vuruş hızı +0.3', 3, 1, 1, 'attackSpeed', 0.3),
  node('baltaci', 'crit', 'chop', 3, 'Zayıf Nokta', 'Kritik şansı +%8', 3, 2, 1, 'critChance', 0.08),
  node('baltaci', 'yield', 'chop', 4, 'Verimli Kesim', 'Kilit taşı: odun kazancı +%30', 3, 3, 1, 'woodMult', 0.3),
  // KOR: ateş yetenekleri
  node('baltaci', 'wave', 'ember', 1, 'Kor Dalgası', 'Yetenek [1]: seviye başına +1 kor dalgası', 3, 2, 1, 'wave', 1, { ability: 'wave' }),
  node('baltaci', 'ring', 'ember', 2, 'Ateş Halkası', 'Yetenek [2]: yanan halka, seviye başına +14 hasar', 3, 2, 1, 'ring', 1, { ability: 'ring' }),
  node('baltaci', 'veil', 'ember', 3, 'Kül Peçesi', 'Yetenek [3]: kül bulutu, alınan hasar -%40', 3, 3, 1, 'veil', 1, { ability: 'veil' }),
  node('baltaci', 'wrath', 'ember', 4, 'Ocak Öfkesi', 'Yetenek [Q]: çevrene 95 hasarlık öfke patlaması', 3, 4, 2, 'wrath', 1, { ability: 'wrath' }),
  // KÖK: can, ısı, taşıma
  node('baltaci', 'bark', 'root', 1, 'Kalın Kabuk', 'Can +20', 3, 1, 1, 'maxHp', 20),
  node('baltaci', 'warm', 'root', 2, 'Sıcak Kan', 'Isı kapasitesi +20', 3, 1, 1, 'maxWarmth', 20),
  node('baltaci', 'pack', 'root', 3, 'Sırt Sepeti', 'Taşıma kapasitesi +8 odun', 3, 2, 1, 'carry', 8),
  node('baltaci', 'heart', 'root', 4, 'Kor Yüreği', 'Kilit taşı: can +40, ısı yenilenmesi +6', 2, 3, 2, 'maxHp', 40, { stat2: 'warmthRegen', per2: 6 }),
];

const okcuNodes = [
  // YAY: hasar, atış hızı, çoklu ok, delici ok
  node('okcu', 'draw', 'bow', 1, 'Gergin Yay', 'Ok hasarı +2', 3, 1, 1, 'damage', 2, { icon: 'edge' }),
  node('okcu', 'rapid', 'bow', 2, 'Seri Atış', 'Atış hızı +0.4', 3, 1, 1, 'attackSpeed', 0.4, { icon: 'swift' }),
  node('okcu', 'multi', 'bow', 3, 'Çift Ok', 'Her atışta +1 ok', 2, 2, 2, 'multishot', 1, { icon: 'cleave' }),
  node('okcu', 'lance', 'bow', 4, 'Delici Ok', 'Yetenek [2]: hattı delen ok, 32 hasar', 3, 3, 1, 'lance', 1, { ability: 'lance', icon: 'reach' }),
  // İZ: hız, atılma, kaçınma, geri sıçrama
  node('okcu', 'fleet', 'trail', 1, 'Hafif Adım', 'Hız +8, toplama menzili +10', 3, 1, 1, 'moveSpeed', 8, { stat2: 'magnet', per2: 10, icon: 'stride' }),
  node('okcu', 'sidestep', 'trail', 2, 'Çevik Atılış', 'Atılma beklemesi -0.25 sn', 3, 1, 1, 'dashCd', -0.25, { icon: 'dash' }),
  node('okcu', 'dodge', 'trail', 3, 'Kaçınma', 'Gelen vuruşu savuşturma +%8', 3, 2, 1, 'dodge', 0.08, { icon: 'kindle' }),
  node('okcu', 'leap', 'trail', 4, 'Geri Sıçrama', 'Yetenek [3]: geri sıçra, 5 sn yavaşlatan tuzak bırak', 3, 3, 1, 'leap', 1, { ability: 'leap', icon: 'magnet' }),
  // KOR: alevli ok, ok yağmuru, kor yağmuru
  node('okcu', 'flameArrow', 'ember', 1, 'Alevli Ok', 'Yakma şansı +%20, yakma +2', 3, 1, 1, 'burnChance', 0.2, { stat2: 'burnDps', per2: 2, icon: 'spark' }),
  node('okcu', 'rain', 'ember', 2, 'Ok Yağmuru', 'Yetenek [1]: imlece 3 sn ok yağmuru', 3, 2, 1, 'rain', 1, { ability: 'rain', icon: 'wave' }),
  node('okcu', 'hotTip', 'ember', 3, 'Kızgın Uç', 'Yetenek gücü +%25', 3, 2, 1, 'abilityPower', 0.25, { icon: 'pyre' }),
  node('okcu', 'emberRain', 'ember', 4, 'Kor Yağmuru', 'Yetenek [Q]: 4 sn geniş, yakıcı kor yağmuru', 3, 4, 2, 'emberRain', 1, { ability: 'emberRain', icon: 'wrath' }),
];

const buyucuNodes = [
  // ALEV: dalga, patlama alanı, hasar ve yakma, meteor
  node('buyucu', 'flamewave', 'flame', 1, 'Alev Dalgası', 'Yetenek [1]: 4 küreli alev yelpazesi', 3, 2, 1, 'flamewave', 1, { ability: 'flamewave', icon: 'wave' }),
  node('buyucu', 'blast', 'flame', 2, 'Geniş Patlama', 'Patlama yarıçapı +6', 3, 1, 1, 'blastRadius', 6, { icon: 'arc' }),
  node('buyucu', 'scorch', 'flame', 3, 'Kızgın Küre', 'Küre hasarı +3, yakma şansı +%12', 3, 2, 1, 'damage', 3, { stat2: 'burnChance', per2: 0.12, icon: 'spark' }),
  node('buyucu', 'meteor', 'flame', 4, 'Meteor', 'Yetenek [Q]: imlece 95 hasarlık meteor', 3, 4, 2, 'meteor', 1, { ability: 'meteor', icon: 'wrath' }),
  // AYAZ: yavaşlatma, halka, kalkan, dondurma
  node('buyucu', 'chill', 'frost', 1, 'Soğuk Dokunuş', 'Patlama yavaşlatır, süre +0.8 sn', 3, 1, 1, 'chill', 1, { icon: 'cold' }),
  node('buyucu', 'frostring', 'frost', 2, 'Ayaz Halkası', 'Yetenek [2]: 2 sn yavaşlatan buz halkası', 3, 2, 1, 'frostring', 1, { ability: 'frostring', icon: 'ring' }),
  node('buyucu', 'ward', 'frost', 3, 'Buz Kalkanı', 'Yetenek [3]: buz kalkanı, alınan hasar -%55', 3, 3, 1, 'ward', 1, { ability: 'ward', icon: 'veil' }),
  node('buyucu', 'freeze', 'frost', 4, 'Donma', 'Kilit taşı: patlama dondurma şansı +%12', 3, 3, 1, 'freeze', 0.12, { icon: 'crit' }),
  // KÜL: ısı verimi, odun verimi, ateşten kazanç
  node('buyucu', 'thrift', 'ash', 1, 'Isı Tutumu', 'Büyü ısı bedeli -%15', 3, 1, 1, 'heatCostMul', -0.15, { icon: 'fuel' }),
  node('buyucu', 'ashgain', 'ash', 2, 'Kül Hasadı', 'Odun kazancı +%25', 3, 1, 1, 'woodMult', 0.25, { icon: 'yield' }),
  node('buyucu', 'inner', 'ash', 3, 'İçsel Kor', 'Isı yenilenmesi +6, kapasite +15', 3, 2, 1, 'warmthRegen', 6, { stat2: 'maxWarmth', per2: 15, icon: 'warm' }),
  node('buyucu', 'ashheart', 'ash', 4, 'Kül Yüreği', 'Kilit taşı: ateş kazancı +%30, öldürünce ısı +4', 3, 3, 1, 'emberGain', 0.3, { stat2: 'killWarmth', per2: 4, icon: 'heart' }),
];

export const CLASSES = {
  baltaci: {
    id: 'baltaci',
    name: 'BALTACI',
    tagline: 'Yakın dövüşte dayanıklı oduncu.',
    desc: ['Güçlü: geniş savurma, sert vuruş', 'Güçlü: yüksek can', 'Zayıf: yaklaşmak gerekir'],
    // BASE_STATS üstüne yazılan değerler
    baseStats: { maxHp: 130, moveSpeed: 78, damage: 8, attackSpeed: 2.2, arc: 1.9, targets: 3, reach: 27, magnet: 40, carry: 22 },
    primary: { type: 'melee', name: 'Balta Savurma', windup: 0.075, swing: 0.26, range: 35 },
    weak: 'Baltan yetmiyor',
    palette: 'ember',
    branches: [
      { id: 'chop', name: 'BALTA', hint: 'kesim gücü, hız, verim', color: 'chop' },
      { id: 'ember', name: 'KOR', hint: 'ateş yetenekleri', color: 'ember' },
      { id: 'root', name: 'KÖK', hint: 'can, ısı, taşıma', color: 'root' },
    ],
    nodes: baltaciNodes,
    abilities: ['wave', 'ring', 'veil', 'wrath'],
    resource: null,
  },
  okcu: {
    id: 'okcu',
    name: 'OKÇU',
    tagline: 'Menzilden vuran, hızlı avcı.',
    desc: ['Güçlü: uzaktan güvenli kesim', 'Güçlü: hızlı, geniş toplama', 'Zayıf: düşük can, odun uzakta'],
    baseStats: { maxHp: 80, moveSpeed: 98, damage: 7, attackSpeed: 3.0, critChance: 0.08, magnet: 58, dashCd: 1.2, carry: 18, lightRadius: 80 },
    primary: { type: 'arrow', name: 'Ok', windup: 0.05, swing: 0.2, range: 210, speed: 430, treeMul: 0.5 },
    weak: 'Okların yetmiyor',
    palette: 'moss',
    branches: [
      { id: 'bow', name: 'YAY', hint: 'hasar, hız, çoklu ok', color: 'bow' },
      { id: 'trail', name: 'İZ', hint: 'hız, atılma, kaçınma', color: 'trail' },
      { id: 'ember', name: 'KOR', hint: 'alevli ok, kor yağmuru', color: 'ember' },
    ],
    nodes: okcuNodes,
    abilities: ['rain', 'lance', 'leap', 'emberRain'],
    resource: null,
  },
  buyucu: {
    id: 'buyucu',
    name: 'BÜYÜCÜ',
    tagline: 'Isıyla büyü yapan alan ustası.',
    desc: ['Güçlü: patlama çok hedefi vurur', 'Zayıf: büyü ISI harcar', 'Zayıf: en düşük can, yavaş atış'],
    baseStats: { maxHp: 66, moveSpeed: 84, damage: 12, attackSpeed: 1.35, critChance: 0.05, magnet: 46, maxWarmth: 130, warmthRegen: 15, warmthDrain: 1.6, carry: 18, burnDps: 5 },
    primary: { type: 'orb', name: 'Kor Küresi', windup: 0.08, swing: 0.3, range: 180, speed: 230, treeMul: 1, heat: 4 },
    weak: 'Büyün yetmiyor',
    palette: 'frost',
    branches: [
      { id: 'flame', name: 'ALEV', hint: 'patlama, hasar, yakma', color: 'flame' },
      { id: 'frost', name: 'AYAZ', hint: 'yavaşlat, dondur, kalkan', color: 'frost' },
      { id: 'ash', name: 'KÜL', hint: 'ısı ve odun verimi', color: 'ash' },
    ],
    nodes: buyucuNodes,
    abilities: ['flamewave', 'frostring', 'ward', 'meteor'],
    resource: 'ISI',
  },
};

export const ALL_NODES = CLASS_IDS.flatMap(id => CLASSES[id].nodes);
export const DEFAULT_CLASS = 'baltaci';
export const isClass = id => Object.prototype.hasOwnProperty.call(CLASSES, id);

// seçim ekranı çubukları (0..1): can / hız / hasar / menzil
export function classBars(c) {
  const b = c.baseStats;
  const reach = c.primary.type === 'melee' ? b.reach + 8 : c.primary.range;
  return {
    hp: Math.min(1, b.maxHp / 140),
    speed: Math.min(1, b.moveSpeed / 110),
    dmg: Math.min(1, b.damage * b.attackSpeed / 26),
    range: Math.min(1, reach / 220),
  };
}
