export const ENEMY_BASE = {
  baseHp: 14,
  baseDamage: 2.5,
  baseAttackSpeed: 0.7,
  moveSpeed: 90,
  bodyRadius: 18,
  baseCoinDrop: 1,
  shardDropChance: 0.01,
  equipmentDropChance: 0.02,
  color: '#8a7560',
  name: 'Гопник',
};

export const ELITE_BASE = {
  baseHp: 60,
  baseDamage: 5,
  baseAttackSpeed: 0.6,
  moveSpeed: 80,
  bodyRadius: 26,
  baseCoinDrop: 15,
  shardDropChance: 0.10,
  equipmentDropChance: 0.25,
  color: '#9b59d4',
  name: 'Байкер',
  critChance: 0.10,
  critMultiplier: 2.0,
};

// Дальник — единственный пока ranged-враг. Бросает projectile (Молотов) с дистанции.
// Не кайтит: подходит на attackRange и стоит, бросая, даже если герой подбежал в упор.
export const RANGED_BASE = {
  baseHp: 16,
  baseDamage: 4,
  baseAttackSpeed: 0.5,    // 1 бросок ~ каждые 2 секунды
  moveSpeed: 70,
  bodyRadius: 18,
  attackRange: 220,        // на каком расстоянии встаёт и начинает бросать
  baseCoinDrop: 3,
  shardDropChance: 0.04,
  equipmentDropChance: 0.06,
  color: '#d97706',        // оранжевый — отличить от гопника
  name: 'Дальник',
};

// Качок — медленный громила со SLAM-атакой. Перед ударом 1.5с рисует красный круг на земле
// (slamRadius); по завершении телеграфа — AOE-удар по всем внутри круга (heavy.damage).
// Knockdown отменяет замах. Hero автономен и не уходит сам — игрок должен жать KD скилл.
export const HEAVY_BASE = {
  baseHp: 80,
  baseDamage: 12,           // ×3 базы elite — серьёзная угроза если попадёт
  baseAttackSpeed: 0.4,
  moveSpeed: 60,            // самый медленный
  bodyRadius: 30,
  windupDuration: 1.5,      // длительность телеграфа (=рост круга на земле)
  slamRadius: 80,           // радиус AOE-удара. Hero почти всегда внутри (attackRadius~55 + bodyRadius)
  baseCoinDrop: 10,
  shardDropChance: 0.08,
  equipmentDropChance: 0.15,
  color: '#c0392b',         // тёмно-красный
  name: 'Качок',
};

// Лекарь — supporter-враг. Стоит позади, испускает aura-радиус, в котором каждую секунду
// хилит союзников (и себя). Сам хрупкий — низкое HP, почти не дерётся. Counter: single-target
// burst (hook/cut/spinkick), чтобы выбить из роя и убить быстро.
//
// Поле `aura` — универсальная схема для саппортов (см. battle.js tickAuras).
// Для будущих типов (баффер, негативная аура и т.п.) меняется только `effect` + `power`.
export const HEALER_BASE = {
  baseHp: 12,
  baseDamage: 2,
  baseAttackSpeed: 0.6,
  moveSpeed: 65,
  bodyRadius: 17,
  baseCoinDrop: 2,
  shardDropChance: 0.03,
  equipmentDropChance: 0.04,
  color: '#5be35b',           // зелёный — тематика хила
  name: 'Лекарь',
  aura: {
    radius: 100,
    tickSec: 1.0,
    effect: 'heal',
    // Сила хила в % от maxHp цели — скейлится автоматически с типом врага.
    // На L11 regular (~100 HP) → +10, elite (~440 HP) → +44, heavy (~580 HP) → +58.
    powerPct: 0.10,
    color: '#5be35b',
  },
};

export const BOSS_BASE = {
  baseAttackSpeed: 0.5,
  moveSpeed: 70,
  bodyRadius: 36,
  baseCoinDrop: 50,
  shardDropChance: 1.0,
  equipmentDropChance: 1.0,
  energyReward: 30,            // +⚡ в хабе при убийстве — гарантирует апгрейд после локации
  color: '#e63946',
  name: 'Босс',
  // damageMultiplier теперь живёт в BOSS_DAMAGE_CURVE (по умолчанию плоский ×2.0).
};

export const SCALING = {
  perWaveMultiplier: 1.05,    // ~+5% за арену внутри локации (общий для всех)
};

