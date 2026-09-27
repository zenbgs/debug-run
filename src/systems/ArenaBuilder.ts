import { ARENA } from '../data/config';
import { EMPTY, FLOOR_WEIGHTS, PROP, WALL_VARIANTS } from '../data/tiles';

/** PRNG mulberry32 — deterministik, supaya arena identik tiap run. */
function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted(rng: () => number, weights: ReadonlyArray<readonly [number, number]>): number {
  const total = weights.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng() * total;
  for (const [value, weight] of weights) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return weights[0][0];
}

type Cluster = {
  /** Titik tengah cluster, dalam tile. */
  cx: number;
  cy: number;
  /** Sebaran prop di sekitar titik tengah, dalam tile. */
  spread: number;
  count: number;
  tiles: readonly number[];
};

/**
 * Rintangan interior. Titik tengah sengaja hard-coded (bukan acak) supaya bentuk
 * arena bisa di-tune tangan, tapi sebaran propnya acak-berseed supaya terlihat
 * natural, bukan kotak-kotak. (SPEC.md §7)
 */
const CLUSTERS: readonly Cluster[] = [
  // Empat gerombolan batu di sudut-dalam — cover dari proyektil.
  { cx: 8, cy: 7, spread: 2, count: 5, tiles: [PROP.ROCK] },
  { cx: 31, cy: 7, spread: 2, count: 5, tiles: [PROP.ROCK] },
  { cx: 8, cy: 22, spread: 2, count: 5, tiles: [PROP.ROCK] },
  { cx: 31, cy: 22, spread: 2, count: 5, tiles: [PROP.ROCK] },
  // Dua rumpun pohon kiri-kanan tengah — memecah garis pandang.
  { cx: 13, cy: 15, spread: 2, count: 7, tiles: [PROP.TREE, PROP.BUSH] },
  { cx: 26, cy: 15, spread: 2, count: 7, tiles: [PROP.TREE, PROP.BUSH] },
  // Rumpun atas & bawah tengah.
  { cx: 20, cy: 8, spread: 2, count: 4, tiles: [PROP.TREE, PROP.ROCK] },
  { cx: 20, cy: 22, spread: 2, count: 4, tiles: [PROP.TREE, PROP.ROCK] },
];

/** Radius (dalam tile) di sekitar spawn yang wajib bebas rintangan. */
const SPAWN_CLEAR_RADIUS = 4;

export type Arena = {
  /** Seed yang benar-benar dipakai — berguna untuk melaporkan bug layout. */
  seed: number;
  /** Layer tanah — selalu terisi, opaque. */
  ground: number[][];
  /** Layer objek — prop & tembok; `EMPTY` (-1) berarti kosong. Layer ini yang menabrak. */
  objects: number[][];
  /** Titik spawn pemain dalam piksel dunia. */
  spawn: { x: number; y: number };
  widthInPixels: number;
  heightInPixels: number;
};

export function buildArena(tileSize: number, seed?: number): Arena {
  const { COLS, ROWS, BORDER } = ARENA;
  // Seed acak per sesi supaya tiap run terasa berbeda; bisa dikunci lewat
  // `ARENA.RANDOM_SEED` atau argumen `seed` saat mengejar bug.
  const seedTerpakai =
    seed ?? (ARENA.RANDOM_SEED ? Math.floor(Math.random() * 0xffffffff) : ARENA.SEED);
  const rng = createRng(seedTerpakai);

  const spawnCol = Math.floor(COLS / 2);
  const spawnRow = Math.floor(ROWS / 2);

  // 1. Layer tanah: rumput bervariasi di SELURUH peta, termasuk di bawah tembok.
  const ground: number[][] = [];
  for (let row = 0; row < ROWS; row++) {
    const line: number[] = [];
    for (let col = 0; col < COLS; col++) {
      line.push(pickWeighted(rng, FLOOR_WEIGHTS));
    }
    ground.push(line);
  }

  // 2. Layer objek: mulai kosong.
  const objects: number[][] = [];
  for (let row = 0; row < ROWS; row++) {
    objects.push(new Array<number>(COLS).fill(EMPTY));
  }

  // 3. Tembok pembatas hutan di keempat sisi.
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const onBorder =
        row < BORDER || row >= ROWS - BORDER || col < BORDER || col >= COLS - BORDER;
      if (onBorder) {
        objects[row][col] = WALL_VARIANTS[Math.floor(rng() * WALL_VARIANTS.length)];
      }
    }
  }

  // 4. Rintangan interior, area spawn dijaga tetap bebas.
  const insideArena = (col: number, row: number) =>
    col >= BORDER && col < COLS - BORDER && row >= BORDER && row < ROWS - BORDER;
  const nearSpawn = (col: number, row: number) =>
    Math.abs(col - spawnCol) <= SPAWN_CLEAR_RADIUS &&
    Math.abs(row - spawnRow) <= SPAWN_CLEAR_RADIUS;

  for (const cluster of CLUSTERS) {
    for (let i = 0; i < cluster.count; i++) {
      const offsetCol = Math.round((rng() * 2 - 1) * cluster.spread);
      const offsetRow = Math.round((rng() * 2 - 1) * cluster.spread);
      const col = cluster.cx + offsetCol;
      const row = cluster.cy + offsetRow;

      if (!insideArena(col, row)) continue;
      if (nearSpawn(col, row)) continue;

      objects[row][col] = cluster.tiles[Math.floor(rng() * cluster.tiles.length)];
    }
  }

  return {
    seed: seedTerpakai,
    ground,
    objects,
    spawn: {
      x: spawnCol * tileSize + tileSize / 2,
      y: spawnRow * tileSize + tileSize / 2,
    },
    widthInPixels: COLS * tileSize,
    heightInPixels: ROWS * tileSize,
  };
}
