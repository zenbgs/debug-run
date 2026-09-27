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

export type PlayerClass = {
  id: string;
  name: string;
  /** Julukan pendek untuk layar pilih karakter. */
  title: string;
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

  /** Hanya dipakai `attackStyle: 'ranged'`. */
  projectileSpeed?: number;
  /** Jangkauan panah sebelum hilang, dalam piksel. */
  projectileRange?: number;

  /** Dua skill milik kelas ini: slot 1 (tombol K) dan slot 2 (tombol L/Q). */
  skills: readonly [SkillId, SkillId];

  /** Tiga baris ringkas untuk kartu pilihan. */
  highlights: readonly string[];
};

export const PLAYER_CLASSES: readonly PlayerClass[] = [
  {
    id: 'warrior',
    name: 'Warrior',
    title: 'Penjaga Barisan',
    description:
      'Tebal, kuat, dan bertarung rapat. Pukulannya melempar bug jauh-jauh,\nsehingga ia bisa berdiri di tengah kerumunan tanpa langsung tumbang.',
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
    highlights: ['HP 130 (tertebal)', 'Damage pukul +20%', 'Gerak agak lambat'],
  },
  {
    id: 'archer',
    name: 'Archer',
    title: 'Mata Jauh',
    description:
      'Menembak panah dari jarak aman dan bergerak paling gesit.\nRapuh kalau kena, jadi jarak adalah nyawanya.',
    texture: SHEETS.PLAYER_PIRATEGIRL.key,
    attackStyle: 'ranged',
    maxHp: 85,
    speedMultiplier: 1.18,
    damageMultiplier: 0.9,
    skillDamageMultiplier: 1,
    recoveryMultiplier: 0.85,
    skillCooldownMultiplier: 1,
    dashCooldownMultiplier: 0.8,
    projectileSpeed: 300,
    projectileRange: 190,
    skills: ['volley', 'pinshot'],
    highlights: ['Serang jarak jauh', 'Tergesit, dash cepat', 'HP 85 (rapuh)'],
  },
  {
    id: 'mage',
    name: 'Mage',
    title: 'Pembaca Mantra',
    description:
      'Pukulannya lemah, tapi Purge dan Shock menyala dua kali lebih sering\ndan jauh lebih keras. Bermainlah dengan skill, bukan dengan tongkat.',
    texture: SHEETS.PLAYER_BLONDKID.key,
    attackStyle: 'melee',
    maxHp: 75,
    speedMultiplier: 1.05,
    damageMultiplier: 0.65,
    skillDamageMultiplier: 1.9,
    recoveryMultiplier: 1.1,
    skillCooldownMultiplier: 0.5,
    dashCooldownMultiplier: 1,
    skills: ['purge', 'shock'],
    highlights: ['Skill 2x lebih sering', 'Damage skill +90%', 'HP 75 (terapuh)'],
  },
];

export const CLASS_BY_ID = new Map(PLAYER_CLASSES.map((c) => [c.id, c]));

export const DEFAULT_CLASS_ID = 'warrior';

export function getClass(id: string | undefined): PlayerClass {
  return CLASS_BY_ID.get(id ?? DEFAULT_CLASS_ID) ?? PLAYER_CLASSES[0];
}
