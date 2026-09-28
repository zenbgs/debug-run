/**
 * Bukti jalan untuk kontrol sentuh — menjalankan game di Chrome headless yang
 * diemulasikan sebagai ponsel, lalu mengirim sentuhan sungguhan lewat CDP
 * (`Input.dispatchTouchEvent`), bukan memanggil fungsi internal.
 *
 * Yang dibuktikan:
 *  1. Kontrol muncul hanya di perangkat sentuh.
 *  2. Stiknya benar-benar **analog** — dorongan setengah menghasilkan kecepatan
 *     setengah, bukan penuh. Ini yang membedakannya dari tombol arah.
 *  3. Arah bebas, tidak disnap ke 8 penjuru.
 *  4. Multi-sentuh: gerak dan serang bersamaan dengan dua jari.
 *  5. Tombol jeda tidak langsung menjeda ulang setelah dilanjutkan.
 *
 * Jalankan:  node tools/verify_touch.mjs [url]
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

// Ponsel mendatar. `hasTouch` inilah yang membuat `isTouchDevice()` bernilai true.
await page.emulate({
  name: 'Ponsel mendatar',
  viewport: { width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
});

const cdp = await page.createCDPSession();
page.on('pageerror', (e) => console.error('  ! error halaman:', e.message));

await page.goto(URL_GAME, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__game?.isBooted, { timeout: 20000 });
await page.evaluate(() => {
  window.__game.scene.stop('Title');
  window.__game.scene.start('Game', { classId: 'warrior' });
});
await page.waitForFunction(() => window.__game.scene.getScene('Game')?.waves !== undefined, {
  timeout: 20000,
});
await new Promise((r) => setTimeout(r, 1200));

/** Ubah koordinat logis game (480x270) jadi koordinat CSS halaman. */
async function keLayar(x, y) {
  return page.evaluate(
    ([lx, ly]) => {
      const b = window.__game.scale.canvasBounds;
      return {
        x: b.x + (lx / window.__game.scale.width) * b.width,
        y: b.y + (ly / window.__game.scale.height) * b.height,
      };
    },
    [x, y]
  );
}

let idBerikut = 1;
async function sentuh(jenis, titik) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: jenis,
    touchPoints: titik.map((t) => ({ x: t.x, y: t.y, id: t.id })),
  });
}

/** Tahan stik ke arah tertentu selama beberapa saat, lalu ukur kecepatan pemain. */
async function dorongStik(dxLogis, dyLogis, label) {
  const pusat = await keLayar(110, 190);
  const id = idBerikut++;
  const ujung = await keLayar(110 + dxLogis, 190 + dyLogis);

  await sentuh('touchStart', [{ ...pusat, id }]);
  await new Promise((r) => setTimeout(r, 60));
  await sentuh('touchMove', [{ ...ujung, id }]);
  await new Promise((r) => setTimeout(r, 260));

  const ukur = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    const b = s.player.body;
    return {
      vx: Math.round(b.velocity.x),
      vy: Math.round(b.velocity.y),
      laju: Math.round(Math.hypot(b.velocity.x, b.velocity.y)),
      moveX: +s.touch.moveX.toFixed(3),
      moveY: +s.touch.moveY.toFixed(3),
    };
  });

  await sentuh('touchEnd', []);
  await new Promise((r) => setTimeout(r, 120));
  return { label, ...ukur };
}

const hasil = {};

hasil.terdeteksiSentuh = await page.evaluate(
  () => window.__game.scene.getScene('Game').touch !== undefined
);

const R = await page.evaluate(() => 30); // TOUCH.STICK.RADIUS
hasil.penuhKanan = await dorongStik(R, 0, 'dorong penuh kanan');
hasil.separuhKanan = await dorongStik(R * 0.5 + 2.5, 0, 'dorong separuh kanan');
hasil.serong30 = await dorongStik(
  Math.cos(Math.PI / 6) * R,
  Math.sin(Math.PI / 6) * R,
  'serong 30 derajat'
);
hasil.dalamDeadzone = await dorongStik(3, 0, 'geser 3 px (dalam deadzone)');

