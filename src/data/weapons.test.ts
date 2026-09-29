import { describe, expect, it } from 'vitest';
import { PLAYER_CLASSES } from './classes';
import { ALL_SHEETS } from './frames';
import { GRIP, POSE, REST, SWING, WEAPON_TIMING, type WeaponKind } from './weapons';

const JENIS = Object.keys(SWING) as WeaponKind[];

describe('senjata yang dipegang pemain', () => {
  it('tiap kelas memegang senjata yang texture-nya benar-benar terdaftar', () => {
    const keys = new Set(ALL_SHEETS.map((s) => s.key));
    for (const kelas of PLAYER_CLASSES) {
      expect(kelas.weapon, kelas.id).toBeDefined();
      expect(keys.has(kelas.weapon.texture), `${kelas.id} -> ${kelas.weapon.texture}`).toBe(true);
    }
  });

  it('tidak ada dua kelas yang memegang senjata sama', () => {
    // Senjata identik di dua kelas membuang seluruh gunanya: pemain tidak bisa
    // membedakan siapa yang sedang ia mainkan dari siluetnya.
    const dipakai = PLAYER_CLASSES.map((k) => k.weapon.texture);
    expect(new Set(dipakai).size).toBe(dipakai.length);
  });

  it('tiap jenis senjata punya sudut diam, genggaman, dan ayunan', () => {
    for (const jenis of JENIS) {
      expect(REST[jenis], jenis).toBeTypeOf('number');
      expect(GRIP[jenis], jenis).toBeTypeOf('number');
      expect(SWING[jenis], jenis).toBeDefined();
    }
  });

  it('jenis yang dipakai kelas semuanya punya definisi', () => {
    for (const kelas of PLAYER_CLASSES) {
      expect(SWING[kelas.weapon.kind], `${kelas.id} -> ${kelas.weapon.kind}`).toBeDefined();
    }
  });

  it('genggaman berada di dalam sprite', () => {
    for (const jenis of JENIS) {
      expect(GRIP[jenis], jenis).toBeGreaterThanOrEqual(0);
      expect(GRIP[jenis], jenis).toBeLessThanOrEqual(1);
    }
  });

  it('busur dipegang di tengah, bukan di ujung', () => {
    // Bukan aturan gaya: memutar busur pada ujung bawahnya membuat ia menyapu
    // lebar seperti pedang, dan ia berhenti terbaca sebagai busur.
    expect(GRIP.bow).toBeGreaterThan(0.25);
    expect(GRIP.bow).toBeLessThan(0.75);
  });

  it('dorongan ayunan tetap kecil', () => {
    // `dorong` menggeser senjata menjauh dari genggaman. Pada 5 px terukur ada
    // celah antara tangan dan gagang di puncak ayunan — pedangnya terbaca
    // seperti terlepas. Harness runtime menjaga ambang 4 px yang sama.
    for (const jenis of JENIS) {
      expect(Math.abs(SWING[jenis].dorong), jenis).toBeLessThanOrEqual(4);
    }
  });

  it('ancang-ancang berlawanan arah dengan ayunannya', () => {
    // Kalau keduanya searah, senjata tidak pernah mundur dan tidak ada
    // ancang-ancang yang terbaca — ia hanya tersentak ke depan.
    for (const jenis of JENIS) {
      expect(SWING[jenis].angkat, jenis).toBeLessThan(0);
      expect(SWING[jenis].ayun, jenis).toBeGreaterThan(0);
    }
  });

  it('tiap jenis punya rentang ayunan yang berbeda', () => {
    // Inti dari senjata terpisah: pedang menebas lebar, busur hampir tidak
    // bergerak. Rentang yang sama membuat ketiganya terasa satu senjata.
    const rentang = JENIS.map((j) => +(SWING[j].ayun - SWING[j].angkat).toFixed(4));
    expect(new Set(rentang).size).toBe(rentang.length);
    // Pedang harus yang terlebar — ia satu-satunya yang benar-benar menebas.
    expect(Math.max(...rentang)).toBe(+(SWING.sword.ayun - SWING.sword.angkat).toFixed(4));
  });

  it('sudut diam hampir tegak, bukan teracung', () => {
    // Senjata yang terlentang jauh saat diam terbaca sebagai pose menyerang yang
    // macet. Versi pertama memakai 55 derajat dan persis itu yang terjadi.
    for (const jenis of JENIS) {
      expect(Math.abs(REST[jenis]), jenis).toBeLessThan(Math.PI / 4);
    }
  });

  it('pose hadap atas menaruh senjata di belakang badan, arah lain di depan', () => {
    expect(POSE.up.behind).toBe(true);
    expect(POSE.down.behind).toBe(false);
    expect(POSE.left.behind).toBe(false);
    expect(POSE.right.behind).toBe(false);
  });

  it('kiri dan kanan saling bercermin', () => {
    expect(POSE.left.x).toBe(-POSE.right.x);
    expect(POSE.left.y).toBe(POSE.right.y);
    expect(POSE.left.flip).toBe(!POSE.right.flip);
  });

  it('semua pose menaruh senjata di samping badan, bukan menimpanya', () => {
    for (const [arah, pose] of Object.entries(POSE)) {
      expect(Math.abs(pose.x), arah).toBeGreaterThanOrEqual(5);
    }
  });

  it('durasi ayunan positif', () => {
    expect(WEAPON_TIMING.AYUN_MS).toBeGreaterThan(0);
    expect(WEAPON_TIMING.PULIH_MS).toBeGreaterThan(0);
  });
});
