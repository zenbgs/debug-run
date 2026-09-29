import Phaser from 'phaser';
import { BACKGROUNDS } from '../data/backgrounds';
import { FONT_FAMILY } from '../data/config';

/**
 * Panggung untuk adegan cerita. (SPEC.md §5.2.5)
 *
 * Sebelumnya layar cerita pembuka hanyalah latar hitam pekat dengan satu sprite
 * berdiri tegak dan kotak teks di bawahnya — tidak ada kedalaman, tidak ada
 * gerak, dan tidak ada nuansa fantasi sama sekali.
 *
 * Sekarang ia hutan berkabut berlapis yang bergeser dengan **parallax**: lapisan
 * jauh merayap pelan, lapisan depan lebih cepat. Itu satu-satunya hal yang
 * benar-benar menciptakan kesan ruang pada gambar diam.
 *
 * Panggung ini TIDAK tahu apa-apa soal naskah. Ia hanya menyediakan latar,
 * sorotan, dan tempat berdiri; `DialogueBox` tetap yang mengurus teksnya.
 */

const PANGGUNG = {
  /** Tinggi asli semua lapisan latar. */
  TINGGI_ASLI: 224,
  /**
   * Garis tanah, diukur dari tepi ATAS layar sebagai rasio tinggi.
   * Karakter berdiri di sini, dan lapisan latar disejajarkan padanya.
   *
   * Harus cukup tinggi supaya seluruh badan karakter berada di ATAS kotak
   * dialog. Kotak itu tingginya 86 px dengan margin 10, jadi tepi atasnya di
   * 270-96 = 174; versi pertama menaruh kaki di 195 dan setengah badan
   * karakternya tertutup panel.
   */
  GARIS_TANAH: 0.57,

  /** Kecepatan geser tiap lapisan, px per detik. Makin depan makin cepat. */
  LAJU_BACK: 3,
  LAJU_TREES: 7,
  LAJU_DEPAN: 13,

  /** Peredup supaya teks putih tetap terbaca di atas kabut terang. */
  REDUP: 0.42,

  /**
   * Warna dasar, diambil dari piksel terbawah `bg-mist-back` (#457277).
   *
   * Lapisan latar tingginya persis setinggi layar tapi ditambatkan pada garis
   * tanah, jadi bagian bawah layar TIDAK tertutup — terukur kosong dari y=192
   * ke bawah. Di layar 480 px celah itu tersembunyi di balik kotak dialog; di
   * 640 px ia terlihat sebagai pita hitam melintang. Lapisan isian ini menutup
   * seluruh layar lebih dulu, jadi celah di mana pun tidak pernah jadi lubang.
   */
  WARNA_DASAR: 0x457277,

  JUMLAH_DEBU: 20,
  DEBU_LAJU_MIN: 4,
  DEBU_LAJU_MAKS: 14,
} as const;

const DEPTH = {
  DASAR: -1,
  BACK: 0,
  TREES: 1,
  DEPAN: 2,
  REDUP: 5,
  KARAKTER: 8,
  DEBU: 9,
  TEKS: 12,
} as const;

type Debu = {
  sprite: Phaser.GameObjects.Arc;
  vx: number;
  vy: number;
  fase: number;
};

export type StageOptions = {
  /**
   * Depth dasar. Nol untuk scene yang memang kosong (layar pilih kelas), tapi
   * WAJIB di atas segalanya kalau panggung dipakai sebagai lapisan di atas
   * permainan yang sedang berjalan.
   */
  depthBase?: number;
  /** Tint semua lapisan latar. `0xffffff` = warna asli. */
  tint?: number;
};

export class StoryStage {
  private readonly lapisan: { obj: Phaser.GameObjects.TileSprite; laju: number }[] = [];
  private readonly debu: Debu[] = [];
  private karakter?: Phaser.GameObjects.Sprite;
  private sorotan?: Phaser.GameObjects.Arc;
  private karakterAktif = true;

  /** Semua objek yang dibuat panggung ini, untuk dibongkar sekaligus. */
  private readonly dibuat: Phaser.GameObjects.GameObject[] = [];
  private readonly base: number;

