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

// Качок — медленный громила с замахом. Перед каждой атакой 1.5с готовится (красный ореол),
// потом бьёт ОЧЕНЬ сильно. Knockdown отменяет замах. Уход из melee во время замаха = промах.
export const HEAVY_BASE = {
  baseHp: 80,
  baseDamage: 12,           // ×3 базы elite — серьёзная угроза если попадёт
  baseAttackSpeed: 0.4,
  moveSpeed: 60,            // самый медленный
  bodyRadius: 30,
  windupDuration: 1.5,      // окно реакции для KD/уворота
  baseCoinDrop: 10,
  shardDropChance: 0.08,
  equipmentDropChance: 0.15,
  color: '#c0392b',         // тёмно-красный
  name: 'Качок',
};

export const BOSS_BASE = {
  hpMultiplier: 25.0,
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
  perLocationMultiplier: 1.25,
};

// L1 — обучающий хардкод (босс HP 100 / DMG 4), чтобы первый забег без прокачки был проходим.
// L2+ — формула: ENEMY_BASE × wave-scale × loc-scale × BOSS_BASE.hpMultiplier|damageMultiplier.
// Юнит-модификаторы (scaleHp/scaleDmg от спец-арен) применяются СНАРУЖИ — это «база» босса.
export function bossStatsForLocation(locationIndex, arenaIndex) {
  if (locationIndex === 1) {
    return { hp: 100, damage: 4 };
  }
  const wave = Math.pow(SCALING.perWaveMultiplier, arenaIndex - 1);
  const loc  = Math.pow(SCALING.perLocationMultiplier, locationIndex - 1);
  return {
    hp:     ENEMY_BASE.baseHp     * wave * loc * BOSS_BASE.hpMultiplier,
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
  startFromLocation: 2,         // L1 без твистов
  perLocationIncrement: 0.10,
  maxChance: 0.60,
};

export function specialSpawnChance(locationIndex) {
  if (locationIndex < SPECIAL_SPAWN.startFromLocation) return 0;
  const steps = locationIndex - SPECIAL_SPAWN.startFromLocation + 1;
  return Math.min(SPECIAL_SPAWN.maxChance, steps * SPECIAL_SPAWN.perLocationIncrement);
}

// units: список юнитов на арене. Каждый — { kind, count, scaleHp?, scaleDmg?, scaleRadius? }.
// scale-множители применяются поверх обычного скейлинга (волна × локация).
export const SPECIAL_ARENAS = {
  swarm: {
    label: 'рой',
    units: [
      { kind: 'regular', count: 10, scaleHp: 0.5, scaleDmg: 0.7, scaleRadius: 0.8 },
    ],
  },
  ranged_pack: {
    label: 'дальники',
    units: [
      { kind: 'ranged',  count: 2 },
      { kind: 'regular', count: 2, scaleHp: 0.7 },
    ],
  },
  mixed_pack: {
    label: 'банда',
    units: [
      { kind: 'elite',   count: 1 },
      { kind: 'regular', count: 3 },
      { kind: 'ranged',  count: 1 },
    ],
  },
  heavy_pack: {
    label: 'тяжёлая банда',
    units: [
      { kind: 'heavy',   count: 1 },
      { kind: 'regular', count: 2 },
    ],
  },
  boss_with_minions: {
    label: 'БОСС+банда',
    units: [
      { kind: 'boss',    count: 1 },
      { kind: 'regular', count: 3, scaleHp: 0.5, scaleDmg: 0.8, scaleRadius: 0.9 },
    ],
  },
};

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
    return { type: 'elite', units: [{ kind: 'elite', count: 1 }] };
  }
  const count = Math.min(
    regularEnemyCap(locationIndex),
    Math.ceil(enemiesPerArena.base + enemiesPerArena.growthPerArena * (arenaIndex - 1))
  );
  return { type: 'regular', units: [{ kind: 'regular', count }] };
}

// Бросает рандом — шанс заменить стандартную арену на спец-вариант.
// Используется реальной игрой (buildLocation), не симулятором.
// regular → swarm | ranged_pack (50/50). elite → mixed_pack | heavy_pack (50/50).
const SPECIAL_REPLACEMENT = {
  boss:    () => 'boss_with_minions',
  elite:   () => Math.random() < 0.5 ? 'mixed_pack' : 'heavy_pack',
  regular: () => Math.random() < 0.5 ? 'swarm' : 'ranged_pack',
};

export function rollArenaComposition(arenaIndex, locationIndex) {
  const base = getArenaComposition(arenaIndex, locationIndex);
  const chance = specialSpawnChance(locationIndex);
  if (Math.random() >= chance) return base;
  const replacementFn = SPECIAL_REPLACEMENT[base.type];
  if (!replacementFn) return base;
  const replacementType = replacementFn();
  return { type: replacementType, units: SPECIAL_ARENAS[replacementType].units };
}
