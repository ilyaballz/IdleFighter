// Инвентарь и логика дропа предметов.

import {
  EQUIPMENT_SLOTS, RARITIES, PRIMARY_AFFIX_BASE,
  SECONDARY_AFFIXES, SECONDARY_AFFIX_VARIANCE,
  bossRarityWeights, eliteRarityWeights, regularRarityWeights,
  SALVAGE_VALUE, MAX_UPGRADE_LEVEL_BY_RARITY, UPGRADE_LEVEL_COSTS,
  getAffixValueMult, roundAffixValue,
  LEGENDARY_UNIQUE_TYPES,
} from '../balance/equipment.js';
import { ENEMY_BASE, ELITE_BASE, BOSS_BASE } from '../balance/enemies.js';

let nextItemId = 1;

export function getNextItemId() { return nextItemId; }
export function setNextItemId(n) { if (typeof n === 'number' && n > 0) nextItemId = n; }

export const inventoryState = {
  items: [],   // массив всех предметов (надетые тоже здесь)
  equipped: {  // slotId → itemId | null
    fists: null, chain: null, bracers: null,
    jacket: null, bandana: null, sneakers: null,
  },
};

// ───────── Генерация ─────────

export function generateItem(slotId, rarityId, locationLevel = 1) {
  const slot = EQUIPMENT_SLOTS[slotId];
  const rarity = RARITIES[rarityId];
  if (!slot || !rarity) return null;

  const valueMult = getAffixValueMult(rarity.weight, locationLevel);

  // Primary affix: тип задан слотом
  const primaryBase = PRIMARY_AFFIX_BASE[slot.primaryStat];
  const primaryValue = roundAffixValue(slot.primaryStat, primaryBase * valueMult);

  // Secondary affixes — выбираем без повторов и без типа primary
  const usedTypes = new Set([slot.primaryStat]);
  const affixes = [];
  for (let i = 0; i < rarity.extraAffixes; i++) {
    const candidates = SECONDARY_AFFIXES.filter(a => !usedTypes.has(a.type));
    if (candidates.length === 0) break;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    usedTypes.add(pick.type);
    // Разброс на secondary, чтобы предметы внутри редкости отличались
    const v = SECONDARY_AFFIX_VARIANCE;
    const variance = (1 - v) + Math.random() * (2 * v);
    affixes.push({
      type: pick.type,
      value: roundAffixValue(pick.type, pick.base * valueMult * variance),
    });
  }

  // Уникальный аффикс — у легендарок и мифик-предметов, ровно 1 случайный тип из пула.
  // Эффект применяется в battle.js (см. applyAutoAttackUniques). Mythic переиспользует
  // тот же pool — но base value secondary affixes у мифика выше (через weight=4.0),
  // поэтому суммарный эффект unique тоже сильнее.
  let uniqueAffix = null;
  if ((rarityId === 'legendary' || rarityId === 'mythic') && LEGENDARY_UNIQUE_TYPES.length > 0) {
    const pick = LEGENDARY_UNIQUE_TYPES[Math.floor(Math.random() * LEGENDARY_UNIQUE_TYPES.length)];
    uniqueAffix = { type: pick };
  }

  return {
    id: `item_${nextItemId++}`,
    slot: slotId,
    rarity: rarityId,
    upgradeLevel: 0,
    primaryAffix: { type: slot.primaryStat, value: primaryValue },
    affixes,
    uniqueAffix,
  };
}

// ───────── Дроп с врагов ─────────

function pickWeighted(weights) {
  const total = Object.values(weights).reduce((s, v) => s + v, 0);
  let roll = Math.random() * total;
  for (const [key, w] of Object.entries(weights)) {
    roll -= w;
    if (roll <= 0) return key;
  }
  return Object.keys(weights)[0];
}

function randomSlotId() {
  const slotIds = Object.keys(EQUIPMENT_SLOTS);
  return slotIds[Math.floor(Math.random() * slotIds.length)];
}

export function rollBossDrop(locationLevel) {
  if (Math.random() > BOSS_BASE.equipmentDropChance) return null;
  const rarityId = pickWeighted(bossRarityWeights(locationLevel));
  return generateItem(randomSlotId(), rarityId, locationLevel);
}

export function rollEliteDrop(locationLevel) {
  if (Math.random() > ELITE_BASE.equipmentDropChance) return null;
  const rarityId = pickWeighted(eliteRarityWeights(locationLevel));
  return generateItem(randomSlotId(), rarityId, locationLevel);
}

