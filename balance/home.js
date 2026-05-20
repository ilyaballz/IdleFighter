// Апгрейды дома — три постройки, каждая улучшает свой параметр энергии/усталости.
// Все три унифицированы как множители к базам в balance/training.js:
//   shower  → ×FATIGUE.recoverPerHour (восстановление мышц)
//   couch   → ×ENERGY.recoverPerSec
//   trailer → ×ENERGY.maxCap
// T1 у каждой постройки — стартовый/бесплатный (×1.0, базовое значение).
//
// Валюта: 🔩 гайки (НЕ монеты). Гайки дропают только боссы локаций — отделено от тренажёров,
// чтобы апгрейды дома и тренажёров не конкурировали за один кошелёк.
// Полная прокачка одной постройки = 57 гаек (5 + 12 + 15 + 25).

// Каждая постройка дома разлочивается на своей локации (drip-расписание первого часа).
// До unlockLocation постройка отображается серой с подсказкой «Доступно с L_N».
export const HOME_UPGRADES = {
  shower: {
    name: 'Душ',
    icon: '🚿',
    desc: 'Восст. мышц после нагрузок',
    bonusUnit: '×',
    unlockLocation: 7,        // приходит последним — fatigue становится реальным лимитом только с T2-T3 trainer
    tiers: [
      { value: 1.0,    nutCost: 0  }, // 60/час (база)
      { value: 1.25,   nutCost: 5  }, // 75/час
      { value: 1.5833, nutCost: 12 }, // 95/час
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
    // T1 base = 10⚡/мин (ENERGY.recoverPerSec). Кривая разгоняет до 35⚡/мин на T5.
    tiers: [
      { value: 1.0,  nutCost: 0  },   // 10⚡/мин — full T1-батарея 50⚡ за 5 мин
      { value: 1.5,  nutCost: 5  },   // 15⚡/мин
      { value: 2.0,  nutCost: 12 },   // 20⚡/мин
      { value: 2.7,  nutCost: 15 },   // 27⚡/мин
      { value: 3.5,  nutCost: 25 },   // 35⚡/мин — full T5-батарея 300⚡ за 8.6 мин
    ],
  },
  trailer: {
    name: 'Трейлер',
    icon: '🚐',
    desc: 'Макс. запас энергии',
    bonusUnit: '⚡',
    unlockLocation: 4,        // первая прокачка — сразу видимый буст к батарее и тапам
    // T1 base = 50⚡ (стартовая батарея). T5 = 300⚡ покрывает triple-cycle T5 trainers (282⚡).
    tiers: [
      { value: 50,  nutCost: 0  },
      { value: 80,  nutCost: 5  },
      { value: 130, nutCost: 12 },
      { value: 200, nutCost: 15 },
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

