/**
 * Kelas karakter yang bisa dipilih sebelum bermain.
 *
 * ⚠️ Legacy Collection hanya menyediakan **3 sprite karakter tampak-atas**
 * (`Top-Down-16-bit-fantasy/Characters pack 1`). Karena itu ada tepat 3 kelas —
 * masing-masing memakai sprite sendiri, bukan varian tint. Menambah kelas ke-4
 * berarti mendaur ulang sprite yang sudah dipakai, dan dua kelas dengan sprite
 * identik justru membingungkan saat bermain.
 *
 * Ketiganya dibedakan secara mekanik, bukan sekadar angka: Warrior bertarung
 * jarak dekat, Archer menembak dari jauh, Mage lemah memukul tapi skill-nya
 * jauh lebih sering dan lebih keras.
 */

import { SHEETS } from './frames';
import type { SkillId } from './skills';

/** Cara serangan dasar bekerja. Ini pembeda mekanik utama antar kelas. */
export type AttackStyle = 'melee' | 'ranged';

/** Proyektil serangan dasar milik kelas jarak jauh. */
export type ProjectileConfig = {
  texture: string;
  speed: number;
  /** Jarak tempuh sebelum hilang, dalam piksel. */
  range: number;
  bodyWidth: number;
  bodyHeight: number;
  scale: number;
  /** Sprite beranimasi (bola api berkedip) atau diam (panah). */
  animated: boolean;
};

/** Satu FX serangan dasar. */
export type AttackFx = {
  key: string;
  scale: number;
  /** Jarak FX dari badan pemain, searah hadap. */
  offset: number;
  /**
   * `true` = FX diputar mengikuti arah hadap (cocok untuk bentuk memanjang).
   * `false` = selalu tegak (cocok untuk ledakan radial).
   */
  rotates: boolean;
};

export type PlayerClass = {
  id: string;
  name: string;
  /** Julukan pendek untuk layar pilih karakter. */
  title: string;
  /**
   * Kalimat panjang untuk panel detail di layar pilih kelas.
   *
   * ⚠️ **Jangan dipenggal manual** dengan baris baru. Panel itu memakai
   * word-wrap, dan mencampur keduanya menghasilkan baris yatim — aturan yang
   * sama seperti naskah di `story.ts`. Dulu Warrior dan Archer dipenggal manual
   * sementara Mage tidak, dan karena panelnya belum punya word-wrap, deskripsi
   * Mage terukur melebar 756 px di layar 480 px: meluber keluar di kedua sisi.
   */
  description: string;
  texture: string;
  attackStyle: AttackStyle;

  maxHp: number;
  speedMultiplier: number;
  /** Pengali damage serangan dasar (combo). */
  damageMultiplier: number;
  /** Pengali damage skill Purge & Shock. */
  skillDamageMultiplier: number;
  /** Pengali masa pemulihan serangan. < 1 = memukul lebih cepat. */
  recoveryMultiplier: number;
  /** Pengali pendinginan skill. < 1 = skill lebih sering. */
  skillCooldownMultiplier: number;
  /** Pengali pendinginan dash. */
  dashCooldownMultiplier: number;

  /**
   * Wajib untuk `attackStyle: 'ranged'`. Tiap kelas jarak jauh punya proyektil
   * sendiri — Archer melesatkan panah jauh, Mage melempar bola api jarak pendek.
   */
  projectile?: ProjectileConfig;

  /** Dua skill milik kelas ini: slot 1 (tombol K) dan slot 2 (tombol L/Q). */
  skills: readonly [SkillId, SkillId];

  /**
   * FX serangan dasar, satu entri per langkah combo.
   * Kalau kosong, dipakai FX bawaan langkah combo di `data/combat.ts`.
   *
   * Ini yang membuat pukulan tiap kelas terlihat berbeda: Warrior mengayun baja,
   * Mage melepas sihir. Tanpa ini keduanya memakai sprite slash yang sama persis.
   */
  attackFx?: readonly AttackFx[];

  /**
   * Efek yang muncul di badan musuh saat serangan kelas ini mengenai.
   *
   * Wajib berbeda antar kelas: sebelumnya semuanya memakai `FX_HIT` yang sama,
   * jadi ayunan baja, panah, dan bola api terasa identik saat mendarat.
   */
  hitFx: string;

  /** Tiga baris ringkas untuk kartu pilihan. */
  highlights: readonly string[];
};

