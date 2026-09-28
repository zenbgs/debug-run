import Phaser from 'phaser';

/**
 * Sentakan kamera: zoom pendek untuk menandai kejadian penting.
 *
 * ⚠️ **Zoom pada pixel art mahal secara visual.** Kanvas sudah diskalakan oleh
 * `Scale.FIT` dengan faktor pecahan, dan zoom kamera menumpuk di atasnya: nilai
 * besar membuat piksel bergetar dan garis tile tampak berombak. Karena itu semua
 * angka di bawah kecil, dan sentakannya pendek — yang dicari adalah rasa hentak,
 * bukan perubahan sudut pandang.
 *
 * Zoom juga SELALU kembali ke 1 lewat tween yang sama, jadi dua kejadian yang
 * bertumpuk tidak bisa meninggalkan kamera dalam keadaan ter-zoom permanen.
 */
export const CAMERA_FX = {
  /** Sentakan saat memukul jatuh musuh. */
  KILL_ZOOM: 1.012,
  KILL_MS: 90,

  /** Sentakan lebih besar saat boss muncul. */
  BOSS_ZOOM: 1.06,
  BOSS_IN_MS: 180,
  BOSS_OUT_MS: 520,

  /** Melebar sedikit saat dash — memberi kesan cepat. */
  DASH_ZOOM: 0.975,
  DASH_MS: 120,

  /** Sentakan saat pemain kena. */
  HURT_ZOOM: 1.02,
  HURT_MS: 110,

  /** Denyut saat wave bersih. */
  CLEAR_ZOOM: 1.03,
  CLEAR_MS: 200,
} as const;

/**
 * Pengelola sentakan kamera.
 *
 * Satu tween aktif pada satu waktu. Tanpa itu, dua sentakan yang beririsan akan
 * saling menimpa dan salah satunya menyelesaikan tween-nya dengan nilai kembali
 * yang sudah basi — kamera berhenti di zoom yang bukan 1.
 */
export class CameraFx {
  private tween?: Phaser.Tweens.Tween;
  private readonly camera: Phaser.Cameras.Scene2D.Camera;

  constructor(private readonly scene: Phaser.Scene) {
    this.camera = scene.cameras.main;
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.reset());
  }

  /**
   * Zoom ke `nilai` lalu kembali ke 1 dengan durasi yang sama.
   * @param tahanMs jeda di puncak sebelum kembali. 0 = langsung balik.
   */
  punch(nilai: number, masukMs: number, tahanMs = 0): void {
    this.tween?.remove();
    this.camera.setZoom(this.camera.zoom);

    this.tween = this.scene.tweens.add({
      targets: this.camera,
      zoom: nilai,
      duration: masukMs,
      ease: 'Quad.Out',
      yoyo: true,
      hold: tahanMs,
      repeat: 0,
      // `yoyo` memakai durasi yang sama untuk balik. Kalau butuh balik yang lebih
      // lambat — mis. kemunculan boss — pakai `punchLambat`.
      onComplete: () => {
        this.camera.setZoom(1);
        this.tween = undefined;
      },
    });
  }

  /** Zoom masuk cepat lalu mengendur pelan — dipakai kemunculan boss. */
  punchLambat(nilai: number, masukMs: number, keluarMs: number): void {
    this.tween?.remove();

    this.tween = this.scene.tweens.add({
      targets: this.camera,
      zoom: nilai,
      duration: masukMs,
      ease: 'Quad.Out',
      onComplete: () => {
        this.tween = this.scene.tweens.add({
          targets: this.camera,
          zoom: 1,
          duration: keluarMs,
          ease: 'Sine.InOut',
          onComplete: () => {
            this.camera.setZoom(1);
            this.tween = undefined;
          },
        });
      },
    });
  }

  onKill(): void {
    this.punch(CAMERA_FX.KILL_ZOOM, CAMERA_FX.KILL_MS);
  }

  onHurt(): void {
    this.punch(CAMERA_FX.HURT_ZOOM, CAMERA_FX.HURT_MS);
  }

  onDash(): void {
    this.punch(CAMERA_FX.DASH_ZOOM, CAMERA_FX.DASH_MS);
  }

  onWaveCleared(): void {
    this.punch(CAMERA_FX.CLEAR_ZOOM, CAMERA_FX.CLEAR_MS);
  }

  onBossSpawn(): void {
    this.punchLambat(CAMERA_FX.BOSS_ZOOM, CAMERA_FX.BOSS_IN_MS, CAMERA_FX.BOSS_OUT_MS);
  }

  /** Paksa kembali ke normal. Dipakai saat scene berakhir atau permainan beku. */
  reset(): void {
    this.tween?.remove();
    this.tween = undefined;
    this.camera.setZoom(1);
  }
}
