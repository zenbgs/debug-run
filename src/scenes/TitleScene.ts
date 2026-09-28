import Phaser from 'phaser';
import { BIOMES } from '../data/biomes';
import { PLAYER_CLASSES } from '../data/classes';
import { FONT_FAMILY, TILE } from '../data/config';
import { ENEMY_TYPES } from '../data/enemies';
import { Enemy } from '../entities/Enemy';
import { Player } from '../entities/Player';
import { audio } from '../systems/Audio';
import { loadRecords, recordFor } from '../systems/Records';
import { buildArena } from '../systems/ArenaBuilder';
import { isTouchDevice } from '../systems/VirtualInput';
import { TILESET_TEXTURE } from './BootScene';

/** Lapisan tampilan. Arena jadi latar, teks selalu di paling depan. */
const DEPTH = {
  MAP: 0,
  MAKHLUK: 2,
  PEREDUP: 5,
  LOGO: 10,
  TEKS: 12,
} as const;

/**
 * Efek glitch pada logo.
 *
 * Judulnya "DEBUG RUN" dan lawannya adalah bug, jadi logo yang sesekali rusak
 * bukan sekadar hiasan — ia menyampaikan tema game dalam satu pandangan.
 */
const GLITCH = {
  /** Jeda antar kerusakan. Terlalu sering membuatnya jadi kedipan yang melelahkan. */
  JEDA_MS: 2600,
  /** Lama satu kerusakan. Pendek; glitch yang lama terbaca sebagai bug beneran. */
  DURASI_MS: 110,
  /** Geseran maksimum bayangan merah/biru saat rusak. */
  GESER: 4,
  /** Geseran diam — pemisahan warna tipis yang selalu ada. */
  GESER_DIAM: 1,
} as const;

type Makhluk = {
  sprite: Phaser.GameObjects.Sprite;
  /** Kecepatan hanyut, px/detik. */
  vx: number;
  vy: number;
  /** Fase goyangan, supaya tidak seragam. */
  fase: number;
};

/**
 * Layar judul.
 *
 * Selain sebagai pembuka, scene ini punya alasan teknis: browser melarang
 * AudioContext berbunyi sebelum ada interaksi pengguna. Tombol "mulai" di sini
 * adalah gestur yang membuka kunci audio untuk sisa sesi.
 *
 * Latarnya arena sungguhan — tilemap yang sama persis dengan yang dipakai saat
 * bermain, dengan biome acak tiap kali dibuka. Versi sebelumnya berupa panel
 * gelap di ruang hitam berisi tujuh baris daftar kontrol: itu manual, bukan
 * ajakan bermain, dan tidak memperlihatkan satu pun aset game.
 */
