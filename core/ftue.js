// FTUE-модуль: онбординг и pulse-индикаторы.
//
// Изолирован от core game logic. Если FTUE надо переделать или вырезать —
// удаляешь этот файл + ~7 однострочных вызовов `ftue.X(...)` в game.js / hub/ui.js / battle/ui.js.
// Балансная часть (gating зданий по локации) живёт отдельно в balance/hub.js — остаётся даже без FTUE.
//
// Использование:
//   import * as ftue from '../core/ftue.js';
//
//   // запись действий (когда игрок что-то впервые сделал):
//   ftue.recordAction('skillCast');
//   ftue.recordScreenVisit('arsenal');
//
//   // запрос на пульс/класс (при рендере UI):
//   const pulseCls = ftue.pulseIfPending('gachaSpin');   // 'ftue-pulse-btn' или ''
//   const card = ftue.buildingCardState('gym', loc);     // { unlocked, lockHint, showFtueBadge }
//
//   // сейв-интеграция:
//   const blob = ftue.serialize();
//   ftue.deserialize(savedBlob);
//   ftue.reset();

import { isBuildingUnlocked, buildingUnlockHint } from '../balance/hub.js';

// ───────── State (in-module) ─────────

const state = {
  visitedScreens: {
    arsenal: false, wardrobe: false, gym: false, house: false, bar: false, stickers: false,
  },
  actions: {
    skillCast:   false,  // первый ручной каст скилла в бою
    gachaSpin:   false,  // первая крутка гачи
    itemEquip:   false,  // первое надевание шмота
    trainerBuy:  false,  // покупка первого T1 тренажёра
    homeUpgrade: false,  // первый апгрейд любого здания дома
    barFight:    false,  // первый спарринг в баре
  },
};

// ───────── Запись (game logic вызывает это) ─────────

export function recordAction(action) {
  if (action in state.actions) state.actions[action] = true;
}

export function recordScreenVisit(screen) {
  if (screen in state.visitedScreens) state.visitedScreens[screen] = true;
}

// ───────── Запрос (UI спрашивает что подсветить) ─────────

// Возвращает CSS-класс для подсветки кнопки, если действие ещё не сделано.
// Caller сам решает условия типа «есть жетон» / «есть монеты» — мы только трекаем «увидено или нет».
export function pulseIfPending(action) {
  return state.actions[action] === false ? 'ftue-pulse-btn' : '';
}

// Состояние карточки здания: открыто / залочено / нужен ли «!» бейдж.
export function buildingCardState(buildingId, currentLocation) {
  const unlocked = isBuildingUnlocked(buildingId, currentLocation);
  if (!unlocked) {
    return {
      unlocked: false,
      lockHint: buildingUnlockHint(buildingId) || '🔒',
      showFtueBadge: false,
    };
  }
  return {
    unlocked: true,
    lockHint: null,
    showFtueBadge: state.visitedScreens[buildingId] === false,
  };
}

// ───────── Сейв-интеграция ─────────

export function serialize() {
  return {
    visitedScreens: { ...state.visitedScreens },
    actions:        { ...state.actions },
  };
}

export function deserialize(data) {
  if (!data) return;
  if (data.visitedScreens) Object.assign(state.visitedScreens, data.visitedScreens);
  if (data.actions)        Object.assign(state.actions, data.actions);
}

export function reset() {
  for (const k of Object.keys(state.visitedScreens)) state.visitedScreens[k] = false;
  for (const k of Object.keys(state.actions))        state.actions[k] = false;
}
