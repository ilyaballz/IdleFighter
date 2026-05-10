// Бой: state-машины героя/врагов, движение, автоатаки, формула урона, скиллы.

import { getEffectiveStat, heroState } from '../core/stats_layer.js';
import { spawnPlanForArena, randomSpawnPos, buildBarBossTemplate } from './arena.js';
import { logEvent } from '../core/logger.js';
import { SKILLS } from '../balance/skills.js';
import { FEEDBACK } from '../balance/visuals.js';
import { PLAYER } from '../balance/player.js';
import { arenaTypeLabel } from '../balance/enemies.js';
import { loadoutState, getSkillLevel } from '../core/loadout.js';
import { spawnDamageNumber, triggerSkillShake, spawnEffect } from '../core/fx.js';

// ───────── State enums ─────────

export const HERO_STATE = {
  MOVING_TO_NEXT_ARENA: 'MOVING_TO_NEXT_ARENA',
  IN_ARENA_COMBAT: 'IN_ARENA_COMBAT',
  IN_ARENA_PAUSE: 'IN_ARENA_PAUSE',
  DEAD: 'DEAD',
};

export const ENEMY_STATE = {
  IDLE: 'IDLE',
  CHASING: 'CHASING',
  ATTACKING: 'ATTACKING',
};

let nextEnemyId = 1;

// ───────── Hero / enemy factories ─────────

export function createHero(spawnPos) {
  const hero = {
    x: spawnPos.x,
    y: spawnPos.y,
    radius: getEffectiveStat('bodyRadius'),
    state: HERO_STATE.MOVING_TO_NEXT_ARENA,
    targetArenaIndex: 1,
    attackCooldown: 0,
    pauseTimer: 0,
    hitFlashUntil: 0,
    currentTargetId: null,
    // Per-run skill state
    skillCooldowns: {},   // skillId → seconds remaining
    rageCharges: 0,
    buffs: [],            // [{ type, endsAt, damageBonusPct?, atkSpdBonusPct? }]
    pendingSlam: null,    // { x, y, executeAt, skillId }
    castUntil: 0,         // мировое время — герой стоит во время каста
  };
  for (const id of Object.keys(SKILLS)) hero.skillCooldowns[id] = 0;
  return hero;
}

export function createEnemyFromTemplate(template, pos) {
  return {
    id: nextEnemyId++,
    x: pos.x,
    y: pos.y,
    radius: template.bodyRadius,
    color: template.color,
    name: template.name,
    kind: template.kind,
    hp: template.hp,
    maxHp: template.hp,
    damage: template.damage,
    attackSpeed: template.attackSpeed,
    moveSpeed: template.moveSpeed,
    coinDrop: template.coinDrop,
    nutDrop: template.nutDrop || 0,
    energyReward: template.energyReward || 0,
    attackRange: template.attackRange || 0,         // 0 = melee (стандартное поведение)
    windupDuration: template.windupDuration || 0,   // 0 = атакует мгновенно
    slamRadius: template.slamRadius || 0,           // > 0 → SLAM-AOE по завершении замаха
    windingUpUntil: 0,                              // мировое время — пока меньше, идёт замах
    windingUpStartedAt: 0,                          // для рендера прогресса (t = (now - start) / dur)
    state: ENEMY_STATE.IDLE,
    attackCooldown: 0,
    hitFlashUntil: 0,
    knockback: null,           // { vx, vy, until }
    dot: null,                 // { damagePerSec, expiresAt, nextTickAt, sourceSkill }
    bleedStacks: 0,            // стаки bleed (cut). 0 = не кровит. Тег для синергий.
    knockdownUntil: 0,         // мировое время — пока меньше, враг лежит, не двигается, не атакует
    markedUntil: 0,            // мировое время — пока меньше, цель помечена (приоритет для skill-targeting)
    alive: true,
  };
}

export function spawnArenaEnemies(arena, locationIndex) {
  // Спец-кейс: арена бара — один босс, отскейленный под уровень героя.
  if (arena.barBossLevel != null) {
    const tmpl = buildBarBossTemplate(arena.barBossLevel);
    return [createEnemyFromTemplate(tmpl, randomSpawnPos(arena))];
  }
  const plan = spawnPlanForArena(arena, locationIndex);
  const enemies = [];
  for (const tmpl of plan) {
    enemies.push(createEnemyFromTemplate(tmpl, randomSpawnPos(arena)));
  }
  return enemies;
}

// ───────── Runtime stat helpers (учитывают баффы, например Ярость) ─────────

export function getHeroDamageNow(hero) {
  const base = getEffectiveStat('damage');
  let mult = 1;
  for (const b of hero.buffs) mult += (b.damageBonusPct || 0);
  return base * mult;
}

export function getHeroAttackSpeedNow(hero) {
  const base = getEffectiveStat('attackSpeed');
  let mult = 1;
  for (const b of hero.buffs) mult += (b.atkSpdBonusPct || 0);
  return Math.min(base * mult, 100); // safety cap
}

// Crit-шанс с учётом активных баффов (combo консумит теги → даёт critChanceBonus).
// Баффы могут пробить базовый capCritChance, но не выше 0.95 — чтобы оставалось окно промаха.
export function getHeroCritChanceNow(hero) {
  let total = getEffectiveStat('critChance');
  for (const b of hero.buffs) total += (b.critChanceBonus || 0);
  return Math.min(total, 0.95);
}

export function isRageActive(hero) {
  return hero.buffs.some(b => b.type === 'rage');
}

// ───────── Movement helpers ─────────

function moveTowards(entity, target, speed, dt) {
  const dx = target.x - entity.x;
  const dy = target.y - entity.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.001) return 0;
  const step = Math.min(dist, speed * dt);
  entity.x += (dx / dist) * step;
  entity.y += (dy / dist) * step;
  return dist;
}

function applySeparation(enemies) {
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      if (!b.alive) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.001;
      const minDist = a.radius + b.radius + 4;
      if (dist < minDist) {
        const overlap = (minDist - dist) * 0.5;
        const nx = dx / dist;
        const ny = dy / dist;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;
      }
    }
  }
}

function clampInsideArena(ent, arena) {
  const minX = arena.x + ent.radius + 4;
  const maxX = arena.x + arena.w - ent.radius - 4;
  const minY = arena.y + ent.radius + 4;
  const maxY = arena.y + arena.h - ent.radius - 4;
  if (ent.x < minX) ent.x = minX;
  if (ent.x > maxX) ent.x = maxX;
  if (ent.y < minY) ent.y = minY;
  if (ent.y > maxY) ent.y = maxY;
}

