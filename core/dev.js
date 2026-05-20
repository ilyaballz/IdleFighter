// Дев-панель: чит-кнопки + симулятор. Выделено в отдельный модуль, чтобы не засорять game.js.

import { SKILLS } from '../balance/skills.js';
import { RARITIES, EQUIPMENT_SLOTS } from '../balance/equipment.js';
import { getEffectiveStat, heroState, resetAllProgression } from './stats_layer.js';
import { loadoutState, addShard, addGachaToken, unlockAll } from './loadout.js';
import { inventoryState, addItem, rollBossDrop, resetInventory } from './inventory.js';
import { hubState, resetHubState, getTrainerLevelCap } from '../hub/state.js';
import { barState, resetBarState } from './bar_state.js';
import { awardSticker, resetStickers, getUnlockedStickers } from './stickers_state.js';
import { ALL_STICKER_IDS, STICKERS } from '../balance/stickers.js';
import * as ftue from './ftue.js';
import { wipeSave } from './save.js';
import { renderHub, showStickerToast } from '../hub/ui.js';
import { logEvent } from './logger.js';
import {
  buildCurrentScenario, compareScenarios, runProgressionRange,
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
  const devNutsBtn = $('dev-nuts');
  if (devNutsBtn) devNutsBtn.addEventListener('click', () => {
    ctx.world.nuts = (ctx.world.nuts || 0) + 20;
    refreshIfHub();
  });
  const devEssenceBtn = $('dev-essence');
  if (devEssenceBtn) devEssenceBtn.addEventListener('click', () => {
    ctx.world.essence = (ctx.world.essence || 0) + 50;
    refreshIfHub();
  });
  const devCrystalsBtn = $('dev-crystals');
  if (devCrystalsBtn) devCrystalsBtn.addEventListener('click', () => {
    ctx.world.crystals = (ctx.world.crystals || 0) + 20;
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
  const devBarTicketBtn = $('dev-bar-ticket');
  if (devBarTicketBtn) devBarTicketBtn.addEventListener('click', () => {
    // Сознательно без клэмпа на BAR.maxTickets — для тестовой серии скретч-карт нужно
    // больше билетов, чем продакшен-кэп. UI всё равно отрисует только maxTickets иконок.
    barState.tickets++;
    logEvent(`DEV: +1 билет бара (всего ${barState.tickets})`);
    refreshIfHub();
  });

  const devStickerBtn = $('dev-sticker');
  if (devStickerBtn) devStickerBtn.addEventListener('click', () => {
    const owned = getUnlockedStickers();
    const missing = ALL_STICKER_IDS.filter(id => !owned.has(id));
    if (missing.length === 0) {
      logEvent('DEV: все 25 наклеек уже собраны', 'warn');
      return;
    }
    const id = missing[Math.floor(Math.random() * missing.length)];
    if (awardSticker(id)) {
      const s = STICKERS[id];
      logEvent(`DEV: +наклейка ${s.icon} ${s.name}`, 'crit');
      showStickerToast(id);
      refreshIfHub();
    }
  });
  $('dev-stat-levels').addEventListener('click', () => {
    for (const s of ['strength', 'toughness', 'agility']) {
      const cap = getTrainerLevelCap(s);
      if (cap > 0) heroState.levels[s] = Math.min(heroState.levels[s] + 10, cap);
    }
    heroState.currentHp = getEffectiveStat('maxHp');
    refreshIfHub();
  });
  $('dev-reset-progress').addEventListener('click', () => {
    resetAllProgression();
    resetHubState();
    resetBarState();
    resetStickers();
    ftue.reset();
    for (const id of Object.keys(SKILLS)) {
      loadoutState.levels[id] = 1;
      loadoutState.shards[id] = 0;
    }
    loadoutState.unlocked = ['hook'];
    loadoutState.selected = ['hook', null, null];
    loadoutState.gachaTokens = 0;
    resetInventory();
    ctx.world.coins = 0;
    ctx.world.nuts = 0;
    ctx.world.essence = 0;
    wipeSave();
    refreshIfHub();
  });
}

function runSimulator() {
  // Диапазон под текущий FINAL_LOCATION=20. При расширении до 40 (главы 3-4) — обновить.
  const reports = compareScenarios([buildCurrentScenario()], 1, 20);
  reports.push(runProgressionRange(1, 20));
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
    const totalSingle = (dps.autoDps * dps.rageMultAuto + dps.skillDpsSingle * dps.rageMultSkill).toFixed(1);
    const totalAoe = (dps.skillDpsAoe * dps.rageMultSkill).toFixed(1);
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
• Ярость учтена через uptime (greedy-каст при minCharges): множитель к auto и skill DPS.
• Heal/buffOnUse/lifesteal (Дыхание, Серия-бафф, Кровожадность-LS) в DPS не учтены — они влияют на выживаемость, не на урон.
• Уворот и защита считаются мультипликативно: incoming × (1−dodge) × (1−defense).
• Регенерация HP в бою и между аренами учтены.
• Используй разные сценарии чтобы оценить вклад эквипа/качалки в bottleneck.</pre>`;

  out.innerHTML = html;
}
