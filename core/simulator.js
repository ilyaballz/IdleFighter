// Боевой симулятор (Этап А): чистая математика, не трогает live state.
// Считает DPS, время очистки локации, потерю HP, выживет ли герой.
// Будет дополняться при необходимости (скиллы — уже учитываются как DPS-источники).

import { computeEffectiveStat } from './stats_layer.js';
import { SKILLS } from '../balance/skills.js';
import {
  ENEMY_BASE, ELITE_BASE, RANGED_BASE, HEAVY_BASE, SCALING, BOSS_BASE,
  arenasForLocation, getArenaComposition, bossStatsForLocation,
  enemyHpMultForLocation, enemyDamageMultForLocation,
} from '../balance/enemies.js';
import {
  bossRarityWeights, EQUIPMENT_SLOTS, RARITIES,
  PRIMARY_AFFIX_BASE, SECONDARY_AFFIXES,
  getAffixValueMult, roundAffixValue,
} from '../balance/equipment.js';
import { TRAINER_TIERS } from '../balance/training.js';

import { heroState } from './stats_layer.js';
import { hubState } from '../hub/state.js';
import { loadoutState } from './loadout.js';
import { getEquippedItems } from './inventory.js';

// ───────── Билдеры сценариев ─────────

function trainerMultsFromCurrentTiers() {
  return {
    strength:  TRAINER_TIERS[hubState.trainers.strength.tier].statMultiplier,
    toughness: TRAINER_TIERS[hubState.trainers.toughness.tier].statMultiplier,
    agility:   TRAINER_TIERS[hubState.trainers.agility.tier].statMultiplier,
  };
}

export function buildCurrentScenario() {
  return {
    name: 'текущий билд',
    levels: { ...heroState.levels },
    equippedItems: getEquippedItems(),
    skills: loadoutState.selected.filter(Boolean),
    skillLevels: { ...loadoutState.levels },
    trainerMults: trainerMultsFromCurrentTiers(),
  };
}

// ───────── Расчёт статов сценария ─────────

function getStats(scenario) {
  const fields = [
    'maxHp', 'damage', 'attackSpeed', 'critChance', 'critMultiplier',
    'defense', 'dodgeChance', 'skillCdrPct',
    'hpRegenInBattle', 'hpRegenBetweenWaves',
  ];
  const mults = scenario.trainerMults;
  const tmFn = mults ? (s) => mults[s] ?? 1 : undefined;
  const out = {};
  for (const f of fields) {
    out[f] = computeEffectiveStat(f, scenario.levels, scenario.equippedItems, tmFn);
  }
  return out;
}

