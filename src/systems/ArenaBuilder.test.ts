import { describe, expect, it } from 'vitest';
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
});
