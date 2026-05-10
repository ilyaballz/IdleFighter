export const ENEMY_BASE = {
  baseHp: 14,
  baseDamage: 2.5,
  baseAttackSpeed: 0.7,
  moveSpeed: 90,
  bodyRadius: 18,
  baseCoinDrop: 1,
  shardDropChance: 0.01,
  equipmentDropChance: 0.02,
  color: '#8a7560',
  name: 'Гопник',
};

export const ELITE_BASE = {
  baseHp: 60,
  baseDamage: 5,
  baseAttackSpeed: 0.6,
  moveSpeed: 80,
  bodyRadius: 26,
  baseCoinDrop: 15,
  shardDropChance: 0.10,
  equipmentDropChance: 0.25,
  color: '#9b59d4',
  name: 'Байкер',
};

// Дальник — единственный пока ranged-враг. Бросает projectile (Молотов) с дистанции.
// Не кайтит: подходит на attackRange и стоит, бросая, даже если герой подбежал в упор.
export const RANGED_BASE = {
  baseHp: 16,
  baseDamage: 4,
  baseAttackSpeed: 0.5,    // 1 бросок ~ каждые 2 секунды
  moveSpeed: 70,
  bodyRadius: 18,
  attackRange: 220,        // на каком расстоянии встаёт и начинает бросать
  baseCoinDrop: 3,
  shardDropChance: 0.04,
  equipmentDropChance: 0.06,
  color: '#d97706',        // оранжевый — отличить от гопника
  name: 'Дальник',
};

// Качок — медленный громила со SLAM-атакой. Перед ударом 1.5с рисует красный круг на земле
// (slamRadius); по завершении телеграфа — AOE-удар по всем внутри круга (heavy.damage).
// Knockdown отменяет замах. Hero автономен и не уходит сам — игрок должен жать KD скилл.
export const HEAVY_BASE = {
  baseHp: 80,
  baseDamage: 12,           // ×3 базы elite — серьёзная угроза если попадёт
  baseAttackSpeed: 0.4,
  moveSpeed: 60,            // самый медленный
  bodyRadius: 30,
  windupDuration: 1.5,      // длительность телеграфа (=рост круга на земле)
  slamRadius: 80,           // радиус AOE-удара. Hero почти всегда внутри (attackRadius~55 + bodyRadius)
  baseCoinDrop: 10,
  shardDropChance: 0.08,
  equipmentDropChance: 0.15,
  color: '#c0392b',         // тёмно-красный
  name: 'Качок',
};

export const BOSS_BASE = {
  hpMultiplier: 25.0,        // потолок: достигается на L10+ через bossHpMultiplierForLocation
  damageMultiplier: 2.0,
  baseAttackSpeed: 0.5,
  moveSpeed: 70,
  bodyRadius: 36,
  baseCoinDrop: 50,
  shardDropChance: 1.0,
  equipmentDropChance: 1.0,
  energyReward: 30,            // +⚡ в хабе при убийстве — гарантирует апгрейд после локации
  color: '#e63946',
  name: 'Босс',
};

export const SCALING = {
  perWaveMultiplier: 1.05,
  perLocationMultiplier: 1.32,
};

// Гайки 🔩 — отдельная валюта для прокачки дома (отделена от монет тренажёров).
// Дропают только боссы локаций, чтобы накопление гаек = «зачистил локацию = заработал на QOL».
// Формула 1 + floor(loc/2): L1=1, L2-3=2, L4-5=3, L10=6, L15=8.
// Итог за один прогон L1-L15 ≈ 71 гайка. Полная прокачка одного здания дома стоит 50.
export function bossNutDrop(locationIndex) {
  return 1 + Math.floor(locationIndex / 2);
}

// HP-мультипликатор босса плавно растёт от L2 к капу BOSS_BASE.hpMultiplier (=25) на L10+.
// L2 = ×10, +2 за локацию, L10+ = ×25.
export function bossHpMultiplierForLocation(locationIndex) {
  if (locationIndex <= 1) return 1; // L1 хардкоднут отдельно
  return Math.min(BOSS_BASE.hpMultiplier, 10 + (locationIndex - 2) * 2);
}