  constructor(
    private readonly scene: Phaser.Scene,
    opsi: StageOptions = {}
  ) {
    this.base = opsi.depthBase ?? 0;
    const tint = opsi.tint ?? 0xffffff;
    const lebar = scene.scale.width;
    const tinggi = scene.scale.height;

    // Lapisan diskalakan dari tinggi aslinya supaya garis tanahnya pas, bukan
    // diregangkan ke ukuran layar — meregangkan pixel art merusak pikselnya.
    const skala = tinggi / PANGGUNG.TINGGI_ASLI;
    const bawah = tinggi * PANGGUNG.GARIS_TANAH;

    // Hanya area di BAWAH garis tanah yang perlu ditutup, bukan seluruh layar:
    // isian selebar layar penuh menambah satu lagi pengisian penuh dan terukur
    // menurunkan fps dari 54 ke 47 di render perangkat lunak.
    this.catat(
      scene.add
      .rectangle(0, bawah - 2, lebar, tinggi - bawah + 2, PANGGUNG.WARNA_DASAR)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(this.base + DEPTH.DASAR)
    );

    const tambah = (
      spec: { key: string; width: number; height: number },
      depth: number,
      laju: number,
      alpha = 1
    ) => {
      // `TileSprite` dipakai supaya lapisannya BERULANG mulus saat digeser.
      // Sprite biasa akan menyisakan lubang begitu bergeser melewati tepinya.
      const obj = scene.add
        // Lebarnya PAS menutup layar. Versi pertama menambahkan `spec.width`
        // lagi di atasnya, jadi tiap lapisan digambar hampir dua kali lebih
        // lebar dari yang terlihat — fill rate terbuang percuma.
        .tileSprite(0, 0, Math.ceil(lebar / skala) + 2, spec.height, spec.key)
        .setOrigin(0, 0)
        .setScale(skala)
        .setScrollFactor(0)
        .setDepth(this.base + depth)
        .setAlpha(alpha)
        .setTint(tint);
      this.catat(obj);
      // Sejajarkan dasar gambar dengan garis tanah.
      obj.setY(bawah - spec.height * skala * 0.86);
      this.lapisan.push({ obj, laju });
      return obj;
    };

    tambah(BACKGROUNDS.MIST_BACK, DEPTH.BACK, PANGGUNG.LAJU_BACK);
    tambah(BACKGROUNDS.MIST_TREES, DEPTH.TREES, PANGGUNG.LAJU_TREES, 0.85);

    // Pohon besar jadi BINGKAI di kedua tepi, bukan lapisan bergulir melintang.
    // Dua alasan: komposisinya lebih terarah — mata digiring ke tengah tempat
    // karakter berdiri — dan satu `TileSprite` selebar layar berkurang, yang
    // terasa nyata di render perangkat lunak (terukur 50 -> 58 fps).
    for (const sisi of [-1, 1]) {
      const pohon = scene.add
        .image(
          sisi < 0 ? -18 : lebar + 18,
          bawah + 8,
          BACKGROUNDS.MIST_TREE.key
        )
        .setOrigin(sisi < 0 ? 0 : 1, 1)
        .setScale(skala * 1.1)
        .setFlipX(sisi > 0)
        .setScrollFactor(0)
        .setDepth(this.base + DEPTH.DEPAN)
        .setAlpha(0.92)
        .setTint(tint);
      this.catat(pohon);
    }

    // Bebatuan sebagai alas — tidak bergeser, supaya karakter terasa benar-benar
    // berpijak dan tidak melayang di atas latar yang bergerak.
    this.catat(
      scene.add
        .image(lebar / 2, bawah + 10, BACKGROUNDS.MIST_ROCKS.key)
        .setOrigin(0.5, 0.74)
        .setScale(skala * 1.15)
        .setScrollFactor(0)
        .setDepth(this.base + DEPTH.DEPAN)
        .setTint(tint)
    );

    this.catat(
      scene.add
        .rectangle(0, 0, lebar, tinggi, 0x0d0b14, PANGGUNG.REDUP)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(this.base + DEPTH.REDUP)
    );

    this.buatDebu(lebar, tinggi);
  }

  /** Bintik cahaya melayang. Gerak halus di latar membuat adegan terasa bernapas. */
  private buatDebu(lebar: number, tinggi: number): void {
    for (let i = 0; i < PANGGUNG.JUMLAH_DEBU; i++) {
      const sprite = this.scene.add
        .circle(
          Phaser.Math.Between(0, lebar),
          Phaser.Math.Between(0, tinggi),
          Phaser.Math.FloatBetween(0.6, 1.6),
          0xc8f5a0,
          Phaser.Math.FloatBetween(0.25, 0.7)
        )
        .setScrollFactor(0)
        .setDepth(this.base + DEPTH.DEBU);
      this.catat(sprite);

      this.debu.push({
        sprite,
        vx: Phaser.Math.FloatBetween(-PANGGUNG.DEBU_LAJU_MAKS, -PANGGUNG.DEBU_LAJU_MIN),
        vy: Phaser.Math.FloatBetween(-6, -2),
        fase: Math.random() * Math.PI * 2,
      });
    }
  }

