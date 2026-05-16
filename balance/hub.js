// Расписание разлочки зданий хаба — FTUE-гейтинг по локациям.
// Здание открыто, когда hubState.currentLocationIndex >= unlockLocation.
// (currentLocationIndex увеличивается на 1 после каждой победы → "после L1" = >= 2.)

// Drip-расписание для первого часа: каждая локация L1-L10 что-то открывает.
// Бар + стикеры сдвинуты позже, чтобы дать «поздним» системам собственное окно знакомства.
// Постройки дома разлочиваются индивидуально (см. balance/home.js, unlockLocation per tier).
export const BUILDING_UNLOCK_LOCATION = {
  arsenal:  2,   // после L1
  wardrobe: 2,   // после L1
  gym:      3,   // после L2
  house:    4,   // после L3 — открывается с Холодильником, остальные постройки разлочиваются позже
  stickers: 8,   // после L7 — коллекционная фича на лейт
  bar:      9,   // после L8 — премиум-источник наград, нужны знакомые системы вокруг
};

export function isBuildingUnlocked(buildingId, currentLocationIndex) {
  const required = BUILDING_UNLOCK_LOCATION[buildingId] ?? 1;
  return currentLocationIndex >= required;
}

// Текст подсказки для залоченной карточки. Например "после L1" → "Доступно с L2".
export function buildingUnlockHint(buildingId) {
  const required = BUILDING_UNLOCK_LOCATION[buildingId];
  if (required == null || required <= 1) return null;
  return `🔒 пройди L${required - 1}`;
}
