// UI хаба: карточки тренажёров, лоадаут, гача, гардероб, тап-оверлей, навигация под-экранов.

import { getEffectiveStat, getStatXpProgress } from '../core/stats_layer.js';
import { SKILLS, GACHA } from '../balance/skills.js';
import { STAT_BONUSES } from '../balance/player.js';
import { TAP_BAR, ENERGY } from '../balance/training.js';
import {
  loadoutState, isUnlocked, setSlot, getSkillLevel,
  getSkillShards, getSkillUpgradeCost, tryUpgradeSkill,
  consumeGachaToken, rollGachaResult, applyGachaResult,
} from '../core/loadout.js';
import {
  hubState, getTrainerInfo, computeZones,
} from './state.js';
import { EQUIPMENT_SLOTS, RARITIES } from '../balance/equipment.js';
import {
  inventoryState, equipItem, unequipSlot,
  getEquippedItemForSlot, getItemsForSlot,
} from '../core/inventory.js';
import { SKILL_ICONS, SKILL_SHORT_NAMES, describeSkill } from '../core/skill_meta.js';
import { logEvent } from '../core/logger.js';
import { hideDefeat, hideVictory } from '../battle/ui.js';

const $ = (id) => document.getElementById(id);

// ───────── Метаданные статов ─────────

const STAT_NAMES = {
  strength: 'СИЛА',
  toughness: 'СТОЙКОСТЬ',
  agility: 'ЛОВКОСТЬ',
};

const BONUS_FORMAT = {
  damage:         (v) => `+${v} урон`,
  critChance:     (v) => `+${(v * 100).toFixed(1)}% крит`,
  maxHp:          (v) => `+${v} HP`,
  defense:        (v) => `+${(v * 100).toFixed(1)}% защ.`,
  hpRegen:        (v) => `+${(v * 100).toFixed(2)}%/с реген`,
  attackSpeedPct: (v) => `+${(v * 100).toFixed(0)}% ск.атаки`,
  skillCdrPct:    (v) => `+${(v * 100).toFixed(1)}% CDR`,
  dodgeChance:    (v) => `+${(v * 100).toFixed(1)}% уворот`,
};

function describeStatBonusPerLevel(stat) {
  const b = STAT_BONUSES[stat];
  return Object.entries(b)
    .map(([k, v]) => BONUS_FORMAT[k] ? BONUS_FORMAT[k](v) : `${k}+${v}`)
    .join(' · ');
}

// ───────── Сцена ─────────

export function showHubScene() {
  $('hub-scene').classList.add('show');
  $('hud').style.display = 'none';
  $('skill-bar').style.display = 'none';
  $('hub-btn').style.display = 'none';
  hideDefeat();
  hideVictory();
  showHubScreen('home');
  renderHub();
}

// ───────── Sub-screens ─────────

const HUB_SCREENS = ['home', 'gym', 'gacha', 'arsenal', 'wardrobe'];
let currentHubScreen = 'home';

export function showHubScreen(name) {
  if (!HUB_SCREENS.includes(name)) name = 'home';
  currentHubScreen = name;
  for (const s of HUB_SCREENS) {
    const el = $(`hub-${s}`);
    if (el) el.classList.toggle('active', s === name);
  }
  refreshCurrentHubScreen();
}

function refreshCurrentHubScreen() {
  switch (currentHubScreen) {
    case 'home':
      renderStatsPanel();
      renderBuildings();
      break;
    case 'gym':
      renderTrainers();
      break;
    case 'gacha':
      renderGacha();
      break;
    case 'arsenal':
      renderLoadoutSlots();
      renderSkillsGrid();
      break;
    case 'wardrobe':
      renderWardrobe();
      break;
  }
}

(function bindHubNav() {
  const scene = $('hub-scene');
  if (!scene) return;
  scene.addEventListener('click', (ev) => {
    const card = ev.target.closest('.building-card');
    if (card && !card.classList.contains('disabled')) {
      showHubScreen(card.dataset.screen);
      return;
    }
    if (ev.target.closest('[data-back]')) {
      showHubScreen('home');
    }
  });
})();

// ───────── Хаб HUD + здания ─────────

let activeSlotIdx = null;

