// Бой: state-машины героя/врагов, движение, автоатаки, формула урона, скиллы.

import { getEffectiveStat, heroState } from '../core/stats_layer.js';
import { spawnPlanForArena, randomSpawnPos } from './arena.js';
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
    state: ENEMY_STATE.IDLE,
    attackCooldown: 0,
    hitFlashUntil: 0,
    knockback: null,           // { vx, vy, until }
    dot: null,                 // { damagePerSec, expiresAt, nextTickAt, sourceSkill }
    alive: true,
  };
}

export function spawnArenaEnemies(arena, locationIndex) {
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
  const effDist = enemy.kind === 'boss' ? dist * FEEDBACK.knockback.bossResist : dist;
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
function dealDamage(enemy, amount, isCrit, fromX, fromY, world, knockbackDist = 0) {
  if (!enemy.alive) return;
  const finalAmount = Math.max(1, Math.round(amount));
  enemy.hp -= finalAmount;
  enemy.hitFlashUntil = world.timeNow + FEEDBACK.hitFlash.duration;
  if (knockbackDist > 0) applyKnockback(enemy, fromX, fromY, knockbackDist, world);
  spawnDamageNumber(enemy.x, enemy.y - enemy.radius - 6, finalAmount, isCrit, world.timeNow);
  if (enemy.hp <= 0) {
    enemy.alive = false;
    enemy.dot = null;
    world.onEnemyKilled?.(enemy);
  }
}

function heroAutoAttack(hero, enemy, world) {
  const dmg = getHeroDamageNow(hero);
  const critChance = getEffectiveStat('critChance');
  const isCrit = rollChance(critChance);
  const finalDmg = dmg * (isCrit ? getEffectiveStat('critMultiplier') : 1);
  dealDamage(enemy, finalDmg, isCrit, hero.x, hero.y, world);
  if (isCrit) logEvent(`КРИТ! ${Math.round(finalDmg)} по ${enemy.name}`, 'crit');

  // Заряды Ярости — кэп на maxCharges
  hero.rageCharges = Math.min(SKILLS.rage.maxCharges,
                              hero.rageCharges + SKILLS.rage.chargesPerAutoAttack);
}

function enemyAttackHero(enemy, hero, world) {
  const dodge = getEffectiveStat('dodgeChance');
  if (rollChance(dodge)) {
    logEvent(`Уворот от ${enemy.name}`);
    return;
  }
  const def = getEffectiveStat('defense');
  const finalDmg = Math.max(1, Math.round(enemy.damage * (1 - def)));
  heroState.currentHp -= finalDmg;
  hero.hitFlashUntil = world.timeNow + FEEDBACK.hitFlash.duration;
  if (heroState.currentHp <= 0) {
    heroState.currentHp = 0;
    hero.state = HERO_STATE.DEAD;
    logEvent(`Герой пал. ${enemy.name} нанёс ${finalDmg}.`, 'warn');
  }
}

// ───────── Skills ─────────

function skillCooldownAfterCdr(baseCd) {
  const cdr = getEffectiveStat('skillCdrPct');
  return baseCd * (1 - cdr);
}

function skillDamageMultiplier(skillDef, level) {
  return skillDef.baseDamageMultiplier * (1 + (level - 1) * skillDef.levelBonusPerLvl);
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

  switch (def.targetType) {
    case 'single': {
      const target = findNearestAliveEnemy(arena, hero.x, hero.y);
      if (!target) return false;
      const dmgPerHit = getHeroDamageNow(hero) * skillDamageMultiplier(def, lvl);
      const critChance = getEffectiveStat('critChance') + (def.bonusCritChance || 0);
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

      let totalDmg = 0;
      let critCount = 0;
      for (let i = 0; i < hits; i++) {
        if (!target.alive) break;
        const isCrit = rollChance(critChance);
        const finalDmg = dmgPerHit * (isCrit ? getEffectiveStat('critMultiplier') : 1);
        if (isCrit) critCount++;
        totalDmg += finalDmg;
        dealDamage(target, finalDmg, isCrit, hero.x, hero.y, world);
      }
      if (def.dot && target.alive) {
        const dps = getHeroDamageNow(hero) * def.dot.damagePctPerSec;
        target.dot = {
          damagePerSec: dps,
          expiresAt: world.timeNow + def.dot.durationSec,
          nextTickAt: world.timeNow + 1.0,
          sourceSkill: skillId,
        };
      }
      const critTag = critCount === 0 ? '' : critCount === hits ? ' (всё криты!)' : ` (${critCount} крит)`;
      logEvent(`${def.name}: ${Math.round(totalDmg)}${hits > 1 ? ` × ${hits}` : ''} по ${target.name}${critTag}`);
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
      let killed = 0;
      let totalDealt = 0;
      for (const e of enemies) {
        const isCrit = rollChance(getEffectiveStat('critChance'));
        const fdmg = baseDmg * (isCrit ? getEffectiveStat('critMultiplier') : 1);
        dealDamage(e, fdmg, isCrit, hero.x, hero.y, world, def.knockback || 0);
        totalDealt += fdmg;
        if (!e.alive) killed++;
      }
      // Лайфстил для Кровожадности (с гарантированным минимумом, если minHealPct указан)
      if (def.lifestealPct || def.minHealPct) {
        const maxHp = getEffectiveStat('maxHp');
        const lifestealAmt = totalDealt * (def.lifestealPct || 0);
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
      logEvent(`${def.name}: задел ${enemies.length}${killed ? `, убито ${killed}` : ''}${healTag}`);
      break;
    }
    case 'aoe_landing': {
      // Прыжок с задержкой. Точка приземления = позиция ближайшего врага сейчас (или герой).
      const target = findNearestAliveEnemy(arena, hero.x, hero.y);
      const land = target ? { x: target.x, y: target.y } : { x: hero.x, y: hero.y };
      hero.pendingSlam = {
        x: land.x,
        y: land.y,
        executeAt: world.timeNow + def.castDelaySec,
        skillId,
      };
      hero.castUntil = world.timeNow + def.castDelaySec;
      logEvent(`${def.name}: прыжок (${def.castDelaySec.toFixed(1)}с)`);
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
      hero.buffs.push({
        type: 'rage',
        endsAt: world.timeNow + durSec,
        damageBonusPct: def.bonusDamagePct * (1 + (lvl - 1) * def.levelBonusPerLvl),
        atkSpdBonusPct: def.bonusAttackSpeedPct * (1 + (lvl - 1) * def.levelBonusPerLvl),
      });
      // FX: вспышка-взрыв оранжевого, кольцо
      spawnEffect({ type: 'pulse', x: hero.x, y: hero.y, radius: 50, color: '#ff7e3e',
                    alpha: 0.6, duration: 0.35 }, world.timeNow);
      spawnEffect({ type: 'expandingRing', x: hero.x, y: hero.y, fromRadius: 6, toRadius: 70,
                    color: '#ff7e3e', lineWidth: 4, duration: 0.45 }, world.timeNow);
      logEvent(`${def.name}! +${Math.round(def.bonusDamagePct * 100)}% урона на ${durSec.toFixed(1)}с`, 'crit');
      break;
    }
    case 'self_heal': {
      const maxHp = getEffectiveStat('maxHp');
      const healPct = def.healPctOfMaxHp * (1 + (lvl - 1) * def.levelBonusPerLvl);
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

  // Универсальный buffOnUse — применяется любым скиллом, у которого он указан.
  if (def.buffOnUse) {
    const b = def.buffOnUse;
    hero.buffs.push({
      type: 'speed',
      endsAt: world.timeNow + b.durationSec,
      atkSpdBonusPct: b.atkSpdBonusPct || 0,
      damageBonusPct: b.damageBonusPct || 0,
    });
    spawnEffect({ type: 'expandingRing', x: hero.x, y: hero.y, fromRadius: 4, toRadius: 50,
                  color: '#4fd6ff', lineWidth: 3, duration: 0.32 }, world.timeNow);
    if (b.atkSpdBonusPct) {
      logEvent(`${def.name}: +${Math.round(b.atkSpdBonusPct * 100)}% ск.атаки на ${b.durationSec}с`);
    }
  }

  // Списать ресурс / поставить КД
  if (def.activation === 'cooldown') {
    hero.skillCooldowns[skillId] = skillCooldownAfterCdr(def.baseCooldown);
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
  let killed = 0;
  for (const e of enemies) {
    const isCrit = rollChance(getEffectiveStat('critChance'));
    const fdmg = baseDmg * (isCrit ? getEffectiveStat('critMultiplier') : 1);
    dealDamage(e, fdmg, isCrit, ps.x, ps.y, world, def.knockback || 0);
    if (!e.alive) killed++;
  }
  triggerSkillShake(world.timeNow);
  logEvent(`Приземление: задел ${enemies.length}${killed ? `, убито ${killed}` : ''}`);
}


// ───────── DoT и баффы ─────────

function tickDots(arena, world) {
  if (!arena || !arena.enemies) return;
  for (const e of arena.enemies) {
    if (!e.alive || !e.dot) continue;
    if (world.timeNow >= e.dot.expiresAt) {
      e.dot = null;
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

    if (hero.state === HERO_STATE.DEAD) {
      e.state = ENEMY_STATE.IDLE;
      continue;
    }

    const desiredDist = e.radius + hero.radius + 8;
    const dx = hero.x - e.x;
    const dy = hero.y - e.y;
    const dist = Math.hypot(dx, dy);

    if (dist > desiredDist + 4) {
      const step = e.moveSpeed * dt;
      e.x += (dx / dist) * Math.min(step, dist - desiredDist);
      e.y += (dy / dist) * Math.min(step, dist - desiredDist);
      e.state = ENEMY_STATE.CHASING;
    } else if (dist < desiredDist - 4) {
      const step = e.moveSpeed * dt * 0.5;
      e.x -= (dx / dist) * step;
      e.y -= (dy / dist) * step;
      e.state = ENEMY_STATE.CHASING;
    } else {
      e.state = ENEMY_STATE.ATTACKING;
    }

    e.attackCooldown -= dt;
    if (e.state === ENEMY_STATE.ATTACKING && e.attackCooldown <= 0) {
      enemyAttackHero(e, hero, world);
      e.attackCooldown = 1 / e.attackSpeed;
    }

    clampInsideArena(e, arena);
  }

  applySeparation(enemies);
  for (const e of enemies) {
    if (e.alive) clampInsideArena(e, arena);
  }
}
