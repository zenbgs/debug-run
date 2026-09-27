import Phaser from 'phaser';
import { audio } from '../systems/Audio';
import { addText, createPanel } from '../systems/Ui';

/**
 * Layar judul.
 *
 * Selain sebagai pembuka, scene ini punya alasan teknis: browser melarang
 * AudioContext berbunyi sebelum ada interaksi pengguna. Tombol "mulai" di sini
 * adalah gestur yang membuka kunci audio untuk sisa sesi.
 */
export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;

    this.cameras.main.setBackgroundColor('#0d0b14');

    const panel = createPanel(this, 260, 150);

    addText(this, panel, cx, cy - 58, 'DEBUG RUN', { size: 20, color: '#8fd35d' });
    addText(this, panel, cx, cy - 38, 'basmi bug sebelum bug membasmi kamu', {
      size: 8,
      color: '#c9c4d8',
    });

    // Rata kiri, bukan tengah: daftar dua kolom harus sejajar supaya terbaca.
    addText(
      this,
      panel,
      cx - 78,
      cy + 2,
      [
        'WASD / panah   gerak',
        'J / klik kiri  pukul (combo 3)',
        '1 2 3          pilih upgrade',
        'ESC            jeda',
        'M              senyapkan',
      ].join('\n'),
      { size: 8, color: '#e8e4f0', align: 'left' }
    );

    const prompt = addText(this, panel, cx, cy + 56, 'tekan SPASI untuk mulai', {
      size: 9,
      color: '#ffe066',
    });
    this.tweens.add({ targets: prompt, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 });

    const start = () => {
      // Dipanggil dari handler input — inilah gestur yang membuka kunci audio.
      audio.unlock();
      audio.play('select');
      audio.startMusic();
      this.scene.start('Game');
    };

    this.input.keyboard?.once('keydown-SPACE', start);
    this.input.keyboard?.once('keydown-ENTER', start);
    this.input.once(Phaser.Input.Events.POINTER_DOWN, start);
  }
}
