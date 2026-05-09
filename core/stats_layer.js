// Слой агрегации статов — единая точка расчёта итоговых характеристик героя.
// Критично: при добавлении эквипа в v2 все формулы продолжают работать без переписывания.

import { PLAYER, STAT_BONUSES, xpForLevel } from '../balance/player.js';
import { getEquipmentBonus } from '../balance/equipment.js';
import { getEquippedItems } from './inventory.js';
import { getPerkBonus } from './bar_state.js';
import { getTrainerStatMultiplier, getTrainerLevelCap } from '../hub/state.js';

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

function statBonusFromLevels(levels, primaryStat, bonusKey, multFn = null) {
  const lvl = levels[primaryStat] || 0;
  const per = STAT_BONUSES[primaryStat]?.[bonusKey] || 0;
  const mult = multFn ? multFn(primaryStat) : 1;
  return Math.max(0, lvl - 1) * per * mult;
}

// Чистая функция: считает финальный стат для произвольного билда.
// perkBonusFn   — опциональный источник перковых бонусов (DI для симулятора).
// trainerMultFn — опциональный источник множителя эффективности тренажёра по статам.
// По умолчанию — live state через getPerkBonus / getTrainerStatMultiplier.
//
// Crit / critMult / dodge / cdr — теперь только от эквипа и перков (тренажёры их не дают).
// damage / maxHp используют гибрид: flat (база + тренажёр + flat-эквип) × (1 + pct-эквип/перк).
export function computeEffectiveStat(
  statName, levels, equippedItems = [],
  perkBonusFn = getPerkBonus, trainerMultFn = getTrainerStatMultiplier,
) {
  const perk = perkBonusFn || (() => 0);
  const tmf = trainerMultFn || (() => 1);
  switch (statName) {
    case 'maxHp': {
      const flat = PLAYER.baseHp
                 + statBonusFromLevels(levels, 'toughness', 'maxHp', tmf)
                 + getEquipmentBonus('maxHp', equippedItems)
                 + perk('maxHpFlat');
      const pct = getEquipmentBonus('maxHpPct', equippedItems) + perk('maxHpPct');
      return flat * (1 + pct);
    }
    case 'damage': {
      const flat = PLAYER.baseDamage
                 + statBonusFromLevels(levels, 'strength', 'damage', tmf)
                 + getEquipmentBonus('damage', equippedItems)
                 + perk('damageFlat');
      const pct = getEquipmentBonus('damagePct', equippedItems) + perk('damagePct');
      return flat * (1 + pct);
    }
    case 'attackSpeed': {
      const pct = statBonusFromLevels(levels, 'agility', 'attackSpeedPct', tmf)
                + getEquipmentBonus('attackSpeedPct', equippedItems)
                + perk('attackSpeedPct');
      return clamp(PLAYER.baseAttackSpeed * (1 + pct), PLAYER.capAttackSpeed);
    }
    case 'critChance': {
      return clamp(
        PLAYER.baseCritChance
        + getEquipmentBonus('critChance', equippedItems)
        + perk('critChance'),
        PLAYER.capCritChance);
    }
    case 'critMultiplier': {
      return clamp(
        PLAYER.baseCritMultiplier
        + getEquipmentBonus('critMultiplier', equippedItems)
        + perk('critMultiplier'),
        PLAYER.capCritMultiplier);
    }
    case 'dodgeChance': {
      return clamp(
        PLAYER.baseDodgeChance
        + getEquipmentBonus('dodgeChance', equippedItems)
        + perk('dodgeChance'),
        PLAYER.capDodgeChance);
    }
    case 'defense': {
      return clamp(
        PLAYER.baseDefense
        + statBonusFromLevels(levels, 'toughness', 'defense', tmf)
        + getEquipmentBonus('defense', equippedItems)
        + perk('defense'),
        PLAYER.capDefense);
    }
    case 'skillCdrPct': {
      return clamp(
        PLAYER.baseSkillCdrPct
        + getEquipmentBonus('skillCdrPct', equippedItems)
        + perk('skillCdrPct'),
        PLAYER.capSkillCdrPct);
    }
    case 'hpRegenInBattle': {
      return PLAYER.baseHpRegenInBattle
           + statBonusFromLevels(levels, 'toughness', 'hpRegen', tmf)
           + perk('hpRegenInBattle');
    }
    case 'hpRegenBetweenWaves': return PLAYER.baseHpRegenBetweenWaves;
    case 'moveSpeed':           return PLAYER.moveSpeed + perk('moveSpeed');
    case 'attackRadius':        return PLAYER.attackRadius + perk('attackRadius');
    case 'bodyRadius':          return PLAYER.bodyRadius;
    default:
      console.warn('Unknown stat:', statName);
      return 0;
  }
}

// Основная игровая обёртка — берёт состояние из live state.
export function getEffectiveStat(statName) {
  return computeEffectiveStat(statName, heroState.levels, getEquippedItems(), getPerkBonus, getTrainerStatMultiplier);
}

export function resetHeroForNewRun() {
  heroState.currentHp = getEffectiveStat('maxHp');
}

// Возвращает true, если был апа уровня (хотя бы один).
// При достижении cap'а тренажёра дальнейший XP не начисляется (тапы блокируются на уровне сессии).
export function addStatXp(stat, amount) {
  if (!(stat in heroState.xp)) return false;
  const cap = getTrainerLevelCap(stat);
  if (heroState.levels[stat] >= cap) return false;
  let leveled = false;
  heroState.xp[stat] += amount;
  while (heroState.levels[stat] < cap && heroState.xp[stat] >= xpForLevel(heroState.levels[stat])) {
    heroState.xp[stat] -= xpForLevel(heroState.levels[stat]);
    heroState.levels[stat]++;
    leveled = true;
  }
  // Достигли cap'а — обнуляем накопленный xp, чтобы он не висел впрок при апгрейде тира.
  if (heroState.levels[stat] >= cap) {
    heroState.xp[stat] = 0;
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
