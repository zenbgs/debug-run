/**
 * Bukti jalan untuk mode tanpa batas + rekor tersimpan.
 *
 * Yang dibuktikan, dan semuanya di luar jangkauan unit test:
 *  1. Kampanye tamat memunculkan pilihan, bukan langsung menggelinding ke wave 11.
 *  2. Wave 11 ke atas benar-benar dibangkitkan dan kesulitannya MENANJAK —
 *     diukur, bukan sekadar "tidak error".
 *  3. `statScale` sampai ke entity: HP musuh yang benar-benar di-spawn di wave
 *     jauh lebih besar daripada di wave tanpa batas pertama. Ini yang membedakan
 *     angka di data dari angka yang terasa saat bermain.
 *  4. Biome ikut berputar, bukan padang rumput terus.
 *  5. Rekor bertahan setelah halaman dimuat ulang.
 *
 * Jalankan:  node tools/verify_endless.mjs [url]
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const URL_GAME = process.argv[2] ?? 'http://localhost:5177/';
const OUT_DIR = 'tools/verify-out';

const require = createRequire(`${execSync('npm root -g').toString().trim()}/`);
const puppeteer = require('puppeteer');

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 540 });
page.on('pageerror', (e) => console.error('  ! error halaman:', e.message));

async function masukGame() {
  await page.goto(URL_GAME, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__game?.isBooted, { timeout: 20000 });
  await page.evaluate(() => {
    window.__game.scene.stop('Title');
    window.__game.scene.start('Game', { classId: 'warrior' });
  });
  await page.waitForFunction(() => window.__game.scene.getScene('Game')?.waves !== undefined, {
    timeout: 20000,
  });
  await new Promise((r) => setTimeout(r, 1000));
}

/**
 * Kumpulkan SEMUA teks di scene, termasuk yang ada di dalam Container.
 *
 * `addText()` memasukkan label ke `panel.container`, jadi label itu tidak pernah
 * muncul di `scene.children.list`. Versi pertama harness ini memeriksa daftar
 * teratas saja dan menyimpulkan panel pilihannya tidak pernah muncul.
 */
const SEMUA_TEKS = `(s) => {
  const keluar = [];
  const telusuri = (daftar) => {
    for (const c of daftar) {
      if (c.type === 'Text' && typeof c.text === 'string') keluar.push(c.text);
      if (c.type === 'Container' && c.list) telusuri(c.list);
    }
  };
  telusuri(s.children.list);
  return keluar;
}`;

const hasil = {};

// Helper pembaca teks dipasang di halaman sekali saja.
await page.evaluateOnNewDocument((src) => {
  window.__SEMUA_TEKS = src;
}, SEMUA_TEKS);

// Mulai dari rekor bersih supaya angkanya bisa diprediksi.
await page.goto(URL_GAME, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());
await masukGame();

/**
 * Tunggu sampai `cek()` benar, sambil terus melewati dialog yang terbuka.
 *
 * Menunggu dengan durasi tetap tidak bisa dipakai di sini: `beginWave(9)` memicu
 * cerita boss wave 10, yang menyetel state ke `dialog` dan MENGHENTIKAN wave
 * manager. Versi pertama harness ini menebak 2600 ms, lalu mengukur permainan
 * yang sebenarnya belum bergerak — dan semua angkanya tidak sah.
 */
