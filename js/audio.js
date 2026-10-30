// All sound is synthesized at runtime with WebAudio: no assets, no downloads.
import { rand, clamp } from './util.js';

export class AudioKit {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicBus = null;
    this.sfxBus = null;
    this.noiseBuf = null;
    this.muted = false;
    this.musicOn = true;
    this._schedTimer = null;
    this._step = 0;
    this._nextTime = 0;
    this.tempo = 134;
    this.intensity = 0; // 0..1, raised with combo
    this._kickAlt = false;
    try {
      this.muted = localStorage.getItem('neonrift.muted') === '1';
    } catch (err) {
      this.muted = false;
    }
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.75;
    this.sfxBus.connect(this.master);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0;
    this.musicBus.connect(this.master);

    // shared noise buffer
    const len = Math.floor(ctx.sampleRate * 1.2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    if (this.musicOn) this.startMusic();
  }

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    try {
      localStorage.setItem('neonrift.muted', m ? '1' : '0');
    } catch (err) {
      /* sem storage, segue sem persistir */
    }
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(m ? 0 : 0.9, t, 0.05);
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  // ---------- building blocks ----------
  _tone({ type = 'sine', f0 = 440, f1 = f0, dur = 0.16, gain = 0.2, delay = 0, attack = 0.004, bus }) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(bus || this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  _noise({ dur = 0.12, gain = 0.15, f0 = 2400, f1 = 500, q = 1.2, type = 'bandpass', delay = 0 }) {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuf) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.Q.value = q;
    filt.frequency.setValueAtTime(f0, t0);
    filt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.sfxBus);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // ---------- sfx ----------
  dash() {
    if (!this.ctx) return;
    this._noise({ dur: 0.16, gain: 0.16, f0: 3200, f1: 320, q: 0.9 });
    this._tone({ type: 'triangle', f0: 880, f1: 220, dur: 0.1, gain: 0.05 });
  }

  dashFail() {
    if (!this.ctx) return;
    this._tone({ type: 'square', f0: 130, f1: 90, dur: 0.06, gain: 0.035 });
  }