// Финальная локация — до неё растягиваются power-кривые сложности (BOSS_HP_CURVE, BOSS_DAMAGE_CURVE).
// Если решишь добавить L16-L20 (или урезать до L10) — меняй только здесь, и кривые автоматически
// перенацеливаются. Exp-кривые (ENEMY_HP/DAMAGE_CURVE) не зависят от FINAL_LOCATION — они растут
// экспоненциально без явного пика.
//
// Заметка: pack-тиры (T4 fromLoc) и таблицы редкости дропа в equipment.js пока завязаны на абсолютные
// номера локаций — если будешь сильно растягивать игру, их тоже стоит передвинуть пропорционально.
// 4 главы × 10 локаций = 40 при полном расширении. Сейчас реализованы главы 1-2 (L1-L20).
// Главы 3-4 — в отдельной сессии (см. project_chapters_plan в memory).
export const FINAL_LOCATION = 20;

// ──────────────────────────────────────────────────────────────────────────
// КРИВЫЕ СЛОЖНОСТИ — единая «крутилка баланса» по локациям.
//
// evaluateCurve поддерживает два режима. Подбирай тот, что лучше ложится на твой контент:
//
//   mode: 'exp'   — startMult × growthRate^(loc - startLocation), без крутого cap'а.
//                   Хорош для unbounded прогрессии «idle-стиля» (мобы растут с каждой локой).
//                   Опционально: endMult клампит сверху.
//
//   mode: 'power' — startMult + (endMult - startMult) × t^curve
//                   где t = clamp((loc - startLocation) / (endLocation - startLocation), 0, 1).
//                   Bounded — у кривой явный пик. curve управляет формой:
//                     curve = 1.0 → линейно
//                     curve > 1.0 → медленный старт, ускорение к концу (концентрация в late)
//                     curve < 1.0 → быстрый старт, плавное затухание к концу
//                   Хорош для боссов и любых «контролируемых» прогрессий.
//
// Примеры тюнинга:
//   • Хочешь чтобы L1-L7 ощущался как «комфорт-зона», а сложность бьёт в late? Power, curve > 2.
//   • Хочешь резкую кривую но с плато на L15? Exp + endMult.
//   • Хочешь снизить общую сложность? Уменьши endMult (power) или growthRate (exp).
// ──────────────────────────────────────────────────────────────────────────

function evaluateCurve(c, loc) {
  let value;
  if (c.mode === 'exp') {
    value = c.startMult * Math.pow(c.growthRate, Math.max(0, loc - c.startLocation));
    if (c.endMult != null) value = Math.min(c.endMult, value);
  } else {
    // power (default)
    const span = c.endLocation - c.startLocation;
    if (span <= 0) {
      value = c.endMult;
    } else {
      const t = Math.max(0, Math.min(1, (loc - c.startLocation) / span));
      value = c.startMult + (c.endMult - c.startMult) * Math.pow(t, c.curve);
    }
  }
  // Per-loc spike: на конкретных локациях значение домножается на bump.
  // Влияет только на эту локу, соседние не задеваются — это «boss-wall» паттерн.
  // Композится с любым mode ('exp' или 'power'), ортогональная фича.
  if (c.locationBumps && c.locationBumps[loc] != null) {
    value *= c.locationBumps[loc];
  }
  return value;
}

// HP всех мобов (regular/elite/heavy/ranged + база босса до бонусного множителя).
// growthRate растянут под 20 локаций: финальный множитель ×48 (vs ~50 у L15 при 1.3).
// L1=×1, L5=×2.2, L10=×6.0, L15=×16, L20=×48.
export const ENEMY_HP_CURVE = {
  mode: 'exp',
  startLocation: 1,
  startMult:     1.0,
  growthRate:    1.22,
};

// Damage всех мобов — зеркалит HP.
export const ENEMY_DAMAGE_CURVE = {
  mode: 'exp',
  startLocation: 1,
  startMult:     1.0,
  growthRate:    1.22,
};

// ──────────────────────────────────────────────────────────────────────────
// MILESTONE-ЛОКИ («boss-walls»)
// Один список локаций + три кривые силы бампа: HP, damage, legendary boost.
// Сила бампа интерполируется по индексу milestone'а (0=первый, N-1=последний),
// а не по локации — то есть curve управляет «насколько ранние milestone-боссы мягче поздних».
// ──────────────────────────────────────────────────────────────────────────

// Один milestone на конец каждой главы — это финальный босс главы.
// Главы 1-2: L10 (Авторитет, Город), L20 (Машинист, Подземка).
// При реализации глав 3-4 — добавить 30, 40.
export const MILESTONE_LOCATIONS = [10, 20];

// Bump к hpMult босса: первый milestone мягкий, последний — жёсткий.
// При 2 milestones [10, 20]: L10 = 1.10, L20 = 1.5 — финальный босс главы 2 ощутимо толще.
export const MILESTONE_HP_BUMP_CURVE = {
  startMult: 1.10,
  endMult:   1.5,
  curve:     1.0,
};

