/**
 * Geometri menghindar rintangan, dipisah dari `Enemy` supaya bisa diuji.
 *
 * Tidak ada `import Phaser` di sini, dan itu disengaja: vitest berjalan di Node,
 * dan berkas tes yang menarik Phaser gagal dengan "window is not defined".
 * Pemisahan yang sama sudah dipakai `VirtualInput.ts` dengan alasan yang sama.
 *
 * Semua fungsi murni — probe rintangan disuntikkan sebagai callback, jadi tes
 * bisa memasang peta buatan tanpa tilemap sungguhan.
 */

export type Vec = { x: number; y: number };

/**
 * Seberapa banyak arah tujuan dicampurkan ke arah menyusur.
 *
 * 0 berarti menyamping murni — musuh mengorbit rintangan tanpa pernah tiba.
 * Terlalu besar berarti ia menekan balik ke rintangan dan menggerus lagi.
 */
const BIAS_MAJU = 0.45;

/** Apakah titik dunia ini rintangan padat? */
export type SolidProbe = (x: number, y: number) => boolean;

/** Panjang vektor, dinormalkan. Mengembalikan (1,0) untuk vektor nol. */
export function normalize(x: number, y: number): Vec {
  const l = Math.hypot(x, y);
  if (l < 1e-6) return { x: 1, y: 0 };
  return { x: x / l, y: y / l };
}

/**
 * Pilih sisi mana yang dipakai untuk menyusuri rintangan.
 *
 * Kedua calon tegak lurus arah kejar. Yang dipilih adalah yang LOWONG menurut
 * rabaan; kalau dua-duanya lowong, yang lebih mendekatkan ke tujuan.
 *
 * Versi sebelumnya memilih semata-mata dari posisi pemain, jadi musuh yang
 * tersangkut di sisi panjang sebuah rintangan sering menyusur ke arah yang
 * justru memperpanjang perjalanannya — atau ke rintangan berikutnya.
 */
export function pilihArahSusur(
  dari: Vec,
  arahTujuan: Vec,
  solid: SolidProbe,
  probePx: number,
  biasMaju = BIAS_MAJU
): Vec {
  const d = normalize(arahTujuan.x, arahTujuan.y);
  const sisi: Vec[] = [
    { x: -d.y, y: d.x },
    { x: d.y, y: -d.x },
  ];

  const nilai = sisi.map((c) => {
    const lurus = !solid(dari.x + c.x * probePx, dari.y + c.y * probePx);
    // Diraba juga SERONG MAJU. Sisi yang membuka jalan ke depan jauh lebih
    // berguna daripada sisi yang kebetulan lowong di tempat, dan tanpa rabaan
    // kedua ini tidak ada pembeda sama sekali: dua calon itu tegak lurus arah
    // tujuan, jadi hasil kali titiknya dengan arah tujuan SELALU nol. Versi
    // pertama memakai angka itu sebagai penentu, dan karena itu ia tidak pernah
    // memilih apa pun — selalu calon pertama.
    const sx = c.x + d.x;
    const sy = c.y + d.y;
    const sl = Math.hypot(sx, sy) || 1;
    const serong = !solid(dari.x + (sx / sl) * probePx, dari.y + (sy / sl) * probePx);
    return { c, skor: (lurus ? 2 : 0) + (serong ? 1 : 0) };
  });

  const menang = nilai.sort((a, b) => b.skor - a.skor)[0].c;

  // Dicampur sedikit arah tujuan supaya musuh MEMUTARI rintangan sambil tetap
  // mendekat. Menyamping murni membuatnya mengorbit tanpa pernah tiba — itu
  // terbaca sebagai gerombolan yang berlarian ke arah lain, bukan menghampiri.
  return normalize(menang.x + d.x * biasMaju, menang.y + d.y * biasMaju);
}

/**
 * Titik bebas terdekat yang juga condong ke arah tujuan.
 *
 * Dicoba dari arah tujuan lalu melebar ke samping, sehingga musuh muncul di sisi
 * yang masuk akal alih-alih melompat ke belakang rintangan. `null` kalau semua
 * calon ternyata padat — pemanggil yang memutuskan apa yang dilakukan.
 */
export function cariTitikBebas(
  dari: Vec,
  arahTujuan: Vec,
  solid: SolidProbe,
  jarakDasar: number
): Vec | null {
  const d = normalize(arahTujuan.x, arahTujuan.y);
  const sudutDasar = Math.atan2(d.y, d.x);

  // Tiga jari-jari, bukan dua. Sejak titik pendaratan diperiksa dengan LEBAR
  // BADAN (bukan hanya pusatnya), calon yang muat jadi lebih sedikit; dengan dua
  // jari-jari saja pencarian kadang pulang kosong, musuhnya tidak dipindahkan,
  // dan sangkutan terpanjang naik dari ~1,8 ke ~2,5 detik.
  for (const jarak of [jarakDasar, jarakDasar * 1.6, jarakDasar * 2.4]) {
    for (const beda of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9, 2.6, -2.6, Math.PI]) {
      const a = sudutDasar + beda;
      const x = dari.x + Math.cos(a) * jarak;
      const y = dari.y + Math.sin(a) * jarak;
      if (!solid(x, y)) return { x, y };
    }
  }
  return null;
}

/**
 * Apakah musuh terhalang? Perbandingannya NISBI, bukan mutlak.
 *
 * Versi sebelumnya memakai batas tetap 0,4 px per frame. Musuh yang menggerus
 * menyusuri pohon berpindah sedikit di atas itu, jadi ia dihitung "bergerak",
 * penghitung macetnya di-nol-kan tiap frame, dan jaring pengaman tidak pernah
 * menyala — terlihat sebagai musuh yang menempel di pohon sambil bergetar.
 *
 * @param pindah  perpindahan nyata frame ini, piksel
 * @param laju    besar kecepatan yang diinginkan, piksel/detik
 * @param dt      lama frame, detik
 */
export function terhalang(pindah: number, laju: number, dt: number, rasio: number): boolean {
  if (laju <= 5) return false; // memang tidak ingin bergerak
  const diharapkan = laju * dt;
  if (diharapkan <= 0.01) return false;
  return pindah < diharapkan * rasio;
}
