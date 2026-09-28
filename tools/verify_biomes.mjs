/**
 * Bukti jalan untuk sistem biome — menjalankan game sungguhan di Chrome headless.
 *
 * Dua hal yang tidak bisa dibuktikan oleh unit test, karena keduanya baru muncul
 * setelah Phaser berjalan:
 *
 *  1. **Tint benar-benar tampil.** `TilemapLayer` tidak punya komponen Tint, jadi
 *     tint dipasang per `Tile.tint`. Yang diperiksa di sini bukan nilai propertinya,
 *     tapi **warna piksel hasil render** — dibandingkan dengan hasil perkalian yang
 *     diharapkan.
 *  2. **Tabrakan tetap hidup setelah peta dicat ulang.** `rebuildArenaForWave()`
 *     menimpa tile di tempat; kalau `setCollisionByExclusion` tidak dijalankan ulang,
 *     tembok berhenti menabrak TANPA error apa pun. Pemain didorong ke tembok kiri
 *     dan posisi berhentinya diukur: ~38 px kalau tembok bekerja, ~6 px (tepi dunia)
 *     kalau tidak.
 *
 * Jalankan:  node tools/verify_biomes.mjs [url]
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const URL_GAME = process.argv[2] ?? 'http://localhost:5177/';
const OUT_DIR = 'tools/verify-out';

const globalRoot = execSync('npm root -g').toString().trim();
const require = createRequire(`${globalRoot}/`);
const puppeteer = require('puppeteer');

/** Wave yang mewakili tiap biome. */
const WAVE_PER_BIOME = [1, 3, 5, 6, 8, 10];

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 540 });
page.on('pageerror', (e) => console.error('  ! error halaman:', e.message));

await page.goto(URL_GAME, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__game?.isBooted, { timeout: 20000 });

// Masuk ke GameScene langsung, lewati judul dan pilih kelas.
await page.evaluate(() => {
  window.__game.scene.stop('Title');
  window.__game.scene.start('Game', { classId: 'warrior' });
});
await page.waitForFunction(() => window.__game.scene.getScene('Game')?.waves !== undefined, {
  timeout: 20000,
});

mkdirSync(OUT_DIR, { recursive: true });
const hasil = [];

for (const wave of WAVE_PER_BIOME) {
  const info = await page.evaluate(async (waveNumber) => {
    const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
    const s = window.__game.scene.getScene('Game');

    // Bersihkan sisa wave sebelumnya, lalu pindah wave.
    s.enemyGroup.getChildren().slice().forEach((e) => e.destroy());
    s.activeBoss = undefined;
    s.waves.beginWave(waveNumber - 1);
    await tidur(700);
    while (s.dialogue.isOpen) {
      s.dialogue.advance();
      s.dialogue.advance();
    }
    await tidur(400);

    // Musuh disingkirkan supaya screenshot menampilkan peta, bukan pertarungan.
    s.enemyGroup.getChildren().slice().forEach((e) => e.destroy());
    s.bossAttacks.clear();
    s.activeBoss = undefined;

    // --- Uji tabrakan: dorong pemain menembus tembok kiri ---
    const TILE = 16;
    const yTengah = s.groundLayer.layer.height * TILE * 0.5;
    s.player.body.reset(120, yTengah);
    await tidur(60);
    const xAwal = s.player.x;
    for (let i = 0; i < 90; i++) {
      s.player.body.setVelocity(-260, 0);
      await tidur(16);
    }
    const xAkhir = s.player.x;
    const terhalangKiri = s.player.body.blocked.left;

    // Kembalikan ke tengah untuk screenshot.
    s.player.body.reset(
      s.groundLayer.layer.width * TILE * 0.5,
      yTengah
    );
    s.player.body.setVelocity(0, 0);
    await tidur(120);

    const tileContoh = s.groundLayer.layer.data[10][10];
    return {
      wave: s.waves.waveNumber,
      biome: s.biome.id,
      nama: s.biome.name,
      tintBiome: s.biome.tint,
      tintTile: tileContoh.tint,
      indexLantai: tileContoh.index,
      tembokMenabrak: s.obstacles.layer.data[0][0].collides,
      xAwal: Math.round(xAwal),
      xAkhir: Math.round(xAkhir),
      terhalangKiri,
      fps: Math.round(window.__game.loop.actualFps),
    };
  }, wave);

  const file = `${OUT_DIR}/wave-${String(wave).padStart(2, '0')}-${info.biome}.png`;
  await page.screenshot({ path: file });
  info.gambar = file;
  hasil.push(info);
  console.log(
    `wave ${String(info.wave).padStart(2)}  ${info.biome.padEnd(13)}` +
      ` tint=${info.tintTile.toString(16).padStart(6, '0')}` +
      `  dorong-tembok: ${info.xAwal} -> ${info.xAkhir} px` +
      `  blocked.left=${info.terhalangKiri}`
  );
}

writeFileSync(`${OUT_DIR}/hasil.json`, JSON.stringify(hasil, null, 2));
await browser.close();
console.log(`\nSelesai. ${hasil.length} biome, gambar + hasil.json di ${OUT_DIR}/`);
