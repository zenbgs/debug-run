/**
 * Ukur seberapa sering musuh tersangkut di rintangan.
 *
 * AI mengejar tidak punya pathfinding: musuh mendorong lurus ke pemain dan bisa
 * berhenti di balik batu/pohon. Karena wave baru hanya bersih kalau SEMUA musuh
 * mati, satu musuh nyangkut bisa mengunci seluruh sesi.
 *
 * Yang diukur — angka, bukan "tidak error":
 *  1. Berapa persen waktu-musuh dihabiskan tanpa bergerak.
 *  2. Berapa banyak kejadian nyangkut yang penyebabnya RINTANGAN.
 *  3. Berapa lama sangkutan rintangan terpanjang — ini yang terlihat sebagai bug.
 *  4. Berapa musuh yang nyangkut berulang kali.
 *
 * Dua hal yang membuat angkanya bisa dipercaya, keduanya hasil kesalahan versi
 * sebelumnya:
 *
 *  * **Seed arena dikunci.** Layout diacak tiap sesi, jadi dua percobaan dengan
 *    peta berbeda tidak bisa dibandingkan sama sekali. Versi pertama harness ini
 *    mengukur sebelum dan sesudah pada arena berbeda, dan angkanya sempat
 *    terlihat MEMBURUK padahal perbaikannya bekerja.
 *  * **Nyangkut rintangan dipisahkan dari berdesakan.** Dengan pemain diam,
 *    belasan musuh berkerumun dan saling menghalangi. Itu bukan bug rintangan,
 *    dan kalau ikut dihitung ia menenggelamkan angka yang benar-benar dicari.
 *    Pembedanya: ada tidaknya tile padat tepat di depan arah gerak musuh.
 *
 * Pemain sengaja DIDIAMKAN. Kalau ia bergerak, musuh yang nyangkut terbebas
 * sendiri begitu sudut kejarnya berubah, dan hasilnya jauh lebih bagus daripada
 * kenyataan saat pemain bertahan di satu tempat.
 *
 * Jalankan:  node tools/verify_stuck.mjs [url]
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const URL_GAME = process.argv[2] ?? 'http://localhost:5177/';
const OUT_DIR = 'tools/verify-out';

/** Arena tetap supaya sebelum/sesudah benar-benar setara. */
const SEEDS = [11, 22, 33, 44, 55, 66];

const DURASI_MS = 12000;
const SAMPEL_MS = 100;
/** Perpindahan di bawah ini (piksel per sampel) dianggap "tidak bergerak". */
const DIAM_PX = 1.2;
/** Musuh sedekat ini ke pemain memang berhenti untuk memukul — bukan nyangkut. */
const RADIUS_SERANG = 42;
/** Sangkutan di bawah ini tidak terlihat oleh pemain. */
const AMBANG_LAPOR_MS = 600;

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

/** Satu percobaan penuh pada satu seed arena. */
async function coba(seed) {
  await page.goto(URL_GAME, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__game?.isBooted, { timeout: 20000 });
  await page.evaluate(() => {
    window.__game.scene.stop('Title');
    window.__game.scene.start('Game', { classId: 'warrior' });
  });
  await page.waitForFunction(() => window.__game.scene.getScene('Game')?.waves !== undefined, {
    timeout: 20000,
  });
  await tidur(900);

  await page.evaluate((sd) => {
    const s = window.__game.scene.getScene('Game');
    s.rebuildArenaForWave(1, sd);

    s.player.takeDamage = () => false;
    s.player.setVirtualInput({ moveX: 0, moveY: 0, attack: false });

    // Antrean diperpanjang dan batas hidup dinaikkan supaya sampelnya banyak.
    // JANGAN membekukan `waves.update` — itu juga mematikan spawn, dan percobaan
    // berjalan tanpa satu pun musuh (versi pertama harness ini begitu, lalu
    // melaporkan "0% tersangkut" yang terbaca seperti kabar baik).
    const w = s.waves.currentWave;
    w.maxAlive = 14;
    w.spawnIntervalMs = 200;
    s.waves.queue = Array.from({ length: 60 }, (_, i) => ['glitchling', 'crawler', 'moth'][i % 3]);
  }, seed);
  await tidur(2600);

  return page.evaluate(
    async ([durasi, sampelMs]) => {
      const s = window.__game.scene.getScene('Game');
      const rekam = [];
      const mulai = performance.now();

      while (performance.now() - mulai < durasi) {
        const t = performance.now() - mulai;
        const baris = [];
        for (const e of s.enemyGroup.getChildren()) {
          if (!e.active || !e.body) continue;
          // Ada tile padat tepat di depan arah geraknya? Inilah yang membedakan
          // "nyangkut di pohon" dari "terhimpit musuh lain".
          const l = Math.hypot(e.body.velocity.x, e.body.velocity.y) || 1;
          const dx = (e.body.velocity.x / l) * 14;
          const dy = (e.body.velocity.y / l) * 14;
          const tile = s.obstacles?.getTileAtWorldXY(e.x + dx, e.y + dy);
          baris.push({
            id: e.name || (e.name = 'e' + baris.length + '_' + Math.round(e.x)),
            x: +e.x.toFixed(2),
            y: +e.y.toFixed(2),
            vx: +e.body.velocity.x.toFixed(1),
            vy: +e.body.velocity.y.toFixed(1),
            jarak: +Math.hypot(e.x - s.player.x, e.y - s.player.y).toFixed(1),
            adaRintangan: !!(tile && tile.collides),
            // Jaring pengaman memindahkan musuh. Kalau ia mendarat DI DALAM
            // tembok, yang terlihat adalah musuh menembus pohon — menukar satu
            // bug dengan bug lain.
            diDalamTembok: (() => {
              const t = s.obstacles?.getTileAtWorldXY(e.x, e.y);
              return !!(t && t.collides);
            })(),
          });
        }
        rekam.push({ t: Math.round(t), musuh: baris });
        await new Promise((r) => setTimeout(r, sampelMs));
      }
      return rekam;
    },
    [DURASI_MS, SAMPEL_MS]
  );
}

