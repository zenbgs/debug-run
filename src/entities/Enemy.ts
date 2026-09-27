import Phaser from 'phaser';
import { BOSS_TYPES } from '../data/bosses';
import { COMBAT } from '../data/combat';
import { CHARGER, ENEMY_TYPES, SHOOTER, ZIGZAG, type EnemyType } from '../data/enemies';
import { ALL_SHEETS, SHEETS } from '../data/frames';
import { audio } from '../systems/Audio';
import { playFx } from '../systems/Fx';
import { spawnDeathBurst, spawnHitSparks } from '../systems/Particles';

/** Nama animasi idle per texture — satu animasi dipakai bersama semua varian tint. */
function idleAnimKey(texture: string): string {
  return `${texture}-idle`;
}

type ChargerPhase = 'aim' | 'dash' | 'recover';

/** Pergeseran di bawah ini (piksel per frame) dianggap "tidak bergerak". */
const STUCK_MOVE_EPSILON = 0.4;
/** Selama ini tidak bergerak padahal ingin bergerak -> dorong paksa. */
const STUCK_LIMIT_MS = 1200;
/** Jarak dorongan paksa. Harus lebih besar dari satu tile (16 px) agar benar-benar lolos. */
const UNSTICK_NUDGE = 22;

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  /** `type` sudah dipakai Phaser.GameObjects.Sprite, jadi pakai nama lain. */
  readonly config: EnemyType;

  private hp: number;
  private knockbackUntil = 0;
  private stunnedUntil = 0;
  private flashTimer?: Phaser.Time.TimerEvent;

  /** Fase acak per musuh, supaya goyangan zigzag tidak seragam. */
  private readonly wobbleOffset: number;
  private chargerPhase: ChargerPhase = 'aim';
  private chargerPhaseUntil = 0;
  private chargerDirection = new Phaser.Math.Vector2(0, 0);

  /**
   * Dipasang GameScene lewat factory. Musuh tidak tahu apa-apa soal sistem
   * proyektil; ia hanya memanggil callback ini — pola yang sama dengan Boss.
   */
  onShoot?: (x: number, y: number, angle: number, speed: number, damage: number) => void;

  private shootReadyAt = 0;
  private shootWindupUntil = 0;
  private aiming = false;

  /** Pelacak macet — lihat catatan di `applyUnstick`. */
  private lastX = 0;
  private lastY = 0;
  private stuckMs = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, type: EnemyType) {
    super(scene, x, y, type.texture, 0);

    this.config = type;
    this.hp = type.hp;
    this.wobbleOffset = Math.random() * Math.PI * 2;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setScale(type.scale);
    if (type.tint !== undefined) this.setTint(type.tint);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(type.bodyWidth, type.bodyHeight);
    if (type.bodyOffsetY) {
      // `setSize` memusatkan hitbox di frame. Offset ditulis ulang secara eksplisit
      // — pelajaran dari bug panah di M6: mengandalkan offset implisit membuat
      // hitbox menggantung di sudut frame tanpa terlihat sampai diukur.
      body.setOffset(
        (this.width - type.bodyWidth) / 2,
        (this.height - type.bodyHeight) / 2 + type.bodyOffsetY
      );
    }
    body.setCollideWorldBounds(true);
    // Knockback meredam sendiri, bukan meluncur terus.
    body.setDrag(COMBAT.ENEMY_DRAG, COMBAT.ENEMY_DRAG);
    body.setBounce(0);

    this.lastX = x;
    this.lastY = y;

    // Sprite satu frame tidak punya animasi idle; Boss menggoyangnya lewat tween.
    if (type.frames > 1) this.play(idleAnimKey(type.texture));
  }

  /**
   * Buat animasi idle untuk setiap spritesheet yang dipakai musuh atau boss.
   *
   * Daftarnya diturunkan dari data, bukan ditulis tangan: versi lama menyebut
   * empat sheet satu per satu, jadi menambah sprite boss baru diam-diam membuat
   * `play()` gagal karena animasinya tidak pernah dibuat.
   */
  static createAnimations(scene: Phaser.Scene): void {
    const textures = new Set([...ENEMY_TYPES, ...BOSS_TYPES].map((t) => t.texture));
    for (const key of textures) {
      const sheet = ALL_SHEETS.find((s) => s.key === key);
      if (!sheet || sheet.frames < 2) continue;

      const animKey = idleAnimKey(sheet.key);
      if (scene.anims.exists(animKey)) continue;
      scene.anims.create({
        key: animKey,
        frames: scene.anims.generateFrameNumbers(sheet.key, { start: 0, end: sheet.frames - 1 }),
        frameRate: 8,
        repeat: -1,
      });
    }
  }

  get isAlive(): boolean {
    return this.active && this.hp > 0;
  }

  /** HP mentah saat ini — dipakai menghitung damage yang benar-benar masuk. */
  get currentHp(): number {
    return this.hp;
  }

  get healthRatio(): number {
    return Phaser.Math.Clamp(this.hp / this.config.hp, 0, 1);
  }

  get isStunned(): boolean {
    return this.scene.time.now < this.stunnedUntil;
  }

  /** Membuat musuh terpaku: berhenti total dan AI tidak berjalan. Dipakai skill Shock. */
  applyStun(durationMs: number): void {
    if (!this.isAlive || durationMs <= 0) return;

    // Jangan memperpendek stun yang sedang berjalan.
    this.stunnedUntil = Math.max(this.stunnedUntil, this.scene.time.now + durationMs);
    (this.body as Phaser.Physics.Arcade.Body | null)?.setVelocity(0, 0);
    this.setTint(COMBAT.STUN_TINT);
  }

  /** @returns true kalau serangan ini membunuhnya. */
  takeDamage(amount: number, knockbackX: number, knockbackY: number): boolean {
    if (!this.isAlive) return false;

    this.hp -= amount;

    playFx(this.scene, SHEETS.FX_HIT.key, this.x, this.y, { scale: 0.8 });
    spawnHitSparks(this.scene, this.x, this.y);
    audio.play('hit');
    this.flash();

    if (this.hp <= 0) {
      this.die();
      return true;
    }

    const resist = 1 - this.config.knockbackResist;
    if (resist > 0) {
      const body = this.body as Phaser.Physics.Arcade.Body | null;
      body?.setVelocity(knockbackX * resist, knockbackY * resist);
      this.knockbackUntil = this.scene.time.now + COMBAT.KNOCKBACK_MS;
    }
    return false;
  }

  /**
   * Warna yang berlaku saat musuh tidak sedang berkedip kena pukul atau terpaku.
   *
   * Dibuat bisa ditimpa karena Boss mengubah warnanya sendiri saat masuk fase 2.
   * Sebelumnya `flash()` membaca `config.tint` langsung, jadi penanda merah fase 2
   * hilang permanen begitu boss kena pukul pertama — tepat pada saat penanda itu
   * paling dibutuhkan.
   */
  protected baseTint(): number | undefined {
    return this.config.tint;
  }

  private flash(): void {
    this.setTintFill(0xffffff);
    this.flashTimer?.remove();
    this.flashTimer = this.scene.time.delayedCall(COMBAT.HIT_FLASH_MS, () => {
      if (!this.active) return;
      this.clearTint();
      // Musuh yang masih terpaku harus tetap memakai warna stun.
      if (this.isStunned) this.setTint(COMBAT.STUN_TINT);
      else this.restoreTint();
    });
  }

  private die(): void {
    playFx(this.scene, SHEETS.FX_ENEMY_DEATH.key, this.x, this.y, { scale: 0.7 });
    spawnDeathBurst(this.scene, this.x, this.y, this.config.tint ?? 0xffffff);
    audio.play('kill');
    this.flashTimer?.remove();
    this.destroy();
  }

  /** Dipanggil tiap frame oleh GameScene selama musuh hidup. */
  tick(target: Phaser.Math.Vector2, now: number, deltaSeconds: number): void {
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return;

    // Terpaku: diam total, AI tidak jalan.
    if (now < this.stunnedUntil) {
      body.setVelocity(0, 0);
      return;
    }

    // Saat stun baru saja berakhir, kembalikan warna aslinya.
    if (this.stunnedUntil !== 0) {
      this.stunnedUntil = 0;
      this.restoreTint();
    }

    // Selama terdorong, AI tidak mengambil alih — biar knockback terasa.
    if (now < this.knockbackUntil) return;

    switch (this.config.behavior) {
      case 'chase':
        this.moveChase(body, target);
        break;
      case 'zigzag':
        this.moveZigzag(body, target, now);
        break;
      case 'charger':
        this.moveCharger(body, target, now);
        break;
      case 'shooter':
        this.moveShooter(body, target, now);
        break;
    }

    this.applyUnstick(body, target, deltaSeconds);

    // Sprite hanya punya satu orientasi; flip mengikuti arah gerak horizontal.
    if (Math.abs(body.velocity.x) > 5) this.setFlipX(body.velocity.x < 0);
  }

  /**
   * AI mengejar tidak punya pathfinding: musuh mendorong lurus ke pemain dan bisa
   * tersangkut permanen di balik batu/pohon. Karena wave baru bersih kalau SEMUA
   * musuh mati, satu musuh nyangkut membuat permainan deadlock — ini benar-benar
   * terjadi di M4 dan menghentikan wave 1 selamanya.
   *
   * Dua lapis penanganan:
   *  1. Meluncur menyusuri tembok — kalau arah maju terhalang, belok tegak lurus
   *     ke sisi yang mendekatkan ke pemain.
   *  2. Jaring pengaman — kalau tetap tidak bergerak selama `STUCK_LIMIT_MS`,
   *     dorong paksa melewati rintangan. Jelek, tapi jauh lebih baik daripada
   *     permainan yang mustahil diselesaikan.
   */
  private applyUnstick(
    body: Phaser.Physics.Arcade.Body,
    target: Phaser.Math.Vector2,
    deltaSeconds: number
  ): void {
    const wantsToMove = Math.abs(body.velocity.x) > 1 || Math.abs(body.velocity.y) > 1;
    const moved = Math.hypot(this.x - this.lastX, this.y - this.lastY);
    this.lastX = this.x;
    this.lastY = this.y;

    if (!wantsToMove || moved > STUCK_MOVE_EPSILON) {
      this.stuckMs = 0;
      return;
    }

    this.stuckMs += deltaSeconds * 1000;

    // Lapis 1: meluncur menyusuri tembok.
    const blocked = body.blocked;
    const speed = this.config.speed;
    if ((blocked.left && body.velocity.x < 0) || (blocked.right && body.velocity.x > 0)) {
      body.setVelocity(0, (target.y >= this.y ? 1 : -1) * speed);
    } else if ((blocked.up && body.velocity.y < 0) || (blocked.down && body.velocity.y > 0)) {
      body.setVelocity((target.x >= this.x ? 1 : -1) * speed, 0);
    }

    // Lapis 2: jaring pengaman.
    if (this.stuckMs >= STUCK_LIMIT_MS) {
      this.stuckMs = 0;
      const dir = this.directionTo(target);
      body.reset(this.x + dir.x * UNSTICK_NUDGE, this.y + dir.y * UNSTICK_NUDGE);
    }
  }

  private directionTo(target: Phaser.Math.Vector2): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(target.x - this.x, target.y - this.y).normalize();
  }

  private moveChase(body: Phaser.Physics.Arcade.Body, target: Phaser.Math.Vector2): void {
    const dir = this.directionTo(target);
    body.setVelocity(dir.x * this.config.speed, dir.y * this.config.speed);
  }

  private moveZigzag(
    body: Phaser.Physics.Arcade.Body,
    target: Phaser.Math.Vector2,
    now: number
  ): void {
    const dir = this.directionTo(target);
    // Vektor tegak lurus arah kejar, dikalikan gelombang sinus.
    const wobble =
      Math.sin(now / 1000 * ZIGZAG.FREQUENCY + this.wobbleOffset) * ZIGZAG.AMPLITUDE;
    const vx = (dir.x + -dir.y * wobble) * this.config.speed;
    const vy = (dir.y + dir.x * wobble) * this.config.speed;
    body.setVelocity(vx, vy);
  }

  /**
   * Menjaga jarak ideal lalu menembak. Ada telegraf singkat (musuh memutih dan
   * berhenti) supaya pemain sempat berlindung di balik batu atau menghindar —
   * tembakan tanpa aba-aba terasa tidak adil.
   */
  private moveShooter(
    body: Phaser.Physics.Arcade.Body,
    target: Phaser.Math.Vector2,
    now: number
  ): void {
    // Sedang mengancang: diam total sampai peluru lepas.
    if (this.aiming) {
      body.setVelocity(0, 0);
      if (now >= this.shootWindupUntil) {
        this.aiming = false;
        this.restoreTint();
        const angle = Math.atan2(target.y - this.y, target.x - this.x);
        this.onShoot?.(
          this.x,
          this.y,
          angle,
          SHOOTER.BOLT_SPEED,
          this.config.projectileDamage ?? 8
        );
      }
      return;
    }

    const dir = this.directionTo(target);
    const jarak = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
    const selisih = jarak - SHOOTER.PREFERRED_RANGE;

    if (Math.abs(selisih) > SHOOTER.RANGE_TOLERANCE) {
      // Terlalu jauh -> mendekat; terlalu dekat -> mundur.
      const arah = selisih > 0 ? 1 : -1;
      body.setVelocity(dir.x * this.config.speed * arah, dir.y * this.config.speed * arah);
    } else {
      body.setVelocity(0, 0);
    }

    if (now >= this.shootReadyAt) {
      this.aiming = true;
      this.shootWindupUntil = now + SHOOTER.WINDUP_MS;
      this.shootReadyAt = now + SHOOTER.COOLDOWN_MS + SHOOTER.WINDUP_MS;
      this.setTint(SHOOTER.AIM_TINT);
    }
  }

  /** Mengembalikan warna yang seharusnya berlaku sekarang. */
  private restoreTint(): void {
    this.clearTint();
    const tint = this.baseTint();
    if (tint !== undefined) this.setTint(tint);
  }

  private moveCharger(
    body: Phaser.Physics.Arcade.Body,
    target: Phaser.Math.Vector2,
    now: number
  ): void {
    if (now >= this.chargerPhaseUntil) {
      switch (this.chargerPhase) {
        case 'aim':
          // Arah dikunci saat mulai menerjang — pemain bisa menghindar.
          this.chargerDirection = this.directionTo(target);
          this.chargerPhase = 'dash';
          this.chargerPhaseUntil = now + CHARGER.DASH_MS;
          this.restoreTint();
          break;
        case 'dash':
          this.chargerPhase = 'recover';
          this.chargerPhaseUntil = now + CHARGER.RECOVER_MS;
          break;
        case 'recover':
          this.chargerPhase = 'aim';
          this.chargerPhaseUntil = now + CHARGER.AIM_MS;
          // Telegraf: memutih selama mengincar. Tanpa ini terjangannya datang
          // tanpa aba-aba yang terbaca, dan terasa tidak adil.
          this.setTint(SHOOTER.AIM_TINT);
          break;
      }
    }

    if (this.chargerPhase === 'dash') {
      body.setVelocity(
        this.chargerDirection.x * this.config.speed,
        this.chargerDirection.y * this.config.speed
      );
      return;
    }

    if (this.chargerPhase === 'aim') {
      const dir = this.directionTo(target);
      body.setVelocity(dir.x * CHARGER.AIM_SPEED, dir.y * CHARGER.AIM_SPEED);
      return;
    }

    body.setVelocity(0, 0);
  }
}
