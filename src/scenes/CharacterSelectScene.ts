import Phaser from 'phaser';
import { PLAYER_CLASSES } from '../data/classes';
import { getSkill, SKILL_HOTKEYS } from '../data/skills';
import { FONT_FAMILY } from '../data/config';
import { STORY_INTRO } from '../data/story';
import { Player } from '../entities/Player';
import { audio } from '../systems/Audio';
import { isTouchDevice } from '../systems/VirtualInput';
import { DialogueBox } from '../systems/DialogueBox';
import { addText, createPanel, type PanelHandle } from '../systems/Ui';

const CARD_WIDTH = 144;
const CARD_GAP = 8;

/**
 * Layar pilih kelas.
 *
 * Kartu dipilih dengan panah kiri/kanan (atau 1/2/3, atau klik), lalu ENTER/SPASI
 * untuk mengunci. Setelah terkunci, cerita pembuka diputar di scene yang sama —
 * bukan scene terpisah — supaya sprite kelas yang baru dipilih bisa langsung
 * dipakai sebagai wajah penutur di kotak dialog.
 */
export class CharacterSelectScene extends Phaser.Scene {
  private terpilih = 0;
  private kartu: Phaser.GameObjects.Rectangle[] = [];
  private judulKelas: Phaser.GameObjects.Text[] = [];
  private pratinjau: Phaser.GameObjects.Sprite[] = [];
  private panelDetail!: PanelHandle;
  private teksDetail!: Phaser.GameObjects.Text;
  private dialogue?: DialogueBox;
  private terkunci = false;

  constructor() {
    super('CharacterSelect');
  }

  create(): void {
    this.terpilih = 0;
    this.terkunci = false;
    this.kartu = [];
    this.judulKelas = [];
    this.pratinjau = [];

    this.cameras.main.setBackgroundColor('#0d0b14');
    Player.createAnimations(this);

    const cx = this.scale.width / 2;

    this.add
      .text(cx, 20, 'PILIH KELAS', {
        fontFamily: FONT_FAMILY,
        fontSize: '14px',
        color: '#8fd35d',
      })
      .setOrigin(0.5);

    const total = PLAYER_CLASSES.length;
    const lebarTotal = total * CARD_WIDTH + (total - 1) * CARD_GAP;
    const kiri = cx - lebarTotal / 2;

    PLAYER_CLASSES.forEach((config, i) => {
      const x = kiri + i * (CARD_WIDTH + CARD_GAP) + CARD_WIDTH / 2;
      const y = 108;

      const kartu = this.add
        .rectangle(x, y, CARD_WIDTH, 134, 0x1a1626, 0.95)
        .setStrokeStyle(1, 0x4a4458);
      this.kartu.push(kartu);

      // Pratinjau memakai animasi jalan supaya kartunya terasa hidup.
      const sprite = this.add.sprite(x, y - 42, config.texture, 0).setScale(1.6);
      sprite.play(`${config.texture}-walk-down`);
      this.pratinjau.push(sprite);

      const judul = this.add
        .text(x, y - 2, config.name, {
          fontFamily: FONT_FAMILY,
          fontSize: '9px',
          color: '#e8e4f0',
        })
        .setOrigin(0.5);
      this.judulKelas.push(judul);

      this.add
        .text(x, y + 12, config.title, {
          fontFamily: FONT_FAMILY,
          fontSize: '6px',
          color: '#8f88a8',
        })
        .setOrigin(0.5);

      this.add
        .text(x, y + 34, config.highlights.join('\n'), {
          fontFamily: FONT_FAMILY,
          fontSize: '6px',
          color: '#c9c4d8',
          align: 'center',
          lineSpacing: 5,
          // Jaring pengaman kalau teks highlight nanti ditambah panjang.
          wordWrap: { width: CARD_WIDTH - 14 },
        })
        .setOrigin(0.5, 0);

      kartu.setInteractive({ useHandCursor: true });
      kartu.on('pointerdown', () => {
        if (this.terkunci) return;
        this.terpilih = i;
        this.perbaruiSorotan();
        this.kunciPilihan();
      });
      kartu.on('pointerover', () => {
        if (this.terkunci) return;
        this.terpilih = i;
        this.perbaruiSorotan();
      });
    });

    this.panelDetail = createPanel(this, 452, 62, 214);
    this.teksDetail = addText(this, this.panelDetail, cx, 214, '', {
      size: 6,
      color: '#c9c4d8',
    });

    // Daftar kontrol dipindah ke sini dari layar judul: di sana ia jadi hal
    // pertama yang dilihat orang — tujuh baris manual sebelum sempat tertarik.
    // Di sini pemain memang sudah berhenti untuk membaca.
    this.add
      .text(
        cx,
        246,
        isTouchDevice()
          ? 'stik kiri gerak   J pukul   K L skill   >> dash'
          : 'WASD gerak   J pukul   K L skill   SPASI dash   ESC jeda',
        { fontFamily: FONT_FAMILY, fontSize: '6px', color: '#8fd35d' }
      )
      .setOrigin(0.5);

    this.add
      .text(cx, 260, isTouchDevice() ? 'ketuk kartu untuk memilih' : 'panah kiri/kanan pilih  -  ENTER mulai', {
        fontFamily: FONT_FAMILY,
        fontSize: '7px',
        color: '#ffe066',
      })
      .setOrigin(0.5);

    this.perbaruiSorotan();

    const keyboard = this.input.keyboard;
    keyboard?.on('keydown-LEFT', () => this.geser(-1));
    keyboard?.on('keydown-A', () => this.geser(-1));
    keyboard?.on('keydown-RIGHT', () => this.geser(1));
    keyboard?.on('keydown-D', () => this.geser(1));
    keyboard?.on('keydown-ENTER', () => this.kunciPilihan());
    keyboard?.on('keydown-SPACE', () => this.kunciPilihan());
    PLAYER_CLASSES.forEach((_, i) => {
      keyboard?.on(`keydown-${['ONE', 'TWO', 'THREE'][i]}`, () => {
        if (this.terkunci) return;
        this.terpilih = i;
        this.perbaruiSorotan();
      });
    });
  }

