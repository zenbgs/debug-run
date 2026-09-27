import Phaser from 'phaser';

/**
 * Partikel kecil untuk memperjelas tumbukan.
 *
 * Teksturnya dibuat saat runtime (satu piksel putih) supaya tidak menambah aset.
 *
 * ⚠️ Emitter dibuat **sekali per scene**, lalu dipindahkan dan diledakkan di posisi
 * yang diminta. Versi awal membuat `ParticleEmitter` baru plus `delayedCall` untuk
 * setiap pukulan — terukur 10 emitter hanya dalam 6 detik tempur ringan, dan satu
 * finisher yang mengenai 8 musuh membuat 8 emitter sekaligus.
 */

const PARTICLE_TEXTURE = 'particle-dot';
const PARTICLE_DEPTH = 18;

/** Emitter bersama per scene, dibuat saat pertama dibutuhkan. */
const SPARK_KEY = 'fx-emitter-spark';
const BURST_KEY = 'fx-emitter-burst';

export function createParticleTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(PARTICLE_TEXTURE)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, 2, 2);
  g.generateTexture(PARTICLE_TEXTURE, 2, 2);
  g.destroy();
}

type EmitterBag = Record<string, Phaser.GameObjects.Particles.ParticleEmitter>;

/** Emitter disimpan di data scene supaya ikut mati bersama scene-nya. */
function ambilEmitter(
  scene: Phaser.Scene,
  key: string,
  buat: () => Phaser.GameObjects.Particles.ParticleEmitter
): Phaser.GameObjects.Particles.ParticleEmitter {
  const bag = (scene.data.get('emitters') as EmitterBag | undefined) ?? {};
  let emitter = bag[key];
  if (!emitter || !emitter.active) {
    emitter = buat();
    emitter.setDepth(PARTICLE_DEPTH);
    bag[key] = emitter;
    scene.data.set('emitters', bag);
  }
  return emitter;
}

/** Percikan saat musuh kena pukul. */
export function spawnHitSparks(scene: Phaser.Scene, x: number, y: number): void {
  const emitter = ambilEmitter(scene, SPARK_KEY, () =>
    scene.add.particles(0, 0, PARTICLE_TEXTURE, {
      speed: { min: 40, max: 110 },
      angle: { min: 0, max: 360 },
      lifespan: { min: 120, max: 240 },
      scale: { start: 1, end: 0 },
      tint: [0xffe066, 0xfff2b2],
      emitting: false,
    })
  );
  emitter.emitParticleAt(x, y, 6);
}

/** Ledakan saat musuh mati. */
export function spawnDeathBurst(scene: Phaser.Scene, x: number, y: number, tint: number): void {
  const emitter = ambilEmitter(scene, BURST_KEY, () =>
    scene.add.particles(0, 0, PARTICLE_TEXTURE, {
      speed: { min: 50, max: 160 },
      angle: { min: 0, max: 360 },
      lifespan: { min: 200, max: 420 },
      scale: { start: 1.5, end: 0 },
      emitting: false,
    })
  );
  // Warna mengikuti musuh yang mati; emitter-nya tetap satu.
  emitter.setParticleTint([tint, 0xffffff]);
  emitter.emitParticleAt(x, y, 12);
}
