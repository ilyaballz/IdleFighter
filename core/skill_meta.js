// UI-метаданные скиллов: иконки, короткие имена, структурные чипы и теги-синергии.
// Сами цифры — в balance/skills.js. Здесь только презентация — но с учётом
// текущих статов героя и уровня скилла, чтобы чипы показывали живые числа.

import { SKILLS, MAX_SKILL_LEVEL } from '../balance/skills.js';
import { getEffectiveStat } from './stats_layer.js';
import { getSkillLevel } from './loadout.js';
import { STAT_META } from './stat_meta.js';

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

  // 1. Главный эффект — урон / хил / бонусы баффа. Идёт первым: это «выход» скилла,
  // самое информативное число. Multi-hit: total = perHit × hits, маркер «×N» в label.
  if (s.targetType === 'self_heal') {
    const heal = Math.round(heroMaxHp * s.healPctOfMaxHp * lm);
    chips.push({ icon: '💚', value: `${heal}`, label: 'ХИЛ' });
  } else if (s.targetType === 'self_buff') {
    // Бонусы баффа скейлятся с уровнем (см. battle.js: def.bonusX * lvlMult).
    if (s.bonusDamagePct) {
      chips.push({ icon: STAT_META.damage.icon, value: `+${Math.round(s.bonusDamagePct * lm * 100)}%`, label: STAT_META.damage.label });
    }
    if (s.bonusAttackSpeedPct) {
      chips.push({ icon: STAT_META.attackSpeedPct.icon, value: `+${Math.round(s.bonusAttackSpeedPct * lm * 100)}%`, label: STAT_META.attackSpeedPct.label });
    }
    if (s.minDurationSec != null && s.maxDurationSec != null) {
      chips.push({ icon: '⏳', value: `${s.minDurationSec}-${s.maxDurationSec}с`, label: 'БАФФ' });
    }
  } else if (s.baseDamageMultiplier) {
    const hits = s.hits || 1;
    const total = Math.round(heroDamage * s.baseDamageMultiplier * lm * hits);
    chips.push({ icon: STAT_META.damage.icon, value: `${total}`, label: hits > 1 ? `${STAT_META.damage.label} ×${hits}` : STAT_META.damage.label });
  }

  // 2. Тайминг — КД или заряды.
  if (s.activation === 'cooldown') {
    chips.push({ icon: '⏱', value: `${s.baseCooldown}с`, label: 'КД' });
  } else if (s.activation === 'charges') {
    chips.push({ icon: '🔋', value: `${s.minCharges}-${s.maxCharges}`, label: 'ЗАРЯДЫ' });
  }

  // 3. Тип цели (для атакующих — self_heal/self_buff раскрываются в блоке 1).
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
  }

  // 4. DoT — total урон за всю длительность.
  if (s.dot) {
    const totalDoT = Math.round(heroDamage * s.dot.damagePctPerSec * lm * s.dot.durationSec);
    chips.push({ icon: '🩸', value: `${totalDoT}`, label: `ЗА ${s.dot.durationSec}С` });
  }

  // 5. Спецификации.
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
  if (s.buffOnUse?.critChanceBonusPct) {
    const pct = Math.round(s.buffOnUse.critChanceBonusPct * 100);
    lines.push(`✨ +${pct}% крит-шанс на ${s.buffOnUse.durationSec}с после каста`);
  }

  // ─ Self-buff aura specials (для Ярости) ─
  if (s.burnDamagePct && s.burnTickSec) {
    const pct = Math.round(s.burnDamagePct * 100);
    lines.push(`🔥 огонь: +${pct}% урона/${s.burnTickSec}с в радиусе ${s.burnRadius}`);
  }

  // ─ Execute / финишер ─
  if (s.forceCritIfBelowHpPct) {
    const pct = Math.round(s.forceCritIfBelowHpPct * 100);
    lines.push(`💀 гарант. крит по цели < ${pct}% HP`);
  }

  // ─ Таргетинг ─
  if (s.prefersMarkedTarget) lines.push('🎯 приоритет помеченной цели');

  return lines;
}

// ───────── L10-перки ─────────
// Уникальные фишки, которые открываются на максимальном уровне скилла. Описания статичны
// (по skillId), поскольку каждый перк — отдельная механика; шаблонизировать не имеет смысла.
// describeL10Perk возвращает { text, unlocked } — UI рендерит как «закрытую» подсказку
// «откроется на L10» или как активную фишку с галочкой.

const L10_PERK_TEXTS = {
  hook:          '🎯 marked стак: +10% урона от всех источников за стак (cap 5)',
  cut:           '🩸 каждый тик кровотечения может крит (статы игрока)',
  spinkick:      '💀 добивающий удар сбрасывает КД в 0',
  roundkick:     '⏱ −0.3с КД за каждого задетого (cap 5)',
  slam:          '🔥 после приземления остаётся горящая зона (3с, 25% damage/с)',
  rage:          '🔥 аура: радиус ×1.5, тики вдвое чаще',
  breath:        '🛡 overheal превращается в щит (10с, перезапись)',
  double_strike: '🤜 +1 удар всегда, ещё +1 по кровящей цели',
  bloodlust:     '🩸 40% шанс повесить bleed на каждого задетого',
  combo:         '⚡ бафф продлевается +0.5с за каждый auto-hit (cap 5с)',
  trip:          '◎ радиус +30% (100 → 130)',
  dash:          '🏃 +1 заряд — два рывка подряд',
};

export function describeL10Perk(id) {
  const text = L10_PERK_TEXTS[id];
  if (!text) return null;
  const unlocked = getSkillLevel(id) >= MAX_SKILL_LEVEL;
  return { text, unlocked };
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
