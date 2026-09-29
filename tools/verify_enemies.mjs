/**
 * Bukti jalan untuk musuh baru: sprite per arah dan perisai depan.
 *
 * Yang dibuktikan, dan tak satu pun bisa dijangkau unit test:
 *  1. Semua texture musuh benar-benar termuat (tidak ada texture hilang yang
 *     diam-diam tampil sebagai kotak hijau Phaser).
 *  2. Sprite `directional` BERGANTI ANIMASI mengikuti arah gerak — bukan sekadar
 *     dicerminkan mendatar seperti musuh lain.
 *  3. Perisai benar-benar menahan dari DEPAN dan TIDAK menahan dari belakang,
 *     diukur dari HP yang sungguh berkurang.
 *  4. Damage area (knockback nol) menembus perisai, sesuai rancangan.
 *  5. Roster musuh yang dipakai wave 1-10 memakai lebih dari tiga texture —
 *     ini keluhan aslinya: "bentuknya sama semua".
 *
 * Jalankan:  node tools/verify_enemies.mjs [url]
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

await page.goto(URL_GAME, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__game?.isBooted, { timeout: 20000 });
await page.evaluate(() => {
  window.__game.scene.stop('Title');
  window.__game.scene.start('Game', { classId: 'warrior' });
});
await page.waitForFunction(() => window.__game.scene.getScene('Game')?.waves !== undefined, {
  timeout: 20000,
});
await tidur(1200);

const hasil = {};

// --- 1 & 5. Roster dan texture ------------------------------------------------
hasil.roster = await page.evaluate(async () => {
  const { ENEMY_TYPES } = await import('/src/data/enemies.ts');
  const { WAVES } = await import('/src/data/waves.ts');
  const tex = window.__game.textures;

  const dipakai = new Set();
  for (const w of WAVES) for (const e of w.entries) dipakai.add(e.typeId);

  const tipeDipakai = ENEMY_TYPES.filter((t) => dipakai.has(t.id));
  return {
    jumlahTipe: ENEMY_TYPES.length,
    tipeDiWave: tipeDipakai.length,
    textureDiWave: [...new Set(tipeDipakai.map((t) => t.texture))].sort(),
    textureHilang: ENEMY_TYPES.filter((t) => !tex.exists(t.texture)).map((t) => t.id),
    berperisai: ENEMY_TYPES.filter((t) => (t.shieldReduction ?? 0) > 0).map((t) => t.id),
    perArah: ENEMY_TYPES.filter((t) => t.directional).map((t) => t.id),
  };
});

/** Buat satu musuh dari tipe tertentu, terisolasi di tengah arena. */
async function taruhMusuh(typeId, dx = 60, dy = 0) {
  return page.evaluate(
    async ([id, ox, oy]) => {
      const { SPAWNABLE_BY_ID } = await import('/src/data/bosses.ts');
      const s = window.__game.scene.getScene('Game');
      s.waves.update = () => {};
      s.enemyGroup
        .getChildren()
        .slice()
        .forEach((e) => e.destroy());

      const tipe = SPAWNABLE_BY_ID.get(id);
      const e = s.createEnemy(tipe, s.player.x + ox, s.player.y + oy);
      e.setDepth(10);
      s.enemyGroup.add(e);
      s.invalidateAliveCache?.();
      // Tidak ikut terdorong/bertabrakan selama diukur.
      e.body.checkCollision.none = true;
      // Pemain dibuat kebal: fase animasi menaruh pemain berulang kali di dekat
      // musuh, dan kalau ia mati scene berpindah ke layar kalah — musuhnya ikut
      // hilang dan pengukuran berikutnya meledak dengan pesan yang menyesatkan.
      s.player.takeDamage = () => false;
      return { dibuat: true, jumlah: s.enemyGroup.getChildren().length, state: s.state };
    },
    [typeId, dx, dy]
  );
}

/** Pastikan musuhnya benar-benar ada sebelum diukur. */
async function pastikanAda(label) {
  const n = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    return { jumlah: s.enemyGroup.getChildren().length, state: s.state };
  });
  if (n.jumlah === 0) throw new Error(`${label}: tidak ada musuh (state=${n.state})`);
  return n;
}

const musuh = () =>
  page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    const e = s.enemyGroup.getChildren()[0];
    return e ? { hp: e.currentHp, anim: e.anims.currentAnim?.key ?? null, flip: e.flipX } : null;
  });

// --- 2. Animasi per arah ------------------------------------------------------
hasil.spawn1 = await taruhMusuh('sentry');
await tidur(300);
await pastikanAda('fase animasi');
hasil.perArah = {};
for (const [nama, vx, vy] of [
  ['bawah', 0, 1],
  ['atas', 0, -1],
  ['kanan', 1, 0],
  ['kiri', -1, 0],
]) {
  await page.evaluate(
    ([x, y]) => {
      const s = window.__game.scene.getScene('Game');
      const e = s.enemyGroup.getChildren()[0];
      // Perilakunya menimpa kecepatan tiap frame, jadi posisi PEMAIN yang
      // dipindahkan — dengan begitu musuh benar-benar memilih arahnya sendiri.
      s.player.setPosition(e.x + x * 120, e.y + y * 120);
    },
    [vx, vy]
  );
  await tidur(420);
  hasil.perArah[nama] = await musuh();
}

// --- 3 & 4. Perisai -----------------------------------------------------------
/**
 * Pukul musuh dari satu arah dan ukur HP yang benar-benar hilang.
 *
 * Knockback-nya sengaja diarahkan MENJAUH dari penyerang, persis seperti yang
 * dilakukan CombatSystem dan PlayerProjectiles — dari situlah arah serangan
 * diturunkan tanpa mengubah tanda tangan fungsi mana pun.
 */