// L1 — обучающий хардкод (босс HP 100 / DMG 4), чтобы первый забег без прокачки был проходим.
// L2+ — формула с плавным HP-мультипликатором (см. bossHpMultiplierForLocation).
// Юнит-модификаторы (scaleHp/scaleDmg от спец-арен) применяются СНАРУЖИ — это «база» босса.
export function bossStatsForLocation(locationIndex, arenaIndex) {
  if (locationIndex === 1) {
    return { hp: 100, damage: 4 };
  }
  const wave    = Math.pow(SCALING.perWaveMultiplier, arenaIndex - 1);
  const loc     = Math.pow(SCALING.perLocationMultiplier, locationIndex - 1);
  const hpMult  = bossHpMultiplierForLocation(locationIndex);
  return {
    hp:     ENEMY_BASE.baseHp     * wave * loc * hpMult,
    damage: ENEMY_BASE.baseDamage * wave * loc * BOSS_BASE.damageMultiplier,
  };
}

export const LOCATION_STRUCTURE = {
  // Длина локации растёт с прогрессией: L1 — короткая (5 арен), к L11+ — полная (15).
  baseArenasPerLocation: 5,
  arenasGrowthPerLocation: 1,    // +1 арена за локацию
  maxArenasPerLocation: 15,
  enemiesPerArena: {
    base: 2,                     // первая арена локации = 2 врага (ease-in)
    growthPerArena: 0.2,         // дальше плавно растёт по аренам
    // cap теперь функция от локации — см. regularEnemyCap(locationIndex).
  },
  eliteArenaInterval: 3,
};

// Cap количества регуляров на арене — растёт с локацией. base=2 + рост по аренам ограничен этим.
// L1: лёгкое начало (3 макс). L2-3: стандарт (4). L4+: тяжелее (5).
export function regularEnemyCap(locationIndex) {
  if (locationIndex <= 1) return 3;
  if (locationIndex <= 3) return 4;
  return 5;
}

export function arenasForLocation(locationIndex) {
  return Math.min(
    LOCATION_STRUCTURE.maxArenasPerLocation,
    LOCATION_STRUCTURE.baseArenasPerLocation +
      Math.floor((locationIndex - 1) * LOCATION_STRUCTURE.arenasGrowthPerLocation)
  );
}

// ───────── Спец-арены ─────────
// Каждая стандартная арена при генерации может быть заменена на спец-вариант:
//   regular → swarm, elite → mixed_pack, boss → boss_with_minions.
// Шанс растёт с локации: L1 — без замен (обучение), далее линейно до cap.

export const SPECIAL_SPAWN = {
  startFromLocation: 3,         // L1-L2 без твистов — обучение core-механикам
  startChance: 0.10,            // L3 = 10%
  perLocationIncrement: 0.05,   // +5% за локацию (плавный рост 10% → 60% за 10 локаций)
  maxChance: 0.60,              // cap на L13+
};

export function specialSpawnChance(locationIndex) {
  if (locationIndex < SPECIAL_SPAWN.startFromLocation) return 0;
  const steps = locationIndex - SPECIAL_SPAWN.startFromLocation;
  return Math.min(
    SPECIAL_SPAWN.maxChance,
    SPECIAL_SPAWN.startChance + steps * SPECIAL_SPAWN.perLocationIncrement
  );
}

