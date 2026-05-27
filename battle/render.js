// Рендер боевого мира: фон, арены/коридоры, враги, герой, HP-бары, эффекты.

import { ARENA, FEEDBACK } from '../balance/visuals.js';
import { SKILLS } from '../balance/skills.js';
import { arenaTypeLabel } from '../balance/enemies.js';
import { getEffectiveStat, heroState } from '../core/stats_layer.js';
import { drawDamageNumbers, drawEffects, getShakeOffset } from '../core/fx.js';
import { isRageActive } from './battle.js';

export function drawWorld(ctx, world) {
  const rect = ctx.canvas.getBoundingClientRect();
  const W = rect.width;
  const H = rect.height;
  ctx.fillStyle = ARENA.worldBackgroundColor;
  ctx.fillRect(0, 0, W, H);

  const shake = getShakeOffset(world.timeNow);
  ctx.save();
  ctx.translate(-world.camera.x + shake.x, -world.camera.y + shake.y);

  ctx.fillStyle = ARENA.corridorFloorColor;
  for (const c of world.location.corridors) ctx.fillRect(c.x, c.y, c.w, c.h);

  for (const a of world.location.arenas) {
    ctx.fillStyle = ARENA.arenaFloorColor;
    ctx.fillRect(a.x, a.y, a.w, a.h);
    ctx.strokeStyle = ARENA.arenaBorderColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(a.x + 1, a.y + 1, a.w - 2, a.h - 2);
    ctx.fillStyle = '#5a4a82';
    ctx.font = '14px VT323, monospace';
    let label = `АРЕНА ${a.index}`;
    const tag = arenaTypeLabel(a.composition.type);
    if (tag) label += ` — ${tag}`;
    ctx.fillText(label, a.x + 10, a.y + 20);
    if (a.cleared) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(a.x, a.y, a.w, a.h);
    }
  }

  if (world.hero.pendingSlam) drawSlamMarker(ctx, world.hero.pendingSlam, world.timeNow);

  if (world.projectiles && world.projectiles.length > 0) {
    drawProjectiles(ctx, world.projectiles, world.timeNow);
  }

  const currentArena = world.location.arenas[world.hero.targetArenaIndex - 1];
  if (currentArena && currentArena.groundEffects && currentArena.groundEffects.length > 0) {
    drawGroundEffects(ctx, currentArena.groundEffects, world.timeNow);
  }
  if (currentArena && currentArena.enemies) {
    // Aura rings — отдельным проходом ПОД врагами (чтобы враги визуально стояли «на ауре»).
    for (const e of currentArena.enemies) {
      if (!e.alive || !e.aura) continue;
      drawAuraRing(ctx, e, world.timeNow);
    }
    for (const e of currentArena.enemies) {
      if (!e.alive) continue;
      drawEnemy(ctx, e, world.timeNow);
      if (e.id === world.hero.currentTargetId) drawTargetMarker(ctx, e, world.timeNow);
      if (e.bleedStacks > 0) drawBleedIndicator(ctx, e);
      else if (e.dot) drawDotIndicator(ctx, e);
      if (e.markedUntil > world.timeNow) drawMarkedIndicator(ctx, e);
      drawHpBar(ctx, e);
    }
  }

  drawHero(ctx, world.hero, world.timeNow);
  drawHeroHpBar(ctx, world.hero);
  drawEffects(ctx, world.timeNow);
  drawDamageNumbers(ctx, world.timeNow);
  ctx.restore();
}

