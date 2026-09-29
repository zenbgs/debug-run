/**
 * Gambar latar utuh — bukan spritesheet. (SPEC.md §5.2.5)
 *
 * Semuanya **tampak-samping**, jenis aset yang ditolak untuk gameplay sejak M2
 * karena arena harus dilihat dari atas. Layar cerita adalah satu-satunya tempat
 * di mana tampak-samping justru benar: karakternya berdiri menghadap kamera dan
 * tidak ada arena yang perlu dibaca.
 *
 * Dihasilkan `tools/pack_assets.py` (bagian `SALIN`), yang menyalin apa adanya.
 */

export type BackgroundSpec = {
  key: string;
  path: string;
  width: number;
  height: number;
};

export const BACKGROUNDS = {
  /** Kabut + pohon jauh. Lapisan paling belakang, paling lambat bergeser. */
  MIST_BACK: { key: 'bg-mist-back', path: 'assets/bg/bg-mist-back.png', width: 512, height: 224 },
  /** Satu pohon sedang. Diulang beberapa kali sebagai lapisan tengah. */
  MIST_TREES: { key: 'bg-mist-trees', path: 'assets/bg/bg-mist-trees.png', width: 160, height: 224 },
  /** Pohon besar. Bingkai depan di tepi layar. */
  MIST_TREE: { key: 'bg-mist-tree', path: 'assets/bg/bg-mist-tree.png', width: 336, height: 224 },
  /** Bebatuan. Alas tempat karakter berdiri. */
  MIST_ROCKS: { key: 'bg-mist-rocks', path: 'assets/bg/bg-mist-rocks.png', width: 208, height: 224 },
} as const satisfies Record<string, BackgroundSpec>;

export const ALL_BACKGROUNDS: readonly BackgroundSpec[] = Object.values(BACKGROUNDS);