// ───────── Damage application ─────────

function rollChance(p) { return Math.random() < p; }

function applyKnockback(enemy, fromX, fromY, dist, world) {
  const isBoss = enemy.kind === 'boss' || enemy.kind === 'bar_boss';
  const effDist = isBoss ? dist * FEEDBACK.knockback.bossResist : dist;
  if (effDist <= 0) return;
  const dx = enemy.x - fromX;
  const dy = enemy.y - fromY;
  const len = Math.hypot(dx, dy) || 0.001;
  const dur = FEEDBACK.knockback.duration;
  enemy.knockback = {
    vx: (dx / len) * (effDist / dur),
    vy: (dy / len) * (effDist / dur),
    until: world.timeNow + dur,
  };
}

// knockbackDist — physical отброс (только AoE-скиллы передают >0).
// def (опционально) — дефиниция скилла-источника. Если передана, dealDamage применяет
// per-target бонусы синергий (bonusVsBleedingPct, bonusVsKnockedDownPct). Возвращает
// фактически нанесённый урон (после бонусов и округления) — нужно вызывающему для
// корректной агрегации (lifesteal, totalDmg в логе).
function dealDamage(enemy, amount, isCrit, fromX, fromY, world, knockbackDist = 0, def = null) {
  if (!enemy.alive) return 0;
  let mult = 1;
  if (def) {
    if (def.bonusVsBleedingPct && (enemy.bleedStacks || 0) > 0) mult += def.bonusVsBleedingPct;
    if (def.bonusVsKnockedDownPct && enemy.knockdownUntil > world.timeNow) mult += def.bonusVsKnockedDownPct;
    if (def.bonusVsMarkedPct && enemy.markedUntil > world.timeNow) mult += def.bonusVsMarkedPct;
  }
  const finalAmount = Math.max(1, Math.round(amount * mult));
  enemy.hp -= finalAmount;
  enemy.hitFlashUntil = world.timeNow + FEEDBACK.hitFlash.duration;
  if (knockbackDist > 0) applyKnockback(enemy, fromX, fromY, knockbackDist, world);
  spawnDamageNumber(enemy.x, enemy.y - enemy.radius - 6, finalAmount, isCrit, world.timeNow);
  if (enemy.hp <= 0) {
    enemy.alive = false;
    enemy.dot = null;
    enemy.bleedStacks = 0;
    enemy.markedUntil = 0;
    world.onEnemyKilled?.(enemy);
  }
  return finalAmount;
}

function heroAutoAttack(hero, enemy, world) {
  const dmg = getHeroDamageNow(hero);
  const critChance = getHeroCritChanceNow(hero);
  const isCrit = rollChance(critChance);
  const finalDmg = dmg * (isCrit ? getEffectiveStat('critMultiplier') : 1);
  dealDamage(enemy, finalDmg, isCrit, hero.x, hero.y, world);
  if (isCrit) logEvent(`КРИТ! ${Math.round(finalDmg)} по ${enemy.name}`, 'crit');

  // Заряды Ярости — кэп на maxCharges
  hero.rageCharges = Math.min(SKILLS.rage.maxCharges,
                              hero.rageCharges + SKILLS.rage.chargesPerAutoAttack);
}

// Универсальный проход урона по герою — используется и melee-атаками, и приземлением projectile.
// Возвращает true, если урон прошёл (ложь — увернулся).
function damageHero(damage, sourceName, hero, world) {
  const dodge = getEffectiveStat('dodgeChance');
  if (rollChance(dodge)) {
    logEvent(`Уворот от ${sourceName}`);
    return false;
  }
  const def = getEffectiveStat('defense');
  const finalDmg = Math.max(1, Math.round(damage * (1 - def)));
  heroState.currentHp -= finalDmg;
  hero.hitFlashUntil = world.timeNow + FEEDBACK.hitFlash.duration;
  if (heroState.currentHp <= 0) {
    heroState.currentHp = 0;
    hero.state = HERO_STATE.DEAD;
    logEvent(`Герой пал. ${sourceName} нанёс ${finalDmg}.`, 'warn');
  }
  return true;
}

function enemyAttackHero(enemy, hero, world) {
  damageHero(enemy.damage, enemy.name, hero, world);
}

// Бросок projectile от ranged-врага. Snapshot позиции героя на момент броска —
// projectile полетит туда, и приземлится на позиции мыши^W героя через PROJECTILE_DURATION.
const PROJECTILE_DURATION = 0.6;
const PROJECTILE_LANDING_RADIUS = 32;

function rangedEnemyAttack(enemy, hero, world) {
  if (!world.projectiles) world.projectiles = [];
  world.projectiles.push({
    sourceName: enemy.name,
    damage: enemy.damage,
    startX: enemy.x,
    startY: enemy.y,
    targetX: hero.x,         // snapshot позиции героя
    targetY: hero.y,
    x: enemy.x,              // текущая позиция (для рендера)
    y: enemy.y,
    startTime: world.timeNow,
    duration: PROJECTILE_DURATION,
    color: '#ff7e3e',
    landingRadius: PROJECTILE_LANDING_RADIUS,
    alive: true,
  });
}

// Обновление projectile'ов: летят по прямой start→target за duration, на t≥1 проверяют
// попадание (расстояние от landing-точки до героя ≤ landingRadius + heroRadius).
function updateProjectiles(world, dt) {
  const list = world.projectiles;
  if (!list || list.length === 0) return;
  const hero = world.hero;
  for (const p of list) {
    if (!p.alive) continue;
    const t = (world.timeNow - p.startTime) / p.duration;
    if (t >= 1) {
      // Приземление — урон если герой в landing AoE.
      const distToHero = Math.hypot(p.targetX - hero.x, p.targetY - hero.y);
      if (distToHero <= p.landingRadius + hero.radius && hero.state !== HERO_STATE.DEAD) {
        damageHero(p.damage, p.sourceName, hero, world);
      }
      // FX взрыва — расходящийся круг
      spawnEffect({ type: 'expandingRing', x: p.targetX, y: p.targetY, fromRadius: 4,
                    toRadius: p.landingRadius, color: p.color, lineWidth: 3, duration: 0.32 },
                  world.timeNow);
      spawnEffect({ type: 'pulse', x: p.targetX, y: p.targetY, radius: p.landingRadius * 0.7,
                    color: p.color, alpha: 0.4, duration: 0.28 }, world.timeNow);
      p.alive = false;
    } else {
      // Линейная интерполяция по полёту.
      p.x = p.startX + (p.targetX - p.startX) * t;
      p.y = p.startY + (p.targetY - p.startY) * t;
    }
  }
  // Очистка мёртвых.
  for (let i = list.length - 1; i >= 0; i--) {
    if (!list[i].alive) list.splice(i, 1);
  }
}

