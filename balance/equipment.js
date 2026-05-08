// Эквип — структура и баланс. Прототип v2: только базовые статы, без скилл-специфичных аффиксов.
// Скилл-специфика (skill_damage с конкретным skillId, rage_duration и т.п.) — в комментариях
// для будущего расширения, пока не используется в генерации.

export const EQUIPMENT_SLOTS = {
  fists:    { name: 'Кулаки',    icon: '🥊', primaryStat: 'damage' },
  chain:    { name: 'Цепь',      icon: '⛓️',  primaryStat: 'critChance' },
  bracers:  { name: 'Браслеты',  icon: '💪', primaryStat: 'critMultiplier' },
  jacket:   { name: 'Куртка',    icon: '🧥', primaryStat: 'maxHp' },
  bandana:  { name: 'Бандана',   icon: '🎽', primaryStat: 'defense' },
  sneakers: { name: 'Кроссовки', icon: '👟', primaryStat: 'attackSpeedPct' },
};

export const RARITIES = {
  common:    { color: '#9e9e9e', extraAffixes: 0, name: 'Обычный',    weight: 1.00 },
  good:      { color: '#4caf50', extraAffixes: 1, name: 'Хороший',    weight: 1.40 },
  rare:      { color: '#2196f3', extraAffixes: 2, name: 'Редкий',     weight: 2.00 },
  epic:      { color: '#9c27b0', extraAffixes: 3, name: 'Эпический',  weight: 3.00 },
  legendary: { color: '#ff9800', extraAffixes: 4, name: 'Легендарный', weight: 4.50 },
};

// Базовое значение primary affix для common-предмета на L1 локации.
// Скейлится: × RARITIES[r].weight × pow(locationScale, locationLevel-1).
export const PRIMARY_AFFIX_BASE = {
  damage:         5,
  critChance:     0.03,    // +3%
  critMultiplier: 0.20,    // +0.20×
  maxHp:          30,
  defense:        0.04,    // +4%
  attackSpeedPct: 0.08,    // +8%
};

// Пул вторичных аффиксов — простой, базовые статы.
// На предмете тип не повторяется + не совпадает с primary.
export const SECONDARY_AFFIXES = [
  { type: 'damage',         base: 3 },
  { type: 'critChance',     base: 0.02 },
  { type: 'critMultiplier', base: 0.15 },
  { type: 'maxHp',          base: 20 },
  { type: 'defense',        base: 0.03 },
  { type: 'attackSpeedPct', base: 0.05 },
  { type: 'dodgeChance',    base: 0.02 },
  { type: 'skillCdrPct',    base: 0.04 },
];

export const LOCATION_VALUE_SCALE = 1.15; // +15% к ценности предмета за локацию

// Разброс значений вторичных аффиксов внутри одной редкости (±20%).
export const SECONDARY_AFFIX_VARIANCE = 0.2;

// Таблицы редкости дропа по локации. Ключи — id редкости из RARITIES, значения — веса.
// Цель: первый эпик у среднего игрока ~через 2 часа активной игры (~30-40 забегов).
// Эпики начинают капать с L4 босса (5%), L7 элиты, L10 регуляров.
export function bossRarityWeights(loc) {
  if (loc <= 1) return { common: 60, good: 40 };
  if (loc <= 2) return { common: 40, good: 55, rare: 5 };
  if (loc <= 3) return { common: 20, good: 60, rare: 20 };
  if (loc <= 4) return { good: 50, rare: 45, epic: 5 };
  if (loc <= 5) return { good: 30, rare: 55, epic: 14, legendary: 1 };
  if (loc <= 7) return { good: 15, rare: 55, epic: 27, legendary: 3 };
  if (loc <= 9) return { rare: 45, epic: 45, legendary: 10 };
  return                 { rare: 25, epic: 55, legendary: 20 };
}

export function eliteRarityWeights(loc) {
  if (loc <= 2) return { common: 100 };
  if (loc <= 3) return { common: 80, good: 20 };
  if (loc <= 5) return { common: 60, good: 35, rare: 5 };
  if (loc <= 7) return { common: 40, good: 45, rare: 14, epic: 1 };
  if (loc <= 9) return { common: 25, good: 50, rare: 22, epic: 3 };
  return                 { common: 15, good: 40, rare: 35, epic: 9, legendary: 1 };
}

export function regularRarityWeights(loc) {
  if (loc <= 5) return { common: 100 };
  if (loc <= 7) return { common: 90, good: 10 };
  if (loc <= 9) return { common: 75, good: 23, rare: 2 };
  return                 { common: 60, good: 30, rare: 9, epic: 1 };
}

// Слой агрегации: сумма primary + secondary всех надетых предметов для нужного стата.
export function getEquipmentBonus(statName, equippedItems = []) {
  let sum = 0;
  for (const item of equippedItems) {
    if (!item) continue;
    if (item.primaryAffix && item.primaryAffix.type === statName) {
      sum += item.primaryAffix.value;
    }
    if (item.affixes) {
      for (const aff of item.affixes) {
        if (aff.type === statName) sum += aff.value;
      }
    }
  }
  return sum;
}
