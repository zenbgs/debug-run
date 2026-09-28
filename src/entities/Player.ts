import Phaser from 'phaser';
import { COMBAT, COMBO, type AttackStep } from '../data/combat';
import { getClass, PLAYER_CLASSES, type PlayerClass } from '../data/classes';
import { DASH, PLAYER } from '../data/config';
import { SHEETS } from '../data/frames';
import { getSkill, SKILL_HOTKEYS, type Skill, type SkillId } from '../data/skills';
import { createBaseStats, type PlayerStats, type Upgrade } from '../data/upgrades';
import { audio } from '../systems/Audio';
import { destroyWithScene } from '../systems/Lifecycle';
import type { VirtualInput } from '../systems/VirtualInput';

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
  /** Terisi kalau serangan ini berasal dari skill, bukan combo biasa. */
  skillId?: SkillId;
  /** Skill lengkapnya, supaya GameScene tahu jenis eksekusinya. */
  skill?: Skill;
  /** Kelas jarak jauh menembak proyektil, bukan mengayun hitbox. */
  ranged?: boolean;
  /** Berapa proyektil yang ditembakkan (finisher menembak menyebar). */
  projectileCount?: number;
  /** Indeks langkah combo (0-2). Dipakai memilih FX serangan per kelas. */
  comboIndex?: number;
};

/**
 * Layout spritesheet (sudah diverifikasi terhadap file aslinya):
 *   sheet 128x96, frame 32x32, grid 4 kolom x 3 baris
 *   baris 0 (frame 0-3)  = jalan ke bawah
 *   baris 1 (frame 4-7)  = jalan ke samping, MENGHADAP KANAN
 *   baris 2 (frame 8-11) = jalan ke atas
 * Arah kiri didapat dari flipX pada baris samping — tidak ada baris terpisah.
 */
