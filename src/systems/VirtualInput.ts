/**
 * Bagian input virtual yang **tidak menyentuh Phaser**.
 *
 * Dipisah dari `TouchControls.ts` bukan demi kerapian: `TouchControls` meng-import
 * Phaser, dan Phaser butuh `window` saat dimuat. Selama fungsi ini tinggal di sana,
 * berkas tesnya gagal *dikumpulkan* dengan "window is not defined" — dan ringkasan
 * vitest melaporkannya sebagai nol tes, bukan sebagai kegagalan yang terlihat.
 */

/**
 * Input yang bisa dibaca `Player` selain keyboard.
 * `moveX`/`moveY` bersifat **analog**: panjang vektornya 0..1, bukan 0 atau 1.
 */
export type VirtualInput = {
  moveX: number;
  moveY: number;
  attack: boolean;
  skill1: boolean;
  skill2: boolean;
  dash: boolean;
};

/**
 * Ubah geseran jempol jadi vektor gerak.
 *
 * Yang penting di sini: setelah melewati deadzone, magnitudo dipetakan ulang dari
 * `[deadzone..radius]` ke `[0..1]`. Tanpa pemetaan itu, karakter **melompat** ke
 * kecepatan `deadzone/radius` begitu jempol melewati ambang — pada nilai default
 * itu 17% kecepatan penuh, dan terasa seperti kontrol yang tersendat.
 */
export function stickVector(
  dx: number,
  dy: number,
  radius: number,
  deadzone: number
): { x: number; y: number } {
  const panjang = Math.hypot(dx, dy);
  if (panjang <= deadzone) return { x: 0, y: 0 };

  const terpotong = Math.min(panjang, radius);
  const magnitudo = (terpotong - deadzone) / (radius - deadzone);
  return { x: (dx / panjang) * magnitudo, y: (dy / panjang) * magnitudo };
}

/**
 * Keputusan murni: tampilkan kontrol sentuh di layar?
 *
 * Yang ditanyakan bukan "apakah perangkat ini bisa disentuh", tapi **"apakah jari
 * adalah alat tunjuk utamanya"**. Bedanya nyata:
 *
 *  - `'ontouchstart' in window` bernilai **true di Chrome desktop Windows**.
 *    Versi pertama memakai itu dan terukur memasang joystick di layar desktop
 *    1280x720 tanpa emulasi apa pun.
 *  - `navigator.maxTouchPoints` bernilai 10 di laptop layar sentuh, padahal
 *    pemiliknya punya keyboard dan trackpad.
 *
 * `(pointer: coarse)` menjawab pertanyaan yang benar: ia hanya true kalau alat
 * tunjuk UTAMA-nya kasar, yaitu jari.
 */
export function shouldShowTouchControls(
  pointerKasar: boolean,
  matchMediaTersedia: boolean,
  maxTouchPoints: number
): boolean {
  if (matchMediaTersedia) return pointerKasar;
  // Peramban sangat lama tanpa matchMedia: tebakan terbaik yang tersisa.
  return maxTouchPoints > 0;
}

/** Apakah kontrol sentuh perlu ditampilkan di perangkat ini. */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;

  const adaMatchMedia = typeof window.matchMedia === 'function';
  const kasar = adaMatchMedia ? window.matchMedia('(pointer: coarse)').matches : false;
  const titikSentuh = typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0;

  return shouldShowTouchControls(kasar, adaMatchMedia, titikSentuh);
}