// ───────── Расчёт DPS героя ─────────
// Возвращает { autoDps, skillDpsSingle, skillDpsAoe, rageMultAuto, rageMultSkill, breakdown[] }.
// Модель:
//  - Auto-DPS: damage × atkSpeed × avgCritMult
//  - Cooldown скилл с single → damage × multiplier × hits / cd_eff (с учётом доп. крита)
//  - Cooldown скилл с DoT (cut): + dmg × dotPct × dotDur / cd_eff
//  - Cooldown скилл с AoE → попадает в aoe-bucket; умножим на N_avg в simulateArena
//  - self_buff с зарядами (Ярость) → моделируется через uptime как множитель к auto и skill DPS
//  - self_heal (Дыхание), buffOnUse (Серия), lifesteal (Кровожадность) — пока 0, бесполезны для DPS-сравнения
function computeHeroDps(scenario, stats) {
  const critAvg = 1 + stats.critChance * (stats.critMultiplier - 1);
  const autoDps = stats.damage * stats.attackSpeed * critAvg;

  let skillDpsSingle = 0;
  let skillDpsAoe = 0;
  let rageMultAuto = 1;     // множитель auto-DPS из-за бафф-скиллов с зарядами (Ярость)
  let rageMultSkill = 1;    // множитель skill-DPS (только damage бонус — atkSpd не сокращает КД)
  const breakdown = [];
  const buffEntries = [];   // отложенный pass — баффам нужны totals по скиллам

  for (const skillId of scenario.skills) {
    if (!skillId) continue;
    const def = SKILLS[skillId];
    if (!def) continue;

    if (def.activation === 'charges' && def.targetType === 'self_buff') {
      // Греди-стратегия AI: каст при достижении minCharges → длительность = minDurationSec.
      // Цикл = minCharges / chargesPerSec (после каста заряды обнуляются).
      // Заряды копятся: с авто-атак (chargesPerAutoAttack) + с каста любого cooldown-скилла
      // в лоадауте (chargesPerSkillCast × среднее число кастов/сек по всем cooldown-скиллам).
      const lvl = scenario.skillLevels[skillId] || 1;
      const lm = 1 + (lvl - 1) * (def.levelBonusPerLvl || 0);
      const bd = (def.bonusDamagePct || 0) * lm;
      const ba = (def.bonusAttackSpeedPct || 0) * lm;
      const chargesFromAuto = (def.chargesPerAutoAttack || 1) * stats.attackSpeed;
      let skillCastsPerSec = 0;
      for (const otherId of scenario.skills) {
        if (!otherId) continue;
        const od = SKILLS[otherId];
        if (!od || od.activation !== 'cooldown') continue;
        const odLvl = scenario.skillLevels[otherId] || 1;
        const odLocal = od.cdRateBonusPerLvl ? Math.max(0, odLvl - 1) * od.cdRateBonusPerLvl : 0;
        const cdEff = Math.max(0.1, od.baseCooldown / (1 + stats.skillCdrPct + odLocal));
        skillCastsPerSec += 1 / cdEff;
      }
      const chargesFromSkills = (def.chargesPerSkillCast || 0) * skillCastsPerSec;
      const chargesPerSec = chargesFromAuto + chargesFromSkills;
      const uptime = Math.min(1, def.minDurationSec * chargesPerSec / def.minCharges);
      const multAuto  = 1 + uptime * ((1 + bd) * (1 + ba) - 1);
      const multSkill = 1 + uptime * bd;
      rageMultAuto  *= multAuto;
      rageMultSkill *= multSkill;
      buffEntries.push({ skillId, name: def.name, uptime, multAuto, multSkill });
      continue;
    }

    if (def.activation !== 'cooldown') {
      breakdown.push({ skillId, name: def.name, dps: 0, note: 'не учтён в DPS (heal/buffOnUse/lifesteal)' });
      continue;
    }

    const lvl = scenario.skillLevels[skillId] || 1;
    const dmgMult = def.baseDamageMultiplier * (1 + (lvl - 1) * def.levelBonusPerLvl);
    const hits = def.hits || 1;
    const localCdRate = def.cdRateBonusPerLvl ? Math.max(0, lvl - 1) * def.cdRateBonusPerLvl : 0;
    const cdEff = Math.max(0.1, def.baseCooldown / (1 + stats.skillCdrPct + localCdRate));

    // Бонусный крит-шанс конкретно для этого скилла
    const skillCritChance = Math.min(1, stats.critChance + (def.bonusCritChance || 0));
    const skillCritAvg = 1 + skillCritChance * (stats.critMultiplier - 1);

    let perCast = stats.damage * dmgMult * hits * skillCritAvg;
    if (def.dot) {
      perCast += stats.damage * def.dot.damagePctPerSec * def.dot.durationSec;
    }
    const dpsContrib = perCast / cdEff;

    if (def.targetType === 'aoe_around_self' || def.targetType === 'aoe_landing') {
      skillDpsAoe += dpsContrib;
    } else if (def.targetType === 'single') {
      skillDpsSingle += dpsContrib;
    }
    breakdown.push({ skillId, name: def.name, dps: dpsContrib, target: def.targetType });
  }

  // Второй pass: вклад баффов в DPS = разница (после баффа) - (без баффа).
  // AoE-вклад считаем без N-множителя (для аккуратного breakdown берём single+aoe раздельно).
  for (const b of buffEntries) {
    const contrib = autoDps * (b.multAuto - 1)
                  + (skillDpsSingle + skillDpsAoe) * (b.multSkill - 1);
    breakdown.push({
      skillId: b.skillId,
      name: b.name,
      dps: contrib,
      note: `uptime ~${Math.round(b.uptime * 100)}%`,
    });
  }

  return { autoDps, skillDpsSingle, skillDpsAoe, rageMultAuto, rageMultSkill, breakdown };
}

// ───────── Параметры арены ─────────

