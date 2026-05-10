// Расписание разлочки зданий хаба — FTUE-гейтинг по локациям.
// Здание открыто, когда hubState.currentLocationIndex >= unlockLocation.
// (currentLocationIndex увеличивается на 1 после каждой победы → "после L1" = >= 2.)

export const BUILDING_UNLOCK_LOCATION = {
  arsenal:  2,   // после L1
  wardrobe: 2,   // после L1
  gym:      3,   // после L2
  house:    4,   // после L3
  bar:      6,   // после L5
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
