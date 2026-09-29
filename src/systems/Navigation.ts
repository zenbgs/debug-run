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
  probePx: number
): Vec {
  const d = normalize(arahTujuan.x, arahTujuan.y);
  const calon: Vec[] = [
    { x: -d.y, y: d.x },
    { x: d.y, y: -d.x },
  ];

  const nilai = calon.map((c) => ({
    c,
    lowong: !solid(dari.x + c.x * probePx, dari.y + c.y * probePx),
    // Seberapa besar arah ini tetap membawa mendekat ke tujuan.
    maju: c.x * d.x + c.y * d.y,
  }));

  const bebas = nilai.filter((n) => n.lowong);
  if (bebas.length > 0) return bebas.sort((a, b) => b.maju - a.maju)[0].c;

  // Dua-duanya padat: ambil yang mundur paling sedikit, biar tetap bergerak.
  return nilai.sort((a, b) => b.maju - a.maju)[0].c;
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

  for (const jarak of [jarakDasar, jarakDasar * 1.6]) {
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
