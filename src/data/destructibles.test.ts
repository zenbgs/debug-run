import { describe, expect, it } from 'vitest';
import { DESTRUCTIBLE, DESTRUCTIBLES, isDestructible, specFor } from './destructibles';
import { PROP, WALL, EMPTY } from './tiles';
import { BIOMES } from './biomes';

describe('rintangan yang bisa dihancurkan', () => {
  it('TIDAK ADA satu pun tile WALL yang bisa dihancurkan', () => {
    // Aturan paling penting di berkas ini. `ArenaBuilder` memakai `WALL.*` untuk
    // tepi arena; kalau salah satunya bisa pecah, pemain dan musuh bisa keluar
    // dari arena dan seluruh permainan bocor.
    for (const [nama, index] of Object.entries(WALL)) {
      expect(isDestructible(index), `WALL.${nama} (${index}) bisa dihancurkan`).toBe(false);
    }
  });

  it('tepi setiap biome memakai tile yang tidak bisa dihancurkan', () => {
    // Diperiksa lewat data biome yang sesungguhnya, bukan lewat konstanta WALL
    // saja: biome baru bisa saja memakai index lain sebagai tembok tepinya.
    for (const biome of BIOMES) {
      for (const index of biome.wallVariants) {
        expect(isDestructible(index), `biome ${biome.id}: tembok ${index}`).toBe(false);
      }
    }
  });

  it('EMPTY bukan sesuatu yang bisa dihancurkan', () => {
    expect(isDestructible(EMPTY)).toBe(false);
  });

  it('semua prop interior bisa dihancurkan', () => {
    // Rintangan yang mustahil dipecahkan mengembalikan masalah jalan buntu yang
    // justru ingin dihilangkan.
    for (const [nama, index] of Object.entries(PROP)) {
      expect(isDestructible(index), `PROP.${nama} (${index}) tidak bisa dihancurkan`).toBe(true);
    }
  });

  it('prop yang dipakai tiap biome semuanya bisa dihancurkan', () => {
    for (const biome of BIOMES) {
      for (const index of [...biome.rockProps, ...biome.foliageProps]) {
        expect(isDestructible(index), `biome ${biome.id}: prop ${index}`).toBe(true);
      }
    }
  });

  it('HP-nya rendah — ini manuver taktis, bukan menambang', () => {
    // Kalau butuh sepuluh pukulan, tidak akan ada yang melakukannya saat sedang
    // dikejar, dan seluruh fiturnya tidak pernah terpakai.
    for (const [index, spec] of Object.entries(DESTRUCTIBLES)) {
      expect(spec.hp, `tile ${index}`).toBeGreaterThan(0);
      expect(spec.hp, `tile ${index}`).toBeLessThanOrEqual(100);
    }
  });

  it('tumbuhan lebih rapuh daripada batu', () => {
    expect(specFor(PROP.BUSH)!.hp).toBeLessThan(specFor(PROP.ROCK)!.hp);
    expect(specFor(PROP.REED)!.hp).toBeLessThan(specFor(PROP.BOULDER)!.hp);
  });

  it('bongkahan padat paling keras', () => {
    const semua = Object.values(DESTRUCTIBLES).map((s) => s.hp);
    expect(specFor(PROP.BOULDER)!.hp).toBe(Math.max(...semua));
  });

  it('peluang jatuhan masuk akal', () => {
    for (const [index, spec] of Object.entries(DESTRUCTIBLES)) {
      expect(spec.dropChance, `tile ${index}`).toBeGreaterThan(0);
      expect(spec.dropChance, `tile ${index}`).toBeLessThan(0.6);
    }
  });

  it('serangan tidak meneruskan damage penuh ke rintangan', () => {
    // Kalau 1:1, pukulan biasa merobohkan pohon sekali ayun dan seluruh arena
    // rata sebelum wave 3.
    expect(DESTRUCTIBLE.ATTACK_RATIO).toBeGreaterThan(0);
    expect(DESTRUCTIBLE.ATTACK_RATIO).toBeLessThan(1);
  });

  it('index tak dikenal tidak melempar', () => {
    expect(isDestructible(99999)).toBe(false);
    expect(specFor(99999)).toBeUndefined();
  });
});
