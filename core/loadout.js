// Состояние скиллов: открытые, уровни, шарды, активный лоадаут (3 слота).
// Шарды — заглушка для Этапа 3, уровни в Этапе 2 фиксированы = 1.

import { SKILLS, STARTING_SKILLS, GUARANTEED_UNLOCKS, GACHA, shardCostForLevel, MAX_SKILL_LEVEL } from '../balance/skills.js';
import { ENEMY_BASE, ELITE_BASE, BOSS_BASE } from '../balance/enemies.js';

export const LOADOUT_SLOTS = 3;

export const loadoutState = {
  unlocked: [...STARTING_SKILLS],
  levels: {},        // skillId → level (1+)
  shards: {},        // skillId → count (Этап 3)
  // Лоадаут — массив из LOADOUT_SLOTS (3) элементов; пустые слоты = null,
  // их заполняет игрок по мере открытия скиллов через гачу.
  selected: Array.from({ length: LOADOUT_SLOTS },
                       (_, i) => STARTING_SKILLS[i] || null),
  gachaTokens: 0,
};

for (const id of Object.keys(SKILLS)) {
  loadoutState.levels[id] = 1;
  loadoutState.shards[id] = 0;
}

export function isUnlocked(skillId) {
  return loadoutState.unlocked.includes(skillId);
}

export function getLockedSkills() {
  return Object.keys(SKILLS).filter(id => !loadoutState.unlocked.includes(id));
}

export function unlockSkill(skillId) {
  if (!SKILLS[skillId]) return false;
  if (loadoutState.unlocked.includes(skillId)) return false;
  loadoutState.unlocked.push(skillId);
  return true;
}

export function addGachaToken(n = 1) {
  loadoutState.gachaTokens = (loadoutState.gachaTokens || 0) + n;
}

export function consumeGachaToken() {
  if ((loadoutState.gachaTokens || 0) <= 0) return false;
  loadoutState.gachaTokens--;
  return true;
}

// Решает что выпадает из гачи. Возвращает { skillId, type: 'unlock' | 'shards', shards? }.
// Сначала исчерпывается GUARANTEED_UNLOCKS (детерминированно), потом обычный рандом:
// 75% — закрытый скилл (если есть), иначе повтор → шарды.
export function rollGachaResult() {
  const all = Object.keys(SKILLS);
  const locked = all.filter(id => !loadoutState.unlocked.includes(id));
  if (locked.length === 0) {
    const id = all[Math.floor(Math.random() * all.length)];
    return { skillId: id, type: 'shards', shards: GACHA.duplicateShards };
  }
  // Гарантированные первые N — пока есть незаоткрытые из списка, выпадают они
  for (const id of GUARANTEED_UNLOCKS) {
    if (!loadoutState.unlocked.includes(id)) {
      return { skillId: id, type: 'unlock' };
    }
  }
  const rollLocked = Math.random() < GACHA.lockedProbability;
  if (rollLocked) {
    const id = locked[Math.floor(Math.random() * locked.length)];
    return { skillId: id, type: 'unlock' };
  }
  const unlocked = all.filter(id => loadoutState.unlocked.includes(id));
  const id = unlocked[Math.floor(Math.random() * unlocked.length)];
  return { skillId: id, type: 'shards', shards: GACHA.duplicateShards };
}

export function applyGachaResult(result) {
  if (result.type === 'unlock') {
    return unlockSkill(result.skillId);
  }
  if (result.type === 'shards') {
    loadoutState.shards[result.skillId] = (loadoutState.shards[result.skillId] || 0) + (result.shards || 0);
    return true;
  }
  return false;
}

export function unlockAll() {
  for (const id of Object.keys(SKILLS)) {
    if (!loadoutState.unlocked.includes(id)) {
      loadoutState.unlocked.push(id);
    }
  }
}

export function setSlot(slotIdx, skillId) {
  if (skillId && !isUnlocked(skillId)) return false;
  // Удалить дубликат из других слотов
  if (skillId) {
    for (let i = 0; i < LOADOUT_SLOTS; i++) {
      if (i !== slotIdx && loadoutState.selected[i] === skillId) {
        loadoutState.selected[i] = null;
      }
    }
  }
  loadoutState.selected[slotIdx] = skillId;
  return true;
}

export function getSelectedSkills() {
  return loadoutState.selected.map(id => id ? { id, def: SKILLS[id], level: loadoutState.levels[id] } : null);
}

export function isLoadoutValid() {
  return loadoutState.selected.every(id => id && isUnlocked(id));
}

export function getSkillLevel(skillId) {
  return loadoutState.levels[skillId] || 1;
}

export function getSkillShards(skillId) {
  return loadoutState.shards[skillId] || 0;
}

export function isSkillAtMaxLevel(skillId) {
  return getSkillLevel(skillId) >= MAX_SKILL_LEVEL;
}

// Возвращает стоимость след. уровня в шардах, или null если уже на cap'е.
export function getSkillUpgradeCost(skillId) {
  if (isSkillAtMaxLevel(skillId)) return null;
  return shardCostForLevel(getSkillLevel(skillId));
}

export function tryUpgradeSkill(skillId) {
  if (isSkillAtMaxLevel(skillId)) return false;
  const lvl = getSkillLevel(skillId);
  const cost = shardCostForLevel(lvl);
  if (getSkillShards(skillId) < cost) return false;
  loadoutState.shards[skillId] -= cost;
  loadoutState.levels[skillId] = lvl + 1;
  return true;
}

export function addShard(skillId, count = 1) {
  if (!isUnlocked(skillId)) return;
  loadoutState.shards[skillId] = (loadoutState.shards[skillId] || 0) + count;
}

// Дроп шарда с врага. Возвращает { skillId, name } или null.
// Шанс берётся из *_BASE.shardDropChance, скилл — случайный из открытых.
export function rollShardDropForEnemy(enemy) {
  if (enemy.kind === 'bar_boss') return null;     // бар-босс не роняет шарды
  let chance;
  if (enemy.kind === 'boss')      chance = BOSS_BASE.shardDropChance;
  else if (enemy.kind === 'elite') chance = ELITE_BASE.shardDropChance;
  else                              chance = ENEMY_BASE.shardDropChance;
  if (Math.random() >= chance) return null;
  const owned = loadoutState.unlocked;
  if (owned.length === 0) return null;
  const id = owned[Math.floor(Math.random() * owned.length)];
  addShard(id, 1);
  return { skillId: id, name: SKILLS[id].name };
}