// ───────── Skills ─────────

// Rate-based CDR: эффCD = baseCD / (1 + global_rate + local_rate).
// global берётся с эквипа+перков, local — от уровня конкретного скилла (cdRateBonusPerLvl).
// Diminishing returns встроен — 100% rate сокращает КД вдвое, 200% — в три раза, и т.д.
export function localCdRateForSkill(skillId) {
  const def = SKILLS[skillId];
  if (!def?.cdRateBonusPerLvl) return 0;
  const lvl = getSkillLevel(skillId);
  return Math.max(0, lvl - 1) * def.cdRateBonusPerLvl;
}

function skillCooldownAfterCdr(baseCd, skillId) {
  const globalRate = getEffectiveStat('skillCdrPct');
  const localRate = localCdRateForSkill(skillId);
  return Math.max(0.1, baseCd / (1 + globalRate + localRate));
}

// Level-scale множитель: 1× на lvl 1, +levelBonusPerLvl за каждый следующий уровень.
function lvlMult(def, lvl) {
  return 1 + (lvl - 1) * def.levelBonusPerLvl;
}

function skillDamageMultiplier(skillDef, level) {
  return skillDef.baseDamageMultiplier * lvlMult(skillDef, level);
}

function findNearestAliveEnemy(arena, fromX, fromY) {
  if (!arena || !arena.enemies) return null;
  let best = null;
  let bestD = Infinity;
  for (const e of arena.enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.x - fromX, e.y - fromY);
    if (d < bestD) { best = e; bestD = d; }
  }
  return best;
}

function findFurthestAliveEnemy(arena, fromX, fromY) {
  if (!arena || !arena.enemies) return null;
  let best = null;
  let bestD = -1;
  for (const e of arena.enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.x - fromX, e.y - fromY);
    if (d > bestD) { best = e; bestD = d; }
  }
  return best;
}

function findMarkedAliveEnemy(arena, world) {
  if (!arena || !arena.enemies) return null;
  for (const e of arena.enemies) {
    if (e.alive && e.markedUntil > world.timeNow) return e;
  }
  return null;
}

// Есть ли на враге хотя бы один тег синергии (bleed/KD/marked). Универсальный consumer
// (combo) использует это для решения «усиливать ли бафф крит-чансом».
function enemyHasAnyTag(enemy, world) {
  return (enemy.bleedStacks || 0) > 0
      || enemy.knockdownUntil > world.timeNow
      || enemy.markedUntil > world.timeNow;
}

// Враги, чей центр попадает в полосу шириной width вдоль отрезка ax,ay → bx,by.
function getEnemiesInLine(arena, ax, ay, bx, by, width) {
  const out = [];
  if (!arena || !arena.enemies) return out;
  const dx = bx - ax, dy = by - ay;
  const segLen2 = dx * dx + dy * dy;
  if (segLen2 < 0.001) return out;
  for (const e of arena.enemies) {
    if (!e.alive) continue;
    const ex = e.x - ax, ey = e.y - ay;
    let t = (ex * dx + ey * dy) / segLen2;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const px = ax + dx * t, py = ay + dy * t;
    const d = Math.hypot(e.x - px, e.y - py);
    if (d <= width / 2 + e.radius) out.push(e);
  }
  return out;
}

function getEnemiesInRadius(arena, cx, cy, radius) {
  const out = [];
  if (!arena || !arena.enemies) return out;
  for (const e of arena.enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.x - cx, e.y - cy);
    if (d <= radius + e.radius) out.push(e);
  }
  return out;
}

export function isSkillReady(hero, skillId) {
  const def = SKILLS[skillId];
  if (!def) return false;
  if (def.activation === 'cooldown') return (hero.skillCooldowns[skillId] || 0) <= 0;
  if (def.activation === 'charges') return hero.rageCharges >= def.minCharges;
  return false;
}