function buildEnemiesForArena(locationLevel, arenaIdx) {
  const composition = getArenaComposition(arenaIdx, locationLevel);
  const waveMult = Math.pow(SCALING.perWaveMultiplier, arenaIdx - 1);
  const hpLoc    = enemyHpMultForLocation(locationLevel);
  const dmgLoc   = enemyDamageMultForLocation(locationLevel);
  const out = [];
  for (const u of composition.units) {
    const sHp  = u.scaleHp  ?? 1;
    const sDmg = u.scaleDmg ?? 1;
    for (let i = 0; i < u.count; i++) {
      const baseFor = {
        boss: null,
        elite: ELITE_BASE,
        heavy: HEAVY_BASE,
        ranged: RANGED_BASE,
        regular: ENEMY_BASE,
      };
      if (u.kind === 'boss') {
        const stats = bossStatsForLocation(locationLevel, arenaIdx);
        out.push({
          kind: 'boss',
          hp: stats.hp * sHp,
          damage: stats.damage * sDmg,
          attackSpeed: BOSS_BASE.baseAttackSpeed,
        });
      } else {
        const base = baseFor[u.kind] || ENEMY_BASE;
        out.push({
          kind: u.kind,
          hp: base.baseHp * waveMult * hpLoc * sHp,
          damage: base.baseDamage * waveMult * dmgLoc * sDmg,
          attackSpeed: base.baseAttackSpeed,
        });
      }
    }
  }
  return { type: composition.type, enemies: out };
}

// ───────── Симуляция арены ─────────

function simulateArena(scenario, stats, dps, locationLevel, arenaIdx) {
  const { type, enemies } = buildEnemiesForArena(locationLevel, arenaIdx);
  const N = enemies.length;
  const totalHp = enemies.reduce((s, e) => s + e.hp, 0);

  // Effective DPS: одиночные источники бьют one-by-one, AoE — раздаются на всех.
  // Аппроксимация: считаем "пулом HP" и общим DPS = single + aoe × min(N, 4).
  // Бафф-скиллы (Ярость) применяются как множители: auto и skill отдельно.
  const aoeMult = Math.min(N, 4);
  const buffedAuto  = dps.autoDps * dps.rageMultAuto;
  const buffedSkill = (dps.skillDpsSingle + dps.skillDpsAoe * aoeMult) * dps.rageMultSkill;
  const effectiveDps = buffedAuto + buffedSkill;
  const ttc = totalHp / Math.max(0.01, effectiveDps);

  // Входящий урон: по среднему живут N/2 врагов в течение боя, у боссов — все 100% времени.
  const incomingRaw = enemies.reduce((s, e) => s + e.damage * e.attackSpeed, 0);
  const aliveAvg = (type === 'boss' || type === 'elite') ? 1 : N / 2;
  const incomingPerSec = (incomingRaw / N) * aliveAvg;
  const mitigation = (1 - stats.dodgeChance) * (1 - stats.defense);
  const incomingMitigated = incomingPerSec * mitigation;

  const regen = stats.maxHp * stats.hpRegenInBattle;
  const hpLossPerSec = Math.max(0, incomingMitigated - regen);
  const hpLost = hpLossPerSec * ttc;

  return {
    arenaIdx, type, enemyCount: N,
    totalHp, ttc, incomingDps: incomingMitigated,
    hpLost, effectiveDps,
  };
}

// ───────── Симуляция локации ─────────

export function simulateLocation(scenario, locationLevel) {
  const stats = getStats(scenario);
  const dps = computeHeroDps(scenario, stats);
  let hp = stats.maxHp;
  let totalTime = 0;
  const arenas = [];
  const arenasCount = arenasForLocation(locationLevel);
  for (let i = 1; i <= arenasCount; i++) {
    const a = simulateArena(scenario, stats, dps, locationLevel, i);
    hp -= a.hpLost;
    totalTime += a.ttc;
    arenas.push({ ...a, hpAfter: hp });
    if (hp <= 0) {
      return { canClear: false, deathArena: i, totalTime, arenas, dps, stats };
    }
    if (i < arenasCount) {
      // 1с пауза + ~1с пробежка по коридору с регеном по hpRegenBetweenWaves
      const regenAmount = stats.maxHp * stats.hpRegenBetweenWaves * 1.5;
      hp = Math.min(stats.maxHp, hp + regenAmount);
      totalTime += 1.5;
    }
  }
  return { canClear: true, totalTime, arenas, dps, stats, hpFinal: hp };
}

// ───────── Прогон по диапазону локаций для сценария ─────────

export function runScenarioRange(scenario, fromLoc = 1, toLoc = 15) {
  const results = [];
  let firstFail = null;
  for (let L = fromLoc; L <= toLoc; L++) {
    const r = simulateLocation(scenario, L);
    results.push({ locationLevel: L, ...r });
    if (!r.canClear && firstFail === null) firstFail = L;
  }
  return { scenario, results, firstFail };
}