// Bump к damage босса.
export const MILESTONE_DAMAGE_BUMP_CURVE = {
  startMult: 1.10,
  endMult:   1.5,
  curve:     1.0,
};

// Аддитивный бонус к weight'у legendary в bossRarityWeights — также по кривой.
export const MILESTONE_LEGENDARY_BUMP_CURVE = {
  startMult: 3,
  endMult:   7,
  curve:     1.0,
};

// Раздаёт значения кривой по индексу milestone'а: возвращает map { loc: value }.
function distributeMilestones(locs, curve) {
  const out = {};
  if (locs.length === 0) return out;
  if (locs.length === 1) { out[locs[0]] = curve.endMult; return out; }
  for (let i = 0; i < locs.length; i++) {
    const t = i / (locs.length - 1);
    out[locs[i]] = curve.startMult + (curve.endMult - curve.startMult) * Math.pow(t, curve.curve);
  }
  return out;
}

const HP_BUMPS  = distributeMilestones(MILESTONE_LOCATIONS, MILESTONE_HP_BUMP_CURVE);
const DMG_BUMPS = distributeMilestones(MILESTONE_LOCATIONS, MILESTONE_DAMAGE_BUMP_CURVE);
export const MILESTONE_LEGENDARY_BOOST = distributeMilestones(MILESTONE_LOCATIONS, MILESTONE_LEGENDARY_BUMP_CURVE);

// HP-мультипликатор босса поверх ENEMY_HP_CURVE. L1 — хардкод (100 hp), кривая с L2.
// locationBumps — derived из MILESTONE_HP_BUMP_CURVE + MILESTONE_LOCATIONS.
export const BOSS_HP_CURVE = {
  mode: 'power',
  startLocation: 2,
  endLocation:   FINAL_LOCATION,
  startMult:     10,
  endMult:       25,
  curve:         0.5,
  locationBumps: HP_BUMPS,
};

// Damage-мультипликатор босса поверх ENEMY_DAMAGE_CURVE.
export const BOSS_DAMAGE_CURVE = {
  mode: 'power',
  startLocation: 1,
  endLocation:   FINAL_LOCATION,
  startMult:     2.0,
  endMult:       2.0,
  curve:         0.5,
  locationBumps: DMG_BUMPS,
};

// Гайки 🔩 — валюта Дома (отделена от монет тренажёров).
// Сплит 60/40 (босс/арена): TOTAL_NUT = bossBonus + sum(arenaDrops). Игрок получает свою долю
// гаек даже без победы над боссом — «застрял на стенке» больше не означает «0 прогресса».
// Total per location = 1 + floor(loc/2) (как было раньше до сплита), просто перераспределён.
//
// Правило: каждая 3-я не-боссовая арена даёт 1 гайку. L1-L2 без арена-дропа (обучение).
// L20: 4 арена-гайки (A3,A6,A9,A12) + 7 с босса = 11. Не дошёл до босса → 4 вместо 11.

const ARENA_NUT_DROP_INTERVAL = 3;

function nutDropArenaCount(locationIndex) {
  if (locationIndex <= 2) return 0;
  const arenas = arenasForLocation(locationIndex);
  const nonBoss = Math.max(0, arenas - 1);
  return Math.floor(nonBoss / ARENA_NUT_DROP_INTERVAL);
}

// Дроп с зачищенной арены (не-боссовой). Вызывается в game.js при `onArenaCleared`.
export function arenaNutDrop(locationIndex, arenaIndex) {
  if (locationIndex <= 2) return 0;
  const arenas = arenasForLocation(locationIndex);
  if (arenaIndex === arenas) return 0;                              // boss-арена не считается
  if (arenaIndex % ARENA_NUT_DROP_INTERVAL !== 0) return 0;
  return 1;
}

// Бонус за победу над боссом — остаток после сплита.
export function bossNutDrop(locationIndex) {
  const total = 1 + Math.floor(locationIndex / 2);
  return Math.max(1, total - nutDropArenaCount(locationIndex));
}

// Бонус энергии за зачищенную арену (не-боссовую). Часть от 30 ⚡ финала локации.
const ARENA_ENERGY_DROP_INTERVAL = 3;
const ARENA_ENERGY_DROP_VALUE = 2;

export function arenaEnergyDrop(locationIndex, arenaIndex) {
  if (locationIndex <= 2) return 0;
  const arenas = arenasForLocation(locationIndex);
  if (arenaIndex === arenas) return 0;
  if (arenaIndex % ARENA_ENERGY_DROP_INTERVAL !== 0) return 0;
  return ARENA_ENERGY_DROP_VALUE;
}