// Возвращает true, если активация прошла
export function activateSkill(hero, skillId, world) {
  const def = SKILLS[skillId];
  if (!def) return false;
  if (hero.state === HERO_STATE.DEAD) return false;
  if (hero.castUntil > world.timeNow) return false;
  if (!isSkillReady(hero, skillId)) return false;

  const lvl = getSkillLevel(skillId);
  const arena = world.location.arenas[hero.targetArenaIndex - 1];
  // Флаг для combo-style универсального consumer'а: если в case-обработке выяснилось,
  // что цель имела активный тег (bleed/KD/marked), buffOnUse-блок ниже добавит
  // critChanceBonusIfTagged в применяемый бафф.
  let comboTaggedBonus = false;

  switch (def.targetType) {
    case 'single': {
      const target = findNearestAliveEnemy(arena, hero.x, hero.y);
      if (!target) return false;
      // Снапшоты тегов: damage-бонусы применяет сам dealDamage по def, а здесь читаются
      // для логирования и универсального combo-консумера (флаг comboTaggedBonus ниже).
      const wasBleeding = (target.bleedStacks || 0) > 0;
      const wasMarked = target.markedUntil > world.timeNow;
      const targetHadAnyTag = enemyHasAnyTag(target, world);
      const dmgPerHit = getHeroDamageNow(hero) * skillDamageMultiplier(def, lvl);
      const critChance = getHeroCritChanceNow(hero) + (def.bonusCritChance || 0);
      const hits = def.hits || 1;
      // FX по типу скилла (рендерится сразу для всех хитов)
      if (skillId === 'hook') {
        spawnEffect({ type: 'strike', fromX: hero.x, fromY: hero.y, toX: target.x, toY: target.y,
                      color: '#ff7e3e', duration: 0.18 }, world.timeNow);
        spawnEffect({ type: 'expandingRing', x: target.x, y: target.y, fromRadius: 4, toRadius: 22,
                      color: '#ff7e3e', lineWidth: 3, duration: 0.28 }, world.timeNow);
      } else if (skillId === 'cut') {
        const ang = Math.atan2(target.y - hero.y, target.x - hero.x) + Math.PI / 4;
        spawnEffect({ type: 'slash', x: target.x, y: target.y, angle: ang, length: 56,
                      color: '#5be35b', duration: 0.32 }, world.timeNow);
        spawnEffect({ type: 'slash', x: target.x, y: target.y, angle: ang + Math.PI / 8, length: 40,
                      color: '#a8ff8e', duration: 0.32 }, world.timeNow);
      } else if (skillId === 'spinkick') {
        spawnEffect({ type: 'spiral', x: hero.x, y: hero.y, maxRadius: 36, turns: 1.6,
                      color: '#4fd6ff', duration: 0.32 }, world.timeNow);
        spawnEffect({ type: 'strike', fromX: hero.x, fromY: hero.y, toX: target.x, toY: target.y,
                      color: '#4fd6ff', duration: 0.18 }, world.timeNow);
        spawnEffect({ type: 'expandingRing', x: target.x, y: target.y, fromRadius: 4, toRadius: 26,
                      color: '#ffd23f', lineWidth: 3, duration: 0.32 }, world.timeNow);
      } else if (skillId === 'double_strike') {
        // Две линии под небольшим углом — визуально читается "1-2"
        const ang = Math.atan2(target.y - hero.y, target.x - hero.x);
        const off = 10;
        const ox = Math.sin(ang) * off, oy = -Math.cos(ang) * off;
        spawnEffect({ type: 'strike', fromX: hero.x + ox, fromY: hero.y + oy,
                      toX: target.x + ox, toY: target.y + oy,
                      color: '#ffffff', duration: 0.16 }, world.timeNow);
        spawnEffect({ type: 'strike', fromX: hero.x - ox, fromY: hero.y - oy,
                      toX: target.x - ox, toY: target.y - oy,
                      color: '#ff7e3e', duration: 0.16 }, world.timeNow);
        spawnEffect({ type: 'expandingRing', x: target.x, y: target.y, fromRadius: 4, toRadius: 24,
                      color: '#ff7e3e', lineWidth: 3, duration: 0.32 }, world.timeNow);
      } else if (skillId === 'combo') {
        spawnEffect({ type: 'strike', fromX: hero.x, fromY: hero.y, toX: target.x, toY: target.y,
                      color: '#4fd6ff', duration: 0.16 }, world.timeNow);
        spawnEffect({ type: 'expandingRing', x: target.x, y: target.y, fromRadius: 3, toRadius: 18,
                      color: '#4fd6ff', lineWidth: 2, duration: 0.25 }, world.timeNow);
      }

      const critMult = getEffectiveStat('critMultiplier');
      let totalDmg = 0;
      let critCount = 0;
      for (let i = 0; i < hits; i++) {
        if (!target.alive) break;
        const isCrit = rollChance(critChance);
        const finalDmg = dmgPerHit * (isCrit ? critMult : 1);
        if (isCrit) critCount++;
        totalDmg += dealDamage(target, finalDmg, isCrit, hero.x, hero.y, world, 0, def);
      }
      if (def.dot && target.alive) {
        target.bleedStacks = 1;   // бинарный тег "кровит"
        const dps = getHeroDamageNow(hero) * def.dot.damagePctPerSec * lvlMult(def, lvl);
        target.dot = {
          damagePerSec: dps,
          expiresAt: world.timeNow + def.dot.durationSec,
          nextTickAt: world.timeNow + 1.0,
          sourceSkill: skillId,
        };
      }
      // Marked applier (hook): помечает цель и стирает прошлые маркеры — приоритет всегда один.
      if (def.appliesMarkedSec && target.alive) {
        for (const e of arena.enemies) {
          e.markedUntil = (e === target) ? world.timeNow + def.appliesMarkedSec : 0;
        }
      }
      // Knockdown applier (например spinkick): кладёт цель на knockdownSec × lvlMult.
      // Если цель уже лежит — берём максимум, чтобы новый KD не сократил предыдущий.
      if (def.knockdownSec && target.alive) {
        const kdSec = def.knockdownSec * lvlMult(def, lvl);
        target.knockdownUntil = Math.max(target.knockdownUntil, world.timeNow + kdSec);
      }
      // Combo универсальный consumer: если цель имела любой тег — buffOnUse ниже усилится crit-чансом.
      if (targetHadAnyTag && def.buffOnUse?.critChanceBonusIfTagged) {
        comboTaggedBonus = true;
      }
      const critTag = critCount === 0 ? '' : critCount === hits ? ' (всё криты!)' : ` (${critCount} крит)`;
      let tagSuffix = '';
      if (def.dot && target.alive) {
        tagSuffix += ' 🩸';
      } else if (wasBleeding && def.bonusVsBleedingPct) {
        tagSuffix += ` 🩸+${Math.round(def.bonusVsBleedingPct * 100)}%`;
      }
      if (def.appliesMarkedSec && target.alive) {
        tagSuffix += ' 🎯';
      } else if (wasMarked && def.bonusVsMarkedPct) {
        tagSuffix += ` 🎯+${Math.round(def.bonusVsMarkedPct * 100)}%`;
      }
      if (def.knockdownSec && target.alive) {
        tagSuffix += ' ⤵️';
      }
      logEvent(`${def.name}: ${Math.round(totalDmg)}${hits > 1 ? ` × ${hits}` : ''} по ${target.name}${critTag}${tagSuffix}`);
      break;
    }
    case 'aoe_around_self': {
      const enemies = getEnemiesInRadius(arena, hero.x, hero.y, def.aoeRadius);
      if (enemies.length === 0) return false;
      // FX по скиллу
      const isBlood = !!def.lifestealPct;
      const ringColor  = isBlood ? '#e63946' : '#4fd6ff';
      const pulseColor = isBlood ? '#a02030' : '#4fd6ff';
      spawnEffect({ type: 'expandingRing', x: hero.x, y: hero.y, fromRadius: 6, toRadius: def.aoeRadius,
                    color: ringColor, lineWidth: 4, duration: 0.4 }, world.timeNow);
      spawnEffect({ type: 'pulse', x: hero.x, y: hero.y, radius: def.aoeRadius * 0.55,
                    color: pulseColor, alpha: 0.4, duration: 0.32 }, world.timeNow);

      const baseDmg = getHeroDamageNow(hero) * skillDamageMultiplier(def, lvl);
      const kdSec = def.knockdownSec ? def.knockdownSec * lvlMult(def, lvl) : 0;
      const critChance = getHeroCritChanceNow(hero);
      const critMult = getEffectiveStat('critMultiplier');
      let killed = 0;
      let totalDealt = 0;
      let bleedDealt = 0;          // фактический урон по кровящим (для bonus-lifesteal в bloodlust)
      let bleedHits = 0;
      let kdHits = 0;              // сколько лежачих было в момент удара (для лога)
      for (const e of enemies) {
        const wasBleeding = (e.bleedStacks || 0) > 0;
        const wasKnockedDown = e.knockdownUntil > world.timeNow;
        const isCrit = rollChance(critChance);
        const fdmg = baseDmg * (isCrit ? critMult : 1);
        const dealt = dealDamage(e, fdmg, isCrit, hero.x, hero.y, world, def.knockback || 0, def);
        if (kdSec > 0 && e.alive) {
          e.knockdownUntil = Math.max(e.knockdownUntil, world.timeNow + kdSec);
        }
        totalDealt += dealt;
        if (wasBleeding) { bleedDealt += dealt; bleedHits++; }
        if (wasKnockedDown) kdHits++;
        if (!e.alive) killed++;
      }
      // Лайфстил для Кровожадности — per-enemy: с кровящих × bleedLifestealMultiplier.
      // Ярость даёт общий ×lifestealMultiplierIfRage (применяется поверх всех ставок).
      if (def.lifestealPct || def.minHealPct) {
        const maxHp = getEffectiveStat('maxHp');
        const rageLsMult = (def.lifestealMultiplierIfRage && isRageActive(hero)) ? def.lifestealMultiplierIfRage : 1;
        const baseLs = (def.lifestealPct || 0) * rageLsMult;
        const bleedMult = def.bleedLifestealMultiplier || 1;
        const lifestealAmt = (totalDealt - bleedDealt) * baseLs + bleedDealt * baseLs * bleedMult;
        const minHealAmt   = maxHp * (def.minHealPct || 0);
        const heal = Math.round(Math.max(lifestealAmt, minHealAmt));
        if (heal > 0) {
          heroState.currentHp = Math.min(maxHp, heroState.currentHp + heal);
          spawnDamageNumber(hero.x, hero.y - hero.radius - 6, heal, false, world.timeNow);
          spawnEffect({ type: 'pulse', x: hero.x, y: hero.y, radius: 32, color: '#5be35b',
                        alpha: 0.45, duration: 0.4 }, world.timeNow);
        }
      }
      const healTag = def.lifestealPct ? ', +HP' : '';
      const bleedTag = (def.bleedLifestealMultiplier && bleedHits > 0)
        ? ` (×${def.bleedLifestealMultiplier} 🩸 по ${bleedHits})` : '';
      const kdTag = (def.bonusVsKnockedDownPct && kdHits > 0)
        ? ` 💢+${Math.round(def.bonusVsKnockedDownPct * 100)}% × ${kdHits}` : '';
      logEvent(`${def.name}: задел ${enemies.length}${killed ? `, убито ${killed}` : ''}${healTag}${bleedTag}${kdTag}`);
      break;
    }
    case 'aoe_landing': {
      // Точка приземления: помеченная цель (если есть и prefersMarkedTarget), иначе ближайший враг.
      let target = null;
      if (def.prefersMarkedTarget) target = findMarkedAliveEnemy(arena, world);
      if (!target) target = findNearestAliveEnemy(arena, hero.x, hero.y);
      const land = target ? { x: target.x, y: target.y } : { x: hero.x, y: hero.y };
      const castDelay = def.castDelaySec
        * ((def.castDelayMultIfRage && isRageActive(hero)) ? def.castDelayMultIfRage : 1);
      hero.pendingSlam = {
        x: land.x,
        y: land.y,
        executeAt: world.timeNow + castDelay,
        skillId,
      };
      hero.castUntil = world.timeNow + castDelay;
      logEvent(`${def.name}: прыжок (${castDelay.toFixed(1)}с)`);
      break;
    }
    case 'self_buff': {
      // Ярость: длительность зависит от текущих зарядов (linear от minCharges → maxCharges).
      let durSec = def.durationSec ?? 0;
      if (def.minCharges != null && def.maxCharges != null) {
        const c = Math.max(def.minCharges, Math.min(def.maxCharges, hero.rageCharges));
        const t = (c - def.minCharges) / (def.maxCharges - def.minCharges);
        durSec = def.minDurationSec + t * (def.maxDurationSec - def.minDurationSec);
      }
      const rageLvlMult = lvlMult(def, lvl);
      hero.buffs.push({
        type: 'rage',
        endsAt: world.timeNow + durSec,
        damageBonusPct: def.bonusDamagePct * rageLvlMult,
        atkSpdBonusPct: def.bonusAttackSpeedPct * rageLvlMult,
      });
      // FX: вспышка-взрыв оранжевого, кольцо
      spawnEffect({ type: 'pulse', x: hero.x, y: hero.y, radius: 50, color: '#ff7e3e',
                    alpha: 0.6, duration: 0.35 }, world.timeNow);
      spawnEffect({ type: 'expandingRing', x: hero.x, y: hero.y, fromRadius: 6, toRadius: 70,
                    color: '#ff7e3e', lineWidth: 4, duration: 0.45 }, world.timeNow);
      logEvent(`${def.name}! +${Math.round(def.bonusDamagePct * 100)}% урона на ${durSec.toFixed(1)}с`, 'crit');
      break;
    }
    case 'dash_line': {
      // Цель рывка: помеченная (если есть и prefersMarkedTarget), иначе самый дальний.
      let target = null;
      if (def.prefersMarkedTarget) target = findMarkedAliveEnemy(arena, world);
      if (!target) target = findFurthestAliveEnemy(arena, hero.x, hero.y);
      if (!target) return false;
      const startX = hero.x, startY = hero.y;
      const dx = target.x - startX, dy = target.y - startY;
      const dist = Math.hypot(dx, dy) || 0.001;
      const nx = dx / dist, ny = dy / dist;
      // Линия урона тянется ДО позиции target (включая её) — иначе сама цель
      // не попадает в getEnemiesInLine из-за разрыва на stopGap.
      const lineEndX = target.x;
      const lineEndY = target.y;
      // Герой останавливается перед target, не залезая внутрь.
      const stopGap = target.radius + hero.radius + 4;
      const heroEndX = startX + nx * Math.max(0, dist - stopGap);
      const heroEndY = startY + ny * Math.max(0, dist - stopGap);
      // Rage synergy: полоса рывка шире → больше врагов в линии.
      const widthMult = (def.pathWidthMultiplierIfRage && isRageActive(hero)) ? def.pathWidthMultiplierIfRage : 1;
      const effPathWidth = def.pathWidth * widthMult;
      const enemies = getEnemiesInLine(arena, startX, startY, lineEndX, lineEndY, effPathWidth);
      // FX: трасса до target, кольца на старте/финише героя
      spawnEffect({ type: 'strike', fromX: startX, fromY: startY, toX: lineEndX, toY: lineEndY,
                    color: '#ffd23f', duration: 0.22 }, world.timeNow);
      spawnEffect({ type: 'expandingRing', x: startX, y: startY, fromRadius: 4, toRadius: 30,
                    color: '#ffd23f', lineWidth: 3, duration: 0.32 }, world.timeNow);
      spawnEffect({ type: 'expandingRing', x: target.x, y: target.y, fromRadius: 4, toRadius: 36,
                    color: '#ffd23f', lineWidth: 3, duration: 0.32 }, world.timeNow);
      const lm = lvlMult(def, lvl);
      const baseDmg = getHeroDamageNow(hero);
      const targetMult = def.baseDamageMultiplier * lm;
      const pathMult = def.pathDamageMultiplier * lm;
      const critChance = getHeroCritChanceNow(hero);
      const critMult = getEffectiveStat('critMultiplier');
      let killed = 0;
      for (const e of enemies) {
        const isCrit = rollChance(critChance);
        const m = (e.id === target.id) ? targetMult : pathMult;
        const fdmg = baseDmg * m * (isCrit ? critMult : 1);
        dealDamage(e, fdmg, isCrit, startX, startY, world, 0, def);
        if (!e.alive) killed++;
      }
      // Телепорт героя + переключение прилипания на цель рывка (если жива).
      hero.x = heroEndX;
      hero.y = heroEndY;
      clampInsideArena(hero, arena);
      hero.currentTargetId = target.alive ? target.id : null;
      logEvent(`${def.name}: задел ${enemies.length}${killed ? `, убито ${killed}` : ''}`);
      break;
    }
    case 'self_heal': {
      const maxHp = getEffectiveStat('maxHp');
      const healPct = def.healPctOfMaxHp * lvlMult(def, lvl);
      const heal = Math.round(maxHp * healPct);
      heroState.currentHp = Math.min(maxHp, heroState.currentHp + heal);
      spawnDamageNumber(hero.x, hero.y - hero.radius - 6, heal, false, world.timeNow);
      // FX: зелёный пульс + расходящееся кольцо
      spawnEffect({ type: 'pulse', x: hero.x, y: hero.y, radius: 38, color: '#5be35b',
                    alpha: 0.5, duration: 0.35 }, world.timeNow);
      spawnEffect({ type: 'expandingRing', x: hero.x, y: hero.y, fromRadius: 6, toRadius: 50,
                    color: '#5be35b', lineWidth: 3, duration: 0.5 }, world.timeNow);
      logEvent(`${def.name}: +${heal} HP`);
      break;
    }
    default:
      console.warn('Unknown skill targetType:', def.targetType);
      return false;
  }

  // Универсальный buffOnUse — применяется любым скиллом, у которого он указан. Скейлится с уровнем.
  if (def.buffOnUse) {
    const b = def.buffOnUse;
    const lm = lvlMult(def, lvl);
    const atkSpd = (b.atkSpdBonusPct || 0) * lm;
    const dmg    = (b.damageBonusPct  || 0) * lm;
    const critChance = comboTaggedBonus ? (b.critChanceBonusIfTagged || 0) * lm : 0;
    hero.buffs.push({
      type: 'speed',
      endsAt: world.timeNow + b.durationSec,
      atkSpdBonusPct: atkSpd,
      damageBonusPct: dmg,
      critChanceBonus: critChance,
    });
    spawnEffect({ type: 'expandingRing', x: hero.x, y: hero.y, fromRadius: 4, toRadius: 50,
                  color: '#4fd6ff', lineWidth: 3, duration: 0.32 }, world.timeNow);
    if (atkSpd) {
      const critTag = critChance ? ` +${Math.round(critChance * 100)}% крит-шанс (тег)` : '';
      logEvent(`${def.name}: +${Math.round(atkSpd * 100)}% ск.атаки${critTag} на ${b.durationSec}с`);
    }
  }

  // Списать ресурс / поставить КД
  if (def.activation === 'cooldown') {
    let cd = skillCooldownAfterCdr(def.baseCooldown, skillId);
    if (def.cdMultiplierIfRage && isRageActive(hero)) cd *= def.cdMultiplierIfRage;
    hero.skillCooldowns[skillId] = cd;
    // Cooldown-скилл генерит заряды Ярости. Charges-скиллы (сама Ярость) — нет.
    const rageDef = SKILLS.rage;
    if (rageDef?.chargesPerSkillCast) {
      hero.rageCharges = Math.min(rageDef.maxCharges,
                                  hero.rageCharges + rageDef.chargesPerSkillCast);
    }
  } else if (def.activation === 'charges') {
    hero.rageCharges = 0;
  }
  // Шейк камеры на использование скилла (slam — отложенно, в executePendingSlam)
  if (def.targetType !== 'aoe_landing') triggerSkillShake(world.timeNow);
  return true;
}

