import Phaser from 'phaser';
import { UPGRADES, UPGRADE_CHOICES, type Upgrade } from '../data/upgrades';
import { addText, createPanel, type PanelHandle } from './Ui';

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
   * Pilih 3 upgrade acak yang belum mentok batas stack-nya.
   * Kalau kandidat kurang dari 3, tampilkan seadanya — tidak diisi duplikat.
   */
  private rollChoices(taken: Map<string, number>): Upgrade[] {
    const eligible = UPGRADES.filter((upgrade) => {
      if (upgrade.maxStacks === undefined) return true;
      return (taken.get(upgrade.id) ?? 0) < upgrade.maxStacks;
    });
    return Phaser.Utils.Array.Shuffle([...eligible]).slice(0, UPGRADE_CHOICES);
  }

  open(taken: Map<string, number>, onPick: (upgrade: Upgrade) => void): void {
    this.close();

    const choices = this.rollChoices(taken);
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

      if (!keyboard) return;
      const key = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE + index);
      const handler = () => {
        this.close();
        onPick(upgrade);
      };
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
