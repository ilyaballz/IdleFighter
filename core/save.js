// Локальное сохранение прогресса в localStorage.
// Сейв пишется при заходе в хаб + при закрытии вкладки.
// Загрузка — на старте игры один раз.
//
// SAVE_VERSION защищает от подгрузки несовместимых сейвов после изменений формата —
// при ломаемых правках просто бамп версии и старый сейв молча игнорится (=новый старт).

import { heroState } from './stats_layer.js';
import { loadoutState } from './loadout.js';
import { inventoryState, getNextItemId, setNextItemId } from './inventory.js';
import { hubState } from '../hub/state.js';
import { barState } from './bar_state.js';
import { serializeStickers, deserializeStickers } from './stickers_state.js';
import * as ftue from './ftue.js';

const STORAGE_KEY = 'streetbrawler_save_v1';
const SAVE_VERSION = 1;

let worldRef = null;

export function bindWorldForSave(world) { worldRef = world; }

export function saveGame() {
  if (!worldRef) return false;
  const data = {
    version: SAVE_VERSION,
    timestamp: Date.now(),
    world: {
      coins:   worldRef.coins   | 0,
      nuts:    worldRef.nuts    | 0,
      essence: worldRef.essence | 0,
    },
    hero: {
      levels: { ...heroState.levels },
      xp:     { ...heroState.xp },
    },
    hub: {
      energy: hubState.energy,
      currentLocationIndex: hubState.currentLocationIndex,
      trainers: {
        strength:  { tier: hubState.trainers.strength.tier,  lifetimeTaps: hubState.trainers.strength.lifetimeTaps  | 0 },
        toughness: { tier: hubState.trainers.toughness.tier, lifetimeTaps: hubState.trainers.toughness.lifetimeTaps | 0 },
        agility:   { tier: hubState.trainers.agility.tier,   lifetimeTaps: hubState.trainers.agility.lifetimeTaps   | 0 },
      },
      home: { ...hubState.home },
    },
    loadout: {
      unlocked:    [...loadoutState.unlocked],
      selected:    [...loadoutState.selected],
      levels:      { ...loadoutState.levels },
      shards:      { ...loadoutState.shards },
      gachaTokens: loadoutState.gachaTokens || 0,
    },
    inventory: {
      items: inventoryState.items.map(it => ({
        id: it.id,
        slot: it.slot,
        rarity: it.rarity,
        upgradeLevel: it.upgradeLevel | 0,
        primaryAffix: { ...it.primaryAffix },
        affixes: it.affixes.map(a => ({ ...a })),
      })),
      equipped: { ...inventoryState.equipped },
      nextItemId: getNextItemId(),
    },
    bar: {
      tickets: barState.tickets,
      ticketAccum: barState.ticketAccum,
      medals: barState.medals,
      currentOpponentIdx: barState.currentOpponentIdx,
      winsOnCurrent: barState.winsOnCurrent,
    },
    stickers: serializeStickers(),
    ftue: ftue.serialize(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn('Save failed:', e);
    return false;
  }
}

export function loadGame() {
  if (!worldRef) return false;
  let raw;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { return false; }
  if (!raw) return false;
  let data;
  try { data = JSON.parse(raw); } catch (e) { return false; }
  if (data?.version !== SAVE_VERSION) return false;

  // World
  worldRef.coins   = data.world?.coins   ?? 0;
  worldRef.nuts    = data.world?.nuts    ?? 0;
  worldRef.essence = data.world?.essence ?? 0;

  // Hero
  for (const s of ['strength', 'toughness', 'agility']) {
    if (data.hero?.levels?.[s] != null) heroState.levels[s] = data.hero.levels[s];
    if (data.hero?.xp?.[s]     != null) heroState.xp[s]     = data.hero.xp[s];
  }

  // Hub
  if (data.hub?.energy != null)               hubState.energy = data.hub.energy;
  if (data.hub?.currentLocationIndex != null) hubState.currentLocationIndex = data.hub.currentLocationIndex;
  for (const s of ['strength', 'toughness', 'agility']) {
    const tr = data.hub?.trainers?.[s];
    if (typeof tr?.tier === 'number') hubState.trainers[s].tier = tr.tier;
    if (typeof tr?.lifetimeTaps === 'number') hubState.trainers[s].lifetimeTaps = tr.lifetimeTaps;
  }
  if (data.hub?.home) {
    // Back-compat: mirror → coffee (старое имя постройки до переименования в Кофеварку).
    const h = { ...data.hub.home };
    if (h.mirror != null && h.coffee == null) { h.coffee = h.mirror; }
    delete h.mirror;
    Object.assign(hubState.home, h);
  }

  // Loadout
  if (Array.isArray(data.loadout?.unlocked)) loadoutState.unlocked = [...data.loadout.unlocked];
  if (Array.isArray(data.loadout?.selected)) loadoutState.selected = [...data.loadout.selected];
  if (data.loadout?.levels) Object.assign(loadoutState.levels, data.loadout.levels);
  if (data.loadout?.shards) Object.assign(loadoutState.shards, data.loadout.shards);
  if (typeof data.loadout?.gachaTokens === 'number') loadoutState.gachaTokens = data.loadout.gachaTokens;

  // Inventory
  inventoryState.items.length = 0;
  if (Array.isArray(data.inventory?.items)) {
    for (const it of data.inventory.items) {
      // Back-compat: старые сейвы без upgradeLevel — подставляем 0.
      if (it.upgradeLevel == null) it.upgradeLevel = 0;
      inventoryState.items.push(it);
    }
  }
  for (const k of Object.keys(inventoryState.equipped)) inventoryState.equipped[k] = null;
  if (data.inventory?.equipped) Object.assign(inventoryState.equipped, data.inventory.equipped);
  if (typeof data.inventory?.nextItemId === 'number') setNextItemId(data.inventory.nextItemId);

  // Bar — старые сейвы могут содержать ownedPerks/pendingChoice, мы их игнорим.
  if (typeof data.bar?.tickets === 'number')            barState.tickets = data.bar.tickets;
  if (typeof data.bar?.ticketAccum === 'number')        barState.ticketAccum = data.bar.ticketAccum;
  if (typeof data.bar?.medals === 'number')             barState.medals = data.bar.medals;
  if (typeof data.bar?.currentOpponentIdx === 'number') barState.currentOpponentIdx = data.bar.currentOpponentIdx;
  if (typeof data.bar?.winsOnCurrent === 'number')      barState.winsOnCurrent = data.bar.winsOnCurrent;

  // Stickers — back-compat: старые сейвы без блока → коллекция пустая.
  deserializeStickers(data.stickers);

  // FTUE — back-compat: старые сейвы без блока → reset, флаги остаются дефолтные false.
  if (data.ftue) ftue.deserialize(data.ftue);

  return true;
}

export function wipeSave() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
}

export function hasSave() {
  try { return localStorage.getItem(STORAGE_KEY) != null; } catch (e) { return false; }
}
