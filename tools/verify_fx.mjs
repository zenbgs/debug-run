/**
 * Bukti jalan untuk tiga hal yang semuanya soal "apakah gambarnya benar-benar
 * berbeda saat dimainkan", dan tak satu pun bisa dibuktikan unit test:
 *
 *  1. Efek benturan BERBEDA PER KELAS. Sebelumnya semua benturan memakai satu
 *     sprite yang sama (`fx-hit`), jadi pukulan baja, panah, dan bola api terasa
 *     identik tepat di momen yang paling penting. Dibuktikan lewat serangan
 *     sungguhan (`player.attack()` -> CombatSystem/PlayerProjectiles), bukan
 *     dengan memanggil `takeDamage(..., hitFx)` dan menyerahkan jawabannya.
 *  2. Panel upgrade memasang satu permata per baris, dan warnanya mengikuti
 *     KATEGORI upgrade yang benar-benar ditawarkan.
 *  3. Ledakan memakai sheet khusus, bukan `fx-enemy-death` yang dipakai ulang.
 *
 * ⚠️ Pelajaran dari versi pertama harness ini, ditulis supaya tidak terulang:
 * `applyEliteBlast()` dan `applyDeathBlast()` HANYA dipanggil dari
 * `registerKill()`. Memanggil `enemy.takeDamage(9999, 0, 0)` saja membunuh
 * musuhnya tapi tidak pernah memicu ledakan, dan harness-nya melaporkan
 * "ledakan tidak muncul" untuk kode yang sebenarnya benar.
 *
 * Jalankan:  node tools/verify_fx.mjs [url]
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const URL_GAME = process.argv[2] ?? "http://localhost:5177/";
const OUT_DIR = "tools/verify-out";

const require = createRequire(`${execSync("npm root -g").toString().trim()}/`);
const puppeteer = require("puppeteer");

const browser = await puppeteer.launch({
  headless: "new",
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 540 });
page.on("pageerror", (e) => console.error("  ! error halaman:", e.message));

const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

async function masukGame(classId) {
  await page.goto(URL_GAME, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => window.__game?.isBooted, { timeout: 20000 });
  await page.evaluate((id) => {
    window.__game.scene.stop("Title");
    window.__game.scene.start("Game", { classId: id });
  }, classId);
  await page.waitForFunction(
    () => window.__game.scene.getScene("Game")?.waves !== undefined,
    {
      timeout: 20000,
    },
  );
  await tidur(1200);
}

/** Sprite FX yang hidup sekarang. Nama sheet FX semuanya berawalan `fx-`. */
const fxHidup = () =>
  page.evaluate(() =>
    window.__game.scene
      .getScene("Game")
      .children.list.filter(
        (c) => c.type === "Sprite" && c.texture?.key?.startsWith("fx-"),
      )
      .map((c) => c.texture.key),
  );

const bersihkanFx = () =>
  page.evaluate(() =>
    window.__game.scene
      .getScene("Game")
      .children.list.filter(
        (c) => c.type === "Sprite" && c.texture?.key?.startsWith("fx-"),
      )
      .forEach((c) => c.destroy()),
  );

const tungguMusuh = () =>
  page.waitForFunction(
    () =>
      window.__game.scene.getScene("Game").enemyGroup.getChildren().length > 0,
    { timeout: 15000 },
  );

const hasil = {};

// --- 1. Efek benturan per kelas, lewat serangan sungguhan ---------------------
hasil.benturanPerKelas = {};
for (const kelas of ["warrior", "archer", "mage"]) {
  await masukGame(kelas);
  await tungguMusuh();
  await bersihkanFx();

  // Tempelkan satu musuh tepat di depan pemain supaya serangan pasti kena,
  // dan matikan tumbukannya supaya ia tidak terdorong menjauh lebih dulu.
  await page.evaluate(() => {
    const s = window.__game.scene.getScene("Game");
    const e = s.enemyGroup.getChildren()[0];
    e.body.checkCollision.none = true;
    e.hp = 9999;
    s.player.setPosition(e.x - 26, e.y);
    s.player.facing = "right";
  });

  // Serang berulang: kelas jarak jauh butuh waktu terbang proyektilnya.
  for (let i = 0; i < 14; i++) {
    await page.evaluate(() => {
      const s = window.__game.scene.getScene("Game");
      s.player.setVirtualInput({ moveX: 0, moveY: 0, attack: true });
    });
    await tidur(90);
    const terlihat = (await fxHidup()).filter((k) => k.startsWith("fx-hit-"));
    if (terlihat.length > 0) {
      hasil.benturanPerKelas[kelas] = terlihat[0];
      break;
    }
  }
  hasil.benturanPerKelas[kelas] ??= null;

  await page.screenshot({ path: `${OUT_DIR}/hitfx-${kelas}.png` });
}

// --- 2. Ikon kategori di panel upgrade ---------------------------------------
await masukGame("warrior");
await page.evaluate(() => {
  const s = window.__game.scene.getScene("Game");
  s.waves.queue = [];
  s.enemyGroup
    .getChildren()
    .slice()
    .forEach((e) => e.destroy());
});
await page.waitForFunction(
  () => window.__game.scene.getScene("Game").state === "upgrade",
  {
    timeout: 20000,
  },
);
await tidur(400);

