import Phaser from 'phaser';
import { COMBAT, COMBO, type AttackStep } from '../data/combat';
import { PLAYER } from '../data/config';
import { SHEETS } from '../data/frames';
import { createBaseStats, type PlayerStats, type Upgrade } from '../data/upgrades';
import { audio } from '../systems/Audio';

export type Facing = 'down' | 'up' | 'left' | 'right';

export const PLAYER_TEXTURE = SHEETS.PLAYER.key;

/** Event yang dipancarkan saat hitbox serangan aktif. GameScene yang menindaklanjuti. */
export const PLAYER_ATTACK_EVENT = 'player-attack';

/** Dipancarkan sekali saat HP pemain habis. */
export const PLAYER_DIED_EVENT = 'player-died';

export type PlayerAttackPayload = {
  step: AttackStep;
  x: number;
  y: number;
  facing: Facing;
};

/**
 * Layout spritesheet (sudah diverifikasi terhadap file aslinya):
 *   sheet 128x96, frame 32x32, grid 4 kolom x 3 baris
 *   baris 0 (frame 0-3)  = jalan ke bawah
 *   baris 1 (frame 4-7)  = jalan ke samping, MENGHADAP KANAN
 *   baris 2 (frame 8-11) = jalan ke atas
 * Arah kiri didapat dari flipX pada baris samping — tidak ada baris terpisah.
 */
const ANIM = {
  WALK_DOWN: 'player-walk-down',
  WALK_SIDE: 'player-walk-side',
  WALK_UP: 'player-walk-up',
} as const;

const IDLE_FRAME: Record<Facing, number> = {
  down: 0,
  right: 4,
  left: 4,
  up: 8,
};

export class Player extends Phaser.Physics.Arcade.Sprite {
  private facing: Facing = 'down';

  /** Indeks langkah combo yang terakhir dipakai. */
  private comboIndex = -1;
  private lastAttackAt = Number.NEGATIVE_INFINITY;
  private recoveryUntil = 0;
  private lungeUntil = 0;

  private hp: number = PLAYER.MAX_HP;
  private invulnerableUntil = 0;
  private hurtKnockbackUntil = 0;

  /** Stat yang dimodifikasi upgrade antar wave. */
  readonly stats: PlayerStats = createBaseStats(PLAYER.MAX_HP);

