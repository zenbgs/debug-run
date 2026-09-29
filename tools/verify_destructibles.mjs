/**
 * Bukti jalan untuk rintangan yang bisa dihancurkan.
 *
 * Yang dibuktikan, dan tak satu pun bisa dijangkau unit test:
 *  1. Rintangan interior BENAR-BENAR hilang dari tilemap setelah cukup dipukul.
 *  2. Tabrakannya ikut hilang — pemain bisa lewat di tempat yang tadinya tembok.
 *     Ini yang sebenarnya penting; tile yang hilang secara visual tapi tetap
 *     menabrak adalah tembok tak terlihat, kegagalan paling mahal di project ini.
 *  3. Rintangan tidak pecah dalam satu pukulan.
 *  4. **Tembok TEPI tidak bisa dijebol** meski dipukul dengan damage raksasa.
 *     Kalau bocor, pemain dan musuh bisa keluar dari arena.
 *  5. Ledakan membuka jalan — ini gunanya paling terasa.
 *  6. Kerusakan TIDAK terbawa ke wave berikutnya.
 *
 * Jalankan:  node tools/verify_destructibles.mjs [url]
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
await tidur(1000);
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.waves.update = () => {};
  s.player.takeDamage = () => false;
  s.enemyGroup
    .getChildren()
    .slice()
    .forEach((e) => e.destroy());
});

const hasil = {};

// --- 1-3. Rintangan interior pecah, dan tabrakannya ikut hilang ---------------
hasil.interior = await page.evaluate(async () => {
  const { isDestructible } = await import('/src/data/destructibles.ts');
  const s = window.__game.scene.getScene('Game');
  const layer = s.obstacles;

  // Cari satu prop interior mana pun.
  let target = null;
  layer.forEachTile((t) => {
    if (!target && t.index >= 0 && isDestructible(t.index)) target = t;
  });
  if (!target) return { error: 'tidak ada rintangan interior di arena ini' };

  const tx = target.x;
  const ty = target.y;
  const cx = (tx + 0.5) * layer.tilemap.tileWidth;
  const cy = (ty + 0.5) * layer.tilemap.tileHeight;
  const indexAwal = target.index;

  // Satu pukulan kecil: belum boleh pecah.
  s.destructibles.damageAt(cx, cy, 8, 5);
  const setelahSatuPukulan = layer.getTileAt(tx, ty)?.index ?? -1;

  // Dihantam sampai pecah.
  s.destructibles.damageAt(cx, cy, 8, 9999);
  const tile = layer.getTileAt(tx, ty);

  return {
    indexAwal,
    setelahSatuPukulan,
    indexSetelahPecah: tile ? tile.index : -1,
    // Inilah yang menentukan: tile yang hilang tapi masih menabrak = tembok tak
    // terlihat. `collides` dibaca dari tile yang sesungguhnya, bukan diasumsikan.
    masihMenabrak: tile ? tile.collides : false,
  };
});

// --- 2b. Pemain benar-benar bisa lewat ---------------------------------------
hasil.bisaDilewati = await page.evaluate(async () => {
  const { isDestructible } = await import('/src/data/destructibles.ts');
  const s = window.__game.scene.getScene('Game');
  const layer = s.obstacles;

  let target = null;
  layer.forEachTile((t) => {
    if (!target && t.index >= 0 && isDestructible(t.index)) target = t;
  });
  if (!target) return { error: 'tidak ada rintangan' };

  const tw = layer.tilemap.tileWidth;
  const th = layer.tilemap.tileHeight;
  const cx = (target.x + 0.5) * tw;
  const cy = (target.y + 0.5) * th;

  // Taruh pemain tepat di sebelah kiri rintangan lalu dorong ke kanan.
  const dorong = async () => {
    s.player.body.reset(cx - tw * 1.6, cy);
    s.player.setVirtualInput({ moveX: 1, moveY: 0, attack: false });
    await new Promise((r) => setTimeout(r, 700));
    const x = s.player.x;
    s.player.setVirtualInput({ moveX: 0, moveY: 0, attack: false });
    return x;
  };

  const xSebelum = await dorong();
  s.destructibles.damageAt(cx, cy, 8, 9999);
  const xSesudah = await dorong();

  return {
    berhentiDiX: Math.round(xSebelum),
    lewatKeX: Math.round(xSesudah),
    rintanganDiX: Math.round(cx),
    // Sebelum dihancurkan ia tertahan di kiri rintangan; sesudahnya ia lewat.
    tertahanSebelum: xSebelum < cx,
    lewatSesudah: xSesudah > cx,
  };
});

// --- 4. Tembok TEPI tidak boleh jebol -----------------------------------------
hasil.tembokTepi = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  const layer = s.obstacles;
  const tw = layer.tilemap.tileWidth;
  const th = layer.tilemap.tileHeight;

  const diperiksa = [];
  // Sampel dari keempat sisi.
  const titik = [
    [1, 6],
    [layer.tilemap.width - 2, 6],
    [6, 1],
    [6, layer.tilemap.height - 2],
  ];
  for (const [tx, ty] of titik) {
    const sebelum = layer.getTileAt(tx, ty)?.index ?? -1;
    if (sebelum < 0) continue;
    // Damage raksasa, jauh di atas HP rintangan mana pun.
    s.destructibles.damageAt((tx + 0.5) * tw, (ty + 0.5) * th, 12, 999999);
    const sesudah = layer.getTileAt(tx, ty)?.index ?? -1;
    diperiksa.push({ tx, ty, sebelum, sesudah, jebol: sesudah !== sebelum });
  }
  return { diperiksa, adaYangJebol: diperiksa.some((d) => d.jebol) };
});

// --- 5. Ledakan membuka jalan -------------------------------------------------
hasil.ledakan = await page.evaluate(async () => {
  const { isDestructible } = await import('/src/data/destructibles.ts');
  const s = window.__game.scene.getScene('Game');
  const layer = s.obstacles;

  const hitung = () => {
    let n = 0;
    layer.forEachTile((t) => {
      if (t.index >= 0 && isDestructible(t.index)) n++;
    });
    return n;
  };

  // Cari kerumunan prop, lalu ledakkan di tengahnya.
  let pusat = null;
  layer.forEachTile((t) => {
    if (!pusat && t.index >= 0 && isDestructible(t.index)) pusat = t;
  });
  if (!pusat) return { error: 'tidak ada rintangan' };

  const sebelum = hitung();
  s.applyEliteBlast({
    x: (pusat.x + 0.5) * layer.tilemap.tileWidth,
    y: (pusat.y + 0.5) * layer.tilemap.tileHeight,
    eliteModifier: { deathBlast: 500 },
    isAlive: false,
  });
  return { sebelum, sesudah: hitung() };
});

// --- 6. Kerusakan tidak terbawa ke wave berikutnya -----------------------------
hasil.antarWave = await page.evaluate(async () => {
  const { isDestructible } = await import('/src/data/destructibles.ts');
  const s = window.__game.scene.getScene('Game');
  const layer = s.obstacles;

  let target = null;
  layer.forEachTile((t) => {
    if (!target && t.index >= 0 && isDestructible(t.index)) target = t;
  });
  if (!target) return { error: 'tidak ada rintangan' };

  // Rusak sebagian (tidak sampai pecah), lalu bangun ulang arena.
  const cx = (target.x + 0.5) * layer.tilemap.tileWidth;
  const cy = (target.y + 0.5) * layer.tilemap.tileHeight;
  s.destructibles.damageAt(cx, cy, 8, 10);
  const rusakSebelum = s.destructibles.damagedCount;

  s.rebuildArenaForWave(2, 123);
  return { rusakSebelum, rusakSetelahWaveBaru: s.destructibles.damagedCount };
});

await page.screenshot({ path: `${OUT_DIR}/destructibles.png` });

// --- Penilaian ----------------------------------------------------------------
const masalah = [];
const i = hasil.interior;
if (i.error) masalah.push(i.error);
else {
  if (i.setelahSatuPukulan !== i.indexAwal) masalah.push('rintangan pecah hanya dengan 5 damage');
  if (i.indexSetelahPecah !== -1) masalah.push('rintangan tidak hilang setelah HP habis');
  if (i.masihMenabrak) masalah.push('TEMBOK TAK TERLIHAT: tile hilang tapi masih menabrak');
}

const b = hasil.bisaDilewati;
if (b.error) masalah.push(b.error);
else {
  if (!b.tertahanSebelum) masalah.push('pemain tidak tertahan rintangan sebelum dihancurkan');
  if (!b.lewatSesudah) masalah.push('pemain tetap tidak bisa lewat setelah rintangan hancur');
}

if (hasil.tembokTepi.adaYangJebol) masalah.push('TEMBOK TEPI JEBOL — arena bisa bocor');
if (hasil.ledakan.error) masalah.push(hasil.ledakan.error);
else if (!(hasil.ledakan.sesudah < hasil.ledakan.sebelum)) {
  masalah.push('ledakan tidak menghancurkan rintangan apa pun');
}
if (hasil.antarWave.rusakSetelahWaveBaru !== 0) {
  masalah.push('kerusakan terbawa ke wave berikutnya');
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/destructibles.json`, JSON.stringify(hasil, null, 2));

console.log(`\nRintangan interior:`);
console.log(`  index awal              : ${i.indexAwal}`);
console.log(`  setelah 5 damage        : ${i.setelahSatuPukulan} (harus tetap sama)`);
console.log(`  setelah dihancurkan     : ${i.indexSetelahPecah} (-1 = hilang)`);
console.log(`  masih menabrak          : ${i.masihMenabrak}`);

console.log(`\nPemain menembus bekasnya:`);
console.log(`  rintangan di x=${b.rintanganDiX}`);
console.log(`  sebelum: berhenti di x=${b.berhentiDiX}  (tertahan: ${b.tertahanSebelum})`);
console.log(`  sesudah: lewat ke   x=${b.lewatKeX}  (lewat: ${b.lewatSesudah})`);

console.log(`\nTembok tepi (damage 999.999):`);
for (const d of hasil.tembokTepi.diperiksa) {
  console.log(`  (${d.tx},${d.ty}) ${d.sebelum} -> ${d.sesudah}  ${d.jebol ? 'JEBOL' : 'utuh'}`);
}

console.log(`\nLedakan: ${hasil.ledakan.sebelum} -> ${hasil.ledakan.sesudah} rintangan`);
console.log(
  `Antar wave: ${hasil.antarWave.rusakSebelum} rusak -> ${hasil.antarWave.rusakSetelahWaveBaru} setelah wave baru`
);

if (masalah.length === 0) {
  console.log('\nLOLOS');
} else {
  console.log('\nGAGAL:');
  for (const m of masalah) console.log('  ' + m);
}
console.log(`Rincian di ${OUT_DIR}/destructibles.json`);

await browser.close();
process.exit(masalah.length === 0 ? 0 : 1);