/** Nama animasi diberi awalan texture supaya tiap kelas punya set sendiri. */
function animKey(texture: string, arah: 'down' | 'side' | 'up'): string {
  return `${texture}-walk-${arah}`;
}

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

  /** Waktu (ms) kapan tiap skill boleh dipakai lagi. */
  private readonly skillReadyAt = new Map<SkillId, number>();

  private dashUntil = 0;
  private dashReadyAt = 0;
  private dashNextAfterimageAt = 0;
  private readonly dashDirection = new Phaser.Math.Vector2(0, 0);

  private hp: number = PLAYER.MAX_HP;
  private invulnerableUntil = 0;
  private hurtKnockbackUntil = 0;

  /** Stat yang dimodifikasi upgrade antar wave. Nilai awalnya dari kelas. */
  readonly stats: PlayerStats = createBaseStats(PLAYER.MAX_HP);

  private readonly keys: {
    up: Phaser.Input.Keyboard.Key[];
    down: Phaser.Input.Keyboard.Key[];
    left: Phaser.Input.Keyboard.Key[];
    right: Phaser.Input.Keyboard.Key[];
    attack: Phaser.Input.Keyboard.Key[];
    purge: Phaser.Input.Keyboard.Key[];
    shock: Phaser.Input.Keyboard.Key[];
    dash: Phaser.Input.Keyboard.Key[];
  };

  readonly playerClass: PlayerClass;

  constructor(scene: Phaser.Scene, x: number, y: number, classId?: string) {
    const config = getClass(classId);
    super(scene, x, y, config.texture, IDLE_FRAME.down);
    this.playerClass = config;

    // Stat awal diturunkan dari kelas; upgrade nanti menumpuk di atasnya.
    //
    // `damageMultiplier` SENGAJA tidak diisi dari kelas: ia menampung bonus upgrade
    // saja. Pengali kelas diterapkan terpisah — basic memakai `damageMultiplier`
    // kelas, skill memakai `skillDamageMultiplier`. Kalau keduanya dikalikan,
    // pukulan lemah Mage ikut menyeret turun skill-nya, dan Purge-nya jadi setara
    // Warrior (terukur 30,9 vs 30) — kebalikan dari yang dirancang.
    this.stats.maxHp = config.maxHp;
    this.stats.speedMultiplier = config.speedMultiplier;
    this.stats.recoveryMultiplier = config.recoveryMultiplier;
    this.hp = config.maxHp;

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
      purge: [keyboard.addKey(K.K)],
      shock: [keyboard.addKey(K.L), keyboard.addKey(K.Q)],
      dash: [keyboard.addKey(K.SPACE), keyboard.addKey(K.SHIFT)],
    };

    // Klik kanan dipakai Purge, jadi menu konteks browser harus dimatikan.
    scene.input.mouse?.disableContextMenu();

    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    });
  }

  /** Membuat animasi jalan untuk SEMUA texture kelas, bukan hanya yang dipakai. */
  static createAnimations(scene: Phaser.Scene): void {
    for (const config of PLAYER_CLASSES) {
      if (scene.anims.exists(animKey(config.texture, 'down'))) continue;

      const define = (arah: 'down' | 'side' | 'up', start: number, end: number) => {
        scene.anims.create({
          key: animKey(config.texture, arah),
          frames: scene.anims.generateFrameNumbers(config.texture, { start, end }),
          frameRate: PLAYER.WALK_FRAME_RATE,
          repeat: -1,
        });
      };

      define('down', 0, 3);
      define('side', 4, 7);
      define('up', 8, 11);
    }
  }

  /**
   * Sumber input layar sentuh. `undefined` di desktop.
   *
   * Disuntikkan, bukan dibuat sendiri: `Player` tidak boleh tahu apa-apa soal
   * tata letak tombol di layar, dan scene menu memakai kontrolnya sendiri.
   */
  private virtual?: VirtualInput;

  setVirtualInput(sumber: VirtualInput | undefined): void {
    this.virtual = sumber;
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
    // Dash memberi kebal penuh selama durasinya.
    return this.scene.time.now < this.invulnerableUntil || this.isDashing;
  }

  get isDashing(): boolean {
    return this.scene.time.now < this.dashUntil;
  }

  /** Sisa pendinginan dash dalam ms. 0 berarti siap. */
  dashCooldownRemaining(): number {
    return Math.max(0, this.dashReadyAt - this.scene.time.now);
  }

  private tryDash(dx: number, dy: number): void {
    const now = this.scene.time.now;
    if (this.isDashing || this.dashCooldownRemaining() > 0) return;

    // Arah dash mengikuti input gerak; kalau diam, ikuti arah hadap.
    if (dx !== 0 || dy !== 0) this.dashDirection.set(dx, dy).normalize();
    else {
      const f = this.facingVector();
      this.dashDirection.set(f.x, f.y);
    }

    this.dashUntil = now + DASH.DURATION_MS;
    // Pengali kelas DAN pengali upgrade — keduanya berlaku bersamaan.
    this.dashReadyAt =
      now +
      DASH.COOLDOWN_MS *
        this.playerClass.dashCooldownMultiplier *
        this.stats.dashCooldownMultiplier;
    this.dashNextAfterimageAt = 0;

    // Pasang kecepatan SEKARANG juga, jangan menunggu frame berikutnya: frame
    // pemicu akan memakai kecepatan jalan yang lama dan memangkas jarak dash.
    this.applyDashVelocity();
    audio.play('select');
  }

  private applyDashVelocity(): void {
    const speed = (DASH.DISTANCE / DASH.DURATION_MS) * 1000;
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(
      this.dashDirection.x * speed,
      this.dashDirection.y * speed
    );
  }

  /** Bayangan sisa: salinan frame saat ini yang memudar lalu dihapus. */
  private spawnAfterimage(): void {
    // Texture mengikuti kelas, bukan konstanta — tiap kelas punya sprite sendiri.
    const ghost = this.scene.add.sprite(this.x, this.y, this.playerClass.texture, this.frame.name);
    ghost.setFlipX(this.flipX);
    ghost.setDepth(this.depth - 1);
    ghost.setAlpha(0.45);
    ghost.setTint(0x8ad0ff);

    this.scene.tweens.add({
      targets: ghost,
      alpha: 0,
      duration: DASH.AFTERIMAGE_FADE_MS,
      onComplete: () => ghost.destroy(),
    });
    destroyWithScene(this.scene, ghost);
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
    // Di perangkat sentuh, serangan HANYA lewat tombol di layar.
    //
    // Phaser melaporkan sentuhan sebagai `leftButtonDown()`, jadi tanpa penjagaan
    // ini setiap jempol yang mendarat — termasuk yang memegang stik analog —
    // memicu serangan. Terukur: mendorong stik menghasilkan kecepatan 47 px/d,
    // bukan 105, karena pemain terus-menerus dalam masa pemulihan serangan.
    if (this.virtual && pointer.wasTouch) return;

    if (pointer.leftButtonDown()) this.tryAttack();
    else if (pointer.rightButtonDown()) this.trySkillSlot(0);
  }

  /** Sisa pendinginan skill dalam ms. 0 berarti siap. */
  skillCooldownRemaining(id: SkillId): number {
    const readyAt = this.skillReadyAt.get(id) ?? 0;
    return Math.max(0, readyAt - this.scene.time.now);
  }

  /**
   * Menjalankan skill pada slot tertentu (0 = tombol K, 1 = tombol L/Q).
   * Skill mana yang ada di slot itu ditentukan oleh kelas.
   *
   * Skill sengaja TIDAK memajukan combo dan tidak memakai sodokan:
   * combo adalah irama dasar, skill adalah selaan.
   */
  private trySkillSlot(slot: number): void {
    const id = this.playerClass.skills[slot];
    if (!id) return;
    const skill = getSkill(id);

    const now = this.scene.time.now;
    if (now < this.recoveryUntil) return;
    if (this.skillCooldownRemaining(id) > 0) return;

    const windupMs = skill.kind === 'hitbox' ? skill.step.windupMs : skill.windupMs;
    const recoveryMs = skill.kind === 'hitbox' ? skill.step.recoveryMs : skill.recoveryMs;

    this.skillReadyAt.set(
      id,
      now +
        skill.cooldownMs *
          this.playerClass.skillCooldownMultiplier *
          this.stats.skillCooldownMultiplier
    );
    this.recoveryUntil = now + recoveryMs * this.stats.recoveryMultiplier;
    audio.play('swing');

    this.scene.time.delayedCall(windupMs, () => {
      if (!this.active) return;
      const payload: PlayerAttackPayload = {
        // Skill `volley` tidak punya hitbox; `step` diisi langkah combo pertama
        // hanya sebagai penampung, dan GameScene mengabaikannya.
        step: skill.kind === 'hitbox' ? skill.step : COMBO[0],
        x: this.x,
        y: this.y,
        facing: this.facing,
        skillId: id,
        skill,
      };
      this.emit(PLAYER_ATTACK_EVENT, payload);
    });
  }

  /** Skill kelas ini beserta sisa pendinginannya — dipakai HUD dan layar pilih kelas. */
  getSkillStatus(): { skill: Skill; hotkey: string; remainingMs: number }[] {
    return this.playerClass.skills.map((id, i) => ({
      skill: getSkill(id),
      hotkey: SKILL_HOTKEYS[i] ?? '?',
      remainingMs: this.skillCooldownRemaining(id),
    }));
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
      const ranged = this.playerClass.attackStyle === 'ranged';
      const payload: PlayerAttackPayload = {
        step,
        x: this.x,
        y: this.y,
        facing: this.facing,
        ranged,
        comboIndex: index,
        // Finisher combo menembak menyebar tiga arah.
        projectileCount: ranged ? (index === COMBO.length - 1 ? 3 : 1) : undefined,
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

    // Dash berjalan: kunci gerak, keluarkan bayangan, abaikan input lain.
    if (this.isDashing) {
      this.applyDashVelocity();
      if (now >= this.dashNextAfterimageAt) {
        this.spawnAfterimage();
        this.dashNextAfterimageAt = now + DASH.AFTERIMAGE_EVERY_MS;
      }
      return;
    }

    const v = this.virtual;
    if (held(this.keys.attack) || v?.attack) this.tryAttack();
    if (held(this.keys.purge) || v?.skill1) this.trySkillSlot(0);
    if (held(this.keys.shock) || v?.skill2) this.trySkillSlot(1);

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

    // Stik analog dipakai hanya kalau keyboard diam, jadi keyboard selalu menang
    // dan perangkat dengan keduanya (laptop layar sentuh) tidak saling berebut.
    // Panjang vektornya 0..1, bukan 0/1 — dorongan setengah = jalan setengah cepat.
    if (dx === 0 && dy === 0 && v) {
      dx = v.moveX;
      dy = v.moveY;
    }

    if (held(this.keys.dash) || v?.dash) {
      this.tryDash(dx, dy);
      if (this.isDashing) return;
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
      this.play(animKey(this.playerClass.texture, 'side'), true);
    } else {
      this.facing = dy > 0 ? 'down' : 'up';
      this.setFlipX(false);
      this.play(animKey(this.playerClass.texture, dy > 0 ? 'down' : 'up'), true);
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
