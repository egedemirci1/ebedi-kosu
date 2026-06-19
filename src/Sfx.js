export class Sfx {
  constructor(music) {
    this.music = music;
    this.enabled = true;
    this._readyPromise = null;
  }

  setEnabled(on) {
    this.enabled = on;
  }

  isEnabled() {
    return this.enabled;
  }

  get ctx() {
    return this.music.getContext();
  }

  ensureReady() {
    if (!this._readyPromise) {
      this._readyPromise = (async () => {
        const ctx = this.ctx;
        if (ctx.state === 'suspended') await ctx.resume();
      })();
    }
    return this._readyPromise;
  }

  playJump() {
    if (!this.enabled) return;
    void this._playJump();
  }

  playWallHit(side = 0) {
    if (!this.enabled) return;
    void this._playWallHit(side);
  }

  playObstacleHit() {
    if (!this.enabled) return;
    void this._playObstacleHit();
  }

  async _playJump() {
    await this.ensureReady();
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

  async _playWallHit(side = 0) {
    await this.ensureReady();
    const t = this.ctx.currentTime;

    const master = this.ctx.createGain();
    master.gain.setValueAtTime(0.42, t);
    master.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

    if (side !== 0) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = side * 0.65;
      master.connect(panner);
      panner.connect(this.ctx.destination);
    } else {
      master.connect(this.ctx.destination);
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

  async _playObstacleHit() {
    await this.ensureReady();
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

  async _playBoosterPickup() {
    await this.ensureReady();
    const t = this.ctx.currentTime;

    const master = this.ctx.createGain();
    master.gain.setValueAtTime(0.32, t);
    master.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    master.connect(this.ctx.destination);

    const notes = [660, 880, 1100];
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const start = t + i * 0.05;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      osc.connect(gain);
      gain.connect(master);
      osc.start(start);
      osc.stop(start + 0.2);
    });
  }

  playBoosterPickup() {
    if (!this.enabled) return;
    void this._playBoosterPickup();
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
