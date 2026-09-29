/**
 * Bukti jalan untuk permata jatuhan dan Overclock.
 *
 * Yang dibuktikan, dan tak satu pun bisa dijangkau unit test:
 *  1. Musuh mati BENAR-BENAR menjatuhkan permata di lapangan.
 *  2. Permata tertarik ke pemain dan terambil, lalu menghasilkan efeknya
 *     (HP naik / meter naik / skor naik) — diukur dari nilai yang berubah.
 *  3. Permata hilang sendiri setelah umurnya habis, jadi lapangan tidak menumpuk.
 *  4. Meter Overclock terisi dari membunuh.
 *  5. Menekan tombol saat meter BELUM penuh tidak menghabiskan apa pun.
 *  6. Jurus pamungkas benar-benar melukai musuh, dan bentuknya berbeda per kelas.
 *
 * Jalankan:  node tools/verify_overclock.mjs [url]
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
  await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    s.waves.update = () => {};
    s.player.takeDamage = () => false;
    s.player.setVirtualInput({ moveX: 0, moveY: 0, attack: false });
    s.enemyGroup
      .getChildren()
      .slice()
      .forEach((e) => e.destroy());
    s.pickups.clear();
  });
}

/** Taruh sejumlah musuh di sekitar pemain, lalu bunuh semuanya lewat jalur asli. */
const bunuhMusuh = (jumlah, jarak = 40) =>
  page.evaluate(
    async ([n, r]) => {
      const { SPAWNABLE_BY_ID } = await import('/src/data/bosses.ts');
      const s = window.__game.scene.getScene('Game');
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const e = s.createEnemy(
          SPAWNABLE_BY_ID.get('glitchling'),
          s.player.x + Math.cos(a) * r,
          s.player.y + Math.sin(a) * r
        );
        s.enemyGroup.add(e);
        e.takeDamage(9999, 0, 0);
        s.registerKill(e); // pemicu sebenarnya untuk jatuhan & meter
      }
    },
    [jumlah, jarak]
  );

const baca = () =>
  page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    return {
      permata: s.pickups.count,
      meter: +s.overclock.ratio.toFixed(3),
      siap: s.overclock.isReady,
      hp: Math.round(s.player.health),
      maxHp: s.player.maxHealth,
      skor: s.score,
      jurusAktif: s.ultimate.isActive,
      musuhHidup: s.enemyGroup.getChildren().filter((e) => e.isAlive).length,
    };
  });

const hasil = {};

// --- 1. Musuh mati menjatuhkan permata ----------------------------------------
await masukGame('warrior');
// Jatuhan diundi, jadi sampelnya harus banyak supaya angkanya berarti.
await bunuhMusuh(60, 400); // jauh, supaya belum tertarik/terambil
await tidur(200);
const setelahBunuh = await baca();
hasil.jatuhan = {
  dibunuh: 60,
  permataDiLapangan: setelahBunuh.permata,
  meterSetelah60Kill: setelahBunuh.meter,
};

// --- 2. Permata terambil dan menghasilkan efeknya ------------------------------
await masukGame('warrior');
hasil.efekPermata = await page.evaluate(async () => {
  const s = window.__game.scene.getScene('Game');
  const hasil = {};
  const ukur = () => ({
    hp: s.player.health,
    meter: s.overclock.value,
    skor: s.score,
  });

  for (const kind of ['heal', 'charge', 'score']) {
    // Kondisi awal yang membuat efeknya terlihat: HP dilukai dulu supaya
    // penyembuhan punya ruang untuk naik.
    s.player.hp = 40;
    s.overclock.reset();
    s.score = 0;
    s.pickups.clear();

    const sebelum = ukur();
    // Ditaruh TEPAT di pemain supaya langsung masuk radius ambil.
    s.pickups.spawn(s.player.x, s.player.y, kind);
    s.pickups.update();
    const sesudah = ukur();

    hasil[kind] = {
      hp: +(sesudah.hp - sebelum.hp).toFixed(1),
      meter: +(sesudah.meter - sebelum.meter).toFixed(1),
      skor: sesudah.skor - sebelum.skor,
      terambil: s.pickups.count === 0,
    };
  }
  return hasil;
});

