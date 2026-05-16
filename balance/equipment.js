// Эквип — структура и баланс. Прототип v2: только базовые статы, без скилл-специфичных аффиксов.
// Скилл-специфика (skill_damage с конкретным skillId, rage_duration и т.п.) — в комментариях
// для будущего расширения, пока не используется в генерации.

import { MILESTONE_LEGENDARY_BOOST } from './enemies.js';

// Все primary stats — «всегда полезные» (универсальные DPS/выживаемость/утилити).
// Цепь сделана крит-слотом: даёт critChance primary. Раньше там был damagePct, но он
// создавал outlier-предмет (×2.5 множитель от одной шмотки на L20 legendary). Теперь
// damagePct остаётся только во вторичных аффиксах с заниженной базой — стак идёт от
// нескольких источников, не от одной «имба-цепи».
export const EQUIPMENT_SLOTS = {
  fists:    { name: 'Кулаки',    icon: '🥊', primaryStat: 'damage' },
  chain:    { name: 'Цепь',      icon: '⛓️',  primaryStat: 'critChance' },
  bracers:  { name: 'Браслеты',  icon: '💪', primaryStat: 'skillCdrPct' },
  jacket:   { name: 'Куртка',    icon: '🧥', primaryStat: 'maxHp' },
  bandana:  { name: 'Бандана',   icon: '🎽', primaryStat: 'defense' },
  sneakers: { name: 'Кроссовки', icon: '👟', primaryStat: 'attackSpeedPct' },
};

export const RARITIES = {
  common:    { color: '#9e9e9e', extraAffixes: 0, name: 'Обычный',    weight: 1.00 },
  good:      { color: '#4caf50', extraAffixes: 1, name: 'Хороший',    weight: 1.50 },
  rare:      { color: '#2196f3', extraAffixes: 2, name: 'Редкий',     weight: 2.00 },
  epic:      { color: '#9c27b0', extraAffixes: 3, name: 'Эпический',  weight: 2.50 },
  legendary: { color: '#ff9800', extraAffixes: 4, name: 'Легендарный', weight: 3.00 },
};

// Базовое значение primary affix для common-предмета на L1 локации.
// Скейлится: × RARITIES[r].weight × pow(locationScale, locationLevel-1).
// Все ключи здесь должны соответствовать `primaryStat` какого-то слота выше.
export const PRIMARY_AFFIX_BASE = {
  damage:         5,
  critChance:     0.03,    // +3% (на L20 legendary → +55%, capCritChance 75% оставляет место для secondary стака)
  maxHp:          30,
  defense:        0.04,    // +4%
  attackSpeedPct: 0.08,    // +8%
  skillCdrPct:    0.08,    // +8% CDR (rate-based с встроенным diminishing)
};

// Пул вторичных аффиксов — простой, базовые статы.
// На предмете тип не повторяется + не совпадает с primary.
// damagePct / maxHpPct — мультипликативные бонусы, шуршат на late game поверх flat-вкладов
// (от тренажёров и от других аффиксов). Считаются как множитель `(base + flat) × (1 + pct)`.
export const SECONDARY_AFFIXES = [
  { type: 'damage',         base: 3 },
  { type: 'damagePct',      base: 0.02 },   // снижено с 0.03 — без primary-источника damagePct стак идёт только через secondary
  { type: 'critChance',     base: 0.02 },
  { type: 'critMultiplier', base: 0.15 },
  { type: 'maxHp',          base: 20 },
  { type: 'maxHpPct',       base: 0.04 },
  { type: 'defense',        base: 0.03 },
  { type: 'attackSpeedPct', base: 0.05 },
  { type: 'dodgeChance',    base: 0.02 },
  { type: 'skillCdrPct',    base: 0.04 },
];

export const LOCATION_VALUE_SCALE = 1.05; // +5% к ценности предмета за локацию (см. balance-обсуждение 2026-05-16)

// Разброс значений вторичных аффиксов внутри одной редкости (±20%).
export const SECONDARY_AFFIX_VARIANCE = 0.2;

// Базовый множитель ценности аффикса: вес редкости × scale по локации.
export function getAffixValueMult(rarityWeight, locationLevel) {
  return rarityWeight * Math.pow(LOCATION_VALUE_SCALE, Math.max(0, locationLevel - 1));
}

// Округление значения аффикса по его типу: int для damage/maxHp, 3 знака для процентных/долей.
export function roundAffixValue(type, value) {
  if (type === 'damage' || type === 'maxHp') return Math.round(value);
  return Math.round(value * 1000) / 1000;
}

// ───────── Прокачка предметов: эссенция ─────────
// Эссенция (🔮) — единственный источник прокачки primary affix предмета.
// Берётся через ручной salvage предмета. Чем выше редкость — тем дороже сжечь, но и больше выхлоп.
export const SALVAGE_VALUE = {
  common:    1,
  good:      3,
  rare:      8,
  epic:     20,
  legendary: 50,
};

