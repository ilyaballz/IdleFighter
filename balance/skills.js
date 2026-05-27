// Скиллы будут активны на Этапе 2. В Этапе 1 файл существует как часть контракта.

// Cap уровня прокачки скиллов. Дальше tryUpgradeSkill отказывает.
// На MAX_SKILL_LEVEL у каждого скилла открывается l10-перк — уникальная фишка,
// усиливающая нишу скилла. Параметры перка хранятся в поле `l10` у определения.
// Включение перка читается через lvl >= MAX_SKILL_LEVEL в battle/battle.js.
export const MAX_SKILL_LEVEL = 10;

// CDR работает по rate-модели (см. battle/battle.js skillCooldownAfterCdr):
//   effCD = baseCD / (1 + total_rate)
// total_rate = global (от шмоток+перков) + local (от уровня скилла, через cdRateBonusPerLvl)
// Diminishing returns встроен — кап не нужен. Стэкать всегда полезно, но всё менее эффективно.

export const SKILLS = {
  hook: {
    name: 'Хук',
    activation: 'cooldown',
    baseCooldown: 4.0,
    targetType: 'single',
    baseDamageMultiplier: 2.0,
    // Marked applier: помечает цель на N секунд → её приоритизируют slam/dash, по ней spinkick бьёт сильнее.
    appliesMarkedSec: 5,
    // Self-consumer: повторный хук по уже помеченной цели — +20% урона. marked-window (5с) >
    // cd (4с) → стенд-элоун стак-loop по одной цели: hook ×2.0 → hook ×2.4 → ×2.4...
    bonusVsMarkedPct: 0.2,
    levelBonusPerLvl: 0.15,
    cdRateBonusPerLvl: 0.10,
    // L10: marked-стак на цели. Каждый повторный hook = +1 stack (cap 5).
    // ВСЕ источники урона по помеченной цели получают +N% × stacks (через dealDamage).
    l10: { markedStackBonusPct: 0.10, markedStackMax: 5 },
  },
  cut: {
    name: 'Рассечение',
    activation: 'cooldown',
    baseCooldown: 6.0,
    targetType: 'single',
    baseDamageMultiplier: 1.0,
    // Bleed как бинарный тег: цель кровит / не кровит.
    // duration > baseCooldown → DoT непрерывно перекрывается при ритм-касте.
    dot: { damagePctPerSec: 0.40, durationSec: 7.0 },
    levelBonusPerLvl: 0.15,
    cdRateBonusPerLvl: 0.10,
    // L10: каждый тик DoT может крит — шанс/мульт со статов игрока (включая баффы).
    l10: { dotCanCrit: true },
  },
  spinkick: {
    name: 'Вертушка с разворота',
    activation: 'cooldown',
    baseCooldown: 5.0,
    targetType: 'single',
    baseDamageMultiplier: 2.0,
    bonusCritChance: 0.50,
    // Marked consumer: по помеченной цели — +60% урона.
    bonusVsMarkedPct: 0.6,
    // Финишер: гарантированный крит по цели с HP < 50%. Делает spinkick execute-инструментом —
    // в волне с DoT/auto-атаками вертушка добивает с критом, отделяет нишу от hook/double_strike.
    forceCritIfBelowHpPct: 0.50,
    // Knockdown — single-target CC, кладёт цель на 0.8с (× lvlMult).
    // Синергии: открывает +60% урона по лежачему для Раунд-кика и +25% для Слэма.
    // На качке отменяет windup. На L10 длительность = 0.8 × (1+9×0.15) = 1.88с.
    knockdownSec: 0.8,
    levelBonusPerLvl: 0.15,
    cdRateBonusPerLvl: 0.10,
    // L10: killing blow → CD сбрасывается в 0 (chain-режим при добивающих ударах).
    l10: { resetCdOnKill: true },
  },
  roundkick: {
    name: 'Раунд-кик',
    activation: 'cooldown',
    baseCooldown: 8.0,
    targetType: 'aoe_around_self',
    aoeRadius: 90,
    baseDamageMultiplier: 1.0,
    knockback: 30,
    // Синергия с knockdown: лежачие враги получают +60% урона (per-target).
    bonusVsKnockedDownPct: 0.6,
    levelBonusPerLvl: 0.25,
    cdRateBonusPerLvl: 0.10,
    // L10: каждый задетый враг сокращает CD на 0.3с, cap 5 врагов = макс −1.5с.
    l10: { cdReductionPerHit: 0.3, cdReductionMaxHits: 5 },
  },
  slam: {
    name: 'Прыжок с приземлением',
    activation: 'cooldown',
    baseCooldown: 15.0,
    targetType: 'aoe_landing',
    aoeRadius: 130,
    baseDamageMultiplier: 2.0,
    castDelaySec: 0.8,
    knockback: 50,
    // Синергия с knockdown:
    //  • по лежачей цели — bonusVsKnockedDownPct к урону (per-target, без форс-крита).
    //  • при попадании — knockdownChance шанс сам положить врага (если он ещё не лежит).
    bonusVsKnockedDownPct: 0.25,
    knockdownChance: 0.1,
    knockdownSec: 1,
    // Marked: точка приземления = помеченная цель (если есть), иначе ближайший.
    prefersMarkedTarget: true,
    levelBonusPerLvl: 0.25,
    cdRateBonusPerLvl: 0.10,
    // L10: после приземления остаётся горящая зона того же радиуса.
    // DoT тикает каждые 0.5с (см. GROUND_EFFECT_TICK_SEC), dpsPct — доля от damage героя.
    l10: { groundZoneDurationSec: 3.0, groundZoneDpsPct: 0.25 },
  },
  rage: {
    // Активируется на любом уровне зарядов от minCharges до maxCharges.
    // Длительность баффа линейно интерполируется: minCharges → minDurationSec, maxCharges → maxDurationSec.
    // Все заряды сжигаются при активации.
    //
    // Заряды копятся: chargesPerAutoAttack за авто-атаку + chargesPerSkillCast за каст любого
    // cooldown-скилла. Сама Ярость зарядов не даёт (charges-скилл).
    //
    // Огненная аура: пока активна, каждую burnTickSec секунду все живые враги в радиусе
    // burnRadius получают burnDamagePct от damage героя. Тики НЕ проходят через dealDamage —
    // это passive aura (не auto-attack), unique-аффиксы (bleed/lifesteal/stun) не триггерятся.
    name: 'Ярость',
    activation: 'charges',
    chargesPerAutoAttack: 1,
    chargesPerSkillCast: 3,
    minCharges: 10,
    maxCharges: 50,
    minDurationSec: 2.0,
    maxDurationSec: 6.0,
    targetType: 'self_buff',
    bonusDamagePct: 0.25,
    bonusAttackSpeedPct: 0.25,
    burnDamagePct: 0.20,
    burnTickSec: 1.0,
    burnRadius: 90,
    levelBonusPerLvl: 0.2,
    // L10: пока Ярость активна — aura радиус ×1.5 и тик ×0.5 (вдвое чаще).
    // Чисто бустит свою же ауру, не вмешивается в другие системы.
    l10: { auraRadiusMult: 1.5, auraTickMult: 0.5 },
  },
  breath: {
    name: 'Второе дыхание',
    activation: 'cooldown',
    baseCooldown: 30.0,
    targetType: 'self_heal',
    healPctOfMaxHp: 0.30,
    // Adrenaline rush: после каста небольшой offensive-бафф на 5с. Crit — отдельный стат
    // (не перекрывается с combo's atkSpd), atkSpd — feel «отдышался → быстрее бьёт».
    // Скейлится с уровнем breath (на lvl 10: +19% atkSpd, +19% crit chance).
    buffOnUse: {
      atkSpdBonusPct: 0.10,
      critChanceBonusPct: 0.10,
      durationSec: 5.0,
    },
    levelBonusPerLvl: 0.10,
    cdRateBonusPerLvl: 0.10,
    // L10: overheal не теряется, превращается в shield на shieldDurationSec.
    // Shield перезаписывает предыдущий (не стакается). См. damageHero в battle.js.
    l10: { overhealToShield: true, shieldDurationSec: 10 },
  },
  double_strike: {
    name: 'Двойной удар',
    activation: 'cooldown',
    baseCooldown: 6.0,
    targetType: 'single',
    baseDamageMultiplier: 1.7,
    hits: 2,
    bonusCritChance: 0.20,
    // Синергия с bleed: если цель кровит на момент каста — оба хита +25% урона (снапшот).
    bonusVsBleedingPct: 0.25,
    levelBonusPerLvl: 0.15,
    cdRateBonusPerLvl: 0.10,
    // L10: +1 удар всегда (=3 хита), +ещё 1 если цель кровит на момент каста (=4 хита).
    l10: { extraHits: 1, extraHitsIfBleeding: 1 },
  },
  bloodlust: {
    name: 'Кровожадность',
    activation: 'cooldown',
    baseCooldown: 12.0,
    targetType: 'aoe_around_self',
    aoeRadius: 80,
    baseDamageMultiplier: 0.7,
    lifestealPct: 0.5,              // 50% от нанесённого урона возвращается в HP
    // Синергия с bleed: лайфстил с кровящих целей умножается (per-enemy).
    bleedLifestealMultiplier: 2.0,
    minHealPct: 0.10,               // гарантированный минимум — 10% maxHp за каст (на пустую толпу)
    knockback: 25,
    levelBonusPerLvl: 0.25,
    cdRateBonusPerLvl: 0.10,
    // L10: шанс bleedChance на каждого задетого нанести bleed (новый DoT) — кормит свою же ×bleedLifestealMultiplier.
    // Не перезаписывает уже кровящих целей. DPS — bleedDpsPct от damage героя.
    l10: { bleedChance: 0.4, bleedDpsPct: 0.20, bleedDurationSec: 5.0 },
  },
  combo: {
    name: 'Серия',
    activation: 'cooldown',
    baseCooldown: 4.0,
    targetType: 'single',
    baseDamageMultiplier: 1.5,
    buffOnUse: {
      atkSpdBonusPct: 0.30,
      durationSec: 2.5,
      // Универсальный consumer: если на цели был любой тег (bleed/KD/marked)
      // на момент каста — добавляет ещё и +crit shance в тот же бафф.
      critChanceBonusIfTagged: 0.30,
    },
    levelBonusPerLvl: 0.15,
    cdRateBonusPerLvl: 0.10,
    // L10: combo-бафф продлевается на extendPerHitSec за каждый auto-hit, но не дольше
    // maxBuffDurationSec от момента каста. Поощряет «бить непрерывно».
    l10: { extendPerHitSec: 0.5, maxBuffDurationSec: 5.0 },
  },
  trip: {
    // CC-скилл: AoE вокруг героя, оглушает (knockdown) задетых врагов.
    // Урон скромный — основная ценность в контроле толпы.
    // knockdownSec — длительность нокдауна, скейлится с уровнем.
    name: 'Подсечка',
    activation: 'cooldown',
    baseCooldown: 9.0,
    targetType: 'aoe_around_self',
    aoeRadius: 100,
    baseDamageMultiplier: 0.5,
    knockdownSec: 1.5,
    knockback: 20,
    levelBonusPerLvl: 0.15,
    cdRateBonusPerLvl: 0.10,
    // L10: радиус ×1.3 (100 → 130). Длительность KD не трогаем — она уже растёт с прокачкой.
    l10: { radiusMult: 1.3 },
  },
  dash: {
    // Mobility/range: рывок к самому дальнему врагу, урон по линии.
    // Цель получает baseDamageMultiplier, попавшие в полосу — pathDamageMultiplier.
    name: 'Рывок',
    activation: 'cooldown',
    baseCooldown: 7.0,
    targetType: 'dash_line',
    baseDamageMultiplier: 1.2,
    pathDamageMultiplier: 0.6,
    pathWidth: 40,
    // Marked consumer: помеченная цель в линии — +50% урона (через dealDamage).
    bonusVsMarkedPct: 0.5,
    levelBonusPerLvl: 0.15,
    cdRateBonusPerLvl: 0.10,
    // L10: 2 последовательных заряда (один CD-таймер, копит до maxCharges=2).
    // hero.dashCharges хранит текущие заряды; при L10 max повышается до 2.
    // Каст тратит 1 заряд → CD запускается заново, пока charges < maxCharges.
    l10: { maxCharges: 2 },
  },
};

