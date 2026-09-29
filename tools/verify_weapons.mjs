/**
 * Bukti jalan untuk senjata yang dipegang pemain.
 *
 * Yang dibuktikan, dan tak satu pun bisa dijangkau unit test:
 *  1. Tiap kelas memegang senjatanya sendiri, dan ketiganya berbeda.
 *  2. Senjata MENEMPEL di pemain saat berjalan — tidak tertinggal satu frame.
 *  3. Saat membelakangi kamera, senjata berada DI BELAKANG badan.
 *  4. Senjata benar-benar MENGAYUN saat menyerang, lalu kembali ke pose diam.
 *  5. Ayunan tidak melepaskan senjata dari tangan.
 *
 * ⚠️ Dua pelajaran dari versi sebelumnya, ditulis supaya tidak terulang:
 *
 *  * Posisi senjata WAJIB diukur setelah POST_UPDATE. Arcade Physics menyalin
 *    posisi badan ke sprite pada POST_UPDATE, jadi membacanya dari
 *    `scene.update()` memberi posisi frame sebelumnya. Inilah yang dulu membuat
 *    senjata tertinggal 1,7 px saat berjalan.
 *  * JANGAN mengosongkan `waves.queue` untuk menyingkirkan musuh. Itu membuat
 *    wave terhitung bersih dan panel upgrade terbuka menutupi seluruh layar —
 *    tangkapan layarnya jadi gambar panel, bukan gambar pemain. Bekukan
 *    `waves.update` saja.
 *
 * Jalankan:  node tools/verify_weapons.mjs [url]
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

const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
const ARAH = [
  ['down', 0, 1],
  ['up', 0, -1],
  ['left', -1, 0],
  ['right', 1, 0],
];

async function masukGame(classId) {
  await page.goto(URL_GAME, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__game?.isBooted, { timeout: 20000 });
  await page.evaluate((id) => {
    window.__game.scene.stop('Title');
    window.__game.scene.start('Game', { classId: id });
  }, classId);
  await page.waitForFunction(() => window.__game.scene.getScene('Game')?.waves !== undefined, {
    timeout: 20000,
  });
  await tidur(1000);
  // Bekukan wave manager tanpa membuat wave terhitung bersih (lihat catatan atas).
  await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    s.waves.update = () => {};
    s.enemyGroup
      .getChildren()
      .slice()
      .forEach((e) => e.destroy());
  });
}

/** Keadaan senjata relatif pemain, dibaca dari scene yang sedang berjalan. */
const bacaSenjata = () =>
  page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    const w = s.children.list.find(
      (c) => c.type === 'Sprite' && c.texture?.key?.startsWith('weapon-')
    );
    if (!w) return null;
    return {
      key: w.texture.key,
      dx: +(w.x - s.player.x).toFixed(2),
      dy: +(w.y - s.player.y).toFixed(2),
      derajat: +((w.rotation * 180) / Math.PI).toFixed(1),
      depth: w.depth,
      depthPemain: s.player.depth,
      hadap: s.player.getFacing(),
    };
  });

const gerak = (x, y, attack = false) =>
  page.evaluate(
    ([mx, my, a]) => {
      window.__game.scene
        .getScene('Game')
        .player.setVirtualInput({ moveX: mx, moveY: my, attack: a });
    },
    [x, y, attack]
  );

const hasil = { kelas: {} };

