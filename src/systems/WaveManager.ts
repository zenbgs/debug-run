import Phaser from 'phaser';
import { isBossType, SPAWNABLE_BY_ID } from '../data/bosses';
import { SPAWNER, type EnemyType } from '../data/enemies';
import { ELITES, eliteChance } from '../data/elites';
import { buildEndlessWave } from '../data/endless';
import { WAVES, WAVE_TIMING, type Wave } from '../data/waves';
import { Enemy } from '../entities/Enemy';

export type WaveState = 'intro' | 'spawning' | 'clearing' | 'awaiting-upgrade' | 'finished';

export type WaveManagerCallbacks = {
  /**
   * GameScene yang membuat entity-nya — boss butuh konteks (proyektil, summon)
   * yang tidak diketahui WaveManager.
   */
  createEnemy: (type: EnemyType, x: number, y: number) => Enemy;
  onSpawn: (enemy: Enemy) => void;
  onWaveStart: (wave: Wave) => void;
  onWaveCleared: (wave: Wave) => void;
  onAllWavesCleared: () => void;
};

export type ArenaSize = { width: number; height: number };

/**
 * Menjalankan wave. (SPEC.md §6.1, §6.2)
 *
 * Siklus per wave: intro (banner) → spawning (musuh keluar bertahap) →
 * clearing (menunggu sisa musuh habis) → awaiting-upgrade (GameScene menampilkan
 * pilihan upgrade, manager berhenti) → wave berikutnya.
 *
 * Sepuluh wave pertama bernaskah (`WAVES`). Sesudahnya, kalau `enableEndless()`
 * sudah dipanggil, wave dibangkitkan `buildEndlessWave()` tanpa henti.
 */
export class WaveManager {
  private state: WaveState = 'intro';
  private waveIndex = 0;
  private stateTimer = 0;
  private spawnTimer = 0;
  /** Sisa musuh yang belum dikeluarkan pada wave berjalan. */
  private queue: string[] = [];

  /**
   * Wave yang sedang berjalan, DISIMPAN — bukan dihitung ulang di getter.
   *
   * `currentWave` dibaca `update()` tiap frame. Kalau wave tanpa batas
   * dibangkitkan di dalam getter, `buildEndlessWave()` akan berjalan 60 kali per
   * detik dan membuang objek wave sebanyak itu juga.
   */
  private wave: Wave = WAVES[0];

  private endless = false;

  /**
   * Cache tipe musuh yang sudah diskalakan, berkunci `${id}:${scale}`.
   * Tanpa ini tiap spawn mengalokasikan objek `EnemyType` baru.
   */
  private readonly skalaCache = new Map<string, EnemyType>();

  constructor(
    private readonly arena: ArenaSize,
    private readonly callbacks: WaveManagerCallbacks
  ) {
    this.validateWaves();
    this.beginWave(0);
  }

  /** Gagal keras kalau ada wave menyebut id musuh yang tidak ada. */
  private validateWaves(): void {
    for (const wave of WAVES) {
      for (const entry of wave.entries) {
        if (!SPAWNABLE_BY_ID.has(entry.typeId)) {
          throw new Error(
            `Wave ${wave.number} menyebut tipe musuh tidak dikenal: "${entry.typeId}"`
          );
        }
      }
    }
  }

  get currentWave(): Wave {
    return this.wave;
  }

  /** Jumlah wave bernaskah. Dipakai banner "WAVE n / 10". */
  get scriptedWaves(): number {
    return WAVES.length;
  }

  /** Sudah melewati kampanye dan masuk mode tanpa batas. */
  get isEndless(): boolean {
    return this.endless && this.waveIndex >= WAVES.length;
  }

  /**
   * Lanjutkan setelah kampanye selesai. Dipanggil GameScene saat pemain memilih
   * "LANJUT" di panel kemenangan.
   */
  enableEndless(): void {
    this.endless = true;
    if (this.state === 'finished') this.beginWave(WAVES.length);
  }

  get currentState(): WaveState {
    return this.state;
  }

  get waveNumber(): number {
    return this.currentWave.number;
  }

  /** 0 berarti tanpa batas — dipakai HUD dan banner untuk menyembunyikan penyebut. */
  get totalWaves(): number {
    return this.isEndless ? 0 : WAVES.length;
  }

  /** Sisa musuh wave ini yang belum keluar. */
  get remainingInQueue(): number {
    return this.queue.length;
  }

  get isFinished(): boolean {
    return this.state === 'finished';
  }

  /** Wave ke-`index` (0-based): dari naskah, atau dibangkitkan kalau sudah lewat. */
  private resolveWave(index: number): Wave {
    return index < WAVES.length ? WAVES[index] : buildEndlessWave(index + 1);
  }

  private beginWave(index: number): void {
    this.waveIndex = index;
    const wave = this.resolveWave(index);
    this.wave = wave;

    // Kembangkan entri jadi daftar id, lalu diacak supaya tipe tidak keluar berkelompok.
    const list: string[] = [];
    for (const entry of wave.entries) {
      for (let i = 0; i < entry.count; i++) list.push(entry.typeId);
    }
    // Diacak supaya tipe tidak keluar berkelompok, lalu boss ditarik ke depan:
    // boss harus muncul lebih dulu, bukan di tengah gerombolan.
    const shuffled = Phaser.Utils.Array.Shuffle(list);
    this.queue = [
      ...shuffled.filter((id) => this.isBossId(id)),
      ...shuffled.filter((id) => !this.isBossId(id)),
    ];

    this.state = 'intro';
    this.stateTimer = WAVE_TIMING.INTRO_MS;
    this.spawnTimer = 0;
    this.callbacks.onWaveStart(wave);
  }