export const PLAYER_CLASSES: readonly PlayerClass[] = [
  {
    id: 'warrior',
    name: 'Warrior',
    title: 'Penjaga Barisan',
    description:
      'Tebal, kuat, dan bertarung rapat. Pukulannya melempar bug jauh-jauh, ' +
      'sehingga ia bisa berdiri di tengah kerumunan tanpa langsung tumbang.',
    texture: SHEETS.PLAYER.key,
    attackStyle: 'melee',
    maxHp: 130,
    speedMultiplier: 0.95,
    damageMultiplier: 1.2,
    skillDamageMultiplier: 1,
    recoveryMultiplier: 1,
    skillCooldownMultiplier: 1,
    dashCooldownMultiplier: 1,
    skills: ['cleave', 'warcry'],
    hitFx: SHEETS.FX_HIT_SLASH.key,
    // Warrior memakai FX slash baja bawaan combo.
    highlights: ['HP 130 (tertebal)', 'Damage pukul +20%', 'Gerak agak lambat'],
  },
  {
    id: 'archer',
    name: 'Archer',
    title: 'Mata Jauh',
    description:
      'Menembak panah dari jarak aman dan bergerak paling gesit. ' +
      'Rapuh kalau kena, jadi jarak adalah nyawanya.',
    texture: SHEETS.PLAYER_PIRATEGIRL.key,
    attackStyle: 'ranged',
    maxHp: 85,
    speedMultiplier: 1.18,
    damageMultiplier: 0.9,
    skillDamageMultiplier: 1,
    recoveryMultiplier: 0.85,
    skillCooldownMultiplier: 1,
    dashCooldownMultiplier: 0.8,
    projectile: {
      texture: SHEETS.PLAYER_ARROW.key,
      speed: 300,
      range: 190,
      bodyWidth: 10,
      bodyHeight: 6,
      scale: 1,
      animated: false,
    },
    skills: ['volley', 'pinshot'],
    hitFx: SHEETS.FX_HIT_PIERCE.key,
    highlights: ['Serang jarak jauh', 'Tergesit & lincah', 'HP 85 (rapuh)'],
  },
  {
    // ⚠️ Disetel dua kali setelah DIUKUR, bukan ditebak.
    //
    // Bot-play 5x per kelas menunjukkan Mage timpang jauh: skor 206 lawan 710
    // milik Warrior, bertahan 31 detik lawan 86 detik.
    //
    // Percobaan pertama menaikkan jangkauan 95 -> 125 dan HP 75 -> 82. Nyaris
    // tidak berpengaruh: 206 -> 213, dan waktu bertahan tidak bergerak sama
    // sekali (31,1 -> 31,2 detik). Pengukuran ulang menunjukkan alasannya —
    // waktu bertahan berbanding LURUS dengan HP: 82/130 = 0,63 dan 31,2/49,4 =
    // 0,63. Jangkauan tidak melindungi apa pun, karena arah hadap mengikuti arah
    // gerak sehingga kiting mustahil; musuh selalu berhasil menempel.
    //
    // Karena itu yang dinaikkan sekarang adalah ketebalan dan kecepatan
    // membunuh, bukan jarak. Mage kini lebih tebal dari Archer: Archer-lah yang
    // rapuh-tapi-jauh, Mage penyihir jarak menengah yang harus tahan dipukul.
    id: 'mage',
    name: 'Mage',
    title: 'Pembaca Mantra',
    description:
      'Melempar bola api jarak pendek, jadi tetap harus mendekat. ' +
      'Purge dan Shock menyala dua kali lebih sering dan lebih keras.',
    texture: SHEETS.PLAYER_BLONDKID.key,
    attackStyle: 'ranged',
    maxHp: 95,
    speedMultiplier: 1.05,
    damageMultiplier: 0.9,
    projectile: {
      texture: SHEETS.PLAYER_FIREBALL.key,
      // Sengaja jauh lebih pendek dan lebih lambat dari panah Archer: Mage tetap
      // harus mendekat, bukan menembak dari seberang arena.
      speed: 265,
      range: 125,
      bodyWidth: 14,
      bodyHeight: 10,
      scale: 0.85,
      animated: true,
    },
    skillDamageMultiplier: 1.9,
    recoveryMultiplier: 1,
    skillCooldownMultiplier: 0.5,
    dashCooldownMultiplier: 1,
    skills: ['purge', 'shock'],
    hitFx: SHEETS.FX_HIT_ARCANE.key,
    // Mage tidak mengayun senjata sama sekali.
    // Kilatan merapal di badan pemain; bola api yang melesat adalah proyektilnya.
    attackFx: [
      { key: SHEETS.FX_ARCANE_CRESCENT.key, scale: 0.9, offset: 12, rotates: true },
      { key: SHEETS.FX_ARCANE_CRESCENT.key, scale: 1.1, offset: 12, rotates: true },
      { key: SHEETS.FX_ARCANE_BLAST.key, scale: 0.9, offset: 6, rotates: true },
    ],
    highlights: ['Bola api pendek', 'Skill 2x sering', 'HP 95, jarak dekat'],
  },
];

export const CLASS_BY_ID = new Map(PLAYER_CLASSES.map((c) => [c.id, c]));

export const DEFAULT_CLASS_ID = 'warrior';

export function getClass(id: string | undefined): PlayerClass {
  return CLASS_BY_ID.get(id ?? DEFAULT_CLASS_ID) ?? PLAYER_CLASSES[0];
}
