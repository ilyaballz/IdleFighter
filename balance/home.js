// Апгрейды дома — четыре постройки, каждая улучшает свой параметр энергии/усталости/Golden Tap.
// Все унифицированы как множители к базам в balance/training.js:
//   shower  → ×FATIGUE.recoverPerHour (восстановление мышц)
//   couch   → ×ENERGY.recoverPerSec
//   trailer → ×ENERGY.maxCap
//   coffee  → ×Golden Tap chance + TTL bonus
// T1 у каждой постройки — стартовый/бесплатный (×1.0, базовое значение).
// 10 паидных тиров с линейной стоимостью 3..30 = 165 гаек на полную прокачку одной постройки.
//
// Валюта: 🔩 гайки (НЕ монеты). Гайки дропают только боссы локаций — отделено от тренажёров,
// чтобы апгрейды дома и тренажёров не конкурировали за один кошелёк.

// Каждая постройка дома разлочивается на своей локации (drip-расписание первого часа).
// До unlockLocation постройка отображается серой с подсказкой «Доступно с L_N».
export const HOME_UPGRADES = {
  shower: {
    name: 'Душ',
    icon: '🚿',
    desc: 'Восст. мышц после нагрузок',
    bonusUnit: '×',
    unlockLocation: 7,        // приходит последним — fatigue становится реальным лимитом только с T2-T3 trainer
    // 1.0→2.5 (60→150 fatigue/час), шаг 0.15
    tiers: [
      { value: 1.00, nutCost: 0  },
      { value: 1.15, nutCost: 3  },
      { value: 1.30, nutCost: 6  },
      { value: 1.45, nutCost: 9  },
      { value: 1.60, nutCost: 12 },
      { value: 1.75, nutCost: 15 },
      { value: 1.90, nutCost: 18 },
      { value: 2.05, nutCost: 21 },
      { value: 2.20, nutCost: 24 },
      { value: 2.35, nutCost: 27 },
      { value: 2.50, nutCost: 30 },
    ],
  },
  couch: {
    name: 'Диван',
    icon: '🛋️',
    desc: 'Скорость восст. энергии',
    bonusUnit: '×',
    unlockLocation: 5,
    // T1 base = 10⚡/мин (ENERGY.recoverPerSec). T11 = 35⚡/мин (full 300⚡-batt за 8.6 мин).
    // Шаг ровный 0.25.
    tiers: [
      { value: 1.00, nutCost: 0  },
      { value: 1.25, nutCost: 3  },
      { value: 1.50, nutCost: 6  },
      { value: 1.75, nutCost: 9  },
      { value: 2.00, nutCost: 12 },
      { value: 2.25, nutCost: 15 },
      { value: 2.50, nutCost: 18 },
      { value: 2.75, nutCost: 21 },
      { value: 3.00, nutCost: 24 },
      { value: 3.25, nutCost: 27 },
      { value: 3.50, nutCost: 30 },
    ],
  },
  trailer: {
    name: 'Трейлер',
    icon: '🚐',
    desc: 'Макс. запас энергии',
    bonusUnit: '⚡',
    unlockLocation: 4,        // первая прокачка — сразу видимый буст к батарее и тапам
    // T1 base = 50⚡. T11 = 300⚡ покрывает triple-cycle T5 trainers (282⚡). Шаг 25.
    tiers: [
      { value: 50,  nutCost: 0  },
      { value: 75,  nutCost: 3  },
      { value: 100, nutCost: 6  },
      { value: 125, nutCost: 9  },
      { value: 150, nutCost: 12 },
      { value: 175, nutCost: 15 },
      { value: 200, nutCost: 18 },
      { value: 225, nutCost: 21 },
      { value: 250, nutCost: 24 },
      { value: 275, nutCost: 27 },
      { value: 300, nutCost: 30 },
    ],
  },
  // Кофеварка: глобальный апгрейд Golden Tap'а — шанс появления И бонус к TTL.
  // Базовый Golden Tap разлочивается per-trainer milestone'ом (100 тапов = 5% база).
  // T11 endgame: 5% × 4.0 = 20% шанс Golden, TTL base + 2.0с.
  coffee: {
    name: 'Кофеварка',
    icon: '☕',
    desc: 'Шанс и время Golden Tap',
    bonusUnit: '×',
    // Динамическая разлочка: открывается когда любой тренажёр впервые получает Golden Tap
    // (milestone 100 lifetimeTaps). См. hub/state.js → isHomeBuildingUnlockedLive.
    unlockLocation: null,
    tiers: [
      { value: 1.0, ttlBonus: 0.0, nutCost: 0  },
      { value: 1.3, ttlBonus: 0.2, nutCost: 3  },
      { value: 1.6, ttlBonus: 0.4, nutCost: 6  },
      { value: 1.9, ttlBonus: 0.6, nutCost: 9  },
      { value: 2.2, ttlBonus: 0.8, nutCost: 12 },
      { value: 2.5, ttlBonus: 1.0, nutCost: 15 },
      { value: 2.8, ttlBonus: 1.2, nutCost: 18 },
      { value: 3.1, ttlBonus: 1.4, nutCost: 21 },
      { value: 3.4, ttlBonus: 1.6, nutCost: 24 },
      { value: 3.7, ttlBonus: 1.8, nutCost: 27 },
      { value: 4.0, ttlBonus: 2.0, nutCost: 30 },
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

