// Trade Wars — audio.js (ported from Betrayers / Ralph Origins)
// WebAudio chiptune SFX + a tiny music sequencer. No audio files.
(function () {
  'use strict';
  var TW = window.TW;
  var ctx = null;
  var muted = false;
  var musicOn = true;
  var musicTimer = null;

  function ac() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function osc(type, freq, t0, dur, vol, slide) {
    var a = ac();
    var o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  function noise(t0, dur, vol, lowpass) {
    var a = ac();
    var len = Math.floor(a.sampleRate * dur);
    var buf = a.createBuffer(1, len, a.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    var src = a.createBufferSource(); src.buffer = buf;
    var g = a.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    var node = src;
    if (lowpass) {
      var f = a.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = lowpass;
      src.connect(f); node = f;
    }
    node.connect(g); g.connect(a.destination);
    src.start(t0);
  }

  var SFX = {
    click: function (t) { osc('square', 880, t, 0.05, 0.08); },
    select: function (t) { osc('square', 523, t, 0.07, 0.12); osc('square', 784, t + 0.07, 0.09, 0.12); },
    deny: function (t) { osc('square', 180, t, 0.1, 0.14, 120); },
    hail: function (t) { osc('square', 1245, t, 0.03, 0.06); osc('square', 1567, t + 0.05, 0.03, 0.05); },
    jumpCharge: function (t) { osc('sawtooth', 110, t, 0.5, 0.12, 880); noise(t + 0.1, 0.4, 0.06, 1200); },
    jumpEngage: function (t) { noise(t, 0.5, 0.18, 900); osc('sawtooth', 660, t, 0.45, 0.1, 55); },
    arrive: function (t) { osc('triangle', 523, t, 0.12, 0.12); osc('triangle', 784, t + 0.1, 0.16, 0.1); },
    trade: function (t) { osc('square', 784, t, 0.06, 0.12); osc('square', 1175, t + 0.07, 0.1, 0.12); },
    refuel: function (t) { osc('sine', 220, t, 0.25, 0.12, 440); },
    scan: function (t) { [880, 1108, 1318].forEach(function (f, i) { osc('sine', f, t + i * 0.06, 0.08, 0.07); }); },
    alarm: function (t) { osc('sawtooth', 440, t, 0.16, 0.12, 330); osc('sawtooth', 440, t + 0.24, 0.16, 0.12, 330); },
    laser: function (t) { osc('square', 1400, t, 0.09, 0.1, 200); },
    hit: function (t) { noise(t, 0.08, 0.12, 2500); osc('square', 200, t, 0.08, 0.1, 90); },
    explode: function (t) { noise(t, 0.4, 0.2, 800); osc('sawtooth', 150, t, 0.35, 0.15, 40); },
    bounty: function (t) { [523, 659, 784, 1046].forEach(function (f, i) { osc('square', f, t + i * 0.08, 0.12, 0.13); }); },
    death: function (t) { osc('sawtooth', 220, t, 0.7, 0.2, 35); noise(t + 0.1, 0.5, 0.15, 500); }
  };

  TW.sfx = function (name, arg) {
    if (muted) return;
    try {
      var t = ac().currentTime;
      if (SFX[name]) SFX[name](t, arg);
    } catch (e) { /* audio blocked until user gesture */ }
  };

  // ---- music: named tracks from js/data-music.js ----
  // A track is either a chiptune pattern:
  //   { stepMs, melody: ['C5','','G4',...], bass: ['C3',...], wave, bassWave }
  // (note names like 'C5'/'F#4'/'Bb3', '' = rest, or raw Hz numbers)
  // or an audio file you provide:
  //   { file: 'music/mysong.mp3', volume: 0.6 }
  var step = 0;
  var currentId = null;
  var currentTrack = null;
  var audioEl = null;

  var SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function noteHz(n) {
    if (!n) return 0;
    if (typeof n === 'number') return n;
    var m = /^([A-Ga-g])(#|b)?(\d)$/.exec(n.trim());
    if (!m) return 0;
    var semi = SEMITONES[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    var midi = 12 * (+m[3] + 1) + semi;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }
  TW.noteHz = noteHz;

  function musicStep() {
    if (muted || !musicOn || !currentTrack) return;
    try {
      var t = ac().currentTime;
      var mel = currentTrack.melody || [];
      var bas = currentTrack.bass || [];
      var m = noteHz(mel[step % (mel.length || 1)]);
      var b = noteHz(bas[Math.floor(step / 2) % (bas.length || 1)]);
      if (m) osc(currentTrack.wave || 'square', m, t, 0.12, 0.045);
      if (b) osc(currentTrack.bassWave || 'triangle', b, t, 0.16, 0.06);
      step++;
    } catch (e) {}
  }

  function stopAll() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    if (audioEl) { audioEl.pause(); audioEl = null; }
  }

  function play(id) {
    id = id || currentId || 'cruise';
    var tracks = TW.MUSIC || {};
    var track = tracks[id] || tracks.cruise;
    if (!track) return;
    if (id === currentId && (musicTimer || audioEl)) return; // already playing
    stopAll();
    currentId = id;
    currentTrack = track;
    step = 0;
    if (!musicOn) return;
    if (track.file) {
      audioEl = new Audio(track.file);
      audioEl.loop = true;
      audioEl.volume = track.volume !== undefined ? track.volume : 0.5;
      audioEl.muted = muted;
      audioEl.play().catch(function () { /* needs user gesture / file missing */ });
    } else {
      musicTimer = setInterval(musicStep, track.stepMs || 170);
    }
  }

  TW.music = {
    play: play,
    start: function () { play(currentId || 'cruise'); },
    stop: function () { stopAll(); },
    toggle: function () {
      musicOn = !musicOn;
      if (!musicOn) stopAll();
      else { var id = currentId; currentId = null; play(id); }
      return musicOn;
    }
  };

  TW.toggleMute = function () {
    muted = !muted;
    if (audioEl) audioEl.muted = muted;
    return muted;
  };
})();
