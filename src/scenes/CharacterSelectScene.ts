import Phaser from 'phaser';
import { PLAYER_CLASSES } from '../data/classes';
import { getSkill, SKILL_HOTKEYS } from '../data/skills';
import { FONT_FAMILY } from '../data/config';
import { STORY_INTRO } from '../data/story';
import { Player } from '../entities/Player';
import { audio } from '../systems/Audio';
import { isTouchDevice } from '../systems/VirtualInput';
import { DialogueBox } from '../systems/DialogueBox';
import { StoryStage } from '../systems/StoryStage';
import { createPanel, UI_DEPTH, type PanelHandle } from '../systems/Ui';

/**
 * Tata letak layar pilih kelas, dalam piksel logis.
 *
 * Lebar logis berubah mengikuti rasio layar perangkat (420-640), jadi lebar
 * kartu dan panel DIHITUNG, bukan konstanta. Versi sebelumnya memakai 144 px per
 * kartu dan panel 452 px tetap; di layar logis tersempit keduanya meluber.
 */
const TATA = {
  CARD_MAX_WIDTH: 144,
  CARD_GAP: 8,
  /** Sisa ruang di kiri dan kanan deretan kartu. */
  MARGIN: 12,
  CARD_HEIGHT: 118,
  CARD_CENTER_Y: 96,

  PANEL_MAX_WIDTH: 452,
  PANEL_MIN_HEIGHT: 62,
  /**
   * Panel detail ditambatkan dari BAWAH, bukan dari titik tengah.
   *
   * Tingginya mengikuti teks terpanjang, dan teks itu membungkus lebih banyak
   * baris di layar sempit. Kalau ditambatkan di tengah, panel yang tumbuh akan
   * naik menabrak kartu di atasnya.
   */
  PANEL_BOTTOM_Y: 230,

  BARIS_KONTROL_Y: 242,
  BARIS_PETUNJUK_Y: 256,
} as const;

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
  private panggung?: StoryStage;
  private terkunci = false;

  constructor() {
    super('CharacterSelect');
  }

  create(): void {
    this.terpilih = 0;
    this.terkunci = false;
    this.panggung = undefined;
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
    const ruang = this.scale.width - TATA.MARGIN * 2 - (total - 1) * TATA.CARD_GAP;
    const lebarKartu = Math.min(TATA.CARD_MAX_WIDTH, Math.floor(ruang / total));
    const lebarTotal = total * lebarKartu + (total - 1) * TATA.CARD_GAP;
    const kiri = cx - lebarTotal / 2;

    PLAYER_CLASSES.forEach((config, i) => {
      const x = kiri + i * (lebarKartu + TATA.CARD_GAP) + lebarKartu / 2;
      const y = TATA.CARD_CENTER_Y;

      const kartu = this.add
        .rectangle(x, y, lebarKartu, TATA.CARD_HEIGHT, 0x1a1626, 0.95)
        .setStrokeStyle(1, 0x4a4458);
      this.kartu.push(kartu);

      // Pratinjau memakai animasi jalan supaya kartunya terasa hidup.
      const sprite = this.add.sprite(x, y - 42, config.texture, 0).setScale(1.6);
      sprite.play(`${config.texture}-walk-down`);
      this.pratinjau.push(sprite);

      const judul = this.add
        .text(x, y - 4, config.name, {
          fontFamily: FONT_FAMILY,
          fontSize: '9px',
          color: '#e8e4f0',
        })
        .setOrigin(0.5);
      this.judulKelas.push(judul);

      this.add
        .text(x, y + 8, config.title, {
          fontFamily: FONT_FAMILY,
          fontSize: '6px',
          color: '#8f88a8',
        })
        .setOrigin(0.5);

      this.add
        .text(x, y + 22, config.highlights.join('\n'), {
          fontFamily: FONT_FAMILY,
          fontSize: '6px',
          color: '#c9c4d8',
          align: 'center',
          lineSpacing: 5,
          // Ikut lebar kartu yang dihitung, bukan konstanta: di layar logis
          // sempit kartunya menyusut dan teks ini harus ikut membungkus.
          wordWrap: { width: lebarKartu - 12 },
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

    const lebarPanel = Math.min(TATA.PANEL_MAX_WIDTH, this.scale.width - TATA.MARGIN * 2);
    const gayaDetail = {
      fontFamily: FONT_FAMILY,
      fontSize: '6px',
      color: '#c9c4d8',
      align: 'center',
      lineSpacing: 3,
      // WAJIB. Tanpa ini deskripsi Mage — satu kalimat 135 karakter — terukur
      // melebar 756 px di layar 480 px dan meluber keluar di kedua sisi.
      wordWrap: { width: lebarPanel - 24 },
    } as const;

    // Tinggi panel diukur dari teks TERPANJANG di antara semua kelas, bukan dari
    // kelas yang kebetulan terpilih: panel yang tumbuh-menyusut saat pemain
    // berpindah kartu terlihat goyah, dan di layar sempit teksnya menembus bingkai.
    const penggaris = this.add.text(0, 0, '', gayaDetail).setVisible(false);
    let tinggiTeks = 0;
    for (const c of PLAYER_CLASSES) {
      penggaris.setText(this.detailUntuk(c));
      tinggiTeks = Math.max(tinggiTeks, penggaris.height);
    }
    penggaris.destroy();

    const tinggiPanel = Math.max(TATA.PANEL_MIN_HEIGHT, Math.ceil(tinggiTeks) + 16);
    const pusatPanel = TATA.PANEL_BOTTOM_Y - tinggiPanel / 2;

    this.panelDetail = createPanel(this, lebarPanel, tinggiPanel, pusatPanel);
    this.teksDetail = this.add.text(cx, pusatPanel, '', gayaDetail).setOrigin(0.5);
    this.panelDetail.container.add(this.teksDetail);

    // Daftar kontrol dipindah ke sini dari layar judul: di sana ia jadi hal
    // pertama yang dilihat orang — tujuh baris manual sebelum sempat tertarik.
    // Di sini pemain memang sudah berhenti untuk membaca.
    // Depth eksplisit: panel detail memakai `UI_DEPTH.PANEL` (200), sedangkan
    // teks biasa lahir di depth 0 — dua baris di bawah ini sempat tertimbun
    // sepenuhnya di balik panel.
    this.add
      .text(
        cx,
        TATA.BARIS_KONTROL_Y,
        isTouchDevice()
          ? 'stik kiri gerak   J pukul   K L skill   >> dash'
          : 'WASD gerak   J pukul   K L skill   SPASI dash   ESC jeda',
        { fontFamily: FONT_FAMILY, fontSize: '6px', color: '#8fd35d' }
      )
      .setOrigin(0.5)
      .setDepth(UI_DEPTH.TEXT);

    this.add
      .text(
        cx,
        TATA.BARIS_PETUNJUK_Y,
        isTouchDevice() ? 'ketuk kartu untuk memilih' : 'panah kiri/kanan pilih  -  ENTER mulai',
        { fontFamily: FONT_FAMILY, fontSize: '7px', color: '#ffe066' }
      )
      .setOrigin(0.5)
      .setDepth(UI_DEPTH.TEXT);

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
    this.teksDetail.setText(this.detailUntuk(PLAYER_CLASSES[this.terpilih]));
  }

  /** Isi panel detail: deskripsi kelas, lalu sebaris per skill. */
  private detailUntuk(config: (typeof PLAYER_CLASSES)[number]): string {
    const skills = config.skills
      .map((id, i) => `[${SKILL_HOTKEYS[i]}] ${getSkill(id).name} - ${getSkill(id).blurb}`)
      .join('\n');
    return `${config.description}\n${skills}`;
  }

  private kunciPilihan(): void {
    if (this.terkunci) return;
    this.terkunci = true;
    audio.play('upgrade');

    const config = PLAYER_CLASSES[this.terpilih];

    // Kosongkan layar pilihan, lalu bangun panggung cerita.
    this.panelDetail.destroy();
    this.kartu.forEach((k) => k.destroy());
    this.children.list
      .filter((c): c is Phaser.GameObjects.Text | Phaser.GameObjects.Sprite =>
        c instanceof Phaser.GameObjects.Text || c instanceof Phaser.GameObjects.Sprite
      )
      .forEach((c) => c.destroy());

    // Hutan berkabut berlapis menggantikan latar hitam pekat. Karakternya
    // berjalan di tempat, bukan berdiri kaku — lihat catatan di StoryStage.
    this.panggung = new StoryStage(this);
    this.panggung.tampilkanKarakter(config.texture, `${config.texture}-walk-down`);
    this.panggung.tampilkanNama(config.name.toUpperCase());

    this.dialogue = new DialogueBox(this, config.texture, 'boss-core');
    this.dialogue.play(STORY_INTRO, () => {
      this.scene.start('Game', { classId: config.id });
    });
  }

  override update(_time: number, delta: number): void {
    this.panggung?.update(delta);
    this.dialogue?.update(delta);

    // Karakter menyala saat dialah yang bicara, meredup saat narator atau tokoh
    // lain. Tanpa ini adegannya cuma gambar diam dengan teks yang berganti.
    const baris = this.dialogue?.currentLine;
    if (baris) this.panggung?.sorotKarakter(baris.portrait === 'player');
  }
}
