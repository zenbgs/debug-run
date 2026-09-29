import Phaser from 'phaser';
import { cariTitikBebas, pilihArahSusur, terhalang } from '../systems/Navigation';
import { BOSS_TYPES } from '../data/bosses';
import { COMBAT } from '../data/combat';
import { CHARGER, ENEMY_TYPES, SHOOTER, ZIGZAG, type EnemyType } from '../data/enemies';
import { DEPTH } from '../data/depth';
import { ELITE, type EliteModifier } from '../data/elites';
import { ALL_SHEETS, SHEETS } from '../data/frames';
import { audio } from '../systems/Audio';
import { playFx } from '../systems/Fx';
import { spawnDeathBurst, spawnHitSparks } from '../systems/Particles';

/** Nama animasi idle per texture — satu animasi dipakai bersama semua varian tint. */
function idleAnimKey(texture: string): string {
  return `${texture}-idle`;
}

type ChargerPhase = 'aim' | 'dash' | 'recover';

/**
 * Terhalang kalau perpindahan nyata di bawah sekian bagian dari yang DIINGINKAN.
 *
 * Ambang ini nisbi, bukan mutlak, dan itu disengaja. Versi sebelumnya memakai
 * batas tetap 0,4 px per frame; musuh yang menggerus menyusuri pohon berpindah
 * sedikit di atas itu, jadi ia dihitung "bergerak", penghitung macetnya di-nol-kan
 * tiap frame, dan jaring pengaman tidak pernah menyala. Terlihat sebagai musuh
 * yang menempel di pohon sambil bergetar — persis yang dikeluhkan.
 */
const BLOCK_RATIO = 0.45;
/**
 * Tidak berhasil mendekat selama ini -> pindahkan paksa.
 *
 * 1,8 detik, bukan 2,6. Pada 2,6 detik sangkutan terpanjang yang terukur persis
 * menempel di angka itu (2,5-2,7 detik) — artinya jaring pengaman memang yang
 * menyelesaikannya, tapi terlambat cukup lama untuk terlihat pemain. Terlalu
 * pendek juga tidak baik: pemindahannya melompat, dan musuh yang sebenarnya
 * sedang memutari rintangan akan disentak sebelum sempat sampai.
 */
const NO_PROGRESS_MS = 1800;
/** Sedekat ini ke pemain, tidak ada lagi yang perlu dijamin. */
const NO_PROGRESS_RADIUS = 40;
/** Berpindah sejauh ini dari titik acuan = bukan terjepit. */
const WEDGE_MOVE_PX = 24;
/** Jarak dorongan paksa. Harus lebih besar dari satu tile (16 px) agar benar-benar lolos. */
const UNSTICK_NUDGE = 22;
/**
 * Sekali memilih arah menyusur, tahan selama ini sebelum boleh menilai ulang.
 *
 * Tanpa komitmen, arah dipilih ulang tiap frame dan musuh di sudut rintangan
 * bergetar di tempat: satu frame memilih ke atas, frame berikutnya ke bawah,
 * bersih-bersih saling meniadakan.
 */
const SLIDE_COMMIT_MS = 420;
/**
 * Bobot dorongan menyamping saat tertahan MUSUH LAIN (bukan rintangan peta).
 *
 * Sengaja kecil dan hanya DITAMBAHKAN ke arah kejar. Mengganti arah kejar dengan
 * arah menyamping — seperti yang sempat dilakukan — membuat gerombolan mengorbit
 * pemain alih-alih menghampirinya.
 */