// --- 3. Permata kedaluwarsa ---------------------------------------------------
hasil.kedaluwarsa = await page.evaluate(async () => {
  const s = window.__game.scene.getScene('Game');
  s.pickups.clear();
  // Jauh dari pemain supaya tidak tertarik lalu terambil.
  s.pickups.spawn(s.player.x + 600, s.player.y + 400, 'score');
  const sebelum = s.pickups.count;
  // Majukan waktu dengan mengutak-atik penanda kedaluwarsanya, bukan menunggu
  // 7 detik sungguhan — harness yang menunggu jam dinding jadi lambat tanpa
  // menambah keyakinan apa pun.
  for (const g of s.pickups.group.getChildren()) g.setData('expiresAt', 0);
  s.pickups.update();
  return { sebelum, sesudah: s.pickups.count };
});

// --- 4 & 5. Meter dan tombol --------------------------------------------------
await masukGame('warrior');
hasil.meter = await page.evaluate(async () => {
  const s = window.__game.scene.getScene('Game');
  s.overclock.reset();
  const kosong = s.overclock.value;

  // Tombol ditekan saat meter kosong: tidak boleh terjadi apa-apa.
  s.tryOverclock();
  const setelahTekanKosong = { meter: s.overclock.value, jurusAktif: s.ultimate.isActive };

  s.overclock.add(1000); // pasti penuh
  const penuh = s.overclock.isReady;
  return { kosong, setelahTekanKosong, penuh };
});

// --- 6. Jurus melukai, dan bentuknya beda per kelas ----------------------------
hasil.jurus = {};
for (const kelas of ['warrior', 'archer', 'mage']) {
  await masukGame(kelas);
  const r = await page.evaluate(async () => {
    const { SPAWNABLE_BY_ID } = await import('/src/data/bosses.ts');
    const s = window.__game.scene.getScene('Game');

    // Musuh ber-HP besar supaya yang diukur adalah DAMAGE, bukan berapa yang mati.
    const dibuat = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const e = s.createEnemy(
        SPAWNABLE_BY_ID.get('glitchling'),
        s.player.x + Math.cos(a) * 55,
        s.player.y + Math.sin(a) * 55
      );
      e.hp = 100000;
      s.enemyGroup.add(e);
      e.body.checkCollision.none = true;
      dibuat.push(e);
    }
    s.invalidateAliveCache?.();

    const hpSebelum = dibuat.reduce((a, e) => a + e.currentHp, 0);
    s.overclock.add(1000);
    s.tryOverclock();
    return { hpSebelum, nama: s.player.playerClass.id };
  });

  // Biarkan jurus berjalan sampai selesai (yang terpanjang 2,2 detik).
  await tidur(2600);
  const sesudah = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    return {
      hpSesudah: s.enemyGroup.getChildren().reduce((a, e) => a + Math.max(0, e.currentHp), 0),
      meter: s.overclock.value,
      jurusAktif: s.ultimate.isActive,
    };
  });

  hasil.jurus[kelas] = {
    damageTotal: Math.round(r.hpSebelum - sesudah.hpSesudah),
    meterSetelahPakai: sesudah.meter,
    sudahSelesai: !sesudah.jurusAktif,
  };
}

await page.screenshot({ path: `${OUT_DIR}/overclock.png` });

// --- Penilaian ----------------------------------------------------------------
const masalah = [];
if (hasil.jatuhan.permataDiLapangan === 0) masalah.push('60 musuh mati, tidak ada permata jatuh');
if (hasil.jatuhan.permataDiLapangan > 45) {
  masalah.push(`terlalu banyak jatuh (${hasil.jatuhan.permataDiLapangan}/60) — lapangan menumpuk`);
}
if (hasil.jatuhan.meterSetelah60Kill < 1) masalah.push('60 kill tidak membuat meter penuh');

