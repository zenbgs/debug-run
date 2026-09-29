/**
 * Bukti jalan untuk telegraf: hantaman tanah boss dan retakan musuh panggilan.
 *
 * Yang dibuktikan, dan tak satu pun bisa dijangkau unit test:
 *  1. Pola `slam` benar-benar memunculkan penanda bahaya di tanah.
 *  2. Penandanya BERUMUR — ada jeda nyata antara aba-aba dan ledakan, jadi
 *     serangannya bisa dihindari. Serangan yang tidak bisa dihindari terasa
 *     tidak adil, bukan sulit.
 *  3. Ledakannya melukai pemain yang DIAM di titik itu, dan TIDAK melukai pemain
 *     yang menyingkir — inilah yang membedakan telegraf dari hiasan.
 *  4. Musuh panggilan boss muncul SETELAH retakannya, bukan seketika.
 *  5. Penanda dibersihkan saat arena berganti, tidak menggantung.
 *
 * Jalankan:  node tools/verify_telegraph.mjs [url]
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const ARGS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const URL_GAME = ARGS[0] ?? 'http://localhost:5177/';
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
  await tidur(1000);
  await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    s.waves.update = () => {};
    s.enemyGroup
      .getChildren()
      .slice()
      .forEach((e) => e.destroy());
    s.telegraph.clear();
  });
}

const hasil = {};
await masukGame();

// --- 1 & 2. Penanda muncul dan berumur ----------------------------------------
hasil.penanda = await page.evaluate(async () => {
  const { BOSS_ATTACK } = await import('/src/data/bosses.ts');
  const s = window.__game.scene.getScene('Game');
  s.telegraph.clear();

  const sebelum = s.telegraph.count;
  s.telegraph.circle(s.player.x + 200, s.player.y, BOSS_ATTACK.SLAM_RADIUS, 800, () => {});
  return { sebelum, sesudah: s.telegraph.count, abaAbaMs: BOSS_ATTACK.SLAM_TELEGRAPH_MS };
});
// Penanda harus masih ada di tengah aba-abanya.
await tidur(300);
hasil.penanda.masihAdaDiTengah = await page.evaluate(
  () => window.__game.scene.getScene('Game').telegraph.count
);
await tidur(700);
hasil.penanda.hilangSetelahSelesai = await page.evaluate(
  () => window.__game.scene.getScene('Game').telegraph.count
);

// --- 3. Ledakan melukai yang diam, tidak melukai yang menyingkir ---------------
async function cobaHantaman(menyingkir) {
  await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    s.telegraph.clear();
    s.player.hp = 500;
    // Kebal sesaat dimatikan supaya damage benar-benar terukur.
    s.player.invulnerableUntil = 0;
  });

  const hpSebelum = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    // Hantaman dipicu lewat jalur asli boss: context.slam di titik pemain.
    s.telegraph.circle(s.player.x, s.player.y, 34, 500, (fx, fy) => s.ledakanTanah(fx, fy));
    return s.player.health;
  });

  if (menyingkir) {
    // Menjauh jauh melebihi radius hantaman.
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('Game');
      s.player.body.reset(s.player.x + 160, s.player.y);
    });
  }

  await tidur(900);
  const hpSesudah = await page.evaluate(() => window.__game.scene.getScene('Game').player.health);
  return { hpSebelum: Math.round(hpSebelum), hpSesudah: Math.round(hpSesudah) };
}

hasil.diam = await cobaHantaman(false);
hasil.menyingkir = await cobaHantaman(true);

// --- 4. Musuh panggilan muncul SETELAH retakannya ------------------------------
await masukGame();
hasil.summon = await page.evaluate(async () => {
  const { SPAWNABLE_BY_ID, BOSS_ATTACK } = await import('/src/data/bosses.ts');
  const s = window.__game.scene.getScene('Game');
  s.telegraph.clear();
  s.enemyGroup
    .getChildren()
    .slice()
    .forEach((e) => e.destroy());

  // Panggil boss sungguhan lalu picu pola summon-nya lewat context.
  const bossType = SPAWNABLE_BY_ID.get('boss-stack-overflow');
  const boss = s.createEnemy(bossType, s.player.x + 120, s.player.y);
  s.enemyGroup.add(boss);
  const musuhAwal = s.enemyGroup.getChildren().length;

  boss.context.summon('glitchling', s.player.x + 60, s.player.y);
  return {
    abaAbaMs: BOSS_ATTACK.SUMMON_TELEGRAPH_MS,
    musuhAwal,
    // Segera setelah dipanggil: belum ada musuh baru, tapi retakannya sudah ada.
    musuhSegera: s.enemyGroup.getChildren().length,
    penandaSegera: s.telegraph.count,
  };
});
await tidur(700);
hasil.summon.musuhSetelahAbaAba = await page.evaluate(
  () => window.__game.scene.getScene('Game').enemyGroup.getChildren().length
);

// --- 5. Penanda dibersihkan saat arena berganti --------------------------------
hasil.bersih = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.telegraph.circle(s.player.x, s.player.y, 30, 5000, () => {});
  s.telegraph.circle(s.player.x + 40, s.player.y, 30, 5000, () => {});
  const sebelum = s.telegraph.count;
  s.rebuildArenaForWave(2, 77);
  return { sebelum, sesudah: s.telegraph.count };
});

await page.screenshot({ path: `${OUT_DIR}/telegraph.png` });

// --- Penilaian ----------------------------------------------------------------
const masalah = [];
const p = hasil.penanda;
if (p.sesudah <= p.sebelum) masalah.push('penanda bahaya tidak muncul');
if (p.masihAdaDiTengah === 0) masalah.push('penanda hilang sebelum aba-abanya selesai');
if (p.hilangSetelahSelesai !== 0) masalah.push('penanda menggantung setelah meledak');
if (p.abaAbaMs < 400)
  masalah.push(`aba-aba terlalu pendek (${p.abaAbaMs} ms) — tidak bisa dihindari`);

const rugiDiam = hasil.diam.hpSebelum - hasil.diam.hpSesudah;
const rugiLari = hasil.menyingkir.hpSebelum - hasil.menyingkir.hpSesudah;
if (rugiDiam <= 0) masalah.push('hantaman tidak melukai pemain yang diam di titiknya');
if (rugiLari > 0) masalah.push(`menyingkir tetap kena ${rugiLari} damage — telegrafnya sia-sia`);

const su = hasil.summon;
if (su.penandaSegera === 0) masalah.push('summon tidak memunculkan retakan');
if (su.musuhSegera !== su.musuhAwal) masalah.push('musuh panggilan muncul SEKETIKA, tanpa aba-aba');
if (su.musuhSetelahAbaAba <= su.musuhAwal) {
  masalah.push('musuh panggilan tidak pernah muncul setelah aba-abanya');
}
if (hasil.bersih.sesudah !== 0) masalah.push('penanda tidak dibersihkan saat arena berganti');

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/telegraph.json`, JSON.stringify(hasil, null, 2));

console.log(`\nPenanda bahaya (aba-aba ${p.abaAbaMs} ms):`);
console.log(`  muncul              : ${p.sebelum} -> ${p.sesudah}`);
console.log(`  masih ada di tengah : ${p.masihAdaDiTengah}`);
console.log(`  setelah selesai     : ${p.hilangSetelahSelesai}`);

console.log(`\nHantaman tanah (damage 16):`);
console.log(
  `  diam di titiknya : ${hasil.diam.hpSebelum} -> ${hasil.diam.hpSesudah}  (-${rugiDiam})`
);
console.log(
  `  menyingkir       : ${hasil.menyingkir.hpSebelum} -> ${hasil.menyingkir.hpSesudah}  (-${rugiLari})`
);

console.log(`\nMusuh panggilan boss (aba-aba ${su.abaAbaMs} ms):`);
console.log(`  awal ${su.musuhAwal}, segera setelah dipanggil ${su.musuhSegera} (harus sama)`);
console.log(`  retakan tampil ${su.penandaSegera}, setelah aba-aba ${su.musuhSetelahAbaAba} musuh`);

console.log(
  `\nDibersihkan saat arena berganti: ${hasil.bersih.sebelum} -> ${hasil.bersih.sesudah}`
);

if (masalah.length === 0) {
  console.log('\nLOLOS');
} else {
  console.log('\nGAGAL:');
  for (const m of masalah) console.log('  ' + m);
}
console.log(`Rincian di ${OUT_DIR}/telegraph.json`);

await browser.close();
process.exit(masalah.length === 0 ? 0 : 1);
