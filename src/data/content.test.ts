import { describe, expect, it } from 'vitest';
import { BIOMES, BIOME_BY_ID, BIOME_BY_WAVE, biomeForWave } from './biomes';
import { BOSS_TYPES, isBossType, SPAWNABLE_BY_ID } from './bosses';
import { PLAYER_CLASSES } from './classes';
import { COMBO } from './combat';
import { ENEMY_TYPES } from './enemies';
import { ALL_SHEETS } from './frames';
import { getSkill, SKILL_HOTKEYS, SKILLS } from './skills';
import { STORY_BOSS, STORY_INTRO, STORY_VICTORY } from './story';
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

describe('integritas biome', () => {
  it('setiap wave punya biome yang terdaftar', () => {
    for (const wave of WAVES) {
      const id = BIOME_BY_WAVE[wave.number];
      expect(id, `wave ${wave.number} tidak punya biome`).toBeDefined();
      expect(BIOME_BY_ID.has(id), `biome "${id}" tidak ada`).toBe(true);
    }
  });

  it('tidak ada biome yatim', () => {
    const dipakai = new Set(Object.values(BIOME_BY_WAVE));
    for (const b of BIOMES) expect(dipakai.has(b.id), `biome "${b.id}" tidak dipakai`).toBe(true);
  });

  it('id biome unik', () => {
    const ids = BIOMES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('tiap biome punya lantai, tembok, dan prop', () => {
    for (const b of BIOMES) {
      expect(b.floorWeights.length, `${b.id} tanpa lantai`).toBeGreaterThan(0);
      expect(b.wallVariants.length, `${b.id} tanpa tembok`).toBeGreaterThan(0);
      expect(b.rockProps.length, `${b.id} tanpa prop batu`).toBeGreaterThan(0);
      expect(b.foliageProps.length, `${b.id} tanpa prop rumpun`).toBeGreaterThan(0);
      for (const [, bobot] of b.floorWeights) expect(bobot).toBeGreaterThan(0);
    }
  });

  it('lantai dan tembok tidak boleh memakai tile yang sama', () => {
    // Tembok yang warnanya sama dengan lantai membuat tepi arena tidak terbaca.
    for (const b of BIOMES) {
      const lantai = new Set(b.floorWeights.map(([t]) => t));
      for (const w of b.wallVariants) {
        expect(lantai.has(w), `${b.id}: tile ${w} dipakai sebagai lantai DAN tembok`).toBe(false);
      }
    }
  });

  it('warna latar biome berupa hex yang sah', () => {
    for (const b of BIOMES) expect(b.backgroundColor, b.id).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('biomeForWave mengembalikan biome yang benar, dan aman untuk wave tak dikenal', () => {
    expect(biomeForWave(1).id).toBe(BIOME_BY_WAVE[1]);
    expect(biomeForWave(WAVES.length).id).toBe(BIOME_BY_WAVE[WAVES.length]);
    // Tidak boleh melempar kalau jumlah wave bertambah tapi peta biome belum.
    expect(biomeForWave(999)).toBeDefined();
  });

  it('wave berurutan tidak semuanya biome yang sama', () => {
    const urutan = WAVES.map((w) => BIOME_BY_WAVE[w.number]);
    expect(new Set(urutan).size, 'semua wave memakai biome yang sama').toBeGreaterThan(2);
  });
});

describe('boss harus terasa berbeda satu sama lain', () => {
  // Keluhan nyata saat memainkannya: "boss wave 5 dan 10 kelihatan sama".
  // Dulu memang benar — keduanya memakai satu sprite. Tes ini menjaga supaya
  // pembedanya tidak diam-diam hilang lagi.
  it('tiap boss memakai sprite sendiri', () => {
    const textures = BOSS_TYPES.map((b) => b.texture);
    expect(new Set(textures).size, `sprite boss dipakai ulang: ${textures}`).toBe(
      textures.length
    );
  });

  it('tiap boss punya susunan pola serangan sendiri', () => {
    const urutan = BOSS_TYPES.map((b) => b.patterns.join(','));
    expect(new Set(urutan).size).toBe(urutan.length);
  });

  it('boss yang tidak pernah memakai beam tidak menyimpan damage beam yang menyesatkan', () => {
    for (const boss of BOSS_TYPES) {
      if (boss.patterns.includes('beam')) {
        expect(boss.beamDamage, boss.id).toBeGreaterThan(0);
      } else {
        expect(boss.beamDamage, `${boss.id} punya beamDamage tapi tak pernah pakai beam`).toBe(0);
      }
    }
  });

  it('boss memanggil tipe musuh yang benar-benar ada', () => {
    for (const boss of BOSS_TYPES) {
      for (const id of boss.summonTypeIds) {
        expect(SPAWNABLE_BY_ID.has(id), `${boss.id} memanggil "${id}"`).toBe(true);
        // Boss memanggil boss lain akan membuat wave mustahil selesai.
        expect(isBossType(SPAWNABLE_BY_ID.get(id)!), `${boss.id} memanggil boss`).toBe(false);
      }
    }
  });

  it('skala wajah boss masuk akal untuk ukuran frame-nya', () => {
    for (const boss of BOSS_TYPES) {
      const sheet = ALL_SHEETS.find((s) => s.key === boss.texture)!;
      const lebarTampil = sheet.frameWidth * boss.portraitScale;
      // Bingkai wajah di kotak dialog kira-kira 44 px; di bawah 20 px tidak terbaca.
      expect(lebarTampil, `${boss.id} -> ${lebarTampil.toFixed(1)} px`).toBeGreaterThan(20);
      expect(lebarTampil, `${boss.id} -> ${lebarTampil.toFixed(1)} px`).toBeLessThan(48);
    }
  });

  it('boss satu-frame tidak diminta memutar animasi idle', () => {
    for (const boss of BOSS_TYPES) {
      const sheet = ALL_SHEETS.find((s) => s.key === boss.texture)!;
      expect(boss.frames, boss.id).toBe(sheet.frames);
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

  it('tidak ada dua skill yang memakai animasi sama', () => {
    // Keluhan nyata saat memainkannya: "Warrior dan Mage skill-nya sama".
    // Namanya memang beda, tapi Cleave dan Purge memakai sprite yang SAMA PERSIS
    // (`slash-circular`) dengan bentuk dan radius nyaris sama — saat dimainkan
    // keduanya tidak bisa dibedakan. Nama berbeda saja tidak cukup.
    const fx = SKILLS.map((s) => (s.kind === 'hitbox' ? s.step.fxKey : undefined)).filter(
      (k): k is string => k !== undefined
    );
    const kembar = fx.filter((k, i) => fx.indexOf(k) !== i);
    expect(kembar, `animasi skill dipakai ulang: ${[...new Set(kembar)].join(', ')}`).toEqual([]);
  });

  it('skill hitbox tiap kelas terasa berbeda, bukan cuma beda nama', () => {
    // "Terlalu mirip" = bentuk sama DAN radius mirip DAN dorongan mirip DAN
    // damage mirip. Keempatnya harus bersamaan.
    //
    // Damage ikut dihitung karena versi pertama tes ini tanpa damage langsung
    // menuduh Warcry dan Purge kembar hanya karena radiusnya sama — padahal
    // yang satu 10 damage berstun 1,4 detik dan yang lain 34 damage tanpa stun.
    // Itu dua alat yang sama sekali berbeda.
    //
    // Dengan aturan ini, pasangan Cleave/Purge yang LAMA tetap tertangkap:
    // r 46/50, dorong 460/340, damage 30/25 — mirip di ketiganya.
    const hitbox = SKILLS.filter(
      (s): s is Extract<typeof s, { kind: 'hitbox' }> => s.kind === 'hitbox'
    );
    for (let i = 0; i < hitbox.length; i++) {
      for (let j = i + 1; j < hitbox.length; j++) {
        const a = hitbox[i].step;
        const b = hitbox[j].step;
        if (a.shape.type !== 'circle' || b.shape.type !== 'circle') continue;

        const radiusMirip = Math.abs(a.shape.radius - b.shape.radius) < 12;
        const dorongMirip =
          Math.abs((a.knockback ?? 0) - (b.knockback ?? 0)) <
          Math.max(a.knockback ?? 0, b.knockback ?? 0) * 0.4;
        const damageMirip =
          Math.abs(a.damage - b.damage) < Math.max(a.damage, b.damage) * 0.4;

        expect(
          radiusMirip && dorongMirip && damageMirip,
          `${hitbox[i].id} dan ${hitbox[j].id} terlalu mirip ` +
            `(r ${a.shape.radius}/${b.shape.radius}, dorong ${a.knockback}/${b.knockback}, dmg ${a.damage}/${b.damage})`
        ).toBe(false);
      }
    }
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

  it('tiap kelas punya efek benturan SENDIRI', () => {
    // Sebelumnya semua benturan memakai `fx-hit` yang sama, jadi ayunan baja,
    // panah, dan bola api terasa identik saat mendarat di badan musuh.
    const fx = PLAYER_CLASSES.map((c) => c.hitFx);
    expect(new Set(fx).size, `efek benturan dipakai ulang: ${fx}`).toBe(fx.length);
    for (const c of PLAYER_CLASSES) {
      expect(SHEET_KEYS.has(c.hitFx), `${c.id} -> ${c.hitFx}`).toBe(true);
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

  it('deskripsi kelas tidak dipenggal manual — word-wrap yang mengaturnya', () => {
    // Aturan yang sama seperti naskah di story.ts. Dulu Warrior dan Archer
    // dipenggal manual sementara Mage tidak, dan panel detailnya belum punya
    // word-wrap sama sekali: deskripsi Mage terukur melebar 756 px di layar
    // 480 px dan meluber keluar di kedua sisi.
    for (const c of PLAYER_CLASSES) {
      expect(c.description.includes('\n'), `${c.id}: "${c.description.slice(0, 40)}..."`).toBe(
        false
      );
      expect(c.title.includes('\n'), c.id).toBe(false);
    }
  });

  it('teks kartu cukup pendek untuk muat di kartu tersempit', () => {
    // Lebar logis tersempit 420 px -> kartu ~126 px -> area teks ~114 px.
    // Press Start 2P pada 6 px memakan ~6 px per karakter, jadi ~19 karakter.
    const MAKS_KARAKTER = 19;
    for (const c of PLAYER_CLASSES) {
      for (const h of c.highlights) {
        expect(h.length, `${c.id}: "${h}"`).toBeLessThanOrEqual(MAKS_KARAKTER);
      }
      expect(c.title.length, `${c.id} judul`).toBeLessThanOrEqual(MAKS_KARAKTER);
    }
  });

  it('jumlah entri attackFx cocok dengan panjang combo', () => {
    for (const c of PLAYER_CLASSES) {
      if (!c.attackFx) continue;
      expect(c.attackFx.length, c.id).toBe(COMBO.length);
    }
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
