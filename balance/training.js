export const ENERGY = {
  maxCap: 100,
  startAmount: 100,
  recoverPerSec: 1 / 10,
  trainerEntryCost: 10,
  // Сессия не ограничена количеством тапов — заканчивается по нехватке энергии
  // или вручную. Зоны зелёная/жёлтая сужаются (усталость мышц).
};

export const TAP_ZONES = {
  green:  { energyCost: 2, xpGain: 1 },
  yellow: { energyCost: 4, xpGain: 1 },
  red:    { energyCost: 6, xpGain: 1 },
};

export const TAP_BAR = {
  totalWidth: 100,
  baseGreenWidth: 60,
  baseYellowWidth: 30,
  cursorSpeed: 120,

  // Скорость убывания зон растёт с fatigue. Каждый тап забирает у зоны:
  //   shrinkPerTap = baseShrink + fatigue × accel
  // Накопительно после N тапов: убыль = N × baseShrink + accel × N(N-1)/2
  greenBaseShrink: 4,    // первый тап у свежего игрока забирает 4 ширины зелёной
  greenAccel:      2.0,  // каждый следующий тап забирает на 2 больше
  yellowBaseShrink: 1,
  yellowAccel:      0.5,

  // Восстановление: тап = +1 fatigue, убывает со временем
  fatigueRecoverPerHour: 30,
};

export const TRAINERS = {
  strength:  { stat: 'strength',  name: 'Штанга',     icon: '🏋️' },
  toughness: { stat: 'toughness', name: 'Груша',      icon: '🥊' },
  agility:   { stat: 'agility',   name: 'Скакалка',   icon: '🪢' },
};

export const TRAINER_TIERS = [
  { tier: 1, xpPerTap: 3,  upgradeCost: 0 },
  { tier: 2, xpPerTap: 6,  upgradeCost: 500 },
  { tier: 3, xpPerTap: 12, upgradeCost: 2000 },
  { tier: 4, xpPerTap: 24, upgradeCost: 8000 },
  { tier: 5, xpPerTap: 48, upgradeCost: 30000 },
];
