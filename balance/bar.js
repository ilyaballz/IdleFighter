// Бар: бесконечная серия боёв с 5 уникальными противниками в линейной ротации.
// После каждой победы — скретч-карта с тиром награды. Каждые 3 победы → следующий противник.
//
// Все формулы декларативны (зависят только от barLevel = barState.medals + 1).
// barLevel считается "Это мой N-й бой подряд" — после первой победы medals=1 → следующий бой lvl=2.
// Для расчёта награды за ТЕКУЩУЮ победу используется тот же лвл, на котором шёл бой.

export const BAR = {
  maxTickets: 3,
  ticketRecoverSec: 600,         // 10 мин на билет
  startingTickets: 1,            // на старте 1 билет (не полный набор)
  winsPerOpponent: 3,            // победы для перехода на следующего противника
};

// Базовые статы бар-противника (до множителей opponent.hpMult / dmgMult).
// Скейл от barLevel сохраняем линейный, как раньше у бар-босса.
export const BAR_BASE = {
  baseHp: 220,
  baseDamage: 6,
  hpPerLevel: 80,
  damagePerLevel: 1.5,
  attackSpeed: 0.55,
  moveSpeed: 75,
  bodyRadius: 36,
  color: '#ff7e3e',
};

// 5 противников. Линейная ротация: idx 0 → 1 → 2 → 3 → 4 → 0 → ...
// rewardType — ключ в BAR_REWARDS. Особенности (crit/dodge/enrage) — поля
// темплейта врага, читаются battle.js / arena.js.
export const BAR_OPPONENTS = [
  {
    id: 'vitya', name: 'Витя', icon: '🥊', color: '#ff7e3e',
    hpMult: 1.0, dmgMult: 1.0,
    enrageAt: 0.3, enrageDmgMult: 2.0, enrageAtkSpdMult: 1.0, enrageDurationSec: 999,
    rewardType: 'item',
  },
  {
    id: 'borya', name: 'Боря', icon: '💰', color: '#ffd23f',
    hpMult: 1.5, dmgMult: 0.7,
    rewardType: 'coins',
  },
  {
    id: 'zhorik', name: 'Жорик', icon: '✦', color: '#4fd6ff',
    hpMult: 0.8, dmgMult: 1.3,
    critChance: 0.4, critMultiplier: 2.0, dodgeChance: 0.25,
    rewardType: 'shards',
  },
  {
    id: 'oleg', name: 'Олег', icon: '🔮', color: '#d97aff',
    hpMult: 1.0, dmgMult: 1.0,
    rewardType: 'essence',
  },
  {
    id: 'serzh', name: 'Серж', icon: '🎰', color: '#5be35b',
    hpMult: 1.3, dmgMult: 1.3,
    rewardType: 'jackpot',
  },
];

// Шкала бар-противника: уровень + множители конкретного opponent'а.
// (lvl применяется как для бар-босса раньше: baseHp + hpPerLevel * (lvl - 1).)
export function barOpponentStats(opponent, level) {
  const lvl = Math.max(1, level);
  return {
    hp:     Math.round((BAR_BASE.baseHp     + BAR_BASE.hpPerLevel     * (lvl - 1)) * opponent.hpMult),
    damage: (BAR_BASE.baseDamage + BAR_BASE.damagePerLevel * (lvl - 1)) * opponent.dmgMult,
  };
}

// ───────── Скретч-карта ─────────

// Один общий ролл тира: 5% → 3-match, 30% → 2-match, остальное → 1-match.
// tier == число target-символов из 3 ячеек.
export const SCRATCH_TIER_CHANCES = { tier3: 0.05, tier2: 0.30 };

export function rollScratchTier() {
  const r = Math.random();
  if (r < SCRATCH_TIER_CHANCES.tier3) return 3;
  if (r < SCRATCH_TIER_CHANCES.tier2) return 2;
  return 1;
}

// 10% доп. ролл стикера на 2-match и 3-match. На 1-match — никогда.
export const SCRATCH_STICKER_BONUS_CHANCE = 0.10;

