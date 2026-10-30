/*
 * audio.js - tiny WebAudio synthesizer for the browser port.
 * The original XGalaga++ has no sound, so all effects are optional extras.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'xgalaga.muted.v1';
  var audio = null;
  var master = null;
  var noiseBuffer = null;
  var muted = false;
  var lastExplosionAt = 0;

  try {
    muted = localStorage.getItem(STORAGE_KEY) === '1';
  } catch (e) { /* storage may be disabled */ }

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, muted ? '1' : '0'); } catch (e) { /* ignore */ }
  }

  function context() {
    if (!audio) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audio = new AC();
      master = audio.createGain();
      master.gain.value = muted ? 0 : 0.55;
      master.connect(audio.destination);
    }
    if (audio.state === 'suspended') audio.resume();
    return audio;
  }

  function unlock() {
    var ctx = context();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function tone(opts) {
    if (muted) return;
    var ctx = context();
    if (!ctx) return;
    var now = ctx.currentTime + (opts.delay || 0);
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = opts.type || 'square';
    osc.frequency.setValueAtTime(Math.max(20, opts.freq), now);
    if (opts.freq2) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.freq2), now + opts.dur);
    }
    var peak = opts.gain == null ? 0.04 : opts.gain;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + Math.min(0.012, opts.dur * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + opts.dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + opts.dur + 0.02);
  }

  function noise(dur, gainValue, cutoff, delay) {
    if (muted) return;
    var ctx = context();
    if (!ctx) return;
    if (!noiseBuffer) {
      var length = Math.floor(ctx.sampleRate * 0.6);
      noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      var data = noiseBuffer.getChannelData(0);
      for (var i = 0; i < length; ++i) data[i] = Math.random() * 2 - 1;
    }
    var now = ctx.currentTime + (delay || 0);
    var source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(120, cutoff * 0.35), now + dur);
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(now);
    source.stop(now + dur + 0.02);
  }

  var Sfx = {
    unlock: unlock,
    isMuted: function () { return muted; },
    setMuted: function (value) {
      muted = !!value;
      persist();
      if (master) master.gain.value = muted ? 0 : 0.55;
    },
    toggle: function () {
      Sfx.setMuted(!muted);
      if (!muted) Sfx.click();
      return muted;
    },
    click: function () {
      tone({ freq: 660, freq2: 880, dur: 0.05, type: 'square', gain: 0.025 });
    },
    start: function () {
      tone({ freq: 220, freq2: 330, dur: 0.09, type: 'square', gain: 0.04 });
      tone({ freq: 330, freq2: 440, dur: 0.09, type: 'square', gain: 0.04, delay: 0.09 });
      tone({ freq: 440, freq2: 660, dur: 0.18, type: 'square', gain: 0.045, delay: 0.18 });
    },
    shoot: function () {
      tone({ freq: 900, freq2: 280, dur: 0.055, type: 'square', gain: 0.022 });
    },
    alienExplode: function () {
      var now = (window.performance && performance.now()) || Date.now();
      if (now - lastExplosionAt < 32) return;
      lastExplosionAt = now;
      noise(0.2, 0.075, 1400);
      tone({ freq: 150, freq2: 45, dur: 0.16, type: 'sine', gain: 0.055 });
    },
    playerExplode: function () {
      noise(0.5, 0.13, 900);
      tone({ freq: 210, freq2: 28, dur: 0.55, type: 'sawtooth', gain: 0.08 });
    },
    bonus: function () {
      tone({ freq: 660, dur: 0.07, type: 'triangle', gain: 0.055 });
      tone({ freq: 990, dur: 0.07, type: 'triangle', gain: 0.055, delay: 0.07 });
      tone({ freq: 1320, dur: 0.12, type: 'triangle', gain: 0.055, delay: 0.14 });
    },
    extra: function () {
      tone({ freq: 520, freq2: 1040, dur: 0.18, type: 'square', gain: 0.04 });
    },
    levelUp: function () {
      [392, 523, 659, 784].forEach(function (f, i) {
        tone({ freq: f, dur: 0.16, type: 'square', gain: 0.04, delay: i * 0.1 });
      });
    },
    pause: function () {
      tone({ freq: 440, freq2: 330, dur: 0.08, type: 'square', gain: 0.03 });
    },
    gameOver: function () {
      tone({ freq: 330, freq2: 110, dur: 0.7, type: 'sawtooth', gain: 0.06 });
    }
  };

  window.Sfx = Sfx;
})();
