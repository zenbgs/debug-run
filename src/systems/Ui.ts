import Phaser from 'phaser';

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

const FONT = 'monospace';

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

/** Banner "WAVE N" yang muncul lalu menghilang sendiri. */
export function showWaveBanner(
  scene: Phaser.Scene,
  waveNumber: number,
  totalWaves: number,
  label: string,
  durationMs: number,
  isBossPlaceholder: boolean
): void {
  const panel = createPanel(scene, 200, 46, scene.scale.height / 2 - 30);

  addText(scene, panel, scene.scale.width / 2, scene.scale.height / 2 - 40,
    `WAVE ${waveNumber} / ${totalWaves}`, { size: 12, color: '#ffe066' });
  addText(scene, panel, scene.scale.width / 2, scene.scale.height / 2 - 24,
    isBossPlaceholder ? `${label}  (wave elite — boss menyusul di M5)` : label,
    { size: 8, color: '#c9c4d8' });

  scene.tweens.add({
    targets: panel.container,
    alpha: 0,
    delay: durationMs - 350,
    duration: 350,
    onComplete: () => panel.destroy(),
  });

  // Kalau scene di-restart di tengah animasi, panel tetap ikut dibersihkan.
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => panel.destroy());
}
