export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  setEnabled(on) {
    this.enabled = on;
  }

  isEnabled() {
    return this.enabled;
  }

  init() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
  }

  async ensureReady() {
    this.init();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  playJump() {
    if (!this.enabled) return;
    this.ensureReady();
    const t = this.ctx.currentTime;

    const master = this.ctx.createGain();
    master.gain.setValueAtTime(0.35, t);
    master.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    master.connect(this.ctx.destination);

    const sweep = this.ctx.createOscillator();
    const sweepGain = this.ctx.createGain();
    sweep.type = 'sine';
    sweep.frequency.setValueAtTime(200, t);
    sweep.frequency.exponentialRampToValueAtTime(520, t + 0.1);
    sweepGain.gain.setValueAtTime(0.5, t);
    sweepGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    sweep.connect(sweepGain);
    sweepGain.connect(master);
    sweep.start(t);
    sweep.stop(t + 0.15);

    this.playNoiseBurst(master, t, 0.06, 900, 'bandpass', 0.4, 0.07);
  }

  playWallHit(side = 0) {
    if (!this.enabled) return;
    this.ensureReady();
    const t = this.ctx.currentTime;

    const master = this.ctx.createGain();
    master.gain.setValueAtTime(0.42, t);
    master.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    master.connect(this.ctx.destination);

    if (side !== 0) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = side * 0.65;
      master.disconnect();
      master.connect(panner);
      panner.connect(this.ctx.destination);
    }

    const thump = this.ctx.createOscillator();
    const thumpGain = this.ctx.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(110, t);
    thump.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    thumpGain.gain.setValueAtTime(0.7, t);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    thump.connect(thumpGain);
    thumpGain.connect(master);
    thump.start(t);
    thump.stop(t + 0.2);

    this.playNoiseBurst(master, t, 0.08, 320, 'lowpass', 0.35, 0.12);
  }

  playObstacleHit() {
    if (!this.enabled) return;
    this.ensureReady();
    const t = this.ctx.currentTime;

    const master = this.ctx.createGain();
    master.gain.setValueAtTime(0.4, t);
    master.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    master.connect(this.ctx.destination);

    const impact = this.ctx.createOscillator();
    const impactGain = this.ctx.createGain();
    impact.type = 'triangle';
    impact.frequency.setValueAtTime(180, t);
    impact.frequency.exponentialRampToValueAtTime(70, t + 0.08);
    impactGain.gain.setValueAtTime(0.55, t);
    impactGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    impact.connect(impactGain);
    impactGain.connect(master);
    impact.start(t);
    impact.stop(t + 0.16);

    this.playNoiseBurst(master, t, 0.07, 650, 'bandpass', 0.45, 0.1);

    const crack = this.ctx.createOscillator();
    const crackGain = this.ctx.createGain();
    crack.type = 'square';
    crack.frequency.setValueAtTime(420, t + 0.01);
    crack.frequency.exponentialRampToValueAtTime(120, t + 0.06);
    crackGain.gain.setValueAtTime(0.08, t + 0.01);
    crackGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    crack.connect(crackGain);
    crackGain.connect(master);
    crack.start(t + 0.01);
    crack.stop(t + 0.09);
  }

  playNoiseBurst(master, t, duration, freq, filterType, vol, decay) {
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    filter.Q.value = 0.9;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(vol, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + decay);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(master);
    noise.start(t);
    noise.stop(t + decay + 0.02);
  }
}