/** Ubah satu jejak jadi daftar kejadian tersangkut. */
function analisa(jejak) {
  const perMusuh = new Map();
  for (const frame of jejak) {
    for (const m of frame.musuh) {
      if (!perMusuh.has(m.id)) perMusuh.set(m.id, []);
      perMusuh.get(m.id).push({ t: frame.t, ...m });
    }
  }

  let sampelTotal = 0;
  let sampelNyangkut = 0;
  const sangkutan = [];

  for (const [id, deret] of perMusuh) {
    let aktif = null;
    const tutup = (sampaiT) => {
      if (!aktif) return;
      sangkutan.push({
        id,
        mulai: aktif.t,
        lama: sampaiT - aktif.t,
        sebabRintangan: aktif.rintangan / aktif.n >= 0.5,
      });
      aktif = null;
    };

    for (let i = 1; i < deret.length; i++) {
      const a = deret[i - 1];
      const b = deret[i];
      const pindah = Math.hypot(b.x - a.x, b.y - a.y);
      const inginGerak = Math.hypot(b.vx, b.vy) > 5;
      const diam = pindah < DIAM_PX && inginGerak && b.jarak > RADIUS_SERANG;

      sampelTotal++;
      if (diam) {
        sampelNyangkut++;
        aktif ??= { t: a.t, rintangan: 0, n: 0 };
        aktif.n++;
        if (b.adaRintangan) aktif.rintangan++;
      } else {
        tutup(a.t);
      }
    }
    tutup(deret[deret.length - 1].t);
  }

  /**
   * Ukuran kedua: apakah musuh benar-benar MENDEKAT?
   *
   * Metrik perpindahan di atas bisa dikelabui oleh perbaikannya sendiri — musuh
   * yang menyusur menyusuri tembok selamanya terus "bergerak" padahal tidak
   * pernah sampai. Di sini yang dilihat jarak terdekat yang pernah dicapai:
   * berapa lama ia tidak membaik sama sekali padahal masih jauh.
   *
   * Catatan penting saat membaca hasilnya: dengan pemain DIAM dan 14 musuh
   * mengerumuninya, musuh di barisan belakang memang tidak bisa mendekat karena
   * terhalang musuh lain. Angka ini karena itu tinggi di versi lama MAUPUN baru
   * (11,9 vs 11,8 detik) — ia mengukur desakan, bukan rintangan. Yang menentukan
   * tetap `kejadianRintangan`.
   */
  let takMendekatTerlama = 0;
  for (const deret of perMusuh.values()) {
    let terdekat = Infinity;
    let sejak = null;
    for (const p of deret) {
      if (p.jarak <= RADIUS_SERANG) {
        sejak = null;
        terdekat = Math.min(terdekat, p.jarak);
        continue;
      }
      if (p.jarak < terdekat - 8) {
        terdekat = p.jarak;
        sejak = null;
      } else {
        sejak ??= p.t;
        takMendekatTerlama = Math.max(takMendekatTerlama, p.t - sejak);
      }
    }
  }

  // Jaring pengaman memindahkan musuh. Kalau ia mendarat DI DALAM tembok, yang
  // terlihat adalah musuh menembus pohon — menukar satu bug dengan bug lain.
  let sampelDiDalamTembok = 0;
  for (const deret of perMusuh.values()) {
    for (const p of deret) if (p.diDalamTembok) sampelDiDalamTembok++;
  }

  return {
    jumlahMusuh: perMusuh.size,
    sampelTotal,
    sampelNyangkut,
    sangkutan,
    takMendekatTerlama,
    sampelDiDalamTembok,
  };
}