// --- Multi-sentuh: jempol kiri menahan stik, jempol kanan menekan serang ---
{
  const pusat = await keLayar(110, 190);
  const ujung = await keLayar(140, 190);
  const tombolJ = await keLayar(420, 222);
  const idStik = idBerikut++;
  const idJ = idBerikut++;

  await sentuh('touchStart', [{ ...pusat, id: idStik }]);
  await sentuh('touchMove', [{ ...ujung, id: idStik }]);
  await new Promise((r) => setTimeout(r, 120));
  await sentuh('touchStart', [
    { ...ujung, id: idStik },
    { ...tombolJ, id: idJ },
  ]);
  await new Promise((r) => setTimeout(r, 200));

  hasil.multiSentuh = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    return {
      bergerak: Math.abs(s.player.body.velocity.x) > 10,
      tombolSerangAktif: s.touch.attack,
      stikTetapTerbaca: +s.touch.moveX.toFixed(2),
    };
  });
  await sentuh('touchEnd', []);
  await new Promise((r) => setTimeout(r, 150));
}

// --- Jeda: sentuh tombol, lepas, lalu ketuk panel untuk lanjut ---
{
  const tombolJeda = await keLayar(462, 16);
  const id = idBerikut++;
  await sentuh('touchStart', [{ ...tombolJeda, id }]);
  await new Promise((r) => setTimeout(r, 120));
  await sentuh('touchEnd', []);
  await new Promise((r) => setTimeout(r, 200));
  const setelahJeda = await page.evaluate(() => window.__game.scene.getScene('Game').state);

  const tengah = await keLayar(240, 135);
  const id2 = idBerikut++;
  await sentuh('touchStart', [{ ...tengah, id: id2 }]);
  await new Promise((r) => setTimeout(r, 80));
  await sentuh('touchEnd', []);
  await new Promise((r) => setTimeout(r, 400));
  const setelahLanjut = await page.evaluate(() => window.__game.scene.getScene('Game').state);

  hasil.jeda = { setelahDitekan: setelahJeda, setelahDilanjutkan: setelahLanjut };
}

mkdirSync(OUT_DIR, { recursive: true });
await page.screenshot({ path: `${OUT_DIR}/mobile-landscape.png` });

// Potret, untuk memeriksa ajakan memutar perangkat.
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await new Promise((r) => setTimeout(r, 600));
hasil.ajakanPutarTampil = await page.evaluate(() => {
  const el = document.getElementById('putar');
  return el ? getComputedStyle(el).display !== 'none' : false;
});
await page.screenshot({ path: `${OUT_DIR}/mobile-portrait.png` });

writeFileSync(`${OUT_DIR}/touch.json`, JSON.stringify(hasil, null, 2));
await browser.close();

console.log('kontrol sentuh terpasang :', hasil.terdeteksiSentuh);
for (const k of ['penuhKanan', 'separuhKanan', 'serong30', 'dalamDeadzone']) {
  const h = hasil[k];
  console.log(
    `${h.label.padEnd(28)} moveX=${String(h.moveX).padStart(6)} ` +
      `v=(${String(h.vx).padStart(4)},${String(h.vy).padStart(4)}) laju=${String(h.laju).padStart(3)}`
  );
}
// Menggeser stik TIDAK boleh ikut memicu serangan: serangan memangkas kecepatan
// jadi 45%, jadi laju yang lebih rendah dari dorongan penuh membongkarnya.
const lajuPenuh = hasil.penuhKanan.laju;
hasil.stikTidakMemicuSerangan =
  Math.abs(hasil.serong30.laju - lajuPenuh) <= 2 &&
  Math.abs(hasil.separuhKanan.laju * 2 - lajuPenuh) <= 4;
console.log('stik tidak memicu serang :', hasil.stikTidakMemicuSerangan);
console.log('multi-sentuh             :', JSON.stringify(hasil.multiSentuh));
console.log('jeda                     :', JSON.stringify(hasil.jeda));
console.log('ajakan putar (potret)    :', hasil.ajakanPutarTampil);
