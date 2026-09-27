/**
 * Dua skill berpendingin. (SPEC.md §5.2)
 *
 * Skill memakai bentuk data yang sama dengan langkah combo (`AttackStep`), jadi
 * seluruh jalur resolusi hitbox, knockback, hitstop, dan screen shake di
 * `CombatSystem` dipakai ulang apa adanya — tidak ada cabang khusus skill.
 * Bedanya hanya: punya cooldown, tidak memajukan combo, dan boleh membuat terpaku.
 */

import type { AttackStep } from './combat';
import { SHEETS } from './frames';

export type SkillId = 'purge' | 'shock';

export type Skill = {
  id: SkillId;
  name: string;
  /** Ditampilkan di HUD. */
  hotkey: string;
  cooldownMs: number;
  step: AttackStep;
};

export const SKILLS: readonly Skill[] = [
  {
    id: 'purge',
    name: 'Purge',
    hotkey: 'K',
    cooldownMs: 6000,
    step: {
      name: 'purge',
      damage: 25,
      // AoE melingkar yang jauh lebih luas daripada finisher combo (r=40).
      shape: { type: 'circle', radius: 44 },
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
    hotkey: 'L',
    cooldownMs: 9000,
    step: {
      name: 'shock',
      damage: 18,
      /**
       * Garis panjang searah hadap yang menembus semua musuh di jalurnya —
       * `resolveAttack` memang sudah mengenai setiap musuh yang bertumpang tindih,
       * jadi efek tembus didapat gratis.
       */
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

/**
 * Sprite `electro-shock` adalah semburan petir **vertikal** dari satu titik, bukan
 * sinar mendatar. Supaya cocok dengan hitbox garis, FX-nya dimunculkan beberapa kali
 * di sepanjang garis alih-alih diputar menyamping (yang akan terlihat salah).
 */
export const SHOCK_FX_STEPS: readonly number[] = [0.2, 0.55, 0.9];
