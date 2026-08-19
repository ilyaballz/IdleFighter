// Единый источник иконок и подписей статов. Чтобы урон/HP/защита и т.д. выглядели
// ОДИНАКОВО во всех местах (скиллы, предметы, гардероб, стат-панель хаба).
//
// Здесь только иконка + лейбл (общая часть). Само число форматируется по месту —
// контексты разные: аффикс «+12», эффективный стат «1 240», процент «+8.5%».
// Любой новый показ стата должен брать иконку/лейбл ОТСЮДА, а не хардкодить.

export const STAT_META = {
  damage:         { icon: '⚔', label: 'УРОН' },
  damagePct:      { icon: '⚔', label: 'УРОН %' },
  maxHp:          { icon: '❤', label: 'HP' },
  maxHpPct:       { icon: '❤', label: 'HP %' },
  defense:        { icon: '🛡', label: 'ЗАЩИТА' },
  critChance:     { icon: '✨', label: 'КРИТ' },
  critMultiplier: { icon: '💥', label: 'МУЛ.КРИТ' },
  attackSpeed:    { icon: '⚡', label: 'СК.АТК' },
  attackSpeedPct: { icon: '⚡', label: 'СК.АТК' },
  dodgeChance:    { icon: '💨', label: 'УВОРОТ' },
  skillCdrPct:    { icon: '⏳', label: 'CDR' },
  hpRegen:        { icon: '💚', label: 'РЕГЕН' },
};