// Бонус энергии с босса — total 30 минус арена-распределение.
export function bossEnergyDrop(locationIndex) {
  if (locationIndex <= 2) return 30;
  const arenas = arenasForLocation(locationIndex);
  const nonBoss = Math.max(0, arenas - 1);
  const arenaTotal = Math.floor(nonBoss / ARENA_ENERGY_DROP_INTERVAL) * ARENA_ENERGY_DROP_VALUE;
  return Math.max(0, 30 - arenaTotal);
}

export function enemyHpMultForLocation(loc) {
  return evaluateCurve(ENEMY_HP_CURVE, loc);
}
export function enemyDamageMultForLocation(loc) {
  return evaluateCurve(ENEMY_DAMAGE_CURVE, loc);
}
export function bossHpMultiplierForLocation(loc) {
  if (loc <= 1) return 1; // L1 хардкоднут отдельно
  return evaluateCurve(BOSS_HP_CURVE, loc);
}
export function bossDamageMultiplierForLocation(loc) {
  return evaluateCurve(BOSS_DAMAGE_CURVE, loc);
}

// L1 — обучающий хардкод (босс HP 100 / DMG 4), чтобы первый забег без прокачки был проходим.
// L2+ — формула: база Гопника × wave × ENEMY_*_CURVE × BOSS_*_CURVE.
// Юнит-модификаторы (scaleHp/scaleDmg от спец-арен) применяются СНАРУЖИ — это «база» босса.
export function bossStatsForLocation(locationIndex, arenaIndex) {
  if (locationIndex === 1) {
    return { hp: 100, damage: 4 };
  }
  const wave        = Math.pow(SCALING.perWaveMultiplier, arenaIndex - 1);
  const enemyHpMul  = enemyHpMultForLocation(locationIndex);
  const enemyDmgMul = enemyDamageMultForLocation(locationIndex);
  const bossHpMul   = bossHpMultiplierForLocation(locationIndex);
  const bossDmgMul  = bossDamageMultiplierForLocation(locationIndex);
  return {
    hp:     ENEMY_BASE.baseHp     * wave * enemyHpMul  * bossHpMul,
    damage: ENEMY_BASE.baseDamage * wave * enemyDmgMul * bossDmgMul,
  };
}

export const LOCATION_STRUCTURE = {
  // Длина локации растёт с L1 (arenasAtStart) до FINAL_LOCATION (arenasAtFinal) линейно.
  // Кол-во арен интерполируется и округляется — см. arenasForLocation.
  arenasAtStart: 5,
  arenasAtFinal: 15,
  enemiesPerArena: {
    base: 2,                     // первая арена локации = 2 врага (ease-in)
    growthPerArena: 0.2,         // дальше плавно растёт по аренам
    // cap теперь функция от локации — см. regularEnemyCap(locationIndex).
  },
  eliteArenaInterval: 3,
};

// Cap количества регуляров на арене — растёт с локацией. base=2 + рост по аренам ограничен этим.
// L1: лёгкое начало (3 макс). L2-3: стандарт (4). L4+: тяжелее (5).
export function regularEnemyCap(locationIndex) {
  if (locationIndex <= 1) return 3;
  if (locationIndex <= 3) return 4;
  return 5;
}

// Линейная интерполяция от arenasAtStart (L1) до arenasAtFinal (FINAL_LOCATION).
// Если расширишь FINAL_LOCATION — пик автоматически сдвинется.
export function arenasForLocation(locationIndex) {
  const ls = LOCATION_STRUCTURE;
  if (locationIndex <= 1) return ls.arenasAtStart;
  if (locationIndex >= FINAL_LOCATION) return ls.arenasAtFinal;
  const t = (locationIndex - 1) / (FINAL_LOCATION - 1);
  const range = ls.arenasAtFinal - ls.arenasAtStart;
  return Math.round(ls.arenasAtStart + range * t);
}

// ───────── Спец-арены ─────────
// Каждая стандартная арена при генерации может быть заменена на спец-вариант:
//   regular → swarm, elite → mixed_pack, boss → boss_with_minions.
// Шанс растёт с локации: L1 — без замен (обучение), далее линейно до cap.

export const SPECIAL_SPAWN = {
  startFromLocation: 3,         // L1-L2 без твистов — обучение core-механикам
  startChance: 0.10,            // L3 = 10%
  perLocationIncrement: 0.05,   // +5% за локацию (плавный рост 10% → 60% за 10 локаций)
  maxChance: 0.60,              // cap на L13+
};

export function specialSpawnChance(locationIndex) {
  if (locationIndex < SPECIAL_SPAWN.startFromLocation) return 0;
  const steps = locationIndex - SPECIAL_SPAWN.startFromLocation;
  return Math.min(
    SPECIAL_SPAWN.maxChance,
    SPECIAL_SPAWN.startChance + steps * SPECIAL_SPAWN.perLocationIncrement
  );
}

