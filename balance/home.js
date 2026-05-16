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

// Каждая постройка дома разлочивается на своей локации (drip-расписание первого часа).
// До unlockLocation постройка отображается серой с подсказкой «Доступно с L_N».
export const HOME_UPGRADES = {
  fridge: {
    name: 'Холодильник',
    icon: '🧊',
    desc: 'Восст. свежести между сессиями',
    bonusUnit: '×',
    unlockLocation: 4,        // открывается одновременно с самим хабом «Дом»
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
    unlockLocation: 5,
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
    unlockLocation: 7,
    tiers: [
      { value: 100, nutCost: 0 },
      { value: 130, nutCost: 3 },
      { value: 170, nutCost: 7 },
      { value: 220, nutCost: 15 },
      { value: 300, nutCost: 25 },
    ],
  },
  // Кофеварка: глобальный апгрейд Golden Tap'а — шанс появления И бонус к TTL.
  // Шанс растёт только здесь (milestones теперь не дают chance×N — только качественные апгрейды).
  // Базовый Golden Tap разлочивается per-trainer milestone'ом (100 тапов = 5% база).
  // На макс T5 + milestone unlock: шанс 5% × 2.5 = 12.5%, TTL 2.5 + 1.5 = 4.0с.
  coffee: {
    name: 'Кофеварка',
    icon: '☕',
    desc: 'Шанс и время Golden Tap',
    bonusUnit: '×',
    // Динамическая разлочка: открывается когда любой тренажёр впервые получает Golden Tap
    // (milestone 100 lifetimeTaps). См. hub/state.js → isHomeBuildingUnlockedLive.
    // Покупать апгрейды до разлочки самой фичи нет смысла — coffee буст шанса/TTL
    // не работает пока golden zone в принципе не появляется.
    unlockLocation: null,
    tiers: [
      { value: 1.0, ttlBonus: 0.0, nutCost: 0  },
      { value: 1.4, ttlBonus: 0.3, nutCost: 5  },
      { value: 1.8, ttlBonus: 0.6, nutCost: 12 },
      { value: 2.2, ttlBonus: 1.0, nutCost: 25 },
      { value: 2.5, ttlBonus: 1.5, nutCost: 50 },
    ],
  },
};

// Бонус TTL Golden Tap (сек) для текущего тира coffee.
export function homeCoffeeTtlBonus(tier) {
  const up = HOME_UPGRADES.coffee;
  const idx = Math.max(0, Math.min(up.tiers.length - 1, tier - 1));
  return up.tiers[idx].ttlBonus || 0;
}

export function homeTierValue(buildingId, tier) {
  const up = HOME_UPGRADES[buildingId];
  if (!up) return 0;
  const idx = Math.max(0, Math.min(up.tiers.length - 1, tier - 1));
  return up.tiers[idx].value;
}

