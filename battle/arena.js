// Генерация локации: цепочка [arena, corridor, arena, corridor, ..., bossArena]
// Все рендерится в мировых координатах (worldX, worldY). Камера переводит мир в экран.

import { ARENA } from '../balance/visuals.js';
import {
  arenasForLocation, rollArenaComposition,
  ENEMY_BASE, ELITE_BASE, RANGED_BASE, HEAVY_BASE, HEALER_BASE, BOMBER_BASE, SCALING, BOSS_BASE,
  bossStatsForLocation, bossNutDrop, bossEnergyDrop,
  enemyHpMultForLocation, enemyDamageMultForLocation,
} from '../balance/enemies.js';
import { BAR_BASE, barOpponentStats } from '../balance/bar.js';
import { getChapterSkin, getChapterBossConfig } from '../balance/chapters.js';

export function buildLocation(locationIndex) {
  const arenas = [];
  const corridors = [];
  let cursorY = 0;

  const arenaW = ARENA.arenaWidth;
  const arenaH = ARENA.arenaHeight;
  const centerX = 0;
  const arenasPerLocation = arenasForLocation(locationIndex);

  for (let i = 1; i <= arenasPerLocation; i++) {
    const top = cursorY;
    const bottom = cursorY + arenaH;
    const arena = {
      index: i,
      x: centerX - arenaW / 2,
      y: top,
      w: arenaW,
      h: arenaH,
      composition: rollArenaComposition(i, locationIndex),
      cleared: false,
      activated: false,
      entryPoint: { x: centerX, y: top + 30 },
      exitPoint: { x: centerX, y: bottom - 30 },
      centerPoint: { x: centerX, y: (top + bottom) / 2 },
    };
    arenas.push(arena);
    cursorY = bottom;

    if (i < arenasPerLocation) {
      corridors.push({
        x: centerX - ARENA.corridorWidth / 2,
        y: cursorY,
        w: ARENA.corridorWidth,
        h: ARENA.corridorLength,
        startPoint: { x: centerX, y: cursorY },
        endPoint:   { x: centerX, y: cursorY + ARENA.corridorLength },
      });
      cursorY += ARENA.corridorLength;
    }
  }

  return {
    locationIndex,
    arenas,
    corridors,
    totalHeight: cursorY,
    width: arenaW,
  };
}

// Per-arena скейл (общий для HP и damage) — wave-мультипликатор накапливается внутри локации.
function waveMult(arenaIndex) {
  return Math.pow(SCALING.perWaveMultiplier, arenaIndex - 1);
}

export function scaleEnemyHp(baseValue, locationIndex, arenaIndex) {
  return baseValue * waveMult(arenaIndex) * enemyHpMultForLocation(locationIndex);
}

export function scaleEnemyDamage(baseValue, locationIndex, arenaIndex) {
  return baseValue * waveMult(arenaIndex) * enemyDamageMultForLocation(locationIndex);
}

// Возвращает массив "шаблонов" врагов для арены — итерируется по composition.units.
// Каждый юнит может иметь scaleHp/scaleDmg/scaleRadius — применяются поверх обычного скейлинга.
// Поле `wave` (default 1) — позиционная группа: wave 1 спавнится ближе к точке входа героя,
// wave 2 — в глубине арены, добегает позже. Создаёт двух-фазное столкновение без time-delay.
export function spawnPlanForArena(arena, locationIndex) {
  const out = [];
  for (const u of arena.composition.units) {
    const wave = u.wave ?? 1;
    for (let i = 0; i < u.count; i++) {
      out.push({ template: buildEnemyTemplate(u, locationIndex, arena.index), wave });
    }
  }
  return out;
}

// Применяет chapter-skin поверх базового template. Возвращает новый объект.
// Override может содержать name, color, параметрические Mult-поля (moveSpeedMult, attackRangeMult),
// boolean-флаги поведения (kiteRetreat), и молотов-параметры для ranged (aoeLingerDuration/Pct,
// projectileAoeRadius).
function applyChapterSkin(template, kind, locationIndex) {
  const skin = getChapterSkin(locationIndex, kind);
  if (!skin) return template;
  const out = { ...template };
  if (skin.name) out.name = skin.name;
  if (skin.color) out.color = skin.color;
  if (skin.moveSpeedMult && out.moveSpeed != null) {
    out.moveSpeed = out.moveSpeed * skin.moveSpeedMult;
  }
  if (skin.attackRangeMult && out.attackRange != null) {
    out.attackRange = out.attackRange * skin.attackRangeMult;
  }
  if (skin.kiteRetreat) out.kiteRetreat = true;
  // Молотов-параметры (CHAPTERS[3]/[4].ranged): лужа огня после приземления снаряда.
  if (skin.aoeLingerDuration != null) out.aoeLingerDuration = skin.aoeLingerDuration;
  if (skin.aoeLingerDpsPct != null) out.aoeLingerDpsPct = skin.aoeLingerDpsPct;
  if (skin.projectileAoeRadius != null) out.projectileAoeRadius = skin.projectileAoeRadius;
  return out;
}

