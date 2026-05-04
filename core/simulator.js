// Боевой симулятор (Этап А): чистая математика, не трогает live state.
// Считает DPS, время очистки локации, потерю HP, выживет ли герой.
// Будет дополняться при необходимости (скиллы — уже учитываются как DPS-источники).

import { computeEffectiveStat } from './stats_layer.js';
import { SKILLS } from '../balance/skills.js';
import { ENEMY_BASE, ELITE_BASE, SCALING, BOSS_BASE, arenasForLocation, getArenaComposition } from '../balance/enemies.js';

import { heroState } from './stats_layer.js';
import { loadoutState } from './loadout.js';
import { getEquippedItems } from './inventory.js';

// ───────── Билдеры сценариев ─────────

export function buildCurrentScenario() {
  return {
    name: 'текущий билд',
    levels: { ...heroState.levels },
    equippedItems: getEquippedItems(),
    skills: loadoutState.selected.filter(Boolean),
    skillLevels: { ...loadoutState.levels },
  };
}

export function buildScenarioWithoutEquip() {
  return {
    name: 'без эквипа',
    levels: { ...heroState.levels },
    equippedItems: [],
    skills: loadoutState.selected.filter(Boolean),
    skillLevels: { ...loadoutState.levels },
  };
}

export function buildScenarioWithoutTrainers() {
  // Все статы L1, как у нового персонажа
  return {
    name: 'L1 статы (без качалки)',
    levels: { strength: 1, toughness: 1, agility: 1 },
    equippedItems: getEquippedItems(),
    skills: loadoutState.selected.filter(Boolean),
    skillLevels: { ...loadoutState.levels },
  };
}

export function buildBareScenario() {
  // Без эквипа и без качалки — стартовый билд
  return {
    name: 'базовый L1',
    levels: { strength: 1, toughness: 1, agility: 1 },
    equippedItems: [],
    skills: loadoutState.selected.filter(Boolean),
    skillLevels: { ...loadoutState.levels },
  };
}

// ───────── Расчёт статов сценария ─────────

function getStats(scenario) {
  const fields = [
    'maxHp', 'damage', 'attackSpeed', 'critChance', 'critMultiplier',
    'defense', 'dodgeChance', 'skillCdrPct',
    'hpRegenInBattle', 'hpRegenBetweenWaves',
  ];
  const out = {};
  for (const f of fields) {
    out[f] = computeEffectiveStat(f, scenario.levels, scenario.equippedItems);
  }
  return out;
}

// ───────── Расчёт DPS героя ─────────
// Возвращает { autoDps, skillDpsSingle, skillDpsAoe, breakdown[] }.
// Модель упрощённая:
//  - Auto-DPS: damage × atkSpeed × avgCritMult
//  - Cooldown скилл с single → damage × multiplier × hits / cd_eff (с учётом доп. крита)
//  - Cooldown скилл с DoT (cut): + dmg × dotPct × dotDur / cd_eff
//  - Cooldown скилл с AoE → попадает в aoe-bucket; в простой формуле умножим на N_avg позже
//  - self_buff/self_heal/charges (rage) — пока вклад в DPS = 0 (учтём в этапе B)
function computeHeroDps(scenario, stats) {
  const critAvg = 1 + stats.critChance * (stats.critMultiplier - 1);
  const autoDps = stats.damage * stats.attackSpeed * critAvg;

  let skillDpsSingle = 0;
  let skillDpsAoe = 0;
  const breakdown = [];

  for (const skillId of scenario.skills) {
    if (!skillId) continue;
    const def = SKILLS[skillId];
    if (!def) continue;
    if (def.activation !== 'cooldown') {
      breakdown.push({ skillId, name: def.name, dps: 0, note: 'не учтён в DPS (charges/buff/heal)' });
      continue;
    }
    const lvl = scenario.skillLevels[skillId] || 1;
    const dmgMult = def.baseDamageMultiplier * (1 + (lvl - 1) * def.levelBonusPerLvl);
    const hits = def.hits || 1;
    const cdEff = Math.max(0.1, def.baseCooldown * (1 - stats.skillCdrPct));

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
  return { autoDps, skillDpsSingle, skillDpsAoe, breakdown };
}

// ───────── Параметры арены ─────────

function buildEnemiesForArena(locationLevel, arenaIdx) {
  const composition = getArenaComposition(arenaIdx, locationLevel);
  const waveMult = Math.pow(SCALING.perWaveMultiplier, arenaIdx - 1);
  const locMult  = Math.pow(SCALING.perLocationMultiplier, locationLevel - 1);
  const out = [];
  for (const u of composition.units) {
    const sHp  = u.scaleHp  ?? 1;
    const sDmg = u.scaleDmg ?? 1;
    for (let i = 0; i < u.count; i++) {
      if (u.kind === 'boss') {
        out.push({
          kind: 'boss',
          hp: ENEMY_BASE.baseHp * waveMult * locMult * BOSS_BASE.hpMultiplier * sHp,
          damage: ENEMY_BASE.baseDamage * waveMult * locMult * BOSS_BASE.damageMultiplier * sDmg,
          attackSpeed: BOSS_BASE.baseAttackSpeed,
        });
      } else if (u.kind === 'elite') {
        out.push({
          kind: 'elite',
          hp: ELITE_BASE.baseHp * waveMult * locMult * sHp,
          damage: ELITE_BASE.baseDamage * waveMult * locMult * sDmg,
          attackSpeed: ELITE_BASE.baseAttackSpeed,
        });
      } else {
        out.push({
          kind: 'regular',
          hp: ENEMY_BASE.baseHp * waveMult * locMult * sHp,
          damage: ENEMY_BASE.baseDamage * waveMult * locMult * sDmg,
          attackSpeed: ENEMY_BASE.baseAttackSpeed,
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
  const aoeMult = Math.min(N, 4);
  const effectiveDps = dps.autoDps + dps.skillDpsSingle + dps.skillDpsAoe * aoeMult;
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