// Спец-арены — тематические паки с **жёсткими cap'ами** по count и эскалацией через профиль.
// Принцип: каждый pack-тип сохраняет свою идентичность даже на пике. Mixed_pack — единственный
// «всё подряд», специально оставлен как контраст. См. project_chapters_plan в memory.
//
// pickTier выбирает самый высокий тир, для которого loc >= fromLoc. Тиры сквозные между
// главами — не перезапускаются.
//
// Cap'ы по архетипам:
//   swarm:       14 регуляров (после cap'а — speed↑ + hp↓: молниеноснее, но мрут с 1-2 хитов)
//   ranged_pack: 6 дальников (после cap'а — range↑: бьют издалека, труднее догнать)
//   heavy_pack:  4 тяжёлых (после cap'а — только с новым kind в гл. 3+)
//   mixed_pack:  ~7 юнитов (состав варьируется, размер — нет)
//
// units: { kind, count, scaleHp?, scaleDmg?, scaleRadius?, scaleSpeed?, scaleRange? }
export const SPECIAL_ARENAS = {
  // ──────────────────────────────────────────────────────────────────────────
  // Принцип прогрессии всех паков: ~5 локаций на тир, границы привязаны к
  // финалам глав (L10/L20). Каждый тир усиливает ОПРЕДЕЛЯЮЩУЮ фичу пака,
  // а не плодит чужие kind'ы. Cap'ы по count держим — после них эскалация
  // через профиль (speed/range/role-mixology).
  // Тиры L1-L20 реализованы здесь. T5+ для глав 3-4 (Клуб/Стройка) —
  // см. project_chapters_plan.md, добавятся вместе с новыми kind'ами
  // (Лекарь, Щитоносец, Берсерк, Подрывник).
  // ──────────────────────────────────────────────────────────────────────────
  swarm: {
    label: 'рой',
    // Defining feature: количество + скорость (хрупкие). После cap=14 — speed↑, hp↓.
    tiers: [
      // T1 (L1-L5, видим с L3 = unlock) — знакомство, рой как «много мелких».
      { fromLoc: 1, units: [
        { kind: 'regular', count: 6, scaleHp: 0.6, scaleDmg: 0.7, scaleRadius: 0.85 },
      ]},
      // T2 (L6-L10) — стандарт Города, рой быстрее и больше.
      { fromLoc: 6, units: [
        { kind: 'regular', count: 10, scaleHp: 0.5, scaleDmg: 0.7, scaleRadius: 0.8, scaleSpeed: 1.2 },
      ]},
      // T3 (L11-L15) — упираемся в cap (14), Подземка делает их стремительнее.
      { fromLoc: 11, units: [
        { kind: 'regular', count: 14, scaleHp: 0.4, scaleDmg: 0.7, scaleRadius: 0.78, scaleSpeed: 1.3 },
      ]},
      // T4 (L16-L20) — пик Подземки: speed×1.5, hp×0.3 — мрут с одного хита AOE, но окружают за секунды.
      { fromLoc: 16, units: [
        { kind: 'regular', count: 14, scaleHp: 0.3, scaleDmg: 0.7, scaleRadius: 0.75, scaleSpeed: 1.5 },
      ]},
      // T5+ (L21+, главы 3-4) — +Лекарь (Клуб), +Берсерк/Подрывник (Стройка).
    ],
  },
  ranged_pack: {
    label: 'дальники',
    // Defining feature: объём дистанционного огня. 2 регуляра на фронтлайне ВСЕГДА —
    // без них герой в чистом ranged-паке бегает, снаряды промахиваются по движущемуся
    // (heroSpeed 180 × duration 0.5 = 90 ед смещение vs catch radius 54).
    // После cap=6 ranged — добавятся роли в гл. 3+ (Лекарь, Подрывник).
    tiers: [
      // T1 (L5-L10) — знакомство с дистанционным прессом.
      { fromLoc: 5, units: [
        { kind: 'regular', count: 2 },
        { kind: 'ranged',  count: 3 },
      ]},
      // T2 (L11-L15) — вход в Подземку. Снайперы (+20% range от chapter-skin).
      { fromLoc: 11, units: [
        { kind: 'regular', count: 2 },
        { kind: 'ranged',  count: 5 },
      ]},
      // T3 (L16-L20) — пик Подземки, cap по count (6).
      { fromLoc: 16, units: [
        { kind: 'regular', count: 2 },
        { kind: 'ranged',  count: 6 },
      ]},
      // T4+ (L21+) — + Лекарь, + Подрывник (главы 3-4).
    ],
  },
  mixed_pack: {
    label: 'банда',
    // Defining feature: разнообразие угроз (комплекс известных kind'ов).
    // Прогрессия — добавление новых типов, потом увеличение их количества.
    tiers: [
      // T1 (L7-L10) — базовый комплекс: элита + регуляры + дистанционник.
      { fromLoc: 7, units: [
        { kind: 'elite',   count: 1 },
        { kind: 'regular', count: 2 },
        { kind: 'ranged',  count: 1 },
      ]},
      // T2 (L11-L15) — вход в Подземку: банда впитывает heavy и Лекаря.
      // Лекарь — новый kind, тикает heal-aura союзникам в радиусе → принуждение к single-target burst.
      { fromLoc: 11, units: [
        { kind: 'elite',   count: 1 },
        { kind: 'heavy',   count: 1 },
        { kind: 'regular', count: 2 },
        { kind: 'healer',  count: 1 },
        { kind: 'ranged',  count: 1 },
      ]},
      // T3 (L16-L20) — пик Подземки: больше элит, heavy, и 1 Лекарь поддерживает.
      { fromLoc: 16, units: [
        { kind: 'elite',   count: 2 },
        { kind: 'heavy',   count: 1 },
        { kind: 'regular', count: 2 },
        { kind: 'healer',  count: 1 },
        { kind: 'ranged',  count: 1 },
      ]},
      // T4+ (L21+) — + Щитоносец (Клуб), + Берсерк, + Подрывник (Стройка).
    ],
  },
  heavy_pack: {
    label: 'тяжёлая банда',
    // Defining feature: плотность telegraph'ов (KD-приоритизация). Cap=3 heavy.
    // После cap — добавится Щитоносец (heavy kind, гл. 3+).
    tiers: [
      // T1 (L11-L13) — знакомство с качком: один telegraph, можно спокойно учиться обходить.
      { fromLoc: 11, units: [
        { kind: 'heavy', count: 1 },
      ]},
      // T2 (L14-L17) — telegraph под огнём: ranged заставляет двигаться, нельзя просто отойти.
      { fromLoc: 14, units: [
        { kind: 'heavy',  count: 2 },
        { kind: 'ranged', count: 1 },
      ]},
      // T3 (L18-L20) — пик: cap (3) + ranged + Лекарь продлевает telegraph-окна.
      { fromLoc: 18, units: [
        { kind: 'heavy',  count: 3 },
        { kind: 'ranged', count: 1 },
        { kind: 'healer', count: 1 },
      ]},
      // T4+ (L21+) — + Щитоносец (Клуб), + Подрывник (Стройка).
    ],
  },
  boss_with_minions: {
    label: 'БОСС+банда',
    // Спавн только force'ом на локациях кратных 5 (L5/L15/L25/L35), но НЕ кратных 10 —
    // L10/L20/L30/L40 заняты чистыми боссами глав со своей механикой (CHAPTER_BOSSES),
    // их специально не разбавляем бандой, чтобы summon/enrage читались.
    // Из random-промоушена boss_with_minions исключён (см. availablePacksFor).
    tiers: [
      // T1 (L5) — Город mid. Знакомство со свитой: босс + 3 мелких регуляра.
      { fromLoc: 5, units: [
        { kind: 'boss',    count: 1 },
        { kind: 'regular', count: 3, scaleHp: 0.5, scaleDmg: 0.8, scaleRadius: 0.9 },
      ]},
      // T2 (L15) — Подземка mid. Свита впитывает heavy и ranged.
      { fromLoc: 15, units: [
        { kind: 'boss',    count: 1 },
        { kind: 'elite',   count: 1 },
        { kind: 'heavy',   count: 1 },
        { kind: 'ranged',  count: 1 },
        { kind: 'regular', count: 2 },
      ]},
      // T3+ (L25, L35) — добавятся вместе с главами 3-4 (Клуб/Стройка).
    ],
  },
};

