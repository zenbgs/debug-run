/**
 * Musuh elite — varian acak dari musuh biasa. (SPEC.md §6.3)
 *
 * Ada delapan tipe musuh tapi hanya **empat perilaku**, dan empat di antaranya
 * `chase` polos yang bedanya cuma tint dan angka. Di run panjang — apalagi mode
 * tanpa batas — pemain melawan hal yang sama berjam-jam.
 *
 * Elite tidak menambah sprite baru: ia mengubah musuh yang sudah ada dengan satu
 * sifat menonjol, dan **selalu** memasang cincin berwarna sebagai penanda. Tanpa
 * penanda, musuh yang tiba-tiba menerima tiga kali pukulan terasa seperti bug,
 * bukan seperti tantangan.
 */

export type EliteModifier = {
  id: string;
  name: string;
  /** Pengali HP, kecepatan, ukuran, dan skor. */
  hp: number;
  speed: number;
  scale: number;
  score: number;
  /** Warna cincin penanda di bawah musuh. */
  ringColor: number;
  /**
   * Damage ledakan saat mati, dalam radius `ELITE.BLAST_RADIUS`.
   * 0 = tidak meledak.
   */
  deathBlast: number;
};

export const ELITE = {
  /** Radius ledakan elite peledak. */
  BLAST_RADIUS: 46,
  /** Radius cincin penanda, dikalikan lebar body musuh. */
  RING_SCALE: 0.85,
  /** Peluang elite di wave bernaskah pertama. */
  BASE_CHANCE: 0.0,
  /** Peluang mulai naik dari wave ini. */
  START_WAVE: 4,
  /** Pertambahan peluang per wave setelah `START_WAVE`. */
  CHANCE_PER_WAVE: 0.022,
  /** Batas atas. Di atas ini hampir seluruh layar jadi elite dan penandanya sia-sia. */
  MAX_CHANCE: 0.3,
} as const;

export const ELITES: readonly EliteModifier[] = [
  {
    id: 'tebal',
    name: 'Tebal',
    hp: 2.6,
    speed: 0.85,
    scale: 1.25,
    score: 2.5,
    ringColor: 0xffb03b,
    deathBlast: 0,
  },
  {
    id: 'gesit',
    name: 'Gesit',
    // HP-nya justru di bawah normal: yang cepat harus tetap bisa dijatuhkan cepat,
    // kalau tidak ia cuma melelahkan tanpa menambah ketegangan.
    hp: 0.8,
    speed: 1.7,
    scale: 0.9,
    score: 2,
    ringColor: 0x4de1ff,
    deathBlast: 0,
  },
  {
    id: 'peledak',
    name: 'Peledak',
    hp: 1.4,
    speed: 1,
    scale: 1.1,
    score: 2.5,
    ringColor: 0xff5c5c,
    deathBlast: 22,
  },
];

export const ELITE_BY_ID = new Map(ELITES.map((e) => [e.id, e]));

/**
 * Peluang sebuah spawn menjadi elite pada wave tertentu.
 *
 * Nol untuk wave-wave awal: pemain baru harus mengenali musuh biasa lebih dulu,
 * dan elite di wave 1 hanya terbaca sebagai "kenapa yang ini tidak mati".
 */
export function eliteChance(waveNumber: number): number {
  if (waveNumber < ELITE.START_WAVE) return ELITE.BASE_CHANCE;
  const naik = (waveNumber - ELITE.START_WAVE + 1) * ELITE.CHANCE_PER_WAVE;
  return Math.min(ELITE.MAX_CHANCE, ELITE.BASE_CHANCE + naik);
}