function executePendingSlam(hero, world) {
  const ps = hero.pendingSlam;
  hero.pendingSlam = null;
  const def = SKILLS[ps.skillId];
  const lvl = getSkillLevel(ps.skillId);
  const arena = world.location.arenas[hero.targetArenaIndex - 1];
  const enemies = getEnemiesInRadius(arena, ps.x, ps.y, def.aoeRadius);
  // Герой телепортируется в точку приземления
  hero.x = ps.x;
  hero.y = ps.y;
  if (arena) clampInsideArena(hero, arena);
  // FX: ударная волна — два кольца + центральный пульс
  spawnEffect({ type: 'expandingRing', x: ps.x, y: ps.y, fromRadius: 8, toRadius: def.aoeRadius * 1.05,
                color: '#ffd23f', lineWidth: 5, duration: 0.45 }, world.timeNow);
  spawnEffect({ type: 'expandingRing', x: ps.x, y: ps.y, fromRadius: 4, toRadius: def.aoeRadius * 0.7,
                color: '#ffffff', lineWidth: 3, duration: 0.32 }, world.timeNow);
  spawnEffect({ type: 'pulse', x: ps.x, y: ps.y, radius: def.aoeRadius * 0.6,
                color: '#ffd23f', alpha: 0.45, duration: 0.3 }, world.timeNow);
  const baseDmg = getHeroDamageNow(hero) * skillDamageMultiplier(def, lvl);
  const critChance = getHeroCritChanceNow(hero);
  const critMult = getEffectiveStat('critMultiplier');
  const kdSec = (def.knockdownSec || 1.5) * lvlMult(def, lvl);
  let killed = 0;
  let kdHits = 0;       // сколько лежачих было задето (для лога)
  let kdApplied = 0;    // сколько новых положили нокдаун-шансом
  for (const e of enemies) {
    const wasKnockedDown = e.knockdownUntil > world.timeNow;
    const isCrit = rollChance(critChance);
    const fdmg = baseDmg * (isCrit ? critMult : 1);
    dealDamage(e, fdmg, isCrit, ps.x, ps.y, world, def.knockback || 0, def);
    if (wasKnockedDown) kdHits++;
    // Knockdown-шанс — только тех, кто ещё не лежит и выжил после удара.
    if (e.alive && !wasKnockedDown && def.knockdownChance && rollChance(def.knockdownChance)) {
      e.knockdownUntil = Math.max(e.knockdownUntil, world.timeNow + kdSec);
      kdApplied++;
    }
    if (!e.alive) killed++;
  }
  triggerSkillShake(world.timeNow);
  const kdHitsTag = (def.bonusVsKnockedDownPct && kdHits > 0)
    ? ` 💢+${Math.round(def.bonusVsKnockedDownPct * 100)}% × ${kdHits}` : '';
  const kdAppliedTag = kdApplied > 0 ? ` ⤵️${kdApplied}` : '';
  logEvent(`Приземление: задел ${enemies.length}${killed ? `, убито ${killed}` : ''}${kdHitsTag}${kdAppliedTag}`);
}


