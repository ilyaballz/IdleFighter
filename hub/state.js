// Хаб: энергия, тренажёры, тап-тайминг, прогресс между забегами.

import { ENERGY, TAP_ZONES, TAP_BAR, TRAINERS, TRAINER_TIERS } from '../balance/training.js';
import { HOME_UPGRADES, homeTierValue } from '../balance/home.js';

function freshTrainer() {
  const t = {
    tier: 0, // не куплен — игрок должен купить за 50 монет
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
  // Апгрейды дома (тиры). 1 = стартовый/бесплатный.
  home: { fridge: 1, couch: 1, trailer: 1 },
  // Сохранённый прогресс по локациям
  currentLocationIndex: 1,
  // Активная сессия тап-тайминга
  session: null,
};

// ───────── Эффективные значения с учётом апгрейдов дома ─────────

export function getEffectiveEnergyMax() {
  return homeTierValue('trailer', hubState.home.trailer);
}

export function getEffectiveEnergyRegenPerSec() {
  return ENERGY.recoverPerSec * homeTierValue('couch', hubState.home.couch);
}

export function getEffectiveFatigueRecoverPerHour() {
  return homeTierValue('fridge', hubState.home.fridge);
}

// ───────── Энергия / зоны: пассивные тики ─────────

export function recoverEnergy(dt) {
  const cap = getEffectiveEnergyMax();
  hubState.energy = Math.min(cap, hubState.energy + getEffectiveEnergyRegenPerSec() * dt);
}

export function recoverGreenZones(dt) {
  const perSec = getEffectiveFatigueRecoverPerHour() / 3600;
  for (const stat of Object.keys(hubState.trainers)) {
    const t = hubState.trainers[stat];
    if (t.fatigue > 0) {
      t.fatigue = Math.max(0, t.fatigue - perSec * dt);
      recomputeWidths(t);
    }
  }
}

// ───────── Дом: апгрейды ─────────

export function getHomeBuildingInfo(buildingId) {
  const up = HOME_UPGRADES[buildingId];
  if (!up) return null;
  const tier = hubState.home[buildingId];
  const tierIdx = tier - 1;
  const cur = up.tiers[tierIdx];
  const next = up.tiers[tierIdx + 1] || null;
  return {
    id: buildingId,
    name: up.name,
    icon: up.icon,
    desc: up.desc,
    bonusUnit: up.bonusUnit,
    tier,
    maxTier: up.tiers.length,
    currentValue: cur.value,
    nextValue: next ? next.value : null,
    nextNutCost: next ? next.nutCost : null,
    isMaxTier: !next,
  };
}

// walletDeduce(cost) — кошелёк гаек (см. core/game.js → onHomeUpgrade).
export function tryUpgradeHome(buildingId, walletDeduce) {
  const up = HOME_UPGRADES[buildingId];
  if (!up) return false;
  const tier = hubState.home[buildingId];
  const next = up.tiers[tier];
  if (!next) return false;
  if (!walletDeduce(next.nutCost)) return false;
  hubState.home[buildingId]++;
  return true;
}

// ───────── Тренажёры ─────────

// Hero-level provider (DI чтобы избежать циклического импорта core/stats_layer.js → hub/state.js).
// core/game.js при старте делает bindHeroStatLevelProvider((stat) => heroState.levels[stat]).
let heroStatLevelProvider = () => 0;
export function bindHeroStatLevelProvider(fn) { heroStatLevelProvider = fn; }

export function getTrainerStatMultiplier(stat) {
  const t = hubState.trainers[stat];
  if (!t) return 0;
  return TRAINER_TIERS[t.tier].statMultiplier;
}

export function getTrainerLevelCap(stat) {
  const t = hubState.trainers[stat];
  if (!t) return 0;
  return TRAINER_TIERS[t.tier].levelCap;
}

export function isStatAtCap(stat) {
  return heroStatLevelProvider(stat) >= getTrainerLevelCap(stat);
}

export function getTrainerInfo(stat) {
  const t = hubState.trainers[stat];
  // TRAINER_TIERS теперь индексируется напрямую по tier (tier 0 = locked).
  const tier = TRAINER_TIERS[t.tier];
  const next = TRAINER_TIERS[t.tier + 1] || null;
  const meta = TRAINERS[stat];
  const heroLvl = heroStatLevelProvider(stat);
  // canUpgradeTier — выполнено ли требование по уровню для покупки следующего тира.
  // upgradeRequiresLevel — какой уровень стата нужен (null для T0→T1 и MAX-тира).
  const canUpgradeTier = next ? heroLvl >= tier.levelCap : false;
  const upgradeRequiresLevel = (next && t.tier > 0) ? tier.levelCap : null;
  return {
    stat,
    name: meta.name,
    icon: meta.icon,
    tier: t.tier,
    xpPerTap: tier.xpPerTap,
    statMultiplier: tier.statMultiplier,
    levelCap: tier.levelCap,
    heroLevel: heroLvl,
    atCap: heroLvl >= tier.levelCap && t.tier > 0,
    nextTierCost: next ? next.upgradeCost : null,
    nextTierMultiplier: next ? next.statMultiplier : null,
    nextTierCap: next ? next.levelCap : null,
    canUpgradeTier,
    upgradeRequiresLevel,
    isMaxTier: !next,
    isLocked: t.tier === 0,
    greenWidth: t.greenWidth,
    yellowWidth: t.yellowWidth,
  };
}

// walletDeduce(cost) → true если списали успешно.
// Гейтинг: апгрейд тира доступен только после достижения cap'а текущего тира
// (исключение — T0→T1, где cap=0 и проверка тривиально пройдёт). Это убирает shortcut
// «накопил монет → перепрыгнул несколько тиров», заставляя тапать каждый тир.
export function tryUpgradeTrainer(stat, walletDeduce) {
  const t = hubState.trainers[stat];
  const next = TRAINER_TIERS[t.tier + 1];
  if (!next) return false;
  const currentCap = TRAINER_TIERS[t.tier].levelCap;
  if (heroStatLevelProvider(stat) < currentCap) return false;
  if (!walletDeduce(next.upgradeCost)) return false;
  t.tier++;
  return true;
}

// ───────── Сессия тап-тайминга ─────────

export function startTrainingSession(stat) {
  if (hubState.session) return false;
  const t = hubState.trainers[stat];
  if (t.tier === 0) return false; // не куплен
  if (heroStatLevelProvider(stat) >= TRAINER_TIERS[t.tier].levelCap) return false; // cap достигнут
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
    t.tier = 0;
    t.fatigue = 0;
    recomputeWidths(t);
  }
  hubState.home = { fridge: 1, couch: 1, trailer: 1 };
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

// Слои бара (для отрисовки и hit-detection). Каждый слой центрирован, ширины независимы.
// red — всегда total; yellow — t.yellowWidth; green — t.greenWidth.
export function computeZones(stat) {
  const t = hubState.trainers[stat];
  const total = TAP_BAR.totalWidth;
  const greenW  = t.greenWidth;
  const yellowW = t.yellowWidth;
  const greenStart  = (total - greenW)  / 2;
  const yellowStart = (total - yellowW) / 2;
  return {
    total,
    greenStart,  greenEnd:  greenStart  + greenW,
    yellowStart, yellowEnd: yellowStart + yellowW,
  };
}

// Hit-detection top-down: green → yellow → red.
export function getCursorZone(stat) {
  if (!hubState.session) return null;
  const z = computeZones(stat);
  const c = hubState.session.cursor;
  if (z.greenEnd  > z.greenStart  && c >= z.greenStart  && c <= z.greenEnd)  return 'green';
  if (z.yellowEnd > z.yellowStart && c >= z.yellowStart && c <= z.yellowEnd) return 'yellow';
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
  // Накапливаем усталость только если ещё есть что сужать. Если зелёная и жёлтая уже на 0
  // (тапы только в красной), fatigue замораживается — иначе он рос бы впустую и удлинял recovery.
  if (t.greenWidth > 0 || t.yellowWidth > 0) {
    t.fatigue += 1;
    recomputeWidths(t);
  }

  const xp = TRAINER_TIERS[t.tier].xpPerTap;
  const leveledUp = addStatXpFn(s.stat, xp);
  s.leveledUp = leveledUp;

  // Если допрыгнули до cap'а — завершаем сессию, дальнейшие тапы ничего не дадут.
  const capReached = heroStatLevelProvider(s.stat) >= TRAINER_TIERS[t.tier].levelCap;
  if (capReached) {
    hubState.session = null;
    return { zone, energySpent: energyCost, xpGain: xp, leveledUp, sessionEnded: true, capReached: true };
  }

  // Сессия больше не ограничена количеством тапов — заканчивается только по нехватке энергии.
  return { zone, energySpent: energyCost, xpGain: xp, leveledUp, sessionEnded: false };
}
