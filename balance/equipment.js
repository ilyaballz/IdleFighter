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
  legendary: { color: '#ff9800', extraAffixes: 3, name: 'Легендарный', weight: 3.00 },
  // Mythic — эндгейм-награда гл.4 (L31+). +5 secondary affixes vs legendary 3,
  // value-weight ×4.0 (vs legendary 3.0) — крупнее primary/secondary значения.
  // Unique-affix pool переиспользуется от legendary (см. LEGENDARY_UNIQUE_AFFIXES).
  mythic:    { color: '#e91e63', extraAffixes: 5, name: 'Мифический', weight: 4.00 },
};

// Базовое значение primary affix для common-предмета на L1 локации.
// Скейлится: × RARITIES[r].weight × pow(locationScale, locationLevel-1).
// Все ключи здесь должны соответствовать `primaryStat` какого-то слота выше.
export const PRIMARY_AFFIX_BASE = {
  damage:         5,
  critChance:     0.03,    // +3% (на L20 legendary → +55%, capCritChance 75% оставляет место для secondary стака)
  maxHp:          30,
  defense:        0.03,    // +3% (снижено с 0.04 — endgame танк-билды слишком быстро упираются в cap 75%)
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
  { type: 'defense',        base: 0.02 },
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
  mythic:   150,
};

// Максимальный уровень прокачки primary affix (cap). Выше нельзя качать.
export const MAX_UPGRADE_LEVEL_BY_RARITY = {
  common:    1,
  good:      2,
  rare:      3,
  epic:      4,
  legendary: 6,
  mythic:   10,
};

// Стоимость повышения с уровня i на (i+1) в эссенции. Удваивается каждый шаг.
// L0→L1=5, L1→L2=10, ..., L9→L10=2560.
export const UPGRADE_LEVEL_COSTS = [5, 10, 20, 40, 80, 160, 320, 640, 1280, 2560];

// Линейный прирост primary affix за уровень прокачки. L1=+10%, L2=+20%, ..., L6=+60%.
export const UPGRADE_PRIMARY_PER_LEVEL = 0.10;

// Таблицы редкости дропа по локации. Ключи — id редкости из RARITIES, значения — веса.
// Кривая растянута под 40 локаций (главы 1-4). Пик — на L40+ (финал гл.4, Главпрораб).
// L10/L20/L30/L40 — финалы глав, на milestone'ах дополнительный буст легендарки.
//
// На milestone-локациях (см. MILESTONE_LEGENDARY_BOOST в enemies.js) шанс легендарки доп.
// повышается — награда за «пробитие стенки».
function rawBossRarityWeights(loc) {
  // Простая 5-зонная кривая, рарка с L5, эпик с L10, лега с L20, мифик с L30.
  // Лега/мифик намеренно редкие — игрок фармит на сет.
  if (loc <= 4)  return { common: 60, good: 40 };
  if (loc <= 9)  return { common: 25, good: 55, rare: 20 };
  if (loc <= 19) return { good: 30, rare: 55, epic: 15 };
  if (loc <= 29) return { rare: 30, epic: 60, legendary: 10 };
  return                 { epic: 60, legendary: 35, mythic: 5 };
}

export function bossRarityWeights(loc) {
  const base = rawBossRarityWeights(loc);
  const boost = MILESTONE_LEGENDARY_BOOST[loc];
  if (!boost) return base;
  return { ...base, legendary: (base.legendary || 0) + boost };
}

export function eliteRarityWeights(loc) {
  // 5 зон, синхронно с boss-кривой. Лега 1-9%, мифик 1% (намного реже чем у босса).
  if (loc <= 4)  return { common: 100 };
  if (loc <= 9)  return { common: 70, good: 25, rare: 5 };
  if (loc <= 19) return { common: 30, good: 55, rare: 12, epic: 3 };
  if (loc <= 29) return { good: 40, rare: 50, epic: 9, legendary: 1 };
  return                 { rare: 35, epic: 55, legendary: 9, mythic: 1 };
}

export function regularRarityWeights(loc) {
  // Регулярка — самый частый, но шанс топ-рарностей крошечный (lega 0.5%, mythic 0.1%).
  // Сдвиг по локациям +1 от boss/elite (epic с L11, lega с L21, mythic с L31).
  if (loc <= 4)  return { common: 100 };
  if (loc <= 10) return { common: 95, good: 4, rare: 1 };
  if (loc <= 20) return { common: 70, good: 27, rare: 2.5, epic: 0.5 };
  if (loc <= 30) return { common: 45, good: 45, rare: 8.5, epic: 1, legendary: 0.5 };
  return                 { common: 30, good: 45, rare: 19.5, epic: 4.9, legendary: 0.5, mythic: 0.1 };
}

// Множитель к primary affix от текущего уровня прокачки предмета (линейный).
export function getPrimaryUpgradeMultiplier(item) {
  const lvl = item?.upgradeLevel | 0;
  return 1 + UPGRADE_PRIMARY_PER_LEVEL * lvl;
}

// ───────── Уникальные аффиксы легендарок ─────────
// Дополнительный 5-й аффикс, есть только у `rarity: legendary`. Раскатывается случайно
// при генерации предмета (см. generateItem в inventory.js).
//
// Триггер `autoAttack` — срабатывает в battle.js после каждой авто-атаки героя:
//   - bleed:    chance × шанс применить DoT по цели (используется enemy.dot/bleedStacks)
//   - lifesteal: heal героя на pct от нанесённого урона (без шанса — всегда тригерит)
//   - stun:     chance × шанс положить цель (используется enemy.knockdownUntil)
//
// При нескольких надетых легендарках — все их уникальные аффиксы складываются (каждый
// тикает независимо). Дубликат типа на разных слотах = двойной шанс / двойной хил.
export const LEGENDARY_UNIQUE_AFFIXES = {
  bleed: {
    icon: '🩸',
    name: 'Кровотечение',
    description: '15% шанс на удар наложить DoT (20%/с урона × 5с)',
    trigger: 'autoAttack',
    chance: 0.15,
    dotPctPerSec: 0.20,
    dotDurationSec: 5.0,
  },
  lifesteal: {
    icon: '🧛',
    name: 'Жажда крови',
    description: '5% от урона восстанавливает HP — только с критов',
    trigger: 'autoAttack',
    chance: 1.0,             // ролл шанса не нужен — гейт сам по triggerOnCritOnly
    triggerOnCritOnly: true, // лечит только при крит-ударе. Завязывает аффикс на crit-билд.
    healPct: 0.05,
  },
  stun: {
    icon: '👊',
    name: 'Тяжёлый кулак',
    description: '8% шанс на удар оглушить цель (0.6с)',
    trigger: 'autoAttack',
    chance: 0.08,
    stunDurationSec: 0.6,
  },
};

// Возвращает массив всех ID уникальных аффиксов (для случайного ролла в generateItem).
export const LEGENDARY_UNIQUE_TYPES = Object.keys(LEGENDARY_UNIQUE_AFFIXES);

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