export function renderHub() {
  $('hub-loc-info').textContent = `ЛОКАЦИЯ ${hubState.currentLocationIndex}`;
  $('hub-coins').textContent = `💰 ${currentCoins()}`;
  const eMax = ENERGY.maxCap;
  const eCur = Math.floor(hubState.energy);
  $('hub-energy-text').textContent = `⚡ ${eCur} / ${eMax}`;
  $('hub-energy-fill').style.width = `${(hubState.energy / eMax) * 100}%`;
  const sec = 1 / ENERGY.recoverPerSec;
  $('hub-energy-rate').textContent = sec < 60
    ? `+1 / ${Math.round(sec)}с`
    : `+1 / ${Math.round(sec / 60)}мин`;
  refreshCurrentHubScreen();
}

function renderBuildings() {
  const grid = $('buildings-grid');
  if (!grid) return;
  const tokens = loadoutState.gachaTokens || 0;
  const buildings = [
    { id: 'gym', icon: '🏋️', name: 'КАЧАЛКА', hint: 'тренажёры и тапы' },
    { id: 'gacha', icon: '🎰', name: 'ГАЧА',
      hint: 'крутить скиллы',
      cornerBadge: tokens > 0 ? tokens : null },
    { id: 'arsenal', icon: '🥋', name: 'АРСЕНАЛ', hint: 'скиллы / лоадаут' },
    { id: 'wardrobe', icon: '👕', name: 'ГАРДЕРОБ',
      hint: `${inventoryState.items.length} предм.`,
      cornerBadge: inventoryState.items.length > 0 ? inventoryState.items.length : null },
  ];
  grid.innerHTML = buildings.map(b => `
    <div class="building-card${b.stub ? ' stub' : ''}" data-screen="${b.id}">
      ${b.cornerBadge != null ? `<span class="corner-badge">${b.cornerBadge}</span>` : ''}
      <div class="icon">${b.icon}</div>
      <div class="name">${b.name}</div>
      <div class="hint${b.badge ? ' badge' : ''}">${b.hint}</div>
    </div>
  `).join('');
}

function renderStatsPanel() {
  const root = $('stats-panel');
  if (!root) return;
  const items = [
    { label: 'HP',        value: Math.round(getEffectiveStat('maxHp')) },
    { label: 'УРОН',      value: getEffectiveStat('damage').toFixed(1) },
    { label: 'СК.АТАКИ',  value: getEffectiveStat('attackSpeed').toFixed(2) + '/с' },
    { label: 'КРИТ',      value: (getEffectiveStat('critChance') * 100).toFixed(1) + '%' },
    { label: 'МУЛ.КРИТА', value: '×' + getEffectiveStat('critMultiplier').toFixed(2) },
    { label: 'УВОРОТ',    value: (getEffectiveStat('dodgeChance') * 100).toFixed(1) + '%' },
    { label: 'ЗАЩИТА',    value: (getEffectiveStat('defense') * 100).toFixed(1) + '%' },
    { label: 'CDR СКИЛЛ', value: (getEffectiveStat('skillCdrPct') * 100).toFixed(1) + '%' },
  ];
  root.innerHTML = items.map(it => `
    <div class="stat-row"><span class="lbl">${it.label}</span><span class="val">${it.value}</span></div>
  `).join('');
}

let coinsAccessor = () => 0;
export function bindCoinsAccessor(getCoinsFn) { coinsAccessor = getCoinsFn; }
function currentCoins() { return coinsAccessor(); }

// ───────── Тренажёры ─────────

function renderTrainers() {
  const root = $('trainers-list');
  root.innerHTML = '';
  for (const stat of ['strength', 'toughness', 'agility']) {
    const info = getTrainerInfo(stat);
    const xp = getStatXpProgress(stat);
    const card = document.createElement('div');
    card.className = 'trainer-card';
    const cost = info.nextTierCost;
    const canTrain = hubState.energy >= ENERGY.trainerEntryCost;
    const canUpgrade = !info.isMaxTier && currentCoins() >= cost;
    card.innerHTML = `
      <div class="head">
        <div>
          <span class="icon">${info.icon}</span> ${info.name.toUpperCase()}
          <span class="stat-name"> · ${STAT_NAMES[stat]}</span>
        </div>
        <div class="level">ур. ${xp.level}</div>
      </div>
      <div class="bonus-desc">${describeStatBonusPerLevel(stat)} / ур.</div>
      <div class="xp-bar"><div class="xp-fill" style="width:${(xp.current / xp.needed) * 100}%"></div></div>
      <div class="meta">
        <span>XP ${Math.floor(xp.current)}/${xp.needed}</span>
        <span>Тир ${info.tier} · ${info.xpPerTap} XP/тап</span>
      </div>
      <div class="actions">
        <button class="upgrade" ${canUpgrade ? '' : 'disabled'}>${
          info.isMaxTier ? 'МАКС ТИР' : `Тир ${info.tier + 1} (${cost}💰)`
        }</button>
        <button class="primary train" ${canTrain ? '' : 'disabled'}>ТРЕНИРОВАТЬСЯ (${ENERGY.trainerEntryCost}⚡)</button>
      </div>
    `;
    card.querySelector('.upgrade').addEventListener('click', () => onTrainerUpgrade(stat));
    card.querySelector('.train').addEventListener('click', () => onTrainerStart(stat));
    root.appendChild(card);
  }
}

