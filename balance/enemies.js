// Шарды теперь конфигурируются единой константой SHARD_DROP в balance/skills.js
// (perMobChance/perBossCount). В _BASE остаются только equipmentDropChance + статы.
export const ENEMY_BASE = {
  baseHp: 10,
  baseDamage: 2,
  baseAttackSpeed: 0.7,
  moveSpeed: 90,
  bodyRadius: 18,
  baseCoinDrop: 1,            // минимум — не режется
  equipmentDropChance: 0.02,
  color: '#8a7560',
  name: 'Гопник',
};

export const ELITE_BASE = {
  baseHp: 50,           // ×2 от 25 — чтобы single-target скиллы раскрывались, а не one-shot
  baseDamage: 5,
  baseAttackSpeed: 0.6,
  moveSpeed: 80,
  bodyRadius: 26,
  baseCoinDrop: 8,            // ×0.5 от 15
  equipmentDropChance: 0.25,
  color: '#9b59d4',
  name: 'Байкер',
  critChance: 0.10,
  critMultiplier: 2.0,
};

// Дальник — единственный пока ranged-враг. Бросает projectile (Молотов) с дистанции.
// Не кайтит: подходит на attackRange и стоит, бросая, даже если герой подбежал в упор.
export const RANGED_BASE = {
  baseHp: 6,
  baseDamage: 3,
  baseAttackSpeed: 0.5,    // 1 бросок ~ каждые 2 секунды
  moveSpeed: 70,
  bodyRadius: 18,
  attackRange: 220,        // на каком расстоянии встаёт и начинает бросать
  baseCoinDrop: 2,            // ×0.5 от 3 → округлено вверх
  equipmentDropChance: 0.06,
  color: '#d97706',        // оранжевый — отличить от гопника
  name: 'Дальник',
};