  /**
   * Taruh karakter di panggung, lengkap dengan sorotan dan gerak napas.
   *
   * @param animKey animasi jalan di tempat; kalau kosong, sprite diam.
   */
  tampilkanKarakter(
    texture: string,
    animKey?: string,
    /**
     * Tinggi tampil yang diinginkan, dalam piksel logis.
     *
     * Skalanya DIHITUNG dari tinggi frame, bukan angka tetap: sprite pemain 32 px
     * dan sprite boss 144 px, jadi satu skala tetap akan membuat salah satunya
     * sebesar kuku atau memenuhi seluruh layar.
     */
    tinggiTarget = 92
  ): Phaser.GameObjects.Sprite {
    const lebar = this.scene.scale.width;
    const bawah = this.scene.scale.height * PANGGUNG.GARIS_TANAH;

    // Sorotan lembut di belakang karakter: tanpa ini sprite 32 px tenggelam di
    // latar yang ramai dan mata tidak tahu harus melihat ke mana.
    this.sorotan = this.scene.add
      .circle(lebar / 2, bawah - 34, 46, 0xc8f5a0, 0.1)
      .setScrollFactor(0)
      .setDepth(this.base + DEPTH.KARAKTER - 1);
    this.catat(this.sorotan);
    this.scene.tweens.add({
      targets: this.sorotan,
      scale: 1.12,
      alpha: 0.16,
      duration: 1900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });

    // Origin di KAKI (0.5, 1), bukan di tengah: dengan origin tengah, posisi
    // kakinya bergantung pada skala dan harus dihitung ulang tiap kali skalanya
    // berubah — dan justru itu yang membuat versi pertama tertelan kotak dialog.
    this.karakter = this.scene.add
      .sprite(lebar / 2, bawah, texture, 0)
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(this.base + DEPTH.KARAKTER);
    const tinggiFrame = this.karakter.frame.height || 32;
    this.karakter.setScale(tinggiTarget / tinggiFrame);
    this.catat(this.karakter);

    if (animKey && this.scene.anims.exists(animKey)) this.karakter.play(animKey);

    // Napas: naik-turun 2 px. Sprite yang benar-benar diam terlihat seperti
    // gambar tempel, bukan tokoh yang sedang mendengarkan.
    this.scene.tweens.add({
      targets: this.karakter,
      y: this.karakter.y - 2,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });

    return this.karakter;
  }

  /** Nama kelas di atas karakter. */
  tampilkanNama(teks: string): void {
    const lebar = this.scene.scale.width;
    const bawah = this.scene.scale.height * PANGGUNG.GARIS_TANAH;

    const label = this.scene.add
      .text(lebar / 2, bawah - 108, teks, {
        fontFamily: FONT_FAMILY,
        fontSize: '14px',
        color: '#c8f5a0',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(this.base + DEPTH.TEKS)
      .setAlpha(0);
    this.catat(label);

    this.scene.tweens.add({ targets: label, alpha: 1, y: bawah - 112, duration: 600 });
  }

  /**
   * Terangkan karakter saat dialah yang bicara, redupkan saat orang lain.
   *
   * Ini yang membuat adegannya terasa DIPENTASKAN, bukan sekadar gambar diam
   * dengan teks berganti: mata pemain diarahkan ke siapa yang sedang berbicara.
   */
  sorotKarakter(aktif: boolean): void {
    if (!this.karakter || this.karakterAktif === aktif) return;
    this.karakterAktif = aktif;

    this.scene.tweens.add({
      targets: this.karakter,
      alpha: aktif ? 1 : 0.55,
      duration: 260,
    });
    if (this.sorotan) {
      this.scene.tweens.add({
        targets: this.sorotan,
        fillAlpha: aktif ? 0.18 : 0.06,
        duration: 260,
      });
    }
  }

  private catat<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.dibuat.push(obj);
    return obj;
  }

  /**
   * Bongkar seluruh panggung.
   *
   * Wajib dipanggil kalau panggung dipakai sebagai lapisan di atas permainan —
   * scene-nya tidak berakhir, jadi objeknya tidak akan dibersihkan sendiri dan
   * akan menutupi arena selamanya.
   */
  destroy(): void {
    for (const obj of this.dibuat) {
      this.scene.tweens.killTweensOf(obj);
      obj.destroy();
    }
    this.dibuat.length = 0;
    this.lapisan.length = 0;
    this.debu.length = 0;
    this.karakter = undefined;
    this.sorotan = undefined;
  }

  /** Dipanggil tiap frame oleh scene pemilik. */
  update(delta: number): void {
    const dt = delta / 1000;

    for (const { obj, laju } of this.lapisan) {
      // `tilePositionX` menggeser isinya, bukan objeknya — inilah yang membuat
      // pengulangannya mulus tanpa celah di tepi.
      obj.tilePositionX += laju * dt;
    }

    const lebar = this.scene.scale.width;
    const tinggi = this.scene.scale.height;
    for (const d of this.debu) {
      d.fase += dt;
      d.sprite.x += (d.vx + Math.sin(d.fase) * 3) * dt;
      d.sprite.y += d.vy * dt;

      // Melingkar: keluar kiri masuk kanan, keluar atas masuk bawah.
      if (d.sprite.x < -4) d.sprite.x = lebar + 4;
      if (d.sprite.y < -4) d.sprite.y = tinggi + 4;
    }
  }
}
