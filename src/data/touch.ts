/**
 * Tata letak kontrol layar sentuh. Semua koordinat dalam piksel logis (480x270),
 * sama seperti sisa UI. (SPEC.md §8.1)
 *
 * Aturan penempatan: jempol kiri hanya untuk gerak, jempol kanan hanya untuk aksi,
 * dan tidak ada tombol di sepertiga atas layar — di situ letak HUD, dan jempol
 * yang menutupinya membuat HP tidak terbaca justru saat paling dibutuhkan.
 */

export const TOUCH = {
  /**
   * Stik muncul di tempat jempol menyentuh, bukan di posisi tetap.
   *
   * Stik tetap memaksa pemain mencari-cari posisinya tanpa melihat; stik
   * mengambang selalu pas di bawah jempol. Ini standar di game aksi mobile.
   */
  STICK: {
    /** Jarak knob maksimum dari titik tengah. */
    RADIUS: 30,
    KNOB_RADIUS: 13,
    /**
     * Geser di bawah ini dianggap diam. Tanpa ini jempol yang hanya menempel
     * membuat karakter merayap sendiri.
     */
    DEADZONE: 5,
    /** Batas kanan zona stik, sebagai rasio lebar layar. */
    ZONE_RATIO: 0.5,
    /** Jarak minimum titik tengah dari tepi layar, supaya lingkarannya utuh. */
    EDGE_MARGIN: 36,
  },

  /**
   * Tombol aksi, disusun mengikuti lengkungan jempol kanan.
   * `label` sengaja memakai huruf tombol keyboard yang sama supaya pemain yang
   * pindah perangkat tidak perlu belajar ulang.
   */
  BUTTONS: [
    { id: 'attack', label: 'J', x: 420, y: 222, radius: 27 },
    { id: 'skill1', label: 'K', x: 366, y: 206, radius: 19 },
    { id: 'skill2', label: 'L', x: 424, y: 166, radius: 19 },
    { id: 'dash', label: '>>', x: 312, y: 236, radius: 21 },
  ],

  /** Tombol jeda, jauh dari jempol supaya tidak tertekan tak sengaja. */
  PAUSE: { x: 462, y: 16, radius: 12 },

  /**
   * Transparansi saat tidak ditekan. Ini SATU-SATUNYA pengatur transparansi
   * tombol — bentuknya dibuat dengan alpha 1.
   *
   * Versi pertama memakai `add.circle(..., 0.55)` lalu `setAlpha(0.34)`; Phaser
   * mengalikan keduanya, jadi transparansi sebenarnya 0,19 dan tombolnya nyaris
   * tak terlihat di atas rumput terang. Terlihat hanya setelah dipotret.
   */
  ALPHA_IDLE: 0.5,
  ALPHA_ACTIVE: 0.95,

  COLOR_BASE: 0x0d0b14,
  COLOR_EDGE: 0x8fd35d,
  COLOR_KNOB: 0x8fd35d,
  /** Label dibuat putih, bukan hijau: hijau di atas rumput tidak terbaca. */
  COLOR_LABEL: '#ffffff',

  /**
   * Di atas HUD (100) tapi di BAWAH panel UI (`UI_DEPTH.PANEL` = 200) dan kotak
   * dialog (300). Kalau disamakan dengan panel, tombol tembus menimpa teks
   * upgrade dan layar akhir.
   */
  DEPTH: 150,

  /**
   * Jumlah sentuhan bersamaan yang dilacak. Phaser default hanya 2 (mouse + 1);
   * stik + serang + dash saja sudah tiga jari.
   */
  MAX_POINTERS: 4,
} as const;
