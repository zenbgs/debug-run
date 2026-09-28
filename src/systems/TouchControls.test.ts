import { describe, expect, it } from 'vitest';
import { TOUCH } from '../data/touch';
import { shouldShowTouchControls, stickVector } from './VirtualInput';

const R = TOUCH.STICK.RADIUS;
const D = TOUCH.STICK.DEADZONE;

describe('stickVector', () => {
  it('jempol diam menghasilkan nol', () => {
    expect(stickVector(0, 0, R, D)).toEqual({ x: 0, y: 0 });
  });

  it('geseran di dalam deadzone diabaikan', () => {
    // Tanpa deadzone, jempol yang cuma menempel membuat karakter merayap sendiri.
    expect(stickVector(D - 1, 0, R, D)).toEqual({ x: 0, y: 0 });
    expect(stickVector(0, -(D - 1), R, D)).toEqual({ x: 0, y: 0 });
  });

  it('dorongan penuh menghasilkan magnitudo tepat 1', () => {
    const v = stickVector(R, 0, R, D);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 5);
    expect(v.x).toBeCloseTo(1, 5);
  });

  it('tidak pernah melebihi 1 meskipun jempol digeser jauh keluar', () => {
    for (const jarak of [R + 1, R * 2, R * 10]) {
      const v = stickVector(jarak, jarak, R, D);
      expect(Math.hypot(v.x, v.y)).toBeLessThanOrEqual(1.00001);
    }
  });

  it('magnitudo dipetakan ulang dari tepi deadzone, bukan melompat', () => {
    // Ini inti perbaikannya. Tanpa pemetaan ulang, melewati deadzone langsung
    // memberi kecepatan D/R — pada nilai default itu 17% dan terasa tersendat.
    const tepat = stickVector(D + 0.01, 0, R, D);
    expect(Math.hypot(tepat.x, tepat.y)).toBeLessThan(0.01);

    const separuh = stickVector(D + (R - D) / 2, 0, R, D);
    expect(Math.hypot(separuh.x, separuh.y)).toBeCloseTo(0.5, 5);
  });

  it('magnitudo naik mulus, tidak pernah mundur', () => {
    let sebelumnya = -1;
    for (let jarak = D; jarak <= R; jarak += 0.5) {
      const m = Math.hypot(...Object.values(stickVector(jarak, 0, R, D)));
      expect(m).toBeGreaterThanOrEqual(sebelumnya);
      sebelumnya = m;
    }
  });

  it('arah dipertahankan persis, tidak disnap ke 8 penjuru', () => {
    // Analog sungguhan: sudut 30 derajat harus tetap 30 derajat.
    const sudut = Math.PI / 6;
    const v = stickVector(Math.cos(sudut) * R, Math.sin(sudut) * R, R, D);
    expect(Math.atan2(v.y, v.x)).toBeCloseTo(sudut, 5);
  });

  it('diagonal penuh tidak lebih cepat dari lurus', () => {
    // Bug klasik input digital: (1,1) berjalan 1,41x lebih cepat.
    const lurus = stickVector(R, 0, R, D);
    const diagonal = stickVector(R, R, R, D);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(
      Math.hypot(lurus.x, lurus.y),
      5
    );
  });

  it('bekerja di keempat kuadran', () => {
    for (const [sx, sy] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      const v = stickVector(sx * R, sy * R, R, D);
      expect(Math.sign(v.x)).toBe(sx);
      expect(Math.sign(v.y)).toBe(sy);
    }
  });
});

describe('shouldShowTouchControls', () => {
  // Versi pertama memakai `'ontouchstart' in window`, yang bernilai true di Chrome
  // desktop Windows — dan terukur memasang joystick di layar 1280x720 tanpa
  // emulasi apa pun. Tes ini mengunci perbaikannya.
  it('ponsel: alat tunjuk utama kasar -> tampil', () => {
    expect(shouldShowTouchControls(true, true, 5)).toBe(true);
  });

  it('desktop: alat tunjuk utama halus -> TIDAK tampil, meski melapor bisa disentuh', () => {
    expect(shouldShowTouchControls(false, true, 10)).toBe(false);
    expect(shouldShowTouchControls(false, true, 0)).toBe(false);
  });

  it('laptop layar sentuh dianggap desktop — pemiliknya punya keyboard', () => {
    expect(shouldShowTouchControls(false, true, 10)).toBe(false);
  });

  it('tanpa matchMedia, jatuh ke jumlah titik sentuh', () => {
    expect(shouldShowTouchControls(false, false, 5)).toBe(true);
    expect(shouldShowTouchControls(false, false, 0)).toBe(false);
  });
});

describe('tata letak kontrol sentuh', () => {
  const { WIDTH, HEIGHT } = { WIDTH: 480, HEIGHT: 270 };

  it('semua tombol berada di dalam layar', () => {
    for (const b of TOUCH.BUTTONS) {
      expect(b.x - b.radius, `${b.id} keluar kiri`).toBeGreaterThanOrEqual(0);
      expect(b.x + b.radius, `${b.id} keluar kanan`).toBeLessThanOrEqual(WIDTH);
      expect(b.y - b.radius, `${b.id} keluar atas`).toBeGreaterThanOrEqual(0);
      expect(b.y + b.radius, `${b.id} keluar bawah`).toBeLessThanOrEqual(HEIGHT);
    }
    expect(TOUCH.PAUSE.x + TOUCH.PAUSE.radius).toBeLessThanOrEqual(WIDTH);
  });

  it('tombol tidak saling tumpang tindih', () => {
    // Tombol yang bertindihan berarti satu ketukan memicu dua aksi sekaligus.
    for (let i = 0; i < TOUCH.BUTTONS.length; i++) {
      for (let j = i + 1; j < TOUCH.BUTTONS.length; j++) {
        const a = TOUCH.BUTTONS[i];
        const b = TOUCH.BUTTONS[j];
        const jarak = Math.hypot(a.x - b.x, a.y - b.y);
        expect(jarak, `${a.id} bertindihan dengan ${b.id}`).toBeGreaterThan(
          a.radius + b.radius
        );
      }
    }
  });

  it('tombol aksi tidak mengganggu zona stik', () => {
    // Jempol kiri hanya untuk gerak; tombol yang masuk zona stik membuat stik
    // gagal terbuka karena sentuhannya diklaim tombol.
    const batas = 480 * TOUCH.STICK.ZONE_RATIO;
    for (const b of TOUCH.BUTTONS) {
      expect(b.x - b.radius, `${b.id} masuk zona stik`).toBeGreaterThan(batas);
    }
  });

  it('tidak ada tombol yang menutupi HUD di bagian atas layar', () => {
    // HUD (HP, wave, skor) membentang sampai y=30.
    for (const b of TOUCH.BUTTONS) {
      expect(b.y - b.radius, `${b.id} menutupi HUD`).toBeGreaterThan(30);
    }
  });

  it('deadzone lebih kecil dari radius, kalau tidak stik mati total', () => {
    expect(TOUCH.STICK.DEADZONE).toBeGreaterThan(0);
    expect(TOUCH.STICK.DEADZONE).toBeLessThan(TOUCH.STICK.RADIUS);
  });

  it('melacak cukup sentuhan untuk stik + dua tombol sekaligus', () => {
    expect(TOUCH.MAX_POINTERS).toBeGreaterThanOrEqual(3);
  });
});
