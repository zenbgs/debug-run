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

// Bendera disaring dulu; tanpa ini `--diam` terbaca sebagai URL dan puppeteer
// gagal dengan "Cannot navigate to invalid URL".
const ARGS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const URL_GAME = ARGS[0] ?? 'http://localhost:5177/';
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

/**
 * Satu percobaan penuh pada satu seed arena.
 *
 * @param bergerak pemain berjalan memutar, bukan diam. Ini skenario yang
 *   sebenarnya dimainkan, dan ia MENGUNGKAP hal yang tidak terlihat saat pemain
 *   diam: arah manuver yang dipegang beberapa ratus milidetik dipilih dari posisi
 *   pemain SAAT ITU. Kalau pemainnya pindah, arah itu bisa berubah jadi menjauh,
 *   dan gerombolan terlihat berlarian ke arah lain alih-alih menghampiri.
 */
async function coba(seed, bergerak) {
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
    // SEMUA perilaku ikut diuji, bukan cuma pengejar polos. `charger` dan
    // `spitter` punya fase gerak sendiri (mengancang, menjaga jarak), dan logika
    // menghindar rintangan berjalan SETELAH perilaku itu — jadi ia bisa
    // membajaknya. Versi pertama harness ini hanya memakai tiga tipe pengejar,
    // dan karena itu tidak melihat apa pun yang salah.
    const jenis = ['glitchling', 'crawler', 'moth', 'spitter', 'charger', 'glitchling-swift'];
    s.waves.queue = Array.from({ length: 60 }, (_, i) => jenis[i % jenis.length]);
  }, seed);
  await tidur(2600);

  return page.evaluate(
    async ([durasi, sampelMs, jalan]) => {
      const s = window.__game.scene.getScene('Game');
      const rekam = [];
      const mulai = performance.now();

      while (performance.now() - mulai < durasi) {
        const t = performance.now() - mulai;
        if (jalan) {
          // Berjalan memutar pelan: menjauh, lalu berbelok. Cukup untuk membuat
          // arah kejar berubah terus tanpa keluar arena.
          const a = (t / 2600) * Math.PI * 2;
          s.player.setVirtualInput({ moveX: Math.cos(a), moveY: Math.sin(a), attack: false });
        }
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
            tipe: e.config?.id ?? '?',
            perilaku: e.config?.behavior ?? '?',
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
    [DURASI_MS, SAMPEL_MS, bergerak]
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
  /**
   * Ukuran yang PALING penting: apakah musuh benar-benar SAMPAI ke pemain?
   *
   * "Tidak tersangkut" saja ternyata bisa menipu. Perbaikan yang membuat musuh
   * terus menyamping lolos dari SEMUA ukuran sangkutan di atas, padahal musuhnya
   * berputar-putar dan tidak pernah tiba. Yang dirasakan pemain justru itu:
   * gerombolan yang tidak datang-datang.
   */
  let sampai = 0;
  let nPengejar = 0;
  const jarakTerdekat = [];
  /**
   * Per tipe musuh. `shooter` DIKECUALIKAN dari syarat "harus sampai": ia memang
   * dirancang menjaga jarak dan menembak (SPEC 6.0b). Memaksanya mendekat
   * menghapus seluruh gunanya. Angkanya tetap dilaporkan, hanya tidak dinilai.
   */
  const perTipe = new Map();
  for (const deret of perMusuh.values()) {
    const min = Math.min(...deret.map((p) => p.jarak));
    const penembak = deret[0].perilaku === 'shooter';
    if (!penembak) {
      jarakTerdekat.push(min);
      nPengejar++;
      if (min <= RADIUS_SERANG) sampai++;
    }
    const tiba = min <= RADIUS_SERANG;
    const tipe = deret[0].tipe ?? '?';
    const t = perTipe.get(tipe) ?? { n: 0, sampai: 0, jarak: [] };
    t.n++;
    if (tiba) t.sampai++;
    t.jarak.push(min);
    perTipe.set(tipe, t);
  }

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
    sampai,
    nPengejar,
    jarakTerdekat,
    perTipe,
  };
}

/** Jalankan semua seed untuk satu skenario, lalu rangkum. */
async function babak(bergerak) {
  const semua = [];
  let sampelTotal = 0;
  let sampelNyangkut = 0;
  let musuhDiamati = 0;
  let takMendekatTerlama = 0;
  let diDalamTembok = 0;
  let sampai = 0;
  let nPengejar = 0;
  const jarakTerdekat = [];
  const perTipe = new Map();

  console.log('');
  console.log(`--- pemain ${bergerak ? 'BERGERAK' : 'diam'} ---`);
  for (const seed of SEEDS) {
    const r = analisa(await coba(seed, bergerak));
    sampelTotal += r.sampelTotal;
    sampelNyangkut += r.sampelNyangkut;
    musuhDiamati += r.jumlahMusuh;
    takMendekatTerlama = Math.max(takMendekatTerlama, r.takMendekatTerlama);
    diDalamTembok += r.sampelDiDalamTembok;
    sampai += r.sampai;
    nPengejar += r.nPengejar;
    jarakTerdekat.push(...r.jarakTerdekat);
    for (const [tipe, t] of r.perTipe) {
      const g = perTipe.get(tipe) ?? { n: 0, sampai: 0, jarak: [] };
      g.n += t.n;
      g.sampai += t.sampai;
      g.jarak.push(...t.jarak);
      perTipe.set(tipe, g);
    }
    for (const sg of r.sangkutan) semua.push({ ...sg, seed });

    const rint = r.sangkutan.filter((x) => x.lama >= AMBANG_LAPOR_MS && x.sebabRintangan);
    const terlama = rint.reduce((a, x) => Math.max(a, x.lama), 0);
    console.log(
      `  seed ${String(seed).padStart(3)}: ${String(r.jumlahMusuh).padStart(2)} musuh, ` +
        `sampai ${String(Math.round((r.sampai / Math.max(1, r.nPengejar)) * 100)).padStart(3)}%, ` +
        `rintangan ${String(rint.length).padStart(2)} kejadian, terlama ${String(terlama).padStart(5)} ms`
    );
  }

  const terlihat = semua.filter((x) => x.lama >= AMBANG_LAPOR_MS);
  const rintangan = terlihat.filter((x) => x.sebabRintangan);
  const perID = new Map();
  for (const x of rintangan) {
    const k = `${x.seed}:${x.id}`;
    perID.set(k, (perID.get(k) ?? 0) + 1);
  }
  const urut = jarakTerdekat.slice().sort((a, b) => a - b);

  return {
    bergerak,
    musuhDiamati,
    // Hanya musuh PENGEJAR yang dinilai; penembak menjaga jarak by design.
    persenSampaiKePemain: nPengejar ? +((sampai / nPengejar) * 100).toFixed(1) : 0,
    jarakTerdekatMedian: urut.length ? +urut[Math.floor(urut.length / 2)].toFixed(1) : 0,
    persenWaktuDiam: sampelTotal ? +((sampelNyangkut / sampelTotal) * 100).toFixed(2) : 0,
    kejadianRintangan: rintangan.length,
    kejadianBerdesakan: terlihat.length - rintangan.length,
    terlamaRintanganMs: rintangan.reduce((a, x) => Math.max(a, x.lama), 0),
    musuhNyangkutBerulang: [...perID.values()].filter((n) => n > 1).length,
    takMendekatTerlamaMs: takMendekatTerlama,
    sampelMusuhDiDalamTembok: diDalamTembok,
    perTipe: [...perTipe].map(([tipe, t]) => ({
      tipe,
      n: t.n,
      persenSampai: +((t.sampai / t.n) * 100).toFixed(0),
      jarakMedian: +t.jarak
        .slice()
        .sort((a, b) => a - b)
        [Math.floor(t.jarak.length / 2)].toFixed(0),
    })),
  };
}

const BERGERAK = process.argv.includes('--diam') ? [false] : [false, true];
const hasil = [];
for (const b of BERGERAK) hasil.push(await babak(b));

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/stuck.json`, JSON.stringify(hasil, null, 2));

console.log('');
console.log(`${SEEDS.length} arena x ${DURASI_MS / 1000} detik per skenario:
`);
const kolom = (h) => `${h.bergerak ? 'BERGERAK' : 'diam'}`;
const baris = [
  ['SAMPAI ke pemain (%, non-penembak)', (h) => h.persenSampaiKePemain],
  ['median jarak terdekat (px)', (h) => h.jarakTerdekatMedian],
  ['waktu-musuh tidak bergerak (%)', (h) => h.persenWaktuDiam],
  ['nyangkut RINTANGAN', (h) => h.kejadianRintangan],
  ['terlama di rintangan (ms)', (h) => h.terlamaRintanganMs],
  ['nyangkut berulang', (h) => h.musuhNyangkutBerulang],
  ['berdesakan (bukan rintangan)', (h) => h.kejadianBerdesakan],
  ['di dalam tembok (sampel)', (h) => h.sampelMusuhDiDalamTembok],
];
console.log(`  ${''.padEnd(32)}${hasil.map((h) => kolom(h).padStart(10)).join('')}`);
for (const [label, ambil] of baris) {
  console.log(`  ${label.padEnd(32)}${hasil.map((h) => String(ambil(h)).padStart(10)).join('')}`);
}

console.log('');
console.log('  Per tipe musuh (persen yang sampai / median jarak terdekat):');
for (const h of hasil) {
  console.log(`    pemain ${h.bergerak ? 'BERGERAK' : 'diam'}:`);
  for (const t of h.perTipe.sort((a, b) => a.persenSampai - b.persenSampai)) {
    console.log(
      `      ${t.tipe.padEnd(18)} ${String(t.persenSampai).padStart(3)}%  ${String(t.jarakMedian).padStart(4)} px  (n=${t.n})`
    );
  }
}

// Inilah syarat lulusnya. "Tidak tersangkut" saja tidak cukup — gerombolan yang
// berputar-putar tanpa pernah tiba juga lolos ukuran sangkutan.
const gagal = [];
for (const h of hasil) {
  if (h.persenSampaiKePemain < 90) {
    gagal.push(`pemain ${kolom(h)}: hanya ${h.persenSampaiKePemain}% musuh sampai ke pemain`);
  }
  if (h.terlamaRintanganMs > 2200) {
    gagal.push(`pemain ${kolom(h)}: ada sangkutan rintangan ${h.terlamaRintanganMs} ms`);
  }
}
if (gagal.length === 0) {
  console.log('');
  console.log('LOLOS');
} else {
  console.log('');
  console.log('GAGAL:');
  for (const g of gagal) console.log('  ' + g);
}
console.log(`Rincian di ${OUT_DIR}/stuck.json`);

await browser.close();
process.exit(gagal.length === 0 ? 0 : 1);