// Helper — выбор актуального тира по локации.
function pickTier(tiers, loc) {
  let chosen = tiers[0];
  for (const t of tiers) {
    if (loc >= t.fromLoc) chosen = t;
  }
  return chosen;
}

export function getSpecialArenaUnits(typeName, loc) {
  const def = SPECIAL_ARENAS[typeName];
  if (!def) return [];
  return pickTier(def.tiers, loc).units;
}

// Стандартная элит-арена (вне спец-замены) — узнаваемый паттерн «1 толстый + мясо».
// Раньше на L8+ она становилась «кашей» (elite+heavy+regular+ranged), что дублировало mixed_pack
// и стирало её идентичность. Теперь — только элита + регуляры. Mixed_pack остаётся единственным
// источником «всё подряд», арена-каждой-третьей сохраняет тематический паттерн.
function getStandardEliteUnits(loc) {
  if (loc <= 2) return [{ kind: 'elite', count: 1 }];
  if (loc <= 7) return [{ kind: 'elite', count: 1 }, { kind: 'regular', count: 2 }];
  return [{ kind: 'elite', count: 1 }, { kind: 'regular', count: 3 }];
}

// Подписи арен для UI (HUD, label на канвасе)
const ARENA_TYPE_LABELS = {
  boss: 'БОСС',
  boss_with_minions: 'БОСС+банда',
  elite: 'элита',
  mixed_pack: 'банда',
  swarm: 'рой',
  ranged_pack: 'дальники',
  heavy_pack: 'тяжёлая банда',
  regular: '',
};

