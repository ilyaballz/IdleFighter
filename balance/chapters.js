// Главы: тематические скины поверх базовых kind'ов + конфиги финальных боссов глав.
//
// Архитектура:
//   - Базовые kind'ы (regular/ranged/heavy/elite/boss) остаются прежними, логика поведения
//     общая. CHAPTERS просто меняет name/color + опционально мелкий профильный твист
//     (например, attackRange для снайпера Подземки).
//   - Финальные боссы L10/L20 — обычный kind 'boss' с конфигом-триггером в CHAPTER_BOSSES
//     (summonAt — призыв миньонов, enrageAt — берсерк-баф на N сек). Без новых kind'ов.
//   - Финальные боссы глав 3-4 (Хозяин клуба, Главпрораб) — будут отдельными kind'ами,
//     т.к. требуют новой state-machine. См. project_chapters_plan в memory.

export const CHAPTERS = {
  1: {
    label: 'Город',
    regular: { name: 'Гопник',  color: '#8a7560' },
    ranged:  { name: 'Шпана',   color: '#d97706' },
    heavy:   { name: 'Качок',   color: '#c0392b' },
    elite:   { name: 'Байкер',  color: '#9b59d4' },
  },
  2: {
    label: 'Подземка',
    // Беспризорник: чуть быстрее гопника (сюжетно — мелкий и шустрый).
    regular: { name: 'Беспризорник', color: '#5a6b4d', moveSpeedMult: 1.05 },
    // Снайпер: дальше бьёт, чем шпана с бутылками. Опасен пресс залпа на длинной дистанции.
    // kiteRetreat — отступает если игрок подходит ближе attackRange (поведение «снайпер бегает»).
    ranged:  { name: 'Снайпер', color: '#b8860b', attackRangeMult: 1.20, kiteRetreat: true },
    heavy:   { name: 'Боксёр-зэк', color: '#7a4e2b' },
    elite:   { name: 'Пахан', color: '#4b3a82' },
  },
  3: {
    label: 'Клуб',
    regular: { name: 'Тусовщик',   color: '#c47ae0' },
    // Бармен: коктейль Молотова. После приземления снаряда — горящая лужа на 2.5с,
    // тикает 30% от damage снаряда в секунду (раз в 0.5с). Радиус снаряда расширен 32→48.
    // Лужи стакаются — несколько Барменов на одной точке = опасная зона.
    ranged:  { name: 'Бармен', color: '#e8a04b',
               aoeLingerDuration: 2.5, aoeLingerDpsPct: 0.3, projectileAoeRadius: 48 },
    heavy:   { name: 'Вышибала',   color: '#7a2d2d' },
    elite:   { name: 'VIP-охрана', color: '#3d2c63' },
  },
  4: {
    label: 'Стройка',
    regular: { name: 'Разнорабочий', color: '#a89548' },
    // Арматурщик: тот же молотов, что у Бармена — параметры идентичны (тюнить независимо при балансе).
    ranged:  { name: 'Арматурщик', color: '#8a6e2e',
               aoeLingerDuration: 2.5, aoeLingerDpsPct: 0.3, projectileAoeRadius: 48 },
    heavy:   { name: 'Молотобоец',   color: '#5c4a2e' },
    elite:   { name: 'Бригадир',     color: '#3d4f6b' },
    // Подрывник (kind 'bomber') — рескин для главы Стройки. Идентичность гл.4 — «эпоха взрывов».
    bomber:  { name: 'Минёр', color: '#a04020' },
  },
};

export function chapterForLocation(loc) {
  if (loc <= 10) return 1;
  if (loc <= 20) return 2;
  if (loc <= 30) return 3;
  return 4;
}

// Возвращает override для kind'а или null. Override применяется поверх ENEMY_BASE/ELITE_BASE/etc.
export function getChapterSkin(loc, kind) {
  const ch = CHAPTERS[chapterForLocation(loc)];
  if (!ch) return null;
  return ch[kind] || null;
}

// Финальные боссы глав — конфиг-driven на base boss kind.
// Поля строго перечислены в createEnemyFromTemplate (battle.js) и forwarded в arena.js.
//
// summonAt    — порог HP (доля от maxHp), при пересечении которого босс зовёт миньонов
// summonKind  — kind миньонов ('elite'|'regular'|'ranged'|'heavy')
// summonCount — сколько миньонов спавнить
//
// enrageAt    — порог HP, при пересечении начинается ярость
// enrageDmgMult, enrageAtkSpdMult — множители на время ярости
// enrageDurationSec — длительность ярости в секундах
//
// dodgeChance — шанс уклониться от любого хита (см. dealDamage в battle.js)
//
// windupDuration, slamRadius — конвертирует обычную атаку в SLAM как у Качка
//   (battle.js:1260 — если windupDuration > 0, враг сначала готовит замах, потом AOE).
// attackSpeedOverride — переопределяет BOSS_BASE.baseAttackSpeed (0.6) для slam-боссов;
//   качок имеет 0.4, чтобы окно между slam'ами было читаемым.
export const CHAPTER_BOSSES = {
  10: {
    name: 'Авторитет',
    summonAt: 0.5,
    summonKind: 'elite',
    summonCount: 2,
  },
  20: {
    name: 'Машинист',
    enrageAt: 0.5,
    enrageDmgMult: 1.5,
    enrageAtkSpdMult: 1.5,
    enrageDurationSec: 5,
  },
  30: {
    name: 'Хозяин клуба',
    // Скользкий и быстрый: 25% хитов мимо. Заставляет давить дольше — особенно болезненно
    // для cooldown-скиллов (один промах = ждать КД). DoT (bleed) тикает через тот же
    // dealDamage, так что тоже под проверкой — не workaround.
    dodgeChance: 0.25,
  },
  40: {
    name: 'Главпрораб',
    // Использует SLAM как Качок (windup 1.5с → AOE-удар). Атак-спид понижен до 0.4,
    // чтобы между slam'ами было время на reposition (как у качка). Knockdown отменяет
    // замах — single-target burst-CC (spinkick) контрит.
    windupDuration: 1.5,
    slamRadius: 80,
    attackSpeedOverride: 0.4,
  },
};

export function getChapterBossConfig(loc) {
  return CHAPTER_BOSSES[loc] || null;
}
