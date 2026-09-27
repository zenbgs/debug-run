/**
 * Naskah cerita. Dipisah dari kode supaya bisa ditulis ulang tanpa menyentuh logika.
 *
 * Latarnya sengaja fantasi-RPG, bukan sci-fi: aset arena adalah hutan dan padang
 * rumput, jadi "codebase" dibingkai sebagai **Arsip** — perpustakaan mantra hidup
 * milik sebuah guild. Bug bukan serangga biasa, melainkan kesalahan tulis yang
 * menetas jadi makhluk.
 *
 * Teks sengaja TIDAK dipenggal manual. `DialogueBox` memakai word-wrap, dan
 * mencampur keduanya menghasilkan baris yatim satu kata.
 */

export type DialogueLine = {
  /** Nama penutur. String kosong = narasi tanpa penutur. */
  speaker: string;
  text: string;
  /**
   * Wajah yang ditampilkan di kotak dialog:
   *  - 'player' memakai sprite kelas yang dipilih pemain
   *  - 'boss' memakai sprite boss
   *  - undefined = tidak ada wajah (narasi murni)
   */
  portrait?: 'player' | 'boss';
};

export type StoryBeat = {
  id: string;
  lines: readonly DialogueLine[];
};

/** Dibuka sekali sebelum wave 1, setelah pemain memilih kelas. */
export const STORY_INTRO: StoryBeat = {
  id: 'intro',
  lines: [
    {
      speaker: '',
      text:
        'Arsip Guild sudah berdiri seribu tahun. Di dalamnya tersimpan setiap ' +
        'mantra yang pernah ditulis manusia, baris demi baris, rapi dan patuh.',
    },
    {
      speaker: '',
      text: 'Sampai seseorang salah menulis satu simbol. Kesalahan itu tidak mati. Ia menetas.',
    },
    {
      speaker: 'Penjaga Arsip',
      text:
        'Mereka menyebutnya Bug. Makhluk yang lahir dari mantra keliru, ' +
        'dan memakan mantra lain supaya bisa beranak.',
    },
    {
      speaker: 'Penjaga Arsip',
      text:
        'Kami sudah kehilangan sepuluh lapis Arsip. Kau masuk lewat lapis terluar, ' +
        'dan tidak boleh keluar sebelum lapis terakhir bersih.',
    },
    {
      speaker: 'Kamu',
      text: 'Sepuluh lapis. Satu nyawa. Baiklah.',
      portrait: 'player',
    },
  ],
};

/** Dibuka saat wave boss dimulai, dikunci berdasarkan nomor wave. */
export const STORY_BOSS: Record<number, StoryBeat> = {
  5: {
    id: 'boss-5',
    lines: [
      {
        speaker: '',
        text:
          'Lantai lapis kelima bergetar. Sesuatu yang jauh lebih besar sedang ' +
          'menarik dirinya keluar dari tumpukan mantra.',
      },
      {
        speaker: 'Stack Overflow',
        text: 'AKU MEMANGGIL DIRIKU SENDIRI. DAN PANGGILAN ITU MEMANGGIL DIRINYA SENDIRI. TANPA HENTI.',
        portrait: 'boss',
      },
      {
        speaker: 'Kamu',
        text: 'Kalau begitu aku cukup memutus satu panggilan saja.',
        portrait: 'player',
      },
    ],
  },
  10: {
    id: 'boss-10',
    lines: [
      {
        speaker: '',
        text:
          'Lapis terakhir kosong. Tidak ada rak, tidak ada mantra. ' +
          'Hanya ruang yang menolak untuk ada.',
      },
      {
        speaker: 'Null Pointer',
        text: 'KAU MENCARI SESUATU DI SINI. TIDAK ADA APA-APA DI SINI. AKULAH KETIADAAN ITU.',
        portrait: 'boss',
      },
      {
        speaker: 'Kamu',
        text:
          'Aku sudah membaca sepuluh lapis untuk sampai ke sini. ' +
          'Sesuatu yang mengaku tidak ada masih bisa kupukul.',
        portrait: 'player',
      },
    ],
  },
};

/** Dibuka setelah wave 10 selesai. */
export const STORY_VICTORY: StoryBeat = {
  id: 'victory',
  lines: [
    {
      speaker: '',
      text:
        'Ruang kosong itu menutup. Rak-rak kembali terlihat satu per satu, ' +
        'seperti orang yang bangun dari pingsan.',
    },
    {
      speaker: 'Penjaga Arsip',
      text:
        'Sepuluh lapis bersih. Arsip akan menulis ulang dirinya malam ini. ' +
        'Tapi kau tahu bagaimana ini bekerja, bukan?',
    },
    {
      speaker: 'Kamu',
      text: 'Ya. Besok ada yang salah menulis lagi.',
      portrait: 'player',
    },
    {
      speaker: 'Penjaga Arsip',
      text: 'Dan kau akan turun lagi. Sampai jumpa di lapis pertama.',
    },
  ],
};

export const DIALOGUE = {
  /** Kecepatan ketik, huruf per detik. */
  CHARS_PER_SECOND: 45,
  /** Lebar kotak dialog dalam piksel logis. */
  BOX_WIDTH: 452,
  BOX_HEIGHT: 86,
} as const;