const semua = [];
let sampelTotal = 0;
let sampelNyangkut = 0;
let musuhDiamati = 0;
let takMendekatTerlama = 0;
let diDalamTembok = 0;

console.log('');
for (const seed of SEEDS) {
  const r = analisa(await coba(seed));
  sampelTotal += r.sampelTotal;
  sampelNyangkut += r.sampelNyangkut;
  musuhDiamati += r.jumlahMusuh;
  takMendekatTerlama = Math.max(takMendekatTerlama, r.takMendekatTerlama);
  diDalamTembok += r.sampelDiDalamTembok;
  for (const sg of r.sangkutan) semua.push({ ...sg, seed });

  const rint = r.sangkutan.filter((x) => x.lama >= AMBANG_LAPOR_MS && x.sebabRintangan);
  const terlama = rint.reduce((a, x) => Math.max(a, x.lama), 0);
  console.log(
    `  seed ${String(seed).padStart(3)}: ${String(r.jumlahMusuh).padStart(2)} musuh, ` +
      `rintangan ${String(rint.length).padStart(2)} kejadian, terlama ${String(terlama).padStart(5)} ms`
  );
}

const terlihat = semua.filter((s) => s.lama >= AMBANG_LAPOR_MS);
const rintangan = terlihat.filter((s) => s.sebabRintangan);
const perID = new Map();
for (const s of rintangan) {
  const k = `${s.seed}:${s.id}`;
  perID.set(k, (perID.get(k) ?? 0) + 1);
}

const hasil = {
  seeds: SEEDS,
  durasiMsPerSeed: DURASI_MS,
  musuhDiamati,
  sampelTotal,
  persenWaktuDiam: sampelTotal ? +((sampelNyangkut / sampelTotal) * 100).toFixed(2) : 0,
  kejadianRintangan: rintangan.length,
  kejadianBerdesakan: terlihat.length - rintangan.length,
  terlamaRintanganMs: rintangan.reduce((a, s) => Math.max(a, s.lama), 0),
  musuhNyangkutBerulang: [...perID.values()].filter((n) => n > 1).length,
  takMendekatTerlamaMs: takMendekatTerlama,
  sampelMusuhDiDalamTembok: diDalamTembok,
  contoh: rintangan
    .slice()
    .sort((a, b) => b.lama - a.lama)
    .slice(0, 5),
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/stuck.json`, JSON.stringify({ hasil, sangkutan: terlihat }, null, 2));

console.log(`\n${SEEDS.length} arena x ${DURASI_MS / 1000} detik, ${musuhDiamati} musuh:`);
console.log(`  waktu-musuh tidak bergerak : ${hasil.persenWaktuDiam}%`);
console.log(`  nyangkut RINTANGAN         : ${hasil.kejadianRintangan} kejadian`);
console.log(`  terlama di rintangan       : ${hasil.terlamaRintanganMs} ms`);
console.log(`  musuh nyangkut berulang    : ${hasil.musuhNyangkutBerulang}`);
console.log(`  (berdesakan sesama musuh   : ${hasil.kejadianBerdesakan} — bukan bug rintangan)`);
console.log(`  terlama TIDAK MENDEKAT     : ${hasil.takMendekatTerlamaMs} ms (didominasi desakan)`);
console.log(`  musuh berada DI DALAM tembok: ${hasil.sampelMusuhDiDalamTembok} sampel`);
if (hasil.contoh.length) {
  console.log('  terlama:');
  for (const c of hasil.contoh) {
    console.log(`    seed ${String(c.seed).padStart(3)}  ${c.id.padEnd(14)} ${c.lama} ms`);
  }
}
console.log(`\nRincian di ${OUT_DIR}/stuck.json`);

await browser.close();