  private readonly keys: {
    up: Phaser.Input.Keyboard.Key[];
    down: Phaser.Input.Keyboard.Key[];
    left: Phaser.Input.Keyboard.Key[];
    right: Phaser.Input.Keyboard.Key[];
    attack: Phaser.Input.Keyboard.Key[];
  };

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, PLAYER_TEXTURE, IDLE_FRAME.down);

    scene.add.existing(this);
    scene.physics.add.existing(this);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(PLAYER.BODY_WIDTH, PLAYER.BODY_HEIGHT);
    body.setOffset(PLAYER.BODY_OFFSET_X, PLAYER.BODY_OFFSET_Y);
    body.setCollideWorldBounds(true);

    this.setOrigin(0.5, 0.5);

    const keyboard = scene.input.keyboard;
    if (!keyboard) {
      throw new Error('Keyboard input tidak tersedia — Player butuh keyboard.');
    }
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      up: [keyboard.addKey(K.W), keyboard.addKey(K.UP)],
      down: [keyboard.addKey(K.S), keyboard.addKey(K.DOWN)],
      left: [keyboard.addKey(K.A), keyboard.addKey(K.LEFT)],
      right: [keyboard.addKey(K.D), keyboard.addKey(K.RIGHT)],
      attack: [keyboard.addKey(K.J)],
    };

    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    });
  }

  static createAnimations(scene: Phaser.Scene): void {
    if (scene.anims.exists(ANIM.WALK_DOWN)) return;

    const define = (key: string, start: number, end: number) => {
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(PLAYER_TEXTURE, { start, end }),
        frameRate: PLAYER.WALK_FRAME_RATE,
        repeat: -1,
      });
    };

    define(ANIM.WALK_DOWN, 0, 3);
    define(ANIM.WALK_SIDE, 4, 7);
    define(ANIM.WALK_UP, 8, 11);
  }

  getFacing(): Facing {
    return this.facing;
  }

  get health(): number {
    return Math.max(0, this.hp);
  }

  get healthRatio(): number {
    return Phaser.Math.Clamp(this.hp / this.stats.maxHp, 0, 1);
  }

  get maxHealth(): number {
    return this.stats.maxHp;
  }

  /** Menyembuhkan, dibatasi HP maksimum saat ini. */
  heal(amount: number): void {
    if (!this.isAlive || amount <= 0) return;
    this.hp = Math.min(this.stats.maxHp, this.hp + amount);
  }

  /** Menerapkan upgrade pilihan pemain. Efeknya permanen untuk sesi ini. */
  applyUpgrade(upgrade: Upgrade): void {
    upgrade.apply(this.stats);
    if (upgrade.healFlat) this.heal(upgrade.healFlat);
    // Upgrade penambah HP maks tidak boleh membuat HP sekarang melebihi batas baru.
    this.hp = Math.min(this.hp, this.stats.maxHp);
  }

  get isAlive(): boolean {
    return this.hp > 0;
  }

  get isInvulnerable(): boolean {
    return this.scene.time.now < this.invulnerableUntil;
  }

  /**
   * Kena serangan musuh. Diabaikan selama masa kebal.
   * @returns true kalau damage benar-benar masuk.
   */
  takeDamage(amount: number, fromX: number, fromY: number): boolean {
    if (!this.isAlive || this.isInvulnerable) return false;

    this.hp -= amount;
    const now = this.scene.time.now;
    this.invulnerableUntil = now + PLAYER.INVULNERABLE_MS;
    this.hurtKnockbackUntil = now + PLAYER.HURT_KNOCKBACK_MS;

    const away = new Phaser.Math.Vector2(this.x - fromX, this.y - fromY);
    if (away.lengthSq() < 1) away.set(0, 1);
    away.normalize().scale(PLAYER.HURT_KNOCKBACK);
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(away.x, away.y);

    this.blink();
    audio.play('hurt');

    if (this.hp <= 0) {
      this.hp = 0;
      this.emit(PLAYER_DIED_EVENT);
    }
    return true;
  }

  /** Kedip selama masa kebal, supaya pemain tahu dirinya sedang tidak bisa kena. */
  private blink(): void {
    this.scene.tweens.killTweensOf(this);
    this.setAlpha(1);
    this.scene.tweens.add({
      targets: this,
      alpha: 0.25,
      duration: 90,
      yoyo: true,
      repeat: Math.floor(PLAYER.INVULNERABLE_MS / 180) - 1,
      onComplete: () => this.setAlpha(1),
    });
  }

  /** Langkah combo berikutnya — dipakai overlay debug untuk menggambar hitbox. */
  peekNextStep(): AttackStep {
    return COMBO[this.nextComboIndex(this.scene.time.now)];
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (pointer.leftButtonDown()) this.tryAttack();
  }

  private nextComboIndex(now: number): number {
    const withinWindow = now - this.lastAttackAt <= COMBAT.COMBO_WINDOW_MS;
    const hasNext = this.comboIndex + 1 < COMBO.length;
    return withinWindow && hasNext ? this.comboIndex + 1 : 0;
  }

  private tryAttack(): void {
    const now = this.scene.time.now;
    if (now < this.recoveryUntil) return;

    const index = this.nextComboIndex(now);
    const step = COMBO[index];

    this.comboIndex = index;
    this.lastAttackAt = now;
    this.recoveryUntil = now + step.recoveryMs * this.stats.recoveryMultiplier;
    this.lungeUntil = now + COMBAT.LUNGE_MS;
    audio.play('swing');

    // Hitbox baru aktif setelah windup, supaya ada jeda ancang-ancang yang terbaca.
    this.scene.time.delayedCall(step.windupMs, () => {
      if (!this.active) return;
      const payload: PlayerAttackPayload = {
        step,
        x: this.x,
        y: this.y,
        facing: this.facing,
      };
      this.emit(PLAYER_ATTACK_EVENT, payload);
    });
  }

  override update(): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const now = this.scene.time.now;

    if (!this.isAlive) {
      body.setVelocity(0, 0);
      this.stop();
      return;
    }

    // Selama terdorong mundur karena kena, input diabaikan — supaya hit terasa.
    if (now < this.hurtKnockbackUntil) return;

    const held = (group: Phaser.Input.Keyboard.Key[]) => group.some((key) => key.isDown);

    if (held(this.keys.attack)) this.tryAttack();

    // Selama sodokan, arah hadap dikunci supaya arah slash cocok dengan FX-nya.
    const lunging = now < this.lungeUntil;
    if (lunging) {
      const dir = this.facingVector();
      body.setVelocity(dir.x * COMBAT.LUNGE_SPEED, dir.y * COMBAT.LUNGE_SPEED);
      return;
    }

    let dx = (held(this.keys.right) ? 1 : 0) - (held(this.keys.left) ? 1 : 0);
    let dy = (held(this.keys.down) ? 1 : 0) - (held(this.keys.up) ? 1 : 0);

    // Normalisasi diagonal, supaya gerak menyerong tidak lebih cepat dari lurus.
    if (dx !== 0 && dy !== 0) {
      const inv = Math.SQRT1_2;
      dx *= inv;
      dy *= inv;
    }

    const recovering = now < this.recoveryUntil;
    const base = PLAYER.SPEED * this.stats.speedMultiplier;
    const speed = recovering ? base * COMBAT.ATTACK_MOVE_MULTIPLIER : base;
    body.setVelocity(dx * speed, dy * speed);

    if (dx === 0 && dy === 0) {
      this.stop();
      this.setFrame(IDLE_FRAME[this.facing]);
      this.setFlipX(this.facing === 'left');
      return;
    }

    // Gerak horizontal menang atas vertikal saat diagonal — sprite samping lebih terbaca.
    if (Math.abs(dx) >= Math.abs(dy)) {
      this.facing = dx > 0 ? 'right' : 'left';
      this.setFlipX(this.facing === 'left');
      this.play(ANIM.WALK_SIDE, true);
    } else {
      this.facing = dy > 0 ? 'down' : 'up';
      this.setFlipX(false);
      this.play(dy > 0 ? ANIM.WALK_DOWN : ANIM.WALK_UP, true);
    }
  }

  private facingVector(): { x: number; y: number } {
    switch (this.facing) {
      case 'right':
        return { x: 1, y: 0 };
      case 'left':
        return { x: -1, y: 0 };
      case 'up':
        return { x: 0, y: -1 };
      case 'down':
        return { x: 0, y: 1 };
    }
  }
}
