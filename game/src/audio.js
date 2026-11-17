// audio.js — all sound is synthesized live with WebAudio. No audio files, no network.
(function (global) {
  'use strict';
  var SB = global.SB;

  var ctx = null, master = null, muted = false;
  var engineOsc = null, engineGain = null, sirenOscA = null, sirenOscB = null, sirenGain = null;
  var musicTimer = null, musicStep = 0;

  function ensureCtx() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      startEngineHum();
      startSiren();
      startMusic();
      return true;
    } catch (e) { return false; }
  }

  function now() { return ctx ? ctx.currentTime : 0; }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ctx || muted) return;
    var t = now();
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noiseBurst(dur, vol, lowpass) {
    if (!ctx || muted) return;
    var t = now();
    var len = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource(); src.buffer = buf;
    var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowpass || 1200;
    var g = ctx.createGain(); g.gain.value = vol || 0.4;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  }

  function startEngineHum() {
    engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 55;
    var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320;
    engineGain = ctx.createGain(); engineGain.gain.value = 0.0;
    engineOsc.connect(f); f.connect(engineGain); engineGain.connect(master);
    engineOsc.start();
  }
  function setEngine(speed01, on) {
    if (!ctx || !engineOsc) return;
    var t = now();
    engineOsc.frequency.setTargetAtTime(45 + speed01 * 130, t, 0.08);
    engineGain.gain.setTargetAtTime(muted || !on ? 0 : 0.05 + speed01 * 0.06, t, 0.1);
  }

  function startSiren() {
    sirenOscA = ctx.createOscillator(); sirenOscA.type = 'sine'; sirenOscA.frequency.value = 700;
    sirenOscB = ctx.createOscillator(); sirenOscB.type = 'sine'; sirenOscB.frequency.value = 950;
    sirenGain = ctx.createGain(); sirenGain.gain.value = 0;
    var gA = ctx.createGain(); gA.gain.value = 0.5;
    var gB = ctx.createGain(); gB.gain.value = 0.5;
    sirenOscA.connect(gA); gA.connect(sirenGain);
    sirenOscB.connect(gB); gB.connect(sirenGain);
    sirenGain.connect(master);
    sirenOscA.start(); sirenOscB.start();
    var flip = false;
    setInterval(function () {
      if (!ctx) return;
      flip = !flip;
      var t = now();
      sirenOscA.frequency.setTargetAtTime(flip ? 700 : 950, t, 0.05);
      sirenOscB.frequency.setTargetAtTime(flip ? 950 : 700, t, 0.05);
    }, 420);
  }
  function setSiren(on) {
    if (!ctx || !sirenGain) return;
    sirenGain.gain.setTargetAtTime(muted || !on ? 0 : 0.045, now(), 0.3);
  }

  // Light sun-soaked synth loop: bass + pluck arpeggio, scheduled every 8th note.
  var BASS = [55, 0, 55, 0, 65.41, 0, 49, 0, 55, 0, 55, 0, 73.42, 0, 65.41, 0];
  var ARP = [220, 277.18, 329.63, 440, 329.63, 277.18, 220, 261.63];
  function startMusic() {
    var stepMs = 210;
    musicTimer = setInterval(function () {
      if (!ctx || muted) { musicStep++; return; }
      var i = musicStep % 16;
      var b = BASS[i];
      if (b) blip(b, 0.22, 'triangle', 0.10);
      if (musicStep % 2 === 0) {
        var a = ARP[(musicStep / 2) % ARP.length | 0];
        blip(a * 2, 0.14, 'sine', 0.045);
      }
      if (musicStep % 32 === 24) noiseBurst(0.18, 0.05, 6000); // soft hat
      musicStep++;
    }, stepMs);
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.5;
    return muted;
  }

  SB.audio = {
    ensure: ensureCtx,
    shot: function () { noiseBurst(0.14, 0.5, 2600); blip(160, 0.1, 'square', 0.25, 60); },
    punch: function () { noiseBurst(0.09, 0.35, 700); blip(90, 0.09, 'sine', 0.3, 50); },
    pickup: function () { blip(660, 0.1, 'sine', 0.2); setTimeout(function () { blip(880, 0.16, 'sine', 0.2); }, 90); },
    cash: function () { blip(880, 0.09, 'triangle', 0.22); setTimeout(function () { blip(1174, 0.09, 'triangle', 0.22); }, 80); setTimeout(function () { blip(1568, 0.18, 'triangle', 0.22); }, 170); },
    missionDone: function () { [523, 659, 784, 1046].forEach(function (f, i) { setTimeout(function () { blip(f, 0.22, 'triangle', 0.25); }, i * 110); }); },
    fail: function () { blip(220, 0.4, 'sawtooth', 0.2, 110); },
    crash: function () { noiseBurst(0.25, 0.5, 900); },
    horn: function () { blip(370, 0.25, 'square', 0.12); blip(466, 0.25, 'square', 0.1); },
    click: function () { blip(1200, 0.05, 'square', 0.12); },
    reload: function () { blip(500, 0.06, 'square', 0.14); setTimeout(function () { blip(700, 0.06, 'square', 0.14); }, 120); },
    siren: setSiren,
    engine: setEngine,
    toggleMute: toggleMute,
    isMuted: function () { return muted; }
  };
})(window);
