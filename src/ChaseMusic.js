const LOOP_BEATS = 16;

/** Chase theme intensifies at 1 km and 3 km; switches to late theme at 5 km. */
export const CHASE_TIER_THRESHOLDS = [1000, 3000];
export const LATE_SONG_DISTANCE = 5000;
/** @deprecated use CHASE_TIER_THRESHOLDS */
export const MUSIC_TIER_THRESHOLDS = CHASE_TIER_THRESHOLDS;

const CHASE_MUSIC_TIERS = [
  {
    bpm: 118,
    kickVol: 0.62,
    snareVol: 0.34,
    melodyVol: 0.1,
    bassNotes: [110, 130.81, 146.83, 123.47],
    bassPattern: [0, 0, 1, 2, 0, 1, 3, 1, 2, 0, 1, 0, 2, 3, 1, 0],
    padChords: [
      [220, 261.63, 329.63],
      [261.63, 329.63, 392],
      [196, 246.94, 293.66],
      [174.61, 220, 261.63],
    ],
    melodyNotes: [440, 523.25, 659.25, 587.33, 523.25, 440, 392, 440],
    arpScale: [440, 523.25, 587.33, 659.25, 783.99],
  },
  {
    bpm: 124,
    kickVol: 0.68,
    snareVol: 0.38,
    melodyVol: 0.11,
    bassNotes: [130.81, 164.81, 196, 146.83],
    bassPattern: [0, 1, 0, 2, 1, 3, 2, 1, 0, 2, 1, 0, 3, 2, 1, 0],
    padChords: [
      [261.63, 329.63, 392],
      [392, 493.88, 587.33],
      [440, 523.25, 659.25],
      [349.23, 440, 523.25],
    ],
    melodyNotes: [523.25, 659.25, 783.99, 659.25, 587.33, 523.25, 587.33, 659.25],
    arpScale: [523.25, 587.33, 659.25, 783.99, 880],
  },
  {
    bpm: 132,
    kickVol: 0.72,
    snareVol: 0.42,
    melodyVol: 0.12,
    bassNotes: [130.81, 164.81, 196, 220],
    bassPattern: [0, 0, 1, 0, 2, 1, 3, 1, 0, 2, 1, 0, 2, 3, 1, 0],
    padChords: [
      [261.63, 329.63, 392],
      [349.23, 440, 523.25],
      [392, 493.88, 587.33],
      [440, 523.25, 659.25],
    ],
    melodyNotes: [587.33, 659.25, 783.99, 880, 783.99, 659.25, 587.33, 523.25],
    arpScale: [587.33, 659.25, 783.99, 880, 987.77],
  },
];

/** Victory disco after 5 km — faster, stabs, four-on-the-floor (distinct from chase groove). */
const LATE_MUSIC_TIERS = [
  {
    bpm: 142,
    style: 'disco',
    kickVol: 0.74,
    clapVol: 0.46,
    melodyVol: 0.13,
    stabVol: 0.08,
    bassNotes: [73.42, 92.5, 110, 82.41],
    bassPattern: [0, 0, 1, 0, 2, 0, 1, 0, 3, 0, 2, 0, 1, 3, 0, 0],
    stabChords: [
      [293.66, 369.99, 440],
      [246.94, 311.13, 369.99],
      [329.63, 415.3, 493.88],
      [277.18, 349.23, 415.3],
    ],
    melodyNotes: [880, 987.77, 1108.73, 987.77, 880, 739.99, 880, 987.77],
    sparkleScale: [987.77, 1108.73, 1318.51, 1174.66, 987.77],
  },
];

export function musicProfileForDistance(distance) {
  const d = Math.floor(distance);
  if (d >= LATE_SONG_DISTANCE) return { song: 'late', tier: 0 };
  if (d >= CHASE_TIER_THRESHOLDS[1]) return { song: 'chase', tier: 2 };
  if (d >= CHASE_TIER_THRESHOLDS[0]) return { song: 'chase', tier: 1 };
  return { song: 'chase', tier: 0 };
}

/** @deprecated use musicProfileForDistance */
export function musicTierForDistance(distance) {
  const profile = musicProfileForDistance(distance);
  return profile.song === 'late' ? 3 : profile.tier;
}

