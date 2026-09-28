/**
 * Upgrade yang ditawarkan di antara wave. Pemain memilih 1 dari 3. (SPEC.md §3)
 *
 * Setiap upgrade WAJIB benar-benar terpasang ke stat pemain — tidak ada entri
 * hiasan. `apply` di bawah adalah satu-satunya tempat efeknya ditulis.
 *
 * ⚠️ **Kolam harus tetap punya pilihan sampai kapan pun.** Mode tanpa batas bisa
 * berjalan puluhan wave, dan versi sebelumnya hanya punya 3 upgrade tanpa batas
 * stack: terukur, setelah ~32 kali memilih (sekitar wave 33) layar upgrade
 * menawarkan tiga hal yang sama selamanya, dan salah satunya murni penyembuhan.
 * Karena itu ada kelompok SKALA di bawah — sengaja tak terbatas dan naik kecil,
 * supaya bagian terpanjang sebuah run tetap punya keputusan.
 */

import type { AttackStyle } from './classes';

export type PlayerStats = {
  /** Pengali damage semua serangan. */
  damageMultiplier: number;
  /** Pengali kecepatan gerak. */
  speedMultiplier: number;
  /** Pengali masa pemulihan serangan. < 1 berarti memukul lebih cepat. */
  recoveryMultiplier: number;
  /** Pengali ukuran hitbox serangan. */
  rangeMultiplier: number;
  /** HP maksimum saat ini. */
  maxHp: number;
  /** Porsi damage yang dikembalikan jadi HP. 0 = tidak ada. */
  lifesteal: number;

  // --- Upgrade yang mengubah cara main, bukan sekadar angka ---
  /** Dash melukai musuh yang dilewati. 0 = dash murni mobilitas. */
  dashDamage: number;
  /** Musuh yang mati meledak dan melukai sekitarnya. 0 = tidak meledak. */
  deathBlastDamage: number;
  /** Porsi damage kontak yang dipantulkan ke musuh yang menabrak. */
  thorns: number;

  /** Proyektil tambahan tiap tembakan dasar. Hanya berarti untuk kelas jarak jauh. */
  projectileBonus: number;
  /** Serangan dasar jarak jauh menembus musuh. */
  piercing: boolean;
  /** Pengali pendinginan skill. < 1 berarti lebih sering. */
  skillCooldownMultiplier: number;
  /** Pengali pendinginan dash. < 1 berarti lebih sering. */
  dashCooldownMultiplier: number;
  /** HP yang dipulihkan otomatis di awal tiap wave. */
  waveHeal: number;
  /** Damage sambaran ke musuh terdekat tiap kali membunuh. 0 = tidak menyambar. */
  chainDamage: number;
};

export function createBaseStats(maxHp: number): PlayerStats {
  return {
    damageMultiplier: 1,
    speedMultiplier: 1,
    recoveryMultiplier: 1,
    rangeMultiplier: 1,
    maxHp,
    lifesteal: 0,
    dashDamage: 0,
    deathBlastDamage: 0,
    thorns: 0,
    projectileBonus: 0,
    piercing: false,
    skillCooldownMultiplier: 1,
    dashCooldownMultiplier: 1,
    waveHeal: 0,
    chainDamage: 0,
  };
}

/**
 * Kelangkaan menentukan bobot munculnya, bukan kekuatannya secara langsung.
 *
 * `langka` dipakai untuk upgrade yang **mengubah cara main**, bukan yang menaikkan
 * angka. Kalau bobotnya sama dengan yang biasa, upgrade penentu build akan muncul
 * di hampir tiap tawaran dan tidak terasa seperti temuan.
 */
export type Rarity = 'umum' | 'langka';

export type Upgrade = {
  id: string;
  name: string;
  description: string;
  /** Mengubah stat. Penyembuhan langsung ditangani lewat `healFlat`. */
  apply: (stats: PlayerStats) => void;
  /** HP yang langsung dipulihkan saat upgrade diambil. */
  healFlat?: number;
  /** Batas berapa kali upgrade ini boleh diambil. `undefined` = tak terbatas. */
  maxStacks?: number;
  rarity?: Rarity;
  /**
   * Hanya ditawarkan ke kelas dengan gaya serang ini.
   *
   * "Tembakan Pecah" untuk Warrior adalah pilihan mati — pemain membuangnya
   * setiap kali muncul, dan itu memangkas tawaran dari 3 jadi efektif 2.
   */
  onlyFor?: AttackStyle;
};

/** Bobot pengundian per kelangkaan. */
export const RARITY_WEIGHT: Record<Rarity, number> = {
  umum: 10,
  langka: 3,
};

/**
 * Radius efek untuk upgrade yang mengubah cara main.
 * Dipisah dari daftar upgrade supaya gampang di-tune.
 */
export const UPGRADE_FX = {
  DASH_HIT_RADIUS: 22,
  DEATH_BLAST_RADIUS: 34,
  /** Jangkauan sambaran rantai dari musuh yang baru mati. */
  CHAIN_RADIUS: 78,
} as const;

