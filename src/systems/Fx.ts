import Phaser from 'phaser';
import { ALL_SHEETS } from '../data/frames';

/** Depth FX di atas pemain supaya slash terlihat menutupi, bukan tertutup. */
const FX_DEPTH = 20;

const FX_FRAME_RATE = 24;

/** Nama animasi FX = key spritesheet-nya. */
export function createFxAnimations(scene: Phaser.Scene): void {
  for (const sheet of ALL_SHEETS) {
    // Dipilih berdasarkan folder aset, bukan awalan nama key: sprite FX boss
    // bernama `boss-bolt`/`boss-rays` dan dulu terlewat oleh filter `fx-`.
    if (!sheet.path.startsWith('assets/fx/')) continue;
    if (scene.anims.exists(sheet.key)) continue;
    scene.anims.create({
      key: sheet.key,
      frames: scene.anims.generateFrameNumbers(sheet.key, {
        start: 0,
        end: sheet.frames - 1,
      }),
      frameRate: FX_FRAME_RATE,
      repeat: 0,
    });
  }
}

export type FxOptions = {
  scale?: number;
  angle?: number;
  flipX?: boolean;
};

/**
 * Mainkan FX sekali lalu hancurkan sendiri.
 *
 * Sengaja tidak pakai object pool: jumlah FX di layar kecil dan sprite Phaser
 * murah dibuat. Kalau nanti M5 (boss) bikin FX membanjir, baru ganti ke pool.
 */
export function playFx(
  scene: Phaser.Scene,
  key: string,
  x: number,
  y: number,
  options: FxOptions = {}
): void {
  const sprite = scene.add.sprite(x, y, key);
  sprite.setDepth(FX_DEPTH);
  sprite.setScale(options.scale ?? 1);
  sprite.setAngle(options.angle ?? 0);
  sprite.setFlipX(options.flipX ?? false);

  sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sprite.destroy());
  // Kalau scene dimatikan di tengah animasi, sprite tetap ikut dibersihkan.
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => sprite.destroy());

  sprite.play(key);
}
