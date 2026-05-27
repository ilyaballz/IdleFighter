// UI хаба: карточки тренажёров, лоадаут, гача, гардероб, тап-оверлей, навигация под-экранов.

import { getEffectiveStat, getStatXpProgress } from '../core/stats_layer.js';
import { SKILLS, GACHA } from '../balance/skills.js';
import { STAT_BONUSES } from '../balance/player.js';
import { TAP_BAR, ENERGY, FATIGUE } from '../balance/training.js';
import {
  loadoutState, isUnlocked, setSlot, getSkillLevel,
  getSkillShards, getSkillUpgradeCost, tryUpgradeSkill,
  consumeGachaToken, rollGachaResult, applyGachaResult,
} from '../core/loadout.js';
import {
  hubState, getTrainerInfo, computeZones,
  getEffectiveEnergyMax, getEffectiveEnergyRegenPerSec,
  getHomeBuildingInfo, GOLDEN_ZONE,
} from './state.js';
import { HOME_UPGRADES } from '../balance/home.js';
import { BAR, BAR_OPPONENTS, previewRewardLabel, scratchTargetIcon } from '../balance/bar.js';
import { barState, getNextTicketSec, getCurrentOpponent } from '../core/bar_state.js';
import {
  EQUIPMENT_SLOTS, RARITIES, getPrimaryUpgradeMultiplier,
  LEGENDARY_UNIQUE_AFFIXES,
} from '../balance/equipment.js';
import {
  inventoryState, equipItem, unequipSlot,
  getEquippedItemForSlot, getItemsForSlot,
  getItemUpgradeCost, getItemUpgradeMaxLevel, getItemSalvageValue,
  isItemAtMaxUpgrade,
} from '../core/inventory.js';
import {
  SKILL_ICONS, SKILL_SHORT_NAMES,
  describeSkillChips, describeSkillSynergies, synergyTone, describeL10Perk,
} from '../core/skill_meta.js';
import {
  TRAINER_MILESTONES, reachedMilestones, nextMilestone,
} from '../balance/milestones.js';
import {
  STICKERS, STICKER_SETS, stickerIdsInSet,
} from '../balance/stickers.js';
import {
  isStickerUnlocked, isSetComplete, getUnlockedStickers,
} from '../core/stickers_state.js';
import {
  SHOP_STICKER_SLOT_ID, SHOP_EQUIPMENT_SLOT_ID, SHOP_SHARDS_SLOT_ID,
} from '../balance/shop.js';
import {
  shopState, checkDailyReset, getNextResetSec, getStickerRefreshPrice,
} from '../core/shop_state.js';
import { logEvent } from '../core/logger.js';
import { hideDefeat, hideVictory } from '../battle/ui.js';
import * as ftue from '../core/ftue.js';

const $ = (id) => document.getElementById(id);

// ───────── Метаданные статов ─────────

const STAT_NAMES = {
  strength: 'СИЛА',
  toughness: 'СТОЙКОСТЬ',
  agility: 'ЛОВКОСТЬ',
};

const BONUS_FORMAT = {
  damage:         (v) => `+${v.toFixed(1)} урон`,
  critChance:     (v) => `+${(v * 100).toFixed(1)}% крит`,
  maxHp:          (v) => `+${v.toFixed(1)} HP`,
  defense:        (v) => `+${(v * 100).toFixed(2)}% защ.`,
  hpRegen:        (v) => `+${(v * 100).toFixed(2)}%/с реген`,
  attackSpeedPct: (v) => `+${(v * 100).toFixed(1)}% ск.атаки`,
  skillCdrPct:    (v) => `+${(v * 100).toFixed(1)}% CDR`,
  dodgeChance:    (v) => `+${(v * 100).toFixed(1)}% уворот`,
};