async function pukulDari(sudut, knockback = 100) {
  return page.evaluate(
    ([a, kb]) => {
      const s = window.__game.scene.getScene('Game');
      const e = s.enemyGroup.getChildren()[0];
      // Musuh dibuat menghadap ke BAWAH secara tetap supaya sudut serangan
      // punya acuan yang pasti.
      e.faceX = 0;
      e.faceY = 1;
      // HP disetel ulang tiap pengukuran supaya keempatnya saling bebas. Tanpa
      // ini musuhnya mati di pukulan ketiga (HP 40, damage 20) dan pengukuran
      // keempat meledak dengan pesan yang tidak ada hubungannya dengan perisai.
      e.hp = 500;
      const sebelum = e.currentHp;
      // Knockback menjauh dari penyerang: penyerang ada di arah -(kx,ky).
      e.takeDamage(20, Math.cos(a) * kb, Math.sin(a) * kb);
      return { sebelum, sesudah: e.currentHp, masuk: +(sebelum - e.currentHp).toFixed(2) };
    },
    [sudut, knockback]
  );
}

hasil.spawn2 = await taruhMusuh('sentry');
await tidur(300);
await pastikanAda('fase perisai');
// Musuh menghadap bawah (0,+1). Penyerang di DEPAN berarti ia berada di bawah
// musuh, jadi knockback mendorong musuh ke ATAS: sudut -90 derajat.
hasil.perisai = {
  dariDepan: await pukulDari(-Math.PI / 2),
  dariBelakang: await pukulDari(Math.PI / 2),
  dariSamping: await pukulDari(0),
  areaKnockbackNol: await pukulDari(0, 0),
};

// Pembanding: musuh biasa tidak boleh menahan apa pun.
await taruhMusuh('glitchling');
await tidur(300);
await pastikanAda('pembanding tanpa perisai');
hasil.tanpaPerisai = { dariDepan: await pukulDari(-Math.PI / 2) };

await page.screenshot({ path: `${OUT_DIR}/musuh-baru.png` });

// --- Penilaian ----------------------------------------------------------------
const masalah = [];
const r = hasil.roster;
if (r.textureHilang.length) masalah.push(`texture hilang: ${r.textureHilang.join(', ')}`);
if (r.textureDiWave.length < 5) {
  masalah.push(`wave cuma memakai ${r.textureDiWave.length} texture musuh (target >= 5)`);
}

const anim = Object.fromEntries(Object.entries(hasil.perArah).map(([k, v]) => [k, v?.anim]));
if (new Set(Object.values(anim)).size < 3) {
  masalah.push(`sprite per arah tidak berganti animasi: ${JSON.stringify(anim)}`);
}
if (hasil.perArah.kanan?.flip === hasil.perArah.kiri?.flip) {
  masalah.push('hadap kiri dan kanan tidak dicerminkan');
}

const p = hasil.perisai;
if (!(p.dariDepan.masuk < p.dariBelakang.masuk * 0.5)) {
  masalah.push(
    `perisai tidak menahan dari depan (${p.dariDepan.masuk} vs ${p.dariBelakang.masuk})`
  );
}
if (Math.abs(p.dariBelakang.masuk - 20) > 0.01) {
  masalah.push(`serangan dari belakang tidak masuk penuh: ${p.dariBelakang.masuk}`);
}
if (Math.abs(p.areaKnockbackNol.masuk - 20) > 0.01) {
  masalah.push(`damage area tertahan perisai, seharusnya menembus: ${p.areaKnockbackNol.masuk}`);
}
if (Math.abs(hasil.tanpaPerisai.dariDepan.masuk - 20) > 0.01) {
  masalah.push(`musuh biasa ikut menahan damage: ${hasil.tanpaPerisai.dariDepan.masuk}`);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/enemies.json`, JSON.stringify(hasil, null, 2));

console.log(`\nRoster:`);
console.log(`  tipe musuh          : ${r.jumlahTipe} (${r.tipeDiWave} dipakai wave 1-10)`);
console.log(`  texture berbeda     : ${r.textureDiWave.length}  ${r.textureDiWave.join(', ')}`);
console.log(`  sprite per arah     : ${r.perArah.join(', ') || '-'}`);
console.log(`  berperisai          : ${r.berperisai.join(', ') || '-'}`);

console.log(`\nAnimasi per arah (sentry):`);
for (const [k, v] of Object.entries(hasil.perArah)) {
  console.log(`  ${k.padEnd(6)} anim=${String(v?.anim).padEnd(22)} flip=${v?.flip}`);
}

console.log(`\nPerisai (damage 20 per pukulan):`);
console.log(`  dari depan          : ${p.dariDepan.masuk} masuk`);
console.log(`  dari samping        : ${p.dariSamping.masuk} masuk`);
console.log(`  dari belakang       : ${p.dariBelakang.masuk} masuk`);
console.log(
  `  damage area         : ${p.areaKnockbackNol.masuk} masuk (menembus, sesuai rancangan)`
);
console.log(`  musuh biasa         : ${hasil.tanpaPerisai.dariDepan.masuk} masuk`);

if (masalah.length === 0) {
  console.log('\nLOLOS');
} else {
  console.log('\nGAGAL:');
  for (const m of masalah) console.log('  ' + m);
}
console.log(`Rincian di ${OUT_DIR}/enemies.json`);

await browser.close();
process.exit(masalah.length === 0 ? 0 : 1);