// ───────── DoT и баффы ─────────

function tickDots(arena, world) {
  if (!arena || !arena.enemies) return;
  for (const e of arena.enemies) {
    if (!e.alive || !e.dot) continue;
    if (world.timeNow >= e.dot.expiresAt) {
      e.dot = null;
      e.bleedStacks = 0;
      continue;
    }
    while (world.timeNow >= e.dot.nextTickAt) {
      // Источник DoT не зависит от позиции — кнокбэк направим от центра врага слегка в сторону героя
      dealDamage(e, e.dot.damagePerSec, false, world.hero.x, world.hero.y, world);
      e.dot.nextTickAt += 1.0;
      if (!e.alive) break;
    }
  }
}

function tickHeroBuffs(hero, world) {
  if (hero.buffs.length === 0) return;
  hero.buffs = hero.buffs.filter(b => b.endsAt > world.timeNow);
}

function tickHeroCooldowns(hero, dt) {
  for (const id of Object.keys(hero.skillCooldowns)) {
    if (hero.skillCooldowns[id] > 0) {
      hero.skillCooldowns[id] = Math.max(0, hero.skillCooldowns[id] - dt);
    }
  }
}

// ───────── Главный update ─────────

export function updateBattle(world, dt) {
  const { hero, location } = world;
  if (hero.state === HERO_STATE.DEAD) return;

  world.timeNow += dt;

  tickHeroCooldowns(hero, dt);
  tickHeroBuffs(hero, world);

  // Регенерация HP
  const maxHp = getEffectiveStat('maxHp');
  if (hero.state === HERO_STATE.IN_ARENA_COMBAT) {
    heroState.currentHp += maxHp * getEffectiveStat('hpRegenInBattle') * dt;
  } else if (hero.state === HERO_STATE.IN_ARENA_PAUSE
          || hero.state === HERO_STATE.MOVING_TO_NEXT_ARENA) {
    heroState.currentHp += maxHp * getEffectiveStat('hpRegenBetweenWaves') * dt;
  }
  if (heroState.currentHp > maxHp) heroState.currentHp = maxHp;

  // Pending slam
  if (hero.pendingSlam && world.timeNow >= hero.pendingSlam.executeAt) {
    executePendingSlam(hero, world);
  }

  // Поведение героя
  switch (hero.state) {
    case HERO_STATE.MOVING_TO_NEXT_ARENA:
      heroMoveToNextArena(hero, world, dt);
      break;
    case HERO_STATE.IN_ARENA_COMBAT:
      heroCombat(hero, world, dt);
      break;
    case HERO_STATE.IN_ARENA_PAUSE:
      hero.pauseTimer -= dt;
      if (hero.pauseTimer <= 0) {
        const currentArena = location.arenas[hero.targetArenaIndex - 1];
        if (currentArena.index === location.arenas.length) {
          if (!world.locationClearedFired) {
            world.locationClearedFired = true;
            world.onLocationCleared?.();
          }
          return;
        }
        hero.targetArenaIndex += 1;
        hero.state = HERO_STATE.MOVING_TO_NEXT_ARENA;
      }
      break;
  }

  const currentArena = location.arenas[hero.targetArenaIndex - 1];
  if (currentArena && currentArena.activated) {
    updateEnemies(currentArena, world, dt);
    tickDots(currentArena, world);
  }
  updateProjectiles(world, dt);
}

