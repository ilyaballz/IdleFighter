// Визуальные эффекты: плавающие числа урона, шейк камеры, утилиты.

import { FEEDBACK } from '../balance/visuals.js';

export const fxState = {
  damageNumbers: [],          // {x, y, value, isCrit, spawnedAt}
  effects: [],                // {type, ..., spawnedAt, duration}
  shakeUntil: 0,
  shakeIntensity: 0,
};

export function spawnEffect(effect, timeNow) {
  effect.spawnedAt = timeNow;
  fxState.effects.push(effect);
}

export function spawnDamageNumber(x, y, value, isCrit, timeNow) {
  if (!FEEDBACK.damageNumbers.enabled) return;
  // Небольшой случайный сдвиг X, чтобы числа от серии ударов не накладывались
  const jitter = (Math.random() - 0.5) * 14;
  fxState.damageNumbers.push({
    x: x + jitter,
    y,
    value: Math.max(1, Math.round(value)),
    isCrit,
    spawnedAt: timeNow,
  });
}

export function triggerSkillShake(timeNow) {
  if (!FEEDBACK.skillShake.enabled) return;
  fxState.shakeUntil = timeNow + FEEDBACK.skillShake.duration;
  fxState.shakeIntensity = FEEDBACK.skillShake.intensity;
}

export function getShakeOffset(timeNow) {
  if (timeNow > fxState.shakeUntil) return { x: 0, y: 0 };
  const k = fxState.shakeIntensity;
  return {
    x: (Math.random() - 0.5) * 2 * k,
    y: (Math.random() - 0.5) * 2 * k,
  };
}

export function updateFx(timeNow) {
  const dur = FEEDBACK.damageNumbers.duration;
  fxState.damageNumbers = fxState.damageNumbers.filter(d => timeNow - d.spawnedAt < dur);
  fxState.effects = fxState.effects.filter(fx => timeNow - fx.spawnedAt < fx.duration);
}

export function drawEffects(ctx, timeNow) {
  for (const fx of fxState.effects) {
    const t = (timeNow - fx.spawnedAt) / fx.duration;
    if (t >= 1 || t < 0) continue;
    ctx.save();
    switch (fx.type) {
      case 'expandingRing': {
        const r = fx.fromRadius + (fx.toRadius - fx.fromRadius) * t;
        ctx.globalAlpha = 1 - t;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = fx.color;
        ctx.lineWidth = fx.lineWidth || 3;
        ctx.stroke();
        break;
      }
      case 'strike': {
        ctx.globalAlpha = 1 - t;
        ctx.beginPath();
        ctx.moveTo(fx.fromX, fx.fromY);
        ctx.lineTo(fx.toX, fx.toY);
        ctx.strokeStyle = fx.color;
        ctx.lineWidth = (1 - t) * 5 + 1;
        ctx.lineCap = 'round';
        ctx.stroke();
        break;
      }
      case 'pulse': {
        const r = fx.radius * (0.6 + t * 0.6);
        ctx.globalAlpha = (1 - t) * (fx.alpha || 0.5);
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2);
        ctx.fillStyle = fx.color;
        ctx.fill();
        break;
      }
      case 'slash': {
        ctx.globalAlpha = 1 - t;
        ctx.translate(fx.x, fx.y);
        ctx.rotate(fx.angle ?? Math.PI / 4);
        const offset = -fx.length / 2 + fx.length * t;
        ctx.beginPath();
        ctx.moveTo(offset - fx.length * 0.3, 0);
        ctx.lineTo(offset + fx.length * 0.3, 0);
        ctx.strokeStyle = fx.color;
        ctx.lineWidth = (1 - t) * 4 + 1;
        ctx.lineCap = 'round';
        ctx.stroke();
        break;
      }
      case 'spiral': {
        ctx.globalAlpha = 1 - t;
        ctx.translate(fx.x, fx.y);
        const turns = fx.turns ?? 1.5;
        ctx.beginPath();
        const segs = 28;
        for (let i = 0; i <= segs; i++) {
          const p = i / segs;
          const a = p * turns * Math.PI * 2 + t * Math.PI * 4;
          const rad = fx.maxRadius * (0.2 + p * 0.8) * (1 - t * 0.4);
          const px = Math.cos(a) * rad;
          const py = Math.sin(a) * rad;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = fx.color;
        ctx.lineWidth = 2;
        ctx.stroke();
        break;
      }
    }
    ctx.restore();
  }
}

export function drawDamageNumbers(ctx, timeNow) {
  const cfg = FEEDBACK.damageNumbers;
  for (const d of fxState.damageNumbers) {
    const t = (timeNow - d.spawnedAt) / cfg.duration;
    if (t >= 1) continue;
    const alpha = 1 - t * t;
    const dy = -t * cfg.riseDistance;
    const fontSize = (d.isCrit ? 22 * cfg.critFontScale * 0.8 : 18);
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.font = `bold ${fontSize}px VT323, monospace`;
    ctx.fillStyle = d.isCrit ? cfg.critColor : cfg.normalColor;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000';
    ctx.strokeText(String(d.value), d.x, d.y + dy);
    ctx.fillText(String(d.value), d.x, d.y + dy);
    ctx.restore();
  }
}

export function resetFx() {
  fxState.damageNumbers.length = 0;
  fxState.effects.length = 0;
  fxState.shakeUntil = 0;
}
