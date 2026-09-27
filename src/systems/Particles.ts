import Phaser from 'phaser';

/**
 * Partikel kecil untuk memperjelas tumbukan.
 *
 * Teksturnya dibuat saat runtime (satu piksel putih) supaya tidak menambah aset,
 * lalu diwarnai lewat tint per-emitter.
 */

const PARTICLE_TEXTURE = 'particle-dot';
const PARTICLE_DEPTH = 18;

export function createParticleTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(PARTICLE_TEXTURE)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, 2, 2);
  g.generateTexture(PARTICLE_TEXTURE, 2, 2);
  g.destroy();
}

/** Percikan saat musuh kena pukul. */
export function spawnHitSparks(scene: Phaser.Scene, x: number, y: number): void {
  const emitter = scene.add.particles(x, y, PARTICLE_TEXTURE, {
    speed: { min: 40, max: 110 },
    angle: { min: 0, max: 360 },
    lifespan: { min: 120, max: 240 },
    scale: { start: 1, end: 0 },
    quantity: 6,
    tint: [0xffe066, 0xfff2b2],
    emitting: false,
  });
  emitter.setDepth(PARTICLE_DEPTH);
  emitter.explode(6);
  scene.time.delayedCall(400, () => emitter.destroy());
}

/** Ledakan saat musuh mati. */
export function spawnDeathBurst(scene: Phaser.Scene, x: number, y: number, tint: number): void {
  const emitter = scene.add.particles(x, y, PARTICLE_TEXTURE, {
    speed: { min: 50, max: 160 },
    angle: { min: 0, max: 360 },
    lifespan: { min: 200, max: 420 },
    scale: { start: 1.5, end: 0 },
    quantity: 12,
    tint: [tint, 0xffffff],
    emitting: false,
  });
  emitter.setDepth(PARTICLE_DEPTH);
  emitter.explode(12);
  scene.time.delayedCall(600, () => emitter.destroy());
}
