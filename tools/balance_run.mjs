/**
 * Ukur keseimbangan antar kelas dengan memainkan game sungguhan.
 *
 * Botnya memakai **jalur input yang sama persis dengan pemain** —
 * `Player.setVirtualInput()`, antarmuka yang sama yang dipakai stik analog di
 * ponsel. Ia tidak boleh memanggil fungsi internal untuk bergerak atau menyerang;
 * kalau boleh, yang terukur adalah kelihaian bot, bukan kekuatan kelas.
 *
 * Kebijakannya **satu untuk semua kelas**, hanya jaraknya yang diturunkan dari
 * data kelas itu sendiri (jangkauan proyektil atau jangkauan pukulan). Tidak ada
 * kelas yang dapat perlakuan khusus — kalau ada, angkanya tidak berarti apa-apa.
 *
 * ⚠️ **Arah hadap mengikuti arah gerak**, jadi berhenti total berarti arah hadap
 * membeku sementara musuh berputar — proyektilnya melesat ke arah basi. Versi
 * pertama bot ini berhenti begitu masuk jangkauan, dan Archer hanya membunuh 1
 * musuh dalam 46 detik; itu bug bot, bukan temuan keseimbangan. Sekarang bot
 * SELALU mengarah ke musuh, hanya besarannya dikecilkan saat sudah dekat —
 * persis yang bisa dilakukan pemain dengan stik analog.
 *
 * Mode tanpa batas dinyalakan otomatis, jadi tiap run berakhir karena MATI, bukan
 * karena kehabisan naskah. Dengan begitu "wave tercapai" jadi satu angka yang
 * benar-benar membandingkan.
 *
 * Jalankan:  node tools/balance_run.mjs [url] [runPerKelas] [batasDetik]
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const URL_GAME = process.argv[2] ?? 'http://localhost:5177/';
const RUN_PER_KELAS = Number(process.argv[3] ?? 3);
const BATAS_DETIK = Number(process.argv[4] ?? 150);
/** Skor tidak bergerak selama ini -> run dianggap macet dan diulang. */
const MACET_DETIK = 40;
/** Berapa kali sebuah run boleh diulang karena macet. */
const MAKS_ULANG = 3;
const OUT_DIR = 'tools/verify-out';

const require = createRequire(`${execSync('npm root -g').toString().trim()}/`);
const puppeteer = require('puppeteer');

