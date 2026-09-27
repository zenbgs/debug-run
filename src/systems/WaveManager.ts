import Phaser from 'phaser';
import { isBossType, SPAWNABLE_BY_ID } from '../data/bosses';
import { SPAWNER, type EnemyType } from '../data/enemies';
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
 * Menjalankan 10 wave berjadwal. (SPEC.md §6.1)
 *
 * Siklus per wave: intro (banner) → spawning (musuh keluar bertahap) →
 * clearing (menunggu sisa musuh habis) → awaiting-upgrade (GameScene menampilkan
 * pilihan upgrade, manager berhenti) → wave berikutnya.
 */
export class WaveManager {
  private state: WaveState = 'intro';
  private waveIndex = 0;
  private stateTimer = 0;
  private spawnTimer = 0;
  /** Sisa musuh yang belum dikeluarkan pada wave berjalan. */
  private queue: string[] = [];

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
    return WAVES[Math.min(this.waveIndex, WAVES.length - 1)];
  }

  get currentState(): WaveState {
    return this.state;
  }

  get waveNumber(): number {
    return this.currentWave.number;
  }

  get totalWaves(): number {
    return WAVES.length;
  }

  /** Sisa musuh wave ini yang belum keluar. */
  get remainingInQueue(): number {
    return this.queue.length;
  }

  get isFinished(): boolean {
    return this.state === 'finished';
  }

  private beginWave(index: number): void {
    this.waveIndex = index;
    const wave = WAVES[index];

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
    if (this.waveIndex + 1 >= WAVES.length) {
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

  private spawnOne(camera: Phaser.Cameras.Scene2D.Camera): void {
    const typeId = this.queue[0];
    const type = SPAWNABLE_BY_ID.get(typeId);
    if (!type) {
      // validateWaves() sudah menjamin ini tidak terjadi; buang saja kalau toh terjadi.
      this.queue.shift();
      return;
    }

    const point = this.pickSpawnPoint(camera);
    if (!point) return; // coba lagi frame berikutnya

    this.queue.shift();
    const enemy = this.callbacks.createEnemy(type, point.x, point.y);
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
