import { describe, expect, it } from 'vitest';
import { COMBO_SCORE } from '../data/waves';
import { ScoreStreak } from './ScoreStreak';

const LANGKAH = COMBO_SCORE.KILLS_PER_STEP;

describe('ScoreStreak', () => {
  it('mulai dari pengali 1', () => {
    const s = new ScoreStreak();
    expect(s.current).toBe(1);
    expect(s.best).toBe(1);
  });

  it('naik satu tingkat tiap KILLS_PER_STEP bunuh beruntun', () => {
    const s = new ScoreStreak();
    for (let i = 1; i <= LANGKAH - 1; i++) {
      expect(s.registerKill(i * 100)).toBe(1);
    }
    // Bunuh ke-KILLS_PER_STEP menaikkan pengali.
    expect(s.registerKill(LANGKAH * 100)).toBe(2);
  });

  it('tidak melewati MAX_MULTIPLIER', () => {
    const s = new ScoreStreak();
    for (let i = 1; i <= LANGKAH * (COMBO_SCORE.MAX_MULTIPLIER + 3); i++) {
      s.registerKill(i * 100);
    }
    expect(s.current).toBe(COMBO_SCORE.MAX_MULTIPLIER);
  });

  it('rantai putus kalau jeda melebihi WINDOW_MS', () => {
    const s = new ScoreStreak();
    let t = 0;
    for (let i = 0; i < LANGKAH; i++) {
      t += 100;
      s.registerKill(t);
    }
    expect(s.current).toBe(2);

    // Menganggur lebih lama dari jendela -> mulai dari nol lagi.
    t += COMBO_SCORE.WINDOW_MS + 1;
    expect(s.registerKill(t)).toBe(1);
  });

  it('kena pukul menurunkan satu tingkat, bukan menghapus rantai', () => {
    const s = new ScoreStreak();
    let t = 0;
    // Bangun sampai pengali 3.
    for (let i = 0; i < LANGKAH * 2; i++) {
      t += 100;
      s.registerKill(t);
    }
    expect(s.current).toBe(3);

    s.onPlayerHit();
    expect(s.current).toBe(2);

    s.onPlayerHit();
    expect(s.current).toBe(1);

    // Tidak boleh turun di bawah 1.
    s.onPlayerHit();
    expect(s.current).toBe(1);
  });

  it('setelah kena pukul, rantai masih bisa dibangun lagi', () => {
    const s = new ScoreStreak();
    let t = 0;
    for (let i = 0; i < LANGKAH; i++) {
      t += 100;
      s.registerKill(t);
    }
    expect(s.current).toBe(2);

    s.onPlayerHit();
    expect(s.current).toBe(1);

    // Ini inti perubahannya: pemain yang kena sekali tidak kehilangan segalanya.
    for (let i = 0; i < LANGKAH; i++) {
      t += 100;
      s.registerKill(t);
    }
    expect(s.current).toBe(2);
  });

  it('mengingat pengali terbaik meski rantai lalu jatuh', () => {
    const s = new ScoreStreak();
    let t = 0;
    for (let i = 0; i < LANGKAH * 2; i++) {
      t += 100;
      s.registerKill(t);
    }
    const puncak = s.current;
    s.onPlayerHit();
    s.onPlayerHit();
    expect(s.current).toBeLessThan(puncak);
    expect(s.best).toBe(puncak);
  });

  it('reset mengembalikan semuanya ke awal', () => {
    const s = new ScoreStreak();
    for (let i = 1; i <= LANGKAH * 2; i++) s.registerKill(i * 100);
    s.reset();
    expect(s.current).toBe(1);
    expect(s.best).toBe(1);
    expect(s.killsInStreak).toBe(0);
  });
});