const e = hasil.efekPermata;
if (!(e.heal.hp > 0)) masalah.push(`permata hijau tidak menyembuhkan (${e.heal.hp})`);
if (!(e.charge.meter > 0)) masalah.push(`permata biru tidak mengisi meter (${e.charge.meter})`);
if (!(e.score.skor > 0)) masalah.push(`permata kuning tidak menambah skor (${e.score.skor})`);
for (const [k, v] of Object.entries(e)) {
  if (!v.terambil) masalah.push(`permata ${k} tidak hilang setelah diambil`);
}
if (hasil.kedaluwarsa.sesudah !== 0) masalah.push('permata tidak hilang saat umurnya habis');

if (hasil.meter.setelahTekanKosong.jurusAktif) {
  masalah.push('jurus menyala padahal meter kosong');
}
for (const [kelas, j] of Object.entries(hasil.jurus)) {
  if (j.damageTotal <= 0) masalah.push(`${kelas}: jurus tidak melukai apa pun`);
  if (j.meterSetelahPakai !== 0) masalah.push(`${kelas}: meter tidak habis setelah dipakai`);
  if (!j.sudahSelesai) masalah.push(`${kelas}: jurus tidak berhenti setelah durasinya`);
}

/**
 * Ketiga jurus harus SEBANDING, meski bentuknya berbeda.
 *
 * Ini penjaga yang paling berharga di berkas ini. Dua kali versi pertama lolos
 * semua pemeriksaan lain padahal jurusnya praktis tidak berguna:
 *   * Archer 22 damage — hujannya jatuh acak merata dan hampir selalu mendarat
 *     di rumput kosong.
 *   * Warrior 520 — dorongannya melempar musuh keluar dari radius putarannya
 *     sendiri, jadi enam dari delapan ketukan tidak mengenai apa pun.
 * Keduanya "berjalan tanpa error" dan tetap salah total.
 */
const damage = Object.values(hasil.jurus).map((j) => j.damageTotal);
const rasio = Math.max(...damage) / Math.max(1, Math.min(...damage));
hasil.rasioTerkuatTerlemah = +rasio.toFixed(2);
if (rasio > 2) {
  const rincian = Object.entries(hasil.jurus)
    .map(([k, j]) => `${k}=${j.damageTotal}`)
    .join(', ');
  masalah.push(`jurus timpang: terkuat ${rasio.toFixed(1)}x terlemah (${rincian})`);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/overclock.json`, JSON.stringify(hasil, null, 2));

console.log(`\nJatuhan (60 musuh dibunuh):`);
console.log(`  permata di lapangan : ${hasil.jatuhan.permataDiLapangan}`);
console.log(`  meter setelah 60 kill: ${(hasil.jatuhan.meterSetelah60Kill * 100).toFixed(0)}%`);

console.log(`\nEfek permata:`);
for (const [k, v] of Object.entries(e)) {
  console.log(`  ${k.padEnd(7)} hp +${v.hp}  meter +${v.meter}  skor +${v.skor}`);
}
console.log(`  kedaluwarsa: ${hasil.kedaluwarsa.sebelum} -> ${hasil.kedaluwarsa.sesudah} permata`);

console.log(`\nJurus pamungkas (10 musuh, HP tak terbatas):`);
for (const [kelas, j] of Object.entries(hasil.jurus)) {
  console.log(
    `  ${kelas.padEnd(8)} damage total ${String(j.damageTotal).padStart(5)}  ` +
      `meter sisa ${j.meterSetelahPakai}  selesai: ${j.sudahSelesai}`
  );
}

if (masalah.length === 0) {
  console.log('\nLOLOS');
} else {
  console.log('\nGAGAL:');
  for (const m of masalah) console.log('  ' + m);
}
console.log(`Rincian di ${OUT_DIR}/overclock.json`);

await browser.close();
process.exit(masalah.length === 0 ? 0 : 1);