export function arenaTypeLabel(type) {
  return ARENA_TYPE_LABELS[type] || '';
}

// ───────── Композиция арены ─────────

// Детерминированная (без рандома) — используется симулятором для предсказуемой модели.
// Возвращает { type, units: [{kind, count, scale*?}] }.
// Уважает FORCED_PACK_SPAWNS: на обучающих локациях принудительный пак стоит выше стандартного типа.
export function getArenaComposition(arenaIndex, locationIndex) {
  const { enemiesPerArena, eliteArenaInterval } = LOCATION_STRUCTURE;
  const arenasPerLocation = arenasForLocation(locationIndex);
  const isBossArena = arenaIndex === arenasPerLocation;

  const forced = getForcedPackType(locationIndex, arenaIndex, isBossArena);
  if (forced) {
    return { type: forced, units: getSpecialArenaUnits(forced, locationIndex) };
  }

  if (isBossArena) {
    return { type: 'boss', units: [{ kind: 'boss', count: 1 }] };
  }
  if (arenaIndex % eliteArenaInterval === 0) {
    return { type: 'elite', units: getStandardEliteUnits(locationIndex) };
  }
  const count = Math.min(
    regularEnemyCap(locationIndex),
    Math.ceil(enemiesPerArena.base + enemiesPerArena.growthPerArena * (arenaIndex - 1))
  );
  return { type: 'regular', units: [{ kind: 'regular', count }] };
}

// Возвращает forced pack-тип для обучающей локации или null.
function getForcedPackType(locationIndex, arenaIndex, isBossArena) {
  const slot = FORCED_PACK_SPAWNS[locationIndex];
  if (!slot) return null;
  if (isBossArena && slot.boss) return slot.boss;
  return slot[arenaIndex] || null;
}

// Расписание открытия пак-типов: новый паттерн раз в 2 локации, чтобы игрок успел освоить
// каждый перед следующим, и чтобы кадр совпадал с гача-выпадениями скиллов.
// До unlock'а пак-тип не появляется в random-замене, даже если specialSpawnChance > 0.
// FORCED_PACK_SPAWNS работает поверх и не зависит от unlock — это детерминированный онбординг.
//
// Главы:
//   гл.1 (L1-L10, Город): swarm → ranged_pack → mixed_pack → boss_with_minions
//   гл.2 (L11-L20, Подземка): + heavy_pack (новый kind «качок» = главная угроза подземки)
export const PACK_UNLOCK_LOCATION = {
  swarm:             3,
  ranged_pack:       5,
  mixed_pack:        7,
  // boss_with_minions: только force на L5/L15/L25/L35, из random-промоушена исключён
  // (см. availablePacksFor). Значение здесь — документация «где впервые появляется».
  boss_with_minions: 5,
  heavy_pack:        11,
};

// Детерминированные «обучающие» встречи: первый раз новый паттерн появляется на фиксированной
// арене конкретной локации, гарантированно — чтобы игрок познакомился с ним сразу после
// получения соответствующего скилла, а не зависел от specialSpawnChance.
//
// Формат: { [locationIndex]: { [arenaIndex|'boss']: 'pack_type' } }
//   arenaIndex — конкретный номер арены (1-based).
//   'boss' — последняя арена локации (boss-арена), без привязки к её номеру.
//
// На локациях без force включается обычная randomness через rollArenaComposition.
export const FORCED_PACK_SPAWNS = {
  2:  { 2: 'swarm' },                  // только что получили roundkick — применяем AOE против роя
  5:  { 2: 'ranged_pack',              // только что получили dash — догоняем дальников
        boss: 'boss_with_minions' },   // mid-главы: знакомство со свитой босса (T1)
  7:  { 2: 'mixed_pack' },             // банда как комплекс известных угроз
  11: { 2: 'heavy_pack' },             // вход в Подземку — сразу знакомство с heavy
  15: { boss: 'boss_with_minions' },   // mid Подземки: банда + heavy (T2)
  // L10/L20 — чистые боссы глав (Авторитет/Машинист) без свиты, чтобы summon/enrage читались.
  // L25/L35 — добавятся при реализации глав 3-4.
};

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ═══════════════════════════════════════════════════════════════════════════
// Pity-система для спавна спец-арен.
//
// Два уровня:
//   1) specChance pity — за каждую «сухую» арену (где спец-пак не выпал) прирост к
//      эффективному шансу +Δ. После пака — сброс. Гарантирует что игрок не получит
//      длинную полосу обычных регуляр-арен.
//   2) Pack-type weighting — каждый pack-тип имеет вес. После выпадения вес тут же
//      падает до RECENT_WEIGHT (0.2), за каждую арену регенерится на REGEN
//      (0.2/арену), кап CAP (2.0). Типы которые давно не появлялись стартуют ×2
//      по отношению к недавно выпавшему — выбор взвешенный.
//
// Сбрасывается в начале каждой локации через resetArenaPity (вызов из core/game.js
// в startLocation). Forced паки тоже учитываются — иначе обучающие L2/L5/L7 ломали
// бы статистику.
// ═══════════════════════════════════════════════════════════════════════════

