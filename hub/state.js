// Хаб: энергия, тренажёры, тап-тайминг, прогресс между забегами.

import { ENERGY, TAP_ZONES, TAP_BAR, FATIGUE, TRAINERS, TRAINER_TIERS } from '../balance/training.js';
import { HOME_UPGRADES, homeTierValue, homeCoffeeTtlBonus } from '../balance/home.js';
import { evaluateMilestones, newlyReachedMilestones } from '../balance/milestones.js';
import { getStickerBonus } from '../core/stickers_state.js';

function freshTrainer() {
  const t = {
    tier: 0, // не куплен — игрок должен купить за 50 монет
    fatigue: 0,
    lifetimeTaps: 0,    // persistent счётчик тапов для milestone-системы (см. balance/milestones.js)
    greenWidth: TAP_BAR.baseGreenWidth,
    yellowWidth: TAP_BAR.baseYellowWidth,
  };
  recomputeWidths(t);
  return t;
}

// Скорость убывания зон растёт с fatigue (см. FATIGUE в balance/training.js).
// Тир тренажёра даёт fatigueResist: чем выше тир, тем мягче убывают зоны.
function recomputeWidths(t) {
  const f = t.fatigue;
  const resist = TRAINER_TIERS[t.tier]?.fatigueResist ?? 1;
  const greenShrink  = resist * (f * FATIGUE.greenBaseShrink  + FATIGUE.greenAccel  * f * (f - 1) / 2);
  const yellowShrink = resist * (f * FATIGUE.yellowBaseShrink + FATIGUE.yellowAccel * f * (f - 1) / 2);
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
  home: { fridge: 1, couch: 1, trailer: 1, coffee: 1 },
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
  return ENERGY.recoverPerSec * homeTierValue('couch', hubState.home.couch) * (1 + getStickerBonus('energyRegenPct'));
}

export function getEffectiveFatigueRecoverPerHour() {
  return FATIGUE.recoverPerHour * homeTierValue('fridge', hubState.home.fridge);
}

// Шанс спавна «золотой зоны» **на каждый тап** (не per-sec) для конкретного тренажёра.
// Привязка к тапу, а не к таймеру, чтобы игрок не мог «выждать» зону без расхода энергии —
// награда даётся за активную игру, а не за паузу.
// Формула: base(milestones по lifetimeTaps этого тренажёра) × coffeeMult(тир Кофеварки в Доме).
export function getGoldenZoneChancePerTap(stat) {
  const t = hubState.trainers[stat];
  if (!t) return 0;
  const base = evaluateMilestones(t.lifetimeTaps).chance;
  if (base <= 0) return 0;
  return base * homeTierValue('coffee', hubState.home.coffee);
}

// Дефолт ширины и времени жизни золотой зоны на тап-баре.
// ttl должен быть достаточным чтобы игрок успел отреагировать ~2 проходами курсора.
// width — % бара (totalWidth=100). Curser speed=120 → окно width/120 сек. 12% → 100мс.
// Кофеварка добавляет ttlBonus (см. balance/home.js), milestone — widthMult.
// endingThreshold — за сколько секунд до исчезновения зона начинает мигать.
export const GOLDEN_ZONE = { width: 12, ttl: 2.5, endingThreshold: 0.7 };

// Бонус к TTL золотой зоны от текущего тира Кофеварки (применяется и к первичному спавну, и к каскаду).
export function getGoldenZoneTtlBonus() {
  return homeCoffeeTtlBonus(hubState.home.coffee);
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

// Дискретный возврат свежести за зачистку локации. Применяется ко всем трём
// тренажёрам, масштабируется текущим темпом холодильника (его прокачка усиливает
// и пассивный тик, и этот возврат). Возвращает 0, если ни один тренажёр не был усталым.
export function applyLocationClearFatigueRefund() {
  const fridgeMult = homeTierValue('fridge', hubState.home.fridge);
  const refund = FATIGUE.locationClearRefund * fridgeMult;
  let applied = false;
  for (const stat of Object.keys(hubState.trainers)) {
    const t = hubState.trainers[stat];
    if (t.fatigue > 0) {
      t.fatigue = Math.max(0, t.fatigue - refund);
      recomputeWidths(t);
      applied = true;
    }
  }
  return applied ? refund : 0;
}

// ───────── Дом: апгрейды ─────────

// Проверка разлочки постройки. Для большинства — гейт по локации (unlockLocation).
// Coffee — особый случай: открывается когда любой тренажёр взял первый milestone Golden Tap'a
// (100 lifetimeTaps). До этого фича бесполезна — golden zone в принципе не появляется.
function isHomeBuildingUnlockedLive(buildingId) {
  if (buildingId === 'coffee') {
    return Object.values(hubState.trainers).some(t => evaluateMilestones(t.lifetimeTaps).unlocked);
  }
  const up = HOME_UPGRADES[buildingId];
  if (!up) return false;
  return hubState.currentLocationIndex >= (up.unlockLocation || 1);
}

function homeUnlockHint(buildingId) {
  if (buildingId === 'coffee') return 'после 100 повторений на тренажёре';
  const up = HOME_UPGRADES[buildingId];
  return up?.unlockLocation ? `L${up.unlockLocation}` : null;
}

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
    isUnlocked: isHomeBuildingUnlockedLive(buildingId),
    unlockHint: homeUnlockHint(buildingId),
  };
}

