import Phaser from 'phaser';
import { BIOMES, biomeForWave, type Biome } from '../data/biomes';
import { isBossType, SPAWNABLE_BY_ID, type BossType } from '../data/bosses';
import type { ProjectileConfig } from '../data/classes';
import { CAMERA, FONT_FAMILY, TILE } from '../data/config';
import type { EnemyType } from '../data/enemies';
import { EMPTY } from '../data/tiles';
import { ALL_SHEETS, SHEETS } from '../data/frames';
import { SHOCK_FX_STEPS, type VolleyConfig } from '../data/skills';
import { STORY_BOSS, STORY_VICTORY } from '../data/story';
import { UPGRADE_FX, type Upgrade } from '../data/upgrades';
import { WAVES, WAVE_TIMING, waveClearBonus, type Wave } from '../data/waves';
import { Boss, type BossContext } from '../entities/Boss';
import { Enemy } from '../entities/Enemy';
import {
  Player,
  PLAYER_ATTACK_EVENT,
  PLAYER_DIED_EVENT,
  type Facing,
  type PlayerAttackPayload,
} from '../entities/Player';
import { buildArena } from '../systems/ArenaBuilder';
import { audio } from '../systems/Audio';
import { BossAttacks } from '../systems/BossAttacks';
import { CombatSystem } from '../systems/CombatSystem';
import { DamageNumbers } from '../systems/DamageNumbers';
import { ScoreStreak } from '../systems/ScoreStreak';
import { DialogueBox } from '../systems/DialogueBox';
import { createFxAnimations, playFx } from '../systems/Fx';
import { createParticleTexture } from '../systems/Particles';
import { addText, createPanel, showWaveBanner } from '../systems/Ui';
import { UpgradePanel } from '../systems/UpgradePanel';
import { WaveManager } from '../systems/WaveManager';
import { TILESET_TEXTURE } from './BootScene';

const DEPTH = {
  GROUND: 0,
  OBJECTS: 5,
  ENEMY: 8,
  PLAYER: 10,
  DEBUG: 99,
  HUD: 100,
} as const;

/**
 * Bar HP boss, diukur dari tepi BAWAH layar.
 *
 * Dulu bar ini di atas (y=31) dengan namanya di y=22 — dan keduanya menimpa baris
 * kedua teks HUD, yang membentang y=14 sampai y=30. Nama boss jadi tertumpuk
 * "sisa N / skor N" tepat ketika boss muncul. Di bawah tidak ada yang ditabrak:
 * kotak dialog memang di sana, tapi cerita boss selesai sebelum boss keluar.
 */
const BOSS_BAR = {
  BOTTOM_MARGIN: 14,
  LABEL_MARGIN: 24,
} as const;

/** Rotasi FX slash mengikuti arah hadap. Sprite aslinya digambar menghadap kanan. */
const FX_ANGLE: Record<Facing, number> = {
  right: 0,
  left: 0,
  up: -90,
  down: 90,
};

/** Pencarian cepat spesifikasi sheet dari key-nya, untuk menghitung offset body. */
const SHEET_BY_KEY = new Map(ALL_SHEETS.map((s) => [s.key, s]));

/** Nama animasi proyektil beranimasi. */
function projectileAnimKey(texture: string): string {
  return `${texture}-fly`;
}

/** Radius tumbukan panah, dipakai deteksi manual di `updateArrows`. */
const ARROW_RADIUS = 5;
const ARROW_KNOCKBACK = 150;

