// ===================== KAWAII MUSIC GENERATOR =====================
// Procedural J-pop / anime-style BGM made live with WebAudio: every song is newly composed
// (key, tempo, chord progression, melody motifs, drums), and a new one is generated when it ends.
var Music = (function () {
  var AC = null, master = null, comp = null, playing = false, timer = null, vol = 0.5, song = null, nextT = 0, step = 0, songNo = 0, mood = 'menu';
  var listeners = [];
  function rngF(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function pick(r, a) { return a[Math.floor(r() * a.length)]; }
  var PROGS = [[0, 4, 5, 3], [3, 4, 2, 5], [0, 5, 3, 4], [5, 3, 0, 4], [3, 4, 0, 5], [0, 4, 5, 2, 3, 0, 3, 4], [3, 4, 2, 5, 1, 4, 0, 0], [0, 2, 3, 4]];
  var MAJOR = [0, 2, 4, 5, 7, 9, 11];
  var NAMES_A = ['Sakura', 'Honey', 'Pastel', 'Sweet', 'Cotton', 'Sunny', 'Starry', 'Melon', 'Peach', 'Mochi', 'Candy', 'Lucky'];
  var NAMES_B = ['Parade', 'Street', 'Dream', 'Cafe', 'Days', 'Waltz', 'Festival', 'Rhythm', 'Picnic', 'Journey', 'Kiss', 'Bounce'];

  function compose(seed, md) {
    var r = rngF(seed), s = {};
    s.seed = seed; s.key = 60 + pick(r, [0, 2, 3, 5, 7, -3, -1]); s.bpm = md === 'game' ? 118 + Math.floor(r() * 26) : 100 + Math.floor(r() * 22);
    s.title = pick(r, NAMES_A) + ' ' + pick(r, NAMES_B) + ' ♪';
    s.progA = pick(r, PROGS); s.progB = pick(r, PROGS);
    s.lead = pick(r, ['bell', 'square', 'flute', 'bell']); s.swing = r() < 0.3 ? 0.08 : 0;
    s.drum = pick(r, ['pop', 'four', 'half']);
    // melody motifs: 16 sixteenth-steps per bar; values = scale degree offsets or null
    function motif() {
      var m = [], rhythm = pick(r, [[0, 2, 4, 6, 8, 10, 12, 14], [0, 3, 6, 8, 10, 12], [0, 2, 3, 4, 6, 8, 11, 12, 14], [0, 4, 6, 8, 12, 14], [0, 2, 4, 7, 8, 10, 12]]);
      var deg = Math.floor(r() * 5);
      for (var i = 0; i < 16; i++) m.push(null);
      rhythm.forEach(function (st) { deg += pick(r, [-2, -1, -1, 0, 1, 1, 2, 3, -3]); deg = Math.max(-2, Math.min(9, deg)); m[st] = deg; });
      return m;
    }
    s.motifs = [motif(), motif(), motif(), motif()];
    s.form = pick(r, [['A', 'A', 'B', 'A'], ['A', 'B', 'A', 'B'], ['A', 'A', 'B', 'B']]);
    s.bars = 32; s.arp = pick(r, ['up', 'updown', 'broken']);
    return s;
  }
  function freq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function degToMidi(s, chordRoot, deg) { var oct = Math.floor(deg / 7), d = ((deg % 7) + 7) % 7; return s.key + 12 + MAJOR[d] + oct * 12; }
  function chordNotes(s, root) { return [0, 2, 4].map(function (k) { var d = root + k; return s.key + MAJOR[d % 7] + Math.floor(d / 7) * 12; }); }

  // ---- instruments ----
  function env(g, t, a, d, peak, sus, rel) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * sus), t + a + d); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d + rel); }
  function voice(type, f, t, dur, peak, dest, detune) {
    var o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (detune) o.detune.setValueAtTime(detune, t);
    env(g, t, 0.005, dur * 0.6, peak, 0.35, dur * 0.8); o.connect(g); g.connect(dest || comp); o.start(t); o.stop(t + dur * 1.6 + 0.05); return o;
  }
  function bell(f, t, dur, peak) { // FM bell
    var car = AC.createOscillator(), mod = AC.createOscillator(), mg = AC.createGain(), g = AC.createGain();
    car.frequency.value = f; mod.frequency.value = f * 3.5; mg.gain.setValueAtTime(f * 2.2, t); mg.gain.exponentialRampToValueAtTime(1, t + dur * 1.2);
    mod.connect(mg); mg.connect(car.frequency); env(g, t, 0.003, dur * 0.4, peak, 0.25, dur * 1.3); car.connect(g); g.connect(comp);
    car.start(t); mod.start(t); car.stop(t + dur * 2 + 0.1); mod.stop(t + dur * 2 + 0.1);
  }
  function lead(s, f, t, dur) {
    if (s.lead === 'bell') { bell(f, t, dur, 0.16); bell(f * 2, t, dur * 0.6, 0.03); }
    else if (s.lead === 'square') { var o = voice('square', f, t, dur, 0.05); o.frequency.setValueAtTime(f, t); var l = AC.createOscillator(), lg = AC.createGain(); l.frequency.value = 6; lg.gain.value = f * 0.01; l.connect(lg); lg.connect(o.frequency); l.start(t + 0.08); l.stop(t + dur * 1.6); voice('triangle', f * 2, t, dur * 0.5, 0.03); }
    else { voice('sine', f, t, dur, 0.12); voice('triangle', f * 2, t, dur, 0.02); }
  }
  var noiseBuf = null;
  function noise(t, dur, peak, hp, bp) {
    if (!noiseBuf) { noiseBuf = AC.createBuffer(1, AC.sampleRate * 0.5, AC.sampleRate); var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    var n = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(); n.buffer = noiseBuf;
    f.type = bp ? 'bandpass' : 'highpass'; f.frequency.value = bp || hp; g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f); f.connect(g); g.connect(comp); n.start(t); n.stop(t + dur + 0.02);
  }
  function kick(t) { var o = AC.createOscillator(), g = AC.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25); o.connect(g); g.connect(comp); o.start(t); o.stop(t + 0.3); }
  function snare(t) { noise(t, 0.16, 0.18, 0, 1800); voice('triangle', 220, t, 0.06, 0.06); }
  function hat(t, open) { noise(t, open ? 0.12 : 0.04, 0.06, 7000); }
  function bass(f, t, dur) { voice('triangle', f, t, dur, 0.22); voice('sine', f / 2, t, dur, 0.12); }
  function pad(fs, t, dur) { fs.forEach(function (f) { var o = AC.createOscillator(), g = AC.createGain(); o.type = 'sawtooth'; o.frequency.value = f; var lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.018, t + 0.15); g.gain.linearRampToValueAtTime(0.0001, t + dur); o.connect(lp); lp.connect(g); g.connect(comp); o.start(t); o.stop(t + dur + 0.05); }); }
  function sparkle(t, s) { var m = s.key + 24 + MAJOR[Math.floor(Math.random() * 7)]; bell(freq(m), t, 0.25, 0.03); }

  function scheduleStep(t) {
    var s = song, sp = 60 / s.bpm / 4, bar = Math.floor(step / 16), st = step % 16;
    if (bar >= s.bars) { newSong(); s = song; bar = 0; st = 0; step = 0; }
    var sec = s.form[Math.floor(bar / 8) % 4], prog = sec === 'A' ? s.progA : s.progB, root = prog[bar % prog.length];
    var cn = chordNotes(s, root), sw = (st % 2 === 1) ? s.swing * sp * 2 : 0, tt = t + sw;
    var intro = bar < 2, outro = bar >= s.bars - 1;
    // drums
    if (!intro) {
      if (s.drum === 'four' ? st % 4 === 0 : s.drum === 'half' ? st === 0 || st === 10 : (st === 0 || st === 6 || st === 10)) kick(tt);
      if (s.drum === 'half' ? st === 8 : (st === 4 || st === 12)) snare(tt);
      if (st % 2 === 0) hat(tt, st === 14);
      if (bar % 8 === 7 && st >= 12) snare(tt);
    }
    // bass: root bounces octave
    if (st % 4 === 0 || (st % 4 === 2 && sec === 'B')) bass(freq(cn[0] - 24 + (st % 8 === 4 ? 12 : 0)), tt, sp * 1.8);
    // pad on bar start
    if (st === 0) pad(cn.map(freq), tt, sp * 16);
    // arpeggio
    if (st % 2 === 0 && !outro) { var arr = s.arp === 'up' ? [0, 1, 2, 1] : s.arp === 'updown' ? [0, 1, 2, 3, 2, 1, 0, 1] : [0, 2, 1, 2]; var i = arr[(st / 2) % arr.length]; var m = (i === 3 ? cn[0] + 12 : cn[i]) + 12; voice('triangle', freq(m), tt, sp * 1.2, 0.035); }
    // melody (A uses motifs 0/1, B uses 2/3), skip during intro
    if (!intro) {
      var mot = s.motifs[(sec === 'A' ? 0 : 2) + (bar % 2)], d = mot[st];
      if (d !== null && d !== undefined) {
        var deg = d + root % 3, len = 2; for (var k = st + 1; k < 16 && mot[k] === null && len < 6; k++) len++;
        lead(s, freq(degToMidi(s, root, deg)), tt, sp * len * 0.9);
      }
      if (bar % 4 === 3 && st === 15) sparkle(tt, s);
    }
    step++;
  }
  function tick() { if (!playing) return; while (nextT < AC.currentTime + 0.15) { scheduleStep(nextT); nextT += 60 / song.bpm / 4; } }
  function newSong() { songNo++; song = compose((Date.now() ^ (songNo * 7919)) & 0x7fffffff, mood); step = 0; listeners.forEach(function (f) { f(song); }); }
  function ensure() {
    if (AC) return true;
    try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return false; }
    comp = AC.createDynamicsCompressor(); master = AC.createGain(); master.gain.value = vol * 0.9;
    var rev = AC.createDelay(); rev.delayTime.value = 0.18; var fb = AC.createGain(); fb.gain.value = 0.22; var wet = AC.createGain(); wet.gain.value = 0.18;
    comp.connect(master); comp.connect(rev); rev.connect(fb); fb.connect(rev); rev.connect(wet); wet.connect(master); master.connect(AC.destination);
    return true;
  }
  function start(md) {
    if (md) mood = md;
    if (!ensure()) return; if (AC.state === 'suspended') AC.resume();
    if (playing) return; playing = true; if (!song) newSong(); nextT = AC.currentTime + 0.1; timer = setInterval(tick, 25);
  }
  function stop() { playing = false; clearInterval(timer); }
  function next(md) { if (md) mood = md; newSong(); if (AC) nextT = AC.currentTime + 0.1; }
  function setVol(v) { vol = v; if (master) master.gain.setTargetAtTime(v * 0.9, AC.currentTime, 0.05); }
  return { start: start, stop: stop, next: next, setVol: setVol, get playing() { return playing; }, get song() { return song; }, get vol() { return vol; }, onSong: function (f) { listeners.push(f); }, setMood: function (m) { if (m !== mood) { mood = m; if (playing) next(m); } } };
})();
