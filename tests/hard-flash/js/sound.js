/* =====================================================================
 * 中国象棋 · 音效 (sound.js)  基于 Web Audio API 合成，无需外部文件
 * ===================================================================== */
(function (global) {
  'use strict';
  const XQ = (global.XQ = global.XQ || {});

  const sound = {
    enabled: true,
    ctx: null,
    master: 0.9,

    ensure() {
      if (!this.ctx) {
        try {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (AC) this.ctx = new AC();
        } catch (e) { this.ctx = null; }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume && this.ctx.resume();
      }
      return this.ctx;
    },

    tone(freq, dur, type, gain, delay) {
      if (!this.enabled) return;
      const ctx = this.ensure();
      if (!ctx) return;
      try {
        const t0 = ctx.currentTime + (delay || 0);
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type || 'triangle';
        osc.frequency.setValueAtTime(freq, t0);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime((gain || 0.3) * this.master, t0 + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(g).connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.05);
      } catch (e) { /* 忽略音频错误 */ }
    },

    noise(dur, gain, delay) {
      if (!this.enabled) return;
      const ctx = this.ensure();
      if (!ctx) return;
      try {
        const t0 = ctx.currentTime + (delay || 0);
        const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = ctx.createGain();
        g.gain.value = (gain || 0.1) * this.master;
        src.connect(g).connect(ctx.destination);
        src.start(t0);
      } catch (e) { /* 忽略音频错误 */ }
    },

    move() { // 落子：木声
      this.noise(0.05, 0.25);
      this.tone(170, 0.08, 'triangle', 0.22);
    },
    capture() { // 吃子：更重的“啪”
      this.noise(0.08, 0.4);
      this.tone(110, 0.1, 'square', 0.18);
      this.tone(300, 0.06, 'triangle', 0.12, 0.01);
    },
    check() { // 将军：两声警示
      this.tone(660, 0.09, 'square', 0.12);
      this.tone(880, 0.12, 'square', 0.12, 0.11);
    },
    select() { // 提子
      this.tone(520, 0.05, 'triangle', 0.1);
    },
    win() { // 胜利小调
      const seq = [523, 659, 784, 1047];
      seq.forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.16, i * 0.13));
    },
    lose() {
      const seq = [392, 330, 262, 196];
      seq.forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.14, i * 0.15));
    }
  };

  XQ.sound = sound;
})(typeof window !== 'undefined' ? window : globalThis);