  kill(combo) {
    if (!this.ctx) return;
    const semis = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24, 27];
    const s = semis[clamp(combo - 1, 0, semis.length - 1)];
    const f = 330 * Math.pow(2, s / 12);
    this._tone({ type: 'square', f0: f, f1: f * 0.98, dur: 0.085, gain: 0.075 });
    this._tone({ type: 'sine', f0: f * 0.5, f1: f * 0.4, dur: 0.11, gain: 0.09 });
    this._noise({ dur: 0.05, gain: 0.05, f0: 5200, f1: 1800, q: 0.7 });
  }

  bigKill() {
    if (!this.ctx) return;
    this._tone({ type: 'sawtooth', f0: 180, f1: 60, dur: 0.3, gain: 0.09 });
    this._noise({ dur: 0.35, gain: 0.12, f0: 1400, f1: 120, q: 0.8 });
  }

  bulletPop() {
    if (!this.ctx) return;
    this._tone({ type: 'triangle', f0: 1250, f1: 1700, dur: 0.055, gain: 0.05 });
  }

  shoot() {
    if (!this.ctx) return;
    this._tone({ type: 'sawtooth', f0: 620, f1: 180, dur: 0.12, gain: 0.035 });
  }

  comboMilestone(level) {
    if (!this.ctx) return;
    const base = 440 * Math.pow(2, clamp(level, 0, 8) / 12);
    [0, 4, 7].forEach((s, i) => {
      this._tone({
        type: 'triangle',
        f0: base * Math.pow(2, s / 12),
        f1: base * Math.pow(2, s / 12),
        dur: 0.16,
        gain: 0.06,
        delay: i * 0.05,
      });
    });
  }

  death() {
    if (!this.ctx) return;
    this._tone({ type: 'sawtooth', f0: 320, f1: 40, dur: 0.9, gain: 0.16 });
    this._tone({ type: 'square', f0: 160, f1: 30, dur: 1.0, gain: 0.08 });
    this._noise({ dur: 0.8, gain: 0.2, f0: 2200, f1: 60, q: 0.6 });
  }

  start() {
    if (!this.ctx) return;
    [0, 7, 12, 19].forEach((s, i) => {
      this._tone({
        type: 'triangle',
        f0: 220 * Math.pow(2, s / 12),
        f1: 220 * Math.pow(2, s / 12),
        dur: 0.2,
        gain: 0.07,
        delay: i * 0.06,
      });
    });
  }

  ui() {
    if (!this.ctx) return;
    this._tone({ type: 'square', f0: 700, f1: 900, dur: 0.05, gain: 0.04 });
  }

  // ---------- procedural music ----------
  startMusic() {
    if (!this.ctx || this._schedTimer) return;
    this._step = 0;
    this._nextTime = this.ctx.currentTime + 0.08;
    this._schedTimer = setInterval(() => this._schedule(), 25);
    const t = this.ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setTargetAtTime(0.26, t, 1.2);
  }

  stopMusic(fade = 0.4) {
    if (!this.ctx) return;
    if (this._schedTimer) {
      clearInterval(this._schedTimer);
      this._schedTimer = null;
    }
    const t = this.ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setTargetAtTime(0, t, fade / 3);
  }

  setMusicDuck(ducked) {
    if (!this.ctx || !this._schedTimer) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(ducked ? 0.09 : 0.26, t, 0.15);
  }

  _schedule() {
    const ctx = this.ctx;
    if (!ctx) return;
    const spb = 60 / this.tempo;
    const stepDur = spb / 4;
    while (this._nextTime < ctx.currentTime + 0.12) {
      this._playStep(this._step, this._nextTime - ctx.currentTime);
      this._nextTime += stepDur;
      this._step = (this._step + 1) % 32;
    }
  }

  _playStep(step, delay) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + Math.max(0, delay);
    const s = step % 16;
    const bar = Math.floor(step / 16);

    // ---- bass (A minor) ----
    const bassPat = [0, 0, 12, 0, 0, 0, 7, 0, 0, 12, 0, 0, 5, 0, 3, 0];
    const root = bar % 2 === 0 ? 0 : 5;
    const semi = bassPat[s];
    if (semi !== null && s % 2 === 0) {
      const f = 55 * Math.pow(2, (root + semi - 12) / 12);
      this._musicTone(t0, 'sawtooth', f, f, 0.22, 0.16, 260 + this.intensity * 900);
    }
    // ---- kick ----
    if (s === 0 || s === 6 || s === 8 || s === 14) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, t0);
      osc.frequency.exponentialRampToValueAtTime(45, t0 + 0.14);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.55, t0 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.17);
      osc.connect(g);
      g.connect(this.musicBus);
      osc.start(t0);
      osc.stop(t0 + 0.2);
    }
    // ---- hats ----
    if (this.noiseBuf && (s % 2 === 1 || s === 14)) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 7000;
      const g = ctx.createGain();
      const start = rand(0, 0.4);
      const dur = 0.04;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(s % 4 === 3 ? 0.09 : 0.05, t0 + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f);
      f.connect(g);
      g.connect(this.musicBus);
      src.start(t0, start, dur + 0.02);
    }
    // ---- arp / pluck ----
    const arpScale = [0, 3, 5, 7, 10, 12, 15, 17];
    if (s % 2 === 0 && (s === 2 || s === 4 || s === 10 || s === 12 || bar % 2 === 1)) {
      const idx = (s / 2 + bar * 3) % arpScale.length;
      const f = 220 * Math.pow(2, (arpScale[idx] + (bar % 2 ? 5 : 0)) / 12);
      this._musicTone(t0, 'triangle', f, f, 0.14, 0.055, 3200);
    }
  }

  _musicTone(t0, type, f0, f1, dur, gain, filterHz) {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = filterHz;
    filt.Q.value = 6;
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(filt);
    filt.connect(g);
    g.connect(this.musicBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }
}
