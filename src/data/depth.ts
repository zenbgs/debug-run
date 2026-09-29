/**
 * Urutan lapisan gambar, dipakai bersama scene dan sistem.
 *
 * Dulu tinggal di `GameScene`, tapi sistem yang dipecah keluar (HUD, proyektil,
 * arena) semuanya perlu angka yang sama. Menyalinnya ke tiap berkas adalah cara
 * paling pasti untuk membuat dua lapisan diam-diam bertukar tempat.
 */
export const DEPTH = {
  GROUND: 0,
  OBJECTS: 5,
  /**
   * Permata jatuhan: di atas peta, tapi DI BAWAH musuh dan pemain.
   *
   * Kalau di atas musuh, permata menutupi hal yang sedang berusaha membunuhmu.
   */
  PICKUP: 6,
  ENEMY: 8,
  /** Proyektil pemain terbang tepat di bawah pemain. */
  PLAYER_PROJECTILE: 9,
  PLAYER: 10,
  DEBUG: 99,
  HUD: 100,
} as const;
