import Phaser from 'phaser';
import { FONT_FAMILY } from '../data/config';

/**
 * Angka damage melayang.
 *
 * Tanpa ini pemain tidak punya cara tahu apakah upgrade "+25% damage" benar-benar
 * berpengaruh — satu-satunya umpan balik adalah musuh mati lebih cepat, yang terlalu
 * halus untuk dirasakan.
 *
 * Objek teks **dikumpulkan dalam pool**: membuat `Text` baru tiap pukulan berarti
 * membuat texture canvas baru tiap kali, jauh lebih mahal daripada sprite biasa.
 */

const DEPTH = 60;
const POOL_SIZE = 18;
const RISE_PX = 18;
const LIFETIME_MS = 520;

type Slot = {
  text: Phaser.GameObjects.Text;
  /** Sisa umur; <= 0 berarti bebas dipakai lagi. */
  remaining: number;
};

export class DamageNumbers {
  private readonly slots: Slot[] = [];
  private next = 0;

  constructor(scene: Phaser.Scene) {
    for (let i = 0; i < POOL_SIZE; i++) {
      const text = scene.add
        .text(0, 0, '', {
          fontFamily: FONT_FAMILY,
          fontSize: '6px',
          color: '#ffffff',
        })
        .setOrigin(0.5, 1)
        .setDepth(DEPTH)
        .setVisible(false);
      this.slots.push({ text, remaining: 0 });
    }
  }

  /**
   * @param kind `hit` = damage ke musuh, `hurt` = damage ke pemain,
   *             `crit` = pukulan besar (finisher/skill).
   */
  show(x: number, y: number, amount: number, kind: 'hit' | 'hurt' | 'crit' = 'hit'): void {
    const bulat = Math.max(1, Math.round(amount));
    // Pool dipakai berputar: kalau penuh, angka tertua diambil alih. Lebih baik
    // kehilangan satu angka lama daripada mengalokasi Text baru di tengah tempur.
    const slot = this.slots[this.next];
    this.next = (this.next + 1) % this.slots.length;

    slot.remaining = LIFETIME_MS;
    slot.text
      .setText(kind === 'hurt' ? `-${bulat}` : `${bulat}`)
      .setColor(kind === 'hurt' ? '#ff6b6b' : kind === 'crit' ? '#ffe066' : '#ffffff')
      .setFontSize(kind === 'crit' ? 8 : 6)
      .setPosition(x + Phaser.Math.Between(-4, 4), y - 6)
      .setAlpha(1)
      .setVisible(true);
  }

  update(delta: number): void {
    for (const slot of this.slots) {
      if (slot.remaining <= 0) continue;

      slot.remaining -= delta;
      if (slot.remaining <= 0) {
        slot.text.setVisible(false);
        continue;
      }

      const t = 1 - slot.remaining / LIFETIME_MS;
      slot.text.y -= (RISE_PX * delta) / LIFETIME_MS;
      // Memudar di paruh kedua saja, supaya angkanya sempat terbaca.
      slot.text.setAlpha(t < 0.5 ? 1 : 1 - (t - 0.5) * 2);
    }
  }
}