function heroMoveToNextArena(hero, world, dt) {
  const { location } = world;
  const targetArena = location.arenas[hero.targetArenaIndex - 1];
  if (!targetArena) return;
  // Между аренами герой бежит ускоренно — динамики ради.
  const moveSpeed = getEffectiveStat('moveSpeed') * (PLAYER.corridorSpeedMultiplier || 1);
  const target = targetArena.entryPoint;
  moveTowards(hero, target, moveSpeed, dt);
  const insideArena = hero.x >= targetArena.x && hero.x <= targetArena.x + targetArena.w
                   && hero.y >= targetArena.y && hero.y <= targetArena.y + targetArena.h;
  if (insideArena) {
    activateArena(targetArena, world);
    hero.state = HERO_STATE.IN_ARENA_COMBAT;
  }
}

function activateArena(arena, world) {
  if (arena.activated) return;
  arena.activated = true;
  arena.enemies = spawnArenaEnemies(arena, world.location.locationIndex);
  for (const e of arena.enemies) e.state = ENEMY_STATE.CHASING;
  const tag = arenaTypeLabel(arena.composition.type);
  const totalCount = arena.composition.units.reduce((s, u) => s + u.count, 0);
  const compStr = tag ? `${tag} (${totalCount} врагов)` : `${totalCount} врагов`;
  logEvent(`Арена ${arena.index}: ${compStr}`);
}

