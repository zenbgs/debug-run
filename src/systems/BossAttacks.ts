import Phaser from 'phaser';
import { BOSS_ATTACK } from '../data/bosses';
import { SHEETS } from '../data/frames';
import type { Player } from '../entities/Player';

const BOLT_DEPTH = 12;
const BEAM_DEPTH = 11;

type Beam = {
  sprite: Phaser.GameObjects.Sprite;
  originX: number;
  originY: number;
  /** Arah beam, radian. */
  angle: number;
  damage: number;
  /** Sisa waktu telegraf; selama > 0 beam belum menyakiti. */
  telegraphRemaining: number;
  activeRemaining: number;
  /** Beam hanya boleh mengenai pemain sekali. */
  hasHit: boolean;
};

/**
 * Proyektil dan beam milik boss.
 *
 * Beam TIDAK memakai body fisika: Arcade Physics tidak mendukung body yang
 * dirotasi, sedangkan beam bisa mengarah ke sudut mana pun. Deteksi kenanya
 * dihitung manual sebagai jarak titik ke segmen garis — akurat dan murah.
 */
export class BossAttacks {
  readonly bolts: Phaser.Physics.Arcade.Group;
  private beams: Beam[] = [];

  constructor(private readonly scene: Phaser.Scene) {
    this.bolts = scene.physics.add.group();
  }

  /** Jumlah proyektil aktif — dipakai tes dan HUD debug. */
  get boltCount(): number {
    return this.bolts.getChildren().length;
  }

  get beamCount(): number {
    return this.beams.length;
  }

  fireBolt(x: number, y: number, angle: number, speed: number, damage: number): void {
    const bolt = this.bolts.create(x, y, SHEETS.FX_BOSS_BOLT.key) as Phaser.Physics.Arcade.Sprite;
    bolt.setDepth(BOLT_DEPTH);
    bolt.setScale(BOSS_ATTACK.BOLT_SCALE);
    bolt.setData('damage', damage);
    bolt.setData('expiresAt', this.scene.time.now + BOSS_ATTACK.BOLT_LIFESPAN_MS);

    const body = bolt.body as Phaser.Physics.Arcade.Body;
    body.setSize(6, 6);
    body.setAllowGravity(false);
    body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);

    bolt.play(SHEETS.FX_BOSS_BOLT.key);
  }

  fireBeam(x: number, y: number, angle: number, damage: number): void {
    const sprite = this.scene.add.sprite(x, y, SHEETS.FX_BOSS_RAYS.key);
    sprite.setDepth(BEAM_DEPTH);
    // Sprite rays digambar memanjang ke BAWAH, jadi offset 90 derajat.
    sprite.setRotation(angle - Math.PI / 2);
    sprite.setOrigin(0.5, 0);
    sprite.setAlpha(0.35);
    sprite.play(SHEETS.FX_BOSS_RAYS.key);

    this.beams.push({
      sprite,
      originX: x,
      originY: y,
      angle,
      damage,
      telegraphRemaining: BOSS_ATTACK.BEAM_TELEGRAPH_MS,
      activeRemaining: BOSS_ATTACK.BEAM_ACTIVE_MS,
      hasHit: false,
    });
  }

  /** Jarak terdekat titik ke segmen beam. */
  private distanceToBeam(beam: Beam, px: number, py: number): number {
    const endX = beam.originX + Math.cos(beam.angle) * BOSS_ATTACK.BEAM_LENGTH;
    const endY = beam.originY + Math.sin(beam.angle) * BOSS_ATTACK.BEAM_LENGTH;
    const line = new Phaser.Geom.Line(beam.originX, beam.originY, endX, endY);
    const nearest = Phaser.Geom.Line.GetNearestPoint(line, new Phaser.Geom.Point(px, py));
    return Phaser.Math.Distance.Between(px, py, nearest.x, nearest.y);
  }

  update(delta: number, player: Player): void {
    const now = this.scene.time.now;

    // Proyektil kedaluwarsa dibersihkan supaya tidak menumpuk selamanya.
    for (const child of this.bolts.getChildren()) {
      const bolt = child as Phaser.Physics.Arcade.Sprite;
      if (now >= (bolt.getData('expiresAt') as number)) bolt.destroy();
    }

    for (let i = this.beams.length - 1; i >= 0; i--) {
      const beam = this.beams[i];

      if (beam.telegraphRemaining > 0) {
        beam.telegraphRemaining -= delta;
        if (beam.telegraphRemaining <= 0) beam.sprite.setAlpha(1);
        continue;
      }

      beam.activeRemaining -= delta;

      if (!beam.hasHit && player.isAlive) {
        const distance = this.distanceToBeam(beam, player.x, player.y);
        if (distance <= BOSS_ATTACK.BEAM_WIDTH / 2) {
          beam.hasHit = player.takeDamage(beam.damage, beam.originX, beam.originY);
        }
      }

      if (beam.activeRemaining <= 0) {
        beam.sprite.destroy();
        this.beams.splice(i, 1);
      }
    }
  }

  /** Bersihkan semua serangan — dipakai saat boss mati atau sesi berakhir. */
  clear(): void {
    this.bolts.clear(true, true);
    for (const beam of this.beams) beam.sprite.destroy();
    this.beams = [];
  }
}
