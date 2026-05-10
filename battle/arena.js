// Генерация локации: цепочка [arena, corridor, arena, corridor, ..., bossArena]
// Все рендерится в мировых координатах (worldX, worldY). Камера переводит мир в экран.

import { ARENA } from '../balance/visuals.js';
import {
  arenasForLocation, rollArenaComposition,
  ENEMY_BASE, ELITE_BASE, RANGED_BASE, HEAVY_BASE, SCALING, BOSS_BASE,
  bossStatsForLocation, bossNutDrop,
  enemyHpMultForLocation, enemyDamageMultForLocation,
} from '../balance/enemies.js';
import { BAR_BOSS, bossStatsForLevel } from '../balance/bar.js';

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
export function spawnPlanForArena(arena, locationIndex) {
  const out = [];
  for (const u of arena.composition.units) {
    for (let i = 0; i < u.count; i++) {
      out.push(buildEnemyTemplate(u, locationIndex, arena.index));
    }
  }
  return out;
}

function buildEnemyTemplate(unit, locationIndex, arenaIndex) {
  const sHp  = unit.scaleHp     ?? 1;
  const sDmg = unit.scaleDmg    ?? 1;
  const sR   = unit.scaleRadius ?? 1;

  if (unit.kind === 'boss') {
    const stats = bossStatsForLocation(locationIndex, arenaIndex);
    return {
      kind: 'boss',
      name: BOSS_BASE.name,
      hp: stats.hp * sHp,
      damage: stats.damage * sDmg,
      attackSpeed: BOSS_BASE.baseAttackSpeed,
      moveSpeed: BOSS_BASE.moveSpeed,
      bodyRadius: BOSS_BASE.bodyRadius * sR,
      color: BOSS_BASE.color,
      coinDrop: BOSS_BASE.baseCoinDrop * locationIndex,
      nutDrop: bossNutDrop(locationIndex),
      energyReward: BOSS_BASE.energyReward,
    };
  }
  if (unit.kind === 'elite') {
    return {
      kind: 'elite',
      name: ELITE_BASE.name,
      hp: scaleEnemyHp(ELITE_BASE.baseHp, locationIndex, arenaIndex) * sHp,
      damage: scaleEnemyDamage(ELITE_BASE.baseDamage, locationIndex, arenaIndex) * sDmg,
      attackSpeed: ELITE_BASE.baseAttackSpeed,
      moveSpeed: ELITE_BASE.moveSpeed,
      bodyRadius: ELITE_BASE.bodyRadius * sR,
      color: ELITE_BASE.color,
      coinDrop: ELITE_BASE.baseCoinDrop * locationIndex,
    };
  }
  if (unit.kind === 'ranged') {
    return {
      kind: 'ranged',
      name: RANGED_BASE.name,
      hp: scaleEnemyHp(RANGED_BASE.baseHp, locationIndex, arenaIndex) * sHp,
      damage: scaleEnemyDamage(RANGED_BASE.baseDamage, locationIndex, arenaIndex) * sDmg,
      attackSpeed: RANGED_BASE.baseAttackSpeed,
      moveSpeed: RANGED_BASE.moveSpeed,
      bodyRadius: RANGED_BASE.bodyRadius * sR,
      attackRange: RANGED_BASE.attackRange,
      color: RANGED_BASE.color,
      coinDrop: RANGED_BASE.baseCoinDrop * locationIndex,
    };
  }
  if (unit.kind === 'heavy') {
    return {
      kind: 'heavy',
      name: HEAVY_BASE.name,
      hp: scaleEnemyHp(HEAVY_BASE.baseHp, locationIndex, arenaIndex) * sHp,
      damage: scaleEnemyDamage(HEAVY_BASE.baseDamage, locationIndex, arenaIndex) * sDmg,
      attackSpeed: HEAVY_BASE.baseAttackSpeed,
      moveSpeed: HEAVY_BASE.moveSpeed,
      bodyRadius: HEAVY_BASE.bodyRadius * sR,
      windupDuration: HEAVY_BASE.windupDuration,
      slamRadius: HEAVY_BASE.slamRadius,
      color: HEAVY_BASE.color,
      coinDrop: HEAVY_BASE.baseCoinDrop * locationIndex,
    };
  }
  // regular
  return {
    kind: 'regular',
    name: ENEMY_BASE.name,
    hp: scaleEnemyHp(ENEMY_BASE.baseHp, locationIndex, arenaIndex) * sHp,
    damage: scaleEnemyDamage(ENEMY_BASE.baseDamage, locationIndex, arenaIndex) * sDmg,
    attackSpeed: ENEMY_BASE.baseAttackSpeed,
    moveSpeed: ENEMY_BASE.moveSpeed,
    bodyRadius: ENEMY_BASE.bodyRadius * sR,
    color: ENEMY_BASE.color,
    coinDrop: ENEMY_BASE.baseCoinDrop * locationIndex,
  };
}

// Бар-локация: одна арена, один босс. Скейлинг от уровня героя (max stat level).
export function buildBarLocation(heroLevel) {
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
    barBossLevel: heroLevel,
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

// Шаблон бар-босса. Отдельный kind 'bar_boss' (не 'boss') — ни лута, ни монет, ни энергии:
// логика дропа в rollDropForEnemy/rollShardDropForEnemy явно возвращает null для этого kind.
export function buildBarBossTemplate(bossLevel) {
  const s = bossStatsForLevel(bossLevel);
  const name = BAR_BOSS.names[Math.floor(Math.random() * BAR_BOSS.names.length)];
  return {
    kind: 'bar_boss',
    name,
    hp: s.hp,
    damage: s.damage,
    attackSpeed: BAR_BOSS.attackSpeed,
    moveSpeed: BAR_BOSS.moveSpeed,
    bodyRadius: BAR_BOSS.bodyRadius,
    color: BAR_BOSS.color,
    coinDrop: 0,
    energyReward: 0,
  };
}

export function randomSpawnPos(arena) {
  const pad = ARENA.enemySpawnPadding;
  const x = arena.x + pad + Math.random() * (arena.w - pad * 2);
  const yMin = arena.y + arena.h * 0.35;
  const yMax = arena.y + arena.h - pad;
  const y = yMin + Math.random() * (yMax - yMin);
  return { x, y };
}