// Ground effects:
//  • target=undefined — молотовая лужа врага (оранжевая, бьёт героя).
//  • target='enemies' — L10 slam-зона героя (золотая, бьёт врагов).
// Стиль: пульс, насыщенность убывает к expiresAt.
function drawGroundEffects(ctx, groundEffects, timeNow) {
  for (const ge of groundEffects) {
    if (timeNow >= ge.expiresAt) continue;
    const isHeroZone = ge.target === 'enemies';
    const fill   = isHeroZone ? '#ffd23f' : '#d35400';
    const stroke = isHeroZone ? '#ffe88a' : '#ff7e3e';
    const core   = isHeroZone ? '#ff9500' : '#ff4500';
    const remaining = (ge.expiresAt - timeNow) / (ge.expiresAt - ge.spawnedAt);
    const pulse = 0.5 + 0.5 * Math.sin(timeNow * 8 + ge.x * 0.01);
    ctx.save();
    // Заливка
    ctx.beginPath();
    ctx.arc(ge.x, ge.y, ge.radius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.globalAlpha = 0.18 + 0.12 * pulse * remaining;
    ctx.fill();
    // Обводка
    ctx.beginPath();
    ctx.arc(ge.x, ge.y, ge.radius, 0, Math.PI * 2);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.5 + 0.4 * remaining;
    ctx.stroke();
    // Внутренний "горячий" круг
    ctx.beginPath();
    ctx.arc(ge.x, ge.y, ge.radius * (0.4 + 0.15 * pulse), 0, Math.PI * 2);
    ctx.fillStyle = core;
    ctx.globalAlpha = 0.25 * remaining;
    ctx.fill();
    ctx.restore();
  }
}

function drawProjectiles(ctx, projectiles, timeNow) {
  for (const p of projectiles) {
    if (!p.alive) continue;
    const t = (timeNow - p.startTime) / p.duration;
    const tClamped = Math.max(0, Math.min(1, t));
    // Landing marker — пунктирный круг на точке приземления, заливка растёт по t.
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.targetX, p.targetY, p.landingRadius, 0, Math.PI * 2);
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.targetX, p.targetY, p.landingRadius * tClamped, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = 0.18;
    ctx.fill();
    ctx.restore();
    // Сам "коктейль" — точка с дугой по высоте (parabolic offset).
    const arcHeight = -32 * Math.sin(Math.PI * tClamped); // отрицательный Y = вверх
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y + arcHeight, 5, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
}

// Aura ring — еле заметный пульсирующий круг под юнитом-носителем.
// Цвет берём из e.aura.color (зелёный для Лекаря). Пульс синхронизирован с tickSec.
// Заливка тише обводки — обводка задаёт границу ауры, заливка только подсвечивает зону.
function drawAuraRing(ctx, e, timeNow) {
  const a = e.aura;
  const color = a.color || '#5be35b';
  const period = Math.max(0.5, a.tickSec);
  const phase = ((timeNow % period) / period) * Math.PI * 2;
  const pulse = 0.5 + 0.5 * Math.sin(phase);   // 0..1
  ctx.save();
  ctx.beginPath();
  ctx.arc(e.x, e.y, a.radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.03 + 0.03 * pulse;       // 3..6%
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.12 + 0.10 * pulse;       // 12..22%
  ctx.stroke();
  ctx.restore();
}

function drawSlamMarker(ctx, ps, timeNow) {
  const def = SKILLS[ps.skillId];
  const radius = def.aoeRadius;
  const remain = Math.max(0, ps.executeAt - timeNow);
  const total = def.castDelaySec;
  const t = 1 - remain / total;
  ctx.save();
  ctx.beginPath();
  ctx.arc(ps.x, ps.y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(ps.x, ps.y, radius * t, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 210, 63, 0.18)';
  ctx.fill();
  ctx.restore();
}

function drawEnemy(ctx, e, timeNow) {
  const flashing = e.hitFlashUntil > timeNow;
  const knockedDown = e.knockdownUntil > timeNow;
  const windingUp = e.windingUpUntil > timeNow;
  ctx.save();
  // Bomber death-telegraph: жёлто-оранжевый пунктирный круг на slamRadius + пульсация спрайта.
  // Визуально отличается от красного slam'а Качка (другой цвет, другая длительность).
  if (e.dying && e.deathTelegraphUntil > timeNow) {
    const tRaw = 1 - (e.deathTelegraphUntil - timeNow) / e.deathTelegraphDuration;
    const t = Math.max(0, Math.min(1, tRaw));
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.slamRadius, 0, Math.PI * 2);
    ctx.strokeStyle = '#ff8800';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.slamRadius * t, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 136, 0, 0.25)';
    ctx.fill();
    // Пульсация самого спрайта — быстрая, чтобы было «вот-вот рванёт».
    const pulse = 1 + Math.sin(timeNow * 24) * 0.25;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius * pulse, 0, Math.PI * 2);
    ctx.fillStyle = '#ffaa33';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#0a0612';
    ctx.stroke();
    ctx.restore();
    return;
  }
  // Замах:
  //  - SLAM (Качок, slamRadius > 0): пунктирный круг на земле + растущая заливка по t.
  //    Та же визуальная форма, что у landing marker'а молотова — только красная и медленнее.
  //  - Без slamRadius: пульсирующий ореол вокруг спрайта (старый стиль для других windup-врагов).
  if (windingUp) {
    if (e.slamRadius && e.slamRadius > 0 && e.windupDuration > 0) {
      const tRaw = (timeNow - e.windingUpStartedAt) / e.windupDuration;
      const t = Math.max(0, Math.min(1, tRaw));
      // Внешний пунктирный круг на полный slamRadius — постоянно видимая «зона угрозы».
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.slamRadius, 0, Math.PI * 2);
      ctx.strokeStyle = '#ff5050';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      // Внутренняя заливка растёт по t — наглядный счётчик до удара.
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.slamRadius * t, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(220, 50, 50, 0.22)';
      ctx.fill();
    } else {
      const pulse = 1 + Math.sin(timeNow * 14) * 0.12;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius * 1.55 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(220, 50, 50, 0.22)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius * 1.25 * pulse, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 80, 80, 0.85)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  if (knockedDown) ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
  ctx.fillStyle = flashing ? FEEDBACK.hitFlash.color : e.color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#0a0612';
  ctx.stroke();
  if (knockedDown) {
    // Звёздочки над HP-баром (HP-бар на e.y - radius - 10, высота 4)
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffd23f';
    ctx.font = '14px VT323, monospace';
    ctx.textAlign = 'center';
    const wobble = Math.sin(timeNow * 6) * 2;
    ctx.fillText('★ ★ ★', e.x, e.y - e.radius - 16 + wobble);
  }
  ctx.restore();
}

