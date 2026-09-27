/**
 * Skill berpendingin. **Setiap kelas punya sepasang skill sendiri** — tidak ada
 * yang dipakai bersama, supaya pilihan kelas benar-benar mengubah cara bermain.
 * (SPEC.md §5.2)
 *
 * Skill bertipe `hitbox` memakai bentuk data yang sama dengan langkah combo
 * (`AttackStep`), jadi seluruh jalur resolusi hitbox, knockback, hitstop, dan
 * screen shake di `CombatSystem` dipakai ulang apa adanya.
 *
 * Skill bertipe `volley` menembakkan panah, memakai jalur proyektil yang sama
 * dengan serangan dasar Archer.
 */

import type { AttackStep } from './combat';
import { SHEETS } from './frames';

export type SkillId = 'purge' | 'shock' | 'cleave' | 'warcry' | 'volley' | 'pinshot';

export type VolleyConfig = {
  /** Jumlah panah per tembakan. */
  count: number;
  /** Total sebaran sudut, radian. */
  spread: number;
  speed: number;
  range: number;
  damage: number;
  /** Panah menembus musuh alih-alih hancur saat kena. */
  pierce: boolean;
  stunMs?: number;
};

export type Skill = {
  id: SkillId;
  name: string;
  /** Ringkasan satu baris untuk layar pilih kelas. */
  blurb: string;
  cooldownMs: number;
} & (
  | { kind: 'hitbox'; step: AttackStep }
  | { kind: 'volley'; volley: VolleyConfig; windupMs: number; recoveryMs: number }
);

/** Nilai bersama supaya skill sejenis terasa konsisten. */
const HITSTOP_BERAT = 140;

export const SKILLS: readonly Skill[] = [
  // ---------------- WARRIOR ----------------
  {
    id: 'cleave',
    name: 'Cleave',
    blurb: 'Tebasan memutar, melempar semua yang dekat',
    cooldownMs: 5500,
    kind: 'hitbox',
    step: {
      name: 'cleave',
      damage: 30,
      shape: { type: 'circle', radius: 46 },
      fxKey: SHEETS.FX_SLASH_CIRCULAR.key,
      fxOffset: 0,
      fxScale: 1.6,
      recoveryMs: 400,
      windupMs: 70,
      // Ciri khas Warrior: dorongan terkuat di permainan.
      knockback: 460,
      hitstopMs: HITSTOP_BERAT,
      shakeIntensity: 0.007,
    },
  },
  {
    id: 'warcry',
    name: 'Warcry',
    blurb: 'Teriakan yang memakukan musuh sekitar 1,4 detik',
    cooldownMs: 10000,
    kind: 'hitbox',
    step: {
      name: 'warcry',
      damage: 10,
      shape: { type: 'circle', radius: 62 },
      fxKey: SHEETS.FX_ENERGY_FIELD.key,
      fxOffset: 0,
      fxScale: 2.4,
      recoveryMs: 460,
      windupMs: 90,
      knockback: 120,
      hitstopMs: HITSTOP_BERAT,
      shakeIntensity: 0.009,
      stunMs: 1400,
    },
  },

  // ---------------- ARCHER ----------------
  {
    id: 'volley',
    name: 'Volley',
    blurb: 'Sembilan panah menyebar sekaligus',
    cooldownMs: 6000,
    kind: 'volley',
    windupMs: 80,
    recoveryMs: 420,
    volley: { count: 9, spread: 1.15, speed: 300, range: 200, damage: 11, pierce: false },
  },
  {
    id: 'pinshot',
    name: 'Pin Shot',
    blurb: 'Panah tembus yang memaku sasaran 1 detik',
    cooldownMs: 9000,
    kind: 'volley',
    windupMs: 90,
    recoveryMs: 440,
    volley: {
      count: 1,
      spread: 0,
      speed: 420,
      range: 280,
      damage: 24,
      // Menembus: satu tembakan bisa memaku sebaris musuh.
      pierce: true,
      stunMs: 1000,
    },
  },

  // ---------------- MAGE ----------------
  {
    id: 'purge',
    name: 'Purge',
    blurb: 'Ledakan sihir melingkar di sekeliling diri',
    cooldownMs: 6000,
    kind: 'hitbox',
    step: {
      name: 'purge',
      damage: 25,
      shape: { type: 'circle', radius: 50 },
      fxKey: SHEETS.FX_SLASH_CIRCULAR.key,
      fxOffset: 0,
      fxScale: 1.5,
      recoveryMs: 420,
      windupMs: 70,
      knockback: 340,
      hitstopMs: 130,
      shakeIntensity: 0.006,
    },
  },
  {
    id: 'shock',
    name: 'Shock',
    blurb: 'Petir lurus menembus, memakukan yang terkena',
    cooldownMs: 9000,
    kind: 'hitbox',
    step: {
      name: 'shock',
      damage: 18,
      shape: { type: 'rect', width: 96, height: 22, reach: 56 },
      fxKey: SHEETS.FX_ELECTRO_SHOCK.key,
      fxOffset: 0,
      fxScale: 0.55,
      recoveryMs: 480,
      windupMs: 90,
      knockback: 120,
      hitstopMs: 150,
      shakeIntensity: 0.008,
      stunMs: 800,
    },
  },
];

export const SKILL_BY_ID = new Map(SKILLS.map((skill) => [skill.id, skill]));

export function getSkill(id: SkillId): Skill {
  const skill = SKILL_BY_ID.get(id);
  if (!skill) throw new Error(`Skill tidak dikenal: "${id}"`);
  return skill;
}

/**
 * Sprite `electro-shock` adalah semburan petir **vertikal** dari satu titik, bukan
 * sinar mendatar. Supaya cocok dengan hitbox garis, FX-nya dimunculkan beberapa kali
 * di sepanjang garis alih-alih diputar menyamping (yang akan terlihat salah).
 */
export const SHOCK_FX_STEPS: readonly number[] = [0.2, 0.55, 0.9];

/** Tombol untuk slot skill pertama dan kedua. */
export const SKILL_HOTKEYS: readonly string[] = ['K', 'L'];
