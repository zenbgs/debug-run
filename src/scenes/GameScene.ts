import Phaser from 'phaser';
import { BIOMES, biomeForWave, type Biome } from '../data/biomes';
import { BOSS_ATTACK, isBossType, SPAWNABLE_BY_ID, type BossType } from '../data/bosses';
import { CAMERA, TILE } from '../data/config';
import { DEPTH } from '../data/depth';
import { ELITE } from '../data/elites';
import type { EnemyType } from '../data/enemies';
import { EMPTY } from '../data/tiles';
import { SHEETS } from '../data/frames';
import { SHOCK_FX_STEPS } from '../data/skills';
import { STORY_BOSS, STORY_VICTORY } from '../data/story';
import { UPGRADE_FX, type Upgrade } from '../data/upgrades';
import { WAVES, WAVE_TIMING, waveClearBonus, type Wave } from '../data/waves';
import { Boss, type BossContext } from '../entities/Boss';
import { Enemy } from '../entities/Enemy';
import {
  Player,
  PLAYER_ATTACK_EVENT,
  PLAYER_DASH_EVENT,
  PLAYER_WINDUP_EVENT,
  PLAYER_OVERCLOCK_EVENT,
  PLAYER_DIED_EVENT,
  type Facing,
  type PlayerAttackPayload,
} from '../entities/Player';
import { buildArena } from '../systems/ArenaBuilder';
import { audio } from '../systems/Audio';
import { BossAttacks } from '../systems/BossAttacks';
import { CameraFx } from '../systems/CameraFx';
import { CombatSystem } from '../systems/CombatSystem';
import { DamageNumbers } from '../systems/DamageNumbers';
import { commitRun, type RecordEntry } from '../systems/Records';
import { Hud } from '../systems/Hud';
import { PlayerProjectiles } from '../systems/PlayerProjectiles';
import { Pickups } from '../systems/Pickups';
import { Destructibles } from '../systems/Destructibles';
import { Telegraph } from '../systems/Telegraph';
import { DESTRUCTIBLE } from '../data/destructibles';
import { spawnHitSparks } from '../systems/Particles';
import type { PickupKind, PickupSpec } from '../data/pickups';
import { OverclockRunner } from '../systems/Overclock';
import { OverclockMeter } from '../systems/OverclockMeter';
import { OVERCLOCK } from '../data/overclock';
import { WeaponVisual } from '../systems/WeaponVisual';
import { ScoreStreak } from '../systems/ScoreStreak';
import { StoryStage } from '../systems/StoryStage';
import { DialogueBox } from '../systems/DialogueBox';
import { createFxAnimations, playFx } from '../systems/Fx';
import { createParticleTexture } from '../systems/Particles';
import { addRow, addTapZone, addText, createPanel, showWaveBanner } from '../systems/Ui';
import { TouchControls } from '../systems/TouchControls';
import { isTouchDevice } from '../systems/VirtualInput';
import { UpgradePanel } from '../systems/UpgradePanel';
import { WaveManager } from '../systems/WaveManager';
import { TILESET_TEXTURE } from './BootScene';

/**
 * Depth dasar panggung cerita.
 *
 * Di atas HUD (100) supaya bar HP dan bar boss tertutup selama cutscene, tapi di
 * bawah panel UI (`UI_DEPTH.PANEL` = 200) dan kotak dialog (300) supaya teks
 * ceritanya tetap terbaca di atasnya.
 */
const PANGGUNG_DEPTH = 150;

/** Rotasi FX slash mengikuti arah hadap. Sprite aslinya digambar menghadap kanan. */
const FX_ANGLE: Record<Facing, number> = {
  right: 0,
  left: 0,
  up: -90,
  down: 90,
};