// Качок — медленный громила со SLAM-атакой. Перед ударом 1.5с рисует красный круг на земле
// (slamRadius); по завершении телеграфа — AOE-удар по всем внутри круга (heavy.damage).
// Knockdown отменяет замах. Hero автономен и не уходит сам — игрок должен жать KD скилл.
export const HEAVY_BASE = {
  baseHp: 100,              // ×2 от 50 — single-target скиллы должны работать, не one-shot
  baseDamage: 10,           // ×3 базы elite — серьёзная угроза если попадёт
  baseAttackSpeed: 0.4,
  moveSpeed: 60,            // самый медленный
  bodyRadius: 30,
  windupDuration: 1.5,      // длительность телеграфа (=рост круга на земле)
  slamRadius: 80,           // радиус AOE-удара. Hero почти всегда внутри (attackRadius~55 + bodyRadius)
  baseCoinDrop: 5,            // ×0.5 от 10
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
  baseHp: 10,
  baseDamage: 2,
  baseAttackSpeed: 0.6,
  moveSpeed: 65,
  bodyRadius: 17,
  baseCoinDrop: 1,            // ×0.5 от 2
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

// Подрывник — хрупкий kamikaze-враг. Бежит к герою быстрее regular'а, melee-удар на сближении,
// на 0 HP вместо мгновенной смерти стартует death-telegraph (~0.4с пульсация + жёлтый круг),
// после которого AOE-взрыв 80px radius, урон = damage × deathExplosionDmgMult.
// Defining feature: принуждение к мобильности — нельзя стоять в melee, нельзя AOE-spam'ить
// без оглядки (несколько bomber'ов в смежных позициях = цепной взрыв).
// Counter: dash в момент telegraph'а, knockback'ом скиллов отодвинуть, distance-control.
export const BOMBER_BASE = {
  baseHp: 5,                       // хрупкий — должен взорваться, не танчить
  baseDamage: 6,                   // ×3 от прошлой базы (2). Взрыв через deathExplosionDmgMult 1.5
                                   // = 9 base × loc growth. На L31 ≈ 600+ dmg/взрыв → forced dash.
  baseAttackSpeed: 0.8,
  moveSpeed: 110,                  // быстрее regular (90) — догоняет
  bodyRadius: 16,                  // мельче regular (18) — визуально хрупкий
  baseCoinDrop: 1,            // ×0.5 от 2
  equipmentDropChance: 0.07,
  color: '#d35400',                // тёмно-оранжевый — отличить от gopnika (тёплый коричневый) и heavy (тёмно-красный)
  name: 'Подрывник',
  deathExplosionDmgMult: 1.5,      // damage взрыва = damage × этот множитель (от damage той же локации)
  deathTelegraphDuration: 0.4,     // окно перед взрывом — успеть dash'ом отскочить
  slamRadius: 80,                  // радиус AOE-взрыва (как у качка SLAM)
};

export const BOSS_BASE = {
  baseHp: 100,                 // boss = baseHp × wave × enemyMul × (CHAPTER_WALL_BUMP, если финал главы)
  baseDamage: 10,
  baseAttackSpeed: 0.6,        // боссы бьют чуть чаще обычных мобов (mob = 0.7, elite = 0.6, heavy = 0.4)
  // armorPen — игнорирование части `defense` игрока при ударе босса. 0.4 = boss проходит 40% защиты.
  // Бьёт целенаправленно по танк-билдам (высокая def): мягкие билды почти не замечают.
  armorPen: 0.4,
  moveSpeed: 70,
  bodyRadius: 36,
  baseCoinDrop: 25,           // ×0.5 от 50
  equipmentDropChance: 1.0,
  energyReward: 0,             // Pure design: бой не даёт энергию, восстановление только idle
  color: '#e63946',
  name: 'Босс',
};

// Кристаллы (💎 hard currency) — premium time-savers в магазине. Источники см. core/game.js:
//   1) Дроп с любого моба: CRYSTAL_DROP_CHANCE
//   2) Финал главы (boss на L10/L20/L30/L40): CRYSTAL_CHAPTER_BOSS
//   3) Скретч-карта бара: см. balance/bar.js
export const CRYSTAL_DROP_CHANCE = 0.005;   // 0.5% базовый шанс с моба → +1💎
export const CRYSTAL_CHAPTER_BOSS = 5;      // jackpot за финал главы (L10/20/30/40)

// На какой локации заканчивается каждая глава (boss этой локации = chapter boss).
export const CHAPTER_BOSS_LOCATIONS = new Set([10, 20, 30, 40]);

export const SCALING = {
  perWaveMultiplier: 1.05,    // ~+5% за арену внутри локации (общий для всех)
};

// Финальная локация — до неё растягивается линейная интерполяция количества арен
// (arenasForLocation). Если решишь добавить L16-L20 или урезать — меняй только здесь.
//
// Заметка: pack-тиры (T4 fromLoc) и таблицы редкости дропа в equipment.js завязаны на
// абсолютные номера локаций — при сильном растяжении их тоже стоит передвинуть.
// 4 главы × 10 локаций = 40 при полном расширении. Сейчас реализованы главы 1-2 (L1-L20).
// Главы 1-4 (Город/Подземка/Клуб/Стройка), L1-L40. См. project_chapters_plan в memory.
export const FINAL_LOCATION = 40;

// ──────────────────────────────────────────────────────────────────────────
// КРИВАЯ СЛОЖНОСТИ — per-chapter exp growth + chapter wall bump.
//
// Идея:
//   • На каждую главу — один числовой regulator: «насколько за локацию растут мобы».
//   • Soft entry: первая локация новой главы использует CHAPTER_ENTRY_GROWTH (меньше CHAPTER_MOB_GROWTH),
//     даёт игроку «передышку» на переход — успеть прокачать тренажёр / собрать дроп.
//   • Босс — те же base stats (BOSS_BASE.baseHp/baseDamage) × wave × enemyMul.
//   • Финальный босс главы (L10/20/30/40) получает дополнительный CHAPTER_WALL_BUMP.
//
// Тюнинг:
//   • Гл.X в среднем жёстче → ↑ CHAPTER_MOB_GROWTH[X-1]
//   • Старт гл.X слишком резкий → ↓ CHAPTER_ENTRY_GROWTH[X-1]
//   • Стенка-финал главы тяжелее → ↑ CHAPTER_WALL_BUMP[locFinal]
//   • Все боссы (вкл. промежуточные) толще/больнее → ↑ BOSS_BASE.baseHp/baseDamage
// ──────────────────────────────────────────────────────────────────────────

// Сколько мобы растут за каждую локацию внутри главы. 1.23 = +23% к HP/DMG за локу.
// Применяется ко ВСЕМ типам врагов (regular/elite/heavy/ranged/boss) и к их damage.
// Единый рост 1.15 по всем главам — калибровано под линейную прогрессию игрока.
export const CHAPTER_MOB_GROWTH = [
  1.15,  // Гл.1 (L1-L10)  — Город
  1.15,  // Гл.2 (L11-L20) — Подземка
  1.15,  // Гл.3 (L21-L30) — Клуб
  1.15,  // Гл.4 (L31-L40) — Стройка
];

// Soft entry — множитель перехода с последней локи прошлой главы на первую новой
// (L10→L11, L20→L21, L30→L31). Меньше CHAPTER_MOB_GROWTH = плавнее переход через стенку.
// Применяется только при смене главы (не на L1, у неё нет «прошлой главы»).
export const CHAPTER_ENTRY_GROWTH = [
  null,   // Гл.1 стартует с L1, прыжка нет
  1.10,   // L10 → L11: вход в Подземку. Чтобы игрок мог докачать T3 без смертей.
  1.10,   // L20 → L21: вход в гл.3 — менее мягкий чем в гл.2, эндгейм-игрок справится
  1.20,   // L30 → L31: placeholder
];

// Дополнительный множитель только на финальном боссе главы (chapter wall feel).
// Применяется к HP и damage. Промежуточные боссы (L2-L9, L11-L19) этого бампа не получают.
// Wall bumps по главам. L10/L20 калибровано (1.1 = «впритых» для откалиброванного игрока).
// L30 1.2 — поднят т.к. real-игрок с legendary+hp% эквипом слишком комфортно проходил 1.1
// (✓91% hp пройдено, должно быть ~10-30%). Подбирается итеративно playtest'ом.
export const CHAPTER_WALL_BUMP = {
  10: 1.1,
  20: 1.1,
  30: 1.3,
  40: 1.1,
};

function chapterOf(loc) {
  return Math.min(CHAPTER_MOB_GROWTH.length - 1, Math.floor((loc - 1) / 10));
}

// Множитель силы врагов на локации L. enemyMul(1) = 1.0.
// Накопительное произведение CHAPTER_MOB_GROWTH по локациям, с подменой на CHAPTER_ENTRY_GROWTH
// при пересечении границы главы.
function enemyMul(loc) {
  let m = 1.0;
  for (let k = 2; k <= loc; k++) {
    const ch = chapterOf(k);
    const isChapterEntry = ch !== chapterOf(k - 1);
    if (isChapterEntry && CHAPTER_ENTRY_GROWTH[ch] != null) {
      m *= CHAPTER_ENTRY_GROWTH[ch];
    } else {
      m *= CHAPTER_MOB_GROWTH[ch];
    }
  }
  return m;
}

// ──────────────────────────────────────────────────────────────────────────
// LEGENDARY BOOST — отдельная механика дропа на milestone-боссах глав.
// Не имеет отношения к сложности боя, остаётся как было (используется equipment.js).
// ──────────────────────────────────────────────────────────────────────────

export const MILESTONE_LOCATIONS = [10, 20, 30, 40];

export const MILESTONE_LEGENDARY_BUMP_CURVE = {
  startMult: 3,
  endMult:   7,
  curve:     1.0,
};

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

export const MILESTONE_LEGENDARY_BOOST = distributeMilestones(MILESTONE_LOCATIONS, MILESTONE_LEGENDARY_BUMP_CURVE);

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

// Pure design: бой не даёт энергию (ни на аренах, ни на боссе).
// Восстановление энергии — только через idle (couch regen rate × time).
// Функции оставлены как заглушки для совместимости — возвращают 0.

export function arenaEnergyDrop(_locationIndex, _arenaIndex) {
  return 0;
}

export function bossEnergyDrop(_locationIndex) {
  return 0;
}

// HP/DMG множитель локации — единая кривая для всех типов мобов.
// Используется arena.js при создании врагов: stat = base × wave × enemyMul(loc).
export function enemyHpMultForLocation(loc) {
  return enemyMul(loc);
}
export function enemyDamageMultForLocation(loc) {
  return enemyMul(loc);
}

// L1-L2 — обучающий хардкод, чтобы no-skill игрок выживал гарантированно (gym разлочен только
// с L3, до этого статы не качаются; единственный source of power — L1 drop кулаков +5 dmg).
//   L1: 100 HP / 4 DMG  — разогрев, минимальная база.
//   L2: 200 HP / 5 DMG  — это BOSS_BASE.baseHp/baseDamage без масштабов, "настоящие" baseline.
// L3+ — формула: BOSS_BASE.baseHp × wave × enemyMul × (CHAPTER_WALL_BUMP, если финал главы).
// Юнит-модификаторы (scaleHp/scaleDmg от спец-арен) применяются СНАРУЖИ — это «база» босса.
export function bossStatsForLocation(locationIndex, arenaIndex) {
  if (locationIndex === 1) return { hp: 100, damage: 4 };
  if (locationIndex === 2) return { hp: 200, damage: 5 };
  const wave = Math.pow(SCALING.perWaveMultiplier, arenaIndex - 1);
  const mul  = enemyMul(locationIndex);
  const bump = CHAPTER_WALL_BUMP[locationIndex] || 1;
  return {
    hp:     BOSS_BASE.baseHp     * wave * mul * bump,
    damage: BOSS_BASE.baseDamage * wave * mul * bump,
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
// units: { kind, count, scaleHp?, scaleDmg?, scaleRadius?, scaleSpeed?, scaleRange?, wave? }
//
// wave (default 1) — ПОЗИЦИОННАЯ группа спавна, не таймер. Wave 1 спавнится ближе к точке
// входа героя, wave 2 — в глубине арены (0.80-0.95 Y). Двух-фазное столкновение: пока герой
// разбирается с близкими, дальние добегают (~2-3с со swarm-speed). Без «магического появления».
// См. randomSpawnPos в arena.js → WAVE2_SPAWN_Y_FRAC.

export const SPECIAL_ARENAS = {
  // ──────────────────────────────────────────────────────────────────────────
  // Принцип: 4 тира на пак, каждый = одна глава. Каждый переход вводит ОДНО
  // отчётливое изменение defining feature, а не «чуть-чуть больше всего».
  // Mixed_pack — единственный «всё-в-одном», прогрессия через состав.
  // ──────────────────────────────────────────────────────────────────────────
  swarm: {
    label: 'рой',
    // Defining feature: количество + скорость, хрупкие но больно бьют если не зачищать.
    // Прогрессия: count→cap (гл.1) → glass cannons (гл.2) → ВОЛНЫ (гл.3) → +bomber (гл.4).
    tiers: [
      // T1 Гл.1 (L1-L10) — intro AoE, count grow.
      { fromLoc: 1, units: [
        { kind: 'regular', count: 10, scaleHp: 0.5, scaleDmg: 0.8, scaleRadius: 0.8, scaleSpeed: 1.2 },
      ]},
      // T2 Гл.2 (L11-L20) — cap по count, glass cannons. Уже больно если не AoE'шишь.
      { fromLoc: 11, units: [
        { kind: 'regular', count: 14, scaleHp: 0.3, scaleDmg: 1.0, scaleRadius: 0.75, scaleSpeed: 1.5 },
      ]},
      // T3 Гл.3 (L21-L30) — ВОЛНЫ. Половина сразу, вторая через WAVE_DELAY_SEC.
      // Нельзя сжечь весь AoE на первую волну — иначе вторая накроет на cooldown'е.
      { fromLoc: 21, units: [
        { kind: 'regular', count: 10, scaleHp: 0.3, scaleDmg: 1.3, scaleRadius: 0.75, scaleSpeed: 1.5, wave: 1 },
        { kind: 'regular', count: 8,  scaleHp: 0.3, scaleDmg: 1.3, scaleRadius: 0.75, scaleSpeed: 1.5, wave: 2 },
      ]},
      // T4 Гл.4 (L31-L40) — волны + бомберы во второй. Зачищать осторожно, не AoE'шить в кучу bomber'ов.
      { fromLoc: 31, units: [
        { kind: 'regular', count: 10, scaleHp: 0.3, scaleDmg: 1.5, scaleRadius: 0.75, scaleSpeed: 1.5, wave: 1 },
        { kind: 'regular', count: 6,  scaleHp: 0.3, scaleDmg: 1.5, scaleRadius: 0.75, scaleSpeed: 1.5, wave: 2 },
        { kind: 'bomber',  count: 2,  wave: 2 },
      ]},
    ],
  },
  ranged_pack: {
    label: 'дальники',
    // Defining feature: объём дистанционного огня, dash-required. 2 регуляра на фронтлайне ВСЕГДА —
    // без них герой в чистом ranged-паке бегает, снаряды промахиваются по движущемуся
    // (heroSpeed 180 × duration 0.5 = 90 ед смещение vs catch radius 54).
    // Прогрессия — растяжение count по главам, на гл.4 половина ranged'ов становятся снайперами.
    tiers: [
      // T1 Гл.1 (L5-L10) — знакомство с дистанционным прессом.
      { fromLoc: 5, units: [
        { kind: 'regular', count: 2 },
        { kind: 'ranged',  count: 3 },
      ]},
      // T2 Гл.2 (L11-L20) — больше дальников. Снайперы (+20% range от chapter-skin Подземки).
      { fromLoc: 11, units: [
        { kind: 'regular', count: 2 },
        { kind: 'ranged',  count: 5 },
      ]},
      // T3 Гл.3 (L21-L30) — cap по count, молотов включён через chapter-skin Бармен.
      { fromLoc: 21, units: [
        { kind: 'regular', count: 2 },
        { kind: 'ranged',  count: 6 },
      ]},
      // T4 Гл.4 (L31-L40) — 2 снайпера среди 6 (scaleRange×1.3 → стреляют издалека).
      { fromLoc: 31, units: [
        { kind: 'regular', count: 2 },
        { kind: 'ranged',  count: 2 },
        { kind: 'ranged',  count: 4, scaleRange: 1.3 },
      ]},
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
      // T4 (L21-L25, Клуб) — больше heavy, ranged превращается в молотовщика.
      { fromLoc: 21, units: [
        { kind: 'elite',   count: 1 },
        { kind: 'heavy',   count: 2 },
        { kind: 'regular', count: 2 },
        { kind: 'healer',  count: 1 },
        { kind: 'ranged',  count: 1 },
      ]},
      // T5 (L26-L30) — пик Клуба: 2 elite + 2 heavy + 2 ranged (молотов), регуляров нет.
      { fromLoc: 26, units: [
        { kind: 'elite',   count: 2 },
        { kind: 'heavy',   count: 2 },
        { kind: 'healer',  count: 1 },
        { kind: 'ranged',  count: 2 },
      ]},
      // T6 (L31-L33, Стройка старт) — +1 bomber в состав.
      { fromLoc: 31, units: [
        { kind: 'elite',   count: 2 },
        { kind: 'heavy',   count: 2 },
        { kind: 'healer',  count: 1 },
        { kind: 'ranged',  count: 2 },
        { kind: 'bomber',  count: 1 },
      ]},
      // T7 (L34-L37) — 2 bomber'а в составе.
      { fromLoc: 34, units: [
        { kind: 'elite',   count: 2 },
        { kind: 'heavy',   count: 2 },
        { kind: 'healer',  count: 1 },
        { kind: 'ranged',  count: 2 },
        { kind: 'bomber',  count: 2 },
      ]},
      // T8 (L38-L40) — финал: +1 heavy, всё ещё 2 bomber + молотов.
      { fromLoc: 38, units: [
        { kind: 'elite',   count: 2 },
        { kind: 'heavy',   count: 3 },
        { kind: 'healer',  count: 1 },
        { kind: 'ranged',  count: 2 },
        { kind: 'bomber',  count: 2 },
      ]},
    ],
  },
  heavy_pack: {
    label: 'тяжёлая банда',
    // Defining feature: плотность telegraph'ов (KD-приоритизация). Cap=3 heavy.
    // Чистый KD-фокус. Healer добавляется с L26 как «продлеватель окон».
    tiers: [
      // T1 (L11-L17) — знакомство с качком: один telegraph, обучение KD.
      { fromLoc: 11, units: [
        { kind: 'heavy', count: 1 },
      ]},
      // T2 (L18-L25) — два качка: KD-приоритизация (какой слэм опаснее сейчас).
      { fromLoc: 18, units: [
        { kind: 'heavy', count: 2 },
      ]},
      // T3 (L26-L33) — добавляется healer: telegraph под heal-aura → нельзя «оставить недобитым».
      { fromLoc: 26, units: [
        { kind: 'heavy',  count: 2 },
        { kind: 'healer', count: 1 },
      ]},
      // T4 (L34-L40) — cap по heavy (3) + healer. Пик KD-плотности.
      { fromLoc: 34, units: [
        { kind: 'heavy',  count: 3 },
        { kind: 'healer', count: 1 },
      ]},
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
        { kind: 'ranged',  count: 2 },
      ]},
      // T3 (L25) — Клуб mid. Без новых kind'ов: усилен heavy-count (две тушки = два telegraph).
      { fromLoc: 25, units: [
        { kind: 'boss',    count: 1 },
        { kind: 'elite',   count: 2 },
        { kind: 'heavy',   count: 2 },
        { kind: 'ranged',  count: 1 },
        { kind: 'regular', count: 2 },
      ]},
      // T4 (L35) — Стройка mid. Пик плотности «всё подряд» до прихода kind'ов гл.3-4.
      { fromLoc: 35, units: [
        { kind: 'boss',    count: 1 },
        { kind: 'elite',   count: 2 },
        { kind: 'heavy',   count: 3 },
        { kind: 'ranged',  count: 2 },
        { kind: 'regular', count: 2 },
      ]},
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

// Стандартная элит-арена — чистый single-target пак, без регуляров-разбавителей.
// Прогрессия через увеличение количества элит (1→2→3), не через примешивание других kind'ов.
// Mixed_pack остаётся единственным источником «всё подряд».
function getStandardEliteUnits(loc) {
  if (loc <= 20) return [{ kind: 'elite', count: 1 }];   // Гл.1+2: single-target practice
  if (loc <= 30) return [{ kind: 'elite', count: 2 }];   // Гл.3: dual-target
  return [{ kind: 'elite', count: 3 }];                  // Гл.4: triple-target rotation
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
  25: { boss: 'boss_with_minions' },   // mid Клуба (T3) — больше heavy/elite в свите
  35: { boss: 'boss_with_minions' },   // mid Стройки (T4) — пик плотности
  // L10/L20/L30/L40 — чистые боссы глав без свиты, чтобы их механика (summon/enrage/
  // dodge/slam) читалась.
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
