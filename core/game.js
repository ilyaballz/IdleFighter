// Главный модуль: main loop, переключение сцен, оркестровка между battle/ и hub/.

import { ARENA } from '../balance/visuals.js';
import { SKILLS } from '../balance/skills.js';
import { buildLocation, buildBarLocation } from '../battle/arena.js';
import { arenaNutDrop, arenaEnergyDrop, resetArenaPity } from '../balance/enemies.js';
import {
  barState, recoverTickets, spendTicket, recordBarWin, getCurrentOpponent,
} from './bar_state.js';
import {
  buildBarReward, rollScratchTier, SCRATCH_STICKER_BONUS_CHANCE,
} from '../balance/bar.js';
import {
  createHero, updateBattle, HERO_STATE, activateSkill,
} from '../battle/battle.js';
import { drawWorld } from '../battle/render.js';
import {
  updateHud, showDefeat, hideDefeat, showVictory, hideVictory,
  bindSkillButtons, updateSkillButtons, showBattleScene,
} from '../battle/ui.js';
import {
  showHubScene, renderHub, bindHubActions, bindCoinsAccessor, bindNutsAccessor, bindEssenceAccessor,
  showTapOverlay, hideTapOverlay,
  renderTapStatic, renderTapDynamic, flashTapFeedback, bindTapButton,
  spawnXpFly, startGachaSpin, showStickerToast, showScratchCard, showHubScreen,
} from '../hub/ui.js';
import {
  hubState, recoverEnergy, recoverGreenZones,
  tryUpgradeTrainer, startTrainingSession, endTrainingSession,
  updateSession as updateHubSession, performTap,
  getEffectiveEnergyMax, tryUpgradeHome,
  bindHeroStatLevelProvider, applyLocationClearFatigueRefund,
} from '../hub/state.js';
import { resetHeroForNewRun, addStatXp, heroState } from './stats_layer.js';
import * as ftue from './ftue.js';
import { loadoutState, addGachaToken, addShard, rollShardDropForEnemy } from './loadout.js';
import {
  addItem, rollDropForEnemy, findItem, isItemEquipped,
  getItemUpgradeCost, getItemSalvageValue, upgradeItem, removeItem,
  generateItem,
} from './inventory.js';
import { RARITIES, EQUIPMENT_SLOTS } from '../balance/equipment.js';
import { isBuildingUnlocked } from '../balance/hub.js';
import { tryDropStickerForKill, getStickerBonus, dropRandomMissingSticker } from './stickers_state.js';
import { STICKERS } from '../balance/stickers.js';
import { updateFx, resetFx } from './fx.js';

// Связываем hub/state с heroState через DI — нужно для cap-проверок без циклического импорта.
bindHeroStatLevelProvider((stat) => heroState.levels[stat] || 0);
import { logEvent } from './logger.js';
import { bindDevPanel } from './dev.js';
import { bindWorldForSave, saveGame, loadGame } from './save.js';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

let scene = 'hub';   // 'hub' | 'battle'

