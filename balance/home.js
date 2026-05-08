// Апгрейды дома — три постройки, каждая улучшает свой параметр энергии/усталости.
// fridge → fatigueRecoverPerHour (оверрайд значения)
// couch  → множитель к ENERGY.recoverPerSec
// trailer → оверрайд ENERGY.maxCap
// T1 у каждой постройки — стартовый/бесплатный (= совпадает с базой в training.js).

export const HOME_UPGRADES = {
  fridge: {
    name: 'Холодильник',
    icon: '🧊',
    desc: 'Восст. свежести между сессиями',
    bonusUnit: '/час',
    tiers: [
      { value: 60,  cost: 0 },
      { value: 75,  cost: 800 },
      { value: 95,  cost: 3000 },
      { value: 120, cost: 12000 },
      { value: 150, cost: 40000 },
    ],
  },
  couch: {
    name: 'Диван',
    icon: '🛋️',
    desc: 'Скорость восст. энергии',
    bonusUnit: '×',
    tiers: [
      { value: 1.0,  cost: 0 },
      { value: 1.25, cost: 800 },
      { value: 1.5,  cost: 3000 },
      { value: 2.0,  cost: 12000 },
      { value: 2.5,  cost: 40000 },
    ],
  },
  trailer: {
    name: 'Трейлер',
    icon: '🚐',
    desc: 'Макс. запас энергии',
    bonusUnit: '⚡',
    tiers: [
      { value: 100, cost: 0 },
      { value: 130, cost: 800 },
      { value: 170, cost: 3000 },
      { value: 220, cost: 12000 },
      { value: 300, cost: 40000 },
    ],
  },
};

export function homeTierValue(buildingId, tier) {
  const up = HOME_UPGRADES[buildingId];
  if (!up) return 0;
  const idx = Math.max(0, Math.min(up.tiers.length - 1, tier - 1));
  return up.tiers[idx].value;
}
