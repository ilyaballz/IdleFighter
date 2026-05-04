// Слой агрегации статов — единая точка расчёта итоговых характеристик героя.
// Критично: при добавлении эквипа в v2 все формулы продолжают работать без переписывания.

import { PLAYER, STAT_BONUSES, xpForLevel } from '../balance/player.js';
import { getEquipmentBonus } from '../balance/equipment.js';
import { getEquippedItems } from './inventory.js';

// State героя — уровни первичных статов (в v1 = 1, далее растут от тренажёров)
export const heroState = {
  levels: {
    strength: PLAYER.strength,
    toughness: PLAYER.toughness,
    agility: PLAYER.agility,
  },
  // XP по статам (для этапа 3)
  xp: { strength: 0, toughness: 0, agility: 0 },
  // Текущий HP — отслеживается отдельно от max
  currentHp: PLAYER.baseHp,
};

function clamp(val, max) {
  return val > max ? max : val;
}

function statBonusFromLevels(levels, primaryStat, bonusKey) {
  const lvl = levels[primaryStat] || 0;
  const per = STAT_BONUSES[primaryStat]?.[bonusKey] || 0;
  return Math.max(0, lvl - 1) * per;
}

// Чистая функция: считает финальный стат для произвольного билда (используется и игрой, и симулятором).
export function computeEffectiveStat(statName, levels, equippedItems = []) {
  switch (statName) {
    case 'maxHp': {
      return PLAYER.baseHp
           + statBonusFromLevels(levels, 'toughness', 'maxHp')
           + getEquipmentBonus('maxHp', equippedItems);
    }
    case 'damage': {
      return PLAYER.baseDamage
           + statBonusFromLevels(levels, 'strength', 'damage')
           + getEquipmentBonus('damage', equippedItems);
    }
    case 'attackSpeed': {
      const pct = statBonusFromLevels(levels, 'agility', 'attackSpeedPct')
                + getEquipmentBonus('attackSpeedPct', equippedItems);
      return clamp(PLAYER.baseAttackSpeed * (1 + pct), PLAYER.capAttackSpeed);
    }
    case 'critChance': {
      return clamp(
        PLAYER.baseCritChance
        + statBonusFromLevels(levels, 'strength', 'critChance')
        + getEquipmentBonus('critChance', equippedItems),
        PLAYER.capCritChance);
    }
    case 'critMultiplier': {
      return clamp(
        PLAYER.baseCritMultiplier + getEquipmentBonus('critMultiplier', equippedItems),
        PLAYER.capCritMultiplier);
    }
    case 'dodgeChance': {
      return clamp(
        PLAYER.baseDodgeChance
        + statBonusFromLevels(levels, 'agility', 'dodgeChance')
        + getEquipmentBonus('dodgeChance', equippedItems),
        PLAYER.capDodgeChance);
    }
    case 'defense': {
      return clamp(
        PLAYER.baseDefense
        + statBonusFromLevels(levels, 'toughness', 'defense')
        + getEquipmentBonus('defense', equippedItems),
        PLAYER.capDefense);
    }
    case 'skillCdrPct': {
      return clamp(
        PLAYER.baseSkillCdrPct
        + statBonusFromLevels(levels, 'agility', 'skillCdrPct')
        + getEquipmentBonus('skillCdrPct', equippedItems),
        PLAYER.capSkillCdrPct);
    }
    case 'hpRegenInBattle': {
      return PLAYER.baseHpRegenInBattle
           + statBonusFromLevels(levels, 'toughness', 'hpRegen');
    }
    case 'hpRegenBetweenWaves': return PLAYER.baseHpRegenBetweenWaves;
    case 'moveSpeed':           return PLAYER.moveSpeed;
    case 'attackRadius':        return PLAYER.attackRadius;
    case 'bodyRadius':          return PLAYER.bodyRadius;
    default:
      console.warn('Unknown stat:', statName);
      return 0;
  }
}

// Основная игровая обёртка — берёт состояние из live state.
export function getEffectiveStat(statName) {
  return computeEffectiveStat(statName, heroState.levels, getEquippedItems());
}

export function resetHeroForNewRun() {
  heroState.currentHp = getEffectiveStat('maxHp');
}

// Возвращает true, если был апа уровня (хотя бы один).
export function addStatXp(stat, amount) {
  if (!(stat in heroState.xp)) return false;
  let leveled = false;
  heroState.xp[stat] += amount;
  while (heroState.xp[stat] >= xpForLevel(heroState.levels[stat])) {
    heroState.xp[stat] -= xpForLevel(heroState.levels[stat]);
    heroState.levels[stat]++;
    leveled = true;
  }
  return leveled;
}

export function getStatXpProgress(stat) {
  const lvl = heroState.levels[stat] || 1;
  const need = xpForLevel(lvl);
  const cur = heroState.xp[stat] || 0;
  return { current: cur, needed: need, level: lvl };
}

export function resetAllProgression() {
  for (const s of ['strength', 'toughness', 'agility']) {
    heroState.levels[s] = 1;
    heroState.xp[s] = 0;
  }
  heroState.currentHp = getEffectiveStat('maxHp');
}
