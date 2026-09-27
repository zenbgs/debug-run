import Phaser from 'phaser';
import { VIEW } from './data/config';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { TitleScene } from './scenes/TitleScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: VIEW.WIDTH,
  height: VIEW.HEIGHT,
  pixelArt: true,
  backgroundColor: '#0d0b14',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    // Integer scaling menjaga piksel tetap tajam tanpa baris yang tidak rata.
    zoom: Phaser.Scale.MAX_ZOOM,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [BootScene, TitleScene, GameScene],
});

// Handle untuk inspeksi manual dari devtools saat development.
if (import.meta.env.DEV) {
  (window as unknown as { __game: Phaser.Game }).__game = game;
}

// Tanpa ini, HMR menyisakan instance Phaser lama yang masih jalan di belakang
// dan melempar error yang menyesatkan saat development.
if (import.meta.hot) {
  import.meta.hot.dispose(() => game.destroy(true));
}
