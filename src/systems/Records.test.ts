import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyRecords, loadRecords, mergeRun, recordFor, type RunResult } from './Records';

const KUNCI = 'debug-run:records:v1';

function run(over: Partial<RunResult> = {}): RunResult {
  return { score: 100, wave: 3, bestChain: 2, kills: 10, endless: false, ...over };
}

describe('mergeRun', () => {
  it('run pertama sebuah kelas selalu jadi rekor', () => {
    const { records, pecahRekor } = mergeRun(emptyRecords(), 'warrior', run());
    expect(pecahRekor).toBe(true);
    expect(recordFor(records, 'warrior')?.score).toBe(100);
  });

  it('tiap medan diambil maksimumnya sendiri-sendiri', () => {
    // Run kedua skornya lebih rendah tapi wave-nya lebih jauh: keduanya harus
    // tercatat. Menyimpan satu "run terbaik" utuh akan membuang wave 14 itu.
    let r = mergeRun(emptyRecords(), 'warrior', run({ score: 900, wave: 9, kills: 40 })).records;
    r = mergeRun(r, 'warrior', run({ score: 300, wave: 14, kills: 12 })).records;

    const e = recordFor(r, 'warrior')!;
    expect(e.score).toBe(900);
    expect(e.wave).toBe(14);
    expect(e.kills).toBe(40);
  });

  it('pecahRekor hanya dari skor, bukan dari medan lain', () => {
    const awal = mergeRun(emptyRecords(), 'warrior', run({ score: 900, wave: 5 })).records;

    // Wave dan kill jauh lebih tinggi, tapi skornya di bawah -> bukan rekor baru.
    const naikWave = mergeRun(awal, 'warrior', run({ score: 100, wave: 99, kills: 999 }));
    expect(naikWave.pecahRekor).toBe(false);

    const naikSkor = mergeRun(awal, 'warrior', run({ score: 901 }));
    expect(naikSkor.pecahRekor).toBe(true);
  });

  it('skor sama persis bukan rekor baru', () => {
    const awal = mergeRun(emptyRecords(), 'warrior', run({ score: 500 })).records;
    expect(mergeRun(awal, 'warrior', run({ score: 500 })).pecahRekor).toBe(false);
  });

  it('kelas lain tidak tersentuh', () => {
    let r = mergeRun(emptyRecords(), 'warrior', run({ score: 900 })).records;
    r = mergeRun(r, 'mage', run({ score: 100 })).records;

    expect(recordFor(r, 'warrior')?.score).toBe(900);
    expect(recordFor(r, 'mage')?.score).toBe(100);
    expect(recordFor(r, 'archer')).toBeUndefined();
  });

  it('tidak mengubah objek rekor yang masuk', () => {
    const awal = emptyRecords();
    const salinan = JSON.parse(JSON.stringify(awal));
    mergeRun(awal, 'warrior', run());
    expect(awal).toEqual(salinan);
  });

  it('penanda tanpa batas menempel sekali kena, tidak hilang lagi', () => {
    let r = mergeRun(emptyRecords(), 'warrior', run({ score: 900, endless: true })).records;
    r = mergeRun(r, 'warrior', run({ score: 1000, endless: false })).records;
    expect(recordFor(r, 'warrior')?.endless).toBe(true);
  });

  it('tanggal hanya diperbarui saat skornya benar-benar pecah', () => {
    const t1 = new Date('2026-01-01T00:00:00.000Z');
    const t2 = new Date('2026-06-01T00:00:00.000Z');

    let r = mergeRun(emptyRecords(), 'warrior', run({ score: 900 }), t1).records;
    r = mergeRun(r, 'warrior', run({ score: 100 }), t2).records;
    expect(recordFor(r, 'warrior')?.at).toBe(t1.toISOString());

    r = mergeRun(r, 'warrior', run({ score: 5000 }), t2).records;
    expect(recordFor(r, 'warrior')?.at).toBe(t2.toISOString());
  });
});

/**
 * `localStorage` tiruan di memori.
 *
 * vitest berjalan di Node, jadi `localStorage` tidak ada. Memakai tiruan sendiri
 * lebih baik daripada menarik jsdom hanya demi ini: yang diuji adalah bagaimana
 * `loadRecords` menyikapi isi penyimpanan, bukan implementasi penyimpanannya.
 */
function bikinPenyimpanan(isiAwal?: string) {
  const peta = new Map<string, string>();
  if (isiAwal !== undefined) peta.set(KUNCI, isiAwal);
  return {
    getItem: (k: string) => peta.get(k) ?? null,
    setItem: (k: string, v: string) => void peta.set(k, v),
    removeItem: (k: string) => void peta.delete(k),
    clear: () => peta.clear(),
    key: () => null,
    length: 0,
  };
}

function pasang(isi?: string): void {
  vi.stubGlobal('localStorage', bikinPenyimpanan(isi));
}

describe('loadRecords — data tersimpan tidak boleh sanggup mematikan game', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    pasang();
  });

  it('penyimpanan kosong menghasilkan rekor kosong', () => {
    expect(loadRecords()).toEqual(emptyRecords());
  });

  it('JSON rusak tidak melempar', () => {
    pasang('{ini bukan json');
    expect(() => loadRecords()).not.toThrow();
    expect(loadRecords()).toEqual(emptyRecords());
  });

  it('versi lain diabaikan, bukan dipaksa dibaca', () => {
    pasang(JSON.stringify({ version: 0, perClass: { warrior: { score: 1 } } }));
    expect(loadRecords().perClass).toEqual({});
  });

  it('bentuk tak terduga tidak melempar', () => {
    for (const isi of ['null', '[]', '"teks"', '42', '{"version":1}']) {
      pasang(isi);
      expect(() => loadRecords(), isi).not.toThrow();
    }
  });

  it('entri yang bentuknya salah dibuang, entri sehat tetap terbaca', () => {
    pasang(
      JSON.stringify({
        version: 1,
        perClass: {
          warrior: { score: 500, wave: 7, bestChain: 3, kills: 20, endless: false, at: '' },
          mage: { score: 'banyak' },
          archer: null,
        },
      })
    );
    const r = loadRecords();
    expect(r.perClass.warrior.score).toBe(500);
    expect(r.perClass.mage).toBeUndefined();
    expect(r.perClass.archer).toBeUndefined();
  });

  it('skor NaN/Infinity ditolak — sekali masuk, ia akan menang selamanya', () => {
    pasang(
      JSON.stringify({
        version: 1,
        perClass: { warrior: { score: null, wave: 1, bestChain: 1, kills: 1 } },
      })
    );
    expect(loadRecords().perClass.warrior).toBeUndefined();
  });

  it('localStorage yang melempar saat dibaca tetap menghasilkan rekor kosong', () => {
    // Safari mode privat berperilaku seperti ini.
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('akses ditolak');
      },
      setItem: () => {
        throw new Error('akses ditolak');
      },
    });
    expect(() => loadRecords()).not.toThrow();
    expect(loadRecords()).toEqual(emptyRecords());
  });
});
