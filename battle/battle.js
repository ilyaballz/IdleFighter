// Бой: state-машины героя/врагов, движение, автоатаки, формула урона, скиллы.

import { getEffectiveStat, heroState } from '../core/stats_layer.js';
import { spawnPlanForArena, randomSpawnPos, buildBarOpponentTemplate, buildEnemyTemplate } from './arena.js';
import { logEvent } from '../core/logger.js';
import { SKILLS, MAX_SKILL_LEVEL } from '../balance/skills.js';
import { FEEDBACK } from '../balance/visuals.js';
import { PLAYER } from '../balance/player.js';
import { arenaTypeLabel } from '../balance/enemies.js';
import { LEGENDARY_UNIQUE_AFFIXES } from '../balance/equipment.js';
import { loadoutState, getSkillLevel } from '../core/loadout.js';
import { getEquippedUniqueAffixes } from '../core/inventory.js';
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

// L10-perk gate: централизованная проверка «у скилла открыт l10-перк».
// Используется во всех ветках activateSkill / dealDamage / tick* для разблокировки фишек.
function isSkillAtMaxLevel(skillId) {
  return getSkillLevel(skillId) >= MAX_SKILL_LEVEL;
}

// L10-параметры скилла, или null если перк ещё закрыт. Сокращает многократные ifы.
function l10Of(skillId) {
  if (!isSkillAtMaxLevel(skillId)) return null;
  return SKILLS[skillId]?.l10 || null;
}

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
    // L10 breath: overheal превращается в shield. null если нет активного щита.
    // shield: { amount, expiresAt }. damageHero поглощает урон шитом перед HP.
    shield: null,
    // L10 dash: запасные заряды для повторного рывка. На обычном уровне всегда 1 (один каст подряд).
    // На L10 max становится 2 (см. SKILLS.dash.l10.maxCharges). Тик-логика регенерации — в tickDashCharges.
    dashCharges: 1,
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
    markedStacks: 0,           // L10 hook: количество marked-стаков (cap = hook.l10.markedStackMax).
                                // Каждый стак даёт +hook.l10.markedStackBonusPct ко ВСЕМ источникам урона по цели.
    // ───── Boss trigger config (CHAPTER_BOSSES, конфиг-driven). Поля строго перечислены,
    //        чтобы не теряться при копировании — см. feedback_chapter_skin_vs_kind.
    summonAt: template.summonAt ?? null,            // порог HP%, при пересечении один раз spawn миньонов
    summonKind: template.summonKind || null,
    summonCount: template.summonCount || 0,
    triggeredSummon: false,
    enrageAt: template.enrageAt ?? null,            // порог HP%, при пересечении один раз — берсерк
    enrageDmgMult: template.enrageDmgMult || 1,
    enrageAtkSpdMult: template.enrageAtkSpdMult || 1,
    enrageDurationSec: template.enrageDurationSec || 0,
    triggeredEnrage: false,
    enragedUntil: 0,                                // мировое время — пока меньше, действуют множители
    // Универсальные поля темплейта врага (по аналогии с героем).
    // critChance: шанс крита по герою (атакой/projectile). critMultiplier: множитель урона крита.
    // dodgeChance: шанс уклониться от любого хита по врагу (атаки + скиллы) — чек в dealDamage.
    critChance:     template.critChance     || 0,
    critMultiplier: template.critMultiplier || 2.0,
    dodgeChance:    template.dodgeChance    || 0,
    // Aura — саппорт-эффект (heal/buff союзникам в радиусе). Тикает в battle/battle.js tickAuras.
    // null если у юнита нет ауры. auraNextTickAt инициализируется лениво при первом тике.
    aura: template.aura || null,
    auraNextTickAt: 0,
    // Поведенческий флаг: ranged-враг отступает если игрок ближе attackRange (chapter-skin Снайпер).
    kiteRetreat: template.kiteRetreat || false,
    // Молотов-параметры (chapter-skin гл.3/4 ranged). Снаряд оставляет горящую лужу на земле.
    // aoeLingerDpsPct — доля от damage снаряда, идущая в DPS лужи; tick раз в 0.5с.
    aoeLingerDuration: template.aoeLingerDuration || 0,
    aoeLingerDpsPct: template.aoeLingerDpsPct || 0,
    // Override базового landingRadius снаряда (PROJECTILE_LANDING_RADIUS=32). 0 = дефолт.
    projectileAoeRadius: template.projectileAoeRadius || 0,
    // Bomber-параметры: hp<=0 запускает death-telegraph, потом AOE-взрыв (см. dealDamage, tickBomberDeaths).
    deathExplosionDamage: template.deathExplosionDamage || 0,
    deathTelegraphDuration: template.deathTelegraphDuration || 0,
    deathTelegraphUntil: 0,
    dying: false,
    alive: true,
  };
}