// Permata DAN nama baris dikumpulkan berpasangan menurut posisi y-nya. Menghitung
// "ada 3 permata" saja tidak membuktikan apa-apa: yang dipersoalkan adalah apakah
// permata di sebelah "Zirah" benar-benar permata kategori `tahan`.
//
// Pembandingnya diimpor dari modul sumbernya sendiri lewat dev server Vite, bukan
// diurai dengan regex dari berkas .ts — versi pertama harness ini memakai regex,
// keduanya tidak cocok satu pun, dan ia melaporkan GAGAL untuk panel yang benar.
hasil.ikonUpgrade = await page.evaluate(async () => {
  const { UPGRADES, KATEGORI_GEM } = await import("/src/data/upgrades.ts");
  const namaKeKategori = new Map(UPGRADES.map((u) => [u.name, u.kategori]));

  const s = window.__game.scene.getScene("Game");
  const ikon = [];
  const teks = [];
  const telusuri = (daftar) => {
    for (const c of daftar) {
      if (c.type === "Sprite" && c.texture?.key === "ui-gems") {
        ikon.push({ y: c.y, frame: Number(c.frame.name) });
      }
      if (c.type === "Text" && typeof c.text === "string")
        teks.push({ y: c.y, t: c.text });
      if (c.type === "Container" && c.list) telusuri(c.list);
    }
  };
  telusuri(s.children.list);

  const baris = ikon
    .sort((a, b) => a.y - b.y)
    .map((g) => {
      // Baris judul adalah teks terdekat secara vertikal; awalannya "[1] " dibuang.
      const mentah =
        teks
          .filter((t) => Math.abs(t.y - g.y) < 6)
          .sort((a, b) => Math.abs(a.y - g.y) - Math.abs(b.y - g.y))[0]?.t ??
        "";
      const nama = mentah.replace(/^\[\d+\]\s*/, "").trim();
      const kategori = namaKeKategori.get(nama);
      const diharap =
        kategori === undefined ? undefined : KATEGORI_GEM[kategori];
      return {
        nama,
        kategori,
        frame: g.frame,
        diharap,
        cocok: diharap === g.frame,
      };
    });

  return { jumlahIkon: ikon.length, baris };
});

// --- 3. Ledakan khusus, lewat registerKill() yang merupakan pemicu sebenarnya -
await masukGame("warrior");
await tungguMusuh();
await bersihkanFx();

hasil.elitePeledak = await page.evaluate(() => {
  const s = window.__game.scene.getScene("Game");
  s.player.stats.deathBlastDamage = 0; // pisahkan dari upgrade "Ledakan Akhir"
  const e = s.enemyGroup.getChildren()[0];
  // Bentuknya sama persis dengan entri 'peledak' di src/data/elites.ts.
  e.applyElite({
    id: "peledak",
    name: "Peledak",
    hp: 1.4,
    speed: 1,
    scale: 1.1,
    score: 2.5,
    ringColor: 0xff5c5c,
    deathBlast: 22,
  });
  e.takeDamage(9999, 0, 0);
  s.registerKill(e);
  return s.children.list
    .filter(
      (c) => c.type === "Sprite" && c.texture?.key?.startsWith("fx-explosion"),
    )
    .map((c) => c.texture.key);
});

await tungguMusuh();
await bersihkanFx();
hasil.ledakanAkhir = await page.evaluate(() => {
  const s = window.__game.scene.getScene("Game");
  s.player.stats.deathBlastDamage = 14;
  const e =
    s.enemyGroup.getChildren().find((x) => !x.eliteModifier) ??
    s.enemyGroup.getChildren()[0];
  e.takeDamage(9999, 0, 0);
  s.registerKill(e);
  return s.children.list
    .filter(
      (c) => c.type === "Sprite" && c.texture?.key?.startsWith("fx-explosion"),
    )
    .map((c) => c.texture.key);
});

// --- Laporan ------------------------------------------------------------------
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/fx.json`, JSON.stringify(hasil, null, 2));

console.log("\nBenturan per kelas (dari serangan sungguhan):");
for (const [k, v] of Object.entries(hasil.benturanPerKelas)) {
  console.log(`  ${k.padEnd(8)} -> ${v ?? "TIDAK ADA"}`);
}
const berbeda = new Set(Object.values(hasil.benturanPerKelas));
console.log(`  siluet berbeda : ${berbeda.size} dari 3`);

console.log("\nPanel upgrade:");
for (const b of hasil.ikonUpgrade.baris) {
  console.log(
    `  ${String(b.nama).padEnd(16)} ${String(b.kategori).padEnd(9)} frame ${b.frame} (harap ${b.diharap})  ${b.cocok ? "cocok" : "TIDAK COCOK"}`,
  );
}

console.log("\nLedakan:");
console.log(`  elite Peledak  : ${JSON.stringify(hasil.elitePeledak)}`);
console.log(`  Ledakan Akhir  : ${JSON.stringify(hasil.ledakanAkhir)}`);

const lolos =
  berbeda.size === 3 &&
  !berbeda.has(null) &&
  hasil.ikonUpgrade.jumlahIkon === 3 &&
  hasil.ikonUpgrade.baris.every((b) => b.cocok) &&
  hasil.elitePeledak.includes("fx-explosion-big") &&
  hasil.ledakanAkhir.includes("fx-explosion-small");
console.log(
  `\n${lolos ? "LOLOS" : "GAGAL"} — hasil lengkap di ${OUT_DIR}/fx.json`,
);

await browser.close();
process.exit(lolos ? 0 : 1);