/** Kebijakan bot, dijalankan di dalam halaman tiap frame. */
const BOT = `
(() => {
  const s = window.__game.scene.getScene('Game');
  const kelas = s.player.playerClass;

  // Jarak ideal diturunkan dari data kelas, bukan ditulis tangan per kelas.
  const jangkauan = kelas.projectile ? kelas.projectile.range * 0.75 : 30;

  const bot = {
    moveX: 0, moveY: 0,
    attack: false, skill1: false, skill2: false, dash: false,
  };
  s.player.setVirtualInput(bot);

  let tick = 0;
  let panikSampai = 0;
  let panikBolehLagi = 0;

  // Pelacak macet. Bot tidak punya pathfinding: kalau ada batu di antara dia dan
  // musuh, ia akan mendorong tembok selamanya. Terukur: satu run tertahan di
  // wave 3 selama 12+ detik dengan jarak ke musuh tetap 65 px. Manusia akan
  // memutar; bot harus diajari hal yang sama, kalau tidak yang terukur adalah
  // bentuk arena, bukan kekuatan kelas.
  let lastX = 0, lastY = 0, macetTick = 0;
  let hindarSampai = 0, hindarX = 0, hindarY = 0;

  window.__botStop = false;

  const loop = () => {
    if (window.__botStop) return;
    tick++;

    const musuh = s.enemyGroup.getChildren().filter((e) => e.isAlive);
    let dekat = null, jarakDekat = Infinity;
    for (const e of musuh) {
      const d = Math.hypot(e.x - s.player.x, e.y - s.player.y);
      if (d < jarakDekat) { jarakDekat = d; dekat = e; }
    }

    bot.attack = false; bot.skill1 = false; bot.skill2 = false; bot.dash = false;
    bot.moveX = 0; bot.moveY = 0;

    if (dekat) {
      const dx = dekat.x - s.player.x;
      const dy = dekat.y - s.player.y;
      const panjang = Math.max(1, Math.hypot(dx, dy));
      const nx = dx / panjang, ny = dy / panjang;

      // SELALU mengarah ke musuh — inilah yang menjaga arah hadap benar.
      // Besarannya menurun mulus saat mendekat, bukan turun mendadak: serangan
      // melee melempar musuh sejauh 210 px, dan bot yang merayap 18% tidak pernah
      // sanggup mengejarnya kembali.
      const besar = jarakDekat > jangkauan ? 1 : Math.max(0.18, jarakDekat / jangkauan);
      bot.moveX = nx * besar;
      bot.moveY = ny * besar;

      if (jarakDekat <= jangkauan) {
        bot.attack = true;
        if (tick % 7 === 0) bot.skill1 = true;
        if (tick % 11 === 0) bot.skill2 = true;
      }

      // Menyusuri rintangan: kalau ingin bergerak tapi posisinya tidak berubah,
      // ambil arah tegak lurus sebentar untuk memutari penghalang.
      const geser = Math.hypot(s.player.x - lastX, s.player.y - lastY);
      lastX = s.player.x; lastY = s.player.y;
      if (geser < 0.35 && (bot.moveX !== 0 || bot.moveY !== 0)) macetTick++;
      else macetTick = 0;

      if (macetTick > 8 && tick >= hindarSampai) {
        const arah = Math.random() < 0.5 ? 1 : -1;
        hindarX = -ny * arah; hindarY = nx * arah;
        hindarSampai = tick + 28;
        macetTick = 0;
      }
      if (tick < hindarSampai) {
        bot.moveX = hindarX; bot.moveY = hindarY;
      }

      // Panik: SEMBURAN pendek, bukan mundur terus-menerus.
      //
      // Versi sebelumnya menahan mundur selama syaratnya terpenuhi, dan karena
      // karakter melee selalu berada dalam radius kerumunan, Warrior mundur
      // sepanjang permainan dan hanya membunuh 4 musuh. Menyerang dimatikan
      // selama semburan karena arah hadap ikut membalik saat mundur.
      const rapat = musuh.filter((e) => Math.hypot(e.x - s.player.x, e.y - s.player.y) < 40).length;
      if (tick < panikSampai) {
        bot.moveX = -nx; bot.moveY = -ny;
        bot.dash = true;
        bot.attack = false;
      } else if (tick >= panikBolehLagi && (s.player.healthRatio < 0.35 || rapat >= 4)) {
        panikSampai = tick + 10;
        // Jeda WAJIB. Tanpa ini, HP yang menetap di bawah ambang memicu panik
        // berulang tanpa henti: bot mundur selamanya, tidak pernah membunuh,
        // jadi wave tidak pernah bersih dan upgrade penyembuh tidak pernah
        // datang — kunci mati. Terukur: satu run tertahan di wave 1 selama
        // 200 detik dengan hanya 4 musuh dibasmi.
        panikBolehLagi = tick + 55;
      }
    } else {
      // Tidak ada musuh: berkeliling pelan supaya tidak diam di sudut.
      bot.moveX = Math.cos(tick / 40);
      bot.moveY = Math.sin(tick / 40);
    }

    // Pilih upgrade / lanjut ke mode tanpa batas lewat tombol sungguhan.
    if (s.state === 'upgrade' || s.state === 'victory') {
      const kode = 49 + Math.floor(Math.random() * 3);
      window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: kode, which: kode, key: String.fromCharCode(kode) }));
      window.dispatchEvent(new KeyboardEvent('keyup', { keyCode: kode, which: kode, key: String.fromCharCode(kode) }));
    }
    // Lewati dialog cerita supaya run tidak berhenti menunggu.
    while (s.dialogue.isOpen) { s.dialogue.advance(); s.dialogue.advance(); }

    setTimeout(loop, 32);
  };
  loop();
})()
`;

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});

