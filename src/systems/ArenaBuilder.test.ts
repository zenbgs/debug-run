import { describe, expect, it } from 'vitest';
import { BIOMES } from '../data/biomes';
import { ARENA, TILE } from '../data/config';
import { EMPTY } from '../data/tiles';
import { buildArena } from './ArenaBuilder';

describe('buildArena', () => {
  it('seed yang sama menghasilkan layout yang identik', () => {
    const a = buildArena(TILE, 12345);
    const b = buildArena(TILE, 12345);
    expect(a.seed).toBe(12345);
    expect(b.objects).toEqual(a.objects);
    expect(b.ground).toEqual(a.ground);
  });

  it('seed berbeda menghasilkan layout berbeda', () => {
    const a = buildArena(TILE, 1);
    const b = buildArena(TILE, 2);
    expect(b.objects).not.toEqual(a.objects);
  });

  it('tanpa seed eksplisit, tiap pembangunan memakai seed acak', () => {
    const seeds = new Set(Array.from({ length: 8 }, () => buildArena(TILE).seed));
    // Tabrakan seed acak sangat kecil kemungkinannya; longgarkan sedikit saja.
    expect(seeds.size).toBeGreaterThan(6);
  });

  it('tembok pembatas tertutup rapat di keempat sisi', () => {
    const arena = buildArena(TILE, 777);
    const { COLS, ROWS, BORDER } = ARENA;

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const diTepi =
          row < BORDER || row >= ROWS - BORDER || col < BORDER || col >= COLS - BORDER;
        if (!diTepi) continue;
        // Celah di tembok berarti pemain bisa keluar arena.
        expect(arena.objects[row][col], `lubang di (${col},${row})`).not.toBe(EMPTY);
      }
    }
  });

  it('area spawn bebas rintangan', () => {
    for (const seed of [1, 42, 999, 20260927]) {
      const arena = buildArena(TILE, seed);
      const col = Math.floor(arena.spawn.x / TILE);
      const row = Math.floor(arena.spawn.y / TILE);

      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          expect(
            arena.objects[row + dr][col + dc],
            `seed ${seed}: rintangan dekat spawn (${col + dc},${row + dr})`
          ).toBe(EMPTY);
        }
      }
    }
  });

  it('ukuran grid cocok dengan konfigurasi', () => {
    const arena = buildArena(TILE, 5);
    expect(arena.ground.length).toBe(ARENA.ROWS);
    expect(arena.ground[0].length).toBe(ARENA.COLS);
    expect(arena.objects.length).toBe(ARENA.ROWS);
    expect(arena.widthInPixels).toBe(ARENA.COLS * TILE);
    expect(arena.heightInPixels).toBe(ARENA.ROWS * TILE);
  });

  it('layer tanah selalu terisi penuh — tidak boleh ada sel kosong', () => {
    // Sel kosong di layar tanah akan tembus ke background scene dan terlihat
    // sebagai kotak hitam; ini pernah terjadi dengan tile prop di M1.
    const arena = buildArena(TILE, 31337);
    for (const baris of arena.ground) {
      for (const tile of baris) expect(tile).not.toBe(EMPTY);
    }
  });

  describe('setiap biome menghasilkan arena yang sah', () => {
    // Jaminan di atas harus berlaku untuk SEMUA biome, bukan cuma padang rumput.
    // Satu biome dengan daftar tile kosong akan menghasilkan arena tanpa tembok
    // atau lantai berlubang, dan itu hanya ketahuan saat wave-nya tercapai.
    for (const biome of BIOMES) {
      it(biome.id, () => {
        const arena = buildArena(TILE, 4242, biome);
        expect(arena.biome.id).toBe(biome.id);

        const { COLS, ROWS, BORDER } = ARENA;
        const lantaiDipakai = new Set<number>();
        const tembokDipakai = new Set<number>();

        for (let row = 0; row < ROWS; row++) {
          for (let col = 0; col < COLS; col++) {
            expect(arena.ground[row][col], `lantai kosong (${col},${row})`).not.toBe(EMPTY);
            lantaiDipakai.add(arena.ground[row][col]);

            const diTepi =
              row < BORDER || row >= ROWS - BORDER || col < BORDER || col >= COLS - BORDER;
            if (diTepi) {
              expect(arena.objects[row][col], `lubang tembok (${col},${row})`).not.toBe(EMPTY);
              tembokDipakai.add(arena.objects[row][col]);
            }
          }
        }

        // Tile yang benar-benar dipakai harus berasal dari palet biome ini.
        const lantaiSah = new Set(biome.floorWeights.map(([t]) => t));
        for (const t of lantaiDipakai) expect(lantaiSah.has(t), `lantai asing ${t}`).toBe(true);
        for (const t of tembokDipakai) {
          expect(biome.wallVariants.includes(t), `tembok asing ${t}`).toBe(true);
        }
      });
    }
  });

  it('biome berbeda menghasilkan lantai yang berbeda', () => {
    // Inti keluhannya: tiap wave terlihat sama. Dua biome dengan seed sama wajib
    // menghasilkan lantai berbeda, kalau tidak palet-nya cuma disalin.
    const terlihat = new Set<string>();
    for (const biome of BIOMES) {
      const arena = buildArena(TILE, 99, biome);
      const sidikJari = [...new Set(arena.ground.flat())].sort((a, b) => a - b).join(',');
      terlihat.add(`${sidikJari}|${biome.tint}`);
    }
    expect(terlihat.size, 'ada biome yang palet lantainya identik').toBe(BIOMES.length);
  });
});