const DESAK_NUDGE = 0.8;
/** Sejauh mana meraba ke depan saat menilai sisi mana yang lowong. */
const PROBE_PX = 14;

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

  /** Sifat elite yang dipasang, kalau ada. */
  private elite?: EliteModifier;
  /** Cincin penanda elite. Mengikuti posisi musuh tiap frame. */
  private ring?: Phaser.GameObjects.Arc;

  /** Pelacak macet — lihat catatan di `applyUnstick`. */
  private lastX = 0;
  private lastY = 0;
  /** Titik acuan untuk mengukur apakah musuh benar-benar berpindah tempat. */
  private wedgeX = 0;
  private wedgeY = 0;
  private wedgeMs = 0;
  /** Arah menyusur yang sedang dipegang, beserta batas waktunya. */
  private slideX = 0;
  private slideY = 0;
  private slideUntil = 0;

  /**
   * Cek apakah satu titik dunia berisi rintangan padat. Disuntik oleh scene.
   *
   * Dengan ini musuh bisa MERABA ke depan alih-alih menunggu tabrakan terjadi.
   * `body.blocked` hanya menyala setelah benturan, dan hanya untuk sisi yang
   * benar-benar tersentuh frame itu — terlalu telat dan terlalu sedikit
   * informasi untuk memilih jalan memutar.
   */
  private solidAt?: (x: number, y: number) => boolean;

  setObstacleProbe(fn: (x: number, y: number) => boolean): void {
    this.solidAt = fn;
  }

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

  /** Sifat elite musuh ini, atau `undefined` kalau ia musuh biasa. */
  get eliteModifier(): EliteModifier | undefined {
    return this.elite;
  }

  /**
   * Jadikan musuh ini elite.
   *
   * Dipanggil SEKALI tepat setelah dibuat, sebelum sempat bergerak. Cincin
   * penanda wajib ada: musuh yang tiba-tiba menerima tiga kali pukulan tanpa
   * tanda apa pun terbaca sebagai bug, bukan sebagai tantangan.
   */
  applyElite(mod: EliteModifier): void {
    this.elite = mod;
    this.hp = Math.round(this.hp * mod.hp);
    this.setScale(this.config.scale * mod.scale);

    const jari = Math.max(this.displayWidth, this.displayHeight) * ELITE.RING_SCALE * 0.5;
    this.ring = this.scene.add
      .circle(this.x, this.y, jari, mod.ringColor, 0)
      .setStrokeStyle(1, mod.ringColor, 0.9)
      // Depth TETAP, bukan `this.depth - 1`.
      //
      // `applyElite` dipanggil sebelum scene sempat menyetel depth musuh, jadi
      // `this.depth` masih 0 dan cincinnya mendarat di -1 — di bawah layer tanah,
      // dan tidak pernah terlihat sama sekali. Ketahuan hanya dari tangkapan layar.
      // DEPTH.ENEMY - 1 ada di atas peta dan tepat di bawah musuhnya.
      .setDepth(DEPTH.ENEMY - 1);
  }

  /** Kecepatan setelah pengali elite. */
  private get speed(): number {
    return this.config.speed * (this.elite?.speed ?? 1);
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

  /**
   * @param fxKey efek benturan. Tiap kelas punya miliknya sendiri — tanpa ini
   *   ayunan baja, panah, dan bola api terasa identik saat mengenai musuh.
   * @returns true kalau serangan ini membunuhnya.
   */
  takeDamage(
    amount: number,
    knockbackX: number,
    knockbackY: number,
    fxKey: string = SHEETS.FX_HIT.key
  ): boolean {
    if (!this.isAlive) return false;

    this.hp -= amount;

    playFx(this.scene, fxKey, this.x, this.y, { scale: 0.8 });
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
    this.ring?.destroy();
    this.ring = undefined;
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

    this.ring?.setPosition(this.x, this.y);

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

    this.applyUnstick(body, target, deltaSeconds, now);

    // Sprite hanya punya satu orientasi; flip mengikuti arah gerak horizontal.
    if (Math.abs(body.velocity.x) > 5) this.setFlipX(body.velocity.x < 0);
  }

  /**
   * AI mengejar tidak punya pathfinding: musuh mendorong lurus ke pemain dan bisa
   * tersangkut di balik batu/pohon. Karena wave baru bersih hanya kalau SEMUA
   * musuh mati, satu musuh nyangkut membuat permainan deadlock — ini benar-benar
   * terjadi di M4 dan menghentikan wave 1 selamanya.
   *
   * Tiga lapis, dari yang paling halus ke yang paling kasar:
   *
   *  1. **Menyusur rintangan peta.** Kalau ada tile padat tepat di depan arah
   *     gerak DAN musuh benar-benar tertahan, ia membelok ke sisi yang lowong —
   *     dirabakan ke tilemap, bukan ditebak. Arahnya dicampur sedikit arah kejar
   *     supaya ia memutari rintangan sambil tetap mendekat.
   *  2. **Dorongan menyamping saat berdesakan** sesama musuh. Kecil, dan hanya
   *     DITAMBAHKAN ke arah kejar.
   *  3. **Jaring pengaman berbasis KEMAJUAN.** Kalau musuh tidak berhasil
   *     mendekat sama sekali selama `NO_PROGRESS_MS`, ia dipindahkan ke titik
   *     bebas terdekat.
   *
   * ⚠️ **Lapis 3 memakai kemajuan, bukan kecepatan.** Versi sebelumnya
   * mengandalkan "sedang bergerak atau tidak", dan itu punya lubang yang tidak
   * terlihat: `charger` bergantian antara menerjang (terhalang tembok) dan
   * memulihkan diri (kecepatan nol). Fase kecepatan-nol me-reset penghitung
   * macetnya, jadi jaring pengaman TIDAK PERNAH menyala dan charger yang
   * terjepit di sudut tinggal di situ selamanya. Kemajuan ke pemain tidak bisa
   * dikelabui begitu.
   *
   * **Jangan hapus lapis 3** — tanpa itu satu musuh nyangkut mengunci sesi.
   */
  private applyUnstick(
    body: Phaser.Physics.Arcade.Body,
    target: Phaser.Math.Vector2,
    deltaSeconds: number,
    now: number
  ): void {
    const moved = Math.hypot(this.x - this.lastX, this.y - this.lastY);
    this.lastX = this.x;
    this.lastY = this.y;

    this.jagaKemajuan(body, target, deltaSeconds);

    const laju = Math.hypot(body.velocity.x, body.velocity.y);
    if (laju <= 5) {
      // Memang tidak sedang berusaha bergerak: charger mengincar, shooter
      // menahan jarak, musuh ter-stun. Tidak ada yang perlu dibelokkan —
      // jaring pengaman di atas tetap mengawasi kalau ia tidak maju-maju.
      this.lepasSusur();
      return;
    }

    // ⚠️ Manuver penuh HANYA dipicu rintangan TILE di depan arah gerak.
    //
    // Versi sebelumnya cukup melihat "bergerak lebih lambat dari yang
    // diinginkan", dan itu salah besar: perlambatan juga terjadi karena
    // berdesakan sesama musuh, karena drag, dan karena charger memang merayap
    // pelan saat mengincar. Akibatnya charger masuk mode menyusur sepanjang fase
    // incarnya lalu menyamping — terukur 0% charger sampai ke pemain, menetap di
    // sekitar 204 px. Yang terlihat pemain: gerombolan berlarian ke arah lain.
    const gx = body.velocity.x / laju;
    const gy = body.velocity.y / laju;
    const tileDepan = this.isSolid(this.x + gx * PROBE_PX, this.y + gy * PROBE_PX);
    const tertahan = terhalang(moved, laju, deltaSeconds, BLOCK_RATIO);

    if (!tileDepan) {
      this.lepasSusur();

      // Tertahan MUSUH LAIN. Untuk perilaku yang memang berjalan lurus ke
      // pemain, diberi dorongan menyamping kecil yang DITAMBAHKAN ke arah kejar
      // — bukan menggantikannya, dan tanpa komitmen waktu, jadi mustahil
      // berputar-putar. `charger` dan `shooter` dikecualikan: keduanya mengatur
      // sendiri kapan diam, mengincar, dan menerjang.
      const lurusKePemain = this.config.behavior === 'chase' || this.config.behavior === 'zigzag';
      if (tertahan && lurusKePemain) {
        const d = this.directionTo(target);
        const sisi = this.sisiMengelak(d);
        const vx = d.x + sisi.x * DESAK_NUDGE;
        const vy = d.y + sisi.y * DESAK_NUDGE;
        const l = Math.hypot(vx, vy) || 1;
        body.setVelocity((vx / l) * this.speed, (vy / l) * this.speed);
      }
      return;
    }

    if (!tertahan) {
      // Ada tile di depan tapi ia masih melaju (menyerempet sudut). Belum perlu
      // membelok; membiarkannya lewat mencegah belokan yang tidak perlu.
      return;
    }

    // --- Lapis 1: menyusuri rintangan peta ---
    if (now >= this.slideUntil || (this.slideX === 0 && this.slideY === 0)) {
      const arah = pilihArahSusur(
        { x: this.x, y: this.y },
        { x: target.x - this.x, y: target.y - this.y },
        (px, py) => this.isSolid(px, py),
        PROBE_PX
      );
      this.slideX = arah.x;
      this.slideY = arah.y;
      this.slideUntil = now + SLIDE_COMMIT_MS;
    }
    body.setVelocity(this.slideX * this.speed, this.slideY * this.speed);
  }

  /**
   * Jaring pengaman: musuh yang TERJEPIT di rintangan dipindahkan ke titik bebas.
   *
   * Yang diukur adalah perpindahan musuh ITU SENDIRI, bukan jaraknya ke pemain.
   * Dua versi sebelumnya sama-sama gagal justru di sini:
   *
   *  * Versi kecepatan ("sedang bergerak atau tidak") punya lubang pada
   *    `charger`: ia bergantian menerjang (terhalang tembok) dan memulihkan diri
   *    (kecepatan nol), dan fase nol itu me-reset penghitungnya — jaring pengaman
   *    tidak pernah menyala dan charger yang terjepit tinggal di sudut selamanya.
   *  * Versi jarak-ke-pemain punya lubang yang lebih halus: jaraknya ikut berubah
   *    ketika PEMAIN yang bergerak. Pemain yang berjalan mendekat memberi "kemajuan"
   *    gratis ke musuh yang sebenarnya terjepit, penghitungnya ter-reset, dan
   *    terukur ada sangkutan 3.237 ms yang tidak pernah ditolong.
   *
   * Perpindahan sendiri + ada rintangan menempel tidak bisa dikelabui keduanya.
   *
   * `shooter` dikecualikan — ia memang menjaga jarak dan sering diam di tempat.
   */
  private jagaKemajuan(
    body: Phaser.Physics.Arcade.Body,
    target: Phaser.Math.Vector2,
    deltaSeconds: number
  ): void {
    if (this.config.behavior === 'shooter') return;

    const jarak = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
    const geser = Math.hypot(this.x - this.wedgeX, this.y - this.wedgeY);

    // Sudah di dekat pemain, atau benar-benar berpindah tempat: tidak terjepit.
    if (jarak <= NO_PROGRESS_RADIUS || geser > WEDGE_MOVE_PX || !this.tileDiSekitar()) {
      this.wedgeX = this.x;
      this.wedgeY = this.y;
      this.wedgeMs = 0;
      return;
    }

    this.wedgeMs += deltaSeconds * 1000;
    if (this.wedgeMs < NO_PROGRESS_MS) return;

    this.wedgeMs = 0;
    this.wedgeX = this.x;
    this.wedgeY = this.y;
    this.slideUntil = 0;

    const bebas = cariTitikBebas(
      { x: this.x, y: this.y },
      { x: target.x - this.x, y: target.y - this.y },
      (px, py) => this.areaPadat(px, py),
      UNSTICK_NUDGE
    );
    // Kalau tidak ada satu pun titik yang muat, JANGAN dipindahkan paksa.
    // Mendorong buta ke arah pemain bisa mendaratkannya di dalam pohon, dan
    // musuh yang menembus rintangan lebih buruk daripada musuh yang telat
    // sebentar — percobaan berikutnya toh datang tidak lama lagi.
    if (bebas) body.reset(bebas.x, bebas.y);
  }

  /**
   * Ada rintangan peta menempel di sekeliling musuh?
   *
   * Dirabakan sedikit DI LUAR badan, dan tidak bergantung arah gerak — musuh yang
   * terjepit sering punya kecepatan nol, jadi rabaan searah kecepatan tidak bisa
   * dipakai untuk mendeteksinya.
   */
  private tileDiSekitar(): boolean {
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    const rx = (body?.width ?? 12) / 2 + 5;
    const ry = (body?.height ?? 12) / 2 + 5;
    return (
      this.isSolid(this.x - rx, this.y) ||
      this.isSolid(this.x + rx, this.y) ||
      this.isSolid(this.x, this.y - ry) ||
      this.isSolid(this.x, this.y + ry) ||
      this.isSolid(this.x - rx, this.y - ry) ||
      this.isSolid(this.x + rx, this.y - ry) ||
      this.isSolid(this.x - rx, this.y + ry) ||
      this.isSolid(this.x + rx, this.y + ry)
    );
  }

  /**
   * Sisi mengelak saat berdesakan, tetap sama selama musuh ini hidup.
   *
   * Dipilih dari `wobbleOffset` yang sudah diacak per musuh, bukan diundi tiap
   * frame: kalau berubah-ubah, dua musuh yang saling menghalangi akan bergetar
   * berlawanan arah dan tidak ada yang lolos.
   */
  private sisiMengelak(d: Phaser.Math.Vector2): { x: number; y: number } {
    const tanda = Math.sin(this.wobbleOffset) >= 0 ? 1 : -1;
    return { x: -d.y * tanda, y: d.x * tanda };
  }

  private lepasSusur(): void {
    this.slideX = 0;
    this.slideY = 0;
    this.slideUntil = 0;
  }

  private isSolid(x: number, y: number): boolean {
    return this.solidAt?.(x, y) ?? false;
  }

  /**
   * Sama seperti `isSolid`, tapi memperhitungkan LEBAR BADAN musuh.
   *
   * Dipakai saat memilih titik pendaratan jaring pengaman. Memeriksa titik pusat
   * saja tidak cukup: pusatnya bisa lowong sementara badannya tetap menumpuk
   * tile di sebelahnya, dan musuh mendarat separuh di dalam pohon. Terukur 158
   * sampel musuh berada di dalam tembok ketika hanya pusatnya yang diperiksa.
   */
  private areaPadat(x: number, y: number): boolean {
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    const rx = (body?.width ?? 12) / 2;
    const ry = (body?.height ?? 12) / 2;
    return (
      this.isSolid(x, y) ||
      this.isSolid(x - rx, y - ry) ||
      this.isSolid(x + rx, y - ry) ||
      this.isSolid(x - rx, y + ry) ||
      this.isSolid(x + rx, y + ry)
    );
  }

  private directionTo(target: Phaser.Math.Vector2): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(target.x - this.x, target.y - this.y).normalize();
  }

  private moveChase(body: Phaser.Physics.Arcade.Body, target: Phaser.Math.Vector2): void {
    const dir = this.directionTo(target);
    body.setVelocity(dir.x * this.speed, dir.y * this.speed);
  }

  private moveZigzag(
    body: Phaser.Physics.Arcade.Body,
    target: Phaser.Math.Vector2,
    now: number
  ): void {
    const dir = this.directionTo(target);
    // Vektor tegak lurus arah kejar, dikalikan gelombang sinus.
    const wobble = Math.sin((now / 1000) * ZIGZAG.FREQUENCY + this.wobbleOffset) * ZIGZAG.AMPLITUDE;
    const vx = (dir.x + -dir.y * wobble) * this.speed;
    const vy = (dir.y + dir.x * wobble) * this.speed;
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
      body.setVelocity(dir.x * this.speed * arah, dir.y * this.speed * arah);
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
      body.setVelocity(this.chargerDirection.x * this.speed, this.chargerDirection.y * this.speed);
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