export const STARTING_SKILLS = ['hook'];

// Гарантированный порядок первых гача-выпадений — пока есть незаоткрытые из этого списка,
// они выпадают строго по порядку. Базовый toolkit для онбординга врагов:
//   roundkick  — AOE против swarm (вводится на L3)
//   breath     — хил, страховка под пресс
//   dash       — мобильность/линия урона против ranged_pack (вводится на L5)
// Дальше — чистый рандом из оставшихся закрытых.
export const GUARANTEED_UNLOCKS = ['roundkick', 'breath', 'dash'];

// Гача
export const GACHA = {
  duplicateShards: 5,           // сколько шардов даёт повтор
  lockedProbability: 0.75,      // вероятность выпадения закрытого скилла (если есть)
};

// Стоимость прокачки скилла L→L+1. Индекс 0 = L1→L2, индекс 8 = L9→L10.
// Кривая: 5,7,9,...,21 (+2 за шаг) — первый босс (5 шардов) даёт ровно 1 уровень, без скипов.
// Total К L10 = 117 шардов.
export const SKILL_SHARD_COSTS = [5, 7, 9, 11, 13, 15, 17, 19, 21];

// Единый конфиг дропа шардов с врагов (используется в core/loadout.js rollShardDropForEnemy).
// Раньше параметры были раскиданы по 6 *_BASE константам в balance/enemies.js — собрали в одно место.
export const SHARD_DROP = {
  perMobChance: 0.05,   // 5% шанс с любого не-boss моба → +1 шард
  perBossCount:  5,     // фикс. количество шардов с любого босса (без шанса, всегда выпадает)
};

export function shardCostForLevel(level) {
  // level 1 → cost to reach level 2 = SKILL_SHARD_COSTS[0]
  const idx = level - 1;
  if (idx < SKILL_SHARD_COSTS.length) return SKILL_SHARD_COSTS[idx];
  const last = SKILL_SHARD_COSTS[SKILL_SHARD_COSTS.length - 1];
  const extra = idx - (SKILL_SHARD_COSTS.length - 1);
  return Math.ceil(last * Math.pow(1.5, extra));
}
