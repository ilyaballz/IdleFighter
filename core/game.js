// Главный модуль: main loop, переключение сцен, оркестровка между battle/ и hub/.

import { ARENA } from '../balance/visuals.js';
import { SKILLS } from '../balance/skills.js';
import { buildLocation, buildBarLocation } from '../battle/arena.js';
import {
  barState, recoverTickets, spendTicket, awardMedal,
} from './bar_state.js';
import {
  createHero, updateBattle, HERO_STATE, activateSkill,
} from '../battle/battle.js';
import { drawWorld } from '../battle/render.js';
import {
  updateHud, showDefeat, hideDefeat, showVictory, hideVictory,
  bindSkillButtons, updateSkillButtons, showBattleScene,
} from '../battle/ui.js';
import {
  showHubScene, renderHub, bindHubActions, bindCoinsAccessor,
  showTapOverlay, hideTapOverlay,
  renderTapStatic, renderTapDynamic, flashTapFeedback, bindTapButton,
  spawnXpFly, startGachaSpin, showPerkChoiceOverlay,
} from '../hub/ui.js';
import {
  hubState, recoverEnergy, recoverGreenZones,
  tryUpgradeTrainer, startTrainingSession, endTrainingSession,
  updateSession as updateHubSession, performTap,
  getEffectiveEnergyMax, tryUpgradeHome,
} from '../hub/state.js';
import { resetHeroForNewRun, addStatXp } from './stats_layer.js';
import { loadoutState, addGachaToken, rollShardDropForEnemy } from './loadout.js';
import { addItem, rollDropForEnemy } from './inventory.js';
import { RARITIES, EQUIPMENT_SLOTS } from '../balance/equipment.js';
import { updateFx, resetFx } from './fx.js';
import { logEvent } from './logger.js';
import { bindDevPanel } from './dev.js';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

let scene = 'hub';   // 'hub' | 'battle'

const world = {
  timeNow: 0,
  coins: 0,
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
    world.coins += enemy.coinDrop;
    if (enemy.kind === 'boss') {
      const reward = enemy.energyReward || 0;
      if (reward > 0) {
        hubState.energy = Math.min(getEffectiveEnergyMax(), hubState.energy + reward);
      }
      logEvent(`БОСС повержен! +${enemy.coinDrop}💰${reward > 0 ? ` +${reward}⚡` : ''}`, 'kill');
    } else {
      logEvent(`${enemy.name} убит (+${enemy.coinDrop}💰)`, 'kill');
    }
    const shard = rollShardDropForEnemy(enemy);
    if (shard) logEvent(`+1 шард ${shard.name}`, 'kill');
    const item = rollDropForEnemy(enemy, world.location?.locationIndex || 1);
    if (item) {
      addItem(item);
      logEvent(`Дроп: [${RARITIES[item.rarity].name}] ${EQUIPMENT_SLOTS[item.slot].name}`, 'kill');
    }
  },
  onLocationCleared: () => onLocationVictory(),
};

bindCoinsAccessor(() => world.coins);

// ───────── Сцены ─────────

function enterHub() {
  scene = 'hub';
  showHubScene();
  endTrainingSession();
  hideTapOverlay();
  // Если после боя в баре открылся выбор перка — сразу показать оверлей.
  if (barState.pendingChoice) {
    setTimeout(() => showPerkChoiceOverlay(), 100);
  }
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
  // Уровень бар-босса = число побед + 1. С каждой победой следующий босс становится сильнее.
  const bossLevel = barState.medals + 1;
  world.location = buildBarLocation(bossLevel);
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
  logEvent(`=== Спарринг в баре (босс ур. ${bossLevel}) ===`);
}

function startLocation(locationIndex) {
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
  showVictory(`Локация ${cleared} зачищена!\n+1 жетон гачи (крутить в хабе)`);
  logEvent(`=== Локация ${cleared} зачищена ===`, 'kill');
}

function onBarVictory() {
  const choiceOpened = awardMedal();
  logEvent(`БАР: победа! +1 медаль (всего ${barState.medals})`, 'crit');
  showVictory(
    `Спарринг выигран!\n+1 🏅 медаль (всего ${barState.medals})` +
    (choiceOpened ? `\n\n✨ Откроется выбор перка в хабе` : '')
  );
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
      logEvent(`Тренажёр прокачан: ${stat}`, 'kill');
      renderHub();
    } else {
      logEvent('Не хватает монет на апгрейд', 'warn');
    }
  },
  onHomeUpgrade: (buildingId) => {
    const ok = tryUpgradeHome(buildingId, (cost) => {
      if (world.coins < cost) return false;
      world.coins -= cost;
      return true;
    });
    if (ok) {
      logEvent(`Дом прокачан: ${buildingId}`, 'kill');
      renderHub();
    } else {
      logEvent('Не хватает монет на апгрейд дома', 'warn');
    }
  },
  onBarFight: () => {
    enterBarFight();
  },
});

bindTapButton(() => {
  if (!hubState.session) return;
  const result = performTap(addStatXp, world.timeNow);
  if (!result) return;
  flashTapFeedback(result);
  if (!result.failed) spawnXpFly(result.xpGain, result.zone);
  if (result.leveledUp) logEvent(`Уровень стата вверх: ${hubState.session?.stat || ''}`, 'crit');
  renderTapDynamic();
  if (result.sessionEnded || result.failed) {
    setTimeout(() => {
      hideTapOverlay();
      renderHub();
    }, result.failed ? 600 : 400);
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

// ───────── Старт ─────────

enterBattle(hubState.currentLocationIndex);
tick();
