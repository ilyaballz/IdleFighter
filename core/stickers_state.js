// State коллекции стикеров + хук дропа.
//
// Источники в MVP: только дроп с мобов (1% через tryDropStickerForKill).
// Без дубликатов: при дропе выбирается случайный из ещё не собранных. Когда все 25 собраны —
// дроп просто не триггерится (Math.random() всё ещё крутится, но missing.length === 0).
//
// Бонусы агрегируются по всем разлоченным стикерам + по полным сетам (set bonus).
// Кэш агрегата перестраивается при изменении коллекции (rebuildBonusCache).

import {
  STICKERS, STICKER_SETS, ALL_STICKER_IDS, STICKER_DROP_CHANCE, stickerIdsInSet,
} from '../balance/stickers.js';

export const stickersState = {
  unlocked: new Set(),    // Set<stickerId>
};

// Кэш суммарных бонусов: key → number. Пересчитывается через rebuildBonusCache().
let bonusCache = Object.create(null);
let completeSetsCache = new Set();

function rebuildBonusCache() {
  const next = Object.create(null);
  const sets = new Set();
  for (const id of stickersState.unlocked) {
    const def = STICKERS[id];
    if (!def) continue;
    for (const [k, v] of Object.entries(def.bonuses)) {
      next[k] = (next[k] || 0) + v;
    }
  }
  for (const [setId, setDef] of Object.entries(STICKER_SETS)) {
    const ids = stickerIdsInSet(setId);
    const complete = ids.length > 0 && ids.every(id => stickersState.unlocked.has(id));
    if (!complete) continue;
    sets.add(setId);
    for (const [k, v] of Object.entries(setDef.setBonus)) {
      next[k] = (next[k] || 0) + v;
    }
  }
  bonusCache = next;
  completeSetsCache = sets;
}

// Главный getter — сколько даёт ключ k от всех разлоченных стикеров + полных сетов.
// 0 если ключа нет.
export function getStickerBonus(k) {
  return bonusCache[k] || 0;
}

// Полный набор разлоченных стикеров (для UI и сейва).
export function getUnlockedStickers() {
  return stickersState.unlocked;
}

export function isStickerUnlocked(id) {
  return stickersState.unlocked.has(id);
}

export function isSetComplete(setId) {
  return completeSetsCache.has(setId);
}

// Выдаёт стикер по id (форс — для дев-панели/магазина в будущем).
// Возвращает true если действительно разлочили (false если уже был).
export function awardSticker(id) {
  if (!STICKERS[id]) return false;
  if (stickersState.unlocked.has(id)) return false;
  stickersState.unlocked.add(id);
  rebuildBonusCache();
  return true;
}

// Хук дропа: вызывается на каждое убийство. Возвращает stickerId или null.
// Шанс плоский STICKER_DROP_CHANCE, источник — любой моб (kind не различается в MVP).
export function tryDropStickerForKill(_enemy) {
  if (Math.random() >= STICKER_DROP_CHANCE) return null;
  return dropRandomMissingSticker();
}

// Универсальный дроп случайного недостающего стикера (без chance-гейта).
// Используется внешними источниками (скретч-карты бара, магазин, дев-панель и т.п.).
// Возвращает stickerId или null если все 25 уже собраны.
export function dropRandomMissingSticker() {
  const missing = ALL_STICKER_IDS.filter(id => !stickersState.unlocked.has(id));
  if (missing.length === 0) return null;
  const id = missing[Math.floor(Math.random() * missing.length)];
  stickersState.unlocked.add(id);
  rebuildBonusCache();
  return id;
}

// Сейв-интеграция.
export function serializeStickers() {
  return [...stickersState.unlocked];
}

export function deserializeStickers(arr) {
  stickersState.unlocked.clear();
  if (Array.isArray(arr)) {
    for (const id of arr) {
      if (STICKERS[id]) stickersState.unlocked.add(id);
    }
  }
  rebuildBonusCache();
}

export function resetStickers() {
  stickersState.unlocked.clear();
  rebuildBonusCache();
}
