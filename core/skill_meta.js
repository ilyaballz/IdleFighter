// UI-метаданные скиллов: иконки, короткие имена, структурные чипы и теги-синергии.
// Сами цифры — в balance/skills.js. Здесь только презентация — но с учётом
// текущих статов героя и уровня скилла, чтобы чипы показывали живые числа.

import { SKILLS } from '../balance/skills.js';
import { getEffectiveStat } from './stats_layer.js';
import { getSkillLevel } from './loadout.js';

function lvlMult(skill, level) {
  return 1 + (level - 1) * (skill.levelBonusPerLvl || 0);
}

export const SKILL_ICONS = {
  hook:'🥊', cut:'🔪', spinkick:'🌀', roundkick:'🦵',
  slam:'💥', rage:'🔥', breath:'💨',
  double_strike:'🤜', bloodlust:'🩸', combo:'⚡',
  trip:'🦶', dash:'🏃',
};

export const SKILL_SHORT_NAMES = {
  hook: 'Хук', cut: 'Рассеч.', spinkick: 'Вертушка', roundkick: 'Раунд-кик',
  slam: 'Прыжок', rage: 'Ярость', breath: 'Дыхание',
  double_strike: 'Двойной', bloodlust: 'Кровожад.', combo: 'Серия',
  trip: 'Подсечка', dash: 'Рывок',
};

// ───────── Stat-чипы (структурное описание скилла) ─────────
// Чип = {icon, value, label}. Рендерится в горизонтальную полоску из 2-4 штук
// в hub/ui.js → renderSkillDetails.

export function describeSkillChips(id) {
  const s = SKILLS[id];
  if (!s) return [];
  const level = getSkillLevel(id) || 1;
  const lm = lvlMult(s, level);
  const heroDamage = getEffectiveStat('damage');
  const heroMaxHp = getEffectiveStat('maxHp');
  const chips = [];

  // 1. Тайминг — КД или заряды.
  if (s.activation === 'cooldown') {
    chips.push({ icon: '⏱', value: `${s.baseCooldown}с`, label: 'КД' });
  } else if (s.activation === 'charges') {
    chips.push({ icon: '🔋', value: `${s.minCharges}-${s.maxCharges}`, label: 'ЗАРЯДЫ' });
  }

  // 2. Тип цели.
  switch (s.targetType) {
    case 'single':
      chips.push({ icon: '🎯', value: 'ОДНА', label: 'ЦЕЛЬ' });
      break;
    case 'aoe_around_self':
      chips.push({ icon: '◎', value: 'AoE', label: 'ВОКРУГ' });
      break;
    case 'aoe_landing':
      chips.push({ icon: '💢', value: 'AoE', label: 'ПРИЗЕМЛ.' });
      break;
    case 'dash_line':
      chips.push({ icon: '➡', value: 'ЛИНИЯ', label: 'РЫВОК' });
      break;
    case 'self_heal': {
      const heal = Math.round(heroMaxHp * s.healPctOfMaxHp * lm);
      chips.push({ icon: '💚', value: `${heal}`, label: 'ХИЛ' });
      break;
    }
  }

  // 3. Урон (для атакующих скиллов) — живое число.
  // Для multi-hit показываем total = perHit × hits, в label указываем «×N» как маркер мульти-удара.
  if (s.targetType !== 'self_heal' && s.targetType !== 'self_buff' && s.baseDamageMultiplier) {
    const hits = s.hits || 1;
    const total = Math.round(heroDamage * s.baseDamageMultiplier * lm * hits);
    chips.push({ icon: '⚔', value: `${total}`, label: hits > 1 ? `УРОН ×${hits}` : 'УРОН' });
  }

  // 4. DoT — total урон за всю длительность.
  if (s.dot) {
    const totalDoT = Math.round(heroDamage * s.dot.damagePctPerSec * lm * s.dot.durationSec);
    chips.push({ icon: '🩸', value: `${totalDoT}`, label: `ЗА ${s.dot.durationSec}С` });
  }

  // 5. Self-buff (rage) — три отдельных чипа: урон, ск.атаки, длительность.
  // Бонусы baff'а скейлятся с уровнем скилла (см. battle.js: def.bonusX * lvlMult).
  if (s.targetType === 'self_buff') {
    if (s.bonusDamagePct) {
      chips.push({ icon: '⚔', value: `+${Math.round(s.bonusDamagePct * lm * 100)}%`, label: 'УРОН' });
    }
    if (s.bonusAttackSpeedPct) {
      chips.push({ icon: '⚡', value: `+${Math.round(s.bonusAttackSpeedPct * lm * 100)}%`, label: 'СК.АТК' });
    }
    if (s.minDurationSec != null && s.maxDurationSec != null) {
      chips.push({ icon: '⏳', value: `${s.minDurationSec}-${s.maxDurationSec}с`, label: 'БАФФ' });
    }
  }

  // 6. Спецификации.
  if (s.castDelaySec) {
    chips.push({ icon: '⏳', value: `${s.castDelaySec}с`, label: 'КАСТ' });
  }
  if (s.lifestealPct) {
    chips.push({ icon: '💉', value: `${Math.round(s.lifestealPct * 100)}%`, label: 'ЛАЙФСТИЛ' });
  }
  if (s.knockdownSec && s.knockdownChance == null) {
    // knockdownSec скейлится с уровнем (battle.js:535).
    chips.push({ icon: '💢', value: `${(s.knockdownSec * lm).toFixed(1)}с`, label: 'ОГЛУШ.' });
  }
  if (s.buffOnUse?.atkSpdBonusPct) {
    // buffOnUse.atkSpdBonusPct скейлится с уровнем (battle.js:697).
    chips.push({
      icon: '⚡',
      value: `+${Math.round(s.buffOnUse.atkSpdBonusPct * lm * 100)}%`,
      label: `${s.buffOnUse.durationSec}с АТК`,
    });
  }
  if (s.bonusCritChance) {
    chips.push({ icon: '✨', value: `+${Math.round(s.bonusCritChance * 100)}%`, label: 'КРИТ' });
  }

  return chips;
}

