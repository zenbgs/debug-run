import Phaser from 'phaser';
import { DEPTH } from '../data/depth';
import { behindFor, GRIP, poseFor, SWING, WEAPON_TIMING, type WeaponKind } from '../data/weapons';
import type { Facing, Player } from '../entities/Player';

/**
 * Senjata yang terlihat di tangan pemain.
 *
 * Satu sprite hamparan yang mengikuti pemain tiap frame, bukan gambar yang
 * dibakar ke spritesheet. Alasannya ada dua, dan keduanya terlihat saat bermain:
 *
 *  1. Senjata bisa MENGAYUN. Kalau dibakar, ia ikut membeku dan menyerang terasa
 *     seperti menggeser stiker. Di sini ia terangkat saat ancang-ancang lalu
 *     mengayun tepat saat hitbox aktif.
 *  2. Urutan gambar bisa ikut arah hadap. Saat pemain membelakangi kamera,
 *     senjata WAJIB berada di belakang badan — kalau tidak, bilahnya menutupi
 *     kepala dan pemain terlihat seperti tertusuk.
 *
 * Sistem ini tidak tahu apa-apa soal damage. Ia murni tampilan; hitbox tetap
 * milik `CombatSystem`. Memisahkannya berarti ayunan bisa diubah sesuka hati
 * tanpa menyentuh keseimbangan sama sekali.
 */
export class WeaponVisual {
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly kind: WeaponKind;
  /** Titik genggam diukur per KELAS — sprite ketiganya menaruh tangan berbeda. */
  private readonly classId: string;

  /** Sudut tambahan dari ayunan, di atas rotasi pose diam. */
  private ayunan = 0;
  /** Dorongan keluar dari ayunan, piksel. */
  private dorongan = 0;
  private tween?: Phaser.Tweens.Tween;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Player
  ) {
    const senjata = player.playerClass.weapon;
    this.kind = senjata.kind;
    this.classId = player.playerClass.id;
    this.sprite = scene.add
      .sprite(player.x, player.y, senjata.texture)
      // Titik putar di GENGGAMAN, bukan di tengah sprite: senjata berputar pada
      // tangan seperti benda sungguhan. Dengan origin tengah, bilahnya berputar
      // pada titik di udara dan ayunannya terbaca seperti baling-baling.
      // Letaknya beda per jenis — lihat `GRIP`.
      .setOrigin(0.5, GRIP[senjata.kind])
      .setDepth(DEPTH.PLAYER + 1);

    // ⚠️ POST_UPDATE, bukan `scene.update()`.
    //
    // Arcade Physics menyalin posisi badan ke sprite pada POST_UPDATE, yaitu
    // SETELAH `scene.update()` selesai. Memposisikan senjata dari dalam
    // `scene.update()` berarti membacanya dari posisi frame sebelumnya, dan
    // senjata tertinggal satu frame di belakang pemain — terukur: saat berjalan
    // ke bawah, selisihnya 1,7 px padahal pose-nya menetapkan 1 px, persis satu
    // frame pada 110 px/detik. Terlihat sebagai senjata yang "menyeret".
    //
    // Plugin fisika mendaftar saat scene boot, jauh sebelum sistem ini dibuat,
    // jadi pendengar di sini dijamin berjalan setelah penyalinan itu.
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.sync, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);

    this.sync();
  }

  /**
   * Mulai ayunan.
   *
   * @param windupMs lama ancang-ancang. Senjata terangkat selama ini, lalu
   *   mengayun tepat saat habis — yaitu saat hitbox menyala.
   */
  swing(windupMs: number): void {
    const bentuk = SWING[this.kind];
    this.tween?.stop();

    // Fase 1: terangkat berlawanan arah ayunan. Inilah ancang-ancangnya, dan
    // durasinya sengaja diikat ke windup serangan supaya keduanya tidak pernah
    // lepas sinkron kalau angka combat diubah.
    this.tween = this.scene.tweens.addCounter({
      from: this.ayunan,
      to: bentuk.angkat,
      duration: Math.max(1, windupMs),
      ease: 'Sine.easeOut',
      onUpdate: (t) => {
        this.ayunan = t.getValue() ?? 0;
      },
      onComplete: () => {
        // Fase 2: ayunan itu sendiri — cepat, karena inilah pukulannya.
        this.tween = this.scene.tweens.addCounter({
          from: bentuk.angkat,
          to: bentuk.ayun,
          duration: WEAPON_TIMING.AYUN_MS,
          ease: 'Quad.easeIn',
          onUpdate: (t) => {
            const n = t.getValue() ?? 0;
            this.ayunan = n;
            // Dorongan mengikuti seberapa jauh ayunan sudah berjalan, jadi
            // senjata terasa terlempar keluar lalu ditarik kembali.
            const maju = (n - bentuk.angkat) / (bentuk.ayun - bentuk.angkat || 1);
            this.dorongan = bentuk.dorong * maju;
          },
          onComplete: () => {
            // Fase 3: kembali ke pose diam.
            this.tween = this.scene.tweens.addCounter({
              from: bentuk.ayun,
              to: 0,
              duration: WEAPON_TIMING.PULIH_MS,
              ease: 'Sine.easeOut',
              onUpdate: (t) => {
                const n = t.getValue() ?? 0;
                this.ayunan = n;
                this.dorongan = (bentuk.dorong * n) / (bentuk.ayun || 1);
              },
              onComplete: () => {
                this.ayunan = 0;
                this.dorongan = 0;
              },
            });
          },
        });
      },
    });
  }

  private sync(): void {
    if (!this.player.active) {
      this.sprite.setVisible(false);
      return;
    }

    const facing: Facing = this.player.getFacing();
    const pose = poseFor(this.classId, facing);

    // Ayunan ditandatangani mengikuti tanda sudut diamnya, bukan `flip`.
    //
    // Memakai `flip` salah untuk hadap ATAS, yang sudut diamnya sudah negatif
    // tanpa mencerminkan sprite: ayunannya akan berlawanan arah dengan pose
    // diamnya sendiri, dan senjata menebas masuk ke dalam badan.
    const arah = pose.rotation < 0 || pose.x < 0 ? -1 : 1;
    const rotasi = pose.rotation + this.ayunan * arah;

    // Dorongan keluar diarahkan sepanjang sumbu senjata yang sedang berputar,
    // bukan sepanjang arah hadap — dengan begitu ia tetap menempel di tangan.
    const dorong = this.dorongan;
    this.sprite.setPosition(
      this.player.x + pose.x + Math.sin(rotasi) * dorong,
      this.player.y + pose.y - Math.cos(rotasi) * dorong
    );
    this.sprite.setRotation(rotasi);
    this.sprite.setFlipX(pose.flip);
    this.sprite.setVisible(this.player.visible);
    this.sprite.setAlpha(this.player.alpha);
    this.sprite.setDepth(behindFor(this.kind, facing) ? DEPTH.PLAYER - 1 : DEPTH.PLAYER + 1);
  }

  destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.sync, this);
    this.tween?.stop();
    this.sprite.destroy();
  }
}
