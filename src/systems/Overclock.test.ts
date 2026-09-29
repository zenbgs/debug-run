import { describe, expect, it } from 'vitest';
import { OverclockMeter } from './OverclockMeter';
import { OVERCLOCK, ULTIMATES, ultimateFor } from '../data/overclock';
import { PLAYER_CLASSES } from '../data/classes';
import { ALL_SHEETS } from '../data/frames';

describe('meter Overclock', () => {
  it('mulai kosong dan belum siap', () => {
    const m = new OverclockMeter();
    expect(m.value).toBe(0);
    expect(m.ratio).toBe(0);
    expect(m.isReady).toBe(false);
  });

  it('siap tepat saat penuh', () => {
    const m = new OverclockMeter();
    m.add(OVERCLOCK.MAX - 1);
    expect(m.isReady).toBe(false);
    m.add(1);
    expect(m.isReady).toBe(true);
  });

  it('kelebihan muatan tidak menumpuk', () => {
    // Kalau menumpuk, pemain yang membunuh banyak sebelum memakai pamungkas
    // bisa melepasnya dua kali beruntun — dan momen besarnya berhenti terasa
    // besar.
    const m = new OverclockMeter();
    m.add(OVERCLOCK.MAX * 5);
    expect(m.value).toBe(OVERCLOCK.MAX);
    m.consume();
    expect(m.isReady).toBe(false);
  });

  it('consume hanya berhasil saat penuh, dan mengosongkan meter', () => {
    const m = new OverclockMeter();
    m.add(OVERCLOCK.MAX - 5);
    expect(m.consume()).toBe(false);
    expect(m.value).toBe(OVERCLOCK.MAX - 5); // gagal = tidak mengurangi apa pun

    m.add(5);
    expect(m.consume()).toBe(true);
    expect(m.value).toBe(0);
  });

  it('ratio selalu di antara 0 dan 1', () => {
    const m = new OverclockMeter();
    for (const n of [-50, 0, 13, OVERCLOCK.MAX, OVERCLOCK.MAX * 3]) {
      m.reset();
      m.add(n);
      expect(m.ratio).toBeGreaterThanOrEqual(0);
      expect(m.ratio).toBeLessThanOrEqual(1);
    }
  });

  it('muatan negatif tidak membuat meter di bawah nol', () => {
    const m = new OverclockMeter();
    m.add(-10);
    expect(m.value).toBe(0);
  });

  it('boss mengisi jauh lebih banyak daripada musuh biasa', () => {
    expect(OVERCLOCK.PER_BOSS).toBeGreaterThan(OVERCLOCK.PER_ELITE);
    expect(OVERCLOCK.PER_ELITE).toBeGreaterThan(OVERCLOCK.PER_KILL);
  });

  it('butuh sejumlah wajar musuh untuk terisi penuh', () => {
    // Terlalu cepat: pamungkasnya jadi serangan biasa. Terlalu lambat: pemain
    // tidak pernah melihatnya sama sekali dalam satu run.
    const perluKill = OVERCLOCK.MAX / OVERCLOCK.PER_KILL;
    expect(perluKill).toBeGreaterThanOrEqual(15);
    expect(perluKill).toBeLessThanOrEqual(40);
  });
});

describe('jurus pamungkas per kelas', () => {
  it('tiap kelas punya jurusnya sendiri', () => {
    for (const kelas of PLAYER_CLASSES) {
      expect(ULTIMATES[kelas.id], kelas.id).toBeDefined();
    }
  });

  it('tidak ada dua kelas dengan BENTUK jurus yang sama', () => {
    // Alasan yang sama seperti skill dan FX benturan: kalau ketiganya
    // mengeluarkan ledakan bundar yang sama, memilih kelas tidak berarti apa-apa.
    const bentuk = PLAYER_CLASSES.map((k) => ultimateFor(k.id).kind);
    expect(new Set(bentuk).size).toBe(bentuk.length);
  });

  it('FX tiap jurus benar-benar terdaftar', () => {
    const keys = new Set(ALL_SHEETS.map((s) => s.key));
    for (const [id, u] of Object.entries(ULTIMATES)) {
      expect(keys.has(u.fxKey), `${id} -> ${u.fxKey}`).toBe(true);
    }
  });

  it('jurus berulang punya jeda ketukan, jurus sekali pukul tidak butuh', () => {
    for (const [id, u] of Object.entries(ULTIMATES)) {
      if (u.kind === 'nova') continue;
      expect(u.tickMs, `${id} berulang tanpa tickMs`).toBeGreaterThan(0);
      // Ketukan harus muat beberapa kali dalam durasinya, kalau tidak ia cuma
      // memukul sekali dan bentuk "berulang"-nya tidak pernah terlihat.
      expect(u.durationMs / u.tickMs!, id).toBeGreaterThanOrEqual(3);
    }
  });

  it('jurus sekali pukul jauh lebih keras daripada satu ketukan jurus berulang', () => {
    const nova = ULTIMATES.mage;
    for (const [id, u] of Object.entries(ULTIMATES)) {
      if (u.kind === 'nova') continue;
      expect(nova.damage, `nova vs ${id}`).toBeGreaterThan(u.damage * 2);
    }
  });

  it('semua angka jurus masuk akal', () => {
    for (const [id, u] of Object.entries(ULTIMATES)) {
      expect(u.damage, id).toBeGreaterThan(0);
      expect(u.radius, id).toBeGreaterThan(0);
      expect(u.durationMs, id).toBeGreaterThan(0);
      expect(u.knockback, id).toBeGreaterThanOrEqual(0);
      expect(u.name.length, id).toBeGreaterThan(0);
    }
  });

  it('kelas tak dikenal tidak melempar', () => {
    expect(() => ultimateFor('tidak-ada')).not.toThrow();
  });
});