// ───────── Теги-синергии ─────────
// Авто-генерация по полям скилла. Чтобы добавить новый тег — одна правка здесь,
// пилюля автоматом подхватится для всех скиллов с этим полем.

export function describeSkillSynergies(id) {
  const s = SKILLS[id];
  if (!s) return [];
  const lines = [];

  // ─ APPLY: какие теги вешает на врагов ─
  if (s.dot) lines.push('🩸 цель начинает кровить');
  if (s.appliesMarkedSec) lines.push(`🎯 метит цель на ${s.appliesMarkedSec}с`);
  if (s.knockdownSec && s.knockdownChance == null) {
    const who = s.targetType === 'single' ? 'цель' : 'всех';
    lines.push(`💢 кладёт ${who} на ${s.knockdownSec}с`);
  }
  if (s.knockdownChance) {
    lines.push(`💢 ${Math.round(s.knockdownChance * 100)}% шанс положить при попадании`);
  }

  // ─ CONSUME: бонусы при ударе по тегнутой цели ─
  if (s.bonusVsBleedingPct) lines.push(`🩸 +${Math.round(s.bonusVsBleedingPct * 100)}% урона по кровящим`);
  if (s.bonusVsKnockedDownPct) lines.push(`💢 +${Math.round(s.bonusVsKnockedDownPct * 100)}% урона по лежачим`);
  if (s.bonusVsMarkedPct) lines.push(`🎯 +${Math.round(s.bonusVsMarkedPct * 100)}% урона по помеченным`);

  // ─ CONSUME (specials) ─
  if (s.bleedLifestealMultiplier) {
    lines.push(`🩸 ×${s.bleedLifestealMultiplier} лайфстил с кровящих`);
  }
  if (s.buffOnUse?.critChanceBonusIfTagged) {
    const pct = Math.round(s.buffOnUse.critChanceBonusIfTagged * 100);
    lines.push(`✨ +${pct}% крит-шанс если на цели любой тег`);
  }

  // ─ Таргетинг ─
  if (s.prefersMarkedTarget) lines.push('🎯 приоритет помеченной цели');

  // ─ Rage synergy: модификаторы при активной Ярости ─
  if (s.cdMultiplierIfRage) {
    lines.push(`🔥 КД ×${s.cdMultiplierIfRage} при Ярости`);
  }
  if (s.castDelayMultIfRage) {
    lines.push(`🔥 каст ×${s.castDelayMultIfRage} при Ярости`);
  }
  if (s.lifestealMultiplierIfRage) {
    lines.push(`🔥 ×${s.lifestealMultiplierIfRage} лайфстил при Ярости`);
  }
  if (s.pathWidthMultiplierIfRage) {
    lines.push(`🔥 ширина полосы ×${s.pathWidthMultiplierIfRage} при Ярости`);
  }

  return lines;
}

// Тон пилюли по ведущему эмодзи — для лёгкого цветового кода в UI.
export function synergyTone(text) {
  if (text.startsWith('🩸')) return 'bleed';
  if (text.startsWith('💢')) return 'kd';
  if (text.startsWith('🎯')) return 'mark';
  if (text.startsWith('🔥')) return 'rage';
  if (text.startsWith('✨')) return 'crit';
  return '';
}
