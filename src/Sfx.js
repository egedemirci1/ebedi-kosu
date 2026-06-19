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

  playBoosterPickup(type = 'ghost') {
    if (!this.enabled) return;
    if (type === 'speed') void this._playSpeedBoosterPickup();
    else if (type === 'jump') void this._playJumpBoosterPickup();
    else if (type === 'ghost') void this._playGhostBoosterPickup();
    else void this._playBoosterPickup();
  }

  async _playGhostBoosterPickup() {
    await this.ensureReady();
    const t = this.ctx.currentTime;

    const master = this.ctx.createGain();
    master.gain.setValueAtTime(0.34, t);
    master.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    master.connect(this.ctx.destination);

    const wail = this.ctx.createOscillator();
    const wailGain = this.ctx.createGain();
    const wailFilter = this.ctx.createBiquadFilter();
    wail.type = 'sine';
    wail.frequency.setValueAtTime(520, t);
    wail.frequency.exponentialRampToValueAtTime(280, t + 0.35);
    wailFilter.type = 'lowpass';
    wailFilter.frequency.setValueAtTime(900, t);
    wailFilter.frequency.linearRampToValueAtTime(500, t + 0.35);
    wailGain.gain.setValueAtTime(0.0001, t);
    wailGain.gain.exponentialRampToValueAtTime(0.28, t + 0.06);
    wailGain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    wail.connect(wailFilter);
    wailFilter.connect(wailGain);
    wailGain.connect(master);
    wail.start(t);
    wail.stop(t + 0.45);

    const chime = this.ctx.createOscillator();
    const chimeGain = this.ctx.createGain();
    chime.type = 'sine';
    chime.frequency.setValueAtTime(880, t + 0.04);
    chime.frequency.exponentialRampToValueAtTime(660, t + 0.28);
    chimeGain.gain.setValueAtTime(0.0001, t + 0.04);
    chimeGain.gain.exponentialRampToValueAtTime(0.22, t + 0.08);
    chimeGain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    chime.connect(chimeGain);
    chimeGain.connect(master);
    chime.start(t + 0.04);
    chime.stop(t + 0.34);

    const shimmer = this.ctx.createOscillator();
    const shimmerGain = this.ctx.createGain();
    shimmer.type = 'triangle';
    shimmer.frequency.setValueAtTime(1320, t + 0.06);
    shimmerGain.gain.setValueAtTime(0.08, t + 0.06);
    shimmerGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    shimmer.connect(shimmerGain);
    shimmerGain.connect(master);
    shimmer.start(t + 0.06);
    shimmer.stop(t + 0.24);

    this.playNoiseBurst(master, t, 0.25, 1400, 'bandpass', 0.12, 0.3);
  }

  async _playJumpBoosterPickup() {
    await this.ensureReady();
    const t = this.ctx.currentTime;

    const master = this.ctx.createGain();
    master.gain.setValueAtTime(0.36, t);
    master.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    master.connect(this.ctx.destination);

    const spring = this.ctx.createOscillator();
    const springGain = this.ctx.createGain();
    spring.type = 'triangle';
    spring.frequency.setValueAtTime(220, t);
    spring.frequency.exponentialRampToValueAtTime(380, t + 0.05);
    spring.frequency.exponentialRampToValueAtTime(920, t + 0.16);
    spring.frequency.exponentialRampToValueAtTime(520, t + 0.28);
    springGain.gain.setValueAtTime(0.0001, t);
    springGain.gain.exponentialRampToValueAtTime(0.32, t + 0.04);
    springGain.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
    spring.connect(springGain);
    springGain.connect(master);
    spring.start(t);
    spring.stop(t + 0.36);

    const ping = this.ctx.createOscillator();
    const pingGain = this.ctx.createGain();
    ping.type = 'sine';
    ping.frequency.setValueAtTime(520, t + 0.08);
    ping.frequency.exponentialRampToValueAtTime(1180, t + 0.18);
    pingGain.gain.setValueAtTime(0.0001, t + 0.08);
    pingGain.gain.exponentialRampToValueAtTime(0.26, t + 0.11);
    pingGain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    ping.connect(pingGain);
    pingGain.connect(master);
    ping.start(t + 0.08);
    ping.stop(t + 0.26);

    const wobble = this.ctx.createOscillator();
    const wobbleGain = this.ctx.createGain();
    wobble.type = 'sine';
    wobble.frequency.setValueAtTime(680, t + 0.2);
    wobble.frequency.exponentialRampToValueAtTime(440, t + 0.3);
    wobbleGain.gain.setValueAtTime(0.12, t + 0.2);
    wobbleGain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    wobble.connect(wobbleGain);
    wobbleGain.connect(master);
    wobble.start(t + 0.2);
    wobble.stop(t + 0.34);

    this.playNoiseBurst(master, t + 0.04, 0.08, 1200, 'bandpass', 0.14, 0.1);
  }

  async _playSpeedBoosterPickup() {
    await this.ensureReady();
    const t = this.ctx.currentTime;

    const master = this.ctx.createGain();
    master.gain.setValueAtTime(0.4, t);
    master.gain.exponentialRampToValueAtTime(0.001, t + 0.48);
    master.connect(this.ctx.destination);

    const rev = this.ctx.createOscillator();
    const revGain = this.ctx.createGain();
    const revFilter = this.ctx.createBiquadFilter();
    rev.type = 'sawtooth';
    rev.frequency.setValueAtTime(90, t);
    rev.frequency.exponentialRampToValueAtTime(520, t + 0.14);
    rev.frequency.exponentialRampToValueAtTime(220, t + 0.42);
    revFilter.type = 'lowpass';
    revFilter.frequency.setValueAtTime(350, t);
    revFilter.frequency.exponentialRampToValueAtTime(1400, t + 0.12);
    revFilter.frequency.exponentialRampToValueAtTime(500, t + 0.4);
    revFilter.Q.value = 1.2;
    revGain.gain.setValueAtTime(0.0001, t);
    revGain.gain.exponentialRampToValueAtTime(0.24, t + 0.035);
    revGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    rev.connect(revFilter);
    revFilter.connect(revGain);
    revGain.connect(master);
    rev.start(t);
    rev.stop(t + 0.42);

    const zip = this.ctx.createOscillator();
    const zipGain = this.ctx.createGain();
    zip.type = 'triangle';
    zip.frequency.setValueAtTime(440, t);
    zip.frequency.exponentialRampToValueAtTime(1180, t + 0.1);
    zipGain.gain.setValueAtTime(0.0001, t);
    zipGain.gain.exponentialRampToValueAtTime(0.28, t + 0.015);
    zipGain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    zip.connect(zipGain);
    zipGain.connect(master);
    zip.start(t);
    zip.stop(t + 0.18);

    this.playNoiseBurst(master, t, 0.3, 700, 'bandpass', 0.38, 0.34);
    this.playNoiseBurst(master, t + 0.04, 0.22, 1600, 'highpass', 0.18, 0.28);
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

  async _playCoinPickup() {
    await this.ensureReady();
    const t = this.ctx.currentTime;

    const master = this.ctx.createGain();
    master.gain.setValueAtTime(0.28, t);
    master.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    master.connect(this.ctx.destination);

    const ping = this.ctx.createOscillator();
    const pingGain = this.ctx.createGain();
    ping.type = 'sine';
    ping.frequency.setValueAtTime(880, t);
    ping.frequency.exponentialRampToValueAtTime(1320, t + 0.06);
    pingGain.gain.setValueAtTime(0.0001, t);
    pingGain.gain.exponentialRampToValueAtTime(0.4, t + 0.01);
    pingGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    ping.connect(pingGain);
    pingGain.connect(master);
    ping.start(t);
    ping.stop(t + 0.18);

    const shimmer = this.ctx.createOscillator();
    const shimmerGain = this.ctx.createGain();
    shimmer.type = 'triangle';
    shimmer.frequency.setValueAtTime(1760, t + 0.03);
    shimmerGain.gain.setValueAtTime(0.08, t + 0.03);
    shimmerGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    shimmer.connect(shimmerGain);
    shimmerGain.connect(master);
    shimmer.start(t + 0.03);
    shimmer.stop(t + 0.14);
  }

  playCoinPickup() {
    if (!this.enabled) return;
    void this._playCoinPickup();
  }

  playFallScream() {
    if (!this.enabled) return;
    void this._playFallScream();
  }

  async _playFallScream() {
    await this.ensureReady();
    const t = this.ctx.currentTime;
    const duration = 0.82;

    const master = this.ctx.createGain();
    master.gain.setValueAtTime(0.0001, t);
    master.gain.linearRampToValueAtTime(0.2, t + 0.05);
    master.gain.setValueAtTime(0.18, t + duration - 0.25);
    master.gain.exponentialRampToValueAtTime(0.001, t + duration);
    master.connect(this.ctx.destination);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1500, t);
    filter.frequency.linearRampToValueAtTime(1100, t + duration);
    filter.Q.value = 0.7;
    filter.connect(master);

    const voice = this.ctx.createOscillator();
    const voiceGain = this.ctx.createGain();
    voice.type = 'triangle';
    voice.frequency.setValueAtTime(330, t);
    voice.frequency.linearRampToValueAtTime(470, t + 0.18);
    voice.frequency.linearRampToValueAtTime(390, t + duration);
    voiceGain.gain.setValueAtTime(0.42, t);
    voiceGain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    voice.connect(voiceGain);
    voiceGain.connect(filter);
    voice.start(t);
    voice.stop(t + duration + 0.02);

    const body = this.ctx.createOscillator();
    const bodyGain = this.ctx.createGain();
    body.type = 'sine';
    body.frequency.setValueAtTime(660, t);
    body.frequency.linearRampToValueAtTime(780, t + 0.16);
    body.frequency.linearRampToValueAtTime(700, t + duration);
    bodyGain.gain.setValueAtTime(0.12, t);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, t + duration * 0.85);
    body.connect(bodyGain);
    bodyGain.connect(filter);
    body.start(t);
    body.stop(t + duration + 0.02);

    const wobble = this.ctx.createOscillator();
    const wobbleGain = this.ctx.createGain();
    wobble.type = 'sine';
    wobble.frequency.setValueAtTime(5.5, t);
    wobbleGain.gain.setValueAtTime(18, t);
    wobble.connect(wobbleGain);
    wobbleGain.connect(voice.frequency);
    wobble.start(t);
    wobble.stop(t + duration + 0.02);

    this.playNoiseBurst(filter, t + 0.02, 0.12, 1800, 'bandpass', 0.06, 0.18);
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