type SceneState = 'playing' | 'upgrade' | 'paused' | 'dialog' | 'gameover' | 'victory';

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private combat!: CombatSystem;
  private waves!: WaveManager;
  private upgradePanel!: UpgradePanel;
  private enemyGroup!: Phaser.Physics.Arcade.Group;
  private bossAttacks!: BossAttacks;
  private activeBoss?: Boss;
  private obstacles!: Phaser.Tilemaps.TilemapLayer;
  private groundLayer!: Phaser.Tilemaps.TilemapLayer;
  /** Biome yang sedang tampil; dipakai banner wave dan HUD debug. */
  private biome: Biome = BIOMES[0];

  /** Stik + tombol layar; `undefined` di perangkat tanpa sentuh. */
  private touch?: TouchControls;

  private debugGraphics?: Phaser.GameObjects.Graphics;
  private hud!: Hud;
  private weapon!: WeaponVisual;
  private pickups!: Pickups;
  private destructibles!: Destructibles;
  private telegraph!: Telegraph;
  private overclock = new OverclockMeter();
  private ultimate!: OverclockRunner;
  private cameraFx!: CameraFx;
  /** Panggung cerita saat cutscene; `undefined` selama bermain. */
  private panggung?: StoryStage;
  /** Banner wave yang sedang tampil, supaya bisa dibuang saat run berakhir. */
  private waveBanner?: { destroy: () => void };
  private pausePanel?: { destroy: () => void };

  private state: SceneState = 'playing';
  private kills = 0;
  private score = 0;
  private elapsedMs = 0;
  /** Berapa kali tiap upgrade sudah diambil, untuk menghormati batas stack. */
  private takenUpgrades = new Map<string, number>();
  private upgradeDelayTimer = 0;
  private classId?: string;
  private projectiles!: PlayerProjectiles;
  private dialogue!: DialogueBox;
  private damageNumbers!: DamageNumbers;
  /** Wave boss yang ceritanya sudah diputar, supaya tidak berulang. */
  private readonly bossStoryShown = new Set<number>();
  /** Lihat getter `aliveEnemies`. */
  private aliveCache?: Enemy[];
  /** Rantai bunuh beruntun; logikanya murni dan diuji terpisah. */
  private readonly streak = new ScoreStreak();
  /** Musuh yang sudah terkena dash ini; dikosongkan saat dash selesai. */
  private readonly dashHitIds = new Set<Enemy>();

  /** Rekor hanya boleh dicatat sekali per run. */
  private runTercatat = false;
  /** Rekor kelas ini SEBELUM run berjalan, untuk dibandingkan di layar akhir. */
  private rekorSebelumnya?: RecordEntry;
  private pecahRekor = false;

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
    this.activeBoss = undefined;
    this.runTercatat = false;
    this.panggung = undefined;
    this.rekorSebelumnya = undefined;
    this.pecahRekor = false;

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
    PlayerProjectiles.createAnimations(this);
    Player.createAnimations(this);
    Enemy.createAnimations(this);

    this.combat = new CombatSystem(this);
    this.upgradePanel = new UpgradePanel(this);

    this.player = new Player(this, arena.spawn.x, arena.spawn.y, this.classId);
    this.player.setDepth(DEPTH.PLAYER);
    this.physics.add.collider(this.player, this.obstacles);
    this.player.on(PLAYER_ATTACK_EVENT, this.onPlayerAttack, this);
    this.player.on(PLAYER_DASH_EVENT, () => this.cameraFx.onDash());

    // Senjata di tangan. Dibuat SETELAH pemain karena ia membaca kelasnya, dan
    // mengayun dari event windup — bukan dari event serangan, yang baru menyala
    // setelah ancang-ancang habis dan terlambat untuk mengangkat senjata.
    this.weapon = new WeaponVisual(this, this.player);
    this.player.on(PLAYER_WINDUP_EVENT, (p: { windupMs: number }) => this.weapon.swing(p.windupMs));
    this.player.once(PLAYER_DIED_EVENT, this.onPlayerDied, this);

    this.enemyGroup = this.physics.add.group({ runChildUpdate: false });
    this.physics.add.collider(this.enemyGroup, this.obstacles);
    this.physics.add.collider(this.enemyGroup, this.enemyGroup);
    this.physics.add.overlap(
      this.player,
      this.enemyGroup,
      this.onPlayerTouchedEnemy,
      undefined,
      this
    );

    // Proyektil pemain (hanya dipakai kelas jarak jauh).
    this.projectiles = new PlayerProjectiles(this, {
      aliveEnemies: () => this.aliveEnemies,
      onHit: (enemy, damage) => this.damageNumbers.show(enemy.x, enemy.y, damage, 'hit'),
      onKill: (enemy) => this.registerKill(enemy),
    });
    this.physics.add.collider(this.projectiles.group, this.obstacles, (peluru) => {
      const p = peluru as Phaser.Physics.Arcade.Sprite;
      this.destructibles.damageAt(
        p.x,
        p.y,
        10,
        ((p.getData('damage') as number) ?? 0) * DESTRUCTIBLE.ATTACK_RATIO
      );
      p.destroy();
    });

    // Rintangan interior yang bisa dipecahkan. Dibuat setelah `obstacles` ada,
    // karena ia mengubah tile di layer itu langsung.
    this.telegraph = new Telegraph(this);

    this.destructibles = new Destructibles(this, this.obstacles, {
      onBreak: (bx, by, peluang) => {
        if (Math.random() < peluang) this.pickups.rollDrop(bx, by, false);
      },
    });

    // Permata jatuhan dan Overclock. Keduanya satu lingkaran: bunuh -> permata
    // biru -> meter terisi -> pamungkas -> bunuh lebih banyak.
    this.pickups = new Pickups(this, {
      playerPosition: () => ({ x: this.player.x, y: this.player.y }),
      onCollect: (kind, spec, x, y) => this.onPickup(kind, spec, x, y),
    });

    this.ultimate = new OverclockRunner(this, {
      aliveEnemies: () => this.aliveEnemies,
      onHit: (enemy, damage) => this.damageNumbers.show(enemy.x, enemy.y, damage, 'crit'),
      onKill: (enemy) => this.registerKill(enemy),
      onBurst: () => this.cameraFx.onBossSpawn(),
      bounds: () => this.cameras.main.worldView,
    });

    this.player.on(PLAYER_OVERCLOCK_EVENT, () => this.tryOverclock());

    this.dialogue = new DialogueBox(this, this.player.playerClass.texture, SHEETS.BOSS_CORE.key);
    this.damageNumbers = new DamageNumbers(this);

    this.bossAttacks = new BossAttacks(this);
    // Proyektil boss hancur kena tembok, dan menyakiti pemain kalau kena.
    this.physics.add.collider(this.bossAttacks.bolts, this.obstacles, (bolt) => {
      (bolt as Phaser.GameObjects.GameObject).destroy();
    });
    this.physics.add.overlap(
      this.player,
      this.bossAttacks.bolts,
      this.onPlayerHitByBolt,
      undefined,
      this
    );

    const camera = this.cameras.main;
    camera.setBounds(0, 0, arena.widthInPixels, arena.heightInPixels);
    camera.startFollow(this.player, true, CAMERA.LERP, CAMERA.LERP);
    camera.setRoundPixels(true);

    this.hud = new Hud(this);
    this.cameraFx = new CameraFx(this);
    this.createDebugOverlay();
    this.setupRestart();

    // Kontrol sentuh dibuat SETELAH HUD supaya depth-nya di atas, dan hanya di
    // perangkat yang memang punya layar sentuh — di desktop ia tidak ada sama
    // sekali, bukan sekadar disembunyikan.
    if (isTouchDevice()) {
      this.touch = new TouchControls(this, () => this.togglePause());
      this.player.setVirtualInput(this.touch);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.touch?.destroy());
    }

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

  /** Membuat Enemy biasa atau Boss, lengkap dengan konteks serangannya. */
  /**
   * Apakah titik dunia ini rintangan padat?
   *
   * Dipakai musuh untuk MERABA ke depan saat mencari jalan memutar. Layernya
   * dibaca lewat `this.obstacles` yang sama dengan collider, jadi tidak mungkin
   * lepas sinkron — termasuk setelah arena dicat ulang antar wave.
   */
  private isObstacleAt(x: number, y: number): boolean {
    const tile = this.obstacles.getTileAtWorldXY(x, y);
    return tile !== null && tile.collides;
  }

  private createEnemy(type: EnemyType, x: number, y: number): Enemy {
    if (!isBossType(type)) {
      const enemy = new Enemy(this, x, y, type);
      enemy.setObstacleProbe((px, py) => this.isObstacleAt(px, py));
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
      // Musuh panggilan muncul DI DALAM layar, tepat di sebelah pemain. Tanpa
      // aba-aba ia terbaca seperti muncul dari ketiadaan; dengan retakan yang
      // berkedip dulu, pemain sempat menjauh. (Musuh wave biasa tidak butuh ini
      // — mereka di-spawn di LUAR kamera dan berjalan masuk.)
      summon: (typeId, sx, sy) => {
        const summonType = SPAWNABLE_BY_ID.get(typeId);
        if (!summonType) return;
        this.telegraph.rift(sx, sy, BOSS_ATTACK.SUMMON_TELEGRAPH_MS, (fx, fy) => {
          if (this.state !== 'playing') return;
          const minion = this.createEnemy(summonType, fx, fy);
          minion.setDepth(DEPTH.ENEMY);
          this.enemyGroup.add(minion);
          this.invalidateAliveCache();
        });
      },
      slam: (sx, sy) => {
        this.telegraph.circle(
          sx,
          sy,
          BOSS_ATTACK.SLAM_RADIUS,
          BOSS_ATTACK.SLAM_TELEGRAPH_MS,
          (fx, fy) => this.ledakanTanah(fx, fy)
        );
      },
    };

    const boss = new Boss(this, x, y, type, context);
    this.activeBoss = boss;
    this.hud.showBoss(type.bossName);
    this.cameraFx.onBossSpawn();
    return boss;
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

    // Ledakan sendiri, bukan sprite kematian musuh yang dipakai ulang — kalau
    // sama, upgrade ini tidak pernah terlihat sebagai sesuatu yang terjadi.
    playFx(this, SHEETS.FX_EXPLOSION_SMALL.key, x, y, { scale: 1.3 });
    // Ledakan ikut membuka jalan. Inilah gunanya paling terasa: jalan buntu yang
    // membuat musuh mondar-mandir bisa diledakkan.
    this.destructibles.damageAt(x, y, UPGRADE_FX.DEATH_BLAST_RADIUS, damage);
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
  /** Permata diambil. Sistem pickup tidak tahu artinya — di sinilah artinya. */
  private onPickup(_kind: PickupKind, spec: PickupSpec, x: number, y: number): void {
    if (spec.heal) {
      this.player.heal(spec.heal);
      this.damageNumbers.show(x, y, spec.heal, 'crit');
    }
    if (spec.charge) this.overclock.add(spec.charge);
    if (spec.score) this.score += spec.score;

    spawnHitSparks(this, x, y);
    audio.play('select');
  }

  /**
   * Tombol Overclock ditekan. Meter belum penuh -> tidak terjadi apa-apa selain
   * bunyi tolak, supaya pemain tahu tombolnya terbaca dan bukan rusak.
   */
  private tryOverclock(): void {
    if (this.state !== 'playing' || this.ultimate.isActive) return;
    if (!this.overclock.consume()) {
      audio.play('hurt');
      return;
    }
    const ult = this.ultimate.start(this.player.playerClass.id, this.player.x, this.player.y);
    // Nama jurusnya dipinjamkan ke banner wave: pemain harus tahu apa yang baru
    // saja ia lepaskan, dan panel ini sudah punya tata letak yang benar.
    showWaveBanner(this, 0, 0, ult.name, 900, true);
  }

  /** Hantaman tanah boss meledak setelah aba-abanya habis. */
  private ledakanTanah(x: number, y: number): void {
    playFx(this, SHEETS.FX_EXPLOSION_BIG.key, x, y, { scale: 1.5 });
    this.cameras.main.shake(180, 0.006);
    audio.play('hurt');

    const jarak = Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y);
    if (jarak <= BOSS_ATTACK.SLAM_RADIUS) {
      this.player.takeDamage(BOSS_ATTACK.SLAM_DAMAGE, x, y);
    }
    // Hantaman juga memecahkan rintangan — arena ikut berubah selama pertarungan
    // boss, dan itu membuat fase kedua terasa berbeda dari fase pertama.
    this.destructibles.damageAt(x, y, BOSS_ATTACK.SLAM_RADIUS, BOSS_ATTACK.SLAM_DAMAGE * 3);
  }

  private registerKill(enemy: Enemy): void {
    const pengali = this.streak.registerKill(this.time.now);
    this.cameraFx.onKill();
    this.kills++;
    // Elite lebih berharga; kalau tidak, musuh yang lebih sulit justru memberi
    // poin per detik yang lebih sedikit daripada musuh biasa.
    const bonusElite = enemy.eliteModifier?.score ?? 1;
    this.score += Math.round(enemy.config.score * bonusElite) * pengali;
    this.invalidateAliveCache();

    // Dipanggil setelah cache dibatalkan supaya ledakan melihat daftar terbaru.
    const elite = enemy.eliteModifier !== undefined;
    this.overclock.add(
      enemy instanceof Boss ? OVERCLOCK.PER_BOSS : elite ? OVERCLOCK.PER_ELITE : OVERCLOCK.PER_KILL
    );
    this.pickups.rollDrop(enemy.x, enemy.y, elite);

    this.applyDeathBlast(enemy.x, enemy.y, enemy);
    this.applyChainSpark(enemy.x, enemy.y, enemy);
    this.applyEliteBlast(enemy);
  }

  /**
   * Upgrade "Percik Rantai": musuh yang mati menyambar SATU musuh terdekat.
   *
   * Sengaja satu, bukan semua dalam radius — kalau menyambar semua, ia menumpuk
   * dengan "Ledakan Akhir" jadi satu kematian membersihkan layar, dan dua
   * upgrade berbeda terasa seperti hal yang sama.
   */
  private applyChainSpark(x: number, y: number, kecuali: Enemy): void {
    const damage = this.player.stats.chainDamage;
    if (damage <= 0) return;

    let terdekat: Enemy | undefined;
    let jarakTerdekat: number = UPGRADE_FX.CHAIN_RADIUS;
    for (const musuh of this.aliveEnemies) {
      if (musuh === kecuali || !musuh.isAlive) continue;
      const jarak = Phaser.Math.Distance.Between(x, y, musuh.x, musuh.y);
      if (jarak < jarakTerdekat) {
        jarakTerdekat = jarak;
        terdekat = musuh;
      }
    }
    if (!terdekat) return;

    playFx(this, SHEETS.FX_ELECTRO_SHOCK.key, terdekat.x, terdekat.y, { scale: 0.4 });
    this.damageNumbers.show(terdekat.x, terdekat.y, damage, 'hit');
    if (terdekat.takeDamage(damage, 0, 0)) this.registerKill(terdekat);
  }

  /**
   * Elite "Peledak" meledak saat mati — melukai musuh lain DAN pemain.
   *
   * Melukai pemain itu disengaja: ledakan yang hanya menguntungkan pemain
   * membuat elite ini jadi hadiah, bukan ancaman.
   */
  private applyEliteBlast(enemy: Enemy): void {
    const damage = enemy.eliteModifier?.deathBlast ?? 0;
    if (damage <= 0) return;

    playFx(this, SHEETS.FX_EXPLOSION_BIG.key, enemy.x, enemy.y, { scale: 1.9 });
    this.cameras.main.shake(160, 0.007);
    this.destructibles.damageAt(enemy.x, enemy.y, ELITE.BLAST_RADIUS, damage);

    for (const lain of this.aliveEnemies) {
      if (lain === enemy || !lain.isAlive) continue;
      if (Phaser.Math.Distance.Between(enemy.x, enemy.y, lain.x, lain.y) > ELITE.BLAST_RADIUS) {
        continue;
      }
      this.damageNumbers.show(lain.x, lain.y, damage, 'hit');
      if (lain.takeDamage(damage, 0, 0)) this.registerKill(lain);
    }

    const kePemain = Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player.x, this.player.y);
    if (kePemain <= ELITE.BLAST_RADIUS && this.player.takeDamage(damage, enemy.x, enemy.y)) {
      this.damageNumbers.show(this.player.x, this.player.y, damage, 'hurt');
      this.breakKillStreak();
    }
  }

  /** Rantai turun satu tingkat saat pemain kena. */
  private breakKillStreak(): void {
    this.streak.onPlayerHit();
  }

  private onWaveStart(wave: Wave): void {
    // Upgrade "Kotak P3K": pulih sedikit tiap wave baru dimulai.
    if (this.player.stats.waveHeal > 0) this.player.heal(this.player.stats.waveHeal);

    // Peta diganti SEBELUM banner dan sebelum musuh keluar, supaya pemain melihat
    // tempat barunya bersamaan dengan nama wave-nya.
    // Wave 1 dilewati: `create()` sudah membangun arena untuk biome-nya.
    if (wave.number > 1) this.rebuildArenaForWave(wave.number);

    // Dipanggil dari konstruktor WaveManager, jadi `this.waves` belum ter-assign.
    // Pakai WAVES.length langsung, jangan `this.waves`.
    this.waveBanner = showWaveBanner(
      this,
      wave.number,
      this.waves?.totalWaves ?? WAVES.length,
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

      // Boss tampil BESAR di panggung yang sama dengan cerita pembuka, bukan
      // sebagai potret kecil di atas arena yang membeku. Sprite boss jauh lebih
      // besar dari sprite pemain, jadi tingginya yang ditentukan, bukan skalanya.
      this.bukaPanggung(bossType?.texture ?? SHEETS.BOSS_CORE.key, undefined, 104);
      // Nama di atas tokoh, sama seperti nama kelas di cerita pembuka.
      if (bossType) this.panggung?.tampilkanNama(bossType.bossName);

      this.dialogue.play(beat, () => {
        this.tutupPanggung();
        this.state = 'playing';
        this.physics.world.resume();
      });
    }
  }

  /**
   * Buka panggung cerita sebagai LAPISAN di atas permainan.
   *
   * Depth-nya harus berada di JENDELA yang sempit: di atas arena dan HUD (100)
   * supaya keduanya tertutup, tapi di BAWAH panel UI (200) dan kotak dialog
   * (300) supaya teks ceritanya tetap terbaca. Percobaan pertama memakai 400 dan
   * panggungnya menutupi kotak dialognya sendiri — seluruh naskah tidak terlihat.
   *
   * Tint mengikuti biome wave berjalan, jadi adegannya terasa terjadi di TEMPAT
   * pemain berada, bukan di hutan lain yang tidak ada hubungannya.
   */
  private bukaPanggung(
    texture: string,
    animKey?: string,
    tinggi = 92,
    /** Timpa tint biome. Dipakai penutup, lihat alasannya di `onVictory`. */
    tintPaksa?: number
  ): void {
    this.tutupPanggung();
    this.waveBanner?.destroy();
    this.waveBanner = undefined;

    this.panggung = new StoryStage(this, {
      depthBase: PANGGUNG_DEPTH,
      tint: tintPaksa ?? this.biome.tint,
    });
    this.panggung.tampilkanKarakter(texture, animKey, tinggi);
  }

  private tutupPanggung(): void {
    this.panggung?.destroy();
    this.panggung = undefined;
  }

  private onWaveCleared(wave: Wave): void {
    this.score += waveClearBonus(wave.number);
    audio.play('waveClear');
    this.cameraFx.onWaveCleared();

    // Wave terakhir kampanye langsung menuju layar kemenangan, tanpa upgrade.
    // Di mode tanpa batas tidak ada "wave terakhir", jadi upgrade tetap ditawarkan.
    if (wave.number >= this.waves.scriptedWaves && !this.waves.isEndless) {
      this.waves.advanceToNextWave();
      return;
    }

    // Jeda pendek sebelum panel upgrade, supaya kill terakhir sempat terlihat.
    this.upgradeDelayTimer = WAVE_TIMING.CLEAR_DELAY_MS;
  }

  private openUpgradePanel(): void {
    this.state = 'upgrade';
    this.upgradePanel.open(this.takenUpgrades, this.player.playerClass.attackStyle, (upgrade) =>
      this.onUpgradePicked(upgrade)
    );
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

    const kelasFx = !skillId
      ? this.player.playerClass.attackFx?.[payload.comboIndex ?? 0]
      : undefined;
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
      this.projectiles.fireVolley(this.player, payload, payload.skill.volley);
      return;
    }

    // Serangan dasar kelas jarak jauh juga menembak panah.
    if (payload.ranged && !skillId) {
      this.projectiles.fireBasic(this.player, payload);
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
      hitFx: this.player.playerClass.hitFx,
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

    // Serangan melee juga merusak rintangan di depan pemain. Titiknya diambil
    // sedikit di depan badan, bukan di badan: kalau di badan, pemain merusak
    // rintangan yang berdiri di BELAKANGNYA.
    const jangkauan = 14 * this.player.stats.rangeMultiplier;
    this.destructibles.damageAt(
      x + dirX * jangkauan,
      y + dirY * jangkauan,
      jangkauan,
      step.damage * DESTRUCTIBLE.ATTACK_RATIO
    );
  }

  /** Sudut dasar tembakan menurut arah hadap. */
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
      this.damageNumbers.show(
        this.player.x,
        this.player.y,
        enemyObject.config.contactDamage,
        'hurt'
      );

      // Upgrade "Duri": penabrak ikut menerima sebagian damage kontaknya.
      const thorns = this.player.stats.thorns;
      if (thorns > 0) {
        const pantulan = enemyObject.config.contactDamage * thorns;
        this.damageNumbers.show(enemyObject.x, enemyObject.y, pantulan, 'hit');
        if (enemyObject.takeDamage(pantulan, 0, 0)) this.registerKill(enemyObject);
      }
      this.breakKillStreak();
      this.cameras.main.shake(140, 0.006);
      this.cameraFx.onHurt();
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
    // Banner wave yang masih menyala akan terbaca menembus panel kalah dan
    // membuat teksnya bertumpuk — terlihat jelas saat mati tepat di awal wave.
    this.waveBanner?.destroy();
    this.waveBanner = undefined;

    this.cameraFx.reset();
    this.bossAttacks.clear();
    this.hud.hideBoss();
    this.activeBoss = undefined;

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

  /**
   * Kebalikan `freezeEverything()`, dipakai saat pemain memilih lanjut ke mode
   * tanpa batas. Hanya pemain yang perlu dipulihkan: wave baru saja bersih, jadi
   * tidak ada musuh yang tersisa untuk dibangunkan.
   */
  private unfreezeEverything(): void {
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    playerBody.moves = true;
  }

  private onPlayerDied(): void {
    if (this.state === 'gameover' || this.state === 'victory') return;
    this.state = 'gameover';
    this.upgradePanel.close();
    this.freezeEverything();
    audio.play('gameOver');
    this.catatRun();
    this.showEndPanel('KALAH', '#ff8a7a');
  }

  /**
   * Catat hasil run ke rekor tersimpan. Dipanggil sekali di akhir run —
   * saat mati atau saat pemain memilih menyudahi setelah menang.
   *
   * Sengaja TIDAK dipanggil per wave: refresh di tengah permainan tidak boleh
   * meninggalkan jejak skor separuh jalan.
   */
  private catatRun(): void {
    if (this.runTercatat) return;
    this.runTercatat = true;

    const hasil = commitRun(this.player.playerClass.id, {
      score: this.score,
      wave: this.waves.waveNumber,
      bestChain: this.streak.best,
      kills: this.kills,
      endless: this.waves.isEndless,
    });
    this.rekorSebelumnya = hasil.sebelumnya;
    this.pecahRekor = hasil.pecahRekor;
  }

  private onVictory(): void {
    this.state = 'victory';
    this.upgradePanel.close();
    this.freezeEverything();
    audio.play('victory');

    // Penutup memakai panggung yang sama dengan pembuka, dengan pemain di
    // tengahnya — babak itu menutup lingkaran yang dibuka di cerita awal.
    // Tint biome SENGAJA ditimpa warna asli di sini. Naskah penutupnya berbunyi
    // "ruang kosong itu menutup, rak-rak kembali terlihat" — memainkannya di
    // ungu kekosongan wave 10 justru membantah teksnya sendiri.
    const kelas = this.player.playerClass;
    this.bukaPanggung(kelas.texture, `${kelas.texture}-walk-down`, 92, 0xffffff);
    this.panggung?.tampilkanNama('ARSIP BERSIH');

    this.dialogue.play(STORY_VICTORY, () => {
      this.showVictoryChoice();
    });
  }

  /**
   * Panel setelah kampanye tamat.
   *
   * Kemenangan harus tetap terasa sebagai kemenangan — kalau permainan langsung
   * menggelinding ke wave 11 tanpa ditanya, tamatnya kehilangan arti. Pengejar
   * skor tetap punya jalan lewat pilihan kedua.
   */
  private showVictoryChoice(): void {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const panel = createPanel(this, 300, 96);

    addText(this, panel, cx, cy - 34, 'SEMUA WAVE SELESAI', { size: 10, color: '#8fd35d' });
    addText(this, panel, cx, cy - 16, `skor ${this.score}`, { size: 7, color: '#e8e4f0' });

    const pilih = (lanjut: boolean) => {
      panel.destroy();
      this.tutupPanggung();
      if (!lanjut) {
        this.catatRun();
        this.showEndPanel('SEMUA WAVE SELESAI', '#8fd35d');
        return;
      }
      this.waves.enableEndless();
      this.state = 'playing';
      this.physics.world.resume();
      this.unfreezeEverything();
    };

    addText(this, panel, cx, cy + 6, 'LANJUT - TANPA BATAS', { size: 8, color: '#ffe066' });
    addTapZone(this, panel, cx, cy + 6, 280, 18, () => pilih(true));

    addText(this, panel, cx, cy + 28, 'SUDAHI - SIMPAN SKOR', { size: 8, color: '#c9c4d8' });
    addTapZone(this, panel, cx, cy + 28, 280, 18, () => pilih(false));

    addText(
      this,
      panel,
      cx,
      cy + 42,
      isTouchDevice() ? 'ketuk pilihan' : '[1] lanjut    [2] sudahi',
      { size: 6, color: '#8fd35d' }
    );

    const keyboard = this.input.keyboard;
    const satu = keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
    const dua = keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
    const bersihkan = () => {
      satu?.removeAllListeners();
      dua?.removeAllListeners();
    };
    satu?.once('down', () => {
      bersihkan();
      pilih(true);
    });
    dua?.once('down', () => {
      bersihkan();
      pilih(false);
    });
  }

  private showEndPanel(title: string, color: string): void {
    // Tinggi dan jarak antar baris ditulis di satu tempat. Versi sebelumnya
    // menaruh judul di top+16 dan blok statistik di top+46 yang tingginya 52 px,
    // jadi baris pertama menimpa judul dan baris terakhir tertimpa baris rekor.
    const LEBAR = 300;
    const TINGGI = 138;
    const panel = createPanel(this, LEBAR, TINGGI);
    const cx = this.scale.width / 2;
    const top = this.scale.height / 2 - TINGGI / 2;

    // Dua kolom tetap: label rata kiri, nilai rata kiri. Inilah yang membuat
    // titik duanya lurus.
    const xLabel = cx - 112;
    const xNilai = cx + 6;

    addText(this, panel, cx, top + 18, title, { size: 10, color });

    const waveTercapai = this.waves.totalWaves
      ? `${this.waves.waveNumber} / ${this.waves.totalWaves}`
      : // Mode tanpa batas tidak punya penyebut; "14 / 0" jelas salah.
        `${this.waves.waveNumber} (tanpa batas)`;

    const baris: ReadonlyArray<readonly [string, string]> = [
      ['wave tercapai', waveTercapai],
      ['bug dibasmi', `${this.kills}`],
      ['rantai terbaik', `x${this.streak.best}`],
      ['waktu', `${(this.elapsedMs / 1000).toFixed(1)} detik`],
    ];
    baris.forEach(([label, nilai], i) => {
      addRow(this, panel, xLabel, xNilai, top + 40 + i * 11, `${label}`, `: ${nilai}`);
    });

    addRow(this, panel, xLabel, xNilai, top + 89, 'SKOR', `: ${this.score}`, {
      size: 8,
      color: '#ffe066',
      colorNilai: '#ffe066',
    });

    // Rekor sebelumnya jadi pembanding; tanpa itu skor akhir cuma angka lepas.
    if (this.pecahRekor) {
      addText(this, panel, cx, top + 105, 'REKOR BARU', { size: 8, color: '#8fd35d' });
    } else if (this.rekorSebelumnya) {
      addText(
        this,
        panel,
        cx,
        top + 105,
        `terbaik ${this.rekorSebelumnya.score} (wave ${this.rekorSebelumnya.wave})`,
        { size: 6, color: '#8fd35d' }
      );
    }

    addText(this, panel, cx, top + 122, this.touch ? 'ketuk untuk ulang' : 'tekan R untuk ulang', {
      size: 7,
      color: '#ffe066',
    });

    // Seluruh panel bisa diketuk. Di ponsel tidak ada tombol R, dan layar akhir
    // yang tidak bisa dilanjutkan berarti game-nya buntu total di sana.
    addTapZone(this, panel, cx, this.scale.height / 2, LEBAR, TINGGI, () => {
      if (this.state === 'gameover' || this.state === 'victory') this.scene.restart();
    });
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
      addText(
        this,
        panel,
        this.scale.width / 2,
        this.scale.height / 2 + 10,
        this.touch ? 'ketuk untuk lanjut' : 'ESC untuk lanjut',
        { size: 7, color: '#c9c4d8' }
      );
      addTapZone(this, panel, this.scale.width / 2, this.scale.height / 2, 190, 44, () =>
        this.togglePause()
      );
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
  /**
   * @param seed dibiarkan kosong saat bermain (layout diacak tiap wave). Diisi
   *   hanya oleh alat pengukur, yang butuh arena yang sama persis untuk
   *   membandingkan sebelum/sesudah — tanpa itu, angka "musuh tersangkut" ikut
   *   berubah hanya karena petanya berbeda.
   */
  private rebuildArenaForWave(waveNumber: number, seed?: number): void {
    const biome = biomeForWave(waveNumber);
    const arena = buildArena(TILE, seed, biome);
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
    this.projectiles.clear();
    this.bossAttacks.clear();
    this.pickups.clear();
    // WAJIB: tanpa ini tile di koordinat yang sama pada wave berikutnya mewarisi
    // kerusakan wave sebelumnya, dan pohon yang baru muncul sudah nyaris pecah.
    this.destructibles.reset();
    this.telegraph.clear();
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

  /** Merakit angka untuk HUD. Baris aksi dirakit di sini karena ia aturan main. */
  private hudState(aliveCount: number) {
    const dashMs = this.player.dashCooldownRemaining();
    const skillStatus = this.player.getSkillStatus();

    const skills = skillStatus
      .map(({ skill, hotkey, remainingMs }) =>
        remainingMs > 0
          ? `[${hotkey}]${(remainingMs / 1000).toFixed(1)}s`
          : `[${hotkey}]${skill.name}`
      )
      .join('  ');
    const dash = dashMs > 0 ? `[SPC]${(dashMs / 1000).toFixed(1)}s` : '[SPC]Dash';

    return {
      hp: this.player.health,
      maxHp: this.player.maxHealth,
      wave: this.waves.waveNumber,
      totalWaves: this.waves.totalWaves,
      sisaMusuh: aliveCount + this.waves.remainingInQueue,
      score: this.score,
      multiplier: this.streak.current,
      barisAksi: `${skills}  ${dash}`,
      overclock: this.overclock.ratio,
    };
  }

  override update(_time: number, delta: number): void {
    // Satu-satunya tempat cache musuh dibatalkan secara rutin.
    this.invalidateAliveCache();

    // Kontrol sentuh hanya tampil saat benar-benar bermain. Dibiarkan tampil saat
    // dialog atau panel upgrade, ia akan menutupi teks DAN tetap menggerakkan
    // karakter di balik panel.
    if (this.touch) {
      this.touch.setVisible(this.state === 'playing' && !this.dialogue.isOpen);
      this.touch.update();
    }

    if (this.panggung) {
      this.panggung.update(delta);
      const baris = this.dialogue.currentLine;
      if (baris) {
        // Di cerita boss yang di panggung adalah BOSS, jadi ia menyala saat
        // boss bicara; di penutup yang di panggung pemain.
        const target = this.state === 'victory' ? 'player' : 'boss';
        this.panggung.sorotKarakter(baris.portrait === target);
      }
    }

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
      this.projectiles.update();
      this.pickups.update();
      this.ultimate.update(this.player.x, this.player.y);
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
    if (!this.hud.updateBoss(this.activeBoss)) this.activeBoss = undefined;
    this.hud.update(this.hudState(alive.length));
  }
}
