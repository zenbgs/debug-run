import { COMBO_SCORE } from '../data/waves';

/**
 * Rantai bunuh beruntun dan pengali skornya.
 *
 * Sengaja **murni** — tanpa Phaser, tanpa scene, tanpa waktu global. Waktu
 * diterima sebagai argumen. Ini membuatnya bisa diuji tanpa menyetir browser,
 * yang selama ini jadi satu-satunya cara memverifikasi dan berkali-kali memakan
 * waktu karena artefak yang bukan bug (tab ter-throttle, state basi).
 */
export class ScoreStreak {
  private streak = 0;
  private lastKillAt = Number.NEGATIVE_INFINITY;
  private multiplier = 1;
  private bestSoFar = 1;

  get current(): number {
    return this.multiplier;
  }

  get best(): number {
    return this.bestSoFar;
  }

  get killsInStreak(): number {
    return this.streak;
  }

  reset(): void {
    this.streak = 0;
    this.lastKillAt = Number.NEGATIVE_INFINITY;
    this.multiplier = 1;
    this.bestSoFar = 1;
  }

  /**
   * Catat satu bunuh.
   * @param now waktu sekarang dalam ms
   * @returns pengali yang berlaku untuk bunuh ini
   */
  registerKill(now: number): number {
    if (now - this.lastKillAt > COMBO_SCORE.WINDOW_MS) this.streak = 0;
    this.lastKillAt = now;
    this.streak++;

    this.multiplier = Math.min(
      COMBO_SCORE.MAX_MULTIPLIER,
      1 + Math.floor(this.streak / COMBO_SCORE.KILLS_PER_STEP)
    );
    this.bestSoFar = Math.max(this.bestSoFar, this.multiplier);
    return this.multiplier;
  }

  /**
   * Pemain kena pukul.
   *
   * Dulu ini mereset rantai ke nol. Terukur hasilnya: dalam satu sesi dengan 22
   * musuh dibasmi, pengali **tidak pernah naik di atas 1** — pemain biasa terlalu
   * sering kena, jadi fiturnya praktis tidak pernah terasa. Sekarang kena pukul
   * menurunkan satu tingkat, bukan menghapus semuanya: tetap menghukum, tapi
   * bermain rapi masih bisa membangun rantai.
   */
  onPlayerHit(): void {
    if (!COMBO_SCORE.DROP_ON_HIT) return;
    this.streak = Math.max(0, this.streak - COMBO_SCORE.KILLS_PER_STEP);
    this.multiplier = Math.min(
      COMBO_SCORE.MAX_MULTIPLIER,
      1 + Math.floor(this.streak / COMBO_SCORE.KILLS_PER_STEP)
    );
  }
}