// walletDeduce(cost) — кошелёк гаек (см. core/game.js → onHomeUpgrade).
export function tryUpgradeHome(buildingId, walletDeduce) {
  const up = HOME_UPGRADES[buildingId];
  if (!up) return false;
  if (!isHomeBuildingUnlockedLive(buildingId)) return false;   // ещё не разлочено
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
    lifetimeTaps: t.lifetimeTaps,
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
  // Новый fatigueResist меняет визуальную ширину зон при той же fatigue.
  recomputeWidths(t);
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
    // Золотая зона: { x, width, ttl } | null. Спавнится в performTap по шансу из milestones × Кофеварка.
    goldenZone: null,
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
    t.lifetimeTaps = 0;
    recomputeWidths(t);
  }
  hubState.home = { fridge: 1, couch: 1, trailer: 1, coffee: 1 };
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
  // Tick golden zone: только уменьшение ttl. Спавн — внутри performTap (по шансу с тапа).
  if (s.goldenZone) {
    s.goldenZone.ttl -= dt;
    if (s.goldenZone.ttl <= 0) s.goldenZone = null;
  }
}

function isCursorInGoldenZone(s) {
  const g = s?.goldenZone;
  if (!g) return false;
  return s.cursor >= g.x && s.cursor <= g.x + g.width;
}

// Спавнит золотую зону в рандомной позиции, если она ещё не активна.
// Вызывается из performTap после обычного (non-golden) тапа.
// Ширина зоны масштабируется milestone'ом width_mult, TTL получает бонус от Кофеварки.
function maybeSpawnGoldenZone(s) {
  if (s.goldenZone) return;
  const chance = getGoldenZoneChancePerTap(s.stat);
  if (chance <= 0) return;
  if (Math.random() >= chance) return;
  const t = hubState.trainers[s.stat];
  const widthMult = evaluateMilestones(t.lifetimeTaps).widthMult;
  const width = GOLDEN_ZONE.width * widthMult;
  const maxX = Math.max(0, TAP_BAR.totalWidth - width);
  s.goldenZone = {
    x: Math.random() * maxX,
    width,
    ttl: GOLDEN_ZONE.ttl + getGoldenZoneTtlBonus(),
  };
}

