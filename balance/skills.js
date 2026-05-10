// Скиллы будут активны на Этапе 2. В Этапе 1 файл существует как часть контракта.

// Cap уровня прокачки скиллов. Дальше tryUpgradeSkill отказывает.
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
    levelBonusPerLvl: 0.15,
    cdRateBonusPerLvl: 0.10,
  },
  cut: {
    name: 'Рассечение',
    activation: 'cooldown',
    baseCooldown: 6.0,
    targetType: 'single',
    baseDamageMultiplier: 1.0,
    // Bleed как бинарный тег: цель кровит / не кровит.
    // duration > baseCooldown → DoT непрерывно перекрывается при ритм-касте.
    dot: { damagePctPerSec: 0.25, durationSec: 7.0 },
    levelBonusPerLvl: 0.15,
    cdRateBonusPerLvl: 0.10,
  },
  spinkick: {
    name: 'Вертушка с разворота',
    activation: 'cooldown',
    baseCooldown: 5.0,
    targetType: 'single',
    baseDamageMultiplier: 2.2,
    bonusCritChance: 0.50,
    // Marked consumer: по помеченной цели — +60% урона.
    bonusVsMarkedPct: 0.6,
    // Knockdown — single-target CC, кладёт цель на 0.8с (× lvlMult).
    // Синергии: открывает +60% урона по лежачему для Раунд-кика и +25% для Слэма.
    // На качке отменяет windup. На L10 длительность = 0.8 × (1+9×0.15) = 1.88с.
    knockdownSec: 0.8,
    levelBonusPerLvl: 0.15,
    cdRateBonusPerLvl: 0.10,
  },
  roundkick: {
    name: 'Раунд-кик',
    activation: 'cooldown',
    baseCooldown: 8.0,
    targetType: 'aoe_around_self',
    aoeRadius: 90,
    baseDamageMultiplier: 1.8,
    knockback: 30,
    // Синергия с knockdown: лежачие враги получают +60% урона (per-target).
    bonusVsKnockedDownPct: 0.6,
    levelBonusPerLvl: 0.15,
    cdRateBonusPerLvl: 0.10,
  },
  slam: {
    name: 'Прыжок с приземлением',
    activation: 'cooldown',
    baseCooldown: 15.0,
    targetType: 'aoe_landing',
    aoeRadius: 130,
    baseDamageMultiplier: 4.0,
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
    // Rage synergy: каст 0.8с → 0.4с (молниеносная реакция под Яростью).
    castDelayMultIfRage: 0.5,
    levelBonusPerLvl: 0.15,
    cdRateBonusPerLvl: 0.10,
  },
  rage: {
    // Активируется на любом уровне зарядов от minCharges до maxCharges.
    // Длительность баффа линейно интерполируется: minCharges → minDurationSec, maxCharges → maxDurationSec.
    // Все заряды сжигаются при активации.
    //
    // Заряды копятся: chargesPerAutoAttack за авто-атаку + chargesPerSkillCast за каст любого
    // cooldown-скилла. Сама Ярость зарядов не даёт (charges-скилл).
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
    levelBonusPerLvl: 0.2,
  },
  breath: {
    name: 'Второе дыхание',
    activation: 'cooldown',
    baseCooldown: 30.0,
    targetType: 'self_heal',
    healPctOfMaxHp: 0.30,
    // Rage synergy: пока активна Ярость, КД ×0.5 → можно отхилиться чаще под прессингом.
    cdMultiplierIfRage: 0.5,
    levelBonusPerLvl: 0.10,
    cdRateBonusPerLvl: 0.10,
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
  },
  bloodlust: {
    name: 'Кровожадность',
    activation: 'cooldown',
    baseCooldown: 12.0,
    targetType: 'aoe_around_self',
    aoeRadius: 80,
    baseDamageMultiplier: 1.5,
    lifestealPct: 0.5,              // 50% от нанесённого урона возвращается в HP
    // Синергия с bleed: лайфстил с кровящих целей умножается (per-enemy).
    bleedLifestealMultiplier: 2.0,
    // Rage synergy: общий лайфстил ×1.5 пока активна Ярость.
    lifestealMultiplierIfRage: 1.5,
    minHealPct: 0.10,               // гарантированный минимум — 10% maxHp за каст (на пустую толпу)
    knockback: 25,
    levelBonusPerLvl: 0.15,
    cdRateBonusPerLvl: 0.10,
  },
  combo: {
    name: 'Серия',
    activation: 'cooldown',
    baseCooldown: 5.0,
    targetType: 'single',
    baseDamageMultiplier: 1.4,
    buffOnUse: {
      atkSpdBonusPct: 0.30,
      durationSec: 2.5,
      // Универсальный consumer: если на цели был любой тег (bleed/KD/marked)
      // на момент каста — добавляет ещё и +crit shance в тот же бафф.
      critChanceBonusIfTagged: 0.30,
    },
    levelBonusPerLvl: 0.15,
    cdRateBonusPerLvl: 0.10,
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
    baseDamageMultiplier: 1.0,
    knockdownSec: 1.5,
    knockback: 20,
    levelBonusPerLvl: 0.15,
    cdRateBonusPerLvl: 0.10,
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
    // Rage synergy: ширина полосы рывка ×1.5 пока активна Ярость (захватывает больше врагов).
    pathWidthMultiplierIfRage: 1.5,
    levelBonusPerLvl: 0.15,
    cdRateBonusPerLvl: 0.10,
  },
};

export const STARTING_SKILLS = ['hook'];

// Гарантированный порядок первых гача-выпадений — пока есть незаоткрытые из этого списка,
// они выпадают строго по порядку. Используется чтобы дать игроку базовый toolkit (AoE + heal)
// в первые 2 крутки. Дальше — чистый рандом из оставшихся закрытых.
export const GUARANTEED_UNLOCKS = ['roundkick', 'breath'];

// Гача
export const GACHA = {
  duplicateShards: 5,           // сколько шардов даёт повтор
  lockedProbability: 0.75,      // вероятность выпадения закрытого скилла (если есть)
};

export const SKILL_SHARD_COSTS = [3, 5, 8, 12, 18, 27, 40, 60, 90, 135];

export function shardCostForLevel(level) {
  // level 1 → cost to reach level 2 = SKILL_SHARD_COSTS[0]
  const idx = level - 1;
  if (idx < SKILL_SHARD_COSTS.length) return SKILL_SHARD_COSTS[idx];
  const last = SKILL_SHARD_COSTS[SKILL_SHARD_COSTS.length - 1];
  const extra = idx - (SKILL_SHARD_COSTS.length - 1);
  return Math.ceil(last * Math.pow(1.5, extra));
}
