const BPM = 128;
const BEAT = 60 / BPM;
const LOOP_BEATS = 16;

export class ChaseMusic {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.playing = false;
    this.paused = false;
    this.danger = 0;
    this.nextBeat = 0;
    this.beatIndex = 0;
    this.schedulerId = null;
    this.pauseStarted = 0;
    this.enabled = true;
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
      while (this.nextBeat < this.ctx.currentTime + 0.2) {
        this.scheduleBeat(this.nextBeat, this.beatIndex);
        this.beatIndex = (this.beatIndex + 1) % LOOP_BEATS;
        this.nextBeat += BEAT;
      }
    }, 50);
  }

  scheduleBeat(time, beat) {
    const bar = Math.floor(beat / 4);
    const step = beat % 4;
    const danger = this.danger;

    if (step === 0 || step === 2) {
      this.playKick(time, step === 0 ? 1 : 0.75);
    }

    if (step % 2 === 1) {
      this.playHiHat(time, 0.08 + danger * 0.04);
    }

    if (beat % 2 === 0) {
      this.playBass(time, bar, danger);
    }

    if (beat % 4 === 0) {
      this.playPad(time, bar);
    }

    if (beat % 2 === 1) {
      this.playArp(time, beat, danger);
    }

    if (danger > 0.4 && beat % 8 === 4) {
      this.playHeartbeat(time, danger);
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

  playBass(time, bar, danger) {
    const notes = [55, 55, 49, 46];
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = notes[bar % 4];
    filter.type = 'lowpass';
    filter.frequency.value = 400 + danger * 300;
    filter.Q.value = 2;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.22 + danger * 0.15, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, time + BEAT * 1.8);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start(time);
    osc.stop(time + BEAT * 2);
  }

  playPad(time, bar) {
    const chords = [
      [110, 138.59, 164.81],
      [98, 123.47, 146.83],
      [87.31, 110, 130.81],
      [103.83, 130.81, 155.56],
    ];
    const chord = chords[bar % 4];
    const padDuration = BEAT * 4;
    for (const freq of chord) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.06, time + 0.3);
      gain.gain.linearRampToValueAtTime(0.04, time + padDuration - 0.3);
      gain.gain.linearRampToValueAtTime(0, time + padDuration);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(time);
      osc.stop(time + padDuration);
    }
  }

  playArp(time, beat, danger) {
    const scale = [220, 261.63, 329.63, 392, 440, 523.25];
    const idx = (beat + Math.floor(danger * 4)) % scale.length;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = scale[idx];
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.04 + danger * 0.05, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
    const arpGain = this.ctx.createGain();
    arpGain.gain.value = 0.5 + danger * 0.5;
    osc.connect(gain);
    gain.connect(arpGain);
    arpGain.connect(this.master);
    osc.start(time);
    osc.stop(time + 0.2);
  }

  playHeartbeat(time, danger) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 52;
    gain.gain.setValueAtTime(0.35 * danger, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(time);
    osc.stop(time + 0.5);
  }
}
