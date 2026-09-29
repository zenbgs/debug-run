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

/**
 * Apakah senjata BENAR-BENAR terlihat, bukan tertutup badan sepenuhnya?
 *
 * Diukur dengan memotret layar dua kali — sekali dengan senjata, sekali setelah
 * disembunyikan. Kalau kedua potret identik, tidak ada satu piksel pun senjata
 * yang sampai ke layar. Perbandingan geometri tidak bisa dipakai di sini: kotak
 * fisika pemain hanya sebatas badan, sehingga pedang yang tertutup KEPALA tetap
 * terhitung "di luar kotak" dan lolos.
 *
 * ⚠️ Scene WAJIB dijeda dulu. `WeaponVisual.sync()` berjalan tiap POST_UPDATE dan
 * menyetel ulang `visible` dari pemain, jadi `setVisible(false)` tanpa jeda sudah
 * dibatalkan sebelum potret kedua diambil — kedua potret jadi identik dan SEMUA
 * arah dilaporkan tertutup, termasuk yang jelas-jelas terlihat.
 */
async function senjataTerlihat() {
  const cari = () => {
    const s = window.__game.scene.getScene('Game');
    return s.children.list.find(
      (c) => c.type === 'Sprite' && c.texture?.key?.startsWith('weapon-')
    );
  };
  await page.evaluate(() => window.__game.scene.pause('Game'));
  await tidur(60);
  const dengan = await page.screenshot({ encoding: 'base64' });
  await page.evaluate(`(${cari.toString()})()?.setVisible(false)`);
  await tidur(60);
  const tanpa = await page.screenshot({ encoding: 'base64' });
  await page.evaluate(`(${cari.toString()})()?.setVisible(true)`);
  await page.evaluate(() => window.__game.scene.resume('Game'));
  await tidur(60);
  return dengan !== tanpa;
}

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
    await gerak(0, 0);
    await tidur(120);
    rekam.arah[arah] = { ...(await bacaSenjata()), terlihat: await senjataTerlihat() };
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
  // Hadap bawah: pedang & tongkat di depan (gagangnya harus terlihat menyentuh
  // tangan), busur di belakang (badan menutupi sisi dalamnya — itulah yang
  // membuatnya terbaca menempel, bukan ditempel).
  const busur = r.arah.down.key === 'weapon-bow';
  const diDepan = r.arah.down.depth > r.arah.down.depthPemain;
  if (busur && diDepan) {
    masalah.push(`${kelas}: busur harus DI BELAKANG badan, bukan di depan`);
  }
  if (!busur && !diDepan) {
    masalah.push(`${kelas}: hadap bawah, senjata tidak di depan badan`);
  }

  // Inti keluhan "senjata mengambang": genggaman harus dekat siluet badan.
  // Badan pemain kira-kira selebar +-7 px; genggaman di luar itu menggantung di
  // udara. Arah samping paling rawan — di situlah dulu dipasang +6.
  for (const [arah, sn] of Object.entries(r.arah)) {
    if (Math.abs(sn.dx) > 7) {
      masalah.push(`${kelas}/${arah}: genggaman ${sn.dx} px dari sumbu — di luar badan`);
    }
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
  // Senjata yang seluruhnya tertutup badan sama saja dengan tidak ada. Ini
  // terjadi pada hadap ATAS ketika sudutnya condong ke arah badan.
  for (const [arah, sn] of Object.entries(r.arah)) {
    if (!sn.terlihat) {
      masalah.push(`${kelas}/${arah}: senjata tertutup badan sepenuhnya`);
    }
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
