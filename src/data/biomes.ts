/**
 * Biome arena — tiap wave main di tempat yang berbeda. (SPEC.md §7.2)
 *
 * ⚠️ Legacy Collection hanya punya **satu** tileset tampak-atas
 * (`TinyRPG/Environments/Overworld`). Semua environment lain — Gothicvania
 * (rocky, castle, grunge), Misc/colorful, Warped/alien — adalah tileset
 * platformer tampak-samping: tanah di bawah, langit di atas. Gugur dengan alasan
 * yang sama seperti roster musuh di M2 dan sprite boss di M5.
 * `Warped/top-down-space-environment` memang tampak-atas, tapi isinya gambar
 * latar nebula dan sprite asteroid lepas, bukan grid tile.
 *
 * Jadi biome disusun dari **palet tile berbeda di dalam satu tileset itu**, yang
 * ternyata memang memuat pasir, air, bata, dan batu — bukan rumput saja. Dua
 * biome terakhir memakai palet yang sama dengan yang lebih awal tapi diberi
 * tint, supaya sepuluh wave tidak kehabisan variasi.
 *
 * Semua index tile di sini diambil dari `tiles.ts`, yang setiap nilainya sudah
 * diukur opaque penuh. Jangan menambah index mentah langsung ke berkas ini.
 */

import { FLOOR, PROP, WALL } from './tiles';

export type Biome = {
  id: string;
  /** Nama yang tampil di banner wave. */
  name: string;
  /** Tile lantai + bobot kemunculan. Wajib opaque penuh. */
  floorWeights: ReadonlyArray<readonly [number, number]>;
  /** Tile tembok pembatas. Satu nilai saja lebih terbaca sebagai "tidak bisa dilewati". */
  wallVariants: readonly number[];
  /** Prop rintangan besar — dipakai gerombolan batu di sudut. */
  rockProps: readonly number[];
  /** Prop pemecah garis pandang — dipakai rumpun di tengah. */
  foliageProps: readonly number[];
  /**
   * Tint layer tilemap. `0xffffff` berarti warna asli.
   *
   * Ingat tint di Phaser adalah **perkalian**: ia hanya bisa menggelapkan atau
   * menggeser warna ke bawah, tidak pernah mencerahkan. Nilai di bawah dipilih
   * dengan itu sebagai dasar, bukan ditebak.
   */
  tint: number;
  /** Warna latar scene, terlihat di luar tepi arena. */
  backgroundColor: string;
};

const HIJAU_ASLI = 0xffffff;

