// UI боя: HUD, кнопки скиллов, оверлеи победы/поражения, переключение в боевую сцену.

import { getEffectiveStat, heroState } from '../core/stats_layer.js';
import { SKILLS } from '../balance/skills.js';
import { arenaTypeLabel } from '../balance/enemies.js';
import { loadoutState, getSkillLevel } from '../core/loadout.js';
import { SKILL_ICONS } from '../core/skill_meta.js';
import { localCdRateForSkill } from './battle.js';
import * as ftue from '../core/ftue.js';

const $ = (id) => document.getElementById(id);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ───────── HUD ─────────

export function updateHud(world) {
  const arena = world.location.arenas[world.hero.targetArenaIndex - 1];
  const arenaIdx = arena ? arena.index : world.location.arenas.length;
  const total = world.location.arenas.length;
  const tag = arenaTypeLabel(arena?.composition?.type);
  const suffix = tag ? ` (${tag})` : '';
  $('loc-title').textContent = `ЛОКАЦИЯ ${world.location.locationIndex} — АРЕНА ${arenaIdx}/${total}${suffix}`;
  $('coins-display').textContent = `💰 ${world.coins}`;

  const maxHp = getEffectiveStat('maxHp');
  const cur = Math.max(0, Math.round(heroState.currentHp));
  const pct = (cur / maxHp) * 100;
  $('hero-hp-fill').style.width = `${pct}%`;
  $('hero-hp-text').textContent = `${cur} / ${Math.round(maxHp)}`;
}

// ───────── Skill buttons ─────────

export function updateSkillButtons(hero) {
  const buttons = $$('#skill-bar .skill-btn');
  // FTUE: пульсируем кнопку первого скилла в первом бою, пока игрок ни разу не кастанул вручную.
  const ftueSkillPulse = ftue.pulseIfPending('skillCast') !== '';
  for (let i = 0; i < buttons.length; i++) {
    const btn = buttons[i];
    const skillId = loadoutState.selected[i];
    const cd = btn.querySelector('.cd-overlay');
    const cdText = btn.querySelector('.cd-text');
    const charges = btn.querySelector('.charges-bar');
    const nameEl = btn.querySelector('.name');
    const lvlEl = btn.querySelector('.lvl');
    const iconEl = btn.querySelector('.icon');

    btn.classList.remove('ready', 'charges-full', 'empty', 'ftue-pulse-btn');
    if (!skillId || !SKILLS[skillId]) {
      btn.classList.add('empty');
      nameEl.textContent = '—';
      lvlEl.textContent = '';
      iconEl.textContent = '';
      cdText.textContent = '';
      cd.style.setProperty('--cd-pct', 0);
      charges.style.setProperty('--charges-pct', '0%');
      continue;
    }
    const def = SKILLS[skillId];
    nameEl.textContent = def.name;
    lvlEl.textContent = `ур.${getSkillLevel(skillId)}`;
    iconEl.textContent = SKILL_ICONS[skillId] || '?';

    if (def.activation === 'cooldown') {
      const remaining = hero.skillCooldowns[skillId] || 0;
      const fullCd = def.baseCooldown / (1 + getEffectiveStat('skillCdrPct') + localCdRateForSkill(skillId));
      const pct = fullCd > 0 ? remaining / fullCd : 0;
      cd.style.setProperty('--cd-pct', pct);
      cdText.textContent = remaining > 0 ? remaining.toFixed(1) : '';
      charges.style.setProperty('--charges-pct', '0%');
      if (remaining <= 0) btn.classList.add('ready');
    } else if (def.activation === 'charges') {
      const cur = hero.rageCharges;
      const minCh = def.minCharges ?? def.chargesRequired ?? 1;
      const maxCh = def.maxCharges ?? def.chargesRequired ?? 1;
      const pct = Math.min(1, cur / maxCh) * 100;
      charges.style.setProperty('--charges-pct', `${pct}%`);
      cd.style.setProperty('--cd-pct', 0);
      cdText.textContent = `${cur}/${maxCh}`;
      if (cur >= minCh) btn.classList.add('charges-full');
    }

    // FTUE: пульс на первом готовом скилле — учим что их можно жать руками.
    if (ftueSkillPulse && i === 0
        && (btn.classList.contains('ready') || btn.classList.contains('charges-full'))) {
      btn.classList.add('ftue-pulse-btn');
    }
  }
}

export function bindSkillButtons(onSkillClick) {
  const buttons = $$('#skill-bar .skill-btn');
  buttons.forEach((btn, i) => {
    btn.addEventListener('click', () => {
      const skillId = loadoutState.selected[i];
      if (skillId) onSkillClick(skillId);
    });
  });
}

// ───────── Overlays ─────────

export function showDefeat() { $('defeat-overlay').classList.add('show'); }
export function hideDefeat() { $('defeat-overlay').classList.remove('show'); }
export function showVictory(text) {
  $('victory-text').textContent = text || '';
  $('victory-overlay').classList.add('show');
}
export function hideVictory() { $('victory-overlay').classList.remove('show'); }

// ───────── Сцена ─────────

export function showBattleScene() {
  $('hub-scene').classList.remove('show');
  $('hud').style.display = '';
  $('skill-bar').style.display = '';
  $('hub-btn').style.display = '';
  $('game-canvas').style.display = '';
}
