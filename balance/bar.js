// Бар — спарринги с боссом по билетам. Победа → медаль. Каждые N медалей → выбор перка.

export const BAR = {
  maxTickets: 3,
  ticketRecoverSec: 3600,        // 1 час на билет
};

// Босс бара. Скейлится от числа побед (см. game.js: bossLevel = barState.medals + 1).
// Без coinDrop/equipDrop — бар даёт только медали (см. onEnemyKilled, kind 'bar_boss').
export const BAR_BOSS = {
  baseHp: 220,
  baseDamage: 6,
  hpPerLevel: 80,
  damagePerLevel: 1.5,
  attackSpeed: 0.55,
  moveSpeed: 75,
  bodyRadius: 36,
  color: '#ff7e3e',
  names: ['Шериф', 'Громила', 'Цепочник', 'Боксёр', 'Качок', 'Ветеран'],
};

// Сколько медалей нужно для одного выбора перка и сколько перков предлагается.
export const PERKS_PER_CHOICE = 5;
export const PERK_CHOICES = 3;

// 15 пассивных перков. Каждый стэкается при повторном выборе.
// stat — ключ для getPerkBonus в stats_layer.js (см. computeEffectiveStat).
export const PERKS = [
  { id: 'iron_fists',  name: 'Стальные кулаки',  icon: '🥊', desc: '+5% урона',                   stat: 'damagePct',       value: 0.05 },
  { id: 'thick_skin',  name: 'Толстокожий',      icon: '🛡️', desc: '+10% макс HP',                stat: 'maxHpPct',        value: 0.10 },
  { id: 'lightning',   name: 'Молниеносный',     icon: '⚡', desc: '+5% ск.атаки',                stat: 'attackSpeedPct',  value: 0.05 },
  { id: 'sharp_eye',   name: 'Меткий глаз',      icon: '🎯', desc: '+3% крит шанс',               stat: 'critChance',      value: 0.03 },
  { id: 'brutal',      name: 'Жестокий удар',    icon: '💢', desc: '+0.15× мул. крита',           stat: 'critMultiplier',  value: 0.15 },
  { id: 'slippery',    name: 'Скользкий',        icon: '💨', desc: '+3% уворот',                  stat: 'dodgeChance',     value: 0.03 },
  { id: 'plates',      name: 'Латы',             icon: '🔩', desc: '+3% защита',                  stat: 'defense',         value: 0.03 },
  { id: 'cold_blood',  name: 'Хладнокровный',    icon: '❄️', desc: '+5% CDR',                     stat: 'skillCdrPct',     value: 0.05 },
  { id: 'enduring',    name: 'Выносливый',       icon: '💚', desc: '+0.1%/с реген HP в бою',      stat: 'hpRegenInBattle', value: 0.001 },
  { id: 'long_arm',    name: 'Длинная рука',     icon: '🦾', desc: '+5 радиус атаки',             stat: 'attackRadius',    value: 5 },
  { id: 'light_step',  name: 'Лёгкая поступь',   icon: '👟', desc: '+10 ск.движения',             stat: 'moveSpeed',        value: 10 },
  { id: 'spike_glove', name: 'Шипастые перчатки', icon: '🧤', desc: '+5 урон (плоско)',           stat: 'damageFlat',       value: 5 },
  { id: 'stone_head',  name: 'Каменный лоб',     icon: '🗿', desc: '+30 макс HP (плоско)',        stat: 'maxHpFlat',        value: 30 },
  { id: 'hammer',      name: 'Кулаки молотом',   icon: '🔨', desc: '+0.10× мул. крита',           stat: 'critMultiplier',  value: 0.10 },
  { id: 'tank',        name: 'Танк',             icon: '🛢️', desc: '+50 макс HP (плоско)',        stat: 'maxHpFlat',        value: 50 },
];

export function findPerk(id) {
  return PERKS.find(p => p.id === id) || null;
}

// Шкала босса: уровень = число побед в баре + 1 (см. game.js startBarFight).
export function bossStatsForLevel(level) {
  const lvl = Math.max(1, level);
  return {
    hp: Math.round(BAR_BOSS.baseHp + BAR_BOSS.hpPerLevel * (lvl - 1)),
    damage: BAR_BOSS.baseDamage + BAR_BOSS.damagePerLevel * (lvl - 1),
  };
}
