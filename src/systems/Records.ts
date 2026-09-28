/**
 * Rekor terbaik per kelas, bertahan antar sesi. (SPEC.md §9.1)
 *
 * Sebelum ini tidak ada penyimpanan sama sekali di seluruh project: skor akhir
 * tampil di satu panel lalu hilang selamanya. Tidak ada alasan mencoba kelas lain
 * setelah tamat, dan tidak ada apa pun yang bisa dikejar.
 *
 * Logika penggabungan sengaja **murni** dan dipisah dari `localStorage` — pola
 * yang sama dengan `ScoreStreak.ts`. Bagian yang menyentuh browser tinggal dua
 * fungsi tipis di bawah, dan keduanya tidak boleh melempar.
 */

const KUNCI = 'debug-run:records:v1';
const VERSI = 1 as const;

export type RunResult = {
  score: number;
  /** Wave terjauh yang dicapai. */
  wave: number;
  /** Pengali rantai tertinggi dalam run itu. */
  bestChain: number;
  kills: number;
  /** Apakah run ini sempat masuk mode tanpa batas. */
  endless: boolean;
};

export type RecordEntry = RunResult & {
  /** Tanggal ISO saat rekor dibuat. Hanya untuk ditampilkan. */
  at: string;
};

export type Records = {
  version: typeof VERSI;
  perClass: Record<string, RecordEntry>;
};

export function emptyRecords(): Records {
  return { version: VERSI, perClass: {} };
}

/**
 * Gabungkan hasil satu run ke rekor.
 *
 * Tiap medan diambil **maksimumnya masing-masing**: pemain yang pernah mencapai
 * wave 14 tapi skornya rendah tetap berhak atas "wave terjauh 14", meski run
 * lain mencetak skor lebih tinggi di wave 9.
 *
 * `pecahRekor` hanya bernilai true kalau **skor** terlampaui. Skor adalah angka
 * utamanya; mengumumkan "rekor baru" karena jumlah kill naik satu terasa murahan
 * dan membuat labelnya tidak berarti.
 *
 * Murni — tidak menyentuh `localStorage`, tidak mengubah `records` yang masuk.
 */
export function mergeRun(
  records: Records,
  classId: string,
  run: RunResult,
  now: Date = new Date()
): { records: Records; pecahRekor: boolean } {
  const sebelumnya = records.perClass[classId];
  const pecahRekor = sebelumnya === undefined || run.score > sebelumnya.score;

  const gabung: RecordEntry = {
    score: Math.max(run.score, sebelumnya?.score ?? 0),
    wave: Math.max(run.wave, sebelumnya?.wave ?? 0),
    bestChain: Math.max(run.bestChain, sebelumnya?.bestChain ?? 0),
    kills: Math.max(run.kills, sebelumnya?.kills ?? 0),
    endless: run.endless || (sebelumnya?.endless ?? false),
    // Tanggal hanya diperbarui saat skornya benar-benar pecah.
    at: pecahRekor ? now.toISOString() : (sebelumnya?.at ?? now.toISOString()),
  };

  return {
    records: {
      version: VERSI,
      perClass: { ...records.perClass, [classId]: gabung },
    },
    pecahRekor,
  };
}

/** Rekor kelas tertentu, atau `undefined` kalau kelas itu belum pernah dimainkan. */
export function recordFor(records: Records, classId: string): RecordEntry | undefined {
  return records.perClass[classId];
}

/** Benarkah bentuk objeknya? Data di localStorage bisa berasal dari versi mana pun. */
function entriSah(nilai: unknown): nilai is RecordEntry {
  if (typeof nilai !== 'object' || nilai === null) return false;
  const e = nilai as Record<string, unknown>;
  return (
    typeof e.score === 'number' &&
    Number.isFinite(e.score) &&
    typeof e.wave === 'number' &&
    typeof e.bestChain === 'number' &&
    typeof e.kills === 'number'
  );
}

/**
 * Baca rekor dari `localStorage`.
 *
 * Apa pun yang aneh — JSON rusak, versi lain, entri setengah jadi, atau
 * `localStorage` yang tidak bisa diakses — menghasilkan rekor **kosong**, bukan
 * lemparan. Data tersimpan tidak boleh sanggup membuat layar judul gagal dimuat.
 */
export function loadRecords(): Records {
  try {
    if (typeof localStorage === 'undefined') return emptyRecords();

    const mentah = localStorage.getItem(KUNCI);
    if (!mentah) return emptyRecords();

    const data = JSON.parse(mentah) as unknown;
    if (typeof data !== 'object' || data === null) return emptyRecords();

    const obj = data as Record<string, unknown>;
    if (obj.version !== VERSI) return emptyRecords();
    if (typeof obj.perClass !== 'object' || obj.perClass === null) return emptyRecords();

    // Entri yang bentuknya salah dibuang satu per satu; sisanya tetap dipakai.
    const bersih: Record<string, RecordEntry> = {};
    for (const [id, nilai] of Object.entries(obj.perClass as Record<string, unknown>)) {
      if (entriSah(nilai)) {
        bersih[id] = {
          ...nilai,
          endless: Boolean((nilai as RecordEntry).endless),
          at: typeof (nilai as RecordEntry).at === 'string' ? (nilai as RecordEntry).at : '',
        };
      }
    }
    return { version: VERSI, perClass: bersih };
  } catch {
    return emptyRecords();
  }
}

/**
 * Simpan rekor. Gagal dalam diam kalau tidak bisa.
 *
 * Safari mode privat melempar `QuotaExceededError` pada `setItem` yang paling
 * sepele sekalipun; permainan tidak boleh ikut mati hanya karena rekornya tidak
 * bisa dicatat.
 */
export function saveRecords(records: Records): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(KUNCI, JSON.stringify(records));
  } catch {
    // Sengaja diabaikan.
  }
}

/** Baca, gabung, simpan. Dipakai di akhir run. */
export function commitRun(
  classId: string,
  run: RunResult
): { entry: RecordEntry; sebelumnya?: RecordEntry; pecahRekor: boolean } {
  const sekarang = loadRecords();
  const sebelumnya = recordFor(sekarang, classId);
  const { records, pecahRekor } = mergeRun(sekarang, classId, run);
  saveRecords(records);
  return { entry: records.perClass[classId], sebelumnya, pecahRekor };
}
