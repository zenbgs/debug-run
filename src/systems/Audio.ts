/**
 * Audio prosedural via Web Audio API.
 *
 * Legacy Collection **tidak berisi satu pun file audio** (dicatat sejak audit aset di
 * SPEC §9). Daripada menambah dependensi aset baru dengan lisensi yang harus diaudit
 * lagi, semua suara di sini dibangkitkan saat runtime dari oscillator dan noise.
 * Konsekuensinya: nol byte aset, nol masalah lisensi, dan nada bisa di-tune lewat angka.
 *
 * Browser melarang AudioContext berbunyi sebelum ada interaksi pengguna — itulah
 * salah satu alasan TitleScene ada: tombol "mulai" sekaligus membuka kunci audio.
 */

export type SfxName =
  | 'swing'
  | 'hit'
  /** Pukulan tertahan perisai musuh — sengaja beda dari 'hit'. */
  | 'block'
  | 'kill'
  | 'hurt'
  | 'upgrade'
  | 'select'
  | 'waveStart'
  | 'waveClear'
  | 'bossSpawn'
  | 'gameOver'
  | 'victory';

const MASTER_VOLUME = 0.35;
const MUSIC_VOLUME = 0.1;

/** Nada pentatonik minor A — dipakai musik latar supaya selalu terdengar selaras. */
const SCALE_HZ = [220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33];

class AudioSystem {
  private ctx?: AudioContext;
  private master?: GainNode;
  private musicGain?: GainNode;
  private noiseBuffer?: AudioBuffer;

  private muted = false;
  private musicTimer?: number;
  private musicStep = 0;

  get isMuted(): boolean {
    return this.muted;
  }

  get isReady(): boolean {
    return this.ctx !== undefined;
  }

  /** Harus dipanggil dari dalam handler input pengguna. */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }

    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return; // browser tanpa Web Audio — game tetap jalan, hanya senyap

    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER_VOLUME;
    this.master.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = MUSIC_VOLUME;
    this.musicGain.connect(this.master);

    this.noiseBuffer = this.createNoiseBuffer(this.ctx);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : MASTER_VOLUME, this.ctx.currentTime, 0.02);
    }
    return this.muted;
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 0.4);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /** Satu nada dengan envelope turun. */
  private tone(
    type: OscillatorType,
    startHz: number,
    endHz: number,
    durationSec: number,
    gain: number,
    delaySec = 0
  ): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const t = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(startHz, t);
    if (endHz !== startHz)
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, endHz), t + durationSec);

    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + durationSec);

    osc.connect(env);
    env.connect(master);
    osc.start(t);
    osc.stop(t + durationSec + 0.02);
  }

  /** Semburan noise — dipakai untuk ayunan senjata dan ledakan. */
  private noise(durationSec: number, gain: number, highpassHz: number, delaySec = 0): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !this.noiseBuffer) return;

    const t = ctx.currentTime + delaySec;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = highpassHz;

    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + durationSec);

    src.connect(filter);
    filter.connect(env);
    env.connect(master);
    src.start(t);
    src.stop(t + durationSec + 0.02);
  }

  play(name: SfxName): void {
    if (!this.ctx || this.muted) return;

    switch (name) {
      case 'swing':
        this.noise(0.09, 0.22, 1400);
        break;
      case 'hit':
        this.tone('square', 420, 120, 0.09, 0.3);
        this.noise(0.05, 0.16, 900);
        break;
      // Dering logam pendek dan tinggi, tanpa derau berat: jelas terdengar
      // sebagai "tertahan", bukan sebagai pukulan lemah.
      case 'block':
        this.tone('square', 900, 700, 0.07, 0.22);
        this.tone('triangle', 1500, 1200, 0.05, 0.12);
        break;
      case 'kill':
        this.tone('sawtooth', 260, 60, 0.22, 0.28);
        this.noise(0.18, 0.2, 500);
        break;
      case 'hurt':
        this.tone('square', 320, 80, 0.2, 0.34);
        break;
      case 'upgrade':
        this.tone('triangle', 392, 392, 0.1, 0.3, 0);
        this.tone('triangle', 523.25, 523.25, 0.1, 0.3, 0.08);
        this.tone('triangle', 659.25, 659.25, 0.16, 0.3, 0.16);
        break;
      case 'select':
        this.tone('square', 660, 880, 0.06, 0.22);
        break;
      case 'waveStart':
        this.tone('triangle', 330, 330, 0.12, 0.28, 0);
        this.tone('triangle', 440, 440, 0.18, 0.28, 0.12);
        break;
      case 'waveClear':
        this.tone('triangle', 440, 440, 0.1, 0.26, 0);
        this.tone('triangle', 554.37, 554.37, 0.1, 0.26, 0.1);
        this.tone('triangle', 659.25, 659.25, 0.22, 0.26, 0.2);
        break;
      case 'bossSpawn':
        this.tone('sawtooth', 180, 45, 0.9, 0.32);
        this.noise(0.5, 0.18, 200);
        break;
      case 'gameOver':
        this.tone('triangle', 392, 392, 0.2, 0.3, 0);
        this.tone('triangle', 311.13, 311.13, 0.2, 0.3, 0.2);
        this.tone('triangle', 233.08, 233.08, 0.5, 0.3, 0.4);
        break;
      case 'victory':
        this.tone('triangle', 523.25, 523.25, 0.14, 0.3, 0);
        this.tone('triangle', 659.25, 659.25, 0.14, 0.3, 0.14);
        this.tone('triangle', 783.99, 783.99, 0.14, 0.3, 0.28);
        this.tone('triangle', 1046.5, 1046.5, 0.4, 0.3, 0.42);
        break;
    }
  }

  /**
   * Musik latar: bass + arpeggio pentatonik, dijadwalkan lewat setInterval.
   * Sengaja sederhana dan pelan — ini latar, bukan pusat perhatian.
   */
  startMusic(): void {
    if (!this.ctx || this.musicTimer !== undefined) return;

    const stepMs = 260;
    this.musicStep = 0;
    this.musicTimer = window.setInterval(() => {
      if (this.muted || !this.ctx || !this.musicGain) return;

      const step = this.musicStep++;
      const t = this.ctx.currentTime;

      // Bass tiap 4 langkah.
      if (step % 4 === 0) {
        this.scheduleMusicNote('triangle', 110, 0.45, t, 0.5);
      }
      // Arpeggio naik-turun.
      const index = step % SCALE_HZ.length;
      const hz = SCALE_HZ[step % 16 < 8 ? index : SCALE_HZ.length - 1 - index];
      this.scheduleMusicNote('square', hz, 0.18, t, 0.16);
    }, stepMs);
  }

  private scheduleMusicNote(
    type: OscillatorType,
    hz: number,
    durationSec: number,
    startTime: number,
    gain: number
  ): void {
    const ctx = this.ctx;
    const dest = this.musicGain;
    if (!ctx || !dest) return;

    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.value = hz;

    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.exponentialRampToValueAtTime(gain, startTime + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

    osc.connect(env);
    env.connect(dest);
    osc.start(startTime);
    osc.stop(startTime + durationSec + 0.02);
  }

  stopMusic(): void {
    if (this.musicTimer !== undefined) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = undefined;
    }
  }
}

/** Satu instance dipakai seluruh game. */
export const audio = new AudioSystem();