  private geser(arah: number): void {
    if (this.terkunci) return;
    this.terpilih = Phaser.Math.Wrap(this.terpilih + arah, 0, PLAYER_CLASSES.length);
    audio.play('select');
    this.perbaruiSorotan();
  }

  private perbaruiSorotan(): void {
    this.kartu.forEach((kartu, i) => {
      const aktif = i === this.terpilih;
      kartu.setStrokeStyle(aktif ? 2 : 1, aktif ? 0x8fd35d : 0x4a4458);
      kartu.setFillStyle(aktif ? 0x241f33 : 0x1a1626, 0.95);
      this.judulKelas[i].setColor(aktif ? '#8fd35d' : '#e8e4f0');
      this.pratinjau[i].setAlpha(aktif ? 1 : 0.55);
    });
    const config = PLAYER_CLASSES[this.terpilih];
    const skills = config.skills
      .map((id, i) => `[${SKILL_HOTKEYS[i]}] ${getSkill(id).name} - ${getSkill(id).blurb}`)
      .join('\n');
    this.teksDetail.setText(`${config.description}\n${skills}`);
  }

  private kunciPilihan(): void {
    if (this.terkunci) return;
    this.terkunci = true;
    audio.play('upgrade');

    const config = PLAYER_CLASSES[this.terpilih];

    // Kosongkan layar pilihan, lalu mainkan cerita pembuka.
    this.panelDetail.destroy();
    this.kartu.forEach((k) => k.destroy());
    this.children.list
      .filter((c): c is Phaser.GameObjects.Text | Phaser.GameObjects.Sprite =>
        c instanceof Phaser.GameObjects.Text || c instanceof Phaser.GameObjects.Sprite
      )
      .forEach((c) => c.destroy());

    this.add
      .text(this.scale.width / 2, 60, config.name.toUpperCase(), {
        fontFamily: FONT_FAMILY,
        fontSize: '16px',
        color: '#8fd35d',
      })
      .setOrigin(0.5);
    this.add.sprite(this.scale.width / 2, 108, config.texture, 0).setScale(2.4);

    this.dialogue = new DialogueBox(this, config.texture, 'boss-core');
    this.dialogue.play(STORY_INTRO, () => {
      this.scene.start('Game', { classId: config.id });
    });
  }

  override update(_time: number, delta: number): void {
    this.dialogue?.update(delta);
  }
}