const world = {
  timeNow: 0,
  coins: 0,
  nuts: 0,
  essence: 0,
  hero: null,
  location: null,
  camera: { x: 0, y: 0 },
  projectiles: [],            // активные projectiles от ranged-врагов (Молотов и т.п.)
  locationClearedFired: false,
  onEnemyKilled: (enemy) => {
    if (enemy.kind === 'bar_boss') {
      // Награда даётся в onBarVictory (медаль). Здесь — только лог.
      logEvent(`БАР: ${enemy.name} повержен!`, 'kill');
      return;
    }
    const coinMult = 1 + getStickerBonus('coinPct');
    const coinReward = Math.round(enemy.coinDrop * coinMult);
    world.coins += coinReward;
    if (enemy.kind === 'boss') {
      const reward = enemy.energyReward || 0;
      if (reward > 0) {
        hubState.energy = Math.min(getEffectiveEnergyMax(), hubState.energy + reward);
      }
      const nuts = enemy.nutDrop || 0;
      if (nuts > 0) world.nuts += nuts;
      const parts = [`+${coinReward}💰`];
      if (nuts > 0) parts.push(`+${nuts}🔩`);
      if (reward > 0) parts.push(`+${reward}⚡`);
      logEvent(`БОСС повержен! ${parts.join(' ')}`, 'kill');
    } else {
      logEvent(`${enemy.name} убит (+${coinReward}💰)`, 'kill');
    }
    const shard = rollShardDropForEnemy(enemy);
    if (shard) logEvent(`+1 шард ${shard.name}`, 'kill');
    const item = rollDropForEnemy(enemy, world.location?.locationIndex || 1);
    if (item) {
      addItem(item);
      logEvent(`Дроп: [${RARITIES[item.rarity].name}] ${EQUIPMENT_SLOTS[item.slot].name}`, 'kill');
    }
    // Стикеры дропают только после разлочки самой фичи — иначе игрок видит toast'ы
    // не понимая что это, и сейв уходит в неконсистентное состояние (есть стикеры до открытия Бумбокса).
    if (isBuildingUnlocked('stickers', hubState.currentLocationIndex)) {
      const stickerId = tryDropStickerForKill(enemy);
      if (stickerId) {
        const s = STICKERS[stickerId];
        logEvent(`📼 НАКЛЕЙКА: ${s.icon} ${s.name}!`, 'crit');
        showStickerToast(stickerId);
      }
    }
  },
  onLocationCleared: () => onLocationVictory(),
  // Per-arena drops (60/40 сплит босс/арены). Бар не дропает гайки и энергию.
  onArenaCleared: (arena) => {
    if (world.location?.kind === 'bar') return;
    const locIdx = world.location?.locationIndex || 1;
    const nut = arenaNutDrop(locIdx, arena.index);
    if (nut > 0) {
      world.nuts += nut;
      logEvent(`+${nut}🔩 за арену`, 'kill');
    }
    const energy = arenaEnergyDrop(locIdx, arena.index);
    if (energy > 0) {
      hubState.energy = Math.min(getEffectiveEnergyMax(), hubState.energy + energy);
      logEvent(`+${energy}⚡ за арену`, 'kill');
    }
  },
};

bindCoinsAccessor(() => world.coins);
bindNutsAccessor(() => world.nuts);
bindEssenceAccessor(() => world.essence);
bindWorldForSave(world);

// Загружаем сейв до первого старта боя — статы/инвентарь/локация подхватятся.
const loaded = loadGame();
if (loaded) logEvent('Сейв загружен');

// ───────── Сцены ─────────

function enterHub() {
  scene = 'hub';
  showHubScene();
  endTrainingSession();
  hideTapOverlay();
  saveGame();
}

function enterBattle(locationIndex) {
  scene = 'battle';
  showBattleScene();
  fitCanvas();
  startLocation(locationIndex);
}

function enterBarFight() {
  if (!spendTicket()) {
    logEvent('Нет билетов на спарринг', 'warn');
    renderHub();
    return;
  }
  scene = 'battle';
  showBattleScene();
  fitCanvas();
  startBarFight();
}

function startBarFight() {
  // barLevel считается "Это мой N-й бой подряд" — после первой победы medals=1 → следующий бой lvl=2.
  // Награда и скейл считаются по lvl того боя, в котором мы сейчас находимся.
  const opponent = getCurrentOpponent();
  const barLevel = barState.medals + 1;
  world.location = buildBarLocation(opponent, barLevel);
  world.locationClearedFired = false;
  world.projectiles = [];
  resetHeroForNewRun();
  resetFx();
  const arena = world.location.arenas[0];
  world.hero = createHero({
    x: arena.entryPoint.x,
    y: arena.y - 80,
  });
  world.hero.targetArenaIndex = 1;
  world.hero.state = HERO_STATE.MOVING_TO_NEXT_ARENA;
  defeatShown = false;
  hideDefeat();
  hideVictory();
  const rect = canvas.getBoundingClientRect();
  world.camera.x = world.hero.x - rect.width / 2;
  world.camera.y = world.hero.y - rect.height / 2;
  logEvent(`=== Бар: ${opponent.icon} ${opponent.name} (ур. ${barLevel}) ===`);
}

