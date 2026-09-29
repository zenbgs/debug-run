/**
 * Bukti jalan untuk musuh elite dan sentakan kamera.
 *
 * Yang dibuktikan: pengali elite sampai ke entity (HP, kecepatan NYATA yang
 * diukur dari perpindahan, ukuran), cincin penanda benar-benar dibuat, ledakan
 * melukai tetangga, skor lebih besar, dan zoom kamera SELALU kembali ke 1 —
 * termasuk saat tiga sentakan bertumpuk.
 *
 * Jalankan:  node tools/verify_elites.mjs [url]
 */

import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(`${execSync('npm root -g').toString().trim()}/`);
const puppeteer = require('puppeteer');
const b = await puppeteer.launch({ headless:'new', args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
const p = await b.newPage();
await p.setViewport({ width:960, height:540 });
p.on('pageerror', e => console.error('  !', e.message));
await p.goto(process.argv[2] ?? 'http://localhost:5177/', { waitUntil:'networkidle0' });
await p.waitForFunction(() => window.__game?.isBooted, { timeout:20000 });
await p.evaluate(() => { window.__game.scene.stop('Title'); window.__game.scene.start('Game', { classId:'warrior' }); });
await p.waitForFunction(() => window.__game.scene.getScene('Game')?.waves !== undefined);
await new Promise(r=>setTimeout(r,1200));

console.log(JSON.stringify(await p.evaluate(async () => {
  const s = window.__game.scene.getScene('Game');
  const E = (await import('/src/data/enemies.ts')).ENEMY_TYPES;
  const { ELITES, eliteChance } = await import('/src/data/elites.ts');
  const tidur = (ms) => new Promise(r=>setTimeout(r,ms));
  const out = {};
  s._ka = setInterval(() => { if (s.player?.active) s.player.hp = 9999; }, 80);

  // --- Elite benar-benar berbeda dari musuh biasa ---
  s.enemyGroup.getChildren().slice().forEach(e=>e.destroy());
  const biasa = s.createEnemy(E[0], 300, 300);
  const tebal = s.createEnemy(E[0], 340, 300);
  tebal.applyElite(ELITES.find(e => e.id === 'tebal'));
  const gesit = s.createEnemy(E[0], 380, 300);
  gesit.applyElite(ELITES.find(e => e.id === 'gesit'));
  [biasa,tebal,gesit].forEach(e => { e.setDepth(8); s.enemyGroup.add(e); });
  s.invalidateAliveCache();
  out.hpBiasa = biasa.currentHp;
  out.hpTebal = tebal.currentHp;
  out.skalaBiasa = +biasa.scaleX.toFixed(2);
  out.skalaTebal = +tebal.scaleX.toFixed(2);
  out.cincinTebalAda = tebal.ring !== undefined;
  out.cincinBiasaAda = biasa.ring !== undefined;

  // Kecepatan: ukur perpindahan NYATA, satu musuh pada satu waktu.
  //
  // Versi pertama mengukur tiga musuh yang berdiri berdampingan dan semuanya
  // bergerak ke arah yang sama — mereka saling menabrak, dan hasilnya bergantung
  // pada posisi acak. Terukur: elite "Gesit" kadang tampak LEBIH LAMBAT dari
  // musuh biasa, yang mustahil. Itu flake alat ukur, bukan regresi.
  const target = new (window.Phaser.Math.Vector2)(600, 300);
  const jarakTempuh = async (eliteId) => {
    s.enemyGroup.getChildren().slice().forEach((e) => e.destroy());
    s.invalidateAliveCache();
    const e = s.createEnemy(E[0], 260, 300);
    if (eliteId) e.applyElite(ELITES.find((x) => x.id === eliteId));
    e.setDepth(8);
    s.enemyGroup.add(e);
    s.invalidateAliveCache();
    // Rintangan arena diacak; matikan tabrakan supaya yang terukur murni kecepatan.
    e.body.checkCollision.none = true;
    await tidur(60);
    const x0 = e.x;
    for (let i = 0; i < 30; i++) {
      e.tick(target, s.time.now, 1 / 60);
      await tidur(16);
    }
    return Math.abs(e.x - x0);
  };
  out.jarakBiasa = Math.round(await jarakTempuh(null));
  out.jarakGesit = Math.round(await jarakTempuh('gesit'));

  // --- Elite peledak melukai tetangga ---
  s.enemyGroup.getChildren().slice().forEach(e=>e.destroy());
  const peledak = s.createEnemy(E[0], 300, 300);
  peledak.applyElite(ELITES.find(e => e.id === 'peledak'));
  const tetangga = s.createEnemy(E[0], 328, 300);
  [peledak,tetangga].forEach(e => { e.setDepth(8); s.enemyGroup.add(e); });
  tetangga.hp = 9999;
  s.invalidateAliveCache();
  const hpTet = tetangga.currentHp;
  peledak.takeDamage(99999, 0, 0);
  s.registerKill(peledak);
  await tidur(200);
  out.ledakanKeTetangga = Math.round(hpTet - tetangga.currentHp);

  // --- Skor elite lebih besar ---
  s.enemyGroup.getChildren().slice().forEach(e=>e.destroy());
  s.score = 0; s.streak.reset();
  const k1 = s.createEnemy(E[0], 300, 300); k1.setDepth(8); s.enemyGroup.add(k1);
  s.invalidateAliveCache(); k1.takeDamage(9999,0,0); s.registerKill(k1);
  const skorBiasa = s.score;
  s.score = 0; s.streak.reset();
  const k2 = s.createEnemy(E[0], 300, 300); k2.applyElite(ELITES.find(e=>e.id==='tebal'));
  k2.setDepth(8); s.enemyGroup.add(k2); s.invalidateAliveCache();
  k2.takeDamage(99999,0,0); s.registerKill(k2);
  out.skorBiasa = skorBiasa; out.skorElite = s.score;

  // --- Peluang elite ---
  out.peluangWave1 = eliteChance(1);
  out.peluangWave10 = +eliteChance(10).toFixed(3);
  out.peluangWave40 = +eliteChance(40).toFixed(3);

  // --- Kamera: zoom menyentak lalu KEMBALI ke 1 ---
  const zoomAwal = s.cameras.main.zoom;
  s.cameraFx.onBossSpawn();
  await tidur(150);
  const zoomPuncak = +s.cameras.main.zoom.toFixed(3);
  await tidur(1000);
  out.zoom = { awal: zoomAwal, puncak: zoomPuncak, kembali: +s.cameras.main.zoom.toFixed(3) };

  // Dua sentakan beririsan tidak boleh meninggalkan kamera ter-zoom.
  s.cameraFx.onKill(); s.cameraFx.onHurt(); s.cameraFx.onDash();
  await tidur(700);
  out.zoomSetelahTumpang = +s.cameras.main.zoom.toFixed(3);
  out.fps = Math.round(window.__game.loop.actualFps);
  return out;
})));
await b.close();