// Спец-арены — теперь с тирированной композицией. Каждый pack-type имеет несколько тиров,
// активируемых от локации. pickTier выбирает самый высокий тир, для которого loc >= fromLoc.
//
// Цель — чтобы повторное появление того же pack-типа на разных локациях ощущалось как
// эскалация, а не как «уже видел». Например, ranged_pack начинается с 2 дальников, к L7
// получает качка, к L10 — элиту. Бэг пака переписан на более «банда-like» состав.
//
// units: { kind, count, scaleHp?, scaleDmg?, scaleRadius? } — scale поверх wave × loc.
export const SPECIAL_ARENAS = {
  swarm: {
    label: 'рой',
    tiers: [
      { fromLoc: 3, units: [
        { kind: 'regular', count: 8, scaleHp: 0.5, scaleDmg: 0.7, scaleRadius: 0.8 },
      ]},
      { fromLoc: 6, units: [
        { kind: 'regular', count: 10, scaleHp: 0.5, scaleDmg: 0.7, scaleRadius: 0.8 },
        { kind: 'ranged',  count: 1 },
      ]},
      { fromLoc: 10, units: [
        { kind: 'regular', count: 12, scaleHp: 0.5, scaleDmg: 0.7, scaleRadius: 0.8 },
        { kind: 'ranged',  count: 2 },
      ]},
      { fromLoc: 15, units: [
        { kind: 'regular', count: 14, scaleHp: 0.5, scaleDmg: 0.7, scaleRadius: 0.8 },
        { kind: 'ranged',  count: 2 },
        { kind: 'elite',   count: 1 },
      ]},
    ],
  },
  ranged_pack: {
    label: 'дальники',
    tiers: [
      { fromLoc: 3, units: [
        { kind: 'ranged',  count: 2 },
        { kind: 'regular', count: 2, scaleHp: 0.7 },
      ]},
      { fromLoc: 6, units: [
        { kind: 'ranged',  count: 2 },
        { kind: 'regular', count: 3 },
      ]},
      { fromLoc: 10, units: [
        { kind: 'ranged',  count: 3 },
        { kind: 'regular', count: 3 },
      ]},
      { fromLoc: 15, units: [
        { kind: 'ranged',  count: 4 },
        { kind: 'elite',   count: 1 },
        { kind: 'regular', count: 2 },
      ]},
    ],
  },
  mixed_pack: {
    label: 'банда',
    tiers: [
      { fromLoc: 3, units: [
        { kind: 'elite',   count: 1 },
        { kind: 'regular', count: 3 },
        { kind: 'ranged',  count: 1 },
      ]},
      { fromLoc: 6, units: [
        { kind: 'elite',   count: 1 },
        { kind: 'heavy',   count: 1 },
        { kind: 'regular', count: 3 },
        { kind: 'ranged',  count: 1 },
      ]},
      { fromLoc: 10, units: [
        { kind: 'elite',   count: 1 },
        { kind: 'heavy',   count: 1 },
        { kind: 'regular', count: 3 },
        { kind: 'ranged',  count: 2 },
      ]},
      { fromLoc: 15, units: [
        { kind: 'elite',   count: 2 },
        { kind: 'heavy',   count: 1 },
        { kind: 'regular', count: 3 },
        { kind: 'ranged',  count: 2 },
      ]},
    ],
  },
  heavy_pack: {
    label: 'тяжёлая банда',
    tiers: [
      { fromLoc: 3, units: [
        { kind: 'heavy',  count: 1 },
        { kind: 'ranged', count: 1 },
      ]},
      { fromLoc: 10, units: [
        { kind: 'heavy',   count: 2 },
        { kind: 'ranged',  count: 1 },
        { kind: 'regular', count: 1 },
      ]},
      { fromLoc: 13, units: [
        { kind: 'heavy',   count: 2 },
        { kind: 'ranged',  count: 1 },
        { kind: 'regular', count: 2 },
      ]},
      { fromLoc: 17, units: [
        { kind: 'heavy',   count: 2 },
        { kind: 'ranged',  count: 2 },
        { kind: 'regular', count: 1 },
        { kind: 'elite',   count: 1 },
      ]},
    ],
  },
  boss_with_minions: {
    label: 'БОСС+банда',
    tiers: [
      { fromLoc: 3, units: [
        { kind: 'boss',    count: 1 },
        { kind: 'regular', count: 3, scaleHp: 0.5, scaleDmg: 0.8, scaleRadius: 0.9 },
      ]},
      { fromLoc: 6, units: [
        { kind: 'boss',    count: 1 },
        { kind: 'regular', count: 2 },
        { kind: 'heavy',   count: 1 },
        { kind: 'ranged',  count: 1 },
      ]},
      { fromLoc: 10, units: [
        { kind: 'boss',    count: 1 },
        { kind: 'elite',   count: 1 },
        { kind: 'heavy',   count: 1 },
        { kind: 'ranged',  count: 1 },
        { kind: 'regular', count: 2 },
      ]},
      { fromLoc: 15, units: [
        { kind: 'boss',    count: 1 },
        { kind: 'elite',   count: 1 },
        { kind: 'heavy',   count: 2 },
        { kind: 'ranged',  count: 2 },
        { kind: 'regular', count: 2 },
      ]},
    ],
  },
};

// Helper — выбор актуального тира по локации.
function pickTier(tiers, loc) {
  let chosen = tiers[0];
  for (const t of tiers) {
    if (loc >= t.fromLoc) chosen = t;
  }
  return chosen;
}

