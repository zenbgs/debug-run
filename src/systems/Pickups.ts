import Phaser from 'phaser';
import { DEPTH } from '../data/depth';
import {
  DROP_CHANCE,
  ELITE_DROPS,
  PICKUP,
  PICKUPS,
  type PickupKind,
  type PickupSpec,
} from '../data/pickups';

/**
 * Permata yang jatuh dari musuh, melayang, lalu tertarik ke pemain.
 *
 * Sistem ini tidak tahu apa artinya permata itu — ia hanya melapor lewat
 * `onCollect`. Scene yang memutuskan apakah itu menyembuhkan, mengisi meter,
 * atau menambah skor. Pola yang sama dipakai `PlayerProjectiles` dan
 * `BossAttacks`: sistem memegang geometrinya, scene memegang aturan mainnya.
 */
export type PickupContext = {
  playerPosition: () => { x: number; y: number };
  onCollect: (kind: PickupKind, spec: PickupSpec, x: number, y: number) => void;
};

export class Pickups {
  private readonly group: Phaser.Physics.Arcade.Group;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly context: PickupContext
  ) {
    this.group = scene.physics.add.group();
  }

  /** Jumlah permata yang sedang di lapangan — dipakai tes dan alat ukur. */
  get count(): number {
    return this.group.getChildren().filter((c) => c.active).length;
  }

  /**
   * Undi jatuhan untuk satu musuh yang mati.
   *
   * @param elite musuh elite selalu menjatuhkan sesuatu.
   */
  rollDrop(x: number, y: number, elite: boolean): void {
    if (elite) {
      this.spawn(x, y, Phaser.Utils.Array.GetRandom([...ELITE_DROPS]));
      return;
    }

    // Satu undian untuk semua jenis, bukan satu undian per jenis: dengan undian
    // terpisah seekor musuh bisa menjatuhkan tiga permata sekaligus, dan
    // lapangan cepat penuh.
    let r = Math.random();
    for (const [kind, chance] of Object.entries(DROP_CHANCE) as [PickupKind, number][]) {
      if (r < chance) {
        this.spawn(x, y, kind);
        return;
      }
      r -= chance;
    }
  }

  spawn(x: number, y: number, kind: PickupKind): void {
    const spec = PICKUPS[kind];
    const gem = this.group.create(x, y, PICKUP.key, spec.gem) as Phaser.Physics.Arcade.Sprite;

    gem.setDepth(DEPTH.PICKUP);
    gem.setScale(PICKUP.SCALE);
    gem.setData('kind', kind);
    gem.setData('expiresAt', this.scene.time.now + PICKUP.LIFETIME_MS);

    const body = gem.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    // Terlempar ke arah acak lalu melambat: permata yang muncul diam di titik
    // kematian sering tertimbun musuh berikutnya dan tidak terlihat sama sekali.
    const sudut = Math.random() * Math.PI * 2;
    body.setVelocity(Math.cos(sudut) * PICKUP.BURST_SPEED, Math.sin(sudut) * PICKUP.BURST_SPEED);
    body.setDrag(PICKUP.BURST_DRAG, PICKUP.BURST_DRAG);

    // Naik-turun pelan supaya terbaca sebagai benda yang bisa diambil, bukan
    // bagian dari peta.
    this.scene.tweens.add({
      targets: gem,
      scaleX: PICKUP.SCALE * 1.15,
      scaleY: PICKUP.SCALE * 1.15,
      duration: 520,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  update(): void {
    const now = this.scene.time.now;
    const pemain = this.context.playerPosition();

    for (const child of this.group.getChildren()) {
      const gem = child as Phaser.Physics.Arcade.Sprite;
      if (!gem.active) continue;

      const expiresAt = gem.getData('expiresAt') as number;
      if (now >= expiresAt) {
        gem.destroy();
        continue;
      }

      // Peringatan sisa waktu. Tanpa ini permata hilang begitu saja dan terasa
      // seperti bug, bukan seperti kesempatan yang terlewat.
      const sisa = expiresAt - now;
      if (sisa < PICKUP.LIFETIME_MS - PICKUP.BLINK_AFTER_MS) {
        gem.setAlpha(Math.floor(now / 110) % 2 === 0 ? 1 : 0.35);
      }

      const dx = pemain.x - gem.x;
      const dy = pemain.y - gem.y;
      const jarak = Math.hypot(dx, dy);

      if (jarak <= PICKUP.PICK_RADIUS) {
        const kind = gem.getData('kind') as PickupKind;
        this.context.onCollect(kind, PICKUPS[kind], gem.x, gem.y);
        gem.destroy();
        continue;
      }

      if (jarak <= PICKUP.MAGNET_RADIUS && jarak > 0.01) {
        const body = gem.body as Phaser.Physics.Arcade.Body;
        body.setVelocity((dx / jarak) * PICKUP.MAGNET_SPEED, (dy / jarak) * PICKUP.MAGNET_SPEED);
      }
    }
  }

  clear(): void {
    this.group.clear(true, true);
  }
}