// ───────── Сравнение нескольких сценариев ─────────

export function compareScenarios(scenarios, fromLoc = 1, toLoc = 15) {
  return scenarios.map(s => runScenarioRange(s, fromLoc, toLoc));
}

// ═══════════════════════════════════════════════════════════════════════════
// CALIBRATION_SNAPSHOTS — реальные точки, замеренные у игрока в игре.
// Используются для sanity-check sim'ового прогрессионного билда: после
// прогона runProgressionRange(L, L) сравни player stats с реальной точкой.
// Если сильно расходятся — sim'овая модель нуждается в обновлении.
//
// Формат: { [locationLevel]: { realHp, realDmg, levels, tier, note } }
// ═══════════════════════════════════════════════════════════════════════════
export const CALIBRATION_SNAPSHOTS = {
  10: {
    realHp: 200, realDmg: 50,
    levels: { strength: 6, toughness: 5, agility: 4 },
    tier: 1,
    note: 'Барели прошёл L10 wall с ~5% hp left (sim показывал ✓24% → реал ✓5%, дельта ~19pp)',
  },
  20: {
    realHp: 1200, realDmg: 100,
    levels: { strength: 13, toughness: 12, agility: 8 },
    tier: 2,
    note: 'Прошёл L20. Эквип тяжелее sim-модели (eq_hp ~860 vs sim ~105). Δhp −65% (sim ниже реала).',
  },
  26: {
    realHp: 1000, realDmg: 200,
    levels: { strength: 22, toughness: 18, agility: 16 },
    tier: 3,
    note: 'L26. eq_hp ~360, eq_dmg ~124 (видимо заменил toughness-эквип на damage). Δhp +110% (sim уже ВЫШЕ реала!). Δlevels: real 56 vs sim 40 — sim недоучитывает темп прокачки на T3 (xpPerTap=30).',
  },
  30: {
    realHp: 2200, realDmg: 230,
    levels: { strength: 22, toughness: 20, agility: 20 },
    tier: 3,
    coinsReserve: 50000,
    wallOutcome: 'passed with ~60% hp left (sim predicted ✓40% — sim близко). Не «барели», но не легко',
    postSnapshot: { hp: 2000, dmg: 285 },   // snapshot после: купил T4 во время гл.3 (dmg +55)
    note: 'L30. Hp ×2 за 4 локи — легендарка + 2 шмотки с +hp%. Wall комфортный (~60% hp left), цель 5-15% → wall повышен до 1.2, planted для playtest. T4 куплен (T3→T4 mid-chapter).',
  },
  33: {
    realHp: 3100, realDmg: 500,
    attackSpeed: 4.0,    // на 80% от cap 5.0 — min-max damage build
    tier: 4,   // предположение, уточнить
    note: 'L33. MIN-MAX damage build: auto-DPS 2000+, effDps ~3500-4000 (sim предсказывал 2761). Эквип доминирует тренажёры (eq_hp 2.5×stat, eq_dmg 3.9×stat). Single targets melts even with ×2 hp bump. Системная заметка: возможно нужны ELITE/HEAVY ×3-4 или damage resistance на singles.',
  },
};

// ───────── Сценарий «естественной прогрессии» ─────────
// Для каждой локации строит снапшот, который должен быть у среднего игрока
// к моменту попытки этой локации (статы накапливаются по +2 уровня за лок,
// эквип — 1 предмет с каждого побеждённого босса в ротации слотов).

const PROGRESSION_STAT_ORDER = ['strength', 'toughness', 'agility'];
const PROGRESSION_SKILLS = ['hook', 'roundkick', 'breath'];

function modalRarity(weightsObj) {
  let bestKey = Object.keys(weightsObj)[0];
  let bestVal = -1;
  for (const [k, v] of Object.entries(weightsObj)) {
    if (v > bestVal) { bestVal = v; bestKey = k; }
  }
  return bestKey;
}