async function tungguSampai(cek, label, batasMs = 20000) {
  const mulai = Date.now();
  while (Date.now() - mulai < batasMs) {
    const selesai = await page.evaluate((sumber) => {
      const s = window.__game.scene.getScene('Game');
      while (s.dialogue.isOpen) {
        s.dialogue.advance();
        s.dialogue.advance();
      }
      // eslint-disable-next-line no-new-func
      const teks = new Function('s', `return (${window.__SEMUA_TEKS})(s);`)(s);
      // eslint-disable-next-line no-new-func
      return new Function('s', 'teks', `return (${sumber})(s, teks);`)(s, teks);
    }, cek.toString());
    if (selesai) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Batas waktu menunggu: ${label}`);
}

// --- 1. Tamatkan kampanye, harapkan PILIHAN, bukan langsung lanjut ---
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.waves.beginWave(9); // wave 10
  s.waves.queue = [];
  s.enemyGroup.getChildren().slice().forEach((e) => e.destroy());
  s.activeBoss = undefined;
});

// Panel pilihan muncul setelah cerita penutup selesai.
await tungguSampai(
  (s, teks) => s.state === 'victory' && !s.dialogue.isOpen && teks.some((t) => /LANJUT/.test(t)),
  'panel pilihan setelah kampanye'
);

hasil.setelahKampanye = await page.evaluate((src) => {
  const s = window.__game.scene.getScene('Game');
  // eslint-disable-next-line no-new-func
  const teks = new Function('s', `return (${src})(s);`)(s);
  return {
    state: s.state,
    wave: s.waves.waveNumber,
    endless: s.waves.isEndless,
    adaPilihanLanjut: teks.some((t) => /LANJUT/.test(t)),
    adaPilihanSudahi: teks.some((t) => /SUDAHI/.test(t)),
  };
}, SEMUA_TEKS);

// Pilih "LANJUT" lewat tombol 1 sungguhan, bukan memanggil fungsi internal.
await page.keyboard.press('Digit1');
await tungguSampai((s) => s.state === 'playing' && s.waves.isEndless, 'masuk mode tanpa batas');

hasil.setelahMemilihLanjut = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return {
    state: s.state,
    wave: s.waves.waveNumber,
    endless: s.waves.isEndless,
    // 0 = tanpa batas; HUD menyembunyikan penyebutnya.
    totalWaves: s.waves.totalWaves,
  };
});

// --- 2 & 3. Susuri wave 11..20, ukur kurva dan HP musuh nyata ---
const kurva = [];
for (const target of [11, 12, 13, 14, 15, 16, 20]) {
  await page.evaluate((nomor) => {
    const s = window.__game.scene.getScene('Game');
    s.enemyGroup.getChildren().slice().forEach((e) => e.destroy());
    s.activeBoss = undefined;
    s.waves.beginWave(nomor - 1);
  }, target);

  // Tunggu musuh BENAR-BENAR keluar; ini yang membuktikan statScale sampai ke
  // entity, bukan berhenti sebagai angka di data.
  // Ambang 5, bukan 2: antrean diacak, dan dengan dua musuh saja tipe pembanding
  // (glitchling) sering belum sempat keluar sehingga tabelnya berlubang.
  await tungguSampai((s) => s.enemyGroup.getChildren().length >= 5, `musuh wave ${target}`);

  const baris = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    const w = s.waves.currentWave;
    const hp = {};
    for (const e of s.enemyGroup.getChildren()) {
      if (e.config) hp[e.config.id] = e.config.hp;
    }
    return {
      wave: s.waves.waveNumber,
      biome: s.biome.id,
      maxAlive: w.maxAlive,
      spawnMs: w.spawnIntervalMs,
      statScale: +(w.statScale ?? 1).toFixed(3),
      totalMusuh: w.entries.reduce((a, e) => a + e.count, 0),
      hpNyata: hp,
      adaBoss: s.activeBoss !== undefined,
      barBossTampil: s.bossLabel !== undefined,
    };
  });
  kurva.push(baris);
}
hasil.kurva = kurva;

// --- 4. Upgrade tetap ditawarkan antar wave tanpa batas ---
// Tanpa ini pemain berhenti berkembang tepat saat musuh mulai menebal, dan mode
// tanpa batas berubah jadi dinding, bukan tantangan.
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.waves.queue = [];
  s.enemyGroup.getChildren().slice().forEach((e) => e.destroy());
  s.activeBoss = undefined;
});
await tungguSampai(
  (s, teks) => s.state === 'upgrade' && teks.some((t) => /PILIH UPGRADE/i.test(t)),
  'panel upgrade di mode tanpa batas'
);
hasil.upgradeDiTanpaBatas = true;

mkdirSync(OUT_DIR, { recursive: true });
await page.screenshot({ path: `${OUT_DIR}/endless-upgrade.png` });

// --- 5. Rekor bertahan setelah muat ulang ---
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.upgradePanel.close();
  s.state = 'playing';
  s.score = 4321;
  s.kills = 77;
  s.player.takeDamage(99999, 0, 0);
});
await new Promise((r) => setTimeout(r, 800));

hasil.tersimpan = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('debug-run:records:v1') ?? 'null')
);

await page.goto(URL_GAME, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__game?.isBooted, { timeout: 20000 });
await new Promise((r) => setTimeout(r, 900));
hasil.tampilDiJudul = await page.evaluate((src) => {
  const judul = window.__game.scene.getScene('Title');
  if (!judul) return [];
  // eslint-disable-next-line no-new-func
  const teks = new Function('s', `return (${src})(s);`)(judul);
  return teks.filter((t) => /WARRIOR|MAGE|ARCHER|REKOR/i.test(t));
}, SEMUA_TEKS);
await page.screenshot({ path: `${OUT_DIR}/title-records.png` });

writeFileSync(`${OUT_DIR}/endless.json`, JSON.stringify(hasil, null, 2));
await browser.close();

console.log('setelah kampanye      :', JSON.stringify(hasil.setelahKampanye));
console.log('setelah memilih lanjut:', JSON.stringify(hasil.setelahMemilihLanjut));
console.log('');
console.log('wave  biome         maxAlive  spawnMs  statScale  musuh  hpGlitch  boss');
for (const b of hasil.kurva) {
  console.log(
    `${String(b.wave).padStart(4)}  ${String(b.biome).padEnd(13)}` +
      `${String(b.maxAlive).padStart(8)}${String(b.spawnMs).padStart(9)}` +
      `${String(b.statScale).padStart(11)}${String(b.totalMusuh).padStart(7)}` +
      `${String(b.hpNyata.glitchling ?? '-').padStart(10)}   ${b.adaBoss ? 'YA' : '-'}`
  );
}
console.log('');
console.log('upgrade di tanpa batas:', hasil.upgradeDiTanpaBatas === true);
console.log('rekor tersimpan       :', JSON.stringify(hasil.tersimpan?.perClass ?? null));
console.log('tampil di layar judul :', JSON.stringify(hasil.tampilDiJudul));
