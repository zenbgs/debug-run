import { describe, expect, it } from 'vitest';
import { ELITE, ELITES, ELITE_BY_ID, eliteChance } from './elites';
import { WAVES } from './waves';

describe('sifat elite', () => {
  it('id unik', () => {
    const ids = ELITES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ELITE_BY_ID.size).toBe(ELITES.length);
  });

  it('setiap elite benar-benar berbeda dari musuh biasa', () => {
    // Elite yang semua pengalinya 1 hanyalah musuh biasa bercincin.
    for (const e of ELITES) {
      const berbeda = e.hp !== 1 || e.speed !== 1 || e.deathBlast > 0;
      expect(berbeda, `${e.id} tidak mengubah apa pun`).toBe(true);
    }
  });

  it('pengali tidak ada yang nol atau negatif', () => {
    for (const e of ELITES) {
      expect(e.hp, e.id).toBeGreaterThan(0);
      expect(e.speed, e.id).toBeGreaterThan(0);
      expect(e.scale, e.id).toBeGreaterThan(0);
      expect(e.deathBlast, e.id).toBeGreaterThanOrEqual(0);
    }
  });

  it('elite selalu lebih berharga dari musuh biasa', () => {
    // Kalau tidak, musuh yang lebih sulit justru memberi poin per detik lebih
    // sedikit, dan pemain terdorong menghindarinya.
    for (const e of ELITES) {
      expect(e.score, e.id).toBeGreaterThan(1);
    }
  });

  it('yang paling cepat tidak sekaligus paling tebal', () => {
    // Menumpuk kecepatan tinggi dengan HP tinggi menghasilkan musuh yang hanya
    // melelahkan: sulit dikejar, sulit dijatuhkan, dan tidak menambah keputusan.
    for (const e of ELITES) {
      expect(e.speed * e.hp, `${e.id}: speed x hp`).toBeLessThan(3);
    }
  });

  it('setiap elite punya warna cincin sendiri', () => {
    const warna = ELITES.map((e) => e.ringColor);
    expect(new Set(warna).size, 'dua elite berbagi warna cincin').toBe(warna.length);
  });
});

describe('peluang elite', () => {
  it('nol di wave-wave awal', () => {
    // Pemain baru harus mengenali musuh biasa lebih dulu; elite di wave 1 hanya
    // terbaca sebagai "kenapa yang ini tidak mati".
    for (let w = 1; w < ELITE.START_WAVE; w++) {
      expect(eliteChance(w), `wave ${w}`).toBe(0);
    }
  });

  it('naik setelah ambang, dan tidak pernah turun', () => {
    let sebelumnya = -1;
    for (let w = 1; w <= 120; w++) {
      const p = eliteChance(w);
      expect(p, `wave ${w}`).toBeGreaterThanOrEqual(sebelumnya);
      sebelumnya = p;
    }
    expect(eliteChance(ELITE.START_WAVE)).toBeGreaterThan(0);
  });

  it('tidak pernah melewati batas atas', () => {
    // Di atas batas ini hampir seluruh layar jadi elite dan penandanya sia-sia.
    for (let w = 1; w <= 500; w++) {
      expect(eliteChance(w), `wave ${w}`).toBeLessThanOrEqual(ELITE.MAX_CHANCE);
    }
    expect(eliteChance(500)).toBe(ELITE.MAX_CHANCE);
  });

  it('masih di bawah setengah saat kampanye berakhir', () => {
    // Sepuluh wave bernaskah harus tetap terasa seperti kurva yang dirancang,
    // bukan lotere elite.
    expect(eliteChance(WAVES.length)).toBeLessThan(0.25);
  });
});
