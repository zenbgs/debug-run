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
};

export function createBaseStats(maxHp: number): PlayerStats {
  return {
    damageMultiplier: 1,
    speedMultiplier: 1,
    recoveryMultiplier: 1,
    rangeMultiplier: 1,
    maxHp,
    lifesteal: 0,
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
