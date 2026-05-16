// Слой агрегации статов — единая точка расчёта итоговых характеристик героя.
// Критично: при добавлении эквипа в v2 все формулы продолжают работать без переписывания.

import { PLAYER, STAT_BONUSES } from '../balance/player.js';
import { xpForLevel } from '../balance/training.js';
import { getEquipmentBonus } from '../balance/equipment.js';
import { getEquippedItems } from './inventory.js';
import { getStickerBonus } from './stickers_state.js';
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

function statBonusFromLevels(levels, primaryStat, bonusKey, multFn = null, levelOffset = 0) {
  const lvl = (levels[primaryStat] || 0) + levelOffset;
  const per = STAT_BONUSES[primaryStat]?.[bonusKey] || 0;
  const mult = multFn ? multFn(primaryStat) : 1;
  return Math.max(0, lvl - 1) * per * mult;
}

// Чистая функция: считает финальный стат для произвольного билда.
// trainerMultFn  — опциональный источник множителя эффективности тренажёра по статам (DI для симулятора).
// stickerBonusFn — опциональный источник стикер-бонусов (DI для симулятора).
// По умолчанию — live state.
//
// damage / maxHp используют гибрид: flat (база + тренажёр + flat-эквип) × (1 + pct-эквип/стикер).
export function computeEffectiveStat(
  statName, levels, equippedItems = [],
  trainerMultFn = getTrainerStatMultiplier,
  stickerBonusFn = getStickerBonus,
) {
  const tmf = trainerMultFn || (() => 1);
  const sticker = stickerBonusFn || (() => 0);
  // Виртуальный +1 уровень от полного сета Спорта (set bonus). Применяется только к боевому
  // расчёту — heroState.levels не трогаем, поэтому XP/cap логика тренажёров не ломается.
  const lvlOffset = sticker('statLevelOffset') | 0;
  switch (statName) {
    case 'maxHp': {
      const flat = PLAYER.baseHp
                 + statBonusFromLevels(levels, 'toughness', 'maxHp', tmf, lvlOffset)
                 + getEquipmentBonus('maxHp', equippedItems)
                 + sticker('maxHp');
      const pct = getEquipmentBonus('maxHpPct', equippedItems);
      return flat * (1 + pct);
    }
    case 'damage': {
      const flat = PLAYER.baseDamage
                 + statBonusFromLevels(levels, 'strength', 'damage', tmf, lvlOffset)
                 + getEquipmentBonus('damage', equippedItems);
      const pct = getEquipmentBonus('damagePct', equippedItems) + sticker('damagePct');
      return flat * (1 + pct);
    }
    case 'attackSpeed': {
      const pct = statBonusFromLevels(levels, 'agility', 'attackSpeedPct', tmf, lvlOffset)
                + getEquipmentBonus('attackSpeedPct', equippedItems)
                + sticker('attackSpeedPct');
      return clamp(PLAYER.baseAttackSpeed * (1 + pct), PLAYER.capAttackSpeed);
    }
    case 'critChance': {
      return clamp(
        PLAYER.baseCritChance
        + getEquipmentBonus('critChance', equippedItems)
        + sticker('critChance'),
        PLAYER.capCritChance);
    }
    case 'critMultiplier': {
      return clamp(
        PLAYER.baseCritMultiplier
        + getEquipmentBonus('critMultiplier', equippedItems)
        + sticker('critMultiplier'),
        PLAYER.capCritMultiplier);
    }
    case 'dodgeChance': {
      return clamp(
        PLAYER.baseDodgeChance
        + statBonusFromLevels(levels, 'agility', 'dodgeChance', tmf, lvlOffset)
        + getEquipmentBonus('dodgeChance', equippedItems)
        + sticker('dodgeChance'),
        PLAYER.capDodgeChance);
    }
    case 'defense': {
      return clamp(
        PLAYER.baseDefense
        + statBonusFromLevels(levels, 'toughness', 'defense', tmf, lvlOffset)
        + getEquipmentBonus('defense', equippedItems),
        PLAYER.capDefense);
    }
    case 'skillCdrPct': {
      // Rate-based CDR — без клэмпа. Diminishing returns встроен в формулу:
      //   эффCD = baseCD / (1 + rate). См. battle/battle.js skillCooldownAfterCdr.
      return PLAYER.baseSkillCdrPct
           + getEquipmentBonus('skillCdrPct', equippedItems);
    }
    case 'hpRegenInBattle': {
      const base = PLAYER.baseHpRegenInBattle
                 + statBonusFromLevels(levels, 'toughness', 'hpRegen', tmf, lvlOffset);
      return base * (1 + sticker('hpRegenInBattlePct'));
    }
    case 'hpRegenBetweenWaves': return PLAYER.baseHpRegenBetweenWaves;
    case 'moveSpeed':           return PLAYER.moveSpeed * (1 + sticker('moveSpeedPct'));
    case 'attackRadius':        return PLAYER.attackRadius;
    case 'bodyRadius':          return PLAYER.bodyRadius;
    default:
      console.warn('Unknown stat:', statName);
      return 0;
  }
}

// Основная игровая обёртка — берёт состояние из live state.
export function getEffectiveStat(statName) {
  return computeEffectiveStat(statName, heroState.levels, getEquippedItems(), getTrainerStatMultiplier, getStickerBonus);
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
  const xpMult = 1 + getStickerBonus('xpPct');
  heroState.xp[stat] += amount * xpMult;
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
