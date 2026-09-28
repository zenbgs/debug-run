import Phaser from 'phaser';
import { audio } from '../systems/Audio';
import { addText, createPanel } from '../systems/Ui';
import { isTouchDevice } from '../systems/VirtualInput';

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

    const panel = createPanel(this, 360, 168);

    addText(this, panel, cx, cy - 66, 'DEBUG RUN', { size: 20, color: '#8fd35d' });
    addText(this, panel, cx, cy - 46, 'basmi bug sebelum bug membasmi kamu', {
      size: 6,
      color: '#c9c4d8',
    });

    // Rata kiri, bukan tengah: daftar dua kolom harus sejajar supaya terbaca.
    // Ukuran 6 px dipilih karena Press Start 2P jauh lebih lebar daripada monospace —
    // pada 8 px daftar ini meluber keluar panel.
    addText(
      this,
      panel,
      cx - 156,
      cy - 4,
      [
        'WASD / panah    gerak',
        'J / klik kiri   pukul (combo 3)',
        'K / klik kanan  skill 1 (per kelas)',
        'L atau Q        skill 2 (per kelas)',
        'SPASI / SHIFT   dash (kebal)',
        '1 2 3           pilih upgrade',
        'ESC  M          jeda  senyapkan',
      ].join('\n'),
      { size: 6, color: '#e8e4f0', align: 'left' }
    );

    const prompt = addText(
      this,
      panel,
      cx,
      cy + 66,
      isTouchDevice() ? 'ketuk untuk pilih kelas' : 'tekan SPASI untuk pilih kelas',
      { size: 8, color: '#ffe066' }
    );
    this.tweens.add({ targets: prompt, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 });

    const start = () => {
      // Dipanggil dari handler input — inilah gestur yang membuka kunci audio.
      audio.unlock();
      audio.play('select');
      audio.startMusic();
      this.scene.start('CharacterSelect');
    };

    this.input.keyboard?.once('keydown-SPACE', start);
    this.input.keyboard?.once('keydown-ENTER', start);
    this.input.once(Phaser.Input.Events.POINTER_DOWN, start);
  }
}