export const BIOMES: readonly Biome[] = [
  {
    id: 'padang',
    name: 'PADANG ARSIP',
    floorWeights: [
      [FLOOR.GRASS, 82],
      [FLOOR.GRASS_ALT, 14],
      [FLOOR.GRASS_PLANT, 4],
    ],
    wallVariants: [WALL.FOREST_DARK],
    rockProps: [PROP.ROCK],
    foliageProps: [PROP.TREE, PROP.BUSH],
    tint: HIJAU_ASLI,
    backgroundColor: '#0d0b14',
  },
  {
    id: 'gurun',
    name: 'GURUN RETAK',
    // Pasir murni cuma satu tile di seluruh tileset, jadi lantainya seragam.
    // Variasi datang dari prop batu, bukan dari lantai.
    floorWeights: [[FLOOR.SAND, 100]],
    wallVariants: [WALL.STONE_DARKER],
    rockProps: [PROP.ROCK, PROP.CRAG],
    foliageProps: [PROP.ROCK, PROP.BOULDER],
    tint: HIJAU_ASLI,
    backgroundColor: '#1a1206',
  },
  {
    id: 'reruntuhan',
    name: 'RERUNTUHAN',
    floorWeights: [
      [FLOOR.BRICK_A, 40],
      [FLOOR.BRICK_B, 35],
      [FLOOR.BRICK_C, 25],
    ],
    wallVariants: [WALL.STONE_DARK],
    rockProps: [PROP.ROCK, PROP.BOULDER],
    foliageProps: [PROP.CRAG, PROP.ROCK],
    // Lantai bata aslinya oranye menyala dan meramaikan layar sampai sprite
    // pemain sulit dibaca. Tint dingin ini menurunkan rasio merah:biru dari
    // 2,22 ke 1,52 dan menggelapkannya — jadi batu tua, bukan bata baru.
    tint: 0x90a8d0,
    backgroundColor: '#140d08',
  },
  {
    id: 'rawa',
    name: 'RAWA BANGKAI',
    floorWeights: [
      [FLOOR.WATER, 88],
      [FLOOR.WATER_ALT, 12],
    ],
    wallVariants: [WALL.FOREST_DENSE],
    rockProps: [PROP.ROCK],
    foliageProps: [PROP.REED, PROP.BUSH, PROP.TREE],
    tint: HIJAU_ASLI,
    backgroundColor: '#061018',
  },
  {
    id: 'padang-malam',
    name: 'PADANG MALAM',
    floorWeights: [
      [FLOOR.GRASS, 82],
      [FLOOR.GRASS_ALT, 14],
      [FLOOR.GRASS_PLANT, 4],
    ],
    wallVariants: [WALL.FOREST_DARK],
    rockProps: [PROP.ROCK],
    foliageProps: [PROP.TREE, PROP.BUSH],
    // Dihitung, bukan ditebak. Tint = perkalian, jadi ia tidak bisa MENAMBAH biru
    // yang tidak ada di rumput (B=76 vs G=171). Supaya biru menang, rasio
    // tintG/tintB harus di bawah 171/76 -> 0,44. Percobaan pertama (0x5a72b8)
    // melanggar itu dan hasilnya hijau gelap, bukan malam.
    // Terukur: rumput (141,171,76) -> (29,44,70), biru dominan.
    tint: 0x3643eb,
    backgroundColor: '#05060f',
  },
  {
    id: 'kekosongan',
    name: 'KEKOSONGAN',
    floorWeights: [
      [FLOOR.BRICK_A, 40],
      [FLOOR.BRICK_B, 35],
      [FLOOR.BRICK_C, 25],
    ],
    wallVariants: [WALL.STONE_DARK],
    rockProps: [PROP.ROCK, PROP.BOULDER],
    foliageProps: [PROP.CRAG, PROP.ROCK],
    // Masalah yang sama seperti padang malam: bata (120,84,54) nyaris tak punya
    // biru, jadi ungu hanya muncul kalau kanal biru dibiarkan utuh sementara
    // merah dan hijau ditekan. Terukur: -> (35,22,54), biru di atas merah.
    tint: 0x4c43ff,
    backgroundColor: '#0a0614',
  },
];

export const BIOME_BY_ID = new Map(BIOMES.map((b) => [b.id, b]));

/**
 * Biome per nomor wave. Sengaja ditulis eksplisit, bukan dihitung dari rumus —
 * urutannya adalah keputusan desain: tiap biome bertahan dua wave supaya sempat
 * dikenali, dan wave boss dapat tempatnya sendiri.
 */
export const BIOME_BY_WAVE: Readonly<Record<number, string>> = {
  1: 'padang',
  2: 'padang',
  3: 'gurun',
  4: 'gurun',
  5: 'reruntuhan',
  6: 'rawa',
  7: 'rawa',
  8: 'padang-malam',
  9: 'padang-malam',
  10: 'kekosongan',
};

/**
 * Biome untuk sebuah nomor wave.
 *
 * Wave di luar peta (mode tanpa batas, wave 11 ke atas) **memutar** seluruh
 * daftar biome. Versi sebelumnya jatuh ke `BIOMES[0]`, yang berarti seluruh mode
 * tanpa batas — bagian terpanjang dari sebuah run — dimainkan di padang rumput
 * yang sama persis.
 */
export function biomeForWave(waveNumber: number): Biome {
  const id = BIOME_BY_WAVE[waveNumber];
  const bernaskah = id ? BIOME_BY_ID.get(id) : undefined;
  if (bernaskah) return bernaskah;

  const indeks = Math.max(0, Math.floor(waveNumber) - 1) % BIOMES.length;
  return BIOMES[indeks];
}