export class TitleScene extends Phaser.Scene {
  private makhluk: Makhluk[] = [];
  private logoUtama!: Phaser.GameObjects.Text;
  private logoMerah!: Phaser.GameObjects.Text;
  private logoBiru!: Phaser.GameObjects.Text;
  private sobekan!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('Title');
  }

  /**
   * Teks yang menempel di layar.
   *
   * `addText()` dari `systems/Ui` selalu memasukkan label ke sebuah panel; layar
   * ini sengaja tidak punya panel lagi, jadi teksnya dibuat langsung.
   */
  private teks(
    x: number,
    y: number,
    isi: string,
    ukuran: number,
    warna: string
  ): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, isi, {
        fontFamily: FONT_FAMILY,
        fontSize: `${ukuran}px`,
        color: warna,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.TEKS);
  }

  create(): void {
    const lebar = this.scale.width;
    const cx = lebar / 2;

    // Biome acak tiap kunjungan: layar judul yang selalu sama terasa mati, dan
    // ini memperlihatkan bahwa dunianya memang bermacam-macam.
    const biome = Phaser.Utils.Array.GetRandom([...BIOMES]);
    this.cameras.main.setBackgroundColor(biome.backgroundColor);

    this.bangunLatar(biome);
    this.lepasMakhluk();

    // Peredup: tanpa ini teks hijau bertumpuk dengan rumput dan tidak terbaca.
    this.add
      .rectangle(0, 0, lebar, this.scale.height, 0x0d0b14, 0.62)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(DEPTH.PEREDUP);

    this.bangunLogo(cx);
    this.bangunKelas(cx);
    this.bangunRekor(cx);
    this.bangunAjakan(cx);
    this.pasangMulai();
  }

  // ---------------------------------------------------------------- latar

  /** Tilemap arena sungguhan, digeser pelan supaya layar judul tidak diam. */
  private bangunLatar(biome: (typeof BIOMES)[number]): void {
    const arena = buildArena(TILE, undefined, biome);

    for (const [data, depth] of [
      [arena.ground, DEPTH.MAP],
      [arena.objects, DEPTH.MAP + 1],
    ] as const) {
      const map = this.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
      const tileset = map.addTilesetImage(TILESET_TEXTURE);
      if (!tileset) return;
      const layer = map.createLayer(0, tileset, 0, 0);
      if (!layer) return;
      layer.setDepth(depth);
      // `TilemapLayer` tidak punya komponen Tint; warnanya dipasang per tile.
      layer.forEachTile((t) => {
        t.tint = biome.tint;
      });
    }

    const kamera = this.cameras.main;
    kamera.setBounds(0, 0, arena.widthInPixels, arena.heightInPixels);
    kamera.setScroll(0, (arena.heightInPixels - this.scale.height) / 2);

    // Geser menyilang perlahan, bolak-balik. Cukup untuk terasa hidup, cukup
    // pelan untuk tidak mengganggu pembacaan teks di depannya.
    this.tweens.add({
      targets: kamera,
      scrollX: Math.max(0, arena.widthInPixels - this.scale.width),
      duration: 26000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
    this.tweens.add({
      targets: kamera,
      scrollY: Math.max(0, arena.heightInPixels - this.scale.height),
      duration: 19000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  }

  /**
   * Beberapa musuh berkeliaran di latar.
   *
   * Sengaja TIDAK memakai `Enemy` maupun fisika: mereka cuma hiasan, tidak boleh
   * menabrak apa pun, dan tidak perlu AI. Sprite polos plus hanyutan sinus jauh
   * lebih murah dan tidak bisa bikin scene judul macet.
   */
  private lepasMakhluk(): void {
    Enemy.createAnimations(this);

    const kandidat = ENEMY_TYPES.filter((t) => t.frames > 1);
    const kamera = this.cameras.main;

    for (let i = 0; i < 6; i++) {
      const tipe = Phaser.Utils.Array.GetRandom([...kandidat]);
      const sprite = this.add
        .sprite(
          Phaser.Math.Between(40, kamera.getBounds().width - 40),
          Phaser.Math.Between(40, kamera.getBounds().height - 40),
          tipe.texture,
          0
        )
        .setScale(tipe.scale)
        .setDepth(DEPTH.MAKHLUK)
        .setAlpha(0.9);

      if (tipe.tint !== undefined) sprite.setTint(tipe.tint);
      sprite.play(`${tipe.texture}-idle`);

      this.makhluk.push({
        sprite,
        vx: Phaser.Math.FloatBetween(-14, 14),
        vy: Phaser.Math.FloatBetween(-10, 10),
        fase: Math.random() * Math.PI * 2,
      });
    }
  }

  // ---------------------------------------------------------------- logo

  private bangunLogo(cx: number): void {
    const cy = this.scale.height / 2;
    const y = cy - 58;
    const gaya = { fontFamily: FONT_FAMILY, fontSize: '26px' };

    // Tiga salinan: dua bayangan warna + satu utama. Pemisahan kanal warna
    // adalah tanda visual paling dikenal untuk "sinyal rusak".
    this.logoMerah = this.add
      .text(cx - GLITCH.GESER_DIAM, y, 'DEBUG RUN', { ...gaya, color: '#ff3b5c' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.LOGO)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.logoBiru = this.add
      .text(cx + GLITCH.GESER_DIAM, y, 'DEBUG RUN', { ...gaya, color: '#2bd9ff' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.LOGO)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.logoUtama = this.add
      .text(cx, y, 'DEBUG RUN', { ...gaya, color: '#c8f5a0' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.LOGO + 1);

    // Garis sobek yang menyapu logo saat glitch.
    this.sobekan = this.add
      .rectangle(cx, y, 260, 3, 0xffffff, 0.85)
      .setScrollFactor(0)
      .setDepth(DEPTH.LOGO + 2)
      .setVisible(false);

    this.time.addEvent({
      delay: GLITCH.JEDA_MS,
      loop: true,
      callback: () => this.glitch(cx, y),
    });

    this.teks(cx, cy - 34, 'basmi bug sebelum bug membasmi kamu', 6, '#c9c4d8');
  }

  private glitch(cx: number, y: number): void {
    const geser = () => Phaser.Math.Between(-GLITCH.GESER, GLITCH.GESER);

    this.logoMerah.setPosition(cx + geser(), y + Phaser.Math.Between(-1, 1));
    this.logoBiru.setPosition(cx + geser(), y + Phaser.Math.Between(-1, 1));
    this.logoUtama.setPosition(cx + Phaser.Math.Between(-2, 2), y);

    this.sobekan.setPosition(cx, y + Phaser.Math.Between(-10, 10)).setVisible(true);
    audio.play('hit');

    this.time.delayedCall(GLITCH.DURASI_MS, () => {
      if (!this.scene.isActive()) return;
      this.logoMerah.setPosition(cx - GLITCH.GESER_DIAM, y);
      this.logoBiru.setPosition(cx + GLITCH.GESER_DIAM, y);
      this.logoUtama.setPosition(cx, y);
      this.sobekan.setVisible(false);
    });
  }

  // ---------------------------------------------------------------- isi

  /** Ketiga kelas berjalan di tempat — "kamu bisa jadi salah satu dari ini". */
  private bangunKelas(cx: number): void {
    Player.createAnimations(this);

    const cy = this.scale.height / 2;
    const jarak = 58;
    const kiri = cx - ((PLAYER_CLASSES.length - 1) * jarak) / 2;

    PLAYER_CLASSES.forEach((kelas, i) => {
      const x = kiri + i * jarak;
      const sprite = this.add
        .sprite(x, cy + 10, kelas.texture, 0)
        .setScale(1.8)
        .setScrollFactor(0)
        .setDepth(DEPTH.TEKS);
      sprite.play(`${kelas.texture}-walk-down`);

      // Sprite diskalakan 1,8 dari 32 px, jadi kakinya turun sampai ~cy+39.
      // Label di cy+30 menimpa sepatunya; ini terlihat hanya setelah dipotret.
      this.teks(x, cy + 46, kelas.name.toUpperCase(), 6, '#8fd35d');
    });
  }

  /**
   * Rekor terbaik per kelas. Kelas yang belum pernah dimainkan sengaja dilewati,
   * bukan ditampilkan bernilai nol: pemain baru tidak perlu melihat daftar kosong
   * yang memberi kesan ada sesuatu yang hilang.
   */
  private bangunRekor(cx: number): void {
    const records = loadRecords();
    const baris = PLAYER_CLASSES.map((kelas) => {
      const r = recordFor(records, kelas.id);
      if (!r) return undefined;
      // "~" menandai run yang sempat masuk mode tanpa batas.
      return `${kelas.name.toUpperCase()} ${r.score}${r.endless ? '~' : ''}`;
    }).filter((x): x is string => x !== undefined);

    if (baris.length === 0) return;

    const cy = this.scale.height / 2;
    this.teks(cx, cy + 64, `REKOR  ${baris.join('   ')}`, 6, '#ffe066');
  }

  private bangunAjakan(cx: number): void {
    const cy = this.scale.height / 2;
    const ajakan = this.teks(
      cx,
      cy + 86,
      isTouchDevice() ? 'KETUK UNTUK MULAI' : 'TEKAN SPASI UNTUK MULAI',
      8,
      '#ffe066'
    );

    this.tweens.add({ targets: ajakan, alpha: 0.25, duration: 700, yoyo: true, repeat: -1 });
  }

  private pasangMulai(): void {
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

  override update(_time: number, delta: number): void {
    const dt = delta / 1000;
    const batas = this.cameras.main.getBounds();

    for (const m of this.makhluk) {
      m.fase += dt * 1.6;
      m.sprite.x += (m.vx + Math.cos(m.fase) * 6) * dt;
      m.sprite.y += (m.vy + Math.sin(m.fase) * 6) * dt;

      // Memantul di tepi arena, bukan menghilang — jumlahnya tetap sepanjang waktu.
      if (m.sprite.x < 32 || m.sprite.x > batas.width - 32) m.vx *= -1;
      if (m.sprite.y < 32 || m.sprite.y > batas.height - 32) m.vy *= -1;
      m.sprite.x = Phaser.Math.Clamp(m.sprite.x, 32, batas.width - 32);
      m.sprite.y = Phaser.Math.Clamp(m.sprite.y, 32, batas.height - 32);

      if (Math.abs(m.vx) > 1) m.sprite.setFlipX(m.vx < 0);
    }
  }
}
