/**
 * Upgrade yang ditawarkan di antara wave. Pemain memilih 1 dari 3. (SPEC.md §3)
 *
 * Setiap upgrade WAJIB benar-benar terpasang ke stat pemain — tidak ada entri
 * hiasan. `apply` di bawah adalah satu-satunya tempat efeknya ditulis.
 */

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
  };
}

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
};

/**
 * Radius efek untuk upgrade yang mengubah cara main.
 * Dipisah dari daftar upgrade supaya gampang di-tune.
 */
export const UPGRADE_FX = {
  DASH_HIT_RADIUS: 22,
  DEATH_BLAST_RADIUS: 34,
} as const;

export const UPGRADES: readonly Upgrade[] = [
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
  {
    id: 'sharp-dash',
    name: 'Dash Tajam',
    description: 'dash melukai yang dilewati',
    apply: (s) => {
      // Menumpuk, tapi tambahan pertamalah yang mengubah cara main:
      // dash berubah dari tombol panik jadi bagian dari irama menyerang.
      s.dashDamage += 22;
    },
    maxStacks: 3,
  },
  {
    id: 'death-blast',
    name: 'Ledakan Akhir',
    description: 'musuh mati meledak',
    apply: (s) => {
      s.deathBlastDamage += 14;
    },
    maxStacks: 3,
  },
  {
    id: 'thorns',
    name: 'Duri',
    description: '60% damage kontak dipantulkan',
    apply: (s) => {
      s.thorns += 0.6;
    },
    maxStacks: 2,
  },
  {
    id: 'vampiric',
    name: 'Vampirik',
    description: '8% damage jadi HP',
    apply: (s) => {
      s.lifesteal += 0.08;
    },
    maxStacks: 3,
  },
];

export const UPGRADE_CHOICES = 3;