function startLocation(locationIndex) {
  // Pity спавна спец-арен сбрасывается с каждой новой локацией — иначе игрок начинал бы
  // с накопленным «pity-долгом» от предыдущей и мог получить пак на первой же арене.
  resetArenaPity();
  world.location = buildLocation(locationIndex);
  world.locationClearedFired = false;
  world.projectiles = [];
  resetHeroForNewRun();
  resetFx();
  const firstArena = world.location.arenas[0];
  world.hero = createHero({
    x: firstArena.entryPoint.x,
    y: firstArena.y - 80,
  });
  world.hero.targetArenaIndex = 1;
  world.hero.state = HERO_STATE.MOVING_TO_NEXT_ARENA;
  defeatShown = false;
  hideDefeat();
  hideVictory();
  const rect = canvas.getBoundingClientRect();
  world.camera.x = world.hero.x - rect.width / 2;
  world.camera.y = world.hero.y - rect.height / 2;
  logEvent(`=== Локация ${locationIndex} началась ===`);
}

function onLocationVictory() {
  if (world.location?.kind === 'bar') {
    onBarVictory();
    return;
  }
  const cleared = world.location.locationIndex;
  addGachaToken(1);
  logEvent(`+1 жетон гачи!`, 'crit');
  hubState.currentLocationIndex = cleared + 1;
  const refund = applyLocationClearFatigueRefund();
  const refundLine = refund > 0 ? `\n🧊 Тренажёры освежены (−${refund.toFixed(1)} усталости)` : '';
  if (refund > 0) logEvent(`🧊 Свежесть тренажёров: −${refund.toFixed(1)}`, 'kill');
  showVictory(`Локация ${cleared} зачищена!\n+1 жетон гачи${refundLine}`);
  logEvent(`=== Локация ${cleared} зачищена ===`, 'kill');
}

function onBarVictory() {
  // barLevel в наградах = тот же лвл, что был в бою (до инкремента medals).
  const opponent = getCurrentOpponent();
  const barLevel = barState.medals + 1;
  const tier = rollScratchTier();
  const reward = buildBarReward(opponent, barLevel, tier);
  // 10% доп. ролл стикера только на 2/3-match. На 1-match — никогда.
  let bonusStickerId = null;
  if (tier >= 2 && Math.random() < SCRATCH_STICKER_BONUS_CHANCE) {
    bonusStickerId = dropRandomMissingSticker();
  }
  logEvent(`БАР: ${opponent.name} повержен! Скретч tier ${tier}.`, 'crit');
  // Переходим в хаб → секция бара → открываем скретч-карту. Награда начислится только на ЗАБРАТЬ.
  enterHub();
  showHubScreen('bar');
  showScratchCard({
    opponent, tier, reward, bonusStickerId,
    onClaim: () => applyBarReward(reward, bonusStickerId),
  });
}

// Начисление награды + advance прогресса. Вызывается из callback'а скретч-карты на «ЗАБРАТЬ».
function applyBarReward(reward, bonusStickerId) {
  const opponent = getCurrentOpponent();
  // 1) Сама награда по rewardType
  switch (reward.kind) {
    case 'coins':
      world.coins += reward.amount;
      logEvent(`+${reward.amount}💰 (${opponent.name})`, 'kill');
      break;
    case 'essence':
      world.essence += reward.amount;
      logEvent(`+${reward.amount}🔮 (${opponent.name})`, 'kill');
      break;
    case 'shards': {
      const owned = loadoutState.unlocked;
      if (owned.length === 0) {
        logEvent('Шарды некуда вешать — ни одного скилла не открыто', 'warn');
        break;
      }
      for (let i = 0; i < reward.shards; i++) {
        const id = owned[Math.floor(Math.random() * owned.length)];
        addShard(id, 1);
      }
      logEvent(`+${reward.shards} шардов (распределены)`, 'kill');
      break;
    }
    case 'shards_plus_token': {
      addGachaToken(reward.gachaTokens || 1);
      const owned = loadoutState.unlocked;
      if (owned.length > 0) {
        for (let i = 0; i < reward.shards; i++) {
          const id = owned[Math.floor(Math.random() * owned.length)];
          addShard(id, 1);
        }
      }
      logEvent(`+${reward.gachaTokens}🎰 +${reward.shards} шардов`, 'crit');
      break;
    }
    case 'item': {
      // Бар даёт предметы со скейлом по barLevel (= medals + 1 на момент боя).
      const item = generateItem(pickRandomSlot(), reward.rarity, barState.medals + 1);
      if (item) {
        addItem(item);
        logEvent(`Дроп: [${RARITIES[item.rarity].name}] ${EQUIPMENT_SLOTS[item.slot].name}`, 'crit');
      }
      break;
    }
  }
  // 2) Побочный стикер (если выпал)
  if (bonusStickerId) {
    const s = STICKERS[bonusStickerId];
    logEvent(`📼 БОНУС-НАКЛЕЙКА: ${s.icon} ${s.name}!`, 'crit');
    showStickerToast(bonusStickerId);
  }
  // 3) Учёт победы + advance противника (если 3/3)
  const advanced = recordBarWin();
  if (advanced) {
    const next = getCurrentOpponent();
    logEvent(`БАР: на ринге следующий — ${next.icon} ${next.name}`, 'crit');
  }
  // 4) Сохранение + перерисовка вкладки бара
  saveGame();
  renderHub();
}