function heroCombat(hero, world, dt) {
  const { location } = world;
  const arena = location.arenas[hero.targetArenaIndex - 1];
  const aliveEnemies = arena.enemies.filter(e => e.alive);

  if (aliveEnemies.length === 0) {
    arena.cleared = true;
    hero.state = HERO_STATE.IN_ARENA_PAUSE;
    hero.pauseTimer = 1.0;
    hero.currentTargetId = null;
    logEvent(`Арена ${arena.index} зачищена`, 'kill');
    return;
  }

  // Во время каста герой стоит и не атакует
  if (hero.castUntil > world.timeNow) return;

  // Прилипание к цели
  let target = null;
  if (hero.currentTargetId != null) {
    target = aliveEnemies.find(e => e.id === hero.currentTargetId) || null;
  }
  if (!target) {
    let bestD = Infinity;
    for (const e of aliveEnemies) {
      const d = Math.hypot(e.x - hero.x, e.y - hero.y);
      if (d < bestD) { target = e; bestD = d; }
    }
    hero.currentTargetId = target ? target.id : null;
  }
  if (!target) return;

  const distToTarget = Math.hypot(target.x - hero.x, target.y - hero.y);
  // Эффективный радиус атаки — учитываем размер цели, чтобы крупные враги (босс)
  // не оказывались внутри своей "желаемой дистанции" и могли спокойно атаковать.
  const baseAttackRadius = getEffectiveStat('attackRadius');
  const attackRadius = Math.max(baseAttackRadius, target.radius + hero.radius + 8);
  const moveSpeed = getEffectiveStat('moveSpeed');

  if (distToTarget > attackRadius) {
    moveTowards(hero, target, moveSpeed, dt);
  } else {
    hero.attackCooldown -= dt;
    if (hero.attackCooldown <= 0) {
      heroAutoAttack(hero, target, world);
      hero.attackCooldown = 1 / getHeroAttackSpeedNow(hero);
      if (!target.alive) hero.currentTargetId = null;
    }
  }

  clampInsideArena(hero, arena);
}

function updateEnemies(arena, world, dt) {
  const { hero } = world;
  const enemies = arena.enemies;

  for (const e of enemies) {
    if (!e.alive) continue;

    if (e.knockback && world.timeNow < e.knockback.until) {
      e.x += e.knockback.vx * dt;
      e.y += e.knockback.vy * dt;
      clampInsideArena(e, arena);
      continue;
    } else if (e.knockback) {
      e.knockback = null;
    }

    // Подсечка/нокдаун: враг лежит, не двигается, не атакует.
    // Дополнительно: KD ОТМЕНЯЕТ замах Качка (windup) — это и есть counter-spell.
    if (e.knockdownUntil > world.timeNow) {
      e.windingUpUntil = 0;
      e.windingUpStartedAt = 0;
      e.state = ENEMY_STATE.IDLE;
      continue;
    }

    // SLAM-удар (качок): срабатывает в момент завершения замаха ИЗ ТОЧКИ где замах стартовал.
    // Раньше слэм был внутри блока attack-timer и зависел от состояния — если игрок успевал
    // увести качка из ATTACKING-фазы, замах «зависал». Теперь срабатывание независимое.
    if (e.windingUpUntil && world.timeNow >= e.windingUpUntil && e.slamRadius > 0) {
      const distToHeroNow = Math.hypot(hero.x - e.x, hero.y - e.y);
      if (distToHeroNow <= e.slamRadius) {
        enemyAttackHero(e, hero, world);
      } else {
        logEvent(`${e.name} промахнулся слэмом`);
      }
      e.windingUpUntil = 0;
      e.windingUpStartedAt = 0;
      e.attackCooldown = 1 / e.attackSpeed;
      continue;
    }

    // Замах активен — качок врос в землю, не двигается, телеграф остаётся на месте.
    // Это даёт игроку чёткое окно «обойти / сбить с ног / уйти из радиуса».
    if (e.windingUpUntil > world.timeNow) {
      e.state = ENEMY_STATE.ATTACKING;
      continue;
    }

    if (hero.state === HERO_STATE.DEAD) {
      e.state = ENEMY_STATE.IDLE;
      continue;
    }

    const isRanged = e.kind === 'ranged';
    const meleeDist = e.radius + hero.radius + 8;
    const desiredDist = isRanged ? (e.attackRange || meleeDist) : meleeDist;
    const dx = hero.x - e.x;
    const dy = hero.y - e.y;
    // Guard от dist=0 (например после slam-телепорта героя ровно на врага).
    // Без guard'а ветка retreat ниже даёт 0/0 = NaN в координатах → враг визуально исчезает,
    // но продолжает работать в AI на NaN-сравнениях (`NaN > X` = false). Используем малое
    // ненулевое значение и фиксированное направление-юнит, чтобы враг просто оттолкнулся.
    let dist = Math.hypot(dx, dy);
    let nx, ny;
    if (dist < 0.001) {
      dist = 0.001;
      nx = 1; ny = 0;       // произвольный фиксированный юнит — лучше детерминизма, чем рандом
    } else {
      nx = dx / dist; ny = dy / dist;
    }

    if (dist > desiredDist + 4) {
      const step = e.moveSpeed * dt;
      const move = Math.min(step, dist - desiredDist);
      e.x += nx * move;
      e.y += ny * move;
      e.state = ENEMY_STATE.CHASING;
    } else if (!isRanged && dist < desiredDist - 4) {
      // Только melee-враги отступают если герой подошёл слишком близко.
      // Ranged стоит и стреляет в упор — намеренно (см. дизайн дальника).
      const step = e.moveSpeed * dt * 0.5;
      e.x -= nx * step;
      e.y -= ny * step;
      e.state = ENEMY_STATE.CHASING;
    } else {
      e.state = ENEMY_STATE.ATTACKING;
    }

    e.attackCooldown -= dt;
    if (e.state === ENEMY_STATE.ATTACKING && e.attackCooldown <= 0) {
      if (e.windupDuration && !e.windingUpUntil) {
        // Качок: первый тик в attacking → стартует замах. Дальше враг встаёт колом
        // (см. early-continue в начале цикла), сам слэм триггерится отдельной проверкой.
        e.windingUpUntil = world.timeNow + e.windupDuration;
        e.windingUpStartedAt = world.timeNow;
      } else if (!e.windupDuration) {
        // Регулярный melee / ranged — мгновенная атака без замаха.
        if (isRanged) {
          rangedEnemyAttack(e, hero, world);
        } else {
          enemyAttackHero(e, hero, world);
        }
        e.attackCooldown = 1 / e.attackSpeed;
      }
    }

    clampInsideArena(e, arena);
  }

  applySeparation(enemies);
  for (const e of enemies) {
    if (e.alive) clampInsideArena(e, arena);
  }
}
