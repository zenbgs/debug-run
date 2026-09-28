import { describe, expect, it } from 'vitest';
import { BIOMES, biomeForWave } from './biomes';
import { isBossType, SPAWNABLE_BY_ID } from './bosses';
import { buildEndlessWave, ENDLESS, endlessLevel, isEndlessWaveNumber } from './endless';
import { WAVES } from './waves';

/** Wave tanpa batas pertama sampai jauh ke dalam, untuk memeriksa kurvanya. */
const NOMOR = Array.from({ length: 60 }, (_, i) => WAVES.length + 1 + i);

describe('buildEndlessWave', () => {
  it('nomor wave-nya sesuai dan dikenali sebagai tanpa batas', () => {
    for (const n of NOMOR) {
      expect(buildEndlessWave(n).number).toBe(n);
      expect(isEndlessWaveNumber(n)).toBe(true);
    }
    expect(isEndlessWaveNumber(WAVES.length)).toBe(false);
    expect(endlessLevel(WAVES.length + 1)).toBe(1);
  });

  it('deterministik — nomor sama selalu menghasilkan wave sama', () => {
    // WaveManager menyimpan hasilnya; kalau tidak deterministik, wave yang sama
    // bisa berubah isi antara banner dan spawn.
    for (const n of [11, 15, 23, 40]) {
      expect(buildEndlessWave(n)).toEqual(buildEndlessWave(n));
    }
  });

  it('semua typeId benar-benar ada', () => {
    for (const n of NOMOR) {
      for (const e of buildEndlessWave(n).entries) {
        expect(SPAWNABLE_BY_ID.has(e.typeId), `wave ${n} -> "${e.typeId}"`).toBe(true);
        expect(e.count).toBeGreaterThan(0);
      }
    }
  });

  it('tiap wave memuat musuh, tidak pernah kosong', () => {
    for (const n of NOMOR) {
      const total = buildEndlessWave(n).entries.reduce((s, e) => s + e.count, 0);
      expect(total, `wave ${n}`).toBeGreaterThan(0);
    }
  });

  it('kesulitan menanjak, tidak pernah mundur', () => {
    // Kurva yang naik-turun membuat pemain merasa dicurangi saat run bagus
    // berakhir di wave yang justru lebih mudah dari sebelumnya.
    let maxAliveTerakhir = 0;
    let scaleTerakhir = 0;

    for (const n of NOMOR) {
      const w = buildEndlessWave(n);
      if (!w.isBossWave) {
        expect(w.maxAlive, `wave ${n}`).toBeGreaterThanOrEqual(maxAliveTerakhir);
        maxAliveTerakhir = w.maxAlive;
      }
      expect(w.statScale!, `wave ${n}`).toBeGreaterThan(scaleTerakhir);
      scaleTerakhir = w.statScale!;
    }
  });

  it('jeda spawn mengetat tapi tidak pernah menembus batas bawah', () => {
    let sebelumnya = Infinity;
    for (const n of NOMOR) {
      const w = buildEndlessWave(n);
      if (w.isBossWave) continue;
      expect(w.spawnIntervalMs, `wave ${n}`).toBeLessThanOrEqual(sebelumnya);
      expect(w.spawnIntervalMs, `wave ${n}`).toBeGreaterThanOrEqual(ENDLESS.MIN_SPAWN_MS);
      sebelumnya = w.spawnIntervalMs;
    }
  });

  it('jumlah musuh dan maxAlive punya batas atas', () => {
    for (const n of NOMOR) {
      const w = buildEndlessWave(n);
      const total = w.entries
        .filter((e) => !isBossType(SPAWNABLE_BY_ID.get(e.typeId)!))
        .reduce((s, e) => s + e.count, 0);
      expect(total, `wave ${n}`).toBeLessThanOrEqual(ENDLESS.MAX_COUNT);
      expect(w.maxAlive, `wave ${n}`).toBeLessThanOrEqual(ENDLESS.MAX_ALIVE_CAP);
    }
  });

  it('boss tepat di kelipatan BOSS_EVERY, dan penandanya ikut benar', () => {
    for (const n of NOMOR) {
      const w = buildEndlessWave(n);
      const adaBoss = w.entries.some((e) => isBossType(SPAWNABLE_BY_ID.get(e.typeId)!));
      const seharusnya = n % ENDLESS.BOSS_EVERY === 0;

      expect(adaBoss, `wave ${n}`).toBe(seharusnya);
      expect(w.isBossWave === true, `penanda wave ${n}`).toBe(seharusnya);
    }
  });

  it('boss selalu jadi entri pertama', () => {
    // WaveManager memang menarik boss ke depan antrean, tapi menaruhnya di depan
    // sejak data membuat urutannya tidak bergantung pada perilaku itu.
    for (const n of NOMOR.filter((x) => x % ENDLESS.BOSS_EVERY === 0)) {
      const pertama = buildEndlessWave(n).entries[0];
      expect(isBossType(SPAWNABLE_BY_ID.get(pertama.typeId)!), `wave ${n}`).toBe(true);
      expect(pertama.count).toBe(1);
    }
  });

  it('tidak pernah lebih dari satu boss sekaligus', () => {
    for (const n of NOMOR) {
      const jumlah = buildEndlessWave(n)
        .entries.filter((e) => isBossType(SPAWNABLE_BY_ID.get(e.typeId)!))
        .reduce((s, e) => s + e.count, 0);
      expect(jumlah, `wave ${n}`).toBeLessThanOrEqual(1);
    }
  });

  it('kedua boss dipakai bergantian, bukan satu saja selamanya', () => {
    const dipakai = new Set(
      NOMOR.filter((n) => n % ENDLESS.BOSS_EVERY === 0).map(
        (n) => buildEndlessWave(n).entries[0].typeId
      )
    );
    expect(dipakai.size).toBeGreaterThan(1);
  });

  it('musuh berat masuk bertahap, bukan sekaligus di wave pertama', () => {
    const tipeDi = (n: number) => new Set(buildEndlessWave(n).entries.map((e) => e.typeId));
    expect(tipeDi(WAVES.length + 1).size).toBeLessThan(tipeDi(WAVES.length + 20).size);
  });
});

describe('biome mengikuti wave tanpa batas', () => {
  it('wave di luar naskah memutar seluruh biome', () => {
    // Sebelumnya jatuh ke BIOMES[0], jadi seluruh mode tanpa batas — bagian
    // terpanjang dari sebuah run — dimainkan di padang rumput yang sama.
    const terlihat = new Set(NOMOR.map((n) => biomeForWave(n).id));
    expect(terlihat.size).toBe(BIOMES.length);
  });

  it('tidak pernah undefined untuk nomor wave berapa pun', () => {
    for (const n of [1, 10, 11, 99, 1000]) {
      expect(biomeForWave(n), `wave ${n}`).toBeDefined();
    }
  });
});
