import Phaser from 'phaser';
import { FONT_FAMILY } from '../data/config';
import { DIALOGUE, type DialogueLine, type StoryBeat } from '../data/story';
import { audio } from './Audio';
import { isTouchDevice } from './VirtualInput';

const DEPTH = 300;

/**
 * Kotak dialog bergaya RPG dengan efek ketik.
 *
 * SPASI/ENTER/klik punya dua fungsi tergantung keadaan: kalau teks masih diketik,
 * ia menyelesaikan teks itu seketika; kalau sudah selesai, ia lanjut ke baris
 * berikutnya. Ini pola standar dan menghindari pemain merasa dipaksa menunggu.
 */
export class DialogueBox {
  private container?: Phaser.GameObjects.Container;
  private bodyText?: Phaser.GameObjects.Text;
  private speakerText?: Phaser.GameObjects.Text;
  private hint?: Phaser.GameObjects.Text;
  private portrait?: Phaser.GameObjects.Sprite;

  private lines: readonly DialogueLine[] = [];
  private index = 0;
  private revealed = 0;
  private finishedLine = false;
  private onDone?: () => void;

  private readonly handleAdvance = () => this.advance();

  private bossPortraitScale: number;

  constructor(
    private readonly scene: Phaser.Scene,
    /** Texture wajah pemain — berbeda per kelas. */
    private readonly playerTexture: string,
    private bossTexture: string,
    bossPortraitScale = 0.22
  ) {
    this.bossPortraitScale = bossPortraitScale;
  }

  /**
   * Ganti wajah boss sebelum memutar dialognya.
   *
   * Skalanya ikut diganti, bukan konstanta: frame kedua boss berbeda jauh
   * (192x144 vs 124x110), jadi satu angka tetap akan membuat salah satunya
   * meluber keluar bingkai.
   */
  setBoss(texture: string, portraitScale: number): void {
    this.bossTexture = texture;
    this.bossPortraitScale = portraitScale;
  }

  get isOpen(): boolean {
    return this.container !== undefined;
  }

  play(beat: StoryBeat, onDone: () => void): void {
    this.close();
    this.lines = beat.lines;
    this.index = 0;
    this.onDone = onDone;
    this.build();
    this.showLine();

    const keyboard = this.scene.input.keyboard;
    keyboard?.on('keydown-SPACE', this.handleAdvance);
    keyboard?.on('keydown-ENTER', this.handleAdvance);
    this.scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.handleAdvance);
  }

  private build(): void {
    // Dibatasi lebar layar: lebar logis berubah mengikuti rasio perangkat, dan
    // kotak 452 px akan meluber di layar logis tersempit (420 px).
    const w = Math.min(DIALOGUE.BOX_WIDTH, this.scene.scale.width - 28);
    const h = DIALOGUE.BOX_HEIGHT;
    const cx = this.scene.scale.width / 2;
    const cy = this.scene.scale.height - h / 2 - 10;

    const backdrop = this.scene.add
      .rectangle(cx, cy, w, h, 0x0d0b14, 0.94)
      .setStrokeStyle(1, 0x8fd35d, 0.9);

    this.container = this.scene.add
      .container(0, 0, [backdrop])
      .setScrollFactor(0)
      .setDepth(DEPTH);

    const left = cx - w / 2;

    // Wajah penutur di kiri, di dalam bingkainya sendiri.
    this.portrait = this.scene.add
      .sprite(left + 26, cy, this.playerTexture, 0)
      .setScale(1.3)
      .setVisible(false);
    this.container.add(this.portrait);

    // Lebar teks dihitung dari kotak, bukan angka ajaib: sisakan ruang untuk
    // wajah penutur di kiri dan margin di kanan.
    const teksKiri = left + 48;
    const lebarTeks = w - 48 - 12;

    this.speakerText = this.scene.add.text(teksKiri, cy - h / 2 + 10, '', {
      fontFamily: FONT_FAMILY,
      fontSize: '7px',
      color: '#ffe066',
    });
    this.bodyText = this.scene.add.text(teksKiri, cy - h / 2 + 26, '', {
      fontFamily: FONT_FAMILY,
      fontSize: '6px',
      color: '#e8e4f0',
      lineSpacing: 6,
      // Wajib: tanpa ini baris panjang menembus keluar kotak.
      wordWrap: { width: lebarTeks },
    });
    this.hint = this.scene.add
      // Di ponsel tidak ada tombol SPASI — yang dilakukan pemain adalah mengetuk.
      .text(cx + w / 2 - 10, cy + h / 2 - 10, isTouchDevice() ? 'SELANJUTNYA' : 'SPASI', {
        fontFamily: FONT_FAMILY,
        fontSize: '6px',
        color: '#8fd35d',
      })
      .setOrigin(1, 1);

    this.container.add([this.speakerText, this.bodyText, this.hint]);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
  }

  private showLine(): void {
    const line = this.lines[this.index];
    if (!line) return;

    this.revealed = 0;
    this.finishedLine = false;
    this.speakerText?.setText(line.speaker);
    this.bodyText?.setText('');

    if (line.portrait && this.portrait) {
      this.portrait.setTexture(
        line.portrait === 'boss' ? this.bossTexture : this.playerTexture,
        0
      );
      // Sprite boss jauh lebih besar dari sprite pemain, jadi skalanya beda.
      this.portrait.setScale(line.portrait === 'boss' ? this.bossPortraitScale : 1.3);
      this.portrait.setVisible(true);
    } else {
      this.portrait?.setVisible(false);
    }

    this.hint?.setVisible(false);
  }

  /** Dipanggil tiap frame oleh scene pemilik. */
  update(delta: number): void {
    if (!this.container || this.finishedLine) return;

    const line = this.lines[this.index];
    if (!line) return;

    this.revealed += (DIALOGUE.CHARS_PER_SECOND * delta) / 1000;
    const jumlah = Math.floor(this.revealed);

    if (jumlah >= line.text.length) {
      this.bodyText?.setText(line.text);
      this.finishedLine = true;
      this.hint?.setVisible(true);
      return;
    }
    this.bodyText?.setText(line.text.slice(0, jumlah));
  }

  private advance(): void {
    if (!this.container) return;

    // Teks masih diketik -> tuntaskan seketika, jangan lompat baris.
    if (!this.finishedLine) {
      const line = this.lines[this.index];
      this.bodyText?.setText(line ? line.text : '');
      this.finishedLine = true;
      this.hint?.setVisible(true);
      return;
    }

    audio.play('select');
    this.index++;
    if (this.index >= this.lines.length) {
      const done = this.onDone;
      this.close();
      done?.();
      return;
    }
    this.showLine();
  }

  private handleShutdown(): void {
    this.close();
  }

  close(): void {
    const keyboard = this.scene.input.keyboard;
    keyboard?.off('keydown-SPACE', this.handleAdvance);
    keyboard?.off('keydown-ENTER', this.handleAdvance);
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.handleAdvance);
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);

    this.container?.destroy(true);
    this.container = undefined;
    this.bodyText = undefined;
    this.speakerText = undefined;
    this.hint = undefined;
    this.portrait = undefined;
    this.onDone = undefined;
  }
}