async function satuRun(kelasId) {
  const page = await browser.newPage();
  await page.setViewport({ width: 960, height: 540 });
  page.on('pageerror', (e) => console.error(`  ! ${kelasId}:`, e.message));

  await page.goto(URL_GAME, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.waitForFunction(() => window.__game?.isBooted, { timeout: 20000 });
  await page.evaluate((k) => {
    window.__game.scene.stop('Title');
    window.__game.scene.start('Game', { classId: k });
  }, kelasId);
  await page.waitForFunction(() => window.__game.scene.getScene('Game')?.waves !== undefined, {
    timeout: 20000,
  });
  await new Promise((r) => setTimeout(r, 800));

  // Mode tanpa batas dinyalakan sejak awal: run berakhir karena mati, bukan
  // karena naskahnya habis di wave 10.
  await page.evaluate(() => window.__game.scene.getScene('Game').waves.enableEndless());
  await page.evaluate(BOT);

  const mulai = Date.now();
  let hasil = null;
  // Deteksi macet: skor yang tidak bergerak sekian lama berarti bot tersangkut,
  // bukan sedang bertarung. Run seperti itu adalah KEGAGALAN ALAT UKUR, bukan
  // hasil permainan — kalau ikut dirata-rata, ia menyeret waktu bertahan naik
  // sambil menahan wave dan skor di bawah. Terukur: 3 dari 15 run berakhir di
  // wave 1-2 setelah 200 detik dan membuat perbandingan antar kelas tak berarti.
  let skorTerakhir = -1;
  let diamSejak = Date.now();

  while (Date.now() - mulai < BATAS_DETIK * 1000) {
    await new Promise((r) => setTimeout(r, 1000));
    hasil = await page.evaluate(() => {
      const s = window.__game.scene.getScene('Game');
      return {
        state: s.state,
        wave: s.waves.waveNumber,
        score: s.score,
        kills: s.kills,
        detik: +(s.elapsedMs / 1000).toFixed(1),
        rantai: s.streak.best,
        fps: Math.round(window.__game.loop.actualFps),
      };
    });
    if (hasil.state === 'gameover') break;

    if (hasil.score !== skorTerakhir) {
      skorTerakhir = hasil.score;
      diamSejak = Date.now();
    } else if (Date.now() - diamSejak > MACET_DETIK * 1000) {
      hasil.macet = true;
      break;
    }
  }
  const kehabisanWaktu = hasil?.state !== 'gameover' && !hasil?.macet;
  await page.evaluate(() => {
    window.__botStop = true;
  });
  await page.close();
  return { ...hasil, kehabisanWaktu };
}

const semua = {};
for (const kelas of ['warrior', 'archer', 'mage']) {
  semua[kelas] = [];
  for (let i = 0; i < RUN_PER_KELAS; i++) {
    let r = await satuRun(kelas);
    let ulang = 0;
    while (r.macet && ulang < MAKS_ULANG) {
      ulang++;
      console.log(`${kelas.padEnd(8)} run ${i + 1}: MACET, diulang (${ulang}/${MAKS_ULANG})`);
      r = await satuRun(kelas);
    }
    r.diulang = ulang;
    semua[kelas].push(r);
    console.log(
      `${kelas.padEnd(8)} run ${i + 1}/${RUN_PER_KELAS}  wave ${String(r.wave).padStart(2)}  ` +
        `skor ${String(r.score).padStart(5)}  bug ${String(r.kills).padStart(3)}  ` +
        `${String(r.detik).padStart(5)}s  fps ${r.fps}` +
        `${r.kehabisanWaktu ? '  (batas waktu)' : ''}${r.macet ? '  (MACET)' : ''}` +
        `${r.diulang ? `  [ulang ${r.diulang}x]` : ''}`
    );
  }
}

await browser.close();

const rata = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const ringkas = {};
console.log('\nkelas     wave(rata/maks)  skor(rata)  bug(rata)  detik(rata)  kehabisan waktu');
for (const [kelas, runs] of Object.entries(semua)) {
  const w = runs.map((r) => r.wave);
  const ringkasan = {
    waveRata: +rata(w).toFixed(1),
    waveMaks: Math.max(...w),
    skorRata: Math.round(rata(runs.map((r) => r.score))),
    killRata: +rata(runs.map((r) => r.kills)).toFixed(1),
    detikRata: +rata(runs.map((r) => r.detik)).toFixed(1),
    kehabisanWaktu: runs.filter((r) => r.kehabisanWaktu).length,
    masihMacet: runs.filter((r) => r.macet).length,
  };
  ringkas[kelas] = ringkasan;
  console.log(
    `${kelas.padEnd(9)} ${String(ringkasan.waveRata).padStart(5)} / ${String(ringkasan.waveMaks).padStart(2)}` +
      `${String(ringkasan.skorRata).padStart(13)}${String(ringkasan.killRata).padStart(11)}` +
      `${String(ringkasan.detikRata).padStart(13)}${String(ringkasan.kehabisanWaktu).padStart(17)}`
  );
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/balance.json`, JSON.stringify({ ringkas, semua }, null, 2));

// Sebaran: kelas terkuat dibanding terlemah.
const waves = Object.values(ringkas).map((r) => r.waveRata);
const sebaran = Math.max(...waves) / Math.max(0.1, Math.min(...waves));
console.log(`\nsebaran wave rata-rata (terkuat / terlemah): ${sebaran.toFixed(2)}x`);
