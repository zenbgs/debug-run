import { describe, expect, it } from 'vitest';
import { cariTitikBebas, normalize, pilihArahSusur, terhalang } from './Navigation';

/** Peta buatan: daftar kotak padat, dipakai sebagai probe. */
function peta(kotak: Array<{ x1: number; y1: number; x2: number; y2: number }>) {
  return (x: number, y: number) =>
    kotak.some((k) => x >= k.x1 && x <= k.x2 && y >= k.y1 && y <= k.y2);
}

const KOSONG = () => false;
const SEMUA_PADAT = () => true;

describe('terhalang — ambang nisbi, bukan mutlak', () => {
  it('musuh yang menggerus pelan tetap terhitung terhalang', () => {
    // Inilah bug-nya, dengan angka. Musuh berkecepatan 200 px/detik pada frame
    // 16 ms seharusnya berpindah 3,2 px. Ia hanya berpindah 1,0 px — nyaris
    // tidak maju. Ambang MUTLAK lama (> 0,4 px dianggap "bergerak") meloloskan
    // ini, jadi penghitung macetnya di-nol-kan tiap frame dan jaring pengaman
    // tidak pernah menyala. Ambang NISBI menangkapnya: 1,0 < 3,2 x 0,45.
    expect(terhalang(1.0, 200, 0.016, 0.45)).toBe(true);
  });

  it('musuh yang berjalan normal tidak terhitung terhalang', () => {
    expect(terhalang(3.0, 200, 0.016, 0.45)).toBe(false);
    expect(terhalang(0.95, 60, 0.016, 0.45)).toBe(false);
  });

  it('musuh yang memang diam tidak terhitung terhalang', () => {
    // Musuh ter-stun atau sedang telegraf tembakan: tidak ingin bergerak.
    expect(terhalang(0, 0, 0.016, 0.45)).toBe(false);
    expect(terhalang(0, 4, 0.016, 0.45)).toBe(false);
  });

  it('frame yang sangat pendek tidak memicu positif palsu', () => {
    expect(terhalang(0, 60, 0.0001, 0.45)).toBe(false);
  });

  it('ambangnya ikut kecepatan, jadi musuh cepat lebih mudah dianggap terhalang', () => {
    // Perpindahan yang sama (1 px) wajar untuk musuh lambat, mencurigakan untuk
    // musuh cepat. Ambang mutlak tidak bisa membedakan keduanya.
    expect(terhalang(1, 40, 0.05, 0.45)).toBe(false);
    expect(terhalang(1, 200, 0.05, 0.45)).toBe(true);
  });
});

describe('pilihArahSusur', () => {
  const asal = { x: 0, y: 0 };
  const keKanan = { x: 1, y: 0 };

  it('selalu tegak lurus arah tujuan', () => {
    const a = pilihArahSusur(asal, keKanan, KOSONG, 14);
    expect(Math.abs(a.x * keKanan.x + a.y * keKanan.y)).toBeLessThan(1e-9);
  });

  it('hasilnya vektor satuan', () => {
    const a = pilihArahSusur(asal, { x: 3, y: 4 }, KOSONG, 14);
    expect(Math.hypot(a.x, a.y)).toBeCloseTo(1, 6);
  });

  it('memilih sisi yang lowong, bukan sisi yang padat', () => {
    // Tujuan ke kanan; calonnya atas (y-) dan bawah (y+). Bawah dipadati.
    const solid = peta([{ x1: -20, y1: 5, x2: 20, y2: 40 }]);
    const a = pilihArahSusur(asal, keKanan, solid, 14);
    expect(a.y).toBeLessThan(0); // memilih ke atas
  });

  it('memilih sisi lowong yang lain kalau yang itu yang padat', () => {
    const solid = peta([{ x1: -20, y1: -40, x2: 20, y2: -5 }]);
    const a = pilihArahSusur(asal, keKanan, solid, 14);
    expect(a.y).toBeGreaterThan(0); // memilih ke bawah
  });

  it('tetap mengembalikan arah meski kedua sisi padat', () => {
    // Tidak boleh mengembalikan nol: musuh yang berhenti total adalah persis
    // keadaan yang ingin dihindari.
    const a = pilihArahSusur(asal, keKanan, SEMUA_PADAT, 14);
    expect(Math.hypot(a.x, a.y)).toBeCloseTo(1, 6);
  });

  it('arah tujuan nol tidak melempar dan tetap memberi arah', () => {
    const a = pilihArahSusur(asal, { x: 0, y: 0 }, KOSONG, 14);
    expect(Math.hypot(a.x, a.y)).toBeCloseTo(1, 6);
  });
});

describe('cariTitikBebas', () => {
  it('mengembalikan titik yang benar-benar bebas', () => {
    const solid = peta([{ x1: 5, y1: -30, x2: 40, y2: 30 }]);
    const t = cariTitikBebas({ x: 0, y: 0 }, { x: 1, y: 0 }, solid, 22);
    expect(t).not.toBeNull();
    expect(solid(t!.x, t!.y)).toBe(false);
  });

  it('null kalau semua calon padat — pemanggil yang memutuskan', () => {
    expect(cariTitikBebas({ x: 0, y: 0 }, { x: 1, y: 0 }, SEMUA_PADAT, 22)).toBeNull();
  });

  it('mendahulukan arah tujuan saat sekitarnya lowong', () => {
    const t = cariTitikBebas({ x: 0, y: 0 }, { x: 1, y: 0 }, KOSONG, 22);
    expect(t!.x).toBeCloseTo(22, 5);
    expect(t!.y).toBeCloseTo(0, 5);
  });

  it('tidak pernah mengembalikan titik di dalam rintangan', () => {
    // Ini yang membedakannya dari dorongan buta versi lama: mendorong lurus ke
    // arah pemain bisa mendaratkan musuh DI DALAM pohon, dan yang terlihat
    // adalah musuh menembus rintangan.
    const solid = peta([{ x1: -100, y1: -100, x2: 100, y2: 10 }]);
    const t = cariTitikBebas({ x: 0, y: 0 }, { x: 0, y: -1 }, solid, 22);
    if (t) expect(solid(t.x, t.y)).toBe(false);
  });
});

describe('normalize', () => {
  it('vektor nol tidak menghasilkan NaN', () => {
    const n = normalize(0, 0);
    expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
    expect(Math.hypot(n.x, n.y)).toBeCloseTo(1, 6);
  });

  it('panjangnya selalu 1', () => {
    for (const [x, y] of [
      [3, 4],
      [-7, 2],
      [0, -9],
    ]) {
      expect(Math.hypot(...Object.values(normalize(x, y)))).toBeCloseTo(1, 6);
    }
  });
});
