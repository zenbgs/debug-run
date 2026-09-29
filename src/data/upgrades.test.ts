import { describe, expect, it } from 'vitest';
import { PLAYER_CLASSES, type AttackStyle } from './classes';
import { ALL_SHEETS } from './frames';
import {
  createBaseStats,
  KATEGORI_GEM,
  RARITY_WEIGHT,
  UPGRADES,
  UPGRADE_CHOICES,
  type Upgrade,
} from './upgrades';

const GAYA: AttackStyle[] = ['melee', 'ranged'];

/** Tiru penyaringan `UpgradePanel.rollChoices` tanpa menyentuh Phaser. */
function kandidat(taken: Map<string, number>, gaya: AttackStyle): Upgrade[] {
  return UPGRADES.filter((u) => {
    if (u.onlyFor !== undefined && u.onlyFor !== gaya) return false;
    if (u.maxStacks === undefined) return true;
    return (taken.get(u.id) ?? 0) < u.maxStacks;
  });
}

describe('kolam upgrade', () => {
  it('id unik', () => {
    const ids = UPGRADES.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('setiap upgrade benar-benar mengubah sesuatu', () => {
    for (const u of UPGRADES) {
      const stats = createBaseStats(100);
      const sebelum = JSON.stringify(stats);
      u.apply(stats);
      const berubah = JSON.stringify(stats) !== sebelum;
      // Upgrade murni penyembuhan sah tidak mengubah stat, asalkan menyembuhkan.
      expect(berubah || (u.healFlat ?? 0) > 0, `upgrade "${u.id}" tidak berefek`).toBe(true);
    }
  });

  it('pengali tidak pernah jadi nol atau negatif meski ditumpuk sampai batas', () => {
    for (const u of UPGRADES) {
      const stats = createBaseStats(100);
      for (let i = 0; i < (u.maxStacks ?? 50); i++) u.apply(stats);

      expect(stats.recoveryMultiplier, u.id).toBeGreaterThan(0);
      expect(stats.skillCooldownMultiplier, u.id).toBeGreaterThan(0);
      expect(stats.dashCooldownMultiplier, u.id).toBeGreaterThan(0);
      // Upgrade berkerugian tidak boleh sanggup membuat pemain berhenti bergerak.
      expect(stats.speedMultiplier, u.id).toBeGreaterThan(0.3);
    }
  });

  it('tiap upgrade punya kategori yang punya ikon', () => {
    for (const u of UPGRADES) {
      expect(KATEGORI_GEM[u.kategori], `${u.id} -> ${u.kategori}`).toBeGreaterThanOrEqual(0);
    }
  });

  it('indeks ikon berada di dalam lembar permata, dan tidak ada yang kembar', () => {
    const sheet = ALL_SHEETS.find((s) => s.key === 'ui-gems');
    expect(sheet, 'lembar ui-gems tidak terdaftar').toBeDefined();

    const indeks = Object.values(KATEGORI_GEM);
    for (const i of indeks) expect(i).toBeLessThan(sheet!.frames);
    // Dua kategori berbagi warna berarti pemain tidak bisa membedakannya.
    expect(new Set(indeks).size).toBe(indeks.length);
  });

  it('semua kategori benar-benar dipakai', () => {
    const dipakai = new Set(UPGRADES.map((u) => u.kategori));
    for (const kat of Object.keys(KATEGORI_GEM)) {
      expect(dipakai.has(kat as keyof typeof KATEGORI_GEM), `kategori "${kat}" yatim`).toBe(true);
    }
  });

  it('bobot kelangkaan positif', () => {
    for (const [nama, bobot] of Object.entries(RARITY_WEIGHT)) {
      expect(bobot, nama).toBeGreaterThan(0);
    }
    expect(RARITY_WEIGHT.langka).toBeLessThan(RARITY_WEIGHT.umum);
  });

  it('upgrade khusus gaya menyebut gaya yang benar-benar dipakai suatu kelas', () => {
    const dipakai = new Set(PLAYER_CLASSES.map((c) => c.attackStyle));
    for (const u of UPGRADES) {
      if (!u.onlyFor) continue;
      expect(dipakai.has(u.onlyFor), `${u.id} -> ${u.onlyFor}`).toBe(true);
    }
  });
});

describe('kolam tidak boleh kehabisan pilihan di mode tanpa batas', () => {
  // Ini masalah yang terukur sebelumnya: hanya ada 3 upgrade tanpa batas stack,
  // jadi sekitar wave 33 layar upgrade menawarkan tiga hal yang sama selamanya —
  // dan salah satunya murni penyembuhan tanpa perubahan stat.
  /**
   * Ambang sengaja di ATAS jumlah tawaran.
   *
   * `>= UPGRADE_CHOICES` terlalu longgar: kolam lama punya tepat 3 upgrade tanpa
   * batas, jadi ia akan lolos padahal justru itu masalahnya — tiga kartu yang
   * sama, setiap kali, selamanya. Yang dijaga di sini adalah tetap adanya
   * VARIASI, bukan sekadar cukup kartu untuk mengisi layar.
   */
  const MIN_VARIASI = UPGRADE_CHOICES + 2;

  it.each(GAYA)('gaya %s tetap punya variasi setelah 200 kali memilih', (gaya) => {
    const taken = new Map<string, number>();

    for (let putaran = 0; putaran < 200; putaran++) {
      const pilihan = kandidat(taken, gaya);
      expect(
        pilihan.length,
        `putaran ${putaran}: tinggal ${pilihan.length} kandidat (${pilihan.map((u) => u.id).join(', ')})`
      ).toBeGreaterThanOrEqual(MIN_VARIASI);

      // Ambil yang paling cepat mentok supaya batas stack benar-benar terkuras.
      const paling = [...pilihan].sort(
        (a, b) => (a.maxStacks ?? Infinity) - (b.maxStacks ?? Infinity)
      )[0];
      taken.set(paling.id, (taken.get(paling.id) ?? 0) + 1);
    }
  });

  it.each(GAYA)('gaya %s punya cukup pilihan tanpa batas untuk tetap bervariasi', (gaya) => {
    const takTerbatas = UPGRADES.filter(
      (u) => u.maxStacks === undefined && (u.onlyFor === undefined || u.onlyFor === gaya)
    );
    expect(takTerbatas.length, `gaya ${gaya}`).toBeGreaterThanOrEqual(MIN_VARIASI);
  });

  it('pilihan tanpa batas tidak didominasi penyembuhan murni', () => {
    // Kolam lama: dari 3 yang tanpa batas, satu di antaranya murni penyembuhan.
    const takTerbatas = UPGRADES.filter((u) => u.maxStacks === undefined);
    const mengubahStat = takTerbatas.filter((u) => {
      const s = createBaseStats(100);
      const sebelum = JSON.stringify(s);
      u.apply(s);
      return JSON.stringify(s) !== sebelum;
    });
    expect(mengubahStat.length).toBeGreaterThanOrEqual(UPGRADE_CHOICES + 1);
  });
});

describe('penyaringan per kelas', () => {
  it('tiap kelas punya cukup kandidat sejak awal', () => {
    for (const kelas of PLAYER_CLASSES) {
      const pilihan = kandidat(new Map(), kelas.attackStyle);
      expect(pilihan.length, kelas.id).toBeGreaterThanOrEqual(UPGRADE_CHOICES);
    }
  });

  it('kelas melee tidak pernah ditawari upgrade proyektil', () => {
    const untukMelee = kandidat(new Map(), 'melee');
    for (const u of untukMelee) {
      expect(u.onlyFor === 'ranged', `${u.id} bocor ke melee`).toBe(false);
    }
  });

  it('upgrade khusus jarak jauh benar-benar ada, bukan daftar kosong', () => {
    expect(UPGRADES.some((u) => u.onlyFor === 'ranged')).toBe(true);
    expect(UPGRADES.some((u) => u.onlyFor === 'melee')).toBe(true);
  });
});