export function buildEnemyTemplate(unit, locationIndex, arenaIndex) {
  const sHp    = unit.scaleHp     ?? 1;
  const sDmg   = unit.scaleDmg    ?? 1;
  const sR     = unit.scaleRadius ?? 1;
  const sSpeed = unit.scaleSpeed  ?? 1;   // множитель к moveSpeed (для swarm-тиров)
  const sRange = unit.scaleRange  ?? 1;   // множитель к attackRange (для ranged-тиров)

  if (unit.kind === 'boss') {
    const stats = bossStatsForLocation(locationIndex, arenaIndex);
    let tmpl = {
      kind: 'boss',
      name: BOSS_BASE.name,
      hp: stats.hp * sHp,
      damage: stats.damage * sDmg,
      attackSpeed: BOSS_BASE.baseAttackSpeed,
      armorPen: BOSS_BASE.armorPen || 0,  // боcc игнорит часть defense игрока в damageHero
      moveSpeed: BOSS_BASE.moveSpeed * sSpeed,
      bodyRadius: BOSS_BASE.bodyRadius * sR,
      color: BOSS_BASE.color,
      coinDrop: BOSS_BASE.baseCoinDrop * locationIndex,
      nutDrop: bossNutDrop(locationIndex),
      energyReward: bossEnergyDrop(locationIndex),  // часть от 30 ⚡ — остаток после арена-сплита
    };
    // Конфиг финального босса главы — добавляет триггер-поля (summonAt / enrageAt / dodge / slam).
    // На промежуточных boss-локациях config=null, поля остаются undefined → триггеры не работают.
    const bossCfg = getChapterBossConfig(locationIndex);
    if (bossCfg) {
      if (bossCfg.name) tmpl.name = bossCfg.name;
      if (bossCfg.summonAt != null) {
        tmpl.summonAt = bossCfg.summonAt;
        tmpl.summonKind = bossCfg.summonKind;
        tmpl.summonCount = bossCfg.summonCount;
      }
      if (bossCfg.enrageAt != null) {
        tmpl.enrageAt = bossCfg.enrageAt;
        tmpl.enrageDmgMult = bossCfg.enrageDmgMult;
        tmpl.enrageAtkSpdMult = bossCfg.enrageAtkSpdMult;
        tmpl.enrageDurationSec = bossCfg.enrageDurationSec;
      }
      if (bossCfg.dodgeChance != null) tmpl.dodgeChance = bossCfg.dodgeChance;
      if (bossCfg.windupDuration != null) {
        tmpl.windupDuration = bossCfg.windupDuration;
        tmpl.slamRadius = bossCfg.slamRadius;
        if (bossCfg.attackSpeedOverride != null) tmpl.attackSpeed = bossCfg.attackSpeedOverride;
      }
    }
    return tmpl;
  }
  if (unit.kind === 'elite') {
    return applyChapterSkin({
      kind: 'elite',
      name: ELITE_BASE.name,
      hp: scaleEnemyHp(ELITE_BASE.baseHp, locationIndex, arenaIndex) * sHp,
      damage: scaleEnemyDamage(ELITE_BASE.baseDamage, locationIndex, arenaIndex) * sDmg,
      attackSpeed: ELITE_BASE.baseAttackSpeed,
      moveSpeed: ELITE_BASE.moveSpeed * sSpeed,
      bodyRadius: ELITE_BASE.bodyRadius * sR,
      color: ELITE_BASE.color,
      coinDrop: ELITE_BASE.baseCoinDrop * locationIndex,
      critChance: ELITE_BASE.critChance,
      critMultiplier: ELITE_BASE.critMultiplier,
    }, 'elite', locationIndex);
  }
  if (unit.kind === 'ranged') {
    return applyChapterSkin({
      kind: 'ranged',
      name: RANGED_BASE.name,
      hp: scaleEnemyHp(RANGED_BASE.baseHp, locationIndex, arenaIndex) * sHp,
      damage: scaleEnemyDamage(RANGED_BASE.baseDamage, locationIndex, arenaIndex) * sDmg,
      attackSpeed: RANGED_BASE.baseAttackSpeed,
      moveSpeed: RANGED_BASE.moveSpeed * sSpeed,
      bodyRadius: RANGED_BASE.bodyRadius * sR,
      attackRange: RANGED_BASE.attackRange * sRange,
      color: RANGED_BASE.color,
      coinDrop: RANGED_BASE.baseCoinDrop * locationIndex,
    }, 'ranged', locationIndex);
  }
  if (unit.kind === 'heavy') {
    return applyChapterSkin({
      kind: 'heavy',
      name: HEAVY_BASE.name,
      hp: scaleEnemyHp(HEAVY_BASE.baseHp, locationIndex, arenaIndex) * sHp,
      damage: scaleEnemyDamage(HEAVY_BASE.baseDamage, locationIndex, arenaIndex) * sDmg,
      attackSpeed: HEAVY_BASE.baseAttackSpeed,
      moveSpeed: HEAVY_BASE.moveSpeed * sSpeed,
      bodyRadius: HEAVY_BASE.bodyRadius * sR,
      windupDuration: HEAVY_BASE.windupDuration,
      slamRadius: HEAVY_BASE.slamRadius,
      color: HEAVY_BASE.color,
      coinDrop: HEAVY_BASE.baseCoinDrop * locationIndex,
    }, 'heavy', locationIndex);
  }
  if (unit.kind === 'healer') {
    return applyChapterSkin({
      kind: 'healer',
      name: HEALER_BASE.name,
      hp: scaleEnemyHp(HEALER_BASE.baseHp, locationIndex, arenaIndex) * sHp,
      damage: scaleEnemyDamage(HEALER_BASE.baseDamage, locationIndex, arenaIndex) * sDmg,
      attackSpeed: HEALER_BASE.baseAttackSpeed,
      moveSpeed: HEALER_BASE.moveSpeed * sSpeed,
      bodyRadius: HEALER_BASE.bodyRadius * sR,
      color: HEALER_BASE.color,
      coinDrop: HEALER_BASE.baseCoinDrop * locationIndex,
      aura: HEALER_BASE.aura,    // aura не скейлится на v1 — фиксированная сила/радиус
    }, 'healer', locationIndex);
  }
  if (unit.kind === 'bomber') {
    // Подрывник: на 0 HP стартует death-telegraph, потом AOE-взрыв. Поля deathExplosionDamage /
    // deathTelegraphDuration / slamRadius читаются в dealDamage и tickBomberDeaths (battle.js).
    const scaledDmg = scaleEnemyDamage(BOMBER_BASE.baseDamage, locationIndex, arenaIndex);
    return applyChapterSkin({
      kind: 'bomber',
      name: BOMBER_BASE.name,
      hp: scaleEnemyHp(BOMBER_BASE.baseHp, locationIndex, arenaIndex) * sHp,
      damage: scaledDmg * sDmg,
      attackSpeed: BOMBER_BASE.baseAttackSpeed,
      moveSpeed: BOMBER_BASE.moveSpeed * sSpeed,
      bodyRadius: BOMBER_BASE.bodyRadius * sR,
      color: BOMBER_BASE.color,
      coinDrop: BOMBER_BASE.baseCoinDrop * locationIndex,
      deathExplosionDamage: scaledDmg * BOMBER_BASE.deathExplosionDmgMult,
      deathTelegraphDuration: BOMBER_BASE.deathTelegraphDuration,
      slamRadius: BOMBER_BASE.slamRadius,
    }, 'bomber', locationIndex);
  }
  // regular
  return applyChapterSkin({
    kind: 'regular',
    name: ENEMY_BASE.name,
    hp: scaleEnemyHp(ENEMY_BASE.baseHp, locationIndex, arenaIndex) * sHp,
    damage: scaleEnemyDamage(ENEMY_BASE.baseDamage, locationIndex, arenaIndex) * sDmg,
    attackSpeed: ENEMY_BASE.baseAttackSpeed,
    moveSpeed: ENEMY_BASE.moveSpeed * sSpeed,
    bodyRadius: ENEMY_BASE.bodyRadius * sR,
    color: ENEMY_BASE.color,
    coinDrop: ENEMY_BASE.baseCoinDrop * locationIndex,
  }, 'regular', locationIndex);
}