type SceneState = 'playing' | 'upgrade' | 'paused' | 'dialog' | 'gameover' | 'victory';

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private combat!: CombatSystem;
  private waves!: WaveManager;
  private upgradePanel!: UpgradePanel;
  private enemyGroup!: Phaser.Physics.Arcade.Group;
  private bossAttacks!: BossAttacks;
  private activeBoss?: Boss;
  private bossBar?: Phaser.GameObjects.Graphics;
  private bossLabel?: Phaser.GameObjects.Text;
  private obstacles!: Phaser.Tilemaps.TilemapLayer;
  private groundLayer!: Phaser.Tilemaps.TilemapLayer;
  /** Biome yang sedang tampil; dipakai banner wave dan HUD debug. */
  private biome: Biome = BIOMES[0];

  private debugGraphics?: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private hudBar!: Phaser.GameObjects.Graphics;
  private pausePanel?: { destroy: () => void };

  private state: SceneState = 'playing';
  private kills = 0;
  private score = 0;
  private elapsedMs = 0;
  /** Berapa kali tiap upgrade sudah diambil, untuk menghormati batas stack. */
  private takenUpgrades = new Map<string, number>();
  private upgradeDelayTimer = 0;
  private classId?: string;
  private arrows!: Phaser.Physics.Arcade.Group;
  private dialogue!: DialogueBox;
  private damageNumbers!: DamageNumbers;
  /** Wave boss yang ceritanya sudah diputar, supaya tidak berulang. */
  private readonly bossStoryShown = new Set<number>();
  /** Lihat getter `aliveEnemies`. */
  private aliveCache?: Enemy[];
  /** Isi HUD terakhir, supaya string tidak dibangun ulang tiap frame. */
  private hudSignature = '';
  /** Rantai bunuh beruntun; logikanya murni dan diuji terpisah. */
  private readonly streak = new ScoreStreak();
  /** Musuh yang sudah terkena dash ini; dikosongkan saat dash selesai. */
  private readonly dashHitIds = new Set<Enemy>();

  constructor() {
    super('Game');
  }

  create(data?: { classId?: string }): void {
    if (data?.classId) this.classId = data.classId;
    this.state = 'playing';
    this.kills = 0;
    this.score = 0;
    this.elapsedMs = 0;
    this.takenUpgrades = new Map();
    this.upgradeDelayTimer = 0;
    this.debugGraphics = undefined;
    this.bossStoryShown.clear();
    this.streak.reset();
    this.dashHitIds.clear();
    this.hudSignature = '';
    this.activeBoss = undefined;
    this.bossBar = undefined;
    this.bossLabel = undefined;

    this.biome = biomeForWave(1);
    const arena = buildArena(TILE, undefined, this.biome);

    this.groundLayer = this.createLayer(arena.ground, DEPTH.GROUND);
    this.obstacles = this.createLayer(arena.objects, DEPTH.OBJECTS);
    this.obstacles.setCollisionByExclusion([EMPTY]);
    this.applyBiomeTint(this.biome);
    this.cameras.main.setBackgroundColor(this.biome.backgroundColor);

    this.physics.world.setBounds(0, 0, arena.widthInPixels, arena.heightInPixels);

    createParticleTexture(this);
    createFxAnimations(this);
    this.createProjectileAnimations();
    Player.createAnimations(this);
    Enemy.createAnimations(this);

    this.combat = new CombatSystem(this);
    this.upgradePanel = new UpgradePanel(this);

    this.player = new Player(this, arena.spawn.x, arena.spawn.y, this.classId);
    this.player.setDepth(DEPTH.PLAYER);
    this.physics.add.collider(this.player, this.obstacles);
    this.player.on(PLAYER_ATTACK_EVENT, this.onPlayerAttack, this);
    this.player.once(PLAYER_DIED_EVENT, this.onPlayerDied, this);

    this.enemyGroup = this.physics.add.group({ runChildUpdate: false });
    this.physics.add.collider(this.enemyGroup, this.obstacles);
    this.physics.add.collider(this.enemyGroup, this.enemyGroup);
    this.physics.add.overlap(this.player, this.enemyGroup, this.onPlayerTouchedEnemy, undefined, this);

    // Panah pemain (hanya dipakai kelas jarak jauh).
    this.arrows = this.physics.add.group();
    this.physics.add.collider(this.arrows, this.obstacles, (arrow) => {
      (arrow as Phaser.GameObjects.GameObject).destroy();
    });

    this.dialogue = new DialogueBox(this, this.player.playerClass.texture, SHEETS.BOSS_CORE.key);
    this.damageNumbers = new DamageNumbers(this);

    this.bossAttacks = new BossAttacks(this);
    // Proyektil boss hancur kena tembok, dan menyakiti pemain kalau kena.
    this.physics.add.collider(this.bossAttacks.bolts, this.obstacles, (bolt) => {
      (bolt as Phaser.GameObjects.GameObject).destroy();
    });
    this.physics.add.overlap(this.player, this.bossAttacks.bolts, this.onPlayerHitByBolt, undefined, this);

    const camera = this.cameras.main;
    camera.setBounds(0, 0, arena.widthInPixels, arena.heightInPixels);
    camera.startFollow(this.player, true, CAMERA.LERP, CAMERA.LERP);
    camera.setRoundPixels(true);

    this.createDebugOverlay();
    this.setupRestart();

    // Dibuat terakhir: konstruktornya langsung memulai wave 1 dan memanggil onWaveStart.
    this.waves = new WaveManager(
      { width: arena.widthInPixels, height: arena.heightInPixels },
      {
        createEnemy: (type, x, y) => this.createEnemy(type, x, y),
        onSpawn: (enemy) => {
          if (!(enemy instanceof Boss)) enemy.setDepth(DEPTH.ENEMY);
          this.enemyGroup.add(enemy);
          this.invalidateAliveCache();
        },
        onWaveStart: (wave) => this.onWaveStart(wave),
        onWaveCleared: (wave) => this.onWaveCleared(wave),
        onAllWavesCleared: () => this.onVictory(),
      }
    );
  }

  /** Animasi untuk proyektil yang bergerak (mis. bola api berkedip). */
  private createProjectileAnimations(): void {
    const sheet = SHEETS.PLAYER_FIREBALL;
    const key = projectileAnimKey(sheet.key);
    if (this.anims.exists(key)) return;
    this.anims.create({
      key,
      frames: this.anims.generateFrameNumbers(sheet.key, { start: 0, end: sheet.frames - 1 }),
      frameRate: 14,
      repeat: -1,
    });
  }

  /** Membuat Enemy biasa atau Boss, lengkap dengan konteks serangannya. */
  private createEnemy(type: EnemyType, x: number, y: number): Enemy {
    if (!isBossType(type)) {
      const enemy = new Enemy(this, x, y, type);
      // Musuh penembak memakai jalur proyektil yang sama dengan boss: tabrakan
      // tembok, kedaluwarsa, dan damage ke pemain sudah ditangani di sana.
      if (type.behavior === 'shooter') {
        enemy.onShoot = (bx, by, angle, speed, damage) =>
          this.bossAttacks.fireBolt(bx, by, angle, speed, damage);
      }
      return enemy;
    }

    const context: BossContext = {
      fireBolt: (bx, by, angle, speed, damage) =>
        this.bossAttacks.fireBolt(bx, by, angle, speed, damage),
      fireBeam: (bx, by, angle, damage) => this.bossAttacks.fireBeam(bx, by, angle, damage),
      summon: (typeId, sx, sy) => {
        const summonType = SPAWNABLE_BY_ID.get(typeId);
        if (!summonType) return;
        const minion = new Enemy(this, sx, sy, summonType);
        minion.setDepth(DEPTH.ENEMY);
        this.enemyGroup.add(minion);
        this.invalidateAliveCache();
      },
    };

    const boss = new Boss(this, x, y, type, context);
    this.activeBoss = boss;
    this.createBossBar(type.bossName);
    return boss;
  }

  private createBossBar(name: string): void {
    this.bossBar?.destroy();
    this.bossLabel?.destroy();
    this.bossBar = this.add.graphics().setScrollFactor(0).setDepth(DEPTH.HUD);
    this.bossLabel = this.add
      .text(this.scale.width / 2, this.scale.height - BOSS_BAR.LABEL_MARGIN, name, {
        fontFamily: FONT_FAMILY,
        fontSize: '8px',
        color: '#ff8a7a',
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.HUD);
  }

  private destroyBossBar(): void {
    this.bossBar?.destroy();
    this.bossLabel?.destroy();
    this.bossBar = undefined;
    this.bossLabel = undefined;
    this.activeBoss = undefined;
  }

  /** Menggambar bar HP boss di bagian atas layar. */
  private updateBossBar(): void {
    if (!this.bossBar) return;

    if (!this.activeBoss || !this.activeBoss.isAlive) {
      this.destroyBossBar();
      return;
    }

    const width = 180;
    const height = 5;
    const x = (this.scale.width - width) / 2;
    const y = this.scale.height - BOSS_BAR.BOTTOM_MARGIN;
    const ratio = this.activeBoss.healthRatio;

    this.bossBar.clear();
    this.bossBar.fillStyle(0x0d0b14, 0.85).fillRect(x - 1, y - 1, width + 2, height + 2);
    this.bossBar.fillStyle(0x4a4458, 1).fillRect(x, y, width, height);
    this.bossBar
      .fillStyle(this.activeBoss.currentPhase === 2 ? 0xff6b6b : 0xffe066, 1)
      .fillRect(x, y, width * ratio, height);
  }

  private readonly onPlayerHitByBolt: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (
    _playerObject,
    boltObject
  ) => {
    if (this.state !== 'playing') return;
    const bolt = boltObject as Phaser.Physics.Arcade.Sprite;
    const damage = (bolt.getData('damage') as number) ?? 0;
    const hit = this.player.takeDamage(damage, bolt.x, bolt.y);
    bolt.destroy();
    if (hit) {
      this.damageNumbers.show(this.player.x, this.player.y, damage, 'hurt');
      this.breakKillStreak();
      this.cameras.main.shake(120, 0.005);
    }
  };

  /**
   * Daftar musuh hidup, di-cache per frame.
   *
   * Getter ini dipanggil beberapa kali tiap frame (terukur 1,23x/frame) dan tiap
   * panggilan dulu membuat array baru — 1614 alokasi dalam 1308 frame. Cache
   * dibatalkan tiap frame lewat `invalidateAliveCache()`, dan juga setiap kali
   * musuh ditambah/dibunuh di tengah frame.
   */
  private get aliveEnemies(): Enemy[] {
    if (this.aliveCache) return this.aliveCache;
    this.aliveCache = this.enemyGroup.getChildren().filter((child): child is Enemy => {
      return child instanceof Enemy && child.isAlive;
    });
    return this.aliveCache;
  }

  private invalidateAliveCache(): void {
    this.aliveCache = undefined;
  }

  /**
   * Upgrade "Dash Tajam": musuh yang dilewati saat dash ikut terluka.
   * Tiap musuh hanya boleh kena sekali per dash — tanpa itu satu dash yang
   * melewati musuh akan memukulnya sekali per frame.
   */
  private applyDashDamage(): void {
    const damage = this.player.stats.dashDamage;
    if (damage <= 0 || !this.player.isDashing) {
      if (!this.player.isDashing) this.dashHitIds.clear();
      return;
    }

    for (const enemy of this.aliveEnemies) {
      if (this.dashHitIds.has(enemy)) continue;
      const jarak = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
      if (jarak > UPGRADE_FX.DASH_HIT_RADIUS) continue;

      this.dashHitIds.add(enemy);
      const away = new Phaser.Math.Vector2(enemy.x - this.player.x, enemy.y - this.player.y);
      if (away.lengthSq() < 1) away.set(1, 0);
      away.normalize().scale(220);

      this.damageNumbers.show(enemy.x, enemy.y, damage, 'crit');
      if (enemy.takeDamage(damage, away.x, away.y)) this.registerKill(enemy);
    }
  }

  /** Upgrade "Ledakan Akhir": musuh yang mati melukai tetangganya. */
  private applyDeathBlast(x: number, y: number, korban: Enemy): void {
    const damage = this.player.stats.deathBlastDamage;
    if (damage <= 0) return;

    playFx(this, SHEETS.FX_ENEMY_DEATH.key, x, y, { scale: 1.1 });
    for (const enemy of this.aliveEnemies) {
      if (enemy === korban) continue;
      const jarak = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);
      if (jarak > UPGRADE_FX.DEATH_BLAST_RADIUS) continue;

      const away = new Phaser.Math.Vector2(enemy.x - x, enemy.y - y);
      if (away.lengthSq() < 1) away.set(1, 0);
      away.normalize().scale(160);

      this.damageNumbers.show(enemy.x, enemy.y, damage, 'hit');
      if (enemy.takeDamage(damage, away.x, away.y)) this.registerKill(enemy);
    }
  }

  /**
   * Satu-satunya tempat skor bertambah dari membunuh. Semua jalur serangan
   * (melee, panah, skill) lewat sini supaya pengali tidak pernah terlewat.
   */
  private registerKill(enemy: Enemy): void {
    const pengali = this.streak.registerKill(this.time.now);
    this.kills++;
    this.score += enemy.config.score * pengali;
    this.invalidateAliveCache();

    // Dipanggil setelah cache dibatalkan supaya ledakan melihat daftar terbaru.
    this.applyDeathBlast(enemy.x, enemy.y, enemy);
  }

  /** Rantai turun satu tingkat saat pemain kena. */
  private breakKillStreak(): void {
    this.streak.onPlayerHit();
  }

  private onWaveStart(wave: Wave): void {
    // Peta diganti SEBELUM banner dan sebelum musuh keluar, supaya pemain melihat
    // tempat barunya bersamaan dengan nama wave-nya.
    // Wave 1 dilewati: `create()` sudah membangun arena untuk biome-nya.
    if (wave.number > 1) this.rebuildArenaForWave(wave.number);

    // Dipanggil dari konstruktor WaveManager, jadi `this.waves` belum ter-assign.
    // Pakai WAVES.length langsung, jangan `this.waves`.
    showWaveBanner(
      this,
      wave.number,
      WAVES.length,
      `${wave.label} — ${this.biome.name}`,
      WAVE_TIMING.INTRO_MS,
      wave.isBossWave === true
    );
    audio.play(wave.isBossWave ? 'bossSpawn' : 'waveStart');
    this.breakKillStreak();

    // Cerita boss diputar sekali di awal wave-nya, sebelum musuh keluar.
    const beat = STORY_BOSS[wave.number];
    if (wave.isBossWave && beat && !this.bossStoryShown.has(wave.number)) {
      // Wajah di kotak dialog diambil dari boss wave ini, bukan konstanta —
      // tiap wave boss memakai sprite yang berbeda.
      const bossType = wave.entries
        .map((entry) => SPAWNABLE_BY_ID.get(entry.typeId))
        .find((type): type is BossType => type !== undefined && isBossType(type));
      if (bossType) this.dialogue.setBoss(bossType.texture, bossType.portraitScale);

      this.bossStoryShown.add(wave.number);
      this.state = 'dialog';
      this.physics.world.pause();
      this.dialogue.play(beat, () => {
        this.state = 'playing';
        this.physics.world.resume();
      });
    }
  }

  private onWaveCleared(wave: Wave): void {
    this.score += waveClearBonus(wave.number);
    audio.play('waveClear');

    // Setelah wave terakhir tidak ada gunanya menawarkan upgrade — langsung menang.
    if (wave.number >= WAVES.length) {
      this.waves.advanceToNextWave();
      return;
    }

    // Jeda pendek sebelum panel upgrade, supaya kill terakhir sempat terlihat.
    this.upgradeDelayTimer = WAVE_TIMING.CLEAR_DELAY_MS;
  }

  private openUpgradePanel(): void {
    this.state = 'upgrade';
    this.upgradePanel.open(this.takenUpgrades, (upgrade) => this.onUpgradePicked(upgrade));
  }

  private onUpgradePicked(upgrade: Upgrade): void {
    audio.play('upgrade');
    this.player.applyUpgrade(upgrade);
    this.takenUpgrades.set(upgrade.id, (this.takenUpgrades.get(upgrade.id) ?? 0) + 1);
    this.state = 'playing';
    this.waves.advanceToNextWave();
  }

  private onPlayerAttack(payload: PlayerAttackPayload): void {
    if (this.state !== 'playing') return;
    const { step, x, y, facing, skillId } = payload;

    const dirX = facing === 'right' ? 1 : facing === 'left' ? -1 : 0;
    const dirY = facing === 'down' ? 1 : facing === 'up' ? -1 : 0;

    const kelasFx = !skillId ? this.player.playerClass.attackFx?.[payload.comboIndex ?? 0] : undefined;
    const volley = payload.skill?.kind === 'volley';
    const melee = !volley && (!payload.ranged || skillId !== undefined);

    if (kelasFx) {
      // FX serangan dasar milik kelas. Untuk kelas jarak jauh ini adalah kilatan
      // merapal yang tampil berbarengan dengan proyektilnya, bukan penggantinya.
      playFx(this, kelasFx.key, x + dirX * kelasFx.offset, y + dirY * kelasFx.offset, {
        scale: kelasFx.scale,
        angle: kelasFx.rotates ? FX_ANGLE[facing] : 0,
        flipX: kelasFx.rotates && facing === 'left',
      });
    } else if (!melee) {
      // Kelas jarak jauh tanpa `attackFx`: visualnya adalah proyektil itu sendiri.
    } else if (skillId === 'shock' && step.shape.type === 'rect') {
      // Sprite petir menyembur vertikal dari satu titik, bukan sinar mendatar.
      // Jadi FX-nya ditaruh beberapa kali di sepanjang garis serangan.
      const span = step.shape.width;
      for (const t of SHOCK_FX_STEPS) {
        const distance = (t - 0.5) * span + step.shape.reach;
        playFx(this, step.fxKey, x + dirX * distance, y + dirY * distance, {
          scale: step.fxScale,
        });
      }
    } else {
      playFx(this, step.fxKey, x + dirX * step.fxOffset, y + dirY * step.fxOffset, {
        scale: step.fxScale,
        angle: FX_ANGLE[facing],
        flipX: facing === 'left',
      });
    }

    if (skillId) audio.play('upgrade');

    // Skill bertipe `volley` menembakkan panah, bukan mengayun hitbox.
    if (payload.skill && payload.skill.kind === 'volley') {
      this.fireVolley(payload, payload.skill.volley);
      return;
    }

    // Serangan dasar kelas jarak jauh juga menembak panah.
    if (payload.ranged && !skillId) {
      this.fireArrows(payload);
      return;
    }

    const targets = this.aliveEnemies;
    const hpSebelum = new Map(targets.map((e) => [e, e.currentHp]));
    const result = this.combat.resolveAttack(step, { x, y, facing }, targets, {
      // Pengali kelas dipilih menurut jenis serangan: skill memakai
      // `skillDamageMultiplier`, pukulan biasa memakai `damageMultiplier`.
      damageMultiplier:
        this.player.stats.damageMultiplier *
        (skillId
          ? this.player.playerClass.skillDamageMultiplier
          : this.player.playerClass.damageMultiplier),
      rangeMultiplier: this.player.stats.rangeMultiplier,
    });

    // Musuh yang mati sudah destroy() sendiri; hitung selisihnya untuk skor.
    for (const enemy of targets) {
      const sebelum = hpSebelum.get(enemy) ?? 0;
      const masuk = sebelum - enemy.currentHp;
      if (masuk > 0) {
        this.damageNumbers.show(enemy.x, enemy.y, masuk, skillId ? 'crit' : 'hit');
      }
      if (!enemy.isAlive) this.registerKill(enemy);
    }

    if (this.player.stats.lifesteal > 0 && result.damageDealt > 0) {
      this.player.heal(result.damageDealt * this.player.stats.lifesteal);
    }
  }

  /** Sudut dasar tembakan menurut arah hadap. */
  private static facingAngle(facing: Facing): number {
    return facing === 'right'
      ? 0
      : facing === 'left'
        ? Math.PI
        : facing === 'down'
          ? Math.PI / 2
          : -Math.PI / 2;
  }

  /** Skill `volley`: menembakkan sejumlah panah sekaligus. */
  private fireVolley(payload: PlayerAttackPayload, config: VolleyConfig): void {
    const dasar = GameScene.facingAngle(payload.facing);
    const damage = config.damage * this.player.stats.damageMultiplier;

    for (let i = 0; i < config.count; i++) {
      const offset = config.count === 1 ? 0 : (i / (config.count - 1) - 0.5) * config.spread;
      const proyektil = this.player.playerClass.projectile;
      if (!proyektil) return;
      this.spawnProjectile(payload.x, payload.y, dasar + offset, proyektil, {
        speed: config.speed,
        range: config.range,
        damage,
        pierce: config.pierce,
        stunMs: config.stunMs,
      });
    }
    audio.play('upgrade');
  }

  /**
   * Membuat satu proyektil pemain. Dipakai serangan dasar kelas jarak jauh
   * (panah Archer, bola api Mage) maupun skill `volley`.
   */
  private spawnProjectile(
    x: number,
    y: number,
    sudut: number,
    sumber: ProjectileConfig,
    opsi: { speed: number; range: number; damage: number; pierce: boolean; stunMs?: number }
  ): void {
    const sheet = SHEET_BY_KEY.get(sumber.texture);
    if (!sheet) return;

    const peluru = this.arrows.create(x, y, sumber.texture) as Phaser.Physics.Arcade.Sprite;
    peluru.setDepth(DEPTH.PLAYER - 1);
    peluru.setRotation(sudut);
    peluru.setScale(sumber.scale);
    peluru.setData('damage', opsi.damage);
    peluru.setData('pierce', opsi.pierce);
    peluru.setData('stunMs', opsi.stunMs ?? 0);
    peluru.setData('hitIds', new Set<Enemy>());
    peluru.setData('expiresAt', this.time.now + (opsi.range / opsi.speed) * 1000);

    if (sumber.animated) peluru.play(projectileAnimKey(sumber.texture));

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

  /** Serangan dasar kelas jarak jauh. */
  private fireArrows(payload: PlayerAttackPayload): void {
    const { step, x, y, facing } = payload;
    const config = this.player.playerClass;
    const proyektil = config.projectile;
    if (!proyektil) return;

    const jumlah = payload.projectileCount ?? 1;
    const dasar = GameScene.facingAngle(facing);
    const sebar = 0.22;
    const damage =
      step.damage * this.player.stats.damageMultiplier * config.damageMultiplier;

    for (let i = 0; i < jumlah; i++) {
      const sudut = dasar + (i - (jumlah - 1) / 2) * sebar;
      this.spawnProjectile(x, y, sudut, proyektil, {
        speed: proyektil.speed,
        range: proyektil.range,
        damage,
        pierce: false,
      });
    }
    audio.play('swing');
  }


  /**
   * Gerak, kedaluwarsa, dan tumbukan panah — semuanya dihitung manual di sini.
   *
   * Deteksi kena TIDAK memakai `physics.add.overlap`. Pendekatan itu sempat dipakai
   * dan gagal secara diam-diam: panahnya hancur tapi damage tidak pernah masuk,
   * dan penyebabnya sulit dipastikan. Perhitungan jarak manual seperti beam boss
   * jauh lebih mudah dibuktikan benar, dan biayanya sepele untuk belasan panah.
   */
  private updateArrows(): void {
    const now = this.time.now;
    const musuh = this.aliveEnemies;

    for (const child of this.arrows.getChildren()) {
      const arrow = child as Phaser.Physics.Arcade.Sprite;
      if (!arrow.active) continue;

      if (now >= (arrow.getData('expiresAt') as number)) {
        arrow.destroy();
        continue;
      }

      for (const target of musuh) {
        const body = target.body as Phaser.Physics.Arcade.Body | null;
        if (!body) continue;

        // Kotak musuh dilebarkan sedikit oleh radius panah.
        const jangkauanX = body.width / 2 + ARROW_RADIUS;
        const jangkauanY = body.height / 2 + ARROW_RADIUS;
        if (
          Math.abs(arrow.x - (body.x + body.width / 2)) > jangkauanX ||
          Math.abs(arrow.y - (body.y + body.height / 2)) > jangkauanY
        ) {
          continue;
        }

        // Panah menembus hanya boleh mengenai tiap musuh sekali.
        const sudahKena = arrow.getData('hitIds') as Set<Enemy>;
        if (sudahKena.has(target)) continue;
        sudahKena.add(target);

        const damage = (arrow.getData('damage') as number) ?? 0;
        const stunMs = (arrow.getData('stunMs') as number) ?? 0;
        const away = new Phaser.Math.Vector2(target.x - arrow.x, target.y - arrow.y);
        if (away.lengthSq() < 1) away.set(1, 0);
        away.normalize().scale(ARROW_KNOCKBACK);

        this.damageNumbers.show(target.x, target.y, damage, 'hit');
        const killed = target.takeDamage(damage, away.x, away.y);
        if (killed) {
          this.registerKill(target);
        } else if (stunMs > 0) {
          target.applyStun(stunMs);
        }

        if (!(arrow.getData('pierce') as boolean)) {
          arrow.destroy();
          break;
        }
      }
    }
  }

  private readonly onPlayerTouchedEnemy: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (
    _playerObject,
    enemyObject
  ) => {
    if (this.state !== 'playing') return;
    if (!(enemyObject instanceof Enemy) || !enemyObject.isAlive) return;

    const hit = this.player.takeDamage(
      enemyObject.config.contactDamage,
      enemyObject.x,
      enemyObject.y
    );
    if (hit) {
      this.damageNumbers.show(this.player.x, this.player.y, enemyObject.config.contactDamage, 'hurt');

      // Upgrade "Duri": penabrak ikut menerima sebagian damage kontaknya.
      const thorns = this.player.stats.thorns;
      if (thorns > 0) {
        const pantulan = enemyObject.config.contactDamage * thorns;
        this.damageNumbers.show(enemyObject.x, enemyObject.y, pantulan, 'hit');
        if (enemyObject.takeDamage(pantulan, 0, 0)) this.registerKill(enemyObject);
      }
      this.breakKillStreak();
      this.cameras.main.shake(140, 0.006);
      // Sengaja TIDAK pakai camera.flash(): efek itu beranjak dari alpha 1, jadi
      // seluruh layar tersapu merah pekat dan bikin silau. Tint singkat pada sprite
      // pemain menyampaikan hal yang sama tanpa menutupi arena.
      this.player.setTint(0xff6b6b);
      this.time.delayedCall(140, () => {
        if (this.player.active) this.player.clearTint();
      });
    }
  };

  /** Menghentikan semua gerak. Dipakai saat kalah maupun menang. */
  private freezeEverything(): void {
    this.bossAttacks.clear();
    this.destroyBossBar();

    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    playerBody.setVelocity(0, 0);
    playerBody.setAcceleration(0, 0);
    playerBody.moves = false;

    for (const enemy of this.aliveEnemies) {
      const body = enemy.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(0, 0);
      body.moves = false;
    }
  }

  private onPlayerDied(): void {
    if (this.state === 'gameover' || this.state === 'victory') return;
    this.state = 'gameover';
    this.upgradePanel.close();
    this.freezeEverything();
    audio.play('gameOver');
    this.showEndPanel('KALAH', '#ff8a7a');
  }

  private onVictory(): void {
    this.state = 'victory';
    this.upgradePanel.close();
    this.freezeEverything();
    audio.play('victory');
    // Cerita penutup dulu, baru layar skor.
    this.dialogue.play(STORY_VICTORY, () => {
      this.showEndPanel('SEMUA WAVE SELESAI', '#8fd35d');
    });
  }

  private showEndPanel(title: string, color: string): void {
    const panel = createPanel(this, 300, 100);
    const cx = this.scale.width / 2;
    const top = this.scale.height / 2 - 46;

    addText(this, panel, cx, top + 16, title, { size: 10, color });
    addText(
      this,
      panel,
      cx,
      top + 46,
      [
        `wave tercapai : ${this.waves.waveNumber} / ${this.waves.totalWaves}`,
        `bug dibasmi   : ${this.kills}`,
        `rantai terbaik : x${this.streak.best}`,
        `waktu         : ${(this.elapsedMs / 1000).toFixed(1)} detik`,
        `SKOR          : ${this.score}`,
      ].join('\n'),
      { size: 7, color: '#e8e4f0' }
    );
    addText(this, panel, cx, top + 84, 'tekan R untuk ulang', { size: 7, color: '#ffe066' });
  }

  private setupRestart(): void {
    this.input.keyboard?.on('keydown-R', () => {
      if (this.state === 'gameover' || this.state === 'victory') this.scene.restart();
    });
    this.input.keyboard?.on('keydown-ESC', () => this.togglePause());
    this.input.keyboard?.on('keydown-M', () => {
      const muted = audio.toggleMute();
      if (!muted) audio.play('select');
    });
  }

  /** Jeda hanya boleh dari/ke kondisi bermain — bukan saat memilih upgrade atau sudah berakhir. */
  private togglePause(): void {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.physics.world.pause();
      const panel = createPanel(this, 190, 44);
      addText(this, panel, this.scale.width / 2, this.scale.height / 2 - 6, 'JEDA', {
        size: 12,
        color: '#ffe066',
      });
      addText(this, panel, this.scale.width / 2, this.scale.height / 2 + 10, 'ESC untuk lanjut', {
        size: 7,
        color: '#c9c4d8',
      });
      this.pausePanel = panel;
      return;
    }

    if (this.state === 'paused') {
      this.state = 'playing';
      this.physics.world.resume();
      this.pausePanel?.destroy();
      this.pausePanel = undefined;
    }
  }

  /** Membuat satu layer tilemap dari array index 2 dimensi. */
  private createLayer(data: number[][], depth: number): Phaser.Tilemaps.TilemapLayer {
    const map = this.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
    const tileset = map.addTilesetImage(TILESET_TEXTURE);
    if (!tileset) {
      throw new Error(`Tileset "${TILESET_TEXTURE}" gagal dimuat.`);
    }
    const layer = map.createLayer(0, tileset, 0, 0);
    if (!layer) {
      throw new Error('Gagal membuat layer tilemap.');
    }
    return layer.setDepth(depth);
  }

  /**
   * Ganti peta untuk wave berikutnya.
   *
   * Tile **ditimpa di tempat** (`putTilesAt`), bukan dengan membuang layer lalu
   * membuat yang baru. Alasannya konkret: collider pemain, musuh, panah, dan
   * proyektil boss semuanya memegang referensi ke objek layer ini. Membuang
   * layer berarti keempatnya menunjuk ke layer mati dan tabrakan berhenti
   * bekerja tanpa error apa pun — persis jenis kegagalan diam-diam yang paling
   * mahal dilacak.
   *
   * Layout ikut diacak ulang, bukan cuma warnanya: tiap wave dapat seed baru.
   */
  private rebuildArenaForWave(waveNumber: number): void {
    const biome = biomeForWave(waveNumber);
    const arena = buildArena(TILE, undefined, biome);
    this.biome = biome;

    this.groundLayer.putTilesAt(arena.ground, 0, 0, false);
    this.obstacles.putTilesAt(arena.objects, 0, 0, false);
    // Wajib diulang: biome baru memakai index tile yang berbeda, dan flag
    // tabrakan dipasang per-index.
    this.obstacles.setCollisionByExclusion([EMPTY]);

    this.applyBiomeTint(biome);
    this.cameras.main.setBackgroundColor(biome.backgroundColor);

    // Pemain bisa saja sedang berdiri di petak yang barusan berubah jadi batu.
    // Titik spawn dijamin bebas rintangan oleh ArenaBuilder.
    this.player.body?.reset(arena.spawn.x, arena.spawn.y);
    this.player.setVelocity(0, 0);

    // Proyektil yang masih melayang berasal dari peta lama.
    this.arrows.clear(true, true);
    this.bossAttacks.clear();
  }

  /**
   * Tint dipasang **per tile**, bukan lewat `layer.setTint()`.
   * `Phaser.Tilemaps.TilemapLayer` tidak memakai komponen Tint sama sekali —
   * memanggil `setTint()` di sana akan langsung meledak. `Tile.tint` ada dan
   * memang dibaca renderer.
   */
  private applyBiomeTint(biome: Biome): void {
    for (const layer of [this.groundLayer, this.obstacles]) {
      layer.forEachTile((tile) => {
        tile.tint = biome.tint;
      });
    }
  }

  /** Overlay bantu development — dihapus di M6. */
  private createDebugOverlay(): void {
    this.hudBar = this.add.graphics().setScrollFactor(0).setDepth(DEPTH.HUD);
    this.hudText = this.add
      .text(4, 14, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '8px',
        color: '#c9c4d8',
      })
      .setScrollFactor(0)
      .setDepth(DEPTH.HUD);

    const tileDebug = this.add.graphics().setDepth(DEPTH.DEBUG).setVisible(false);
    this.obstacles.renderDebug(tileDebug, {
      tileColor: null,
      collidingTileColor: new Phaser.Display.Color(255, 90, 140, 60),
      faceColor: new Phaser.Display.Color(255, 255, 255, 120),
    });

    this.input.keyboard?.on('keydown-F1', () => {
      const show = !tileDebug.visible;
      tileDebug.setVisible(show);

      if (show && !this.physics.world.debugGraphic) {
        this.physics.world.createDebugGraphic();
      }
      this.physics.world.drawDebug = show;
      const graphic = this.physics.world.debugGraphic;
      if (graphic) {
        graphic.setVisible(show);
        if (!show) graphic.clear();
      }

      if (show && !this.debugGraphics) {
        this.debugGraphics = this.add.graphics().setDepth(DEPTH.DEBUG);
      }
      this.debugGraphics?.setVisible(show);
      if (!show) this.debugGraphics?.clear();
    });
  }

  private drawAttackHitbox(): void {
    const graphics = this.debugGraphics;
    if (!graphics || !graphics.visible) return;

    graphics.clear();
    const step = this.player.peekNextStep();
    const shape = this.combat.debugShape(
      step,
      { x: this.player.x, y: this.player.y, facing: this.player.getFacing() },
      this.player.stats.rangeMultiplier
    );

    graphics.lineStyle(1, 0xffe066, 0.9);
    if (shape instanceof Phaser.Geom.Circle) {
      graphics.strokeCircle(shape.x, shape.y, shape.radius);
    } else {
      graphics.strokeRect(shape.x, shape.y, shape.width, shape.height);
    }
  }

  private updateHud(aliveCount: number): void {
    const ratio = this.player.healthRatio;
    const width = 92;
    const height = 6;

    this.hudBar.clear();
    this.hudBar.fillStyle(0x0d0b14, 0.8).fillRect(3, 3, width + 2, height + 2);
    this.hudBar.fillStyle(0x4a4458, 1).fillRect(4, 4, width, height);
    // Merah saat kritis supaya terbaca tanpa harus membaca angka.
    this.hudBar
      .fillStyle(ratio <= 0.3 ? 0xff6b6b : 0x8fd35d, 1)
      .fillRect(4, 4, Math.max(0, width * ratio), height);

    // Bar digambar tiap frame (murah), tapi teksnya tidak.
    //
    // Sebelumnya string HUD dibangun ulang 1308 kali dalam 1308 frame padahal
    // isinya hanya berubah 13 kali — 99% terbuang, termasuk alokasi array dari
    // `getSkillStatus()`. Sekarang string hanya dirakit kalau tanda tangannya
    // berubah; pendinginan ditampilkan 1 desimal jadi tetap terasa hidup.
    const sisa = aliveCount + this.waves.remainingInQueue;
    const hp = Math.ceil(this.player.health);
    const dashMs = this.player.dashCooldownRemaining();
    const dashDetik = dashMs > 0 ? (dashMs / 1000).toFixed(1) : '';
    const skillStatus = this.player.getSkillStatus();
    const skillDetik = skillStatus
      .map(({ remainingMs }) => (remainingMs > 0 ? (remainingMs / 1000).toFixed(1) : ''))
      .join(',');

    const signature = `${hp}|${this.player.maxHealth}|${this.waves.waveNumber}|${sisa}|${this.score}|${this.streak.current}|${skillDetik}|${dashDetik}`;
    if (signature === this.hudSignature) return;
    this.hudSignature = signature;

    const skills = skillStatus
      .map(({ skill, hotkey, remainingMs }) =>
        remainingMs > 0
          ? `[${hotkey}]${(remainingMs / 1000).toFixed(1)}s`
          : `[${hotkey}]${skill.name}`
      )
      .join('  ');
    const dash = dashDetik ? `[SPC]${dashDetik}s` : '[SPC]Dash';
    const pengali = this.streak.current > 1 ? `  x${this.streak.current}` : '';

    this.hudText.setText(
      `${hp}/${this.player.maxHealth}   ` +
        `WAVE ${this.waves.waveNumber}/${this.waves.totalWaves}   ` +
        `sisa ${sisa}   skor ${this.score}${pengali}
${skills}  ${dash}`
    );
  }

  override update(_time: number, delta: number): void {
    // Satu-satunya tempat cache musuh dibatalkan secara rutin.
    this.invalidateAliveCache();

    if (this.state === 'dialog') {
      this.dialogue.update(delta);
      return;
    }
    if (this.state === 'paused') return;

    this.combat.update(delta);
    if (this.combat.isFrozen) return;

    const alive = this.aliveEnemies;

    if (this.state === 'playing') {
      this.elapsedMs += delta;
      this.player.update();

      const target = new Phaser.Math.Vector2(this.player.x, this.player.y);
      const now = this.time.now;
      const deltaSeconds = delta / 1000;
      for (const enemy of alive) enemy.tick(target, now, deltaSeconds);

      this.bossAttacks.update(delta, this.player);
      this.updateArrows();
      this.damageNumbers.update(delta);
      this.applyDashDamage();
      this.waves.update(delta, alive.length, this.cameras.main);

      // Panel upgrade dibuka setelah jeda pendek pasca wave bersih.
      if (this.upgradeDelayTimer > 0) {
        this.upgradeDelayTimer -= delta;
        if (this.upgradeDelayTimer <= 0) this.openUpgradePanel();
      }
    }

    if (this.dialogue.isOpen) this.dialogue.update(delta);

    this.drawAttackHitbox();
    this.updateBossBar();
    this.updateHud(alive.length);
  }
}