// 💎 Кристалльный jackpot со скретч-карты:
//   3-match → +SCRATCH_CRYSTAL_JACKPOT кристаллов гарантированно (≈5% всех боёв)
//   2-match → +1💎 с шансом SCRATCH_CRYSTAL_2MATCH_CHANCE (≈6% всех боёв)
export const SCRATCH_CRYSTAL_JACKPOT = 5;
export const SCRATCH_CRYSTAL_2MATCH_CHANCE = 0.20;

// ───────── Награды (по rewardType + tier) ─────────
// Каждая ветка возвращает дескриптор награды: { kind, amount?, rarity?, ... } + label для UI.
// Применение награды (начисление монет/выдача предмета и т.п.) делает core/game.js.

// Награды Бори. Lvl coefficient = barLevel (тот, на котором был бой).
// 1-match: 200 × lvl, 2-match: 600 × lvl, 3-match: 1800 × lvl.
function rewardCoins(barLevel, tier) {
  const base = tier === 3 ? 1800 : tier === 2 ? 600 : 200;
  const amount = base * Math.max(1, barLevel);
  return { kind: 'coins', amount, label: `+${amount}💰` };
}

// Награды Вити. Редкость предмета по тиру: 1=good, 2=rare, 3=epic.
// Common из бара выпилен — на эндгейме он мусорный, не оправдывает билет.
function rewardItem(_barLevel, tier) {
  const rarity = tier === 3 ? 'epic' : tier === 2 ? 'rare' : 'good';
  const label = `+1 шмот [${rarity === 'epic' ? 'ЭПИК' : rarity === 'rare' ? 'РЕДКИЙ' : 'ХОРОШИЙ'}]`;
  return { kind: 'item', rarity, label };
}

// Награды Жорика. 1-match: 10 шардов. 2-match: 25 шардов. 3-match: 1 жетон гачи + 50 шардов.
function rewardShards(_barLevel, tier) {
  if (tier === 3) return { kind: 'shards_plus_token', shards: 50, gachaTokens: 1, label: '+1🎰 +50 шардов' };
  if (tier === 2) return { kind: 'shards', shards: 25, label: '+25 шардов' };
  return { kind: 'shards', shards: 10, label: '+10 шардов' };
}

// Награды Олега. 40 / 120 / 300 эссенции.
function rewardEssence(_barLevel, tier) {
  const amount = tier === 3 ? 300 : tier === 2 ? 120 : 40;
  return { kind: 'essence', amount, label: `+${amount}🔮` };
}

// Награды Сержа. Шмот высокой редкости — epic / legendary / legendary-c-гарантией.
// goodRoll — флаг для core/inventory.js, чтобы поднять variance secondary-аффиксов в макс зону.
function rewardJackpot(_barLevel, tier) {
  if (tier === 3) return { kind: 'item', rarity: 'legendary', goodRoll: true, label: '+1 шмот [ЛЕГА+]' };
  if (tier === 2) return { kind: 'item', rarity: 'legendary', label: '+1 шмот [ЛЕГА]' };
  return { kind: 'item', rarity: 'epic', label: '+1 шмот [ЭПИК]' };
}

const REWARD_BUILDERS = {
  coins:    rewardCoins,
  item:     rewardItem,
  shards:   rewardShards,
  essence:  rewardEssence,
  jackpot:  rewardJackpot,
};

export function buildBarReward(opponent, barLevel, tier) {
  const builder = REWARD_BUILDERS[opponent.rewardType];
  if (!builder) return { kind: 'coins', amount: 0, label: '???' };
  return builder(barLevel, tier);
}

// Превью награды для UI вкладки бара (показывается до боя).
export function previewRewardLabel(opponent) {
  switch (opponent.rewardType) {
    case 'coins':   return '💰 монеты';
    case 'item':    return '👕 предмет';
    case 'shards':  return '✦ шарды';
    case 'essence': return '🔮 эссенция';
    case 'jackpot': return '🎰 шмот высокой редкости';
    default:        return '???';
  }
}

// Иконка target-символа в ячейке скретч-карты — тематическая под тип награды противника.
export function scratchTargetIcon(opponent) {
  switch (opponent.rewardType) {
    case 'coins':   return '💰';
    case 'item':    return '👕';   // как в гардеробе — соответствует «шмот»
    case 'shards':  return '✦';
    case 'essence': return '🔮';
    case 'jackpot': return '🎰';
    default:        return '⭐';
  }
}
