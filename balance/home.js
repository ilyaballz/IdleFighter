// Апгрейды дома — три постройки, каждая улучшает свой параметр энергии/усталости.
// fridge → fatigueRecoverPerHour (оверрайд значения)
// couch  → множитель к ENERGY.recoverPerSec
// trailer → оверрайд ENERGY.maxCap
// T1 у каждой постройки — стартовый/бесплатный (= совпадает с базой в training.js).
//
// Валюта: 🔩 гайки (НЕ монеты). Гайки дропают только боссы локаций — отделено от тренажёров,
// чтобы апгрейды дома и тренажёров не конкурировали за один кошелёк.
// Полная прокачка одной постройки = 50 гаек (3 + 7 + 15 + 25).

export const HOME_UPGRADES = {
  fridge: {
    name: 'Холодильник',
    icon: '🧊',
    desc: 'Восст. свежести между сессиями',
    bonusUnit: '/час',
    tiers: [
      { value: 60,  nutCost: 0 },
      { value: 75,  nutCost: 3 },
      { value: 95,  nutCost: 7 },
      { value: 120, nutCost: 15 },
      { value: 150, nutCost: 25 },
    ],
  },
  couch: {
    name: 'Диван',
    icon: '🛋️',
    desc: 'Скорость восст. энергии',
    bonusUnit: '×',
    tiers: [
      { value: 1.0,  nutCost: 0 },
      { value: 1.25, nutCost: 3 },
      { value: 1.5,  nutCost: 7 },
      { value: 2.0,  nutCost: 15 },
      { value: 2.5,  nutCost: 25 },
    ],
  },
  trailer: {
    name: 'Трейлер',
    icon: '🚐',
    desc: 'Макс. запас энергии',
    bonusUnit: '⚡',
    tiers: [
      { value: 100, nutCost: 0 },
      { value: 130, nutCost: 3 },
      { value: 170, nutCost: 7 },
      { value: 220, nutCost: 15 },
      { value: 300, nutCost: 25 },
    ],
  },
};

export function homeTierValue(buildingId, tier) {
  const up = HOME_UPGRADES[buildingId];
  if (!up) return 0;
  const idx = Math.max(0, Math.min(up.tiers.length - 1, tier - 1));
  return up.tiers[idx].value;
}
