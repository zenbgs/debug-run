import Phaser from 'phaser';
import { FONT_FAMILY } from '../data/config';
import { destroyWithScene } from './Lifecycle';

/**
 * Helper UI overlay. Semuanya pakai `setScrollFactor(0)` supaya menempel di layar,
 * bukan ikut bergeser bersama kamera.
 *
 * Panel selalu punya latar gelap semi-transparan. Tanpa itu teks kuning bertumpuk
 * dengan sprite musuh dan tidak terbaca — masalah nyata yang terlihat di M3.
 */

export const UI_DEPTH = {
  PANEL: 200,
  TEXT: 201,
} as const;

const FONT = FONT_FAMILY;

export type PanelHandle = {
  container: Phaser.GameObjects.Container;
  destroy: () => void;
};

export function createPanel(
  scene: Phaser.Scene,
  width: number,
  height: number,
  centerY = scene.scale.height / 2
): PanelHandle {
  const centerX = scene.scale.width / 2;

  const backdrop = scene.add
    .rectangle(centerX, centerY, width, height, 0x0d0b14, 0.88)
    .setStrokeStyle(1, 0x8fd35d, 0.8);

  const container = scene.add
    .container(0, 0, [backdrop])
    .setScrollFactor(0)
    .setDepth(UI_DEPTH.PANEL);

  return {
    container,
    destroy: () => container.destroy(true),
  };
}

export function addText(
  scene: Phaser.Scene,
  panel: PanelHandle,
  x: number,
  y: number,
  text: string,
  options: { size?: number; color?: string; align?: 'left' | 'center' } = {}
): Phaser.GameObjects.Text {
  const label = scene.add
    .text(x, y, text, {
      fontFamily: FONT,
      fontSize: `${options.size ?? 8}px`,
      color: options.color ?? '#e8e4f0',
      align: options.align ?? 'center',
      lineSpacing: 3,
    })
    .setOrigin(options.align === 'left' ? 0 : 0.5, 0.5);

  panel.container.add(label);
  return label;
}

/**
 * Satu baris "label : nilai" dengan kolom yang benar-benar lurus.
 *
 * Label dan nilainya adalah DUA objek teks yang masing-masing rata kiri pada x
 * tetap — bukan satu string yang dipadatkan dengan spasi lalu dipusatkan.
 * Blok rata-tengah dengan panjang baris berbeda TIDAK MUNGKIN punya kolom lurus,
 * dan itulah yang membuat layar kalah terlihat berantakan.
 */
export function addRow(
  scene: Phaser.Scene,
  panel: PanelHandle,
  xLabel: number,
  xNilai: number,
  y: number,
  label: string,
  nilai: string,
  options: { size?: number; color?: string; colorNilai?: string } = {}
): void {
  const size = options.size ?? 7;
  const buat = (x: number, teks: string, warna: string) =>
    panel.container.add(
      scene.add
        .text(x, y, teks, { fontFamily: FONT, fontSize: `${size}px`, color: warna })
        .setOrigin(0, 0.5)
    );

  buat(xLabel, label, options.color ?? '#c9c4d8');
  buat(xNilai, nilai, options.colorNilai ?? '#e8e4f0');
}

/**
 * Area tak terlihat yang bisa diketuk, ditumpuk di atas sebaris teks panel.
 *
 * Teks itu sendiri sengaja TIDAK dibuat interaktif: hit area-nya mengikuti
 * bounding box glyph, yang untuk font 6-8 px jauh lebih kecil dari ujung jari.
 * Rekomendasi umum target sentuh adalah ~44 px CSS; di resolusi logis 480x270
 * yang berarti sekitar 20 px, jadi tinggi baris dipakai apa adanya.
 */
export function addTapZone(
  scene: Phaser.Scene,
  panel: PanelHandle,
  x: number,
  y: number,
  width: number,
  height: number,
  onTap: () => void
): Phaser.GameObjects.Rectangle {
  const zone = scene.add
    .rectangle(x, y, width, height, 0xffffff, 0)
    .setScrollFactor(0)
    .setInteractive({ useHandCursor: true });

  zone.on('pointerdown', onTap);
  panel.container.add(zone);
  return zone;
}

/**
 * Banner "WAVE N" yang muncul lalu menghilang sendiri.
 *
 * Mengembalikan handle-nya supaya pemanggil bisa membuangnya lebih awal: kalau
 * pemain mati tepat saat banner masih menyala, banner itu tetap terbaca menembus
 * panel kalah dan membuat teksnya bertumpuk.
 */
export function showWaveBanner(
  scene: Phaser.Scene,
  waveNumber: number,
  /** 0 = tanpa batas; penyebutnya disembunyikan. */
  totalWaves: number,
  label: string,
  durationMs: number,
  isBossWave: boolean
): PanelHandle {
  const panel = createPanel(scene, 260, 48, scene.scale.height / 2 - 30);

  // `totalWaves: 0` berarti mode tanpa batas — tidak ada penyebut untuk ditulis.
  addText(scene, panel, scene.scale.width / 2, scene.scale.height / 2 - 40,
    totalWaves > 0 ? `WAVE ${waveNumber} / ${totalWaves}` : `WAVE ${waveNumber}`,
    { size: 10, color: '#ffe066' });
  addText(scene, panel, scene.scale.width / 2, scene.scale.height / 2 - 24,
    isBossWave ? `BOSS - ${label}` : label,
    { size: 7, color: isBossWave ? '#ff8a7a' : '#c9c4d8' });

  scene.tweens.add({
    targets: panel.container,
    alpha: 0,
    delay: durationMs - 350,
    duration: 350,
    onComplete: () => panel.destroy(),
  });

  // Kalau scene di-restart di tengah animasi, panel tetap ikut dibersihkan.
  destroyWithScene(scene, panel.container);
  return panel;
}