export function spawnArenaEnemies(arena, locationIndex) {
  // Спец-кейс: арена бара — один противник из BAR_OPPONENTS, отскейленный под barLevel.
  if (arena.barOpponent != null) {
    const tmpl = buildBarOpponentTemplate(arena.barOpponent, arena.barLevel || 1);
    return [createEnemyFromTemplate(tmpl, randomSpawnPos(arena))];
  }
  // plan = [{ template, wave }]. wave 2 спавнится в глубине арены (см. randomSpawnPos).
  const plan = spawnPlanForArena(arena, locationIndex);
  const enemies = [];
  for (const { template, wave } of plan) {
    enemies.push(createEnemyFromTemplate(template, randomSpawnPos(arena, template.kind, wave)));
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
  // Умирающий bomber'а в death-telegraph'е — не получает урона (он уже считается «убитым»,
  // но физически держит арену незавершённой, пока не взорвётся).
  if (enemy.dying) return 0;
  // Уворот врага: чек до начисления урона. Применяется к ЛЮБОМУ хиту (auto-attack + скиллы),
  // чтобы dodgeChance был одинаково ценен против всех источников. Лог появляется, чтобы игрок
  // видел причину «нулевого» удара (важно для уникальных врагов типа Жорика в баре).
  if (enemy.dodgeChance > 0 && Math.random() < enemy.dodgeChance) {
    logEvent(`${enemy.name} увернулся`);
    return 0;
  }
  let mult = 1;
  if (def) {
    if (def.bonusVsBleedingPct && (enemy.bleedStacks || 0) > 0) mult += def.bonusVsBleedingPct;
    if (def.bonusVsKnockedDownPct && enemy.knockdownUntil > world.timeNow) mult += def.bonusVsKnockedDownPct;
    if (def.bonusVsMarkedPct && enemy.markedUntil > world.timeNow) mult += def.bonusVsMarkedPct;
  }
  // L10 Hook: marked-стаки усиливают ВСЕХ нападающих (включая auto-attack, DoT, бомбы).
  // Считаем глобально, поэтому вне `if (def)` — работает даже без def.
  if (enemy.markedUntil > world.timeNow && (enemy.markedStacks || 0) > 0) {
    const hookL10 = l10Of('hook');
    if (hookL10) mult += enemy.markedStacks * hookL10.markedStackBonusPct;
  }
  const finalAmount = Math.max(1, Math.round(amount * mult));
  enemy.hp -= finalAmount;
  enemy.hitFlashUntil = world.timeNow + FEEDBACK.hitFlash.duration;
  if (knockbackDist > 0) applyKnockback(enemy, fromX, fromY, knockbackDist, world);
  spawnDamageNumber(enemy.x, enemy.y - enemy.radius - 6, finalAmount, isCrit, world.timeNow);
  if (enemy.hp <= 0) {
    // Bomber: вместо мгновенной смерти — death-telegraph 0.4с, потом AOE-взрыв (tickBomberDeaths).
    // Враг продолжает занимать место (alive=true), но AI отключается через флаг dying.
    if (enemy.kind === 'bomber' && !enemy.dying && enemy.deathTelegraphDuration > 0) {
      enemy.dying = true;
      enemy.deathTelegraphUntil = world.timeNow + enemy.deathTelegraphDuration;
      enemy.windingUpUntil = 0;
      enemy.knockdownUntil = 0;
      enemy.attackCooldown = 999;
      enemy.knockback = null;
      enemy.dot = null;
      enemy.bleedStacks = 0;
      enemy.markedUntil = 0;
      enemy.markedStacks = 0;
      // Снимаем таргет с умирающего, чтобы герой переключился на следующую цель.
      if (world.hero && world.hero.currentTargetId === enemy.id) {
        world.hero.currentTargetId = null;
      }
      logEvent(`${enemy.name} подрывает себя...`, 'warn');
    } else {
      enemy.alive = false;
      enemy.dot = null;
      enemy.bleedStacks = 0;
      enemy.markedUntil = 0;
      enemy.markedStacks = 0;
      world.onEnemyKilled?.(enemy);
    }
  }
  return finalAmount;
}

function heroAutoAttack(hero, enemy, world) {
  const dmg = getHeroDamageNow(hero);
  const critChance = getHeroCritChanceNow(hero);
  const isCrit = rollChance(critChance);
  const finalDmg = dmg * (isCrit ? getEffectiveStat('critMultiplier') : 1);
  const dealtAmount = dealDamage(enemy, finalDmg, isCrit, hero.x, hero.y, world);
  if (isCrit) logEvent(`КРИТ! ${Math.round(finalDmg)} по ${enemy.name}`, 'crit');

  applyAutoAttackUniques(hero, enemy, dealtAmount, isCrit, world);

  // L10 combo: бафф продлевается за каждый auto-hit (до maxEndAt-капа от момента каста).
  for (const b of hero.buffs) {
    if (!b.comboExtend) continue;
    b.endsAt = Math.min(b.comboExtend.maxEndAt, b.endsAt + b.comboExtend.perHitSec);
  }

  // Заряды Ярости — кэп на maxCharges
  hero.rageCharges = Math.min(SKILLS.rage.maxCharges,
                              hero.rageCharges + SKILLS.rage.chargesPerAutoAttack);
}

// On-hit триггеры от уникальных аффиксов легендарок. Каждая надетая легендарка
// тригерится независимо (если 2 леги с bleed — два ролла за хит). Эффекты
// переиспользуют существующие поля enemy.dot / .knockdownUntil / heroState.currentHp.
function applyAutoAttackUniques(hero, enemy, dealtAmount, isCrit, world) {
  const uniques = getEquippedUniqueAffixes();
  if (uniques.length === 0) return;
  const maxHp = getEffectiveStat('maxHp');
  for (const u of uniques) {
    const def = LEGENDARY_UNIQUE_AFFIXES[u.type];
    if (!def || def.trigger !== 'autoAttack') continue;
    if (def.chance < 1.0 && Math.random() >= def.chance) continue;
    // triggerOnCritOnly: аффикс срабатывает только при крит-ударе (см. lifesteal).
    if (def.triggerOnCritOnly && !isCrit) continue;

    if (u.type === 'bleed') {
      if (!enemy.alive) continue;
      // Не перезатираем активный DoT (например от cut, который сильнее) —
      // unique-bleed только если цель сейчас не кровит.
      if (enemy.dot && enemy.dot.expiresAt > world.timeNow) continue;
      const dps = getHeroDamageNow(hero) * def.dotPctPerSec;
      enemy.bleedStacks = 1;
      enemy.dot = {
        damagePerSec: dps,
        expiresAt: world.timeNow + def.dotDurationSec,
        nextTickAt: world.timeNow + 1.0,
        sourceSkill: 'unique_bleed',
      };
    } else if (u.type === 'lifesteal') {
      if (heroState.currentHp >= maxHp || dealtAmount <= 0) continue;
      const heal = dealtAmount * def.healPct;
      heroState.currentHp = Math.min(maxHp, heroState.currentHp + heal);
    } else if (u.type === 'stun') {
      if (!enemy.alive) continue;
      enemy.knockdownUntil = Math.max(enemy.knockdownUntil, world.timeNow + def.stunDurationSec);
    }
  }
}

// Универсальный проход урона по герою — используется и melee-атаками, и приземлением projectile.
// armorPen (0..1) — какую долю defense игрока игнорирует источник урона. У боссов > 0 (см. BOSS_BASE).
// Возвращает true, если урон прошёл (ложь — увернулся).
function damageHero(damage, sourceName, hero, world, armorPen = 0) {
  const dodge = getEffectiveStat('dodgeChance');
  if (rollChance(dodge)) {
    logEvent(`Уворот от ${sourceName}`);
    return false;
  }
  const def = getEffectiveStat('defense') * (1 - armorPen);
  let finalDmg = Math.max(1, Math.round(damage * (1 - def)));
  // L10 breath: shield поглощает урон ДО HP. Истёкший shield обнуляется.
  if (hero.shield && hero.shield.expiresAt > world.timeNow && hero.shield.amount > 0) {
    const absorbed = Math.min(finalDmg, hero.shield.amount);
    hero.shield.amount -= absorbed;
    finalDmg -= absorbed;
    if (hero.shield.amount <= 0) hero.shield = null;
  } else if (hero.shield && hero.shield.expiresAt <= world.timeNow) {
    hero.shield = null;
  }
  if (finalDmg > 0) heroState.currentHp -= finalDmg;
  hero.hitFlashUntil = world.timeNow + FEEDBACK.hitFlash.duration;
  if (heroState.currentHp <= 0) {
    heroState.currentHp = 0;
    hero.state = HERO_STATE.DEAD;
    logEvent(`Герой пал. ${sourceName} нанёс ${finalDmg}.`, 'warn');
  }
  return true;
}

// Текущий damage врага с учётом enrage-баффа (если активен).
function getEnemyDamageNow(enemy, world) {
  const enraged = enemy.enragedUntil > world.timeNow;
  return enraged ? enemy.damage * enemy.enrageDmgMult : enemy.damage;
}

// Текущий attackSpeed врага с учётом enrage-баффа.
function getEnemyAttackSpeedNow(enemy, world) {
  const enraged = enemy.enragedUntil > world.timeNow;
  return enraged ? enemy.attackSpeed * enemy.enrageAtkSpdMult : enemy.attackSpeed;
}

function enemyAttackHero(enemy, hero, world) {
  let dmg = getEnemyDamageNow(enemy, world);
  const isCrit = enemy.critChance > 0 && Math.random() < enemy.critChance;
  if (isCrit) {
    dmg *= enemy.critMultiplier;
    logEvent(`${enemy.name}: КРИТ ×${enemy.critMultiplier}!`, 'warn');
  }
  damageHero(dmg, enemy.name, hero, world, enemy.armorPen || 0);
}

// Бросок projectile от ranged-врага. Snapshot позиции героя на момент броска —
// projectile полетит туда, и приземлится на позиции мыши^W героя через PROJECTILE_DURATION.
const PROJECTILE_DURATION = 0.5;
const PROJECTILE_LANDING_RADIUS = 32;

function rangedEnemyAttack(enemy, hero, world) {
  if (!world.projectiles) world.projectiles = [];
  // Крит-ролл снапшотится в момент броска (а не приземления) — это даёт игроку шанс увернуться
  // от уже «решённого» крита через позиционирование. Логирование тоже на броске.
  let dmg = getEnemyDamageNow(enemy, world);
  const isCrit = enemy.critChance > 0 && Math.random() < enemy.critChance;
  if (isCrit) {
    dmg *= enemy.critMultiplier;
    logEvent(`${enemy.name}: КРИТ ×${enemy.critMultiplier} в полёте!`, 'warn');
  }
  const radius = enemy.projectileAoeRadius || PROJECTILE_LANDING_RADIUS;
  world.projectiles.push({
    sourceName: enemy.name,
    damage: dmg,
    startX: enemy.x,
    startY: enemy.y,
    targetX: hero.x,         // snapshot позиции героя
    targetY: hero.y,
    x: enemy.x,              // текущая позиция (для рендера)
    y: enemy.y,
    startTime: world.timeNow,
    duration: PROJECTILE_DURATION,
    color: '#ff7e3e',
    landingRadius: radius,
    // Молотов: после приземления оставить горящую лужу. 0 = обычный снаряд без лужи.
    lingerDuration: enemy.aoeLingerDuration || 0,
    lingerDps: (enemy.aoeLingerDpsPct || 0) > 0 ? dmg * enemy.aoeLingerDpsPct : 0,
    alive: true,
  });
}

// Обновление projectile'ов: летят по прямой start→target за duration, на t≥1 проверяют
// попадание (расстояние от landing-точки до героя ≤ landingRadius + heroRadius).
// arena (optional) — куда добавлять горящие лужи от молотовых снарядов.
function updateProjectiles(world, dt, arena) {
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
      // Молотов: оставляем горящую лужу. Лужи стакаются — каждый снаряд = свой объект.
      if (p.lingerDuration > 0 && arena) {
        if (!arena.groundEffects) arena.groundEffects = [];
        arena.groundEffects.push({
          x: p.targetX,
          y: p.targetY,
          radius: p.landingRadius,
          dps: p.lingerDps,
          sourceName: p.sourceName,
          spawnedAt: world.timeNow,
          expiresAt: world.timeNow + p.lingerDuration,
          nextTickAt: world.timeNow + GROUND_EFFECT_TICK_SEC,
        });
      }
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

// ───────── Ground effects (молотовые лужи на земле) ─────────
// Стакающиеся горящие пятна, создаются при приземлении молотов-снаряда (chapter-skin
// гл.3/4 ranged). Урон тикает по герою каждые GROUND_EFFECT_TICK_SEC секунд если в радиусе.
// Живут per-arena (cleanup при переходе арены через инициализацию [] в activateArena).
const GROUND_EFFECT_TICK_SEC = 0.5;

function tickGroundEffects(arena, world) {
  if (!arena || !arena.groundEffects || arena.groundEffects.length === 0) return;
  const hero = world.hero;
  const list = arena.groundEffects;
  for (const ge of list) {
    if (world.timeNow >= ge.expiresAt) continue;  // expired — удалится ниже
    while (world.timeNow >= ge.nextTickAt && ge.nextTickAt <= ge.expiresAt) {
      const tickDmg = ge.dps * GROUND_EFFECT_TICK_SEC;
      if (ge.target === 'enemies') {
        // L10 slam: зона тикает урон по всем живым врагам в радиусе. Через dealDamage,
        // чтобы DoT/marked-стак/synergies применялись корректно.
        for (const e of arena.enemies) {
          if (!e.alive || e.dying) continue;
          const d = Math.hypot(e.x - ge.x, e.y - ge.y);
          if (d <= ge.radius + e.radius) {
            dealDamage(e, tickDmg, false, ge.x, ge.y, world);
          }
        }
      } else {
        // Дефолт: молотов-лужа врага бьёт героя.
        if (hero.state !== HERO_STATE.DEAD) {
          const d = Math.hypot(hero.x - ge.x, hero.y - ge.y);
          if (d <= ge.radius + hero.radius) {
            damageHero(tickDmg, ge.sourceName + ' (лужа)', hero, world);
          }
        }
      }
      ge.nextTickAt += GROUND_EFFECT_TICK_SEC;
    }
  }
  for (let i = list.length - 1; i >= 0; i--) {
    if (world.timeNow >= list[i].expiresAt) list.splice(i, 1);
  }
}

// ───────── Bomber death-explosion ─────────
// По истечении deathTelegraphUntil — AOE-урон герою (если в slamRadius), FX, и финальная смерть
// (alive=false + onEnemyKilled). До этого момента bomber виден, но «уже мёртв» (dying=true).
function tickBomberDeaths(arena, world) {
  if (!arena || !arena.enemies) return;
  const hero = world.hero;
  for (const e of arena.enemies) {
    if (!e.alive || !e.dying) continue;
    if (world.timeNow < e.deathTelegraphUntil) continue;
    if (hero.state !== HERO_STATE.DEAD) {
      const d = Math.hypot(hero.x - e.x, hero.y - e.y);
      if (d <= e.slamRadius + hero.radius) {
        damageHero(e.deathExplosionDamage, e.name + ' (взрыв)', hero, world, 0);
      }
    }
    // FX взрыва — расходящийся огненный круг + pulse-заливка.
    spawnEffect({ type: 'expandingRing', x: e.x, y: e.y, fromRadius: 4,
                  toRadius: e.slamRadius, color: '#ff5500', lineWidth: 4, duration: 0.4 },
                world.timeNow);
    spawnEffect({ type: 'pulse', x: e.x, y: e.y, radius: e.slamRadius * 0.7,
                  color: '#ff8800', alpha: 0.5, duration: 0.32 }, world.timeNow);
    triggerSkillShake(world.timeNow);
    logEvent(`${e.name} взорвался!`, 'warn');
    e.alive = false;
    e.dying = false;
    world.onEnemyKilled?.(e);
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
    if (!e.alive || e.dying) continue;
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
    if (!e.alive || e.dying) continue;
    const d = Math.hypot(e.x - fromX, e.y - fromY);
    if (d > bestD) { best = e; bestD = d; }
  }
  return best;
}

function findMarkedAliveEnemy(arena, world) {
  if (!arena || !arena.enemies) return null;
  for (const e of arena.enemies) {
    if (e.alive && !e.dying && e.markedUntil > world.timeNow) return e;
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
    if (!e.alive || e.dying) continue;
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
    if (!e.alive || e.dying) continue;
    const d = Math.hypot(e.x - cx, e.y - cy);
    if (d <= radius + e.radius) out.push(e);
  }
  return out;
}

// Максимум dash-зарядов: 1 на любом уровне, 2 на L10 (dash.l10.maxCharges).
export function getDashMaxCharges() {
  const l10 = l10Of('dash');
  return l10?.maxCharges ?? 1;
}

export function isSkillReady(hero, skillId) {
  const def = SKILLS[skillId];
  if (!def) return false;
  // Dash на L10 — charges-режим: готов когда есть заряд, даже если CD ещё идёт (для второго).
  if (skillId === 'dash') return (hero.dashCharges ?? 1) > 0;
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

  // Флаги L10-перков, читаются в финальном блоке списания ресурса (после switch).
  // spinkick L10: если targets выжил=false на L10 — сбросить CD в 0.
  // roundkick L10: после AOE подсчитать −X сек от CD по количеству задетых.
  let spinkickKilledOnL10 = false;
  let roundkickCdReductionSec = 0;

  switch (def.targetType) {
    case 'single': {
      // Бьём sticky-таргет автоатак (куда хиро уже бил), fallback на ближайшего.
      // Предсказуемо для игрока + комбо стакаются на одной цели.
      let target = null;
      if (hero.currentTargetId != null) {
        target = arena.enemies.find(e => e.id === hero.currentTargetId && e.alive && !e.dying) || null;
      }
      if (!target) target = findNearestAliveEnemy(arena, hero.x, hero.y);
      if (!target) return false;
      // Снапшоты тегов: damage-бонусы применяет сам dealDamage по def, а здесь читаются
      // для логирования и универсального combo-консумера (флаг comboTaggedBonus ниже).
      const wasBleeding = (target.bleedStacks || 0) > 0;
      const wasMarked = target.markedUntil > world.timeNow;
      const targetHadAnyTag = enemyHasAnyTag(target, world);
      const dmgPerHit = getHeroDamageNow(hero) * skillDamageMultiplier(def, lvl);
      const critChance = getHeroCritChanceNow(hero) + (def.bonusCritChance || 0);
      let hits = def.hits || 1;
      // L10 double_strike: +extraHits всегда, +extraHitsIfBleeding если цель кровит на каст.
      const singleL10 = def.l10 && lvl >= MAX_SKILL_LEVEL ? def.l10 : null;
      if (singleL10?.extraHits) hits += singleL10.extraHits;
      if (singleL10?.extraHitsIfBleeding && wasBleeding) hits += singleL10.extraHitsIfBleeding;
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
      const execThreshold = def.forceCritIfBelowHpPct;
      let totalDmg = 0;
      let critCount = 0;
      for (let i = 0; i < hits; i++) {
        if (!target.alive) break;
        // Финишер (spinkick): если HP цели < threshold — крит гарантирован.
        const isLowHp = execThreshold != null && target.maxHp > 0 && target.hp <= target.maxHp * execThreshold;
        const isCrit = isLowHp || rollChance(critChance);
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
      // L10 hook: повторный hook по marked цели = +1 stack (cap markedStackMax). Стаки усиливают
      // ВСЕХ атакующих по цели (dealDamage). Без L10 — стак всегда 1 (просто метка).
      if (def.appliesMarkedSec && target.alive) {
        const wasMarkedTarget = target.markedUntil > world.timeNow;
        const hookL10 = def.l10 && lvl >= MAX_SKILL_LEVEL ? def.l10 : null;
        for (const e of arena.enemies) {
          if (e === target) {
            e.markedUntil = world.timeNow + def.appliesMarkedSec;
            if (hookL10) {
              e.markedStacks = wasMarkedTarget
                ? Math.min(hookL10.markedStackMax, (e.markedStacks || 1) + 1)
                : 1;
            } else {
              e.markedStacks = 1;
            }
          } else {
            e.markedUntil = 0;
            e.markedStacks = 0;
          }
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
      // L10 spinkick: killing blow → сбросить CD в 0 после установки (флаг применяется ниже).
      if (skillId === 'spinkick' && singleL10?.resetCdOnKill && !target.alive) {
        spinkickKilledOnL10 = true;
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
      const aoeL10 = def.l10 && lvl >= MAX_SKILL_LEVEL ? def.l10 : null;
      // L10 trip: радиус ×radiusMult. Применяется и к поиску целей, и к FX ниже.
      const effectiveRadius = aoeL10?.radiusMult
        ? def.aoeRadius * aoeL10.radiusMult
        : def.aoeRadius;
      const enemies = getEnemiesInRadius(arena, hero.x, hero.y, effectiveRadius);
      if (enemies.length === 0) return false;
      // FX по скиллу
      const isBlood = !!def.lifestealPct;
      const ringColor  = isBlood ? '#e63946' : '#4fd6ff';
      const pulseColor = isBlood ? '#a02030' : '#4fd6ff';
      spawnEffect({ type: 'expandingRing', x: hero.x, y: hero.y, fromRadius: 6, toRadius: effectiveRadius,
                    color: ringColor, lineWidth: 4, duration: 0.4 }, world.timeNow);
      spawnEffect({ type: 'pulse', x: hero.x, y: hero.y, radius: effectiveRadius * 0.55,
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
      let bloodlustBleedApplied = 0;
      for (const e of enemies) {
        const wasBleeding = (e.bleedStacks || 0) > 0;
        const wasKnockedDown = e.knockdownUntil > world.timeNow;
        const isCrit = rollChance(critChance);
        const fdmg = baseDmg * (isCrit ? critMult : 1);
        const dealt = dealDamage(e, fdmg, isCrit, hero.x, hero.y, world, def.knockback || 0, def);
        if (kdSec > 0 && e.alive) {
          e.knockdownUntil = Math.max(e.knockdownUntil, world.timeNow + kdSec);
        }
        // L10 bloodlust: шанс bleedChance повесить bleed на ранее не кровивших. Кормит свою же
        // ×bleedLifestealMultiplier на следующий каст. DPS = bleedDpsPct от damage героя.
        if (aoeL10?.bleedChance && e.alive && !wasBleeding && Math.random() < aoeL10.bleedChance) {
          e.bleedStacks = 1;
          e.dot = {
            damagePerSec: getHeroDamageNow(hero) * aoeL10.bleedDpsPct,
            expiresAt: world.timeNow + aoeL10.bleedDurationSec,
            nextTickAt: world.timeNow + 1.0,
            sourceSkill: 'bloodlust_l10',
          };
          bloodlustBleedApplied++;
        }
        totalDealt += dealt;
        if (wasBleeding) { bleedDealt += dealt; bleedHits++; }
        if (wasKnockedDown) kdHits++;
        if (!e.alive) killed++;
      }
      // L10 roundkick: −cdReductionPerHit за каждого задетого, cap cdReductionMaxHits.
      if (aoeL10?.cdReductionPerHit) {
        const capped = Math.min(enemies.length, aoeL10.cdReductionMaxHits);
        roundkickCdReductionSec = capped * aoeL10.cdReductionPerHit;
      }
      // Лайфстил для Кровожадности — per-enemy: с кровящих × bleedLifestealMultiplier.
      if (def.lifestealPct || def.minHealPct) {
        const maxHp = getEffectiveStat('maxHp');
        const baseLs = (def.lifestealPct || 0);
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
      const bloodlustTag = bloodlustBleedApplied > 0 ? ` 🩸+${bloodlustBleedApplied}` : '';
      const cdRedTag = roundkickCdReductionSec > 0 ? ` ⏱−${roundkickCdReductionSec.toFixed(1)}с` : '';
      logEvent(`${def.name}: задел ${enemies.length}${killed ? `, убито ${killed}` : ''}${healTag}${bleedTag}${kdTag}${bloodlustTag}${cdRedTag}`);
      break;
    }
    case 'aoe_landing': {
      // Точка приземления: помеченная цель (если есть и prefersMarkedTarget), иначе ближайший враг.
      let target = null;
      if (def.prefersMarkedTarget) target = findMarkedAliveEnemy(arena, world);
      if (!target) target = findNearestAliveEnemy(arena, hero.x, hero.y);
      const land = target ? { x: target.x, y: target.y } : { x: hero.x, y: hero.y };
      const castDelay = def.castDelaySec;
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
      // L10 rage: aura радиус ×auraRadiusMult, тик-период ×auraTickMult (например 0.5 = вдвое чаще).
      const rageL10 = def.l10 && lvl >= MAX_SKILL_LEVEL ? def.l10 : null;
      const radiusMult = rageL10?.auraRadiusMult ?? 1;
      const tickMult = rageL10?.auraTickMult ?? 1;
      const effBurnTickSec = (def.burnTickSec || 0) * tickMult;
      hero.buffs.push({
        type: 'rage',
        endsAt: world.timeNow + durSec,
        damageBonusPct: def.bonusDamagePct * rageLvlMult,
        atkSpdBonusPct: def.bonusAttackSpeedPct * rageLvlMult,
        burnDamagePct: (def.burnDamagePct || 0) * rageLvlMult,
        burnTickSec: effBurnTickSec,
        burnRadius: (def.burnRadius || 0) * radiusMult,
        burnNextTickAt: world.timeNow + (effBurnTickSec || 1.0),
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
      const effPathWidth = def.pathWidth;
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
      const fullHeal = maxHp * healPct;
      const beforeHp = heroState.currentHp;
      heroState.currentHp = Math.min(maxHp, beforeHp + fullHeal);
      const actualHeal = Math.round(heroState.currentHp - beforeHp);
      // L10 breath: overheal (fullHeal − actualHeal) превращается в shield. Перезаписывает
      // предыдущий, не стакается. Истёк → damageHero обнулит и пропустит урон в HP.
      const breathL10 = def.l10 && lvl >= MAX_SKILL_LEVEL ? def.l10 : null;
      let shieldAmt = 0;
      if (breathL10?.overhealToShield) {
        shieldAmt = Math.round(fullHeal - actualHeal);
        if (shieldAmt > 0) {
          hero.shield = { amount: shieldAmt, expiresAt: world.timeNow + breathL10.shieldDurationSec };
        }
      }
      spawnDamageNumber(hero.x, hero.y - hero.radius - 6, actualHeal, false, world.timeNow);
      // FX: зелёный пульс + расходящееся кольцо
      spawnEffect({ type: 'pulse', x: hero.x, y: hero.y, radius: 38, color: '#5be35b',
                    alpha: 0.5, duration: 0.35 }, world.timeNow);
      spawnEffect({ type: 'expandingRing', x: hero.x, y: hero.y, fromRadius: 6, toRadius: 50,
                    color: '#5be35b', lineWidth: 3, duration: 0.5 }, world.timeNow);
      const shieldTag = shieldAmt > 0 ? `, 🛡${shieldAmt}` : '';
      logEvent(`${def.name}: +${actualHeal} HP${shieldTag}`);
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
    // critChanceBonusPct — безусловный (breath), critChanceBonusIfTagged — только если цель тегнута (combo).
    const critChance = (b.critChanceBonusPct || 0) * lm
                     + (comboTaggedBonus ? (b.critChanceBonusIfTagged || 0) * lm : 0);
    // L10 combo: помечаем бафф как продлеваемый — heroAutoAttack будет тянуть endsAt по +extendPerHitSec
    // вплоть до maxEndAt (capped от момента каста). Только для combo, чтобы фишка не утекала на breath.
    const comboL10 = skillId === 'combo' && def.l10 && lvl >= MAX_SKILL_LEVEL ? def.l10 : null;
    hero.buffs.push({
      type: 'speed',
      endsAt: world.timeNow + b.durationSec,
      atkSpdBonusPct: atkSpd,
      damageBonusPct: dmg,
      critChanceBonus: critChance,
      comboExtend: comboL10 ? {
        perHitSec: comboL10.extendPerHitSec,
        maxEndAt: world.timeNow + comboL10.maxBuffDurationSec,
      } : null,
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
    // L10 dash: каст тратит 1 заряд. CD ставится только если зарядов больше нет (либо CD уже идёт —
    // тогда не перезапускаем, заряд восстановит tickDashChargeRegen). hero.dashCharges
    // регенерится в updateBattle отдельной функцией.
    if (skillId === 'dash') {
      hero.dashCharges = Math.max(0, (hero.dashCharges ?? 1) - 1);
      const maxCh = getDashMaxCharges();
      if (hero.dashCharges < maxCh && (hero.skillCooldowns.dash || 0) <= 0) {
        hero.skillCooldowns.dash = skillCooldownAfterCdr(def.baseCooldown, 'dash');
      }
    } else {
      let cd = skillCooldownAfterCdr(def.baseCooldown, skillId);
      // L10 roundkick: −cdReductionSec от только что выставленного CD (по числу задетых).
      if (roundkickCdReductionSec > 0) cd = Math.max(0, cd - roundkickCdReductionSec);
      // L10 spinkick: killing blow обнуляет CD (после reduction-логики, чтобы пересилить).
      if (spinkickKilledOnL10) cd = 0;
      hero.skillCooldowns[skillId] = cd;
    }
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
  // L10 slam: после приземления остаётся горящая зона того же радиуса. DoT тикает по всем
  // живым врагам в зоне через tickGroundEffects (target='enemies'). DPS — от текущего damage героя.
  const slamL10 = def.l10 && lvl >= MAX_SKILL_LEVEL ? def.l10 : null;
  if (slamL10?.groundZoneDurationSec) {
    if (!arena.groundEffects) arena.groundEffects = [];
    arena.groundEffects.push({
      target: 'enemies',
      x: ps.x,
      y: ps.y,
      radius: def.aoeRadius,
      dps: getHeroDamageNow(hero) * slamL10.groundZoneDpsPct,
      sourceName: def.name + ' (зона)',
      spawnedAt: world.timeNow,
      expiresAt: world.timeNow + slamL10.groundZoneDurationSec,
      nextTickAt: world.timeNow + GROUND_EFFECT_TICK_SEC,
    });
  }
  triggerSkillShake(world.timeNow);
  const kdHitsTag = (def.bonusVsKnockedDownPct && kdHits > 0)
    ? ` 💢+${Math.round(def.bonusVsKnockedDownPct * 100)}% × ${kdHits}` : '';
  const kdAppliedTag = kdApplied > 0 ? ` ⤵️${kdApplied}` : '';
  const zoneTag = slamL10 ? ' 🔥' : '';
  logEvent(`Приземление: задел ${enemies.length}${killed ? `, убито ${killed}` : ''}${kdHitsTag}${kdAppliedTag}${zoneTag}`);
}


// ───────── Auras (Лекарь и future-саппорты) ─────────
// Универсальный тик: для каждого живого врага с aura — каждые tickSec применяем effect
// к союзникам в радиусе. Сейчас effect='heal'; легко расширить на 'damageBuff' и т.п.
function tickAuras(arena, world) {
  if (!arena || !arena.enemies) return;
  for (const src of arena.enemies) {
    if (!src.alive || !src.aura) continue;
    if (src.auraNextTickAt === 0) {
      src.auraNextTickAt = world.timeNow + src.aura.tickSec;
      continue;
    }
    if (world.timeNow < src.auraNextTickAt) continue;
    applyAuraTick(src, arena);
    src.auraNextTickAt = world.timeNow + src.aura.tickSec;
  }
}

function applyAuraTick(source, arena) {
  const aura = source.aura;
  const r = aura.radius;
  for (const target of arena.enemies) {
    if (!target.alive || target.dying) continue;
    const d = Math.hypot(target.x - source.x, target.y - source.y);
    if (d > r + target.radius) continue;
    if (aura.effect === 'heal') {
      // Хил в % от maxHp цели — скейлится с типом врага. Лекарь хилит и себя.
      const heal = Math.round(target.maxHp * aura.powerPct);
      if (heal > 0) target.hp = Math.min(target.maxHp, target.hp + heal);
    }
  }
}

// ───────── DoT и баффы ─────────

function tickDots(arena, world) {
  if (!arena || !arena.enemies) return;
  const hero = world.hero;
  // L10 cut: каждый тик DoT от cut может крит (шанс/мульт берутся с текущих статов игрока).
  const cutL10 = l10Of('cut');
  const critMult = getEffectiveStat('critMultiplier');
  for (const e of arena.enemies) {
    if (!e.alive || e.dying || !e.dot) continue;
    if (world.timeNow >= e.dot.expiresAt) {
      e.dot = null;
      e.bleedStacks = 0;
      continue;
    }
    while (world.timeNow >= e.dot.nextTickAt) {
      let tickDmg = e.dot.damagePerSec;
      let isCrit = false;
      if (cutL10 && cutL10.dotCanCrit && e.dot.sourceSkill === 'cut') {
        const cc = getHeroCritChanceNow(hero);
        if (Math.random() < cc) {
          isCrit = true;
          tickDmg *= critMult;
        }
      }
      // Источник DoT не зависит от позиции — кнокбэк направим от центра врага слегка в сторону героя
      dealDamage(e, tickDmg, isCrit, hero.x, hero.y, world);
      e.dot.nextTickAt += 1.0;
      if (!e.alive) break;
    }
  }
}

function tickHeroBuffs(hero, world) {
  if (hero.buffs.length === 0) return;
  // Огненная аура (Ярость): пока активна — каждые burnTickSec damage всем врагам в радиусе.
  // Прямой `enemy.hp -=` без dealDamage-хуков, чтобы не триггерить unique-аффиксы (passive aura).
  const arena = world.location?.arenas?.[hero.targetArenaIndex - 1];
  if (arena) {
    for (const b of hero.buffs) {
      if (!b.burnDamagePct || !b.burnTickSec) continue;
      if (world.timeNow < b.burnNextTickAt) continue;
      applyRageBurnTick(hero, arena, b, world);
      b.burnNextTickAt = world.timeNow + b.burnTickSec;
    }
  }
  hero.buffs = hero.buffs.filter(b => b.endsAt > world.timeNow);
}

function applyRageBurnTick(hero, arena, buff, world) {
  const baseDmg = getHeroDamageNow(hero) * buff.burnDamagePct;
  const r = buff.burnRadius;
  for (const e of arena.enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.x - hero.x, e.y - hero.y);
    if (d > r + e.radius) continue;
    const final = Math.max(1, Math.round(baseDmg));
    e.hp -= final;
    e.hitFlashUntil = world.timeNow + FEEDBACK.hitFlash.duration;
    spawnDamageNumber(e.x, e.y - e.radius - 6, final, false, world.timeNow);
    if (e.hp <= 0) {
      e.alive = false;
      e.dot = null;
      e.bleedStacks = 0;
      e.markedUntil = 0;
      e.markedStacks = 0;
      world.onEnemyKilled?.(e);
    }
  }
}

function tickHeroCooldowns(hero, dt) {
  for (const id of Object.keys(hero.skillCooldowns)) {
    if (hero.skillCooldowns[id] > 0) {
      hero.skillCooldowns[id] = Math.max(0, hero.skillCooldowns[id] - dt);
    }
  }
  // L10 dash: когда CD истёк — регенерируем 1 заряд, и если ещё не до max, запускаем CD заново.
  // На обычном уровне dashCharges всегда == 1, CD просто отжимается до 0 (стандартное поведение).
  const maxDash = getDashMaxCharges();
  if ((hero.skillCooldowns.dash || 0) <= 0 && (hero.dashCharges ?? 1) < maxDash) {
    hero.dashCharges = (hero.dashCharges ?? 1) + 1;
    if (hero.dashCharges < maxDash) {
      hero.skillCooldowns.dash = skillCooldownAfterCdr(SKILLS.dash.baseCooldown, 'dash');
    }
  }
}

// ───────── Boss triggers (CHAPTER_BOSSES) ─────────
// Срабатывают разово при пересечении порога HP%. Обработчик централизован, чтобы добавление
// новых триггеров было однострочной правкой в одном месте.

function spawnBossMinions(boss, arena, world) {
  const locationIndex = world.location.locationIndex;
  for (let i = 0; i < boss.summonCount; i++) {
    // Миньоны слабее «обычных» того же kind'а: телохранители, не самостоятельные боссы.
    const tmpl = buildEnemyTemplate(
      { kind: boss.summonKind, scaleHp: 0.7, scaleDmg: 0.8 },
      locationIndex, arena.index
    );
    const minion = createEnemyFromTemplate(tmpl, randomSpawnPos(arena, tmpl.kind));
    minion.state = ENEMY_STATE.CHASING;
    arena.enemies.push(minion);
  }
  logEvent(`${boss.name} зовёт телохранителей (×${boss.summonCount})`, 'warn');
}

function triggerBossEnrage(boss, world) {
  boss.enragedUntil = world.timeNow + boss.enrageDurationSec;
  logEvent(`${boss.name} ВПАЛ В ЯРОСТЬ! (${boss.enrageDurationSec}с)`, 'warn');
}

function tickBossTriggers(arena, world) {
  if (!arena || !arena.enemies) return;
  for (const e of arena.enemies) {
    if (!e.alive) continue;
    const hpPct = e.hp / e.maxHp;
    if (e.summonAt != null && !e.triggeredSummon && hpPct <= e.summonAt) {
      e.triggeredSummon = true;
      spawnBossMinions(e, arena, world);
    }
    if (e.enrageAt != null && !e.triggeredEnrage && hpPct <= e.enrageAt) {
      e.triggeredEnrage = true;
      triggerBossEnrage(e, world);
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
    tickBossTriggers(currentArena, world);
    updateEnemies(currentArena, world, dt);
    tickDots(currentArena, world);
    tickAuras(currentArena, world);
    tickGroundEffects(currentArena, world);
    tickBomberDeaths(currentArena, world);
  }
  updateProjectiles(world, dt, currentArena);
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
  arena.groundEffects = [];   // молотовые лужи, чистится при переходе арены
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
    world.onArenaCleared?.(arena);
    return;
  }

  // Во время каста герой стоит и не атакует
  if (hero.castUntil > world.timeNow) return;

  // Прилипание к цели. Dying-bomber'ы исключаются — их нельзя бить (dealDamage:0),
  // но они держат арену незавершённой до взрыва. Hero ждёт или ищет другую цель.
  let target = null;
  if (hero.currentTargetId != null) {
    target = aliveEnemies.find(e => e.id === hero.currentTargetId && !e.dying) || null;
  }
  if (!target) {
    let bestD = Infinity;
    for (const e of aliveEnemies) {
      if (e.dying) continue;
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
    // Bomber в death-telegraph'е — застыл на месте до взрыва. AI отключён.
    if (e.dying) continue;

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
      e.attackCooldown = 1 / getEnemyAttackSpeedNow(e, world);
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

    // Лекарь — движется к центру масс живых melee-союзников (всё кроме ranged/healer),
    // но не ближе SAFE к герою: если centroid внутри SAFE-зоны вокруг героя, целевая точка
    // отодвигается от героя до SAFE по тому же лучу. Так лекарь не лезет в свалку.
    if (e.kind === 'healer') {
      const step = e.moveSpeed * dt;
      const SAFE = 140;
      let sumX = 0, sumY = 0, count = 0;
      for (const a of enemies) {
        if (a === e || !a.alive) continue;
        if (a.kind === 'ranged' || a.kind === 'healer') continue;
        sumX += a.x; sumY += a.y; count++;
      }
      if (count > 0) {
        let cx = sumX / count;
        let cy = sumY / count;
        // Clamp: не лезть ближе SAFE к герою.
        const dxH = cx - hero.x;
        const dyH = cy - hero.y;
        const dH = Math.hypot(dxH, dyH);
        if (dH > 0.001 && dH < SAFE) {
          const k = SAFE / dH;
          cx = hero.x + dxH * k;
          cy = hero.y + dyH * k;
        }
        const dxC = cx - e.x;
        const dyC = cy - e.y;
        const distC = Math.hypot(dxC, dyC);
        if (distC > 4) {
          const move = Math.min(step, distC);
          e.x += (dxC / distC) * move;
          e.y += (dyC / distC) * move;
          e.state = ENEMY_STATE.CHASING;
        } else {
          e.state = ENEMY_STATE.IDLE;
        }
      } else {
        e.state = ENEMY_STATE.IDLE;
      }
      clampInsideArena(e, arena);
      continue;
    }

    const isRanged = e.kind === 'ranged';
    const meleeDist = e.radius + hero.radius + 8;
    const R = isRanged ? (e.attackRange || meleeDist) : meleeDist;
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
    const step = e.moveSpeed * dt;

    if (dist > R + 4) {
      // Вне ренжа — подходим к игроку, тормозим ровно у границы R.
      const move = Math.min(step, dist - R);
      e.x += nx * move;
      e.y += ny * move;
      e.state = ENEMY_STATE.CHASING;
    } else if (isRanged && e.kiteRetreat && dist < R * 0.5) {
      // Снайпер (Подземка): игрок зашёл ближе R/2 — отступаем, стреляем на бегу.
      e.x -= nx * step * 0.5;
      e.y -= ny * step * 0.5;
      e.state = ENEMY_STATE.ATTACKING;
    } else if (!isRanged && dist < R - 4) {
      // Melee и hero внутри тела (после slam-телепорта / push) — отталкиваемся,
      // в этом тике не атакуем.
      e.x -= nx * step * 0.5;
      e.y -= ny * step * 0.5;
      e.state = ENEMY_STATE.CHASING;
    } else {
      // В ренже — стоим и атакуем. Для ranged это коридор [R/2, R] (или [0, R] без kiteRetreat),
      // для melee — точка возле тела.
      e.state = ENEMY_STATE.ATTACKING;
    }

    e.attackCooldown -= dt;
    // Атакуем только в стойке. state == ATTACKING ставится во всех валидных случаях:
    //   - ranged в зоне dist ≤ R+4 (включая retreat-ветку снайпера)
    //   - melee в зоне dist ∈ [R-4, R+4]
    // CHASING и melee push-back явно НЕ ATTACKING — атака не пройдёт.
    // Раньше для ranged проверялось `dist <= R` отдельно, и в зоне (R, R+4] враг застревал:
    // state=ATTACKING, но canAttack=false, и подойти ближе тоже нельзя (dist≤R+4).
    const canAttack = e.state === ENEMY_STATE.ATTACKING;
    if (canAttack && e.attackCooldown <= 0) {
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
        e.attackCooldown = 1 / getEnemyAttackSpeedNow(e, world);
      }
    }

    clampInsideArena(e, arena);
  }

  applySeparation(enemies);
  for (const e of enemies) {
    if (e.alive) clampInsideArena(e, arena);
  }
}
