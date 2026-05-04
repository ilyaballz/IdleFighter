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

export const BOSS_BASE = {
  hpMultiplier: 5.0,
  damageMultiplier: 2.0,
  baseAttackSpeed: 0.5,
  moveSpeed: 70,
  bodyRadius: 36,
  baseCoinDrop: 50,
  shardDropChance: 1.0,
  equipmentDropChance: 1.0,
  color: '#e63946',
  name: 'Босс',
};

export const SCALING = {
  perWaveMultiplier: 1.05,
  perLocationMultiplier: 1.50,
};

export const LOCATION_STRUCTURE = {
  // Длина локации растёт с прогрессией: L1 — короткая (5 арен), к L11+ — полная (15).
  baseArenasPerLocation: 5,
  arenasGrowthPerLocation: 1,    // +1 арена за локацию
  maxArenasPerLocation: 15,
  enemiesPerArena: {
    base: 3,
    growthPerArena: 0.2,
    cap: 4,
  },
  eliteArenaInterval: 3,
};

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
  mixed_pack: {
    label: 'банда',
    units: [
      { kind: 'elite',   count: 1 },
      { kind: 'regular', count: 4 },
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
    enemiesPerArena.cap,
    Math.ceil(enemiesPerArena.base + enemiesPerArena.growthPerArena * (arenaIndex - 1))
  );
  return { type: 'regular', units: [{ kind: 'regular', count }] };
}

// Бросает рандом — шанс заменить стандартную арену на спец-вариант.
// Используется реальной игрой (buildLocation), не симулятором.
const SPECIAL_REPLACEMENT = {
  boss:    'boss_with_minions',
  elite:   'mixed_pack',
  regular: 'swarm',
};

export function rollArenaComposition(arenaIndex, locationIndex) {
  const base = getArenaComposition(arenaIndex, locationIndex);
  const chance = specialSpawnChance(locationIndex);
  if (Math.random() >= chance) return base;
  const replacementType = SPECIAL_REPLACEMENT[base.type];
  if (!replacementType) return base;
  return { type: replacementType, units: SPECIAL_ARENAS[replacementType].units };
}