export function rollRegularDrop(locationLevel) {
  if (Math.random() > ENEMY_BASE.equipmentDropChance) return null;
  const rarityId = pickWeighted(regularRarityWeights(locationLevel));
  return generateItem(randomSlotId(), rarityId, locationLevel);
}

// Диспатчер дропа эквипа по типу врага. Возвращает item или null.
export function rollDropForEnemy(enemy, locationLevel) {
  if (enemy.kind === 'bar_boss') return null;     // бар-босс не роняет лут (только медаль)
  if (enemy.kind === 'boss')     return rollBossDrop(locationLevel);
  if (enemy.kind === 'elite')    return rollEliteDrop(locationLevel);
  return rollRegularDrop(locationLevel);
}

// ───────── Управление инвентарём ─────────

export function addItem(item) {
  if (!item) return;
  inventoryState.items.push(item);
}

export function findItem(itemId) {
  return inventoryState.items.find(i => i.id === itemId) || null;
}

export function equipItem(itemId) {
  const item = findItem(itemId);
  if (!item) return false;
  inventoryState.equipped[item.slot] = itemId;
  return true;
}

export function unequipSlot(slotId) {
  if (!(slotId in inventoryState.equipped)) return false;
  inventoryState.equipped[slotId] = null;
  return true;
}

export function getEquippedItemForSlot(slotId) {
  const id = inventoryState.equipped[slotId];
  return id ? findItem(id) : null;
}

export function getEquippedItems() {
  return Object.values(inventoryState.equipped)
    .map(id => id ? findItem(id) : null)
    .filter(Boolean);
}

// Уникальные аффиксы с надетых легендарок — массив { type } (params читаются из
// LEGENDARY_UNIQUE_AFFIXES в battle.js при триггере). Дубликаты типа возможны
// (две легендарки с bleed = два независимых ролла на хит).
export function getEquippedUniqueAffixes() {
  return getEquippedItems()
    .map(it => it.uniqueAffix)
    .filter(Boolean);
}

export function getItemsForSlot(slotId) {
  return inventoryState.items.filter(i => i.slot === slotId);
}

export function resetInventory() {
  inventoryState.items.length = 0;
  for (const k of Object.keys(inventoryState.equipped)) {
    inventoryState.equipped[k] = null;
  }
}

// ───────── Прокачка / Распыление (salvage) ─────────

export function getItemUpgradeMaxLevel(item) {
  if (!item) return 0;
  return MAX_UPGRADE_LEVEL_BY_RARITY[item.rarity] || 0;
}

export function isItemAtMaxUpgrade(item) {
  return (item?.upgradeLevel | 0) >= getItemUpgradeMaxLevel(item);
}

// Стоимость следующего уровня прокачки. null если уже на cap'е.
export function getItemUpgradeCost(item) {
  if (!item || isItemAtMaxUpgrade(item)) return null;
  return UPGRADE_LEVEL_COSTS[item.upgradeLevel | 0];
}

// Сумма всей вложенной эссенции в апгрейды этого предмета (для возврата при salvage).
export function getInvestedEssence(item) {
  const lvl = item?.upgradeLevel | 0;
  let sum = 0;
  for (let i = 0; i < lvl; i++) sum += UPGRADE_LEVEL_COSTS[i] || 0;
  return sum;
}

// Цена распыления = база редкости + 100% возврат вложенной эссенции.
export function getItemSalvageValue(item) {
  if (!item) return 0;
  return (SALVAGE_VALUE[item.rarity] || 0) + getInvestedEssence(item);
}

export function isItemEquipped(itemId) {
  for (const slot of Object.keys(inventoryState.equipped)) {
    if (inventoryState.equipped[slot] === itemId) return true;
  }
  return false;
}

// Поднимает upgradeLevel на 1 (без проверки эссенции — тратит вызывающий).
// Возвращает true если получилось.
export function upgradeItem(itemId) {
  const item = findItem(itemId);
  if (!item || isItemAtMaxUpgrade(item)) return false;
  item.upgradeLevel = (item.upgradeLevel | 0) + 1;
  return true;
}

// Удаляет предмет из инвентаря (используется при salvage). Надетый — не трогаем.
export function removeItem(itemId) {
  if (isItemEquipped(itemId)) return false;
  const idx = inventoryState.items.findIndex(i => i.id === itemId);
  if (idx < 0) return false;
  inventoryState.items.splice(idx, 1);
  return true;
}