function drawTargetMarker(ctx, e, timeNow) {
  const pulse = 1 + Math.sin(timeNow * 8) * 0.08;
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.radius * pulse + 3, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ff3a3a';
  ctx.stroke();
}

function drawDotIndicator(ctx, e) {
  ctx.beginPath();
  ctx.arc(e.x + e.radius - 4, e.y - e.radius - 6, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#5be35b';
  ctx.fill();
}

function drawBleedIndicator(ctx, e) {
  ctx.save();
  ctx.font = '14px VT323, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('🩸', e.x + e.radius + 2, e.y - e.radius - 4);
  ctx.restore();
}

function drawMarkedIndicator(ctx, e) {
  ctx.save();
  ctx.font = '14px VT323, monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  // L10 hook: если стак > 1, рядом с маркером показываем число (хN) светящимся жёлтым.
  const stacks = e.markedStacks || 0;
  if (stacks > 1) {
    ctx.fillStyle = '#ffd23f';
    ctx.fillText(`×${stacks}`, e.x - e.radius - 16, e.y - e.radius - 4);
  }
  ctx.fillStyle = '#fff';
  ctx.fillText('🎯', e.x - e.radius - 2, e.y - e.radius - 4);
  ctx.restore();
}

function drawHpBar(ctx, e) {
  const w = e.radius * 2.2;
  const h = 4;
  const x = e.x - w / 2;
  const y = e.y - e.radius - 10;
  ctx.fillStyle = '#2a1f3d';
  ctx.fillRect(x, y, w, h);
  const pct = Math.max(0, e.hp / e.maxHp);
  ctx.fillStyle = pct > 0.5 ? '#4caf50' : pct > 0.25 ? '#ffd23f' : '#ff3ea5';
  ctx.fillRect(x, y, w * pct, h);
}

function drawHero(ctx, hero, timeNow) {
  const r = hero.radius;
  const flashing = hero.hitFlashUntil > timeNow;
  const rage = isRageActive(hero);
  if (rage) {
    const pulse = 1 + Math.sin(timeNow * 14) * 0.08;
    ctx.save();
    ctx.beginPath();
    ctx.arc(hero.x, hero.y, r * 1.6 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 110, 35, 0.22)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(hero.x, hero.y, r * 1.25 * pulse, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 140, 50, 0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
  if (hero.castUntil > timeNow) {
    ctx.beginPath();
    ctx.arc(hero.x, hero.y, r + 6, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(hero.x, hero.y, r, 0, Math.PI * 2);
  ctx.fillStyle = flashing ? '#ffffff' : '#4fd6ff';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#0a0612';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(hero.x, hero.y - 4, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#0a0612';
  ctx.fill();
}

function drawHeroHpBar(ctx, hero) {
  const max = getEffectiveStat('maxHp');
  const cur = Math.max(0, heroState.currentHp);
  const w = hero.radius * 2.4;
  const h = 5;
  const x = hero.x - w / 2;
  const y = hero.y - hero.radius - 12;
  ctx.fillStyle = '#2a1f3d';
  ctx.fillRect(x, y, w, h);
  const pct = cur / max;
  ctx.fillStyle = pct > 0.5 ? '#4fd6ff' : pct > 0.25 ? '#ffd23f' : '#ff3ea5';
  ctx.fillRect(x, y, w * pct, h);
  // L10 breath shield: голубая полоска поверх HP-бара. Длина — пропорция amount/max, cap 1.0
  // (overheal может теоретически быть > max, но визуально полоска не выходит за w).
  if (hero.shield && hero.shield.amount > 0) {
    const sPct = Math.min(1, hero.shield.amount / max);
    ctx.fillStyle = 'rgba(180, 220, 255, 0.9)';
    ctx.fillRect(x, y - 2, w * sPct, 2);
  }
}