// Бар-локация: одна арена, один противник. Конкретный противник + barLevel прокидываются
// через поля arena.barOpponent / arena.barLevel, читаются в spawnArenaEnemies → buildBarOpponentTemplate.
export function buildBarLocation(opponent, barLevel) {
  const arenaW = ARENA.arenaWidth;
  const arenaH = ARENA.arenaHeight;
  const centerX = 0;
  const arena = {
    index: 1,
    x: centerX - arenaW / 2,
    y: 0,
    w: arenaW,
    h: arenaH,
    composition: { type: 'boss', units: [{ kind: 'bar_boss', count: 1 }] },
    cleared: false,
    activated: false,
    entryPoint: { x: centerX, y: 30 },
    exitPoint:  { x: centerX, y: arenaH - 30 },
    centerPoint:{ x: centerX, y: arenaH / 2 },
    barOpponent: opponent,
    barLevel,
  };
  return {
    locationIndex: 1,
    kind: 'bar',
    arenas: [arena],
    corridors: [],
    totalHeight: arenaH,
    width: arenaW,
  };
}

// Шаблон бар-противника. Отдельный kind 'bar_boss' (не 'boss') — ни лута, ни монет, ни энергии:
// логика дропа в rollDropForEnemy/rollShardDropForEnemy явно возвращает null для этого kind.
// Уникальные модификаторы (crit/dodge/enrage) копируются из opponent в темплейт врага.
export function buildBarOpponentTemplate(opponent, barLevel) {
  const s = barOpponentStats(opponent, barLevel);
  return {
    kind: 'bar_boss',
    name: opponent.name,
    hp: s.hp,
    damage: s.damage,
    attackSpeed: BAR_BASE.attackSpeed,
    moveSpeed: BAR_BASE.moveSpeed,
    bodyRadius: BAR_BASE.bodyRadius,
    color: opponent.color || BAR_BASE.color,
    coinDrop: 0,
    energyReward: 0,
    critChance:     opponent.critChance     || 0,
    critMultiplier: opponent.critMultiplier || 2.0,
    dodgeChance:    opponent.dodgeChance    || 0,
    enrageAt:          opponent.enrageAt          ?? null,
    enrageDmgMult:     opponent.enrageDmgMult     || 1,
    enrageAtkSpdMult:  opponent.enrageAtkSpdMult  || 1,
    enrageDurationSec: opponent.enrageDurationSec || 0,
  };
}

