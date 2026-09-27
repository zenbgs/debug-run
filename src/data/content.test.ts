import { describe, expect, it } from 'vitest';
import { BOSS_TYPES, isBossType, SPAWNABLE_BY_ID } from './bosses';
import { PLAYER_CLASSES } from './classes';
import { COMBO } from './combat';
import { ENEMY_TYPES } from './enemies';
import { ALL_SHEETS } from './frames';
import { getSkill, SKILL_HOTKEYS, SKILLS } from './skills';
import { STORY_BOSS, STORY_INTRO, STORY_VICTORY } from './story';
import { createBaseStats, UPGRADES, UPGRADE_CHOICES } from './upgrades';
import { WAVES } from './waves';

const SHEET_KEYS = new Set(ALL_SHEETS.map((s) => s.key));

/**
 * Tes integritas data.
 *
 * Semua kesalahan di bawah dulunya hanya ketahuan saat menjalankan game di
 * browser — dan beberapa di antaranya gagal secara diam-diam (mis. wave menyebut
 * id musuh yang salah ketik). Di sini semuanya ketahuan dalam hitungan milidetik.
 */
describe('integritas data wave', () => {
  it('setiap wave menyebut tipe musuh yang benar-benar ada', () => {
    for (const wave of WAVES) {
      for (const entry of wave.entries) {
        expect(
          SPAWNABLE_BY_ID.has(entry.typeId),
          `wave ${wave.number} menyebut "${entry.typeId}"`
        ).toBe(true);
      }
    }
  });

  it('nomor wave berurutan mulai dari 1', () => {
    WAVES.forEach((wave, i) => expect(wave.number).toBe(i + 1));
  });

  it('wave yang ditandai boss memang memuat boss, dan sebaliknya', () => {
    for (const wave of WAVES) {
      const adaBoss = wave.entries.some((e) => {
        const t = SPAWNABLE_BY_ID.get(e.typeId);
        return t !== undefined && isBossType(t);
      });
      expect(adaBoss, `wave ${wave.number}`).toBe(wave.isBossWave === true);
    }
  });

  it('tiap wave punya setidaknya satu musuh', () => {
    for (const wave of WAVES) {
      const total = wave.entries.reduce((n, e) => n + e.count, 0);
      expect(total, `wave ${wave.number}`).toBeGreaterThan(0);
    }
  });
});

describe('integritas tipe musuh', () => {
  it('id musuh unik', () => {
    const ids = ENEMY_TYPES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('semua texture musuh terdaftar di frames.ts', () => {
    for (const t of [...ENEMY_TYPES, ...BOSS_TYPES]) {
      expect(SHEET_KEYS.has(t.texture), `${t.id} -> ${t.texture}`).toBe(true);
    }
  });

  it('musuh penembak punya damage proyektil', () => {
    for (const t of ENEMY_TYPES) {
      if (t.behavior !== 'shooter') continue;
      expect(t.projectileDamage, `${t.id}`).toBeGreaterThan(0);
    }
  });

  it('hitbox musuh tidak lebih besar dari frame-nya', () => {
    for (const t of ENEMY_TYPES) {
      const sheet = ALL_SHEETS.find((s) => s.key === t.texture);
      expect(sheet).toBeDefined();
      expect(t.bodyWidth, `${t.id}`).toBeLessThanOrEqual(sheet!.frameWidth);
      expect(t.bodyHeight, `${t.id}`).toBeLessThanOrEqual(sheet!.frameHeight);
    }
  });
});

describe('integritas kelas dan skill', () => {
  it('tiap kelas menyebut skill yang ada, dan cukup untuk jumlah hotkey', () => {
    for (const c of PLAYER_CLASSES) {
      expect(c.skills.length).toBeLessThanOrEqual(SKILL_HOTKEYS.length);
      for (const id of c.skills) expect(() => getSkill(id)).not.toThrow();
    }
  });

  it('tidak ada skill dipakai bersama antar kelas', () => {
    const semua = PLAYER_CLASSES.flatMap((c) => [...c.skills]);
    expect(new Set(semua).size, 'ada skill yang dipakai lebih dari satu kelas').toBe(
      semua.length
    );
  });

  it('setiap skill yang didefinisikan benar-benar dipakai suatu kelas', () => {
    const dipakai = new Set(PLAYER_CLASSES.flatMap((c) => [...c.skills]));
    for (const s of SKILLS) expect(dipakai.has(s.id), `skill "${s.id}" yatim`).toBe(true);
  });

  it('kelas jarak jauh wajib punya konfigurasi proyektil', () => {
    for (const c of PLAYER_CLASSES) {
      if (c.attackStyle !== 'ranged') continue;
      expect(c.projectile, `${c.id}`).toBeDefined();
      expect(SHEET_KEYS.has(c.projectile!.texture)).toBe(true);
      expect(c.projectile!.range).toBeGreaterThan(0);
      expect(c.projectile!.speed).toBeGreaterThan(0);
    }
  });

  it('texture kelas dan FX serangannya terdaftar', () => {
    for (const c of PLAYER_CLASSES) {
      expect(SHEET_KEYS.has(c.texture), c.id).toBe(true);
      for (const fx of c.attackFx ?? []) {
        expect(SHEET_KEYS.has(fx.key), `${c.id} -> ${fx.key}`).toBe(true);
      }
    }
  });

  it('jumlah entri attackFx cocok dengan panjang combo', () => {
    for (const c of PLAYER_CLASSES) {
      if (!c.attackFx) continue;
      expect(c.attackFx.length, c.id).toBe(COMBO.length);
    }
  });
});

describe('integritas upgrade', () => {
  it('cukup upgrade untuk mengisi semua slot pilihan', () => {
    expect(UPGRADES.length).toBeGreaterThanOrEqual(UPGRADE_CHOICES);
  });

  it('id upgrade unik', () => {
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

  it('recoveryMultiplier tidak pernah jadi nol atau negatif meski ditumpuk', () => {
    const quick = UPGRADES.find((u) => u.id === 'quick-hands');
    expect(quick).toBeDefined();
    const stats = createBaseStats(100);
    for (let i = 0; i < 50; i++) quick!.apply(stats);
    expect(stats.recoveryMultiplier).toBeGreaterThan(0);
  });
});

describe('integritas naskah cerita', () => {
  it('semua beat punya baris, dan tidak ada teks kosong', () => {
    const beats = [STORY_INTRO, STORY_VICTORY, ...Object.values(STORY_BOSS)];
    for (const beat of beats) {
      expect(beat.lines.length, beat.id).toBeGreaterThan(0);
      for (const line of beat.lines) expect(line.text.trim().length).toBeGreaterThan(0);
    }
  });

  it('cerita boss hanya dipasang pada wave yang memang wave boss', () => {
    for (const nomor of Object.keys(STORY_BOSS).map(Number)) {
      const wave = WAVES.find((w) => w.number === nomor);
      expect(wave, `wave ${nomor} tidak ada`).toBeDefined();
      expect(wave!.isBossWave, `wave ${nomor}`).toBe(true);
    }
  });

  it('teks naskah tidak dipenggal manual — word-wrap yang mengaturnya', () => {
    const beats = [STORY_INTRO, STORY_VICTORY, ...Object.values(STORY_BOSS)];
    for (const beat of beats) {
      for (const line of beat.lines) {
        expect(line.text.includes('\n'), `${beat.id}: "${line.text.slice(0, 40)}..."`).toBe(
          false
        );
      }
    }
  });
});
