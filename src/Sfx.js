export class Sfx {
  constructor() {
    this.ctx = null;
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

    const bufferSize = Math.floor(this.ctx.sampleRate * 0.06);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.8;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.4, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(master);
    noise.start(t);
    noise.stop(t + 0.08);
  }
}
