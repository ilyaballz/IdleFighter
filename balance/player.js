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
  capAttackSpeed: 3.0,
  capSkillCdrPct: 1.0,
};

// Билд-статы (crit, critMult, cdr, dodge) убраны из тренажёров — они теперь только на эквипе.
// Тренажёры дают «базу»: прямой урон, HP, защиту, регенерацию, скорость атаки.
export const STAT_BONUSES = {
  strength:  { damage: 5 },
  toughness: { maxHp: 25, defense: 0.007, hpRegen: 0.0025 },
  agility:   { attackSpeedPct: 0.015 },
};

export const STAT_LEVEL_XP = {
  baseXp: 20,
  growthMultiplier: 1.4,
};

export function xpForLevel(level) {
  return Math.floor(STAT_LEVEL_XP.baseXp * Math.pow(STAT_LEVEL_XP.growthMultiplier, level - 1));
}