// Per-kind y-диапазон спавна (% арены от входа = верха).
// Регуляры — фронтлайн (35-65%), прикрывают/прижимают героя к атаке.
// Elite/heavy — мидлайн (45-80%).
// Ranged — бэклайн (60-95%), стреляют из глубины.
// Boss — центр-глубина.
// Если kind не указан — старая форма 35-100%.
const KIND_SPAWN_Y_FRAC = {
  regular:       { min: 0.35, max: 0.65 },
  light_regular: { min: 0.35, max: 0.65 },
  elite:         { min: 0.45, max: 0.80 },
  heavy:         { min: 0.45, max: 0.80 },
  healer:        { min: 0.55, max: 0.85 },   // поглубже, чтобы прикрывали танки/регуляры
  ranged:        { min: 0.60, max: 0.95 },
  boss:          { min: 0.55, max: 0.90 },
};

// Wave 2 спавнится в глубине арены (близко к exit), чтобы добегало после волны 1.
// Используем фиксированный диапазон 0.80-0.95 — независимо от kind. Позиция = расстояние
// до героя ≈ 200-300px → ~2-3 секунды на добегание со swarm-speed (90×1.5 = 135 px/s).
const WAVE2_SPAWN_Y_FRAC = { min: 0.80, max: 0.95 };

export function randomSpawnPos(arena, kind, wave = 1) {
  const pad = ARENA.enemySpawnPadding;
  const x = arena.x + pad + Math.random() * (arena.w - pad * 2);
  const range = wave === 2 ? WAVE2_SPAWN_Y_FRAC : KIND_SPAWN_Y_FRAC[kind];
  const minFrac = range?.min ?? 0.35;
  const maxFrac = range?.max ?? 1.0;
  const yMin = arena.y + arena.h * minFrac;
  const yMax = Math.min(arena.y + arena.h * maxFrac, arena.y + arena.h - pad);
  const y = yMin + Math.random() * (yMax - yMin);
  return { x, y };
}