for (const kelas of ['warrior', 'archer', 'mage']) {
  await masukGame(kelas);
  const rekam = { arah: {} };

  // --- 1-3. Pose diam tiap arah, diukur SAAT BERJALAN ---
  // Diukur sambil bergerak, bukan sambil diam: senjata yang tertinggal satu frame
  // hanya kelihatan ketika pemainnya benar-benar berpindah.
  for (const [arah, mx, my] of ARAH) {
    await gerak(mx, my);
    await tidur(300);
    rekam.arah[arah] = await bacaSenjata();
    await gerak(0, 0);
    await tidur(120);
  }

  // --- 4-5. Ayunan ---
  await gerak(1, 0);
  await tidur(260);
  const diam = await bacaSenjata();
  await gerak(0, 0, true);

  let minDerajat = Infinity;
  let maxDerajat = -Infinity;
  let jarakGenggamMaks = 0;
  for (let i = 0; i < 10; i++) {
    await tidur(45);
    const s = await bacaSenjata();
    minDerajat = Math.min(minDerajat, s.derajat);
    maxDerajat = Math.max(maxDerajat, s.derajat);
    // Genggaman tidak boleh melayang jauh dari tangan selama mengayun.
    jarakGenggamMaks = Math.max(jarakGenggamMaks, Math.hypot(s.dx - diam.dx, s.dy - diam.dy));
  }
  await gerak(0, 0, false);
  await tidur(500); // biarkan kembali ke pose diam
  const setelah = await bacaSenjata();

  rekam.ayunan = {
    diamDerajat: diam.derajat,
    minDerajat,
    maxDerajat,
    rentang: +(maxDerajat - minDerajat).toFixed(1),
    jarakGenggamMaks: +jarakGenggamMaks.toFixed(2),
    kembaliKeDiam: Math.abs(setelah.derajat - diam.derajat) < 1.5,
  };
  hasil.kelas[kelas] = rekam;
}

// --- Penilaian ----------------------------------------------------------------
const keys = Object.values(hasil.kelas).map((k) => k.arah.down.key);
hasil.senjataBerbeda = new Set(keys).size === 3;

const masalah = [];
for (const [kelas, r] of Object.entries(hasil.kelas)) {
  // Menempel: offset saat berjalan harus sama persis dengan tabel pose. Nilai
  // pecahan berarti senjata sedang mengejar pemain, bukan menempel padanya.
  for (const [arah, s] of Object.entries(r.arah)) {
    if (!Number.isInteger(s.dx) || !Number.isInteger(s.dy)) {
      masalah.push(
        `${kelas}/${arah}: offset tidak bulat (${s.dx},${s.dy}) — senjata tertinggal frame`
      );
    }
  }
  if (r.arah.up.depth >= r.arah.up.depthPemain) {
    masalah.push(`${kelas}: hadap atas, senjata tidak di belakang badan`);
  }
  if (r.arah.down.depth <= r.arah.down.depthPemain) {
    masalah.push(`${kelas}: hadap bawah, senjata tidak di depan badan`);
  }
  if (r.ayunan.rentang < 15) {
    masalah.push(`${kelas}: ayunan terlalu kecil (${r.ayunan.rentang} derajat)`);
  }
  if (r.ayunan.jarakGenggamMaks > 4) {
    masalah.push(
      `${kelas}: genggaman melayang ${r.ayunan.jarakGenggamMaks} px dari tangan saat mengayun`
    );
  }
  if (!r.ayunan.kembaliKeDiam) {
    masalah.push(`${kelas}: tidak kembali ke pose diam setelah menyerang`);
  }
}
if (!hasil.senjataBerbeda) masalah.push('dua kelas memakai senjata yang sama');
hasil.masalah = masalah;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/weapons.json`, JSON.stringify(hasil, null, 2));

for (const [kelas, r] of Object.entries(hasil.kelas)) {
  console.log(`\n${kelas}  (${r.arah.down.key})`);
  for (const [arah, s] of Object.entries(r.arah)) {
    const posisi = s.depth < s.depthPemain ? 'di belakang' : 'di depan';
    console.log(
      `  ${arah.padEnd(6)} offset (${String(s.dx).padStart(3)},${String(s.dy).padStart(2)})  ` +
        `${String(s.derajat).padStart(6)} derajat  ${posisi}`
    );
  }
  const a = r.ayunan;
  console.log(
    `  ayunan ${a.minDerajat} .. ${a.maxDerajat} derajat (rentang ${a.rentang}), ` +
      `genggaman geser maks ${a.jarakGenggamMaks} px, kembali ke diam: ${a.kembaliKeDiam}`
  );
}

console.log(
  masalah.length === 0
    ? `\nLOLOS — hasil lengkap di ${OUT_DIR}/weapons.json`
    : `\nGAGAL:\n  ${masalah.join('\n  ')}`
);

await browser.close();
process.exit(masalah.length === 0 ? 0 : 1);
