import Phaser from 'phaser';
import { audio } from '../systems/Audio';
import { PLAYER_CLASSES } from '../data/classes';
import { loadRecords, recordFor } from '../systems/Records';
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

  /**
   * Baris rekor per kelas. Kelas yang belum pernah dimainkan sengaja dilewati,
   * bukan ditampilkan bernilai nol: pemain baru tidak perlu melihat daftar kosong
   * yang memberi kesan ada sesuatu yang hilang.
   */
  private barisRekor(): string[] {
    const records = loadRecords();
    return PLAYER_CLASSES.map((kelas) => {
      const r = recordFor(records, kelas.id);
      if (!r) return undefined;
      // "~" menandai run yang sempat masuk mode tanpa batas.
      const tanda = r.endless ? '~' : '';
      const nama = kelas.name.toUpperCase().padEnd(8);
      return `${nama} ${String(r.score).padStart(5)}  wave ${r.wave}${tanda}`;
    }).filter((x): x is string => x !== undefined);
  }

  create(): void {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;

    this.cameras.main.setBackgroundColor('#0d0b14');

    // Panel tumbuh hanya kalau ada rekor untuk ditampilkan. Tinggi tetap akan
    // menyisakan lubang kosong di layar pemain baru.
    const rekor = this.barisRekor();
    const tinggiRekor = rekor.length > 0 ? 18 + rekor.length * 9 : 0;
    const panel = createPanel(this, 360, 168 + tinggiRekor);

    const atas = cy - (168 + tinggiRekor) / 2;

    addText(this, panel, cx, atas + 18, 'DEBUG RUN', { size: 20, color: '#8fd35d' });
    addText(this, panel, cx, atas + 38, 'basmi bug sebelum bug membasmi kamu', {
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
      atas + 80,
      (isTouchDevice()
        ? [
            'stik kiri       gerak',
            'tombol J        pukul (combo 3)',
            'tombol K        skill 1 (per kelas)',
            'tombol L        skill 2 (per kelas)',
            'tombol >>       dash (kebal)',
            'ketuk panel     pilih upgrade',
            'tombol ||       jeda',
          ]
        : [
            'WASD / panah    gerak',
            'J / klik kiri   pukul (combo 3)',
            'K / klik kanan  skill 1 (per kelas)',
            'L atau Q        skill 2 (per kelas)',
            'SPASI / SHIFT   dash (kebal)',
            '1 2 3           pilih upgrade',
            'ESC  M          jeda  senyapkan',
          ]
      ).join('\n'),
      { size: 6, color: '#e8e4f0', align: 'left' }
    );

    if (rekor.length > 0) {
      addText(this, panel, cx, atas + 122, 'REKOR TERBAIK', { size: 6, color: '#ffe066' });
      addText(this, panel, cx, atas + 132 + (rekor.length * 9) / 2, rekor.join('\n'), {
        size: 6,
        color: '#8fd35d',
      });
    }

    const prompt = addText(
      this,
      panel,
      cx,
      atas + 152 + tinggiRekor,
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
