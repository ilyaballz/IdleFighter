// Стикеры: 5 сетов × 5 наклеек. Плоские пассивные баффы. MVP-источник — дроп с мобов.
//
// MVP-упрощения относительно изначальной спеки:
// - Все условные/триггерные баффы (vs элит, HP<50%, первые N сек, после убийства) сведены к плоским.
// - Set-бонус Боевиков (+10% damage первые 5 сек) → +5% damage пассивно.
// - Set-бонус Тачек (+20% AS на 2 сек после убийства) → +10% AS пассивно.
// - Set-бонус Улицы (+15% всех ресурсов) в v1 даёт только +15% coinPct (essence/shards отложены).
// - Set-бонус Спорта (+1 уровень ко всем стат-уровням пассивно) — виртуальный +1 в боевом расчёте
//   (computeEffectiveStat), не трогает heroState.levels (XP/cap-логика не ломается).
//
// Поддерживаемые ключи бонусов (сумма по всем разлоченным стикерам + set-бонусы):
//   damagePct, critChance, maxHp, attackSpeedPct, dodgeChance, critMultiplier   — стат-канал
//   moveSpeedPct, hpRegenInBattlePct                                             — мультипликативные стат-каналы
//   coinPct, xpPct, energyRegenPct                                               — экономические каналы
//   statLevelOffset                                                              — set-бонус Спорта (виртуальный уровень)

export const STICKER_DROP_CHANCE = 0.005;  // 0.5% с любого моба

export const STICKER_SETS = {
  fighters: {
    name: 'БОЕВИКИ',
    icon: '🥊',
    desc: 'Боссы локаций и элиты',
    setBonus: { damagePct: 0.05 },
    setBonusDesc: '+5% урон',
  },
  cars: {
    name: 'ТАЧКИ',
    icon: '🏎',
    desc: 'Качки и байкеры',
    setBonus: { attackSpeedPct: 0.10 },
    setBonusDesc: '+10% скорость атаки',
  },
  sport: {
    name: 'СПОРТ 80s',
    icon: '🏆',
    desc: 'Milestones тренажёров',
    setBonus: { statLevelOffset: 1 },
    setBonusDesc: '+1 уровень ко всем статам (в бою)',
  },
  music: {
    name: 'МУЗЫКА',
    icon: '📼',
    desc: 'Скретч-карты и магазин',
    setBonus: { coinPct: 0.10 },
    setBonusDesc: '+10% монет с боя',
  },
  street: {
    name: 'УЛИЦА',
    icon: '🏙',
    desc: 'Регуляры и магазин',
    setBonus: { coinPct: 0.15 },
    setBonusDesc: '+15% монет (упрощено: пока без эссенции/шардов)',
  },
};

// Стикеры. Ключи — id в коде/сейве. Порядок в каждом сете определяет позицию в гриде.
export const STICKERS = {
  // ───────── Боевики ─────────
  fist_chain:  { setId: 'fighters', name: 'Кулак с цепью',     icon: '✊', bonuses: { damagePct: 0.02 } },
  ninja:       { setId: 'fighters', name: 'Силуэт ниндзи',     icon: '🥷', bonuses: { critChance: 0.03 } },
  muscle_guy:  { setId: 'fighters', name: 'Качок в очках',     icon: '💪', bonuses: { maxHp: 30 } },
  gun_car:     { setId: 'fighters', name: 'Машина с пулемётом', icon: '🚓', bonuses: { attackSpeedPct: 0.05 } },
  pirate_flag: { setId: 'fighters', name: 'Пиратский флаг',    icon: '🏴‍☠️', bonuses: { dodgeChance: 0.02 } },

  // ───────── Тачки ─────────
  musclecar:   { setId: 'cars',     name: 'Маслкар',           icon: '🚗', bonuses: { moveSpeedPct: 0.03 } },
  ferrari:     { setId: 'cars',     name: 'Феррари',           icon: '🏎', bonuses: { attackSpeedPct: 0.05 } },
  chopper:     { setId: 'cars',     name: 'Чоппер',            icon: '🏍', bonuses: { maxHp: 50 } },
  fire_siren:  { setId: 'cars',     name: 'Пожарная сирена',   icon: '🚒', bonuses: { damagePct: 0.03 } },
  gas_can:     { setId: 'cars',     name: 'Канистра бензина',  icon: '⛽', bonuses: { damagePct: 0.05 } },

  // ───────── Спорт 80s ─────────
  rings:       { setId: 'sport',    name: 'Олимпийские кольца', icon: '🥇', bonuses: { energyRegenPct: 0.03 } },
  bat:         { setId: 'sport',    name: 'Бейсбольная бита',   icon: '🏏', bonuses: { damagePct: 0.03 } },
  gloves:      { setId: 'sport',    name: 'Бокс-перчатки',      icon: '🥊', bonuses: { critChance: 0.03 } },
  skate:       { setId: 'sport',    name: 'Скейтборд',          icon: '🛹', bonuses: { moveSpeedPct: 0.05 } },
  trainer:     { setId: 'sport',    name: 'Тренажёр',           icon: '🏋', bonuses: { xpPct: 0.05 } },

  // ───────── Музыка ─────────
  tape:        { setId: 'music',    name: 'Кассета',           icon: '📼', bonuses: { critMultiplier: 0.03 } },
  guitar:      { setId: 'music',    name: 'Гитара',            icon: '🎸', bonuses: { damagePct: 0.05 } },
  vinyl:       { setId: 'music',    name: 'Винил',             icon: '💿', bonuses: { maxHp: 30 } },
  microphone:  { setId: 'music',    name: 'Микрофон',          icon: '🎤', bonuses: { attackSpeedPct: 0.03 } },
  boombox:     { setId: 'music',    name: 'Бумбокс-мини',      icon: '📻', bonuses: { coinPct: 0.05 } },

  // ───────── Улица ─────────
  graffiti:    { setId: 'street',   name: 'Граффити',          icon: '🎨', bonuses: { coinPct: 0.05 } },
  pizza:       { setId: 'street',   name: 'Пицца',             icon: '🍕', bonuses: { hpRegenInBattlePct: 0.05 } },
  lighter:     { setId: 'street',   name: 'Зажигалка',         icon: '🔥', bonuses: { damagePct: 0.03 } },
  cap:         { setId: 'street',   name: 'Кепка задом',       icon: '🧢', bonuses: { dodgeChance: 0.03 } },
  cigar:       { setId: 'street',   name: 'Сигары',            icon: '🚬', bonuses: { damagePct: 0.05 } },
};

// Все id стикеров — для итерации и пути «выбрать случайный из недостающих».
export const ALL_STICKER_IDS = Object.keys(STICKERS);

// Стикеры конкретного сета (в порядке объявления).
export function stickerIdsInSet(setId) {
  return ALL_STICKER_IDS.filter(id => STICKERS[id].setId === setId);
}

