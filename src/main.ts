import Phaser from "phaser";
import { FONT_FAMILY, VIEW } from "./data/config";
import { BootScene } from "./scenes/BootScene";
import { CharacterSelectScene } from "./scenes/CharacterSelectScene";
import { GameScene } from "./scenes/GameScene";
import { TitleScene } from "./scenes/TitleScene";

/**
 * Phaser menggambar teks ke canvas, jadi font HARUS sudah termuat sebelum objek teks
 * pertama dibuat — kalau tidak, teks ter-render dengan font fallback dan tidak
 * diperbarui saat font akhirnya datang.
 */
async function muatFont(): Promise<void> {
  if (!document.fonts) return;
  try {
    await document.fonts.load(`16px ${FONT_FAMILY}`);
    await document.fonts.ready;
  } catch {
    // Font gagal dimuat — Phaser akan memakai monospace. Game tetap jalan.
  }
}

function buatGame(): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    width: VIEW.WIDTH,
    height: VIEW.HEIGHT,
    pixelArt: true,
    backgroundColor: "#0d0b14",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      // Integer scaling menjaga piksel tetap tajam tanpa baris yang tidak rata.
      zoom: Phaser.Scale.MAX_ZOOM,
    },
    physics: {
      default: "arcade",
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },
    scene: [BootScene, TitleScene, CharacterSelectScene, GameScene],
  });
}

let game: Phaser.Game | undefined;
void muatFont().then(() => {
  game = buatGame();
  if (import.meta.env.DEV) {
    (window as unknown as { __game: Phaser.Game }).__game = game;
  }
});

// Tanpa ini, HMR menyisakan instance Phaser lama yang masih jalan di belakang
// dan melempar error yang menyesatkan saat development.
if (import.meta.hot) {
  import.meta.hot.dispose(() => game?.destroy(true));
}
