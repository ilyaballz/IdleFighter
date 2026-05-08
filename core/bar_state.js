// State бара: билеты, медали, перки. Кросс-доменный модуль (как loadout/inventory).

import { BAR, PERKS, PERKS_PER_CHOICE, PERK_CHOICES, findPerk } from '../balance/bar.js';

export const barState = {
  tickets: BAR.maxTickets,
  ticketAccum: 0,        // секунды от последнего тикета
  medals: 0,
  ownedPerks: {},        // perkId → count (стэки)
  pendingChoice: null,   // null | string[] — массив perkId для выбора 1 из N
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

// При победе в баре — медаль; каждые PERKS_PER_CHOICE открывают выбор перка.
// Возвращает true, если выбор открылся (UI должен показать оверлей).
export function awardMedal() {
  barState.medals++;
  if (barState.medals % PERKS_PER_CHOICE === 0) {
    barState.pendingChoice = rollPerkChoice();
    return true;
  }
  return false;
}

function rollPerkChoice() {
  const pool = PERKS.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, PERK_CHOICES).map(p => p.id);
}

export function takePerk(id) {
  if (!barState.pendingChoice || !barState.pendingChoice.includes(id)) return false;
  const perk = findPerk(id);
  if (!perk) return false;
  barState.ownedPerks[id] = (barState.ownedPerks[id] || 0) + 1;
  barState.pendingChoice = null;
  return true;
}

// Сумма бонусов всех взятых перков по типу stat (см. balance/bar.js).
export function getPerkBonus(statKey) {
  let total = 0;
  for (const [id, count] of Object.entries(barState.ownedPerks)) {
    const perk = findPerk(id);
    if (!perk || perk.stat !== statKey) continue;
    total += perk.value * count;
  }
  return total;
}

export function resetBarState() {
  barState.tickets = BAR.maxTickets;
  barState.ticketAccum = 0;
  barState.medals = 0;
  barState.ownedPerks = {};
  barState.pendingChoice = null;
}
