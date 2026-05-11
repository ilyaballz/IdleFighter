// Апгрейды дома — три постройки, каждая улучшает свой параметр энергии/усталости.
// Все три унифицированы как множители к базам в balance/training.js:
//   fridge  → ×FATIGUE.recoverPerHour (и refund за зачистку локаций)
//   couch   → ×ENERGY.recoverPerSec
//   trailer → ×ENERGY.maxCap
// T1 у каждой постройки — стартовый/бесплатный (×1.0, базовое значение).
//
// Валюта: 🔩 гайки (НЕ монеты). Гайки дропают только боссы локаций — отделено от тренажёров,
// чтобы апгрейды дома и тренажёров не конкурировали за один кошелёк.
// Полная прокачка одной постройки = 50 гаек (3 + 7 + 15 + 25).

export const HOME_UPGRADES = {
  fridge: {
    name: 'Холодильник',
    icon: '🧊',
    desc: 'Восст. свежести между сессиями',
    bonusUnit: '×',
    tiers: [
      { value: 1.0,    nutCost: 0  }, // 60/час (база)
      { value: 1.25,   nutCost: 3  }, // 75/час
      { value: 1.5833, nutCost: 7  }, // 95/час
      { value: 2.0,    nutCost: 15 }, // 120/час
      { value: 2.5,    nutCost: 25 }, // 150/час
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
