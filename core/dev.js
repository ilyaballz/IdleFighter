// Дев-панель: чит-кнопки + симулятор. Выделено в отдельный модуль, чтобы не засорять game.js.

import { SKILLS } from '../balance/skills.js';
import { RARITIES, EQUIPMENT_SLOTS } from '../balance/equipment.js';
import { getEffectiveStat, heroState, resetAllProgression } from './stats_layer.js';
import { loadoutState, addShard, addGachaToken, unlockAll } from './loadout.js';
import { inventoryState, addItem, rollBossDrop, resetInventory } from './inventory.js';
import { hubState, resetHubState } from '../hub/state.js';
import { renderHub } from '../hub/ui.js';
import { logEvent } from './logger.js';
import {
  buildCurrentScenario, buildScenarioWithoutEquip,
  buildScenarioWithoutTrainers, buildBareScenario,
  compareScenarios,
} from './simulator.js';

const $ = (id) => document.getElementById(id);

// ctx = { world, getScene, startLocation }
export function bindDevPanel(ctx) {
  const refreshIfHub = () => { if (ctx.getScene() === 'hub') renderHub(); };

  $('dev-reset-loc').addEventListener('click', () => {
    if (ctx.getScene() === 'battle') ctx.startLocation(ctx.world.location.locationIndex);
  });
  $('dev-next-loc').addEventListener('click', () => {
    hubState.currentLocationIndex++;
    if (ctx.getScene() === 'battle') ctx.startLocation(hubState.currentLocationIndex);
    else renderHub();
  });
  $('dev-heal').addEventListener('click', () => {
    heroState.currentHp = getEffectiveStat('maxHp');
  });
  $('dev-kill-all').addEventListener('click', () => {
    if (ctx.getScene() !== 'battle') return;
    const arena = ctx.world.location.arenas[ctx.world.hero.targetArenaIndex - 1];
    if (arena && arena.enemies) {
      for (const e of arena.enemies) {
        if (e.alive) {
          e.hp = 0;
          e.alive = false;
          ctx.world.onEnemyKilled?.(e);
        }
      }
    }
  });
  $('dev-unlock-all').addEventListener('click', () => {
    unlockAll();
    refreshIfHub();
    logEvent('DEV: открыты все скиллы');
  });
  $('dev-go-hub').addEventListener('click', () => ctx.enterHub());
  $('dev-rage-fill').addEventListener('click', () => {
    if (ctx.world.hero) ctx.world.hero.rageCharges = SKILLS.rage.maxCharges;
  });
  $('dev-energy').addEventListener('click', () => {
    hubState.energy = Math.min(hubState.energy + 100, 1e6);
    refreshIfHub();
  });
  $('dev-coins').addEventListener('click', () => {
    ctx.world.coins += 5000;
    refreshIfHub();
  });
  $('dev-shards').addEventListener('click', () => {
    for (const id of Object.keys(SKILLS)) {
      if (loadoutState.unlocked.includes(id)) addShard(id, 10);
    }
    refreshIfHub();
  });
  $('dev-gacha-token').addEventListener('click', () => {
    addGachaToken(1);
    logEvent('DEV: +1 жетон гачи');
    refreshIfHub();
  });
  $('dev-sim').addEventListener('click', () => runSimulator());
  $('sim-close').addEventListener('click', () => {
    $('sim-modal').classList.remove('show');
  });
  $('dev-epic-item').addEventListener('click', () => {
    const item = rollBossDrop(ctx.world.location?.locationIndex || 1);
    if (item) {
      addItem(item);
      logEvent(`DEV: +[${RARITIES[item.rarity].name}] ${EQUIPMENT_SLOTS[item.slot].name}`, 'kill');
      refreshIfHub();
    }
  });
  $('dev-stat-levels').addEventListener('click', () => {
    for (const s of ['strength', 'toughness', 'agility']) {
      heroState.levels[s] += 10;
    }
    heroState.currentHp = getEffectiveStat('maxHp');
    refreshIfHub();
  });
  $('dev-reset-progress').addEventListener('click', () => {
    resetAllProgression();
    resetHubState();
    for (const id of Object.keys(SKILLS)) {
      loadoutState.levels[id] = 1;
      loadoutState.shards[id] = 0;
    }
    loadoutState.unlocked = ['hook'];
    loadoutState.selected = ['hook', null, null];
    loadoutState.gachaTokens = 0;
    resetInventory();
    ctx.world.coins = 0;
    refreshIfHub();
  });
}