let onTrainerUpgrade = () => {};
let onTrainerStart  = () => {};
export function bindHubActions(handlers) {
  if (handlers.onTrainerUpgrade) onTrainerUpgrade = handlers.onTrainerUpgrade;
  if (handlers.onTrainerStart)   onTrainerStart   = handlers.onTrainerStart;
}

// ───────── Лоадаут / Арсенал ─────────

function renderLoadoutSlots() {
  const root = $('loadout-slots');
  root.innerHTML = '';
  for (let i = 0; i < loadoutState.selected.length; i++) {
    const id = loadoutState.selected[i];
    const div = document.createElement('div');
    div.className = 'loadout-slot' + (id ? ' filled' : '');
    if (i === activeSlotIdx) div.style.outline = '2px solid var(--neon-pink)';
    div.innerHTML = id
      ? `<div class="icon">${SKILL_ICONS[id] || '?'}</div><div class="lbl">${SKILLS[id].name}</div>`
      : `<div class="icon">+</div><div class="lbl">слот ${i + 1}</div>`;
    div.addEventListener('click', () => {
      if (id) {
        setSlot(i, null);
      } else {
        activeSlotIdx = (activeSlotIdx === i) ? null : i;
      }
      renderLoadoutSlots();
      renderSkillsGrid();
    });
    root.appendChild(div);
  }
}

function renderSkillsGrid() {
  const root = $('loadout-pool');
  root.innerHTML = '';
  for (const id of Object.keys(SKILLS)) {
    const def = SKILLS[id];
    const equipped = loadoutState.selected.includes(id);
    const locked = !isUnlocked(id);
    const lvl = getSkillLevel(id);
    const shards = getSkillShards(id);
    const upCost = getSkillUpgradeCost(id);
    const card = document.createElement('div');
    card.className = 'skill-card'
                   + (equipped ? ' equipped' : '')
                   + (locked ? ' locked' : '');
    card.innerHTML = `
      <div class="title">${SKILL_ICONS[id] || ''} ${def.name}</div>
      <div class="meta">${def.activation === 'charges' ? 'заряды' : `КД ${def.baseCooldown}с`} · ур.${lvl}${locked ? ' · 🔒' : ''}</div>
      <div class="desc">${describeSkill(id)}</div>
      ${locked ? '' : `
        <div class="shards-info">шарды: ${shards} / ${upCost}</div>
        <button class="upgrade-btn" ${shards >= upCost ? '' : 'disabled'}>+1 ур.</button>
      `}
    `;
    card.addEventListener('click', (ev) => {
      if (ev.target.closest('.upgrade-btn')) return;
      if (locked) return;
      if (equipped) {
        for (let i = 0; i < loadoutState.selected.length; i++) {
          if (loadoutState.selected[i] === id) setSlot(i, null);
        }
      } else {
        let target = activeSlotIdx;
        if (target == null) target = loadoutState.selected.findIndex(s => !s);
        if (target < 0) target = 0;
        setSlot(target, id);
        activeSlotIdx = null;
      }
      renderLoadoutSlots();
      renderSkillsGrid();
    });
    const upBtn = card.querySelector('.upgrade-btn');
    if (upBtn) {
      upBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (tryUpgradeSkill(id)) {
          logEvent(`${def.name}: ур. ${getSkillLevel(id)}`, 'kill');
          renderSkillsGrid();
        }
      });
    }
    root.appendChild(card);
  }
}

// ───────── Гача ─────────

let gachaSpinning = false;
const ALL_SKILL_IDS = Object.keys(SKILLS);

function renderGacha() {
  const tokens = loadoutState.gachaTokens || 0;
  $('gacha-tokens').textContent = tokens;
  $('gacha-spin').disabled = gachaSpinning || tokens === 0;
  if (gachaSpinning) return;
  $('gacha-result').textContent = '';
  rebuildGachaStrip();
}

