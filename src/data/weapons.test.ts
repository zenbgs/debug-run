import { describe, expect, it } from 'vitest';
import { PLAYER_CLASSES } from './classes';
import { ALL_SHEETS } from './frames';
import {
  BEHIND,
  behindFor,
  GRIP,
  HAND,
  poseFor,
  SWING,
  WEAPON_TIMING,
  type WeaponKind,
} from './weapons';

const JENIS = Object.keys(SWING) as WeaponKind[];
const ARAH = ['down', 'up', 'left', 'right'] as const;

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

  it('tiap jenis senjata punya genggaman, urutan gambar, dan ayunan', () => {
    for (const jenis of JENIS) {
      expect(GRIP[jenis], jenis).toBeTypeOf('number');
      expect(BEHIND[jenis], jenis).toBeTypeOf('boolean');
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
    for (const kelas of PLAYER_CLASSES) {
      for (const arah of ARAH) {
        const pose = poseFor(kelas.id, arah);
        expect(Math.abs(pose.rotation), `${kelas.id}/${arah}`).toBeLessThan(Math.PI / 2);
      }
    }
  });

  it('tiap kelas punya titik genggam sendiri', () => {
    // Ketiga sprite menaruh tangan di tempat berbeda. Satu tabel untuk semuanya
    // adalah penyebab asli senjata terlihat mengambang.
    for (const kelas of PLAYER_CLASSES) {
      expect(HAND[kelas.id], kelas.id).toBeDefined();
    }
  });

  it('hadap samping menaruh senjata dekat sumbu badan, bukan jauh di luarnya', () => {
    // Ini inti perbaikannya. Tangan yang terlihat pada frame samping ada di
    // sekitar sumbu badan (terukur: -2, -1, +2 untuk ketiga sprite). Versi
    // pertama memakai +6 untuk semuanya, dan selisih 6-8 px itulah celah yang
    // terbaca sebagai senjata melayang di udara.
    for (const kelas of PLAYER_CLASSES) {
      const x = HAND[kelas.id].side.x;
      expect(Math.abs(x), `${kelas.id} samping x=${x}`).toBeLessThanOrEqual(5);
    }
  });

  it('hadap atas memiringkan senjata MENJAUHI badan', () => {
    // Dengan sudut yang tandanya sama seperti hadap bawah, bilahnya condong ke
    // arah badan dan senjatanya hilang sepenuhnya di balik punggung.
    for (const kelas of PLAYER_CLASSES) {
      const atas = HAND[kelas.id].up;
      const bawah = HAND[kelas.id].down;
      expect(atas.x, kelas.id).toBeLessThan(0);
      if (bawah.rotation !== 0) {
        expect(Math.sign(atas.rotation), `${kelas.id} sudut atas`).toBe(-Math.sign(bawah.rotation));
      }
    }
  });

  it('hadap kiri adalah cerminan hadap kanan', () => {
    for (const kelas of PLAYER_CLASSES) {
      const kiri = poseFor(kelas.id, 'left');
      const kanan = poseFor(kelas.id, 'right');
      expect(kiri.x, kelas.id).toBe(-kanan.x);
      expect(kiri.y, kelas.id).toBe(kanan.y);
      expect(kiri.rotation, kelas.id).toBe(-kanan.rotation);
      expect(kiri.flip, kelas.id).toBe(!kanan.flip);
    }
  });

  it('senjata selalu di belakang badan saat membelakangi kamera', () => {
    for (const jenis of JENIS) {
      expect(behindFor(jenis, 'up'), jenis).toBe(true);
    }
  });

  it('busur digambar di belakang badan, pedang di depan', () => {
    // Busur membentang melintasi badan karena digenggam di tengah; di depan ia
    // terlihat seperti ditempelkan di atas karakter. Pedang digenggam di pangkal
    // sehingga gagangnya jatuh di tangan — justru harus di depan agar terlihat
    // bersentuhan.
    expect(BEHIND.bow).toBe(true);
    expect(BEHIND.sword).toBe(false);
  });

  it('kelas tak dikenal tidak melempar', () => {
    expect(() => poseFor('tidak-ada', 'down')).not.toThrow();
  });

  it('durasi ayunan positif', () => {
    expect(WEAPON_TIMING.AYUN_MS).toBeGreaterThan(0);
    expect(WEAPON_TIMING.PULIH_MS).toBeGreaterThan(0);
  });
});
