// State бара: билеты + счётчик побед (= barLevel) + текущий противник в ротации.
// Победа над противником: winsOnCurrent++. На 3-й победе advance: currentOpponentIdx → следующий
// (циклически 0..4), winsOnCurrent сбрасывается. Поражение прогресс не сбрасывает (стоит билета).

import { BAR, BAR_OPPONENTS } from '../balance/bar.js';

export const barState = {
  tickets: BAR.startingTickets,
  ticketAccum: 0,             // секунды от последнего тикета
  medals: 0,                  // общий счётчик побед = barLevel в формулах
  currentOpponentIdx: 0,      // 0..4 — индекс в BAR_OPPONENTS
  winsOnCurrent: 0,           // 0..2 — побед над текущим противником
};

// Регенерация билетов. Вызывать в общем тике.
export function recoverTickets(dt) {
  if (barState.tickets >= BAR.maxTickets) {
    barState.ticketAccum = 0;
    return;
  }
  barState.ticketAccum += dt;
  while (barState.ticketAccum >= BAR.ticketRecoverSec && barState.tickets < BAR.maxTickets) {
    barState.tickets++;
    barState.ticketAccum -= BAR.ticketRecoverSec;
  }
  if (barState.tickets >= BAR.maxTickets) barState.ticketAccum = 0;
}

export function getNextTicketSec() {
  if (barState.tickets >= BAR.maxTickets) return null;
  return Math.max(0, BAR.ticketRecoverSec - barState.ticketAccum);
}

export function spendTicket() {
  if (barState.tickets <= 0) return false;
  barState.tickets--;
  return true;
}

// Текущий противник в ротации.
export function getCurrentOpponent() {
  return BAR_OPPONENTS[barState.currentOpponentIdx] || BAR_OPPONENTS[0];
}

// Победа в баре — увеличиваем общий счётчик и прогресс на текущем противнике.
// Возвращает true, если на этой победе произошло переключение на следующего противника.
export function recordBarWin() {
  barState.medals++;
  barState.winsOnCurrent++;
  if (barState.winsOnCurrent >= BAR.winsPerOpponent) {
    barState.currentOpponentIdx = (barState.currentOpponentIdx + 1) % BAR_OPPONENTS.length;
    barState.winsOnCurrent = 0;
    return true;
  }
  return false;
}

export function resetBarState() {
  barState.tickets = BAR.startingTickets;
  barState.ticketAccum = 0;
  barState.medals = 0;
  barState.currentOpponentIdx = 0;
  barState.winsOnCurrent = 0;
}
