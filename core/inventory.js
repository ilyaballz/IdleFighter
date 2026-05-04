// Инвентарь и логика дропа предметов.

import {
  EQUIPMENT_SLOTS, RARITIES, PRIMARY_AFFIX_BASE,
  SECONDARY_AFFIXES, LOCATION_VALUE_SCALE, SECONDARY_AFFIX_VARIANCE,
  bossRarityWeights, eliteRarityWeights, regularRarityWeights,
} from '../balance/equipment.js';
import { ENEMY_BASE, ELITE_BASE, BOSS_BASE } from '../balance/enemies.js';

let nextItemId = 1;

export const inventoryState = {
  items: [],   // массив всех предметов (надетые тоже здесь)
  equipped: {  // slotId → itemId | null
    fists: null, chain: null, bracers: null,
    jacket: null, bandana: null, sneakers: null,
  },
};

// ───────── Генерация ─────────

function roundForType(type, value) {
  if (type === 'damage' || type === 'maxHp') return Math.round(value);
  return Math.round(value * 1000) / 1000;
}

export function generateItem(slotId, rarityId, locationLevel = 1) {
  const slot = EQUIPMENT_SLOTS[slotId];
  const rarity = RARITIES[rarityId];
  if (!slot || !rarity) return null;

  const valueMult = rarity.weight * Math.pow(LOCATION_VALUE_SCALE, Math.max(0, locationLevel - 1));

  // Primary affix: тип задан слотом
  const primaryBase = PRIMARY_AFFIX_BASE[slot.primaryStat];
  const primaryValue = roundForType(slot.primaryStat, primaryBase * valueMult);

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
      value: roundForType(pick.type, pick.base * valueMult * variance),
    });
  }

  return {
    id: `item_${nextItemId++}`,
    slot: slotId,
    rarity: rarityId,
    primaryAffix: { type: slot.primaryStat, value: primaryValue },
    affixes,
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
  if (enemy.kind === 'boss')  return rollBossDrop(locationLevel);
  if (enemy.kind === 'elite') return rollEliteDrop(locationLevel);
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

export function getItemsForSlot(slotId) {
  return inventoryState.items.filter(i => i.slot === slotId);
}

export function getAllItems() {
  return inventoryState.items.slice();
}

export function resetInventory() {
  inventoryState.items.length = 0;
  for (const k of Object.keys(inventoryState.equipped)) {
    inventoryState.equipped[k] = null;
  }
}
