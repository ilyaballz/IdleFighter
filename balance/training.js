export const ENERGY = {
  maxCap: 100,
  startAmount: 100,
  recoverPerSec: 1 / 6,         // полная батарейка за ~10 мин
  trainerEntryCost: 0,          // вход свободный — fatigue per-stat сама гоняет ротировать
  // Сессия не ограничена количеством тапов — заканчивается по нехватке энергии
  // или вручную. Зоны зелёная/жёлтая сужаются (усталость мышц).
};

export const TAP_ZONES = {
  green:  { energyCost: 2, xpGain: 1 },
  yellow: { energyCost: 4, xpGain: 1 },
  red:    { energyCost: 6, xpGain: 1 },
};

export const TAP_BAR = {
  // Слоёная модель: красная всегда на всю ширину (фон), поверх центрирована жёлтая,
  // поверх неё — зелёная (самая узкая). По мере fatigue зелёная сужается → проявляется
  // жёлтая под ней; жёлтая сужается медленнее → в финале остаётся только красная.
  // Hit-detection: ищем самый верхний непустой слой над курсором.
  totalWidth: 100,
  baseGreenWidth: 60,
  baseYellowWidth: 90,    // жёлтая значительно шире зелёной — становится «нормой» когда зелёная исчерпана
  cursorSpeed: 120,

  // Скорость убывания зон растёт с fatigue. Каждый тап забирает у зоны:
  //   shrinkPerTap = baseShrink + fatigue × accel
  // Накопительно после N тапов: убыль = N × baseShrink + accel × N(N-1)/2
  greenBaseShrink: 4,    // первый тап у свежего игрока забирает 4 ширины зелёной
  greenAccel:      2.0,  // каждый следующий тап забирает на 2 больше
  yellowBaseShrink: 1,
  yellowAccel:      0.5,

  // Восстановление: тап = +1 fatigue, убывает со временем.
  // 60/час = синхронно с регеном энергии (полная батарейка за 10 мин).
  fatigueRecoverPerHour: 60,
};

export const TRAINERS = {
  strength:  { stat: 'strength',  name: 'Штанга',     icon: '🏋️' },
  toughness: { stat: 'toughness', name: 'Груша',      icon: '🥊' },
  agility:   { stat: 'agility',   name: 'Скакалка',   icon: '🪢' },
};

// Тир 0 = тренажёр не куплен. Стартовое состояние всех тренажёров.
// Покупка (символическая, 50 монет) переводит в тир 1, дальше идут полноценные апгрейды.
// Шаг ×3 между тирами: пост-апгрейд ощущается как cliff-дроп.
export const TRAINER_TIERS = [
  { tier: 0, xpPerTap: 0,   upgradeCost: 0 },
  { tier: 1, xpPerTap: 3,   upgradeCost: 50 },
  { tier: 2, xpPerTap: 10,  upgradeCost: 500 },
  { tier: 3, xpPerTap: 30,  upgradeCost: 2000 },
  { tier: 4, xpPerTap: 90,  upgradeCost: 8000 },
  { tier: 5, xpPerTap: 270, upgradeCost: 30000 },
];
