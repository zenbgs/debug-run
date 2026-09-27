import Phaser from 'phaser';

/**
 * Menjamin sebuah GameObject ikut dibersihkan kalau scene mati di tengah jalan,
 * **tanpa meninggalkan listener menumpuk**.
 *
 * Pola lama di kode ini adalah `scene.events.once(SHUTDOWN, () => obj.destroy())`
 * untuk tiap sprite FX. Masalahnya: kalau sprite mati normal (animasi selesai),
 * listener-nya tidak pernah dilepas. Terukur: **+200 listener `shutdown` hanya dari
 * ~200 pemutaran FX**, dan tiap emit `shutdown` harus menyusuri seluruh daftar itu.
 *
 * Di sini listener dilepas begitu objeknya hancur, jadi jumlahnya selalu sebanding
 * dengan objek yang benar-benar hidup.
 */
export function destroyWithScene(
  scene: Phaser.Scene,
  obj: Phaser.GameObjects.GameObject
): void {
  const onShutdown = () => obj.destroy();
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
  obj.once(Phaser.GameObjects.Events.DESTROY, () => {
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
  });
}