function pickRandomSlot() {
  const slotIds = Object.keys(EQUIPMENT_SLOTS);
  return slotIds[Math.floor(Math.random() * slotIds.length)];
}

// ───────── Resize / Camera ─────────

function fitCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', fitCanvas);

function updateCamera() {
  const rect = canvas.getBoundingClientRect();
  const targetX = world.hero.x - rect.width / 2;
  const targetY = world.hero.y - rect.height / 2;
  const s = ARENA.cameraSmoothing;
  world.camera.x += (targetX - world.camera.x) * s;
  world.camera.y += (targetY - world.camera.y) * s;
}

// ───────── Loop ─────────

let lastTime = performance.now();
let firstFrame = true;
let defeatShown = false;
let hubUiTimer = 0;

function tick() {
  requestAnimationFrame(tick);
  const now = performance.now();
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (dt > 0.05) dt = 0.05;

  if (firstFrame) { fitCanvas(); firstFrame = false; }

  recoverEnergy(dt);
  recoverGreenZones(dt);
  recoverTickets(dt);

  if (scene === 'battle' && world.location && world.hero) {
    updateBattle(world, dt);
    updateCamera();
    updateFx(world.timeNow);
    drawWorld(ctx, world);
    updateHud(world);
    updateSkillButtons(world.hero);
    if (world.hero.state === HERO_STATE.DEAD && !defeatShown) {
      defeatShown = true;
      showDefeat();
    }
  } else if (scene === 'hub') {
    if (hubState.session) {
      updateHubSession(dt);
      renderTapDynamic();
    }
    hubUiTimer += dt;
    if (hubUiTimer >= 0.5) {
      hubUiTimer = 0;
      if (!hubState.session) renderHub();
    }
  }
}

// ───────── Связки UI ─────────

bindSkillButtons((skillId) => {
  if (scene !== 'battle' || !world.hero) return;
  activateSkill(world.hero, skillId, world);
  ftue.recordAction('skillCast');
  // Пульс на кнопке скилла снимем при следующем рендере UI боя.
});

bindHubActions({
  onTrainerStart: (stat) => {
    if (startTrainingSession(stat)) {
      renderTapStatic();
      renderTapDynamic();
      showTapOverlay();
      logEvent(`Тренировка ${stat} началась`);
    } else {
      logEvent('Недостаточно энергии для тренировки', 'warn');
    }
  },
  onTrainerUpgrade: (stat) => {
    const ok = tryUpgradeTrainer(stat, (cost) => {
      if (world.coins < cost) return false;
      world.coins -= cost;
      return true;
    });
    if (ok) {
      ftue.recordAction('trainerBuy');
      logEvent(`Тренажёр прокачан: ${stat}`, 'kill');
      renderHub();
    } else {
      logEvent('Не хватает монет на апгрейд', 'warn');
    }
  },
  onHomeUpgrade: (buildingId) => {
    const ok = tryUpgradeHome(buildingId, (cost) => {
      if (world.nuts < cost) return false;
      world.nuts -= cost;
      return true;
    });
    if (ok) {
      ftue.recordAction('homeUpgrade');
      logEvent(`Дом прокачан: ${buildingId}`, 'kill');
      renderHub();
    } else {
      logEvent('Не хватает гаек на апгрейд дома', 'warn');
    }
  },
  onBarFight: () => {
    ftue.recordAction('barFight');
    enterBarFight();
  },
  onItemUpgrade: (itemId) => {
    const item = findItem(itemId);
    if (!item) return false;
    const cost = getItemUpgradeCost(item);
    if (cost == null) return false;
    if (world.essence < cost) {
      logEvent('Не хватает эссенции на прокачку', 'warn');
      return false;
    }
    if (!upgradeItem(itemId)) return false;
    world.essence -= cost;
    logEvent(`Предмет прокачан до +${item.upgradeLevel}`, 'kill');
    return true;
  },
  onItemSalvage: (itemId) => {
    const item = findItem(itemId);
    if (!item) return false;
    if (isItemEquipped(itemId)) {
      logEvent('Сначала сними предмет, чтобы распылить', 'warn');
      return false;
    }
    const value = getItemSalvageValue(item);
    if (!removeItem(itemId)) return false;
    world.essence += value;
    logEvent(`Распылено: +${value}🔮`, 'kill');
    return true;
  },
});

