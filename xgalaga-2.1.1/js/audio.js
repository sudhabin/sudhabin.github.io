/*
 * audio.js - plays the original XGalaga 8-bit 8kHz mono .raw samples.
 * Samples are embedded as base64 in assets.js, so no fetch/server is needed.
 */
(function () {
  'use strict';

  // Original sound server order (xgal.sndsrv.linux.c)
  const NAMES = ['explode', 'firetorp', 'shield', 'torphit', 'explode_big', 'ddloo', 'warp', 'smart'];

  const VOLUME = {
    explode: 0.45,
    firetorp: 0.18,
    shield: 0.45,
    torphit: 0.32,
    explode_big: 0.6,
    ddloo: 0.5,
    warp: 0.4,
    smart: 0.55,
  };

  function decodeBase64(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  class Sound {
    constructor(rawSounds) {
      this.raw = rawSounds || {};
      this.ctx = null;
      this.master = null;
      this.buffers = {};
      this.muted = this.loadMuted();
      this.active = 0;
    }

    loadMuted() {
      try {
        return localStorage.getItem('xgalaga.muted') === '1';
      } catch (err) {
        return false;
      }
    }

    get available() {
      return !this.muted;
    }

    unlock() {
      if (!this.ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.75;
        this.master.connect(this.ctx.destination);
        for (const name of NAMES) {
          const b64 = this.raw[name];
          if (!b64) continue;
          this.buffers[name] = this._makeBuffer(decodeBase64(b64));
        }
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    _makeBuffer(bytes) {
      // Files are unsigned 8-bit PCM, 8000 Hz, mono (see xgal.sndsrv).
      const make = (rate, duplicate) => {
        const length = bytes.length * (duplicate ? 2 : 1);
        const buffer = this.ctx.createBuffer(1, length, rate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bytes.length; i++) {
          const s = (bytes[i] - 128) / 128;
          if (duplicate) {
            data[i * 2] = s;
            data[i * 2 + 1] = s;
          } else {
            data[i] = s;
          }
        }
        return buffer;
      };
      try {
        return make(8000, false);
      } catch (err) {
        // Some browsers reject very low sample rates on AudioBuffer.
        return make(16000, true);
      }
    }

    play(name) {
      if (this.muted) return;
      if (!this.ctx) return;
      const buffer = this.buffers[name];
      if (!buffer) return;
      if (this.active > 24) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const gain = this.ctx.createGain();
      gain.gain.value = VOLUME[name] === undefined ? 0.4 : VOLUME[name];
      src.connect(gain);
      gain.connect(this.master);
      this.active++;
      src.onended = () => { this.active--; };
      src.start(0);
    }

    toggleMute() {
      this.muted = !this.muted;
      try {
        localStorage.setItem('xgalaga.muted', this.muted ? '1' : '0');
      } catch (err) { /* ignore */ }
      if (!this.muted) this.unlock();
      return this.muted;
    }
  }

  window.XGAL = window.XGAL || {};
  window.XGAL.Sound = Sound;
})();
