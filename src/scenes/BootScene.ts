import Phaser from 'phaser';
import { ALL_BACKGROUNDS } from '../data/backgrounds';
import { ALL_SHEETS } from '../data/frames';

export const TILESET_TEXTURE = 'overworld';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    // Bar loading sederhana — aset masih kecil, tapi berguna saat M6 nanti.
    const { width, height } = this.scale;
    const bar = this.add.rectangle(width / 2, height / 2, 0, 6, 0x8fd35d);
    const frame = this.add.rectangle(width / 2, height / 2, 160, 6).setStrokeStyle(1, 0x4a4458);
    this.load.on('progress', (value: number) => bar.setSize(158 * value, 4));
    this.load.once('complete', () => {
      bar.destroy();
      frame.destroy();
    });

    for (const sheet of ALL_SHEETS) {
      this.load.spritesheet(sheet.key, sheet.path, {
        frameWidth: sheet.frameWidth,
        frameHeight: sheet.frameHeight,
      });
    }
    this.load.image(TILESET_TEXTURE, 'assets/tilesets/overworld.png');

    // Latar parallax layar cerita — gambar utuh, bukan spritesheet.
    for (const bg of ALL_BACKGROUNDS) this.load.image(bg.key, bg.path);
  }

  create(): void {
    this.scene.start('Title');
  }
}