// Каскад мультитапа: после попадания в Golden — с шансом multitapChance спавним новую зону
// шириной consumedWidth × multitapWidthMult В ПРОТИВОПОЛОЖНОЙ половине бара относительно курсора
// (чтобы не была сразу под курсором — гарантированно «в другом месте»).
// Цепочка может продолжаться: новый Golden тоже может скаскадить дальше. Ширина убывает ×0.6 каждый шаг.
function trySpawnMultitapCascade(s, consumedWidth) {
  const t = hubState.trainers[s.stat];
  const ms = evaluateMilestones(t.lifetimeTaps);
  if (ms.multitapChance <= 0) return;
  if (Math.random() >= ms.multitapChance) return;
  const newWidth = Math.max(2, consumedWidth * ms.multitapWidthMult);   // floor 2% — не превращаться в пиксель
  const total = TAP_BAR.totalWidth;
  const half = total / 2;
  // Курсор в левой половине → спавн в правой, и наоборот.
  let xMin, xMax;
  if (s.cursor < half) {
    xMin = half;
    xMax = Math.max(half, total - newWidth);
  } else {
    xMin = 0;
    xMax = Math.max(0, half - newWidth);
  }
  // Если зона не помещается в выбранную половину (слишком широкая для половины) — fallback на полный диапазон.
  if (xMax <= xMin) {
    xMin = 0;
    xMax = Math.max(0, total - newWidth);
  }
  s.goldenZone = {
    x: xMin + Math.random() * (xMax - xMin),
    width: newWidth,
    ttl: GOLDEN_ZONE.ttl + getGoldenZoneTtlBonus(),
  };
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

// Возвращает: { zone, energySpent, xpGain, leveledUp, sessionEnded, milestones? } или { failed: true }
// Если cursor попал в активную golden-зону — особый кейс: zone='golden', energySpent=0,
// fatigue не накапливается, XP как зелёная × milestone xpMult. Зона потребляется (one-shot).
// milestones — массив свежедостигнутых milestone-объектов (для toast'ов в UI).
export function performTap(addStatXpFn, timeNow) {
  const s = hubState.session;
  if (!s) return null;
  const t = hubState.trainers[s.stat];

  // Golden zone: бесплатный успешный тап.
  if (isCursorInGoldenZone(s)) {
    const consumedWidth = s.goldenZone.width;
    s.goldenZone = null;
    s.tapsTotal++;
    const prevLifetime = t.lifetimeTaps;
    t.lifetimeTaps++;
    s.lastTapZone = 'golden';
    s.lastTapAt = timeNow;
    const xpMult = evaluateMilestones(t.lifetimeTaps).xpMult;
    const xp = Math.round(TRAINER_TIERS[t.tier].xpPerTap * xpMult);
    const leveledUp = addStatXpFn(s.stat, xp);
    s.leveledUp = leveledUp;
    const milestones = newlyReachedMilestones(prevLifetime, t.lifetimeTaps);
    // Мультитап-каскад: если разлочен (10000 тапов на этом тренажёре) — с шансом спавнит
    // новую зону меньшей ширины в противоположной половине бара. Цепочка может продолжаться.
    trySpawnMultitapCascade(s, consumedWidth);
    const cascade = !!s.goldenZone;
    const capReached = heroStatLevelProvider(s.stat) >= TRAINER_TIERS[t.tier].levelCap;
    if (capReached) {
      hubState.session = null;
      return { zone: 'golden', energySpent: 0, xpGain: xp, leveledUp, sessionEnded: true, capReached: true, milestones, cascade };
    }
    return { zone: 'golden', energySpent: 0, xpGain: xp, leveledUp, sessionEnded: false, milestones, cascade };
  }

  const zone = getCursorZone(s.stat);
  const energyCost = TAP_ZONES[zone].energyCost;
  if (hubState.energy < energyCost) {
    hubState.session = null;
    return { failed: true, reason: 'no_energy' };
  }
  hubState.energy -= energyCost;
  s.tapsTotal++;
  const prevLifetime = t.lifetimeTaps;
  t.lifetimeTaps++;
  s.lastTapZone = zone;
  s.lastTapAt = timeNow;
  // Накапливаем усталость только если ещё есть что сужать. Если зелёная и жёлтая уже на 0
  // (тапы только в красной), fatigue замораживается — иначе он рос бы впустую и удлинял recovery.
  if (t.greenWidth > 0 || t.yellowWidth > 0) {
    t.fatigue += 1;
    recomputeWidths(t);
  }

  const xp = TRAINER_TIERS[t.tier].xpPerTap;
  const leveledUp = addStatXpFn(s.stat, xp);
  s.leveledUp = leveledUp;

  // Шанс заспавнить золотую зону на следующий тап — только после обычного тапа.
  // (После golden-тапа спавна нет: зона только что съедена, новой ждём до следующего тапа.)
  maybeSpawnGoldenZone(s);

  const milestones = newlyReachedMilestones(prevLifetime, t.lifetimeTaps);

  // Если допрыгнули до cap'а — завершаем сессию, дальнейшие тапы ничего не дадут.
  const capReached = heroStatLevelProvider(s.stat) >= TRAINER_TIERS[t.tier].levelCap;
  if (capReached) {
    hubState.session = null;
    return { zone, energySpent: energyCost, xpGain: xp, leveledUp, sessionEnded: true, capReached: true, milestones };
  }

  // Сессия больше не ограничена количеством тапов — заканчивается только по нехватке энергии.
  return { zone, energySpent: energyCost, xpGain: xp, leveledUp, sessionEnded: false, milestones };
}