export function getSpecialArenaUnits(typeName, loc) {
  const def = SPECIAL_ARENAS[typeName];
  if (!def) return [];
  return pickTier(def.tiers, loc).units;
}

// Стандартная элит-арена (вне спец-замены) — тоже эскалирует.
// L1-2: одиночный байкер (учим). L3+ постепенно становится мини-бандой.
// Финальная композиция (2 элиты + банда) активируется на L15+, синхронно с пиком pack-тиров.
function getStandardEliteUnits(loc) {
  if (loc <= 2)  return [{ kind: 'elite', count: 1 }];
  if (loc <= 7)  return [{ kind: 'elite', count: 1 }, { kind: 'regular', count: 2 }];
  if (loc <= 14) return [
    { kind: 'elite',   count: 1 },
    { kind: 'heavy',   count: 1 },
    { kind: 'regular', count: 2 },
    { kind: 'ranged',  count: 1 },
  ];
  return [
    { kind: 'elite',   count: 2 },
    { kind: 'heavy',   count: 1 },
    { kind: 'regular', count: 2 },
    { kind: 'ranged',  count: 1 },
  ];
}

// Подписи арен для UI (HUD, label на канвасе)
const ARENA_TYPE_LABELS = {
  boss: 'БОСС',
  boss_with_minions: 'БОСС+банда',
  elite: 'элита',
  mixed_pack: 'банда',
  swarm: 'рой',
  ranged_pack: 'дальники',
  heavy_pack: 'тяжёлая банда',
  regular: '',
};

export function arenaTypeLabel(type) {
  return ARENA_TYPE_LABELS[type] || '';
}

// ───────── Композиция арены ─────────

// Детерминированная (без рандома) — используется симулятором для предсказуемой модели.
// Возвращает { type, units: [{kind, count, scale*?}] }.
export function getArenaComposition(arenaIndex, locationIndex) {
  const { enemiesPerArena, eliteArenaInterval } = LOCATION_STRUCTURE;
  const arenasPerLocation = arenasForLocation(locationIndex);

  if (arenaIndex === arenasPerLocation) {
    return { type: 'boss', units: [{ kind: 'boss', count: 1 }] };
  }
  if (arenaIndex % eliteArenaInterval === 0) {
    return { type: 'elite', units: getStandardEliteUnits(locationIndex) };
  }
  const count = Math.min(
    regularEnemyCap(locationIndex),
    Math.ceil(enemiesPerArena.base + enemiesPerArena.growthPerArena * (arenaIndex - 1))
  );
  return { type: 'regular', units: [{ kind: 'regular', count }] };
}

// Расписание открытия пак-типов: новый тип за локацию, чтобы игрок постепенно
// учил каждый новый паттерн (AOE → ranged → mixed → heavy → boss+minions).
// До unlock'а пак-тип не появляется, даже если specialSpawnChance > 0.
export const PACK_UNLOCK_LOCATION = {
  swarm:             3,
  ranged_pack:       4,
  mixed_pack:        5,
  heavy_pack:        6,
  boss_with_minions: 7,
};

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Возвращает массив пак-типов, доступных для замены данного base.type на данной локации.
// Пустой массив → замены не будет (base композиция остаётся).
function availablePacksFor(baseType, loc) {
  const u = PACK_UNLOCK_LOCATION;
  if (baseType === 'regular') {
    const opts = [];
    if (loc >= u.swarm)       opts.push('swarm');
    if (loc >= u.ranged_pack) opts.push('ranged_pack');
    return opts;
  }
  if (baseType === 'elite') {
    const opts = [];
    if (loc >= u.mixed_pack) opts.push('mixed_pack');
    if (loc >= u.heavy_pack) opts.push('heavy_pack');
    return opts;
  }
  if (baseType === 'boss') {
    return loc >= u.boss_with_minions ? ['boss_with_minions'] : [];
  }
  return [];
}

export function rollArenaComposition(arenaIndex, locationIndex) {
  const base = getArenaComposition(arenaIndex, locationIndex);
  const chance = specialSpawnChance(locationIndex);
  if (Math.random() >= chance) return base;
  const opts = availablePacksFor(base.type, locationIndex);
  if (opts.length === 0) return base;
  const replacementType = pickRandom(opts);
  return { type: replacementType, units: getSpecialArenaUnits(replacementType, locationIndex) };
}
