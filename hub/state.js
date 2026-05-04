// Хаб: энергия, тренажёры, тап-тайминг, прогресс между забегами.

import { ENERGY, TAP_ZONES, TAP_BAR, TRAINERS, TRAINER_TIERS } from '../balance/training.js';

function freshTrainer() {
  const t = {
    tier: 1,
    fatigue: 0,
    greenWidth: TAP_BAR.baseGreenWidth,
    yellowWidth: TAP_BAR.baseYellowWidth,
  };
  recomputeWidths(t);
  return t;
}

// Скорость убывания зон растёт с fatigue (см. TAP_BAR в balance/training.js).
function recomputeWidths(t) {
  const f = t.fatigue;
  const greenShrink  = f * TAP_BAR.greenBaseShrink  + TAP_BAR.greenAccel  * f * (f - 1) / 2;
  const yellowShrink = f * TAP_BAR.yellowBaseShrink + TAP_BAR.yellowAccel * f * (f - 1) / 2;
  t.greenWidth  = Math.max(0, TAP_BAR.baseGreenWidth - greenShrink);
  t.yellowWidth = Math.max(0, TAP_BAR.baseYellowWidth - yellowShrink);
}

export const hubState = {
  energy: ENERGY.startAmount,
  trainers: {
    strength:  freshTrainer(),
    toughness: freshTrainer(),
    agility:   freshTrainer(),
  },
  // Сохранённый прогресс по локациям
  currentLocationIndex: 1,
  // Активная сессия тап-тайминга
  session: null,
};

// ───────── Энергия / зоны: пассивные тики ─────────

export function recoverEnergy(dt) {
  hubState.energy = Math.min(ENERGY.maxCap, hubState.energy + ENERGY.recoverPerSec * dt);
}

export function recoverGreenZones(dt) {
  const perSec = TAP_BAR.fatigueRecoverPerHour / 3600;
  for (const stat of Object.keys(hubState.trainers)) {
    const t = hubState.trainers[stat];
    if (t.fatigue > 0) {
      t.fatigue = Math.max(0, t.fatigue - perSec * dt);
      recomputeWidths(t);
    }
  }
}

// ───────── Тренажёры ─────────

export function getTrainerInfo(stat) {
  const t = hubState.trainers[stat];
  const tierIdx = t.tier - 1;
  const tier = TRAINER_TIERS[tierIdx];
  const next = TRAINER_TIERS[tierIdx + 1] || null;
  const meta = TRAINERS[stat];
  return {
    stat,
    name: meta.name,
    icon: meta.icon,
    tier: t.tier,
    xpPerTap: tier.xpPerTap,
    nextTierCost: next ? next.upgradeCost : null,
    isMaxTier: !next,
    greenWidth: t.greenWidth,
    yellowWidth: t.yellowWidth,
  };
}

// walletDeduce(cost) → true если списали успешно
export function tryUpgradeTrainer(stat, walletDeduce) {
  const t = hubState.trainers[stat];
  const tierIdx = t.tier - 1;
  const next = TRAINER_TIERS[tierIdx + 1];
  if (!next) return false;
  if (!walletDeduce(next.upgradeCost)) return false;
  t.tier++;
  return true;
}

// ───────── Сессия тап-тайминга ─────────

export function startTrainingSession(stat) {
  if (hubState.session) return false;
  if (hubState.energy < ENERGY.trainerEntryCost) return false;
  hubState.energy -= ENERGY.trainerEntryCost;
  hubState.session = {
    stat,
    cursor: 0,
    cursorDir: 1,
    tapsTotal: 0,
    lastTapZone: null,
    lastTapAt: 0,
    leveledUp: false,
  };
  return true;
}

export function endTrainingSession() {
  hubState.session = null;
}

export function resetHubState() {
  hubState.energy = ENERGY.startAmount;
  for (const t of Object.values(hubState.trainers)) {
    t.tier = 1;
    t.fatigue = 0;
    recomputeWidths(t);
  }
  hubState.currentLocationIndex = 1;
  hubState.session = null;
}

export function updateSession(dt) {
  const s = hubState.session;
  if (!s) return;
  s.cursor += s.cursorDir * TAP_BAR.cursorSpeed * dt;
  if (s.cursor >= TAP_BAR.totalWidth) {
    s.cursor = TAP_BAR.totalWidth;
    s.cursorDir = -1;
  } else if (s.cursor <= 0) {
    s.cursor = 0;
    s.cursorDir = 1;
  }
}

// Зоны для отрисовки (в единицах TAP_BAR.totalWidth)
export function computeZones(stat) {
  const t = hubState.trainers[stat];
  const greenW = t.greenWidth;
  const yellowEachSide = t.yellowWidth / 2;
  const total = TAP_BAR.totalWidth;
  const greenStart = (total - greenW) / 2;
  const greenEnd = greenStart + greenW;
  const yellowLeftStart = Math.max(0, greenStart - yellowEachSide);
  const yellowRightEnd  = Math.min(total, greenEnd + yellowEachSide);
  return {
    total,
    greenStart, greenEnd,
    yellowLeftStart, yellowLeftEnd: greenStart,
    yellowRightStart: greenEnd, yellowRightEnd,
  };
}

export function getCursorZone(stat) {
  if (!hubState.session) return null;
  const z = computeZones(stat);
  const c = hubState.session.cursor;
  if (c >= z.greenStart && c <= z.greenEnd) return 'green';
  if ((c >= z.yellowLeftStart && c < z.yellowLeftEnd) ||
      (c > z.yellowRightStart && c <= z.yellowRightEnd)) return 'yellow';
  return 'red';
}

// Возвращает: { zone, energySpent, xpGain, leveledUp, sessionEnded } или { failed: true }
export function performTap(addStatXpFn, timeNow) {
  const s = hubState.session;
  if (!s) return null;
  const zone = getCursorZone(s.stat);
  const energyCost = TAP_ZONES[zone].energyCost;
  if (hubState.energy < energyCost) {
    hubState.session = null;
    return { failed: true, reason: 'no_energy' };
  }
  hubState.energy -= energyCost;
  s.tapsTotal++;
  s.lastTapZone = zone;
  s.lastTapAt = timeNow;
  const t = hubState.trainers[s.stat];
  // Накапливаем усталость; ширины зон вычисляются формулой.
  t.fatigue += 1;
  recomputeWidths(t);

  const xp = TRAINER_TIERS[t.tier - 1].xpPerTap;
  const leveledUp = addStatXpFn(s.stat, xp);
  s.leveledUp = leveledUp;

  // Сессия больше не ограничена количеством тапов — заканчивается только по нехватке энергии.
  return { zone, energySpent: energyCost, xpGain: xp, leveledUp, sessionEnded: false };
}
