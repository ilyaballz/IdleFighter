// Магазин: 6 слотов, 2 валюты, тиры по главам (10 локаций = глава).
//
// Структура слотов:
//   slot[0] — ⚡ Энергия       (💎 фикс, после покупки restock сразу)
//   slot[1] — 💊 Стероиды      (💎 фикс, restock)
//   slot[2] — 🔩 Болты         (💰 фикс, restock)
//   slot[3] — ✦ Шарды          (💰 ротация: skillId выбран на день, sold-out после покупки)
//   slot[4] — 🏷 Стикер        (💰 ротация: стикерId на день, sold-out + refresh за монеты)
//   slot[5] — 🎁 Шмотка rare/epic (💰 ротация: item на день, sold-out)
//
// Реализация кристальных слотов 0/1 — этап 3. Пока (этап 1) energy/steroid временно за монеты,
// чтобы не было gap в покупках. Этап 3 переключит их на crystals.
//
// Тир определяется по locationIndex: tier = floor((loc - 1) / 10) + 1, clamp 1..4.
// За пределами Гл.4 (L41+) используется тир 4 (контента таких локаций нет на момент написания).

export const SHOP_CONFIG = {
  slots: 6,
  refreshStickerPrice: 500,        // монет за refresh sticker-слота на Гл.1 (тирится — см. SHOP_TIERS)
  resetIntervalSec: 86400,         // 24 часа
};

// Slot IDs ротационных слотов.
export const SHOP_STICKER_SLOT_ID = '__sticker__';
export const SHOP_EQUIPMENT_SLOT_ID = '__equipment__';
export const SHOP_SHARDS_SLOT_ID = '__shards__';

// Шансы редкости генерируемой шмотки.
export const SHOP_EQUIPMENT_RARITY_WEIGHTS = { rare: 70, epic: 30 };

// Тиры: каждая запись описывает qty и цены товаров на главе.
// Цены в монетах кроме *crystalPrice (этап 3) — там фикс ниже.
export const SHOP_TIERS = {
  1: {
    energyQty: 100, steroidQty: 10,
    nutsQty:   10,  nutsPrice:  1000,
    shardsQty: 10,  shardsPrice: 300,
    stickerPrice: 1000, stickerRefreshPrice: 500,
    equipmentPrices: { rare: 1500, epic: 4000 },
  },
  2: {
    energyQty: 100, steroidQty: 10,
    nutsQty:   25,  nutsPrice:  2500,
    shardsQty: 30,  shardsPrice: 800,
    stickerPrice: 2500, stickerRefreshPrice: 1200,
    equipmentPrices: { rare: 4000, epic: 10000 },
  },
  3: {
    energyQty: 100, steroidQty: 10,
    nutsQty:   60,  nutsPrice:  6000,
    shardsQty: 80,  shardsPrice: 2000,
    stickerPrice: 6000, stickerRefreshPrice: 3000,
    equipmentPrices: { rare: 10000, epic: 25000 },
  },
  4: {
    energyQty: 100, steroidQty: 10,
    nutsQty:   150, nutsPrice:  15000,
    shardsQty: 200, shardsPrice: 5000,
    stickerPrice: 15000, stickerRefreshPrice: 7500,
    equipmentPrices: { rare: 25000, epic: 60000 },
  },
};

// Кристальные цены — фикс на всех тирах. Цена и qty не растут: 1💎 = const time-save.
// Используются на этапе 3 (пока energy/steroid идут за монеты с временной basePrice ниже).
export const SHOP_CRYSTAL_PRICES = {
  energy:  3,    // +100⚡
  steroid: 2,    // −10 fatigue
};

// Возвращает тир по locationIndex (1..4). Clamp за границы.
export function getShopTier(locationIndex) {
  const idx = Math.max(1, locationIndex | 0);
  const t = Math.floor((idx - 1) / 10) + 1;
  return Math.min(4, Math.max(1, t));
}
