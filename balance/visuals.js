export const ARENA = {
  arenaWidth: 500,
  arenaHeight: 500,

  corridorLength: 250,
  corridorWidth: 140,

  enemySpawnPadding: 60,
  spawnSpread: 'random',

  cameraSmoothing: 0.12,
  cameraZoom: 1.0,

  worldBackgroundColor: '#0a0612',
  arenaFloorColor: '#1f1f2a',
  corridorFloorColor: '#181826',
  arenaBorderColor: '#3a2f5a',
};

export const FEEDBACK = {
  hitFlash: {
    duration: 0.1,
    color: '#ffffff',
  },
  knockback: {
    duration: 0.1,                  // время полёта после отброса
    bossResist: 0.2,                // босс отлетает только на 20% от дистанции
  },
  damageNumbers: {
    enabled: true,
    riseDistance: 30,
    duration: 0.6,
    critFontScale: 1.5,
    normalColor: '#ffffff',
    critColor: '#ffd23f',
  },
  skillShake: {
    enabled: true,
    intensity: 4,
    duration: 0.1,
  },
};