  /** Dipanggil GameScene setelah pemain memilih upgrade. */
  advanceToNextWave(): void {
    if (this.state !== 'awaiting-upgrade') return;

    // Akhir kampanye. Tanpa mode tanpa batas, run berhenti di sini; `onAllWavesCleared`
    // hanya boleh menyala sekali, dan `state = 'finished'` menjaminnya.
    if (this.waveIndex + 1 >= WAVES.length && !this.endless) {
      this.state = 'finished';
      this.callbacks.onAllWavesCleared();
      return;
    }
    this.beginWave(this.waveIndex + 1);
  }

  /**
   * Titik spawn di luar pandangan kamera tapi masih di dalam arena.
   * Kalau kamera menempel di tepi arena, sisi itu dilewati supaya musuh tidak
   * muncul di dalam tembok.
   */
  private pickSpawnPoint(camera: Phaser.Cameras.Scene2D.Camera): { x: number; y: number } | null {
    const margin = SPAWNER.OFFSCREEN_MARGIN;
    const view = camera.worldView;
    const clampX = (x: number) => Phaser.Math.Clamp(x, 48, this.arena.width - 48);
    const clampY = (y: number) => Phaser.Math.Clamp(y, 48, this.arena.height - 48);

    const candidates: { x: number; y: number }[] = [];
    const top = view.y - margin;
    const bottom = view.bottom + margin;
    const left = view.x - margin;
    const right = view.right + margin;

    if (top > 40) candidates.push({ x: clampX(Phaser.Math.Between(view.x, view.right)), y: top });
    if (bottom < this.arena.height - 40) {
      candidates.push({ x: clampX(Phaser.Math.Between(view.x, view.right)), y: bottom });
    }
    if (left > 40) candidates.push({ x: left, y: clampY(Phaser.Math.Between(view.y, view.bottom)) });
    if (right < this.arena.width - 40) {
      candidates.push({ x: right, y: clampY(Phaser.Math.Between(view.y, view.bottom)) });
    }

    if (candidates.length === 0) return null;
    return Phaser.Utils.Array.GetRandom(candidates);
  }

  private isBossId(typeId: string): boolean {
    const type = SPAWNABLE_BY_ID.get(typeId);
    return type !== undefined && isBossType(type);
  }

  /**
   * Tipe musuh dengan stat wave tanpa batas diterapkan.
   *
   * Meng-klon, bukan mengubah objek aslinya: `SPAWNABLE_BY_ID` dipakai bersama
   * seluruh game, dan menaikkan HP-nya di tempat akan merembet ke wave berikutnya
   * dan ke sesi setelah restart. Hasilnya dimemo supaya tidak mengalokasikan
   * objek baru tiap spawn.
   */
  private scaledType(type: EnemyType, scale: number): EnemyType {
    if (scale === 1) return type;

    const kunci = `${type.id}:${scale}`;
    const cached = this.skalaCache.get(kunci);
    if (cached) return cached;

    const klon: EnemyType = {
      ...type,
      hp: Math.round(type.hp * scale),
      contactDamage: Math.round(type.contactDamage * scale),
      // Skor ikut naik: musuh yang lebih tebal harus lebih berharga, kalau tidak
      // mode tanpa batas justru memberi poin per detik yang makin sedikit.
      score: Math.round(type.score * scale),
    };
    this.skalaCache.set(kunci, klon);
    return klon;
  }

  private spawnOne(camera: Phaser.Cameras.Scene2D.Camera): void {
    const typeId = this.queue[0];
    const dasar = SPAWNABLE_BY_ID.get(typeId);
    const type = dasar ? this.scaledType(dasar, this.wave.statScale ?? 1) : undefined;
    if (!type) {
      // validateWaves() sudah menjamin ini tidak terjadi; buang saja kalau toh terjadi.
      this.queue.shift();
      return;
    }

    const point = this.pickSpawnPoint(camera);
    if (!point) return; // coba lagi frame berikutnya

    this.queue.shift();
    const enemy = this.callbacks.createEnemy(type, point.x, point.y);

    // Elite diundi di sini, bukan di data wave: peluangnya naik mengikuti nomor
    // wave, dan boss tidak boleh ikut diundi — ia sudah punya perannya sendiri.
    if (!this.isBossId(typeId) && Math.random() < eliteChance(this.wave.number)) {
      enemy.applyElite(Phaser.Utils.Array.GetRandom([...ELITES]));
    }

    this.callbacks.onSpawn(enemy);
  }

  update(delta: number, aliveCount: number, camera: Phaser.Cameras.Scene2D.Camera): void {
    const wave = this.currentWave;

    switch (this.state) {
      case 'intro':
        this.stateTimer -= delta;
        if (this.stateTimer <= 0) {
          this.state = 'spawning';
          this.spawnTimer = 0;
        }
        return;

      case 'spawning': {
        // Boss harus keluar lebih dulu dan tidak boleh tertahan batas maxAlive,
        // supaya wave boss tidak pernah kehabisan slot.
        const bossNext = this.queue.length > 0 && this.isBossId(this.queue[0]);
        this.spawnTimer -= delta;
        if (this.spawnTimer <= 0 && (bossNext || aliveCount < wave.maxAlive)) {
          this.spawnOne(camera);
          this.spawnTimer = wave.spawnIntervalMs;
        }
        if (this.queue.length === 0) this.state = 'clearing';
        return;
      }

      case 'clearing':
        if (aliveCount === 0) {
          this.state = 'awaiting-upgrade';
          this.stateTimer = WAVE_TIMING.CLEAR_DELAY_MS;
          this.callbacks.onWaveCleared(wave);
        }
        return;

      case 'awaiting-upgrade':
      case 'finished':
        return;
    }
  }
}