bindTapButton(() => {
  if (!hubState.session) return;
  const sessionStat = hubState.session.stat;
  const result = performTap(addStatXp, world.timeNow);
  if (!result) return;
  flashTapFeedback(result);
  if (!result.failed) spawnXpFly(result.xpGain, result.zone);
  if (result.cascade) logEvent('🔗 МУЛЬТИТАП — каскад!', 'crit');
  if (result.leveledUp) logEvent(`Уровень стата вверх: ${sessionStat}`, 'crit');
  if (result.capReached) logEvent(`${sessionStat}: достигнут cap тира — апгрейдь тренажёр`, 'crit');
  renderTapDynamic();
  if (result.sessionEnded || result.failed) {
    setTimeout(() => {
      hideTapOverlay();
      renderHub();
    }, result.failed ? 600 : result.capReached ? 700 : 400);
  }
});

document.getElementById('gacha-spin').addEventListener('click', () => {
  startGachaSpin((result) => {
    if (result.type === 'unlock') {
      logEvent(`Гача: открыт ${SKILLS[result.skillId].name}!`, 'crit');
    } else {
      logEvent(`Гача: повтор ${SKILLS[result.skillId].name} → +${result.shards} шардов`, 'kill');
    }
  });
});

document.getElementById('hub-btn').addEventListener('click', () => enterHub());
document.getElementById('leave-hub').addEventListener('click', () => enterBattle(hubState.currentLocationIndex));
document.getElementById('tap-exit').addEventListener('click', () => {
  endTrainingSession();
  hideTapOverlay();
  renderHub();
});
document.getElementById('defeat-restart').addEventListener('click', () => enterHub());
document.getElementById('victory-next').addEventListener('click', () => enterHub());

// ───────── Дев-панель ─────────
// Включается через ?dev=1 в URL или через кнопку 🛠 DEV рядом с ХАБ.
// bindDevPanel вешает обработчики только при первом включении (lazy).

let devPanelBound = false;
function ensureDevPanelBound() {
  if (devPanelBound) return;
  bindDevPanel({
    world,
    getScene: () => scene,
    enterHub,
    startLocation,
  });
  devPanelBound = true;
}

function setDevMode(on) {
  document.body.classList.toggle('dev-mode', on);
  document.getElementById('dev-toggle-btn').classList.toggle('active', on);
  if (on) ensureDevPanelBound();
}

document.getElementById('dev-toggle-btn').addEventListener('click', () => {
  setDevMode(!document.body.classList.contains('dev-mode'));
});

if (new URLSearchParams(location.search).get('dev') === '1') {
  setDevMode(true);
}

// Сейв при закрытии вкладки/обновлении страницы — гарантия что свежие монеты/гайки не потеряются.
window.addEventListener('beforeunload', () => saveGame());
// Подстраховка для мобилок: pagehide срабатывает там, где beforeunload не всегда долетает.
window.addEventListener('pagehide', () => saveGame());

// ───────── Старт ─────────

// Если сейв подгрузился — стартуем сразу в хабе (игрок сам решит, идти в бой или копить).
// Если сейва нет — стартуем в L1 как раньше (обучающий первый забег).
if (loaded) enterHub();
else enterBattle(hubState.currentLocationIndex);
tick();
