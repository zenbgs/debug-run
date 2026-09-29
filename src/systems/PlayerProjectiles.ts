import Phaser from 'phaser';
import { PLAYER_CLASSES, type ProjectileConfig } from '../data/classes';
import { DEPTH } from '../data/depth';
import { ALL_SHEETS } from '../data/frames';
import type { VolleyConfig } from '../data/skills';
import type { Enemy } from '../entities/Enemy';
import type { Facing, PlayerAttackPayload } from '../entities/Player';
import type { Player } from '../entities/Player';
import { audio } from './Audio';

/** Radius tumbukan proyektil, dipakai deteksi manual di `update()`. */
const RADIUS = 5;
const KNOCKBACK = 150;

/** Sebaran sudut antar proyektil saat serangan dasar menembak lebih dari satu. */
const SEBAR_DASAR = 0.22;

const SHEET_BY_KEY = new Map(ALL_SHEETS.map((s) => [s.key, s]));

/** Nama animasi proyektil yang beranimasi (mis. bola api berkedip). */
function animKey(texture: string): string {
  return `${texture}-fly`;
}

/** Sudut tembak dari arah hadap. Sprite digambar menghadap kanan. */
export function facingAngle(facing: Facing): number {
  return facing === 'right'
    ? 0
    : facing === 'left'
      ? Math.PI
      : facing === 'down'
        ? Math.PI / 2
        : -Math.PI / 2;
}

/**
 * Konteks dari scene. Sistem ini tidak tahu apa-apa soal skor, rantai bunuh,
 * atau angka damage yang melayang — ia hanya melapor.
 */
export type ProjectileContext = {
  /** Musuh hidup saat ini. Dipanggil sekali per frame, bukan per proyektil. */
  aliveEnemies: () => Enemy[];
  /** Dipanggil saat proyektil mengenai, sebelum damage diterapkan. */
  onHit: (enemy: Enemy, damage: number) => void;
  onKill: (enemy: Enemy) => void;
};

/**
 * Proyektil pemain: panah Archer, bola api Mage, dan skill `volley`.
 *
 * Dipecah keluar dari `GameScene` yang sudah 1.225 baris. Polanya sama dengan
 * `BossAttacks`: sistem memegang grup dan geometrinya, scene memegang aturan
 * mainnya dan menerimanya lewat callback.
 */
