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
};

export function chapterForLocation(loc) {
  if (loc <= 10) return 1;
  return 2;
}

// Возвращает override для kind'а или null. Override применяется поверх ENEMY_BASE/ELITE_BASE/etc.
export function getChapterSkin(loc, kind) {
  const ch = CHAPTERS[chapterForLocation(loc)];
  if (!ch) return null;
  return ch[kind] || null;
}

export function chapterLabel(loc) {
  return CHAPTERS[chapterForLocation(loc)]?.label || '';
}

// Финальные боссы глав 1-2 — конфиг-driven на base boss kind.
// Поля строго перечислены в createEnemyFromTemplate, чтобы не теряться.
//
// summonAt    — порог HP (доля от maxHp), при пересечении которого босс зовёт миньонов
// summonKind  — kind миньонов ('elite'|'regular'|'ranged'|'heavy')
// summonCount — сколько миньонов спавнить
//
// enrageAt    — порог HP, при пересечении начинается ярость
// enrageDmgMult, enrageAtkSpdMult — множители на время ярости
// enrageDurationSec — длительность ярости в секундах
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
};

export function getChapterBossConfig(loc) {
  return CHAPTER_BOSSES[loc] || null;
}
