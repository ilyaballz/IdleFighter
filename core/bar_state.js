// State бара: билеты + счётчик побед (для скейла бар-босса).
// Перк-система временно отключена (см. memory: project_bar_simplified). Поля ownedPerks /
// pendingChoice / takePerk / awardMedal удалены. getPerkBonus оставлен, но возвращает 0 —
// чтобы не ломать импорт в core/stats_layer.js (он зовёт perk('damageFlat') и т.п.).
// Когда вернёмся к перкам — реализуем заново здесь, остальной код подхватит.

import { BAR } from '../balance/bar.js';

export const barState = {
  tickets: BAR.startingTickets,
  ticketAccum: 0,        // секунды от последнего тикета
  medals: 0,             // счётчик побед — влияет только на уровень бар-босса (см. game.js)
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

// Победа в баре — увеличиваем счётчик. Награда (жетон гачи) выдаётся в game.js onBarVictory.
export function recordBarWin() {
  barState.medals++;
}

// Заглушка для core/stats_layer.js — перк-система отключена, всегда 0.
export function getPerkBonus(_statKey) {
  return 0;
}

export function resetBarState() {
  barState.tickets = BAR.startingTickets;
  barState.ticketAccum = 0;
  barState.medals = 0;
}