function rebuildGachaStrip() {
  const strip = $('gacha-strip');
  strip.innerHTML = '';
  for (const id of ALL_SKILL_IDS) {
    const div = document.createElement('div');
    const isLocked = !loadoutState.unlocked.includes(id);
    div.className = 'gacha-icon ' + (isLocked ? 'locked' : 'unlocked');
    div.dataset.skillId = id;
    div.style.position = 'relative';
    div.innerHTML = `
      <div class="icon">${SKILL_ICONS[id] || '?'}</div>
      <div class="name">${SKILL_SHORT_NAMES[id] || SKILLS[id].name}</div>
      ${isLocked ? '<span class="lock">🔒</span>' : ''}
    `;
    div.title = isLocked
      ? `${SKILLS[id].name} (закрыт)`
      : `${SKILLS[id].name} — повтор: +${GACHA.duplicateShards} шардов`;
    strip.appendChild(div);
  }
}

export function startGachaSpin(onResult) {
  if (gachaSpinning) return false;
  if ((loadoutState.gachaTokens || 0) <= 0) return false;

  gachaSpinning = true;
  consumeGachaToken();
  $('gacha-tokens').textContent = loadoutState.gachaTokens;
  $('gacha-result').textContent = '';
  $('gacha-spin').disabled = true;

  const result = rollGachaResult();
  const targetIdx = ALL_SKILL_IDS.indexOf(result.skillId);
  const N = ALL_SKILL_IDS.length;
  const totalSteps = N * 2 + targetIdx;
  const icons = Array.from(document.querySelectorAll('#gacha-strip .gacha-icon'));
  icons.forEach(ic => ic.classList.remove('highlighted', 'winner-unlock', 'winner-shards'));

  let step = 0;
  const tick = () => {
    icons.forEach(ic => ic.classList.remove('highlighted'));
    const idx = step % N;
    if (icons[idx]) icons[idx].classList.add('highlighted');
    step++;
    if (step > totalSteps) {
      setTimeout(() => settleWinner(icons, targetIdx, result, onResult), 400);
      return;
    }
    const t = step / totalSteps;
    const delay = 40 + Math.pow(t, 2.4) * 300;
    setTimeout(tick, delay);
  };
  tick();
  return true;
}

function settleWinner(icons, targetIdx, result, onResult) {
  const winEl = icons[targetIdx];
  if (winEl) {
    winEl.classList.remove('highlighted');
    winEl.classList.add(result.type === 'unlock' ? 'winner-unlock' : 'winner-shards');
  }
  applyGachaResult(result);
  const skill = SKILLS[result.skillId];
  if (result.type === 'unlock') {
    $('gacha-result').innerHTML = `🎉 <span style="color:var(--neon-yellow)">${skill.name.toUpperCase()}</span> ОТКРЫТ!`;
  } else {
    $('gacha-result').innerHTML = `✦ +${result.shards} шардов · <span style="color:var(--neon-cyan)">${skill.name}</span>`;
  }
  onResult?.(result);
  setTimeout(() => {
    gachaSpinning = false;
    renderHub();
  }, 1500);
}

// ───────── Тап-оверлей ─────────

const TAP_BAR_PX_WIDTH_RATIO = 100 / TAP_BAR.totalWidth;

export function showTapOverlay() {
  $('tap-overlay').classList.add('show');
}
export function hideTapOverlay() {
  $('tap-overlay').classList.remove('show');
  $('tap-feedback').textContent = '';
  $('tap-feedback').className = '';
}

export function renderTapStatic() {
  const s = hubState.session;
  if (!s) return;
  const info = getTrainerInfo(s.stat);
  $('tap-title').textContent = `${info.icon} ${info.name.toUpperCase()}`;
  const z = computeZones(s.stat);
  setZoneStyle('zone-rl', 0, z.yellowLeftStart);
  setZoneStyle('zone-yl', z.yellowLeftStart, z.greenStart);
  setZoneStyle('zone-g',  z.greenStart, z.greenEnd);
  setZoneStyle('zone-yr', z.greenEnd, z.yellowRightEnd);
  setZoneStyle('zone-rr', z.yellowRightEnd, z.total);
  $('tap-tier').textContent = `Тир ${info.tier} — ${info.xpPerTap} XP`;
}

function setZoneStyle(elId, fromUnit, toUnit) {
  const el = $(elId);
  const left = fromUnit * TAP_BAR_PX_WIDTH_RATIO;
  const width = (toUnit - fromUnit) * TAP_BAR_PX_WIDTH_RATIO;
  el.style.left = `${left}%`;
  el.style.width = `${Math.max(0, width)}%`;
}

