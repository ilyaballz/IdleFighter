// Per-trainer milestones — late-фича, освежающая ценность тренажёра после освоения.
// Каждый тренажёр копит свои lifetimeTaps (см. hub/state.js), бонусы тоже per-trainer.
// До 100 тапов на тренажёре Golden Tap там не появляется — обычная тап-сессия.
//
// Эффекты копятся: каждый достигнутый milestone добавляет свой эффект к итоговому.
// Перерасчёт — evaluateMilestones(taps). UI берёт reachedMilestones() для бейджей
// и nextMilestone() для прогресс-бара.
//
// Кофеварка (home.coffee) — внешний множитель к шансу Golden Tap поверх milestone-базы.

// База Golden Tap после первой разлочки и параметры эскалации.
const GOLDEN_BASE_CHANCE   = 0.05;  // 5% после 100 тапов на этом тренажёре
const GOLDEN_XP_MULT       = 1.5;   // ×1.5 XP за золотую зону после 500
const GOLDEN_WIDTH_MULT    = 1.5;   // ×1.5 ширина зоны после 2000
const MULTITAP_CHANCE      = 0.35;  // 35% шанс каскада после 10000
const MULTITAP_WIDTH_MULT  = 0.6;   // ×0.6 ширина каскадной зоны от текущей (chain убывает)

// Лесенка milestones (per-trainer lifetimeTaps): 100 / 500 / 2000 / 10000.
// Шанс появления Golden — только Кофеваркой в Доме (см. balance/home.js).
// Milestones даёт «качественные» апгрейды + капстоун-мультитап.
export const TRAINER_MILESTONES = [
  { taps: 100,   key: 'unlock',     icon: '☕', label: 'Golden Tap',
    desc: `Шанс золотой зоны ${Math.round(GOLDEN_BASE_CHANCE * 100)}% с каждого тапа` },
  { taps: 500,   key: 'xp_mult',    icon: '✨', label: 'XP-буст',
    desc: `Золотая зона даёт ×${GOLDEN_XP_MULT} XP` },
  { taps: 2000,  key: 'width_mult', icon: '📏', label: 'Шире',
    desc: `Золотая зона ×${GOLDEN_WIDTH_MULT} шире — легче поймать` },
  { taps: 10000, key: 'multitap',   icon: '🔗', label: 'Мультитап',
    desc: `Попадание в Golden даёт ${Math.round(MULTITAP_CHANCE * 100)}% шанс мгновенно спавнить ещё одну зону шириной ×${MULTITAP_WIDTH_MULT}` },
];

// Возвращает { unlocked, chance, xpMult, widthMult, multitapChance, multitapWidthMult }
// для заданного числа тапов. chance — база (Кофеварка домножает снаружи).
export function evaluateMilestones(taps) {
  let chance = 0;
  let xpMult = 1;
  let widthMult = 1;
  let multitapChance = 0;
  let multitapWidthMult = 1;
  let unlocked = false;
  for (const m of TRAINER_MILESTONES) {
    if (taps < m.taps) break;
    switch (m.key) {
      case 'unlock':     unlocked = true; chance = GOLDEN_BASE_CHANCE; break;
      case 'xp_mult':    xpMult *= GOLDEN_XP_MULT; break;
      case 'width_mult': widthMult *= GOLDEN_WIDTH_MULT; break;
      case 'multitap':   multitapChance = MULTITAP_CHANCE; multitapWidthMult = MULTITAP_WIDTH_MULT; break;
    }
  }
  return { unlocked, chance, xpMult, widthMult, multitapChance, multitapWidthMult };
}

export function reachedMilestones(taps) {
  return TRAINER_MILESTONES.filter(m => taps >= m.taps);
}

export function nextMilestone(taps) {
  return TRAINER_MILESTONES.find(m => taps < m.taps) || null;
}

// Сравнивает старый и новый счётчик тапов — возвращает все milestones, перейдённые
// в этом тапе (обычно 0 или 1). Используется для celebration-toast.
export function newlyReachedMilestones(prevTaps, nextTaps) {
  return TRAINER_MILESTONES.filter(m => prevTaps < m.taps && nextTaps >= m.taps);
}