export const PITY = {
  specDryIncrement:  0.40,   // +40% к шансу за каждую сухую арену
  packRecentWeight:  0.20,   // вес сразу после выпадения
  packRegenPerArena: 0.20,   // +0.20 за каждую арену (back to 1.0 за 4 арены)
  packWeightBase:    1.0,    // целевой/стартовый вес
  packWeightCap:     2.0,    // максимум при долгой засухе
};

const _pity = {
  specChance: 0,             // накопленный прирост к specialSpawnChance
  packWeights: {},           // packType → вес
};

export function resetArenaPity() {
  _pity.specChance = 0;
  _pity.packWeights = {};
}

function getPackWeight(packType) {
  if (_pity.packWeights[packType] == null) _pity.packWeights[packType] = PITY.packWeightBase;
  return _pity.packWeights[packType];
}

function regenAllPackWeights() {
  for (const k of Object.keys(_pity.packWeights)) {
    _pity.packWeights[k] = Math.min(PITY.packWeightCap, _pity.packWeights[k] + PITY.packRegenPerArena);
  }
}

function pickPackByWeight(types) {
  const weights = types.map(getPackWeight);
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return types[Math.floor(Math.random() * types.length)];
  let r = Math.random() * total;
  for (let i = 0; i < types.length; i++) {
    r -= weights[i];
    if (r <= 0) return types[i];
  }
  return types[types.length - 1];
}

// Возвращает массив пак-типов, доступных для замены данного base.type на данной локации.
// Пустой массив → замены не будет (base композиция остаётся).
function availablePacksFor(baseType, loc) {
  const u = PACK_UNLOCK_LOCATION;
  if (baseType === 'regular') {
    const opts = [];
    if (loc >= u.swarm)       opts.push('swarm');
    if (loc >= u.ranged_pack) opts.push('ranged_pack');
    return opts;
  }
  if (baseType === 'elite') {
    const opts = [];
    if (loc >= u.mixed_pack) opts.push('mixed_pack');
    if (loc >= u.heavy_pack) opts.push('heavy_pack');
    return opts;
  }
  // boss → boss_with_minions из random'а исключён: банда вокруг босса спавнится только
  // force'ом на L5/L15/L25/L35, а на L10/L20/L30/L40 боссы глав должны быть в чистом виде.
  return [];
}

export function rollArenaComposition(arenaIndex, locationIndex) {
  // Каждая арена «тикает» регенерацию pack-весов независимо от исхода.
  regenAllPackWeights();

  const base = getArenaComposition(arenaIndex, locationIndex);
  const arenasPerLocation = arenasForLocation(locationIndex);
  const isBossArena = arenaIndex === arenasPerLocation;
  const forcedType = getForcedPackType(locationIndex, arenaIndex, isBossArena);
  if (forcedType) {
    // Forced-пак тоже считается «выпадением» — сбрасываем specChance pity и пенализируем тип.
    _pity.specChance = 0;
    _pity.packWeights[forcedType] = PITY.packRecentWeight;
    return base;
  }

  // Эффективный шанс = база + накопленный pity. Капается на 1.0.
  const baseChance = specialSpawnChance(locationIndex);
  const effectiveChance = Math.min(1.0, baseChance + _pity.specChance);
  if (Math.random() >= effectiveChance) {
    _pity.specChance += PITY.specDryIncrement;
    return base;
  }

  const opts = availablePacksFor(base.type, locationIndex);
  if (opts.length === 0) {
    // Нет доступных паков для этого base — обнулять pity не за что, продолжаем копить.
    return base;
  }
  const replacementType = pickPackByWeight(opts);
  _pity.specChance = 0;
  _pity.packWeights[replacementType] = PITY.packRecentWeight;
  return { type: replacementType, units: getSpecialArenaUnits(replacementType, locationIndex) };
}