export function renderTapDynamic() {
  const s = hubState.session;
  if (!s) return;
  const cur = $('tap-cursor');
  cur.style.left = `${(s.cursor / TAP_BAR.totalWidth) * 100}%`;
  $('tap-energy').textContent = `⚡ ${Math.floor(hubState.energy)} / ${ENERGY.maxCap}`;
  const t = hubState.trainers[s.stat];
  const baseTotal = TAP_BAR.baseGreenWidth + TAP_BAR.baseYellowWidth;
  const curTotal = t.greenWidth + t.yellowWidth;
  const fatiguePct = Math.round((1 - curTotal / baseTotal) * 100);
  const fatigueIcon = fatiguePct < 30 ? '💪' : fatiguePct < 70 ? '😤' : '🥵';
  $('tap-counter').textContent = `${fatigueIcon} устал. ${fatiguePct}% · ${s.tapsTotal}т`;
  const xp = getStatXpProgress(s.stat);
  $('tap-xp-text').textContent = `XP ${Math.floor(xp.current)}/${xp.needed}`;
  $('tap-xp-level').textContent = `ур. ${xp.level}`;
  $('tap-xp-fill').style.width = `${(xp.current / xp.needed) * 100}%`;
  renderTapStatic();
}

const ZONE_COLORS = {
  green:  '#5be35b',
  yellow: '#ffd23f',
  red:    '#ff5a5a',
};