function runSimulator() {
  const scenarios = [
    buildCurrentScenario(),
    buildScenarioWithoutEquip(),
    buildScenarioWithoutTrainers(),
    buildBareScenario(),
  ];
  const reports = compareScenarios(scenarios, 1, 15);
  renderSimReport(reports);
  $('sim-modal').classList.add('show');
}

function fmtTime(sec) {
  if (!isFinite(sec)) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function renderSimReport(reports) {
  const out = $('sim-output');
  let html = '';

  html += `<h3>СРАВНЕНИЕ БИЛДОВ</h3>`;
  html += `<table><thead><tr>
    <th>Сценарий</th><th>HP</th><th>DMG</th><th>AS</th>
    <th>Crit</th><th>Single DPS</th><th>AoE DPS</th><th>Макс. локация</th>
  </tr></thead><tbody>`;
  for (const rep of reports) {
    const stats = rep.results[0]?.stats;
    const dps = rep.results[0]?.dps;
    if (!stats || !dps) continue;
    const totalSingle = (dps.autoDps + dps.skillDpsSingle).toFixed(1);
    const totalAoe = dps.skillDpsAoe.toFixed(1);
    const maxClear = rep.firstFail === null
      ? `${rep.results[rep.results.length - 1].locationLevel}+`
      : `${rep.firstFail - 1}`;
    html += `<tr>
      <td><b>${rep.scenario.name}</b></td>
      <td>${Math.round(stats.maxHp)}</td>
      <td>${stats.damage.toFixed(1)}</td>
      <td>${stats.attackSpeed.toFixed(2)}/s</td>
      <td>${(stats.critChance*100).toFixed(1)}%×${stats.critMultiplier.toFixed(2)}</td>
      <td>${totalSingle}</td>
      <td>${totalAoe}</td>
      <td><b>${maxClear}</b></td>
    </tr>`;
  }
  html += `</tbody></table>`;

  for (const rep of reports) {
    html += `<div class="scenario-block">`;
    html += `<h3>${rep.scenario.name.toUpperCase()}</h3>`;
    html += `<table><thead><tr>
      <th>Лок.</th><th>Резулт.</th><th>TTC</th><th>Стенка</th>
    </tr></thead><tbody>`;
    for (const r of rep.results) {
      const passed = r.canClear;
      const tag = passed ? '<td class="ok">✓ pass</td>' : '<td class="fail">✗ death</td>';
      const wall = passed ? '—' : `арена ${r.deathArena}/${r.arenas.length}`;
      html += `<tr><td>L${r.locationLevel}</td>${tag}<td>${fmtTime(r.totalTime)}</td><td>${wall}</td></tr>`;
    }
    html += `</tbody></table>`;
    if (rep.scenario.name === 'текущий билд' && rep.results[0]) {
      const breakdown = rep.results[0].dps.breakdown;
      html += `<h3 style="font-size:11px; margin-top:6px;">DPS вклад скиллов</h3><pre>`;
      html += `auto:                ${rep.results[0].dps.autoDps.toFixed(1)}\n`;
      for (const b of breakdown) {
        html += `${b.name.padEnd(20)} ${b.dps.toFixed(1).padStart(6)}${b.note ? '  ('+b.note+')' : ''}\n`;
      }
      html += `</pre>`;
    }
    html += `</div>`;
  }

  html += `<h3>ПРИМЕЧАНИЯ К МОДЕЛИ</h3>`;
  html += `<pre>• Модель — пиковый DPS, без учёта движения, кнокбэков и реальной AI-петли.
• AoE-вклад умножается на min(N, 4) — приближение «среднего числа целей».
• Скиллы charges/buff/heal (Ярость, Серия-бафф, Дыхание, Кровожадность-хил) пока в DPS не учтены.
• Уворот и защита считаются мультипликативно: incoming × (1−dodge) × (1−defense).
• Регенерация HP в бою и между аренами учтены.
• Используй разные сценарии чтобы оценить вклад эквипа/качалки в bottleneck.</pre>`;

  out.innerHTML = html;
}
