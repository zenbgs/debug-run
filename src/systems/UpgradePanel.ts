import Phaser from 'phaser';
import type { AttackStyle } from '../data/classes';
import { RARITY_WEIGHT, UPGRADES, UPGRADE_CHOICES, type Upgrade } from '../data/upgrades';
import { addText, createPanel, type PanelHandle, addTapZone } from './Ui';

/**
 * Panel pilih-1-dari-3 yang muncul di antara wave.
 * Pilihan lewat tombol 1/2/3 (juga bisa diklik).
 */
export class UpgradePanel {
  private panel?: PanelHandle;
  private keyHandlers: Array<{ key: Phaser.Input.Keyboard.Key; handler: () => void }> = [];

  constructor(private readonly scene: Phaser.Scene) {}

  get isOpen(): boolean {
    return this.panel !== undefined;
  }

  /**
   * Pilih 3 upgrade yang belum mentok batas stack-nya dan cocok untuk kelas ini.
   *
   * Pengundiannya **berbobot**, bukan acak rata: upgrade `langka` yang menentukan
   * build harus terasa seperti temuan. Kalau bobotnya sama, ia muncul di hampir
   * tiap tawaran dan kehilangan bobot keputusannya.
   *
   * Kalau kandidat kurang dari 3, tampilkan seadanya — tidak diisi duplikat.
   */
  private rollChoices(taken: Map<string, number>, gaya: AttackStyle): Upgrade[] {
    const kandidat = UPGRADES.filter((u) => {
      // Upgrade khusus gaya lain adalah pilihan mati; menawarkannya memangkas
      // tawaran dari 3 jadi efektif 2.
      if (u.onlyFor !== undefined && u.onlyFor !== gaya) return false;
      if (u.maxStacks === undefined) return true;
      return (taken.get(u.id) ?? 0) < u.maxStacks;
    });

    const terpilih: Upgrade[] = [];
    const sisa = [...kandidat];
    while (terpilih.length < UPGRADE_CHOICES && sisa.length > 0) {
      const total = sisa.reduce((n, u) => n + RARITY_WEIGHT[u.rarity ?? 'umum'], 0);
      let undi = Math.random() * total;
      let index = sisa.length - 1;
      for (let i = 0; i < sisa.length; i++) {
        undi -= RARITY_WEIGHT[sisa[i].rarity ?? 'umum'];
        if (undi <= 0) {
          index = i;
          break;
        }
      }
      terpilih.push(sisa[index]);
      sisa.splice(index, 1);
    }
    return terpilih;
  }

  open(
    taken: Map<string, number>,
    gaya: AttackStyle,
    onPick: (upgrade: Upgrade) => void
  ): void {
    this.close();

    const choices = this.rollChoices(taken, gaya);
    if (choices.length === 0) {
      // Semua upgrade sudah mentok — lanjut tanpa menahan permainan.
      onPick_nothing(onPick);
      return;
    }

    const width = 330;
    const rowHeight = 26;
    const height = 44 + choices.length * rowHeight;
    const centerX = this.scene.scale.width / 2;
    const top = this.scene.scale.height / 2 - height / 2;

    this.panel = createPanel(this.scene, width, height);
    addText(this.scene, this.panel, centerX, top + 14, 'WAVE BERSIH - PILIH UPGRADE', {
      size: 7,
      color: '#ffe066',
    });

    const keyboard = this.scene.input.keyboard;
    choices.forEach((upgrade, index) => {
      const y = top + 34 + index * rowHeight;
      addText(
        this.scene,
        this.panel!,
        centerX,
        y,
        `[${index + 1}]  ${upgrade.name}`,
        { size: 8, color: '#8fd35d' }
      );
      addText(this.scene, this.panel!, centerX, y + 11, upgrade.description, {
        size: 6,
        color: '#c9c4d8',
      });

      const handler = () => {
        this.close();
        onPick(upgrade);
      };

      // Bisa diketuk, bukan hanya ditekan angkanya — di ponsel tidak ada tombol 1/2/3.
      addTapZone(this.scene, this.panel!, centerX, y + 5, width - 20, rowHeight - 2, handler);

      if (!keyboard) return;
      const key = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE + index);
      key.on('down', handler);
      this.keyHandlers.push({ key, handler });
    });
  }

  close(): void {
    for (const { key, handler } of this.keyHandlers) key.off('down', handler);
    this.keyHandlers = [];
    this.panel?.destroy();
    this.panel = undefined;
  }
}

/** Kasus tepi: tidak ada upgrade tersisa, langsung lanjut tanpa memilih. */
function onPick_nothing(onPick: (upgrade: Upgrade) => void): void {
  onPick({
    id: 'none',
    name: 'Tidak ada',
    description: 'semua upgrade sudah maksimal',
    apply: () => {},
  });
}
