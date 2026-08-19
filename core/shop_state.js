// State магазина v3: 6 слотов, 2 валюты, тиры по главам.
//
// Слоты:
//   0..2 — фикс (energy/steroid/nuts): после покупки СРАЗУ снова доступны.
//   3..5 — ротация (shards/sticker/equipment): sold-out до daily reset.
//
// Reset раз в 24ч обновляет: тир (по текущему locationIndex), ротационные слоты, qty/цены фикс-слотов.
// Между reset'ами фикс-слоты используют запомненные при reset значения qty/price (даже если игрок
// продвинулся в новую главу — следующие 24ч цены текущие; обновление при reset).

import {
  SHOP_CONFIG, SHOP_TIERS, SHOP_CRYSTAL_PRICES,
  SHOP_STICKER_SLOT_ID, SHOP_EQUIPMENT_SLOT_ID, SHOP_SHARDS_SLOT_ID,
  SHOP_EQUIPMENT_RARITY_WEIGHTS,
  getShopTier,
} from '../balance/shop.js';
import { pickRandomMissingStickerId } from './stickers_state.js';
import { loadoutState } from './loadout.js';
import { generateItem } from './inventory.js';
import { hubState } from '../hub/state.js';
import { EQUIPMENT_SLOTS } from '../balance/equipment.js';

export const shopState = {
  slots: [],                  // длина = SHOP_CONFIG.slots
  lastRefreshAt: 0,           // ms timestamp (Date.now())
  tier: 1,                    // зафиксированный тир на текущие сутки магазина
};

// ───────── Генерация слотов под тир ─────────

function generateEnergySlot(tier) {
  const t = SHOP_TIERS[tier];
  return {
    itemId: 'energy',
    qty: t.energyQty,
    price: SHOP_CRYSTAL_PRICES.energy,
    currency: 'crystals',
  };
}

function generateSteroidSlot(tier) {
  const t = SHOP_TIERS[tier];
  return {
    itemId: 'steroid',
    qty: t.steroidQty,
    price: SHOP_CRYSTAL_PRICES.steroid,
    currency: 'crystals',
  };
}

function generateNutsSlot(tier) {
  const t = SHOP_TIERS[tier];
  return {
    itemId: 'nuts',
    qty: t.nutsQty,
    price: t.nutsPrice,
    currency: 'coins',
  };
}

// Шарды: на день фиксируется конкретный skillId. В UI показывается иконка скилла.
function generateShardsSlot(tier) {
  const t = SHOP_TIERS[tier];
  const unlocked = loadoutState.unlocked || [];
  if (unlocked.length === 0) return { itemId: null };
  const skillId = unlocked[Math.floor(Math.random() * unlocked.length)];
  return {
    itemId: SHOP_SHARDS_SLOT_ID,
    skillId,
    qty: t.shardsQty,
    price: t.shardsPrice,
    currency: 'coins',
  };
}

function generateStickerSlot(tier) {
  const t = SHOP_TIERS[tier];
  const stickerId = pickRandomMissingStickerId();
  if (!stickerId) return { itemId: null };
  return {
    itemId: SHOP_STICKER_SLOT_ID,
    stickerId,
    price: t.stickerPrice,
    currency: 'coins',
  };
}

function pickEquipmentRarity() {
  const weights = SHOP_EQUIPMENT_RARITY_WEIGHTS;
  const total = Object.values(weights).reduce((s, v) => s + v, 0);
  let roll = Math.random() * total;
  for (const [key, w] of Object.entries(weights)) {
    roll -= w;
    if (roll <= 0) return key;
  }
  return Object.keys(weights)[0];
}

function randomEquipmentSlotId() {
  const slotIds = Object.keys(EQUIPMENT_SLOTS);
  return slotIds[Math.floor(Math.random() * slotIds.length)];
}

function generateEquipmentSlot(tier) {
  const t = SHOP_TIERS[tier];
  const rarity = pickEquipmentRarity();
  const locationLevel = hubState.currentLocationIndex || 1;
  const item = generateItem(randomEquipmentSlotId(), rarity, locationLevel);
  if (!item) return { itemId: null };
  return {
    itemId: SHOP_EQUIPMENT_SLOT_ID,
    item,
    price: t.equipmentPrices[rarity] || 0,
    currency: 'coins',
  };
}

// Полная регенерация всех слотов под актуальный тир.
function generateAllSlotsForTier(tier) {
  return [
    generateEnergySlot(tier),
    generateSteroidSlot(tier),
    generateNutsSlot(tier),
    generateShardsSlot(tier),
    generateStickerSlot(tier),
    generateEquipmentSlot(tier),
  ];
}

export function regenerateAllSlots() {
  const tier = getShopTier(hubState.currentLocationIndex || 1);
  shopState.tier = tier;
  shopState.slots = generateAllSlotsForTier(tier);
  shopState.lastRefreshAt = Date.now();
}

// При daily reset обновляем тир + ротацию [3..5]. Фикс-слоты [0..2] также пересоздаются
// под новый тир (на случай, если игрок продвинулся в новую главу за прошедшие сутки).
function regenerateOnDailyReset() {
  const tier = getShopTier(hubState.currentLocationIndex || 1);
  shopState.tier = tier;
  shopState.slots[0] = generateEnergySlot(tier);
  shopState.slots[1] = generateSteroidSlot(tier);
  shopState.slots[2] = generateNutsSlot(tier);
  shopState.slots[3] = generateShardsSlot(tier);
  shopState.slots[4] = generateStickerSlot(tier);
  shopState.slots[5] = generateEquipmentSlot(tier);
  shopState.lastRefreshAt = Date.now();
}

