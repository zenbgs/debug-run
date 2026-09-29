import Phaser from 'phaser';
import { DESTRUCTIBLE, isDestructible, specFor } from '../data/destructibles';
import { SHEETS } from '../data/frames';
import { EMPTY } from '../data/tiles';
import { audio } from './Audio';
import { playFx } from './Fx';

export type DestructibleContext = {
  /** Dipanggil saat rintangan pecah — scene yang memutuskan apakah ada jatuhan. */
  onBreak: (worldX: number, worldY: number, dropChance: number) => void;
};

/**
 * Rintangan interior yang bisa dipecahkan.
 *
 * HP disimpan per KOORDINAT TILE di sini, bukan di tilemap: `Tile` Phaser tidak
 * punya tempat menyimpan keadaan sendiri, dan menumpangkan properti ke objek
 * tile akan hilang begitu arena dicat ulang antar wave.
 *
 * ⚠️ Peta HP WAJIB dikosongkan tiap arena dibangun ulang (`reset()`). Tanpa itu
 * tile di koordinat yang sama pada wave berikutnya mewarisi kerusakan dari wave
 * sebelumnya — pohon yang baru muncul sudah nyaris pecah tanpa pernah dipukul.
 */
export class Destructibles {
  /** `"tx,ty"` -> sisa HP. */
  private readonly hp = new Map<string, number>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.Tilemaps.TilemapLayer,
    private readonly context: DestructibleContext
  ) {}

  /** Dipanggil tiap arena dibangun ulang. */
  reset(): void {
    this.hp.clear();
  }

  /** Jumlah rintangan yang sedang rusak sebagian — dipakai alat ukur. */
  get damagedCount(): number {
    return this.hp.size;
  }

  /**
   * Lukai semua rintangan di dalam radius.
   *
   * @returns jumlah rintangan yang PECAH oleh panggilan ini.
   */
  damageAt(worldX: number, worldY: number, radius: number, amount: number): number {
    if (amount <= 0) return 0;

    const tile = this.layer.tilemap;
    const tw = tile.tileWidth;
    const th = tile.tileHeight;

    const t0 = this.layer.worldToTileXY(worldX - radius, worldY - radius);
    const t1 = this.layer.worldToTileXY(worldX + radius, worldY + radius);
    if (!t0 || !t1) return 0;

    let pecah = 0;
    for (let ty = Math.floor(t0.y); ty <= Math.ceil(t1.y); ty++) {
      for (let tx = Math.floor(t0.x); tx <= Math.ceil(t1.x); tx++) {
        const t = this.layer.getTileAt(tx, ty);
        if (!t || !isDestructible(t.index)) continue;

        // Jarak diukur ke PUSAT tile, bukan ke sudutnya: dengan sudut, tile yang
        // nyaris tidak tersentuh ikut rusak dan ledakan terasa jauh lebih luas
        // daripada lingkaran FX-nya.
        const cx = (tx + 0.5) * tw;
        const cy = (ty + 0.5) * th;
        if (Phaser.Math.Distance.Between(worldX, worldY, cx, cy) > radius + tw * 0.5) continue;

        if (this.lukaiTile(tx, ty, t, amount, cx, cy)) pecah++;
      }
    }
    return pecah;
  }

  private lukaiTile(
    tx: number,
    ty: number,
    tile: Phaser.Tilemaps.Tile,
    amount: number,
    cx: number,
    cy: number
  ): boolean {
    const spec = specFor(tile.index);
    if (!spec) return false;

    const kunci = `${tx},${ty}`;
    const sisa = (this.hp.get(kunci) ?? spec.hp) - amount;

    if (sisa > 0) {
      this.hp.set(kunci, sisa);
      // Goyang sedikit + gelapkan mengikuti kerusakan: rintangan yang dipukul
      // tanpa reaksi apa pun terbaca sebagai kebal, dan pemain berhenti mencoba.
      const rusak = 1 - sisa / spec.hp;
      tile.tint = Phaser.Display.Color.GetColor(
        255 - Math.round(rusak * 90),
        255 - Math.round(rusak * 120),
        255 - Math.round(rusak * 120)
      );
      this.goyang(tile);
      audio.play('block');
      return false;
    }

    // Pecah.
    this.hp.delete(kunci);
    this.layer.putTileAt(EMPTY, tx, ty);

    playFx(this.scene, SHEETS.FX_ENEMY_DEATH.key, cx, cy, { scale: 0.7 });
    audio.play('kill');
    this.context.onBreak(cx, cy, spec.dropChance);
    return true;
  }

  private goyang(tile: Phaser.Tilemaps.Tile): void {
    const asalX = tile.pixelX;
    tile.pixelX = asalX + (Math.random() > 0.5 ? DESTRUCTIBLE.SHAKE_PX : -DESTRUCTIBLE.SHAKE_PX);
    this.scene.time.delayedCall(DESTRUCTIBLE.SHAKE_MS, () => {
      tile.pixelX = asalX;
    });
  }
}