export const UPGRADES: readonly Upgrade[] = [
  // ------------------------------------------------------------ angka dasar
  {
    id: 'sharp-blade',
    name: 'Pisau Tajam',
    description: '+25% damage',
    apply: (s) => {
      s.damageMultiplier += 0.25;
    },
  },
  {
    id: 'light-boots',
    name: 'Sepatu Ringan',
    description: '+15% kecepatan gerak',
    apply: (s) => {
      s.speedMultiplier += 0.15;
    },
    maxStacks: 4,
  },
  {
    id: 'quick-hands',
    name: 'Tangan Cepat',
    description: 'memukul 15% lebih cepat',
    apply: (s) => {
      // Dikalikan, bukan dikurangi, supaya tidak pernah tembus nol.
      s.recoveryMultiplier *= 0.85;
    },
    maxStacks: 5,
  },
  {
    id: 'long-reach',
    name: 'Jangkauan',
    description: '+20% jangkauan pukulan',
    apply: (s) => {
      s.rangeMultiplier += 0.2;
    },
    maxStacks: 3,
  },
  {
    id: 'armor',
    name: 'Zirah',
    description: '+25 HP maks, pulih 25',
    apply: (s) => {
      s.maxHp += 25;
    },
    healFlat: 25,
  },
  {
    id: 'patch',
    name: 'Hotfix',
    description: 'pulih 45 HP sekarang',
    healFlat: 45,
    apply: () => {
      // Murni penyembuhan — tidak mengubah stat.
    },
  },

  // ------------------------------------------------- mengubah cara bermain
  {
    id: 'sharp-dash',
    name: 'Dash Tajam',
    description: 'dash melukai yang dilewati',
    apply: (s) => {
      // Menumpuk, tapi tambahan pertamalah yang mengubah cara main:
      // dash berubah dari tombol panik jadi bagian dari irama menyerang.
      s.dashDamage += 22;
    },
    maxStacks: 4,
    rarity: 'langka',
  },
  {
    id: 'death-blast',
    name: 'Ledakan Akhir',
    description: 'musuh mati meledak',
    apply: (s) => {
      s.deathBlastDamage += 14;
    },
    maxStacks: 4,
    rarity: 'langka',
  },
  {
    id: 'chain-spark',
    name: 'Percik Rantai',
    description: 'musuh mati menyambar terdekat',
    apply: (s) => {
      s.chainDamage += 16;
    },
    maxStacks: 3,
    rarity: 'langka',
  },
  {
    id: 'thorns',
    name: 'Duri',
    description: '60% damage kontak dipantulkan',
    apply: (s) => {
      s.thorns += 0.6;
    },
    maxStacks: 3,
    rarity: 'langka',
  },
  {
    id: 'vampiric',
    name: 'Vampirik',
    description: '8% damage jadi HP',
    apply: (s) => {
      s.lifesteal += 0.08;
    },
    maxStacks: 4,
  },
  {
    id: 'swift-cast',
    name: 'Mantra Cepat',
    description: 'skill 20% lebih sering',
    apply: (s) => {
      s.skillCooldownMultiplier *= 0.8;
    },
    maxStacks: 4,
    rarity: 'langka',
  },
  {
    id: 'quick-step',
    name: 'Langkah Sigap',
    description: 'dash 20% lebih sering',
    apply: (s) => {
      s.dashCooldownMultiplier *= 0.8;
    },
    maxStacks: 3,
  },
  {
    id: 'field-kit',
    name: 'Kotak P3K',
    description: 'pulih 12 HP tiap wave baru',
    apply: (s) => {
      s.waveHeal += 12;
    },
    maxStacks: 3,
  },

  // ------------------------------------------------------ khusus jarak jauh
  {
    id: 'split-shot',
    name: 'Tembakan Pecah',
    description: '+1 proyektil tiap tembak',
    apply: (s) => {
      s.projectileBonus += 1;
    },
    maxStacks: 2,
    rarity: 'langka',
    onlyFor: 'ranged',
  },
  {
    id: 'piercing-shot',
    name: 'Tembakan Tembus',
    description: 'proyektil menembus musuh',
    apply: (s) => {
      s.piercing = true;
    },
    maxStacks: 1,
    rarity: 'langka',
    onlyFor: 'ranged',
  },

  // ------------------------------------------------------------ khusus melee
  {
    id: 'heavy-swing',
    name: 'Ayunan Berat',
    description: '+35% damage, gerak -8%',
    apply: (s) => {
      // Ada harganya. Upgrade tanpa kerugian membuat tiap pilihan jadi otomatis.
      s.damageMultiplier += 0.35;
      s.speedMultiplier -= 0.08;
    },
    maxStacks: 2,
    rarity: 'langka',
    onlyFor: 'melee',
  },

  // ------------------------------------------ SKALA — tak terbatas, naik kecil
  // Kelompok ini yang menjaga mode tanpa batas tetap punya pilihan setelah
  // upgrade lain mentok batas stack-nya.
  {
    id: 'scale-power',
    name: 'Tempa Ulang',
    description: '+10% damage',
    apply: (s) => {
      s.damageMultiplier += 0.1;
    },
  },
  {
    id: 'scale-vitality',
    name: 'Urat Baja',
    description: '+15 HP maks, pulih 15',
    apply: (s) => {
      s.maxHp += 15;
    },
    healFlat: 15,
  },
  {
    id: 'scale-edge',
    name: 'Asah Tepi',
    description: '+8% jangkauan, +5% damage',
    apply: (s) => {
      s.rangeMultiplier += 0.08;
      s.damageMultiplier += 0.05;
    },
  },
];

export const UPGRADE_CHOICES = 3;