// Refresh только sticker-слота (за монеты, см. game.js onShopRefreshSticker). Не сбрасывает таймер.
export function regenerateStickerSlot() {
  shopState.slots[4] = generateStickerSlot(shopState.tier || 1);
}

// ───────── Daily reset check ─────────

export function checkDailyReset() {
  if (shopState.slots.length === 0) {
    regenerateAllSlots();
    return true;
  }
  ensureSlots();
  const ms = SHOP_CONFIG.resetIntervalSec * 1000;
  if (Date.now() - shopState.lastRefreshAt >= ms) {
    regenerateOnDailyReset();
    return true;
  }
  return false;
}

// Back-compat: подхватываем сейвы со старой структурой и обеспечиваем длину = 6.
// Фикс-слот считаем валидным только если есть полный набор полей текущего формата
// (itemId совпадает + qty/price/currency заданы) — иначе перегенерируем.
function isValidFixedSlot(slot, expectedId, expectedCurrency) {
  return slot
    && slot.itemId === expectedId
    && typeof slot.qty === 'number'
    && typeof slot.price === 'number'
    && slot.currency === expectedCurrency;
}

function ensureSlots() {
  if (shopState.slots.length < SHOP_CONFIG.slots) {
    shopState.slots.length = SHOP_CONFIG.slots;
  }
  const tier = shopState.tier || getShopTier(hubState.currentLocationIndex || 1);
  shopState.tier = tier;
  if (!isValidFixedSlot(shopState.slots[0], 'energy',  'crystals')) shopState.slots[0] = generateEnergySlot(tier);
  if (!isValidFixedSlot(shopState.slots[1], 'steroid', 'crystals')) shopState.slots[1] = generateSteroidSlot(tier);
  if (!isValidFixedSlot(shopState.slots[2], 'nuts',    'coins'))    shopState.slots[2] = generateNutsSlot(tier);
  if (shopState.slots[3] === undefined) shopState.slots[3] = generateShardsSlot(tier);
  if (shopState.slots[4] === undefined) shopState.slots[4] = generateStickerSlot(tier);
  if (shopState.slots[5] === undefined) shopState.slots[5] = generateEquipmentSlot(tier);
}

export function getNextResetSec() {
  const ms = SHOP_CONFIG.resetIntervalSec * 1000;
  const elapsed = Date.now() - shopState.lastRefreshAt;
  return Math.max(0, Math.floor((ms - elapsed) / 1000));
}

// ───────── Покупка ─────────

// walletDeduce(cost, currency) — функция списания заданной валюты ('coins' | 'crystals').
// Возвращает { ok: true, purchase: {kind, qty, ...} } или { ok: false, reason: '...' }.
export function buySlot(index, walletDeduce) {
  const slot = shopState.slots[index];
  if (!slot || slot.itemId == null) return { ok: false, reason: 'empty' };
  const currency = slot.currency || 'coins';
  if (!walletDeduce(slot.price, currency)) {
    return { ok: false, reason: currency === 'crystals' ? 'no_crystals' : 'no_coins' };
  }

  // Фикс-слоты (energy/steroid/nuts): применяем эффект, слот остаётся доступным.
  if (slot.itemId === 'energy') {
    return { ok: true, purchase: { kind: 'energy', qty: slot.qty } };
  }
  if (slot.itemId === 'steroid') {
    return { ok: true, purchase: { kind: 'fatigue', qty: slot.qty } };
  }
  if (slot.itemId === 'nuts') {
    return { ok: true, purchase: { kind: 'nuts', qty: slot.qty } };
  }

  // Ротационные слоты: после покупки — sold-out.
  if (slot.itemId === SHOP_SHARDS_SLOT_ID) {
    const purchase = { kind: 'shards', qty: slot.qty, skillId: slot.skillId };
    shopState.slots[index] = { itemId: null };
    return { ok: true, purchase };
  }
  if (slot.itemId === SHOP_STICKER_SLOT_ID) {
    const purchase = { kind: 'sticker', stickerId: slot.stickerId };
    shopState.slots[index] = { itemId: null };
    return { ok: true, purchase };
  }
  if (slot.itemId === SHOP_EQUIPMENT_SLOT_ID) {
    const purchase = { kind: 'equipment', item: slot.item };
    shopState.slots[index] = { itemId: null };
    return { ok: true, purchase };
  }

  return { ok: false, reason: 'unknown_item' };
}

// Refresh sticker-слота. Цена берётся из текущего тира. Refresh всегда за монеты.
export function refreshStickerSlot(walletDeduce) {
  const tier = shopState.tier || 1;
  const cost = SHOP_TIERS[tier].stickerRefreshPrice;
  if (!walletDeduce(cost, 'coins')) return false;
  regenerateStickerSlot();
  return true;
}

// Цена refresh для UI.
export function getStickerRefreshPrice() {
  const tier = shopState.tier || 1;
  return SHOP_TIERS[tier].stickerRefreshPrice;
}

// ───────── Save/Load ─────────

export function serializeShop() {
  return {
    slots: shopState.slots.map(s => ({ ...s })),
    lastRefreshAt: shopState.lastRefreshAt,
    tier: shopState.tier,
  };
}

export function applyShopFromSave(data) {
  if (!data) return;
  if (Array.isArray(data.slots)) shopState.slots = data.slots.map(s => ({ ...s }));
  if (typeof data.lastRefreshAt === 'number') shopState.lastRefreshAt = data.lastRefreshAt;
  if (typeof data.tier === 'number') shopState.tier = data.tier;
}

export function resetShopState() {
  shopState.slots = [];
  shopState.lastRefreshAt = 0;
  shopState.tier = 1;
}
