/**
 * Ukuran frame spritesheet hasil `tools/pack_assets.py`.
 * Kalau packer diubah, jalankan ulang dan sesuaikan angka di sini — output
 * script-nya mencetak ringkasan yang siap disalin.
 */

export type SheetSpec = {
  key: string;
  path: string;
  frameWidth: number;
  frameHeight: number;
  frames: number;
};

export const SHEETS = {
  PLAYER: {
    key: 'player',
    path: 'assets/sprites/player-guy.png',
    frameWidth: 32,
    frameHeight: 32,
    frames: 12,
  },
  PLAYER_BLONDKID: {
    key: 'player-blondkid',
    path: 'assets/sprites/player-blondkid.png',
    frameWidth: 32,
    frameHeight: 32,
    frames: 12,
  },
  PLAYER_PIRATEGIRL: {
    key: 'player-pirategirl',
    path: 'assets/sprites/player-pirategirl.png',
    frameWidth: 32,
    frameHeight: 32,
    frames: 12,
  },
  PLAYER_ARROW: {
    key: 'player-arrow',
    path: 'assets/sprites/player-arrow.png',
    frameWidth: 32,
    frameHeight: 32,
    frames: 1,
  },
  ENEMY_BEETLE: {
    key: 'enemy-beetle',
    path: 'assets/sprites/enemy-beetle.png',
    frameWidth: 48,
    frameHeight: 48,
    frames: 5,
  },
  ENEMY_CRAWLER: {
    key: 'enemy-crawler',
    path: 'assets/sprites/enemy-crawler.png',
    frameWidth: 48,
    frameHeight: 48,
    frames: 4,
  },
  ENEMY_MOTH: {
    key: 'enemy-moth',
    path: 'assets/sprites/enemy-moth.png',
    frameWidth: 48,
    frameHeight: 48,
    frames: 4,
  },
  BOSS_CORE: {
    key: 'boss-core',
    path: 'assets/sprites/boss-core.png',
    frameWidth: 192,
    frameHeight: 144,
    frames: 5,
  },
  FX_BOSS_BOLT: {
    key: 'boss-bolt',
    path: 'assets/fx/boss-bolt.png',
    frameWidth: 8,
    frameHeight: 8,
    frames: 2,
  },
  FX_BOSS_RAYS: {
    key: 'boss-rays',
    path: 'assets/fx/boss-rays.png',
    frameWidth: 64,
    frameHeight: 224,
    frames: 11,
  },
  FX_ELECTRO_SHOCK: {
    key: 'fx-electro-shock',
    path: 'assets/fx/fx-electro-shock.png',
    frameWidth: 128,
    frameHeight: 96,
    frames: 9,
  },
  FX_ENERGY_FIELD: {
    key: 'fx-energy-field',
    path: 'assets/fx/fx-energy-field.png',
    frameWidth: 51,
    frameHeight: 47,
    frames: 8,
  },
  FX_ARCANE_CRESCENT: {
    key: 'fx-arcane-crescent',
    path: 'assets/fx/fx-arcane-crescent.png',
    frameWidth: 32,
    frameHeight: 32,
    frames: 6,
  },
  FX_ARCANE_BLAST: {
    key: 'fx-arcane-blast',
    path: 'assets/fx/fx-arcane-blast.png',
    frameWidth: 63,
    frameHeight: 48,
    frames: 6,
  },
  FX_SLASH_HORIZONTAL: {
    key: 'fx-slash-horizontal',
    path: 'assets/fx/fx-slash-horizontal.png',
    frameWidth: 65,
    frameHeight: 40,
    frames: 5,
  },
  FX_SLASH_UPWARD: {
    key: 'fx-slash-upward',
    path: 'assets/fx/fx-slash-upward.png',
    frameWidth: 52,
    frameHeight: 56,
    frames: 5,
  },
  FX_SLASH_CIRCULAR: {
    key: 'fx-slash-circular',
    path: 'assets/fx/fx-slash-circular.png',
    frameWidth: 52,
    frameHeight: 48,
    frames: 6,
  },
  FX_HIT: {
    key: 'fx-hit',
    path: 'assets/fx/fx-hit.png',
    frameWidth: 31,
    frameHeight: 32,
    frames: 3,
  },
  FX_ENEMY_DEATH: {
    key: 'fx-enemy-death',
    path: 'assets/fx/fx-enemy-death.png',
    frameWidth: 64,
    frameHeight: 64,
    frames: 8,
  },
} as const satisfies Record<string, SheetSpec>;

export const ALL_SHEETS: readonly SheetSpec[] = Object.values(SHEETS);