// Показываем эффективные значения с учётом мультипликатора тренажёра.
// При locked-тренажёре (mult=0) показываем «потенциал» как ×1.0.
function describeStatBonusPerLevel(stat, multiplier) {
  const b = STAT_BONUSES[stat];
  const mult = multiplier > 0 ? multiplier : 1;
  return Object.entries(b)
    .map(([k, v]) => BONUS_FORMAT[k] ? BONUS_FORMAT[k](v * mult) : `${k}+${v * mult}`)
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

const HUB_SCREENS = ['home', 'gym', 'arsenal', 'wardrobe', 'house', 'bar', 'stickers', 'shop'];
let currentHubScreen = 'home';

export function showHubScreen(name) {
  if (!HUB_SCREENS.includes(name)) name = 'home';
  // Залоченные здания — клики игнорируются (защита на случай если pointer-events не сработал).
  if (name !== 'home') {
    const card = ftue.buildingCardState(name, hubState.currentLocationIndex);
    if (!card.unlocked) return;
    ftue.recordScreenVisit(name);
  }
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
    case 'arsenal':
      renderLoadoutSlots();
      renderGacha();
      renderSkillDetails();
      break;
    case 'wardrobe':
      renderWardrobe();
      break;
    case 'house':
      renderHouse();
      break;
    case 'bar':
      renderBar();
      break;
    case 'stickers':
      renderStickers();
      break;
    case 'shop':
      renderShop();
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
  const nutsEl = $('hub-nuts');
  if (nutsEl) nutsEl.textContent = `🔩 ${currentNuts()}`;
  const essEl = $('hub-essence');
  if (essEl) essEl.textContent = `🔮 ${currentEssence()}`;
  const cryEl = $('hub-crystals');
  if (cryEl) cryEl.textContent = `💎 ${currentCrystals()}`;
  const eMax = getEffectiveEnergyMax();
  const eCur = Math.floor(hubState.energy);
  $('hub-energy-text').textContent = `⚡ ${eCur} / ${eMax}`;
  $('hub-energy-fill').style.width = `${(hubState.energy / eMax) * 100}%`;
  const regen = getEffectiveEnergyRegenPerSec();
  const sec = regen > 0 ? 1 / regen : 0;
  $('hub-energy-rate').textContent = sec < 60
    ? `+1 / ${Math.round(sec)}с`
    : `+1 / ${Math.round(sec / 60)}мин`;
  refreshCurrentHubScreen();
}

const RARITY_RANK = { common: 1, good: 2, rare: 3, epic: 4, legendary: 5 };

// Сравнение «лучше ли вещь надетой в её слоте». Критерий: сначала редкость,
// при равенстве — эффективное значение primary-аффикса с учётом апгрейда.
// Возвращает false если equipped нет (пустой слот обрабатывается отдельно).
function isItemBetterThanEquipped(item) {
  const equipped = getEquippedItemForSlot(item.slot);
  if (!equipped || equipped.id === item.id) return false;
  const rItem = RARITY_RANK[item.rarity] || 0;
  const rEq   = RARITY_RANK[equipped.rarity] || 0;
  if (rItem !== rEq) return rItem > rEq;
  const itemVal = item.primaryAffix.value * getPrimaryUpgradeMultiplier(item);
  const eqVal   = equipped.primaryAffix.value * getPrimaryUpgradeMultiplier(equipped);
  return itemVal > eqVal;
}

// Есть ли в инвентаре повод заглянуть в гардероб: либо предмет под пустой слот,
// либо предмет «лучше» надетого по правилам isItemBetterThanEquipped.
function hasWardrobeAction() {
  for (const slotId of Object.keys(EQUIPMENT_SLOTS)) {
    const items = getItemsForSlot(slotId);
    if (items.length === 0) continue;
    if (!inventoryState.equipped[slotId]) return true;     // пустой слот, есть кандидат
    for (const it of items) {
      if (isItemBetterThanEquipped(it)) return true;
    }
  }
  return false;
}

function renderBuildings() {
  const grid = $('buildings-grid');
  if (!grid) return;
  const tokens = loadoutState.gachaTokens || 0;
  const loc = hubState.currentLocationIndex;
  // action — есть полезное действие (жёлтый «!» с пульсом).
  // info   — справочная цифра (нейтральный pink-бейдж), показывается только если нет action.
  const unlockedCount = getUnlockedStickers().size;
  const buildings = [
    { id: 'gym',     icon: '🏋️', name: 'КАЧАЛКА',  hint: 'тренажёры и тапы' },
    { id: 'house',   icon: '🏠', name: 'ДОМ',      hint: 'апгрейды энергии' },
    { id: 'bar',     icon: '🍻', name: 'БАР',      hint: barHubHint(),
      action: barState.tickets > 0,                          // есть билет = можно подраться
      info:   null },
    { id: 'arsenal', icon: '⚔️', name: 'АРСЕНАЛ',
      hint: tokens > 0 ? `🎰 ${tokens} жетон.` : 'скиллы / лоадаут',
      action: tokens > 0 },
    { id: 'wardrobe',icon: '👕', name: 'ГАРДЕРОБ',
      hint: `${inventoryState.items.length} предм.`,
      action: hasWardrobeAction() },
    { id: 'stickers', icon: '🏷', name: 'СТИКЕРЫ',
      hint: `${unlockedCount}/25 наклеек` },
    { id: 'shop', icon: '🛒', name: 'МАГАЗИН',
      hint: shopHubHint() },
  ];

  grid.innerHTML = buildings.map(b => {
    const fcard = ftue.buildingCardState(b.id, loc);
    if (!fcard.unlocked) {
      return `
        <div class="building-card locked">
          <div class="icon">${b.icon}</div>
          <div class="name">${b.name}</div>
          <div class="hint lock-hint">${fcard.lockHint}</div>
        </div>
      `;
    }
    // Приоритет: жёлтый «!» (FTUE первый раз ИЛИ доступное действие) → инфо-число → ничего.
    const showAlert = fcard.showFtueBadge || b.action;
    const cornerHtml = showAlert
      ? `<span class="corner-badge ftue-pulse">!</span>`
      : (b.info != null ? `<span class="corner-badge">${b.info}</span>` : '');
    return `
      <div class="building-card" data-screen="${b.id}">
        ${cornerHtml}
        <div class="icon">${b.icon}</div>
        <div class="name">${b.name}</div>
        <div class="hint">${b.hint}</div>
      </div>
    `;
  }).join('');
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

let nutsAccessor = () => 0;
export function bindNutsAccessor(getNutsFn) { nutsAccessor = getNutsFn; }
function currentNuts() { return nutsAccessor(); }

let essenceAccessor = () => 0;
export function bindEssenceAccessor(getEssenceFn) { essenceAccessor = getEssenceFn; }
function currentEssence() { return essenceAccessor(); }

let crystalsAccessor = () => 0;
export function bindCrystalsAccessor(getCrystalsFn) { crystalsAccessor = getCrystalsFn; }
function currentCrystals() { return crystalsAccessor(); }

// ───────── Тренажёры ─────────

// HTML-блок с прогрессом per-trainer milestones: бейджи разлоченных эффектов
// + полоска прогресса к следующему milestone'у. Если ничего ещё не разлочено и
// есть next — показываем только полоску. Если всё разлочено — показываем «макс».
function renderMilestoneBlock(taps) {
  const reached = reachedMilestones(taps);
  const next = nextMilestone(taps);
  const badges = reached.map(m =>
    `<span class="milestone-badge" title="${m.desc}">${m.icon} ${m.label}</span>`
  ).join('');
  let row;
  if (next) {
    const prevTaps = reached.length > 0 ? reached[reached.length - 1].taps : 0;
    const span = next.taps - prevTaps;
    const into = taps - prevTaps;
    const pct = Math.max(0, Math.min(100, (into / span) * 100));
    row = `
      <div class="milestone-row">
        <span class="label">${taps} / ${next.taps}</span>
        <div class="bar"><div class="fill" style="width:${pct}%"></div></div>
        <span class="next-icon" title="${next.desc}">${next.icon}</span>
      </div>`;
  } else {
    row = `<div class="milestone-row maxed"><span class="label">★ все milestones получены</span></div>`;
  }
  const badgesHtml = badges ? `<div class="milestone-badges">${badges}</div>` : '';
  return row + badgesHtml;
}

function renderTrainers() {
  const root = $('trainers-list');
  root.innerHTML = '';
  for (const stat of ['strength', 'toughness', 'agility']) {
    const info = getTrainerInfo(stat);
    const xp = getStatXpProgress(stat);
    const card = document.createElement('div');
    card.className = 'trainer-card';
    const cost = info.nextTierCost;
    const canTrain = !info.isLocked && !info.atCap && hubState.energy >= ENERGY.trainerEntryCost;
    const canUpgrade = !info.isMaxTier && info.canUpgradeTier && currentCoins() >= cost;
    const upgradeLabel = info.isMaxTier
      ? 'МАКС ТИР'
      : info.isLocked
        ? `КУПИТЬ (${cost}💰)`
        : !info.canUpgradeTier
          ? `🔒 нужен L${info.upgradeRequiresLevel}`
          : `Тир ${info.tier + 1} ×${info.nextTierMultiplier.toFixed(1)} cap L${info.nextTierCap} (${cost}💰)`;
    const tierLabel = info.isLocked
      ? 'не куплен'
      : `Тир ${info.tier} · ×${info.statMultiplier.toFixed(2)} эфф. · ${info.xpPerTap} XP/тап`;
    const trainLabel = info.isLocked
      ? '🔒 ЗАКРЫТ'
      : info.atCap
        ? `🔒 CAP L${info.levelCap} — апгрейдь`
        : `ТРЕНИРОВАТЬСЯ${ENERGY.trainerEntryCost > 0 ? ` (${ENERGY.trainerEntryCost}⚡)` : ''}`;
    const levelDisplay = info.isLocked
      ? `ур. ${xp.level}`
      : `ур. ${xp.level} / ${info.levelCap}`;
    // XP-бар: при cap'е показываем как полный (визуально замороженный).
    const xpFillPct = info.atCap ? 100 : (xp.current / xp.needed) * 100;
    const xpText = info.atCap ? `CAP достигнут` : `XP ${Math.floor(xp.current)}/${xp.needed}`;
    // Подсветка кнопки апгрейда — пульсирует всегда когда доступен апгрейд И хватает монет.
    // Раньше тут был one-shot FTUE-пульс на «первый T1», теперь это persistent action-indicator.
    const upgradePulse = canUpgrade ? ' ftue-pulse-btn' : '';
    const milestoneHtml = renderMilestoneBlock(info.lifetimeTaps);
    card.innerHTML = `
      <div class="head">
        <div>
          <span class="icon">${info.icon}</span> ${info.name.toUpperCase()}
          <span class="stat-name"> · ${STAT_NAMES[stat]}</span>
        </div>
        <div class="level">${levelDisplay}</div>
      </div>
      <div class="bonus-desc">${describeStatBonusPerLevel(stat, info.statMultiplier)} / ур.</div>
      <div class="xp-bar"><div class="xp-fill" style="width:${xpFillPct}%"></div></div>
      <div class="meta">
        <span>${xpText}</span>
        <span>${tierLabel}</span>
      </div>
      ${milestoneHtml}
      <div class="actions">
        <button class="upgrade${upgradePulse}" ${canUpgrade ? '' : 'disabled'}>${upgradeLabel}</button>
        <button class="primary train" ${canTrain ? '' : 'disabled'}>${trainLabel}</button>
      </div>
    `;
    card.querySelector('.upgrade').addEventListener('click', () => onTrainerUpgrade(stat));
    card.querySelector('.train').addEventListener('click', () => onTrainerStart(stat));
    root.appendChild(card);
  }
}

let onTrainerUpgrade = () => {};
let onTrainerStart  = () => {};
let onHomeUpgrade   = () => {};
let onBarFight      = () => {};
let onItemUpgrade   = () => false;
let onItemSalvage   = () => false;
let onShopBuy             = () => false;
let onShopRefreshSticker  = () => false;
export function bindHubActions(handlers) {
  if (handlers.onTrainerUpgrade) onTrainerUpgrade = handlers.onTrainerUpgrade;
  if (handlers.onTrainerStart)   onTrainerStart   = handlers.onTrainerStart;
  if (handlers.onHomeUpgrade)    onHomeUpgrade    = handlers.onHomeUpgrade;
  if (handlers.onBarFight)       onBarFight       = handlers.onBarFight;
  if (handlers.onItemUpgrade)    onItemUpgrade    = handlers.onItemUpgrade;
  if (handlers.onItemSalvage)    onItemSalvage    = handlers.onItemSalvage;
  if (handlers.onShopBuy)            onShopBuy            = handlers.onShopBuy;
  if (handlers.onShopRefreshSticker) onShopRefreshSticker = handlers.onShopRefreshSticker;
}

// ───────── Дом (апгрейды) ─────────

function formatHomeValue(buildingId, value, tier) {
  if (buildingId === 'couch') {
    // Показываем не множитель, а сколько секунд до полной батарейки.
    // База: 1/6 ⚡/с при value=1 → 600c. value 2.5 → 240c.
    const baseRecover = 1 / 6;
    const cap = getEffectiveEnergyMax();
    const sec = cap / (baseRecover * value);
    return `${value}× (${Math.round(sec / 60)}мин до full)`;
  }
  if (buildingId === 'shower') return `${value}× (${Math.round(value * FATIGUE.recoverPerHour)}/час)`;
  if (buildingId === 'trailer') return `${value}⚡`;
  if (buildingId === 'coffee') {
    const ttlBonus = HOME_UPGRADES.coffee.tiers[Math.max(0, (tier || 1) - 1)].ttlBonus || 0;
    const ttlStr = ttlBonus > 0 ? `, +${ttlBonus.toFixed(1)}с TTL` : '';
    return `×${value.toFixed(1)} шанс${ttlStr}`;
  }
  return String(value);
}

// ───────── Бар ─────────

function formatTicketCountdown(sec) {
  if (sec == null) return 'все билеты собраны';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  if (m >= 1) return `следующий через ${m}мин ${s}с`;
  return `следующий через ${s}с`;
}

function barHubHint() {
  return `${barState.tickets}/${BAR.maxTickets} билет.`;
}

function renderBar() {
  const root = $('bar-info');
  if (!root) return;
  const ticketsHtml = [];
  for (let i = 0; i < BAR.maxTickets; i++) {
    const have = i < barState.tickets;
    ticketsHtml.push(`<span class="ticket-icon${have ? '' : ' spent'}">🎟️</span>`);
  }
  const canFight = barState.tickets > 0;
  const next = formatTicketCountdown(getNextTicketSec());
  const opponent = getCurrentOpponent();
  const nextIdx = (barState.currentOpponentIdx + 1) % BAR_OPPONENTS.length;
  const nextOpponent = BAR_OPPONENTS[nextIdx];
  const barLevel = barState.medals + 1;
  // Точки прогресса побед X/3 (на текущем противнике)
  const progDots = [];
  for (let i = 0; i < BAR.winsPerOpponent; i++) {
    progDots.push(`<span class="bar-win-dot${i < barState.winsOnCurrent ? ' on' : ''}"></span>`);
  }
  // Особенности противника (короткими бэйджами)
  const traitTags = [];
  if (opponent.critChance)  traitTags.push(`✨ ${Math.round(opponent.critChance * 100)}% крит`);
  if (opponent.dodgeChance) traitTags.push(`💨 ${Math.round(opponent.dodgeChance * 100)}% уворот`);
  if (opponent.enrageAt)    traitTags.push(`💢 ярость <${Math.round(opponent.enrageAt * 100)}% HP`);
  const traitsHtml = traitTags.length
    ? `<div class="bar-opp-traits">${traitTags.map(t => `<span class="bar-trait">${t}</span>`).join('')}</div>`
    : `<div class="bar-opp-traits empty">— без особенностей</div>`;
  root.innerHTML = `
    <div class="bar-opp-card">
      <div class="bar-opp-head">
        <span class="bar-opp-icon">${opponent.icon}</span>
        <div class="bar-opp-id">
          <div class="bar-opp-name">${opponent.name}</div>
          <div class="bar-opp-lvl">ур. ${barLevel}</div>
        </div>
        <div class="bar-opp-progress">
          <div class="bar-opp-progress-label">ПОБЕДЫ</div>
          <div class="bar-opp-progress-dots">${progDots.join('')}</div>
        </div>
      </div>
      <div class="bar-opp-stats">
        <span class="bar-stat"><span class="ic">❤</span> ×${opponent.hpMult.toFixed(1)} HP</span>
        <span class="bar-stat"><span class="ic">⚔</span> ×${opponent.dmgMult.toFixed(1)} УРОН</span>
      </div>
      ${traitsHtml}
      <div class="bar-opp-reward">
        <span class="lbl">НАГРАДА:</span>
        <span class="val">${previewRewardLabel(opponent)}</span>
      </div>
    </div>
    <div class="row">
      <span class="lbl">Билеты:</span>
      <div class="tickets-display">${ticketsHtml.join('')}</div>
    </div>
    <div class="row">
      <span class="lbl">Регенерация:</span>
      <span class="next-ticket-text">${next}</span>
    </div>
    <button class="fight-btn${canFight && ftue.pulseIfPending('barFight') ? ' ftue-pulse-btn' : ''}" id="bar-fight-btn" ${canFight ? '' : 'disabled'}>
      ⚔️ В РИНГ (1 🎟️)
    </button>
    <div class="bar-next-teaser">След.: ${nextOpponent.icon} ${nextOpponent.name}</div>
  `;
  $('bar-fight-btn').addEventListener('click', () => onBarFight());
}

// ───────── Скретч-карта ─────────
// Показ оверлея после победы в баре. Раскрывает 3 ячейки (target-icon / X), на «ЗАБРАТЬ» вызывает onClaim.
// Размер награды задан тиром (заранее), а игрок раскрытием просто видит исход.

const MISS_SYMBOL = '✖';

export function showScratchCard({ opponent, tier, reward, bonusStickerId, onClaim }) {
  const overlay = $('scratch-overlay');
  if (!overlay) return;
  const targetIcon = scratchTargetIcon(opponent);
  // Раскладка 3 ячеек: ровно `tier` target'ов, остальное — X. Перемешать.
  const cells = [];
  for (let i = 0; i < 3; i++) cells.push(i < tier ? targetIcon : MISS_SYMBOL);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  const cellsHtml = cells.map((sym, idx) => {
    const isMiss = sym === MISS_SYMBOL;
    return `<div class="scratch-cell${isMiss ? ' miss' : ''}" data-idx="${idx}">
      <div class="cover"></div>
      <div class="sym">${sym}</div>
    </div>`;
  }).join('');
  const tierLabel = tier === 3 ? 'ДЖЕКПОТ ×3' : tier === 2 ? '×2 СОВПАДЕНИЯ' : '×1';
  const bonusStickerHtml = bonusStickerId
    ? `<div class="scratch-bonus-sticker">+ 📼 ${STICKERS[bonusStickerId]?.icon || ''} ${STICKERS[bonusStickerId]?.name || ''}</div>`
    : '';
  overlay.innerHTML = `
    <div class="scratch-panel">
      <div class="scratch-head">
        <div class="scratch-title">СКРЕТЧ-КАРТА</div>
        <div class="scratch-from">от ${opponent.icon} ${opponent.name}</div>
      </div>
      <div class="scratch-cells">${cellsHtml}</div>
      <button class="scratch-reveal-all" id="scratch-reveal-all">ОТКРЫТЬ ВСЁ</button>
      <div class="scratch-reward hidden" id="scratch-reward-block">
        <div class="scratch-tier" id="scratch-tier-line">${tierLabel}</div>
        <div class="scratch-reward-label" id="scratch-reward-label">${reward.label}</div>
        ${bonusStickerHtml}
      </div>
      <button class="scratch-claim" id="scratch-claim" disabled>ЗАБРАТЬ</button>
    </div>
  `;
  overlay.classList.add('show');

  let revealedCount = 0;
  const claimBtn = $('scratch-claim');
  const rewardBlock = $('scratch-reward-block');
  const finalize = () => {
    if (revealedCount < 3) return;
    rewardBlock.classList.remove('hidden');
    claimBtn.disabled = false;
  };
  const revealCell = (cellEl) => {
    if (cellEl.classList.contains('revealed')) return;
    cellEl.classList.add('revealed');
    revealedCount++;
    finalize();
  };
  overlay.querySelectorAll('.scratch-cell').forEach(el => {
    el.addEventListener('click', () => revealCell(el));
  });
  $('scratch-reveal-all').addEventListener('click', () => {
    overlay.querySelectorAll('.scratch-cell').forEach(revealCell);
  });
  claimBtn.addEventListener('click', () => {
    overlay.classList.remove('show');
    overlay.innerHTML = '';
    onClaim?.();
  });
}

// ───────── Стикеры ─────────

// Мета бонусов стикеров — иконка + короткий лейбл + формат значения.
// Используется тем же паттерном, что affixPillHtml для шмота — единый визуальный язык.
const STICKER_BONUS_DISPLAY = {
  damagePct:          { icon: '⚔',  label: 'УРОН',     fmt: (v) => `+${Math.round(v * 100)}%` },
  critChance:         { icon: '✨', label: 'КРИТ',     fmt: (v) => `+${Math.round(v * 100)}%` },
  critMultiplier:     { icon: '💥', label: 'УР.КРИТА', fmt: (v) => `+${Math.round(v * 100)}%` },
  maxHp:              { icon: '❤',  label: 'HP',       fmt: (v) => `+${v}` },
  attackSpeedPct:     { icon: '⚡', label: 'СК.АТК',   fmt: (v) => `+${Math.round(v * 100)}%` },
  dodgeChance:        { icon: '💨', label: 'УВОРОТ',   fmt: (v) => `+${Math.round(v * 100)}%` },
  moveSpeedPct:       { icon: '👟', label: 'СКОРОСТЬ', fmt: (v) => `+${Math.round(v * 100)}%` },
  hpRegenInBattlePct: { icon: '🩹', label: 'HP-РЕГ',   fmt: (v) => `+${Math.round(v * 100)}%` },
  coinPct:            { icon: '💰', label: 'МОНЕТЫ',   fmt: (v) => `+${Math.round(v * 100)}%` },
  xpPct:              { icon: '⭐', label: 'XP',        fmt: (v) => `+${Math.round(v * 100)}%` },
  energyRegenPct:     { icon: '🔋', label: 'ЭНЕРГИЯ',  fmt: (v) => `+${Math.round(v * 100)}%` },
  statLevelOffset:    { icon: '📈', label: 'УР.СТАТОВ', fmt: (v) => `+${v}` },
};

function stickerBonusPillHtml(type, value) {
  const meta = STICKER_BONUS_DISPLAY[type];
  const icon = meta?.icon || '?';
  const label = meta?.label || type.toUpperCase();
  const val = meta ? meta.fmt(value) : `+${value}`;
  return `<span class="affix-pill"><span class="pill-icon">${icon}</span>${val}<span class="pill-label">${label}</span></span>`;
}

function stickerBonusesPillsHtml(bonuses) {
  return Object.entries(bonuses).map(([k, v]) => stickerBonusPillHtml(k, v)).join('');
}

function renderStickers() {
  const grid = $('stickers-grid');
  const totalEl = $('stickers-total');
  if (!grid) return;

  const unlocked = getUnlockedStickers();
  if (totalEl) {
    totalEl.textContent = `${unlocked.size} / 25 НАКЛЕЕК`;
  }

  const rowsHtml = Object.entries(STICKER_SETS).map(([setId, setDef]) => {
    const ids = stickerIdsInSet(setId);
    const have = ids.filter(id => unlocked.has(id)).length;
    const complete = isSetComplete(setId);
    const setBonusPills = stickerBonusesPillsHtml(setDef.setBonus);
    const cellsHtml = ids.map(id => {
      const s = STICKERS[id];
      const isOn = isStickerUnlocked(id);
      const bonusHtml = isOn
        ? `<div class="affix-line">${stickerBonusesPillsHtml(s.bonuses)}</div>`
        : `<div class="sticker-locked-bonus">???</div>`;
      return `
        <div class="sticker-card${isOn ? ' unlocked' : ''}">
          <div class="sticker-card-head">
            <span class="ic">${s.icon}</span>
            <span class="nm">${isOn ? s.name : '???'}</span>
          </div>
          ${bonusHtml}
        </div>`;
    }).join('');
    return `
      <div class="sticker-set${complete ? ' complete' : ''}">
        <div class="sticker-set-head">
          <span class="icon">${setDef.icon}</span>
          <span class="name">${setDef.name}</span>
          <span class="progress">${have}/${ids.length}</span>
        </div>
        <div class="sticker-set-bonus">
          <span class="set-bonus-label">СЕТ-БОНУС${complete ? ' ✓' : ''}</span>
          <span class="affix-line">${setBonusPills}</span>
        </div>
        <div class="sticker-source">Источник: ${setDef.desc}</div>
        <div class="sticker-row">${cellsHtml}</div>
      </div>`;
  }).join('');

  grid.innerHTML = rowsHtml;
}

let stickerToastTimer = null;
export function showStickerToast(stickerId) {
  const el = $('sticker-toast');
  if (!el) return;
  const s = STICKERS[stickerId];
  if (!s) return;
  el.innerHTML = `
    <span class="icon">${s.icon}</span>
    <span class="label">НОВАЯ НАКЛЕЙКА</span>
    <div class="name">${s.name}</div>
    <div class="bonus affix-line">${stickerBonusesPillsHtml(s.bonuses)}</div>
  `;
  if (stickerToastTimer) clearTimeout(stickerToastTimer);
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  stickerToastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

// ───────── Магазин ─────────

function formatResetCountdown(sec) {
  if (sec == null) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}ч ${m}м`;
  if (m > 0) return `${m}м`;
  return `${sec}с`;
}

function shopHubHint() {
  if (shopState.slots.length === 0) return 'новые товары';
  const left = shopState.slots.filter(s => s.itemId != null).length;
  return left > 0 ? `${left} тов.` : `обнов ${formatResetCountdown(getNextResetSec())}`;
}

// Метаданные фикс-слотов для UI (иконка + label-формат от qty).
const FIXED_SLOT_META = {
  energy:  { icon: '⚡',  label: (qty) => `+${qty}⚡` },
  steroid: { icon: '💊', label: (qty) => `−${qty} усталости` },
  nuts:    { icon: '🔩', label: (qty) => `+${qty}🔩` },
};

// Сколько у игрока сейчас выбранной валюты — для disabled-проверки кнопки.
function walletBalance(currency) {
  return currency === 'crystals' ? currentCrystals() : currentCoins();
}

// Иконка валюты в кнопке цены.
function currencyIcon(currency) {
  return currency === 'crystals' ? '💎' : '💰';
}

function shopSlotEmptyHtml(idx, resetText) {
  // Только ротационные слоты [3..5] могут стать sold-out. Фикс не уходят в empty.
  const icons = { 3: '✦', 4: '🏷', 5: '🎁' };
  const labels = {
    3: 'скилл недоступен',  // если loadout пустой
    4: 'нет доступных',     // коллекция стикеров полная
    5: 'продано',
  };
  return `
    <div class="shop-slot empty">
      <div class="shop-slot-icon">${icons[idx] || '✓'}</div>
      <div class="shop-slot-label">${labels[idx] || 'продано'}</div>
      <div class="shop-slot-sub">обнов через ${resetText}</div>
    </div>`;
}

// Универсальная HTML-строка для кнопки покупки. Учитывает валюту слота (💰/💎).
function buyBtnHtml(slot, idx) {
  const cur = slot.currency || 'coins';
  const canBuy = walletBalance(cur) >= slot.price;
  const cls = cur === 'crystals' ? 'shop-buy-btn crystal' : 'shop-buy-btn';
  return `
    <button class="${cls}" data-slot="${idx}" ${canBuy ? '' : 'disabled'}>
      КУПИТЬ <span class="cost">${slot.price}${currencyIcon(cur)}</span>
    </button>`;
}

function shopSlotShardsHtml(slot, idx) {
  const skill = SKILLS[slot.skillId];
  const skillIcon = SKILL_ICONS[slot.skillId] || '✦';
  const skillName = skill?.name || slot.skillId;
  return `
    <div class="shop-slot rotation">
      <div class="shop-slot-icon">${skillIcon}</div>
      <div class="shop-slot-label">+${slot.qty}✦ шардов</div>
      <div class="shop-slot-sub">${skillName}</div>
      <div class="shop-slot-actions">${buyBtnHtml(slot, idx)}</div>
    </div>`;
}

function shopSlotStickerHtml(slot, idx) {
  const s = STICKERS[slot.stickerId];
  const refreshCost = getStickerRefreshPrice();
  const canRefresh = currentCoins() >= refreshCost;
  return `
    <div class="shop-slot rotation">
      <div class="shop-slot-icon">${s?.icon || '🏷'}</div>
      <div class="shop-slot-label">Стикер</div>
      <div class="shop-slot-sub">${s?.name || '???'}</div>
      <div class="shop-slot-actions">
        ${buyBtnHtml(slot, idx)}
        <button class="shop-refresh-btn" ${canRefresh ? '' : 'disabled'} title="Сменить стикер">
          🔄 <span class="cost">${refreshCost}💰</span>
        </button>
      </div>
    </div>`;
}

function shopSlotEquipmentHtml(slot, idx) {
  const item = slot.item;
  if (!item) return shopSlotEmptyHtml(idx, '—');
  const r = RARITIES[item.rarity];
  const slotDef = EQUIPMENT_SLOTS[item.slot];
  const borderColor = r?.color || '#888';
  const affixCount = (item.affixes?.length || 0) + 1;
  return `
    <div class="shop-slot rotation equipment-slot" style="border-color:${borderColor}">
      <div class="shop-slot-icon">${slotDef?.icon || '🎁'}</div>
      <div class="shop-slot-label" style="color:${borderColor}">${(r?.name || item.rarity).toUpperCase()}</div>
      <div class="shop-slot-sub">${slotDef?.name || item.slot} · ${affixCount} аффикса</div>
      <div class="shop-slot-primary">${primaryStatHtml(item.primaryAffix, item)}</div>
      <div class="shop-slot-actions">${buyBtnHtml(slot, idx)}</div>
    </div>`;
}

function shopSlotFixedHtml(slot, idx) {
  const meta = FIXED_SLOT_META[slot.itemId];
  if (!meta) return '';
  const isCrystal = slot.currency === 'crystals';
  return `
    <div class="shop-slot fixed${isCrystal ? ' crystal-slot' : ''}">
      <div class="shop-slot-icon">${meta.icon}</div>
      <div class="shop-slot-label">${meta.label(slot.qty)}</div>
      <div class="shop-slot-actions">${buyBtnHtml(slot, idx)}</div>
    </div>`;
}

function renderShop() {
  const root = $('shop-content');
  if (!root) return;
  // На каждый рендер проверяем — не прошли ли 24ч → авто-обновление ротации.
  checkDailyReset();

  const resetText = formatResetCountdown(getNextResetSec());

  const slotsHtml = shopState.slots.map((slot, idx) => {
    if (!slot || !slot.itemId) return shopSlotEmptyHtml(idx, resetText);
    if (slot.itemId === SHOP_SHARDS_SLOT_ID)    return shopSlotShardsHtml(slot, idx);
    if (slot.itemId === SHOP_STICKER_SLOT_ID)   return shopSlotStickerHtml(slot, idx);
    if (slot.itemId === SHOP_EQUIPMENT_SLOT_ID) return shopSlotEquipmentHtml(slot, idx);
    return shopSlotFixedHtml(slot, idx);
  }).join('');

  root.innerHTML = `
    <div class="shop-header">
      <span class="shop-reset">Ротация через: <b>${resetText}</b></span>
    </div>
    <div class="shop-grid">
      ${slotsHtml}
    </div>
  `;

  root.querySelectorAll('.shop-buy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.slot, 10);
      if (!Number.isNaN(idx)) onShopBuy(idx);
    });
  });
  const refreshBtn = root.querySelector('.shop-refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => onShopRefreshSticker());
  }
}

function renderHouse() {
  const root = $('house-list');
  if (!root) return;
  root.innerHTML = '';
  const homeFtuePulse = ftue.pulseIfPending('homeUpgrade');
  for (const buildingId of Object.keys(HOME_UPGRADES)) {
    const info = getHomeBuildingInfo(buildingId);
    const card = document.createElement('div');
    card.className = 'trainer-card';
    // Залоченные постройки — серая карточка с подсказкой «Доступно с L_N». Показываем чтобы
    // игрок видел впереди что разлочится, и понимал drip-расписание дома.
    if (!info.isUnlocked) {
      card.classList.add('locked');
      card.innerHTML = `
        <div class="head">
          <div><span class="icon">${info.icon}</span> ${info.name.toUpperCase()}</div>
          <div class="level lock-hint">🔒 ${info.unlockHint || ''}</div>
        </div>
        <div class="bonus-desc">${info.desc}</div>
      `;
      root.appendChild(card);
      continue;
    }
    const canUpgrade = !info.isMaxTier && currentNuts() >= info.nextNutCost;
    const showPulse = canUpgrade && homeFtuePulse;
    const curStr = formatHomeValue(buildingId, info.currentValue, info.tier);
    const nextStr = info.nextValue != null ? formatHomeValue(buildingId, info.nextValue, info.tier + 1) : '—';
    card.innerHTML = `
      <div class="head">
        <div>
          <span class="icon">${info.icon}</span> ${info.name.toUpperCase()}
        </div>
        <div class="level">тир ${info.tier}/${info.maxTier}</div>
      </div>
      <div class="bonus-desc">${info.desc}</div>
      <div class="meta">
        <span>сейчас: <span style="color:var(--neon-cyan)">${curStr}</span></span>
        ${info.isMaxTier ? '' : `<span>далее: <span style="color:var(--neon-yellow)">${nextStr}</span></span>`}
      </div>
      <div class="actions">
        <button class="upgrade primary${showPulse ? ' ftue-pulse-btn' : ''}" ${canUpgrade ? '' : 'disabled'}>${
          info.isMaxTier ? 'МАКС ТИР' : `Прокачать (${info.nextNutCost}🔩)`
        }</button>
      </div>
    `;
    if (!info.isMaxTier) {
      card.querySelector('.upgrade').addEventListener('click', () => onHomeUpgrade(buildingId));
    }
    root.appendChild(card);
  }
}

// ───────── Лоадаут / Арсенал ─────────

function renderLoadoutSlots() {
  const filled = loadoutState.selected.filter(s => s).length;
  const slotCounter = $('loadout-slot-counter');
  if (slotCounter) slotCounter.textContent = `${filled}/${loadoutState.selected.length}`;
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
        selectedSkillId = id;
      } else {
        activeSlotIdx = (activeSlotIdx === i) ? null : i;
      }
      renderLoadoutSlots();
      rebuildGachaStrip();
      renderSkillDetails();
    });
    root.appendChild(div);
  }
}

let selectedSkillId = null;

function ensureSelected() {
  if (selectedSkillId && SKILLS[selectedSkillId]) return;
  for (const s of loadoutState.selected) if (s) { selectedSkillId = s; return; }
  for (const id of Object.keys(SKILLS)) {
    if (loadoutState.unlocked.includes(id)) { selectedSkillId = id; return; }
  }
  selectedSkillId = Object.keys(SKILLS)[0];
}

function onGachaIconClick(id) {
  selectedSkillId = id;
  rebuildGachaStrip();
  renderSkillDetails();
}

function toggleEquipSelected() {
  const id = selectedSkillId;
  if (!id || !isUnlocked(id)) return;
  const equipped = loadoutState.selected.includes(id);
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
  rebuildGachaStrip();
  renderSkillDetails();
}

function renderSkillDetails() {
  const root = $('skill-details');
  if (!root) return;
  ensureSelected();
  const id = selectedSkillId;
  const def = SKILLS[id];
  const locked = !isUnlocked(id);
  const equipped = loadoutState.selected.includes(id);
  const lvl = getSkillLevel(id);
  const shards = getSkillShards(id);
  const upCost = getSkillUpgradeCost(id);

  const chips = describeSkillChips(id);
  const synergies = describeSkillSynergies(id);

  const chipsHtml = chips.map(c => `
    <div class="stat-chip">
      <div class="ic">${c.icon}</div>
      <div class="val">${c.value}</div>
      <div class="lbl">${c.label}</div>
    </div>
  `).join('');

  const pillsHtml = synergies.map(text => `
    <div class="synergy-pill ${synergyTone(text)}">${text}</div>
  `).join('');

  // L10-перк: рендерим всегда — закрытый («Откроется на ур.10») или открытый (золотой ★).
  // Визуальная подсказка стимулирует докачивать скилл до max.
  const l10 = describeL10Perk(id);
  const l10Html = l10
    ? `<div class="l10-perk ${l10.unlocked ? 'unlocked' : 'locked'}">
         <span class="l10-badge">★ L10</span>
         <span class="l10-text">${l10.text}</span>
       </div>`
    : '';

  root.className = 'skill-card' + (equipped ? ' equipped' : '') + (locked ? ' locked' : '');
  root.style.cursor = 'default';
  root.innerHTML = `
    <div class="title-row">
      <div class="title">
        ${SKILL_ICONS[id] || ''} ${def.name}
        ${equipped ? '<span class="equipped-badge">· ✓ В ЛОАДАУТЕ</span>' : ''}
      </div>
      <div class="level-badge">ур.${lvl}${locked ? ' · 🔒' : ''}</div>
    </div>
    ${chips.length > 0 ? `<div class="stat-chips">${chipsHtml}</div>` : ''}
    ${synergies.length > 0 ? `<div class="synergy-pills">${pillsHtml}</div>` : ''}
    ${l10Html}
    ${locked
      ? `<div class="locked-note">Выпадает из гачи — крути жетоны, чтобы открыть.</div>`
      : `
        <div class="shards-info">${upCost == null ? 'MAX уровень' : `шарды: ${shards} / ${upCost}`}</div>
        <div class="skill-actions">
          <button class="equip-btn${equipped ? ' unequip' : ''}">${equipped ? 'СНЯТЬ' : 'ЭКВИП'}</button>
          <button class="upgrade-btn" ${upCost != null && shards >= upCost ? '' : 'disabled'}>${upCost == null ? 'MAX' : '+1 ур.'}</button>
        </div>
      `}
  `;
  const upBtn = root.querySelector('.upgrade-btn');
  if (upBtn) {
    upBtn.addEventListener('click', () => {
      if (tryUpgradeSkill(id)) {
        logEvent(`${def.name}: ур. ${getSkillLevel(id)}`, 'kill');
        renderSkillDetails();
        rebuildGachaStrip();   // обновить бейджи can-upgrade (шарды уменьшились, бейдж может пропасть)
        // FX: punch на level-badge + расходящийся ring по карточке. Класс снимается, чтобы
        // повторный апгрейд снова запустил анимацию (без force-reflow браузер не перезапустит).
        const card = $('skill-details');
        if (card) {
          card.classList.remove('levelup-fx');
          void card.offsetWidth;
          card.classList.add('levelup-fx');
          setTimeout(() => card.classList.remove('levelup-fx'), 600);
        }
      }
    });
  }
  const eqBtn = root.querySelector('.equip-btn');
  if (eqBtn) {
    eqBtn.addEventListener('click', toggleEquipSelected);
  }
}

// ───────── Гача ─────────

let gachaSpinning = false;
const ALL_SKILL_IDS = Object.keys(SKILLS);

function renderGacha() {
  const tokens = loadoutState.gachaTokens || 0;
  $('gacha-tokens').textContent = tokens;
  const filled = loadoutState.selected.filter(s => s).length;
  const slotCounter = $('loadout-slot-counter');
  if (slotCounter) slotCounter.textContent = `${filled}/${loadoutState.selected.length}`;
  const spinBtn = $('gacha-spin');
  spinBtn.disabled = gachaSpinning || tokens === 0;
  // FTUE: пульс на «КРУТИТЬ» если есть жетон и игрок ещё ни разу не крутил.
  const ftuePulse = tokens > 0 && !gachaSpinning && ftue.pulseIfPending('gachaSpin');
  spinBtn.classList.toggle('ftue-pulse-btn', ftuePulse);
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
    const isEquipped = loadoutState.selected.includes(id);
    const isSelected = id === selectedSkillId;
    const upCost = isLocked ? null : getSkillUpgradeCost(id);
    const canUpgrade = upCost != null && getSkillShards(id) >= upCost;
    div.className = 'gacha-icon ' + (isLocked ? 'locked' : 'unlocked')
      + (isEquipped ? ' equipped' : '')
      + (isSelected ? ' selected' : '');
    div.dataset.skillId = id;
    div.style.position = 'relative';
    div.innerHTML = `
      <div class="icon">${SKILL_ICONS[id] || '?'}</div>
      <div class="name">${SKILL_SHORT_NAMES[id] || SKILLS[id].name}</div>
      ${isLocked ? '<span class="lock">🔒</span>' : ''}
      ${canUpgrade ? '<span class="upgrade-ready" title="Хватает шардов на прокачку">⬆</span>' : ''}
    `;
    div.title = isLocked
      ? `${SKILLS[id].name} (закрыт)`
      : isEquipped
        ? `${SKILLS[id].name} (в лоадауте)`
        : SKILLS[id].name;
    div.addEventListener('click', () => onGachaIconClick(id));
    strip.appendChild(div);
  }
}

export function startGachaSpin(onResult) {
  if (gachaSpinning) return false;
  if ((loadoutState.gachaTokens || 0) <= 0) return false;

  gachaSpinning = true;
  consumeGachaToken();
  ftue.recordAction('gachaSpin');
  $('gacha-tokens').textContent = loadoutState.gachaTokens;
  $('gacha-result').textContent = '';
  $('gacha-spin').disabled = true;
  $('gacha-spin').classList.remove('ftue-pulse-btn');

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
  selectedSkillId = result.skillId;
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
  // Слои: красная всегда на всю ширину, жёлтая центрирована, зелёная центрирована (поверх).
  setZoneStyle('zone-r', 0, z.total);
  setZoneStyle('zone-y', z.yellowStart, z.yellowEnd);
  setZoneStyle('zone-g', z.greenStart,  z.greenEnd);
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
  $('tap-energy').textContent = `⚡ ${Math.floor(hubState.energy)} / ${getEffectiveEnergyMax()}`;
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
  // Milestone-счётчик: показывает прогресс этого тренажёра к следующей разлочке.
  const mEl = $('tap-milestone');
  if (mEl) {
    const next = nextMilestone(t.lifetimeTaps);
    mEl.textContent = next
      ? `${next.icon} ${t.lifetimeTaps}/${next.taps}`
      : '★ макс';
  }
  renderTapStatic();
  renderGoldenZone(s);
}

function renderGoldenZone(s) {
  const el = $('zone-gold');
  if (!el) return;
  if (!s.goldenZone) {
    el.style.display = 'none';
    el.classList.remove('ending');
    return;
  }
  const g = s.goldenZone;
  el.style.display = 'block';
  el.style.left  = `${g.x * TAP_BAR_PX_WIDTH_RATIO}%`;
  el.style.width = `${g.width * TAP_BAR_PX_WIDTH_RATIO}%`;
  // Последние endingThreshold секунд — мигаем, чтобы предупредить об исчезновении.
  el.classList.toggle('ending', g.ttl <= GOLDEN_ZONE.endingThreshold);
}

const ZONE_COLORS = {
  green:  '#5be35b',
  yellow: '#ffd23f',
  red:    '#ff5a5a',
  golden: '#ffd23f',
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
  const sym = result.zone === 'golden' ? '✦'
            : result.zone === 'green'  ? '★'
            : result.zone === 'yellow' ? '◆'
            : '✕';
  const tail = result.capReached
    ? ' · УРОВЕНЬ ВВЕРХ! CAP — апгрейдь тренажёр'
    : (result.leveledUp ? ' · УРОВЕНЬ ВВЕРХ!' : '');
  const label = result.zone === 'golden' ? 'ЗОЛОТО' : result.zone.toUpperCase();
  const energySuffix = result.zone === 'golden' ? '  (бесплатно!)' : `  −${result.energySpent}⚡`;
  fb.textContent = `${sym} ${label}  +${result.xpGain} XP${energySuffix}${tail}`;
  fb.className = result.zone;
  // Milestone-toast при свежедостигнутых milestone'ах в этом тапе.
  if (Array.isArray(result.milestones) && result.milestones.length > 0) {
    showMilestoneToast(result.milestones[0]);
  }
}

let milestoneToastTimer = null;
function showMilestoneToast(m) {
  const el = $('milestone-toast');
  if (!el) return;
  el.innerHTML = `
    <span class="icon">${m.icon}</span>
    <span class="label">${m.label.toUpperCase()}</span>
    <div class="desc">${m.desc}</div>
  `;
  if (milestoneToastTimer) clearTimeout(milestoneToastTimer);
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  milestoneToastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

export function bindTapButton(onTap) {
  $('tap-btn').addEventListener('click', onTap);
  $('tap-bar').addEventListener('click', onTap);
}

// ───────── Гардероб ─────────

let currentWardrobeSlot = 'fists';

const STAT_DISPLAY = {
  damage:         { icon: '⚔', label: 'УРОН',     fmt: (v) => `+${v}` },
  damagePct:      { icon: '⚔', label: 'УРОН %',   fmt: (v) => `+${(v * 100).toFixed(1)}%` },
  critChance:     { icon: '✨', label: 'КРИТ',     fmt: (v) => `+${(v * 100).toFixed(1)}%` },
  critMultiplier: { icon: '💥', label: 'МУЛ.КРИТ', fmt: (v) => `+${v.toFixed(2)}×` },
  maxHp:          { icon: '❤', label: 'HP',       fmt: (v) => `+${v}` },
  maxHpPct:       { icon: '❤', label: 'HP %',     fmt: (v) => `+${(v * 100).toFixed(1)}%` },
  defense:        { icon: '🛡', label: 'ЗАЩИТА',   fmt: (v) => `+${(v * 100).toFixed(1)}%` },
  attackSpeedPct: { icon: '⚡', label: 'СК.АТК',   fmt: (v) => `+${(v * 100).toFixed(1)}%` },
  dodgeChance:    { icon: '💨', label: 'УВОРОТ',   fmt: (v) => `+${(v * 100).toFixed(1)}%` },
  skillCdrPct:    { icon: '⏳', label: 'CDR',      fmt: (v) => `+${(v * 100).toFixed(1)}%` },
};

function primaryStatHtml(aff, item) {
  const meta = STAT_DISPLAY[aff.type];
  const icon = meta?.icon || '?';
  const label = meta?.label || aff.type.toUpperCase();
  const mult = item ? getPrimaryUpgradeMultiplier(item) : 1;
  const isInt = aff.type === 'damage' || aff.type === 'maxHp';
  const effRaw = aff.value * mult;
  const eff = isInt ? Math.round(effRaw) : Math.round(effRaw * 1000) / 1000;
  const val = meta ? meta.fmt(eff) : `+${eff}`;
  return `<span class="primary-stat">${icon} ${val}<span class="unit">${label}</span></span>`;
}

function affixPillHtml(aff) {
  const meta = STAT_DISPLAY[aff.type];
  const icon = meta?.icon || '?';
  const label = meta?.label || aff.type.toUpperCase();
  const val = meta ? meta.fmt(aff.value) : `+${aff.value}`;
  return `<span class="affix-pill"><span class="pill-icon">${icon}</span>${val}<span class="pill-label">${label}</span></span>`;
}

function renderItemCard(item, isEquipped) {
  const r = RARITIES[item.rarity];
  const slot = EQUIPMENT_SLOTS[item.slot];
  const div = document.createElement('div');
  div.className = 'item-card' + (isEquipped ? ' equipped' : '');
  div.dataset.itemId = item.id;
  div.style.borderColor = r.color;

  const upLvl = item.upgradeLevel | 0;
  const upMax = getItemUpgradeMaxLevel(item);
  const atMax = isItemAtMaxUpgrade(item);
  const upBadgeHtml = upLvl > 0
    ? `<span class="upgrade-badge${atMax ? ' max' : ''}">+${upLvl}${atMax ? ' MAX' : ''}</span>`
    : '';
  const betterBadgeHtml = !isEquipped && isItemBetterThanEquipped(item)
    ? '<span class="better-badge">↑ ЛУЧШЕ НАДЕТОГО</span>'
    : '';

  const affixesHtml = item.affixes.length
    ? `<div class="affix-line">${item.affixes.map(affixPillHtml).join('')}</div>`
    : '';

  // Уникальный аффикс — только у легендарок. Выделен сильнее secondary: цвет редкости,
  // полоса слева, фоновая заливка, подпись «УНИКАЛЬНЫЙ».
  const uniqueDef = item.uniqueAffix ? LEGENDARY_UNIQUE_AFFIXES[item.uniqueAffix.type] : null;
  const uniqueHtml = uniqueDef
    ? `<div class="affix-unique" style="--unique-color:${r.color}">
         <div class="affix-unique-label">УНИКАЛЬНЫЙ</div>
         <div class="affix-unique-body">
           <span class="affix-unique-icon">${uniqueDef.icon}</span>
           <span class="affix-unique-name">${uniqueDef.name}</span>
           <span class="affix-unique-desc">${uniqueDef.description}</span>
         </div>
       </div>`
    : '';

  const upCost = getItemUpgradeCost(item);
  const canAffordUp = upCost != null && currentEssence() >= upCost;
  const upBtnHtml = atMax
    ? `<button class="upgrade-btn" disabled>MAX +${upMax}</button>`
    : `<button class="upgrade-btn" ${canAffordUp ? '' : 'disabled'}>ПРОКАЧАТЬ<span class="cost">−${upCost}🔮</span></button>`;

  const salvageValue = getItemSalvageValue(item);
  const salvageHtml = isEquipped
    ? `<button class="salvage-btn" disabled title="Сначала сними">РАСПЫЛИТЬ<span class="gain">+${salvageValue}🔮</span></button>`
    : `<button class="salvage-btn">РАСПЫЛИТЬ<span class="gain">+${salvageValue}🔮</span></button>`;

  // FTUE: пульсируем «НАДЕТЬ» только на первой ненадетой шмотке, пока игрок ни разу ничего не надевал.
  const equipPulse = !isEquipped && ftue.pulseIfPending('itemEquip');
  const equipBtnHtml = isEquipped
    ? `<button class="equip-btn unequip">СНЯТЬ</button>`
    : `<button class="equip-btn${equipPulse ? ' ftue-pulse-btn' : ''}">НАДЕТЬ</button>`;

  div.innerHTML = `
    <div class="head">
      <span class="head-left">
        <span class="rarity-tag" style="color:${r.color}">${r.name.toUpperCase()}</span>
        ${upBadgeHtml}
        ${betterBadgeHtml}
      </span>
      ${isEquipped ? '<span class="equip-tag"></span>' : ''}
    </div>
    <div class="slot-row">
      <span class="icon">${slot.icon}</span>${slot.name}
      ${primaryStatHtml(item.primaryAffix, item)}
    </div>
    ${uniqueHtml}
    ${affixesHtml}
    <div class="item-actions">
      ${equipBtnHtml}
      ${upBtnHtml}
      ${salvageHtml}
    </div>
  `;

  div.querySelector('.equip-btn').addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (isEquipped) {
      unequipSlot(item.slot);
    } else {
      equipItem(item.id);
      ftue.recordAction('itemEquip');
    }
    renderWardrobe();
  });
  div.querySelector('.upgrade-btn').addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (atMax || !canAffordUp) return;
    if (onItemUpgrade(item.id)) {
      renderHub();
    }
  });
  div.querySelector('.salvage-btn').addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (isEquipped) return;
    if (onItemSalvage(item.id)) {
      renderHub();
    }
  });

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
  }

  // Список «в наличии» — без надетого, чтобы не дублировать его в обоих секциях.
  const nonEquipped = equipped ? all.filter(it => it.id !== equipped.id) : all;

  const invRoot = $('wardrobe-inventory');
  invRoot.innerHTML = '';
  const invTitle = document.createElement('h3');
  invTitle.textContent = `В НАЛИЧИИ (${nonEquipped.length})`;
  invRoot.appendChild(invTitle);
  if (nonEquipped.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'ward-empty';
    empty.textContent = equipped ? 'Других предметов в этом слоте нет' : 'Нет предметов в этом слоте';
    invRoot.appendChild(empty);
    return;
  }
  const rarityOrder = { legendary: 5, epic: 4, rare: 3, good: 2, common: 1 };
  const sorted = nonEquipped.slice().sort((a, b) => {
    return (rarityOrder[b.rarity] || 0) - (rarityOrder[a.rarity] || 0);
  });
  for (const item of sorted) {
    invRoot.appendChild(renderItemCard(item, false));
  }
}
