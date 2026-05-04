// UI-метаданные скиллов: иконки, короткие имена, описания. Сами цифры в balance/skills.js.

import { SKILLS } from '../balance/skills.js';

export const SKILL_ICONS = {
  hook:'🥊', cut:'🔪', spinkick:'🌀', roundkick:'🦵',
  slam:'💥', rage:'🔥', breath:'💨',
  double_strike:'🤜', bloodlust:'🩸', combo:'⚡',
};

export const SKILL_SHORT_NAMES = {
  hook: 'Хук', cut: 'Рассеч.', spinkick: 'Вертушка', roundkick: 'Раунд-кик',
  slam: 'Прыжок', rage: 'Ярость', breath: 'Дыхание',
  double_strike: 'Двойной', bloodlust: 'Кровожад.', combo: 'Серия',
};

export const SKILL_DESC = {
  hook:'Удар по одной цели, ×{m}',
  cut:'Удар + DoT {dot}%/с {dur}с',
  spinkick:'Удар, +{bc}% крит, ×{m}',
  roundkick:'AoE r={r}, ×{m}',
  slam:'Прыжок {d}с → AoE r={r}, ×{m}',
  rage:'Бафф {durMin}-{durMax}с от зарядов: +{bd}% урон, +{ba}% атк',
  breath:'Лечение {h}% макс HP',
  double_strike:'×{hits} удара по цели, +{bc}% крит, ×{m}',
  bloodlust:'AoE r={r}, ×{m}, лечит {ls}% урона',
  combo:'Удар, +{ba}% ск.атаки на {dur}с',
};

export function describeSkill(id) {
  const s = SKILLS[id];
  if (!s) return '';
  const baSrc = s.bonusAttackSpeedPct ?? s.buffOnUse?.atkSpdBonusPct;
  const durSrc = s.dot?.durationSec ?? s.durationSec ?? s.buffOnUse?.durationSec;
  return SKILL_DESC[id]
    .replaceAll('{m}', s.baseDamageMultiplier)
    .replaceAll('{r}', s.aoeRadius || '')
    .replaceAll('{d}', s.castDelaySec || '')
    .replaceAll('{dot}', s.dot ? Math.round(s.dot.damagePctPerSec * 100) : '')
    .replaceAll('{dur}', durSrc != null ? durSrc : '')
    .replaceAll('{durMin}', s.minDurationSec ?? '')
    .replaceAll('{durMax}', s.maxDurationSec ?? '')
    .replaceAll('{bc}', s.bonusCritChance ? Math.round(s.bonusCritChance * 100) : '')
    .replaceAll('{bd}', s.bonusDamagePct ? Math.round(s.bonusDamagePct * 100) : '')
    .replaceAll('{ba}', baSrc ? Math.round(baSrc * 100) : '')
    .replaceAll('{h}', s.healPctOfMaxHp ? Math.round(s.healPctOfMaxHp * 100) : '')
    .replaceAll('{hits}', s.hits || 1)
    .replaceAll('{ls}', s.lifestealPct ? Math.round(s.lifestealPct * 100) : '');
}