export class ChaseMusic {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.playing = false;
    this.paused = false;
    this.danger = 0;
    this.song = 'chase';
    this.tier = 0;
    this.nextBeat = 0;
    this.beatIndex = 0;
    this.schedulerId = null;
    this.pauseStarted = 0;
    this.enabled = true;
  }

  get tierConfig() {
    const tiers = this.song === 'late' ? LATE_MUSIC_TIERS : CHASE_MUSIC_TIERS;
    return tiers[this.tier] ?? tiers[0];
  }

  get beatDuration() {
    return 60 / this.tierConfig.bpm;
  }

  setProfile({ song = 'chase', tier = 0 } = {}) {
    const nextSong = song === 'late' ? 'late' : 'chase';
    const tiers = nextSong === 'late' ? LATE_MUSIC_TIERS : CHASE_MUSIC_TIERS;
    const nextTier = Math.max(0, Math.min(tiers.length - 1, tier));
    if (this.song === nextSong && this.tier === nextTier) return;
    this.song = nextSong;
    this.tier = nextTier;
    if (this.playing) {
      this.beatIndex = 0;
    }
  }

  setTier(tier) {
    this.setProfile({ song: 'chase', tier });
  }

  setEnabled(on) {
    this.enabled = on;
    if (!this.ctx || !this.master) return;

    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    const target = on && this.playing ? 0.45 : 0;
    this.master.gain.linearRampToValueAtTime(target, t + 0.2);

    if (!on) {
      this.stopScheduler();
    } else if (this.playing && !this.paused) {
      this.schedule();
    }
  }

  isEnabled() {
    return this.enabled;
  }

  getContext() {
    this.init();
    return this.ctx;
  }

  stopScheduler() {
    if (this.schedulerId) {
      clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
  }

  init() {
    if (this.ctx) return;

    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;

    const bufferSize = Math.floor(this.ctx.sampleRate * 0.05);
    this.hihatBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = this.hihatBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -24;
    comp.ratio.value = 12;

    this.master.connect(comp);
    comp.connect(this.ctx.destination);
  }

  async start() {
    this.init();
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    if (this.playing) return;
    this.paused = false;
    this.playing = true;
    this.nextBeat = this.ctx.currentTime + 0.05;
    this.beatIndex = 0;

    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setValueAtTime(0, this.ctx.currentTime);
    this.master.gain.linearRampToValueAtTime(this.enabled ? 0.45 : 0, this.ctx.currentTime + 1.5);

    this.schedule();
  }

  stop() {
    if (!this.ctx || (!this.playing && !this.paused)) return;
    this.playing = false;
    this.paused = false;
    this.song = 'chase';
    this.tier = 0;

    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0, t + 1);

    if (this.schedulerId) {
      this.stopScheduler();
    }
  }

  pause() {
    if (!this.ctx || !this.playing || this.paused) return;
    this.playing = false;
    this.paused = true;
    this.pauseStarted = this.ctx.currentTime;

    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0, t + 0.15);

    if (this.schedulerId) {
      this.stopScheduler();
    }
  }

  resume() {
    if (!this.ctx || !this.paused) return;
    this.paused = false;
    this.playing = true;

    if (this.pauseStarted) {
      this.nextBeat += this.ctx.currentTime - this.pauseStarted;
      this.pauseStarted = 0;
    }

    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(this.enabled ? 0.45 : 0, t + 0.4);

    this.schedule();
  }

  setDanger(level) {
    this.danger = level;
  }

  schedule() {
    this.stopScheduler();
    if (!this.enabled || !this.playing) return;

    this.schedulerId = setInterval(() => {
      if (!this.playing || !this.enabled) return;
      const beat = this.beatDuration;
      while (this.nextBeat < this.ctx.currentTime + 0.2) {
        this.scheduleBeat(this.nextBeat, this.beatIndex);
        this.beatIndex = (this.beatIndex + 1) % LOOP_BEATS;
        this.nextBeat += beat;
      }
    }, 50);
  }

  scheduleBeat(time, beat) {
    if (this.song === 'late') {
      this.scheduleDiscoBeat(time, beat);
      return;
    }
    this.scheduleGrooveBeat(time, beat);
  }

  scheduleDiscoBeat(time, beat) {
    const config = this.tierConfig;
    const bar = Math.floor(beat / 4);
    const step = beat % 4;
    const beatDur = this.beatDuration;
    const kickVol = config.kickVol ?? 0.74;
    const clapVol = config.clapVol ?? 0.46;
    const melodyVol = config.melodyVol ?? 0.13;

    this.playKick(time, kickVol * (step === 0 || step === 2 ? 1 : 0.72));

    if (step === 2) {
      this.playClap(time, clapVol);
    }
    if (step === 0 && beat > 0) {
      this.playClap(time, clapVol * 0.55);
    }

    if (step % 2 === 1) {
      this.playOpenHat(time, 0.11);
    } else {
      this.playHiHat(time, 0.045);
    }
    if (step === 1 || step === 3) {
      this.playHiHat(time + beatDur * 0.5, 0.035);
    }

    const bassIdx = config.bassPattern[beat % config.bassPattern.length];
    this.playBassDisco(time, config.bassNotes[bassIdx % config.bassNotes.length]);

    if (beat % 4 === 0) {
      this.playChordStab(time, config.stabChords[bar % 4], config.stabVol ?? 0.08);
    }

    if (beat % 2 === 1) {
      const sparkle = config.sparkleScale[beat % config.sparkleScale.length];
      this.playSparkle(time, sparkle, 0.055);
    }

    if ([4, 6, 8, 10, 12, 14].includes(beat)) {
      const melIdx = Math.floor((beat - 4) / 2) % config.melodyNotes.length;
      this.playMelody(time, config.melodyNotes[melIdx], melodyVol, 'square');
    }
  }

  scheduleGrooveBeat(time, beat) {
    const config = this.tierConfig;
    const bar = Math.floor(beat / 4);
    const step = beat % 4;
    const beatDur = this.beatDuration;
    const kickVol = config.kickVol ?? 0.72;
    const snareVol = config.snareVol ?? 0.42;
    const melodyVol = config.melodyVol ?? 0.11;
    const hatBoost = this.song === 'chase' ? this.danger * 0.025 : 0;

    if (step === 0) {
      this.playKick(time, kickVol);
    }

    if (step === 2) {
      this.playSnare(time, snareVol);
    }

    if (step % 2 === 1) {
      this.playHiHat(time, 0.085 + hatBoost);
    }
    if (step === 1 || step === 3) {
      this.playHiHat(time + beatDur * 0.5, 0.05 + hatBoost * 0.6);
    }

    const bassIdx = config.bassPattern[beat % config.bassPattern.length];
    this.playBassLate(time, config.bassNotes[bassIdx % config.bassNotes.length]);

    if (beat % 4 === 0) {
      this.playPadBright(time, bar, config);
    }

    if (beat % 2 === 1) {
      this.playArpBright(time, beat, config);
    }

    if (beat % 2 === 0) {
      const melIdx = Math.floor(beat / 2) % config.melodyNotes.length;
      this.playMelody(time, config.melodyNotes[melIdx], melodyVol);
    }
  }

  playKick(time, vol) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.12);
    gain.gain.setValueAtTime(vol * 0.9, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(time);
    osc.stop(time + 0.3);
  }

  playHiHat(time, vol) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.hihatBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(time);
    src.stop(time + 0.05);
  }

  playSnare(time, vol) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.hihatBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    filter.Q.value = 0.7;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(time);
    src.stop(time + 0.14);

    const tone = this.ctx.createOscillator();
    const toneGain = this.ctx.createGain();
    tone.type = 'triangle';
    tone.frequency.setValueAtTime(220, time);
    tone.frequency.exponentialRampToValueAtTime(120, time + 0.06);
    toneGain.gain.setValueAtTime(vol * 0.35, time);
    toneGain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
    tone.connect(toneGain);
    toneGain.connect(this.master);
    tone.start(time);
    tone.stop(time + 0.1);
  }

  playMelody(time, freq, vol, wave = 'sine') {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = wave;
    osc.frequency.value = freq;
    const decay = Math.max(0.08, this.beatDuration * 0.45);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, time + decay);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(time);
    osc.stop(time + decay + 0.02);
  }

  playClap(time, vol) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.hihatBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2400;
    filter.Q.value = 0.5;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.09);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(time);
    src.stop(time + 0.1);
  }

  playOpenHat(time, vol) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.hihatBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 5000;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(time);
    src.stop(time + 0.16);
  }

  playBassDisco(time, freq) {
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, time);
    filter.frequency.exponentialRampToValueAtTime(280, time + this.beatDuration * 0.7);
    filter.Q.value = 1.4;
    const beat = this.beatDuration;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.24, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, time + beat * 0.55);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start(time);
    osc.stop(time + beat * 0.65);
  }

  playChordStab(time, chord, vol) {
    for (const freq of chord) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(vol, time + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(time);
      osc.stop(time + 0.18);
    }
  }

  playSparkle(time, freq, vol) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.07);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(time);
    osc.stop(time + 0.08);
  }

  playBassLate(time, freq) {
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    filter.Q.value = 1.2;
    const beat = this.beatDuration;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.2, time + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, time + beat * 0.85);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start(time);
    osc.stop(time + beat);
  }

  playPadBright(time, bar, config) {
    const chord = config.padChords[bar % 4];
    const padDuration = this.beatDuration * 4;
    for (const freq of chord) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.055, time + 0.25);
      gain.gain.linearRampToValueAtTime(0.038, time + padDuration - 0.35);
      gain.gain.linearRampToValueAtTime(0, time + padDuration);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(time);
      osc.stop(time + padDuration);
    }
  }

  playArpBright(time, beat, config) {
    const scale = config.arpScale;
    const idx = beat % scale.length;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = scale[idx];
    const decay = 0.1;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.045, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, time + decay);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(time);
    osc.stop(time + decay + 0.02);
  }
}
