export const PLAYER = {
  strength: 1,
  toughness: 1,
  agility: 1,

  baseHp: 100,
  baseDamage: 10,
  baseAttackSpeed: 1.0,
  baseCritChance: 0.05,
  baseCritMultiplier: 1.5,
  baseDodgeChance: 0.0,
  baseDefense: 0.0,
  baseSkillCdrPct: 0.0,
  baseHpRegenInBattle: 0.005,
  baseHpRegenBetweenWaves: 0.05,

  moveSpeed: 180,
  corridorSpeedMultiplier: 2.0, // герой бежит между аренами вдвое быстрее, чем в бою
  attackRadius: 55,
  bodyRadius: 22,

  capCritChance: 0.75,
  capCritMultiplier: 3.0,
  capDodgeChance: 0.60,
  capDefense: 0.75,
  capAttackSpeed: 5.0,         // soft cap — даём stack-простор (combo+rage+breath+эквип), но не убегает
  // capSkillCdrPct убран — rate-based CDR с встроенным diminishing returns (см. stats_layer.js)
};

// Тренажёры дают «базу»: прямой урон, HP, защиту, регенерацию, скорость атаки + лёгкий dodge.
// Crit/critMult/cdr — только эквип/перки.
// Калибровано под 10 уровней на тир × 6 тиров (cap 60), statMultiplier 1/2/3/4/5/6.
// Max на T6 cap: damage +360, maxHp +3600, defense +36%, hpRegen +10.8%/sec, AS +180%, dodge +36%.
export const STAT_BONUSES = {
  strength:  { damage: 1 },
  toughness: { maxHp: 10, defense: 0.001, hpRegen: 0.0003 },
  agility:   { attackSpeedPct: 0.005, dodgeChance: 0.001 },
};

// XP-кривая стат-уровней живёт в balance/training.js (рядом с xpPerTap по тирам).