// Максимальный уровень прокачки primary affix (cap). Выше нельзя качать.
export const MAX_UPGRADE_LEVEL_BY_RARITY = {
  common:    1,
  good:      2,
  rare:      3,
  epic:      4,
  legendary: 6,
};

// Стоимость повышения с уровня i на (i+1) в эссенции. Удваивается каждый шаг.
// L0→L1=5, L1→L2=10, ..., L5→L6=160.
export const UPGRADE_LEVEL_COSTS = [5, 10, 20, 40, 80, 160];

// Линейный прирост primary affix за уровень прокачки. L1=+10%, L2=+20%, ..., L6=+60%.
export const UPGRADE_PRIMARY_PER_LEVEL = 0.10;

// Таблицы редкости дропа по локации. Ключи — id редкости из RARITIES, значения — веса.
// Кривая растянута под 20 локаций (главы 1-2 Город+Подземка). Пик — на L20+
// (финал главы 2, Машинист). L10 (финал главы 1, Авторитет) — «эпик становится нормой».
//
// На milestone-локациях (см. MILESTONE_LEGENDARY_BOOST в enemies.js) шанс легендарки доп.
// повышается — награда за «пробитие стенки».
function rawBossRarityWeights(loc) {
  if (loc <= 1)  return { common: 60, good: 40 };
  if (loc <= 2)  return { common: 40, good: 55, rare: 5 };
  if (loc <= 4)  return { common: 20, good: 60, rare: 20 };
  if (loc <= 6)  return { good: 50, rare: 45, epic: 5 };
  if (loc <= 8)  return { good: 30, rare: 55, epic: 14, legendary: 1 };
  if (loc <= 10) return { good: 15, rare: 55, epic: 27, legendary: 3 };
  if (loc <= 12) return { rare: 45, epic: 45, legendary: 10 };
  if (loc <= 14) return { rare: 38, epic: 50, legendary: 12 };
  if (loc <= 16) return { rare: 32, epic: 53, legendary: 15 };
  if (loc <= 18) return { rare: 28, epic: 54, legendary: 18 };
  return                 { rare: 25, epic: 55, legendary: 20 };
}

export function bossRarityWeights(loc) {
  const base = rawBossRarityWeights(loc);
  const boost = MILESTONE_LEGENDARY_BOOST[loc];
  if (!boost) return base;
  return { ...base, legendary: (base.legendary || 0) + boost };
}

export function eliteRarityWeights(loc) {
  if (loc <= 2)  return { common: 100 };
  if (loc <= 4)  return { common: 80, good: 20 };
  if (loc <= 6)  return { common: 60, good: 35, rare: 5 };
  if (loc <= 8)  return { common: 40, good: 45, rare: 14, epic: 1 };
  if (loc <= 10) return { common: 25, good: 50, rare: 22, epic: 3 };
  if (loc <= 13) return { common: 22, good: 47, rare: 26, epic: 4, legendary: 1 };
  if (loc <= 16) return { common: 18, good: 43, rare: 31, epic: 7, legendary: 1 };
  if (loc <= 18) return { common: 17, good: 41, rare: 33, epic: 8, legendary: 1 };
  return                 { common: 15, good: 40, rare: 35, epic: 9, legendary: 1 };
}

export function regularRarityWeights(loc) {
  if (loc <= 6)  return { common: 100 };
  if (loc <= 9)  return { common: 90, good: 10 };
  if (loc <= 12) return { common: 75, good: 23, rare: 2 };
  if (loc <= 14) return { common: 68, good: 26, rare: 6 };
  if (loc <= 16) return { common: 64, good: 28, rare: 7, epic: 1 };
  if (loc <= 18) return { common: 62, good: 29, rare: 8, epic: 1 };
  return                 { common: 60, good: 30, rare: 9, epic: 1 };
}

// Множитель к primary affix от текущего уровня прокачки предмета (линейный).
export function getPrimaryUpgradeMultiplier(item) {
  const lvl = item?.upgradeLevel | 0;
  return 1 + UPGRADE_PRIMARY_PER_LEVEL * lvl;
}

// Слой агрегации: сумма primary + secondary всех надетых предметов для нужного стата.
// Primary учитывает уровень прокачки; secondary — без изменений (по решению дизайна).
export function getEquipmentBonus(statName, equippedItems = []) {
  let sum = 0;
  for (const item of equippedItems) {
    if (!item) continue;
    if (item.primaryAffix && item.primaryAffix.type === statName) {
      sum += item.primaryAffix.value * getPrimaryUpgradeMultiplier(item);
    }
    if (item.affixes) {
      for (const aff of item.affixes) {
        if (aff.type === statName) sum += aff.value;
      }
    }
  }
  return sum;
}
