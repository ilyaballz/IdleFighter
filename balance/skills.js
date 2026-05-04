// Скиллы будут активны на Этапе 2. В Этапе 1 файл существует как часть контракта.

export const SKILLS = {
  hook: {
    name: 'Хук',
    activation: 'cooldown',
    baseCooldown: 4.0,
    targetType: 'single',
    baseDamageMultiplier: 2.0,
    levelBonusPerLvl: 0.10,
  },
  cut: {
    name: 'Рассечение',
    activation: 'cooldown',
    baseCooldown: 6.0,
    targetType: 'single',
    baseDamageMultiplier: 1.0,
    dot: { damagePctPerSec: 0.30, durationSec: 5.0 },
    levelBonusPerLvl: 0.10,
  },
  spinkick: {
    name: 'Вертушка с разворота',
    activation: 'cooldown',
    baseCooldown: 5.0,
    targetType: 'single',
    baseDamageMultiplier: 2.2,
    bonusCritChance: 0.50,
    levelBonusPerLvl: 0.10,
  },
  roundkick: {
    name: 'Раунд-кик',
    activation: 'cooldown',
    baseCooldown: 8.0,
    targetType: 'aoe_around_self',
    aoeRadius: 90,
    baseDamageMultiplier: 1.8,
    knockback: 30,
    levelBonusPerLvl: 0.10,
  },
  slam: {
    name: 'Прыжок с приземлением',
    activation: 'cooldown',
    baseCooldown: 14.0,
    targetType: 'aoe_landing',
    aoeRadius: 130,
    baseDamageMultiplier: 4.0,
    castDelaySec: 0.8,
    knockback: 50,
    levelBonusPerLvl: 0.10,
  },
  rage: {
    // Активируется на любом уровне зарядов от minCharges до maxCharges.
    // Длительность баффа линейно интерполируется: minCharges → minDurationSec, maxCharges → maxDurationSec.
    // Все заряды сжигаются при активации.
    name: 'Ярость',
    activation: 'charges',
    chargesPerAutoAttack: 1,
    minCharges: 10,
    maxCharges: 50,
    minDurationSec: 2.0,
    maxDurationSec: 8.0,
    targetType: 'self_buff',
    bonusDamagePct: 0.50,
    bonusAttackSpeedPct: 0.50,
    levelBonusPerLvl: 0.05,
  },
  breath: {
    name: 'Второе дыхание',
    activation: 'cooldown',
    baseCooldown: 30.0,
    targetType: 'self_heal',
    healPctOfMaxHp: 0.30,
    levelBonusPerLvl: 0.05,
  },
  double_strike: {
    name: 'Двойной удар',
    activation: 'cooldown',
    baseCooldown: 6.0,
    targetType: 'single',
    baseDamageMultiplier: 1.7,
    hits: 2,
    bonusCritChance: 0.20,
    levelBonusPerLvl: 0.10,
  },
  bloodlust: {
    name: 'Кровожадность',
    activation: 'cooldown',
    baseCooldown: 12.0,
    targetType: 'aoe_around_self',
    aoeRadius: 80,
    baseDamageMultiplier: 1.5,
    lifestealPct: 0.5,              // 50% от нанесённого урона возвращается в HP
    minHealPct: 0.10,               // гарантированный минимум — 10% maxHp за каст (на пустую толпу)
    knockback: 25,
    levelBonusPerLvl: 0.10,
  },
  combo: {
    name: 'Серия',
    activation: 'cooldown',
    baseCooldown: 5.0,
    targetType: 'single',
    baseDamageMultiplier: 1.4,
    buffOnUse: {
      atkSpdBonusPct: 0.30,
      durationSec: 2.5,
    },
    levelBonusPerLvl: 0.10,
  },
};

export const STARTING_SKILLS = ['hook'];

// Гарантированный порядок первых гача-выпадений — пока есть незаоткрытые из этого списка,
// они выпадают строго по порядку. Используется чтобы дать игроку базовый toolkit (AoE + heal)
// в первые 2 крутки. Дальше — чистый рандом из оставшихся закрытых.
export const GUARANTEED_UNLOCKS = ['roundkick', 'breath'];

// Гача
export const GACHA = {
  duplicateShards: 5,           // сколько шардов даёт повтор
  lockedProbability: 0.75,      // вероятность выпадения закрытого скилла (если есть)
};

export const SKILL_SHARD_COSTS = [3, 5, 8, 12, 18, 27, 40, 60, 90, 135];

export function shardCostForLevel(level) {
  // level 1 → cost to reach level 2 = SKILL_SHARD_COSTS[0]
  const idx = level - 1;
  if (idx < SKILL_SHARD_COSTS.length) return SKILL_SHARD_COSTS[idx];
  const last = SKILL_SHARD_COSTS[SKILL_SHARD_COSTS.length - 1];
  const extra = idx - (SKILL_SHARD_COSTS.length - 1);
  return Math.ceil(last * Math.pow(1.5, extra));
}