export function spawnXpFly(amount, zone = 'green') {
  const overlay = $('tap-overlay');
  const cursor = $('tap-cursor');
  const target = $('tap-xp-bar');
  if (!overlay || !cursor || !target) return;

  const overlayRect = overlay.getBoundingClientRect();
  const fromRect = cursor.getBoundingClientRect();
  const toRect = target.getBoundingClientRect();

  const startX = fromRect.left + fromRect.width / 2 - overlayRect.left;
  const startY = fromRect.top  + fromRect.height / 2 - overlayRect.top;
  const endX   = toRect.left + toRect.width / 2 - overlayRect.left;
  const endY   = toRect.top  + toRect.height / 2 - overlayRect.top;
  const dx = endX - startX;
  const dy = endY - startY;

  const color = ZONE_COLORS[zone] || '#4fd6ff';
  const el = document.createElement('div');
  el.className = 'xp-fly';
  el.textContent = `+${amount} XP`;
  el.style.left = `${startX}px`;
  el.style.top  = `${startY}px`;
  el.style.color = color;
  el.style.textShadow = `0 0 8px ${color}, 0 0 14px ${color}99`;
  el.style.transform = 'translate(-50%, -50%) scale(1)';
  el.style.opacity = '1';
  overlay.appendChild(el);

  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.55)`;
    el.style.opacity = '0.35';
  }));

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    target.classList.remove('pulse');
    void target.offsetWidth;
    target.classList.add('pulse');
    setTimeout(() => target.classList.remove('pulse'), 520);
    if (el.parentNode) el.remove();
  };
  el.addEventListener('transitionend', (ev) => {
    if (ev.propertyName === 'transform') finish();
  });
  setTimeout(finish, 700);
}

export function flashTapFeedback(result) {
  const fb = $('tap-feedback');
  if (result.failed) {
    fb.textContent = '⚡ нет энергии';
    fb.className = 'red';
    return;
  }
  const sym = result.zone === 'green' ? '★' : result.zone === 'yellow' ? '◆' : '✕';
  fb.textContent = `${sym} ${result.zone.toUpperCase()}  +${result.xpGain} XP  −${result.energySpent}⚡${result.leveledUp ? ' · УРОВЕНЬ ВВЕРХ!' : ''}`;
  fb.className = result.zone;
}

export function bindTapButton(onTap) {
  $('tap-btn').addEventListener('click', onTap);
  $('tap-bar').addEventListener('click', onTap);
}

// ───────── Гардероб ─────────

let currentWardrobeSlot = 'fists';

const STAT_DISPLAY = {
  damage:         { name: 'Урон',       fmt: (v) => `+${v}` },
  critChance:     { name: 'Крит-шанс',  fmt: (v) => `+${(v * 100).toFixed(1)}%` },
  critMultiplier: { name: 'Мул.крита',  fmt: (v) => `+${v.toFixed(2)}×` },
  maxHp:          { name: 'Макс HP',    fmt: (v) => `+${v}` },
  defense:        { name: 'Защита',     fmt: (v) => `+${(v * 100).toFixed(1)}%` },
  attackSpeedPct: { name: 'Ск.атаки',   fmt: (v) => `+${(v * 100).toFixed(1)}%` },
  dodgeChance:    { name: 'Уворот',     fmt: (v) => `+${(v * 100).toFixed(1)}%` },
  skillCdrPct:    { name: 'CDR',        fmt: (v) => `+${(v * 100).toFixed(1)}%` },
};

function describeAffix(aff) {
  const meta = STAT_DISPLAY[aff.type];
  if (!meta) return `${aff.type}: +${aff.value}`;
  return `${meta.name}: ${meta.fmt(aff.value)}`;
}

function renderItemCard(item, isEquipped) {
  const r = RARITIES[item.rarity];
  const slot = EQUIPMENT_SLOTS[item.slot];
  const div = document.createElement('div');
  div.className = 'item-card' + (isEquipped ? ' equipped' : '');
  div.dataset.itemId = item.id;
  div.style.borderColor = r.color;
  const primaryDesc = describeAffix(item.primaryAffix);
  const affixesHtml = item.affixes.map(aff =>
    `<div class="affix">• ${describeAffix(aff)}</div>`
  ).join('');
  div.innerHTML = `
    <div class="head">
      <span class="rarity-tag" style="color:${r.color}">${r.name.toUpperCase()}</span>
      ${isEquipped ? '<span class="equip-tag"></span>' : ''}
    </div>
    <div class="primary"><b>${slot.name}</b> · <span class="val">${primaryDesc}</span></div>
    ${affixesHtml}
  `;
  return div;
}

function renderWardrobe() {
  const tabs = $('wardrobe-tabs');
  tabs.innerHTML = '';
  for (const [slotId, slot] of Object.entries(EQUIPMENT_SLOTS)) {
    const tab = document.createElement('div');
    tab.className = 'ward-tab' + (slotId === currentWardrobeSlot ? ' active' : '');
    tab.dataset.slot = slotId;
    tab.title = slot.name;
    tab.textContent = slot.icon;
    if (getEquippedItemForSlot(slotId)) {
      const dot = document.createElement('div');
      dot.className = 'equipped-dot';
      tab.appendChild(dot);
    }
    tab.addEventListener('click', () => {
      currentWardrobeSlot = slotId;
      renderWardrobe();
    });
    tabs.appendChild(tab);
  }

  const slot = EQUIPMENT_SLOTS[currentWardrobeSlot];
  const equipped = getEquippedItemForSlot(currentWardrobeSlot);
  const all = getItemsForSlot(currentWardrobeSlot);

  const eqRoot = $('wardrobe-equipped');
  eqRoot.innerHTML = '';
  const eqTitle = document.createElement('h3');
  eqTitle.textContent = `${slot.icon} ${slot.name.toUpperCase()} · НАДЕТО`;
  eqRoot.appendChild(eqTitle);
  if (!equipped) {
    const empty = document.createElement('div');
    empty.className = 'ward-empty';
    empty.textContent = 'Слот пуст';
    eqRoot.appendChild(empty);
  } else {
    eqRoot.appendChild(renderItemCard(equipped, true));
    const off = document.createElement('button');
    off.className = 'ward-action-btn';
    off.textContent = 'Снять';
    off.addEventListener('click', () => {
      unequipSlot(currentWardrobeSlot);
      renderWardrobe();
    });
    eqRoot.appendChild(off);
  }

  const invRoot = $('wardrobe-inventory');
  invRoot.innerHTML = '';
  const invTitle = document.createElement('h3');
  invTitle.textContent = `В НАЛИЧИИ (${all.length})`;
  invRoot.appendChild(invTitle);
  if (all.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'ward-empty';
    empty.textContent = 'Нет предметов в этом слоте';
    invRoot.appendChild(empty);
    return;
  }
  const rarityOrder = { legendary: 5, epic: 4, rare: 3, good: 2, common: 1 };
  const sorted = all.slice().sort((a, b) => {
    if (equipped && a.id === equipped.id) return -1;
    if (equipped && b.id === equipped.id) return 1;
    return (rarityOrder[b.rarity] || 0) - (rarityOrder[a.rarity] || 0);
  });
  for (const item of sorted) {
    const isEq = equipped && item.id === equipped.id;
    const card = renderItemCard(item, isEq);
    if (!isEq) {
      card.addEventListener('click', () => {
        equipItem(item.id);
        renderWardrobe();
      });
    }
    invRoot.appendChild(card);
  }
}