// Детерминированная (без рандома) версия generateItem — для прогрессионного снапшота.
// Среднее значение secondary-аффиксов (variance = 1.0), типы выбираются по индексу.
function generateAverageItem(slotId, rarityId, locationLevel = 1) {
  const slot = EQUIPMENT_SLOTS[slotId];
  const rarity = RARITIES[rarityId];
  if (!slot || !rarity) return null;

  const valueMult = getAffixValueMult(rarity.weight, locationLevel);
  const primaryBase = PRIMARY_AFFIX_BASE[slot.primaryStat];
  const primaryValue = roundAffixValue(slot.primaryStat, primaryBase * valueMult);

  const usedTypes = new Set([slot.primaryStat]);
  const affixes = [];
  for (let i = 0; i < rarity.extraAffixes; i++) {
    const candidates = SECONDARY_AFFIXES.filter(a => !usedTypes.has(a.type));
    if (candidates.length === 0) break;
    const pick = candidates[i % candidates.length];
    usedTypes.add(pick.type);
    affixes.push({
      type: pick.type,
      value: roundAffixValue(pick.type, pick.base * valueMult),
    });
  }

  return {
    id: null,
    slot: slotId,
    rarity: rarityId,
    primaryAffix: { type: slot.primaryStat, value: primaryValue },
    affixes,
  };
}

// Допущение о тире тренажёра у среднего игрока к моменту попытки локации.
// Калибровка от реального снепа: на L10 игрок ещё T1, 6/5/4 (15 стат-уровней).
// Тиер-ап привязан к началу следующей главы — игрок копит монеты к финалу главы
// и покупает next tier на soft-entry лок (L11/L21/L31).
function progressionTrainerTier(loc) {
  if (loc <= 10) return 1;
  if (loc <= 20) return 2;
  if (loc <= 30) return 3;
  return 4;
}

// Темп прокачки — стат-уровней за локу (суммарно по 3 тренажёрам).
// Откалиброван по снепшоту: L10 → 15 уровней (6/5/4). Дальше линейно:
//   L20 ≈ 30, L30 ≈ 45, L40 ≈ 60.
// При смене тира всё накопленное получает retroactive ×mult — так и работает реальная игра.
const PROGRESSION_STAT_LEVELS_PER_LOC = 1.6;

function buildProgressionLevels(targetLocationLevel) {
  const tier = progressionTrainerTier(targetLocationLevel);
  const cap = TRAINER_TIERS[tier].levelCap;
  const levels = { strength: 1, toughness: 1, agility: 1 };
  const totalAdded = Math.round((targetLocationLevel - 1) * PROGRESSION_STAT_LEVELS_PER_LOC);
  for (let i = 0; i < totalAdded; i++) {
    const stat = PROGRESSION_STAT_ORDER[i % 3];
    if (levels[stat] < cap) levels[stat]++;
  }
  return levels;
}

function buildProgressionEquipment(targetLocationLevel) {
  const slotIds = Object.keys(EQUIPMENT_SLOTS);
  const items = [];
  // Для каждого слота — последняя локация (< target), на которой выпал предмет в этом слоте.
  // Ротация: cleared=1 → slot[0], cleared=2 → slot[1], ..., cleared=7 → slot[0] снова.
  // На L40 это даст эквип с локаций ~L34-L39, а не L1-L6 как было раньше (lazy upgrade ladder).
  for (let i = 0; i < slotIds.length; i++) {
    let lastCleared = -1;
    for (let cleared = i + 1; cleared < targetLocationLevel; cleared += slotIds.length) {
      lastCleared = cleared;
    }
    if (lastCleared < 1) continue;
    const slotId = slotIds[i];
    const rarityId = modalRarity(bossRarityWeights(lastCleared));
    const item = generateAverageItem(slotId, rarityId, lastCleared);
    if (item) items.push(item);
  }
  return items;
}

export function buildProgressionScenario(targetLocationLevel) {
  const skillLevels = {};
  for (const id of PROGRESSION_SKILLS) skillLevels[id] = 1;
  const tier = progressionTrainerTier(targetLocationLevel);
  const mult = TRAINER_TIERS[tier].statMultiplier;
  return {
    name: `прогрессия → L${targetLocationLevel}`,
    levels: buildProgressionLevels(targetLocationLevel),
    equippedItems: buildProgressionEquipment(targetLocationLevel),
    skills: PROGRESSION_SKILLS,
    skillLevels,
    trainerMults: { strength: mult, toughness: mult, agility: mult },
  };
}

// Прогон по диапазону локаций с НОВЫМ снапшотом для каждой L (динамическая прогрессия).
export function runProgressionRange(fromLoc = 1, toLoc = 15) {
  const results = [];
  let firstFail = null;
  for (let L = fromLoc; L <= toLoc; L++) {
    const scenario = buildProgressionScenario(L);
    const r = simulateLocation(scenario, L);
    results.push({ locationLevel: L, ...r });
    if (!r.canClear && firstFail === null) firstFail = L;
  }
  return {
    scenario: { name: 'естественная прогрессия' },
    results,
    firstFail,
  };
}