export class PlayerProjectiles {
  readonly group: Phaser.Physics.Arcade.Group;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly context: ProjectileContext
  ) {
    this.group = scene.physics.add.group();
  }

  /**
   * Animasi untuk proyektil yang berkedip. Dipanggil sekali per scene.
   *
   * Daftarnya diturunkan dari `PLAYER_CLASSES`, bukan dari semua spritesheet:
   * menyaring berdasarkan nama texture akan ikut membuat animasi untuk sprite
   * pemain itu sendiri, yang namanya juga berawalan `player-`.
   */
  static createAnimations(scene: Phaser.Scene): void {
    for (const kelas of PLAYER_CLASSES) {
      const p = kelas.projectile;
      if (!p?.animated) continue;

      const sheet = SHEET_BY_KEY.get(p.texture);
      const key = animKey(p.texture);
      if (!sheet || scene.anims.exists(key)) continue;

      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(p.texture, { start: 0, end: sheet.frames - 1 }),
        frameRate: 14,
        repeat: -1,
      });
    }
  }

  /** Serangan dasar kelas jarak jauh. */
  fireBasic(player: Player, payload: PlayerAttackPayload): void {
    const kelas = player.playerClass;
    const proyektil = kelas.projectile;
    if (!proyektil) return;

    // Upgrade "Tembakan Pecah" menambah proyektil di atas jumlah bawaan serangan.
    const jumlah = (payload.projectileCount ?? 1) + player.stats.projectileBonus;
    const dasar = facingAngle(payload.facing);
    const damage = payload.step.damage * player.stats.damageMultiplier * kelas.damageMultiplier;

    for (let i = 0; i < jumlah; i++) {
      const sudut = dasar + (i - (jumlah - 1) / 2) * SEBAR_DASAR;
      this.spawn(payload.x, payload.y, sudut, proyektil, {
        speed: proyektil.speed,
        range: proyektil.range,
        damage,
        // Upgrade "Tembakan Tembus".
        pierce: player.stats.piercing,
        hitFx: kelas.hitFx,
      });
    }
    audio.play('swing');
  }

  /** Skill jenis `volley` — beberapa proyektil menyebar sekaligus. */
  fireVolley(player: Player, payload: PlayerAttackPayload, config: VolleyConfig): void {
    const proyektil = player.playerClass.projectile;
    if (!proyektil) return;

    const dasar = facingAngle(payload.facing);
    // Skill memakai pengali skill kelas, bukan pengali serangan dasar.
    const damage = config.damage * player.stats.damageMultiplier;

    for (let i = 0; i < config.count; i++) {
      const offset = config.count === 1 ? 0 : (i / (config.count - 1) - 0.5) * config.spread;
      this.spawn(payload.x, payload.y, dasar + offset, proyektil, {
        speed: config.speed,
        range: config.range,
        damage,
        pierce: config.pierce,
        stunMs: config.stunMs,
        hitFx: player.playerClass.hitFx,
      });
    }
    audio.play('upgrade');
  }

  /** Membuat satu proyektil. */
  spawn(
    x: number,
    y: number,
    sudut: number,
    sumber: ProjectileConfig,
    opsi: {
      speed: number;
      range: number;
      damage: number;
      pierce: boolean;
      stunMs?: number;
      /** Efek benturan; menempel di proyektil karena `update()` tidak tahu kelasnya. */
      hitFx?: string;
    }
  ): void {
    const sheet = SHEET_BY_KEY.get(sumber.texture);
    if (!sheet) return;

    const peluru = this.group.create(x, y, sumber.texture) as Phaser.Physics.Arcade.Sprite;
    peluru.setDepth(DEPTH.PLAYER_PROJECTILE);
    peluru.setRotation(sudut);
    peluru.setScale(sumber.scale);
    peluru.setData('damage', opsi.damage);
    peluru.setData('pierce', opsi.pierce);
    peluru.setData('stunMs', opsi.stunMs ?? 0);
    peluru.setData('hitFx', opsi.hitFx);
    peluru.setData('hitIds', new Set<Enemy>());
    peluru.setData('expiresAt', this.scene.time.now + (opsi.range / opsi.speed) * 1000);

    if (sumber.animated) peluru.play(animKey(sumber.texture));

    const body = peluru.body as Phaser.Physics.Arcade.Body;
    // Offset WAJIB diset eksplisit. `setSize()` seharusnya memusatkan body, tapi
    // pada sprite proyektil ini tidak terjadi: body tertinggal di pojok kiri-atas
    // frame, jauh dari gambarnya, sehingga proyektil menembus musuh tanpa pernah
    // mengenai. Terukur pada panah: sprite di (433,303), body di (417,287).
    body.setSize(sumber.bodyWidth, sumber.bodyHeight);
    body.setOffset(
      (sheet.frameWidth - sumber.bodyWidth) / 2,
      (sheet.frameHeight - sumber.bodyHeight) / 2
    );
    body.setAllowGravity(false);
    body.setVelocity(Math.cos(sudut) * opsi.speed, Math.sin(sudut) * opsi.speed);
  }

  /**
   * Kedaluwarsa dan tumbukan — semuanya dihitung manual di sini.
   *
   * Deteksi kena TIDAK memakai `physics.add.overlap`. Pendekatan itu sempat
   * dipakai dan gagal secara diam-diam: proyektilnya hancur tapi damage tidak
   * pernah masuk, dan penyebabnya sulit dipastikan. Perhitungan jarak manual
   * seperti beam boss jauh lebih mudah dibuktikan benar, dan biayanya sepele
   * untuk belasan proyektil.
   */
  update(): void {
    const now = this.scene.time.now;
    const musuh = this.context.aliveEnemies();

    for (const child of this.group.getChildren()) {
      const peluru = child as Phaser.Physics.Arcade.Sprite;
      if (!peluru.active) continue;

      if (now >= (peluru.getData('expiresAt') as number)) {
        peluru.destroy();
        continue;
      }

      for (const target of musuh) {
        const body = target.body as Phaser.Physics.Arcade.Body | null;
        if (!body) continue;

        // Kotak musuh dilebarkan sedikit oleh radius proyektil.
        const jangkauanX = body.width / 2 + RADIUS;
        const jangkauanY = body.height / 2 + RADIUS;
        if (
          Math.abs(peluru.x - (body.x + body.width / 2)) > jangkauanX ||
          Math.abs(peluru.y - (body.y + body.height / 2)) > jangkauanY
        ) {
          continue;
        }

        // Proyektil menembus hanya boleh mengenai tiap musuh sekali.
        const sudahKena = peluru.getData('hitIds') as Set<Enemy>;
        if (sudahKena.has(target)) continue;
        sudahKena.add(target);

        const damage = (peluru.getData('damage') as number) ?? 0;
        const stunMs = (peluru.getData('stunMs') as number) ?? 0;
        const away = new Phaser.Math.Vector2(target.x - peluru.x, target.y - peluru.y);
        if (away.lengthSq() < 1) away.set(1, 0);
        away.normalize().scale(KNOCKBACK);

        this.context.onHit(target, damage);
        const mati = target.takeDamage(
          damage,
          away.x,
          away.y,
          (peluru.getData('hitFx') as string | undefined) ?? undefined
        );
        if (mati) this.context.onKill(target);
        else if (stunMs > 0) target.applyStun(stunMs);

        if (!(peluru.getData('pierce') as boolean)) {
          peluru.destroy();
          break;
        }
      }
    }
  }

  clear(): void {
    this.group.clear(true, true);
  }
}
