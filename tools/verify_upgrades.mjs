/**
 * Bukti jalan untuk upgrade yang mengubah cara main.
 *
 * Unit test hanya membuktikan `apply()` mengubah angka di `PlayerStats`. Yang
 * dibuktikan di sini adalah angka itu benar-benar **sampai ke permainan** —
 * proyektil bertambah, menembus, sambaran melukai tetangga, dan penyembuhan
 * wave benar-benar terjadi.
 *
 * ⚠️ Collider proyektil-vs-rintangan sengaja dilepas selama pengukuran. Arena
 * diacak tiap sesi, dan batu yang kebetulan berdiri di jalur tembak akan
 * menghancurkan proyektil sebelum sempat menembus — versi pertama harness ini
 * melaporkan "tembus tidak bekerja" padahal yang salah adalah tempat ujinya.
 *
 * Jalankan:  node tools/verify_upgrades.mjs [url]
 */

import { writeFileSync, mkdirSync } from 'node:fs';
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

await page.goto(URL_GAME, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__game?.isBooted, { timeout: 20000 });
await page.evaluate(() => {
  window.__game.scene.stop('Title');
  window.__game.scene.start('Game', { classId: 'archer' });
});
await page.waitForFunction(() => window.__game.scene.getScene('Game')?.waves !== undefined, {
  timeout: 20000,
});
await new Promise((r) => setTimeout(r, 1200));

const hasil = await page.evaluate(async () => {
  const s = window.__game.scene.getScene('Game');
  const U = (await import('/src/data/upgrades.ts')).UPGRADES;
  const E = (await import('/src/data/enemies.ts')).ENEMY_TYPES;
  const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
  const ambil = (id) => s.player.applyUpgrade(U.find((u) => u.id === id));

  const bersihkan = () => {
    s.enemyGroup.getChildren().slice().forEach((e) => e.destroy());
    s.projectiles.clear();
    s.invalidateAliveCache();
  };
  /** Musuh diam dan tak bisa mati — supaya yang diukur murni damage. */
  const patung = (dx) => {
    const e = s.createEnemy(E[0], s.player.x + dx, s.player.y);
    e.setDepth(8);
    s.enemyGroup.add(e);
    e.hp = 99999;
    e.body.moves = false;
    e.tick = () => {};
    s.invalidateAliveCache();
    return e;
  };

  // Lihat catatan di kepala berkas.
  for (const c of s.physics.world.colliders.getActive()) {
    if (c.object1 === s.projectiles.group) c.destroy();
  }
  s._ka = setInterval(() => {
    if (s.player?.active) s.player.hp = 9999;
  }, 80);

  const out = {};
  s.player.facing = 'right';

  // --- Tembakan Pecah: jumlah proyektil per tembakan ---
  const hitungProyektil = async () => {
    // Serangan punya masa pemulihan; menembak beruntun tanpa jeda membuat
    // pengukuran kedua dan seterusnya mengembalikan nol — bukan karena upgrade
    // gagal, tapi karena tombolnya memang belum boleh ditekan lagi.
    await tidur(900);
    s.projectiles.clear();
    s.player.tryAttack();
    await tidur(120);
    return s.projectiles.group.getChildren().filter((x) => x.active).length;
  };
  bersihkan();
  out.proyektilDasar = await hitungProyektil();
  ambil('split-shot');
  out.proyektilSetelah1 = await hitungProyektil();
  ambil('split-shot');
  out.proyektilSetelah2 = await hitungProyektil();

  // --- Tembakan Tembus: satu tembakan, dua musuh sebaris ---
  const ujiTembus = async (pakai) => {
    await tidur(900);
    bersihkan();
    // Tembakan Pecah dari bagian sebelumnya harus dinolkan; tiga proyektil yang
    // semuanya mengenai musuh depan membuat angkanya 3x dan menyesatkan.
    s.player.stats.projectileBonus = 0;
    s.player.stats.piercing = pakai;
    const depan = patung(55);
    const belakang = patung(95);
    const a = depan.currentHp;
    const c = belakang.currentHp;
    s.player.tryAttack();
    await tidur(800);
    return {
      depan: +(a - depan.currentHp).toFixed(1),
      belakang: +(c - belakang.currentHp).toFixed(1),
    };
  };
  out.tanpaTembus = await ujiTembus(false);
  out.denganTembus = await ujiTembus(true);

  // --- Percik Rantai: kematian melukai tetangga terdekat ---
  bersihkan();
  s.player.stats.chainDamage = 0;
  const tetanggaA = patung(120);
  let hpA = tetanggaA.currentHp;
  let korban = patung(90);
  korban.hp = 1;
  korban.takeDamage(999, 0, 0);
  s.registerKill(korban);
  await tidur(150);
  out.rantaiSebelum = +(hpA - tetanggaA.currentHp).toFixed(1);

  bersihkan();
  ambil('chain-spark');
  const tetanggaB = patung(120);
  hpA = tetanggaB.currentHp;
  korban = patung(90);
  korban.hp = 1;
  korban.takeDamage(999, 0, 0);
  s.registerKill(korban);
  await tidur(150);
  out.rantaiSesudah = +(hpA - tetanggaB.currentHp).toFixed(1);

  // --- Pendinginan ---
  out.skillCdSebelum = +s.player.stats.skillCooldownMultiplier.toFixed(2);
  out.dashCdSebelum = +s.player.stats.dashCooldownMultiplier.toFixed(2);
  ambil('swift-cast');
  ambil('quick-step');
  out.skillCdSesudah = +s.player.stats.skillCooldownMultiplier.toFixed(2);
  out.dashCdSesudah = +s.player.stats.dashCooldownMultiplier.toFixed(2);

  // --- Kotak P3K: pulih otomatis saat wave baru ---
  clearInterval(s._ka);
  bersihkan();
  ambil('field-kit');
  s.player.hp = 10;
  s.waves.beginWave(1);
  await tidur(500);
  out.hpSebelumWave = 10;
  out.hpSetelahWave = Math.round(s.player.health);

  return out;
});

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/upgrades.json`, JSON.stringify(hasil, null, 2));
await browser.close();

const baris = (nama, nilai) => console.log(`${nama.padEnd(26)} ${nilai}`);
baris('proyektil dasar', hasil.proyektilDasar);
baris('+1 Tembakan Pecah', hasil.proyektilSetelah1);
baris('+2 Tembakan Pecah', hasil.proyektilSetelah2);
baris('tanpa tembus (depan/blkg)', `${hasil.tanpaTembus.depan} / ${hasil.tanpaTembus.belakang}`);
baris('dengan tembus (depan/blkg)', `${hasil.denganTembus.depan} / ${hasil.denganTembus.belakang}`);
baris('rantai sebelum / sesudah', `${hasil.rantaiSebelum} / ${hasil.rantaiSesudah}`);
baris('skill cd sebelum/sesudah', `${hasil.skillCdSebelum} / ${hasil.skillCdSesudah}`);
baris('dash cd sebelum/sesudah', `${hasil.dashCdSebelum} / ${hasil.dashCdSesudah}`);
baris('HP wave baru (P3K)', `${hasil.hpSebelumWave} -> ${hasil.hpSetelahWave}`);
