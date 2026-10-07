"use strict";

/* =================================================================
   MUSIC — per request (Settings > music). The game had no sound at all, so
   this is a small procedural soundtrack made with WebAudio (no audio files):
     - "title": the title screen — a warm A-minor theme (pad, harp-like
       arpeggio, soft bass, a bell melody every other loop);
     - "day":   while playing by day — C / Am / F / G, slower, lighter;
     - "night": by night — just the pad and a slow arpeggio, very soft.
   Music.play(name) cross-fades to a song; Music.setVolume(0..1) /
   Music.setEnabled(bool) are saved (localStorage "agn-music-vol",
   "agn-music-on"). The audio starts on the first tap / click / key (a
   browser rule) and pauses while the app is in the background.
================================================================= */
const Music = (() => {
  let ctx = null, master = null, songGain = null, verb = null, wet = null;
  let volume = 0.5, enabled = true;
  try {
    const v = localStorage.getItem("agn-music-vol"); if (v !== null && !isNaN(+v)) volume = Math.max(0, Math.min(1, +v));
    enabled = localStorage.getItem("agn-music-on") !== "0";
  } catch (e) { /* private mode */ }

  let want = null, song = null, step = 0, nextAt = 0, cycle = 0, timer = 0;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  const SONGS = {
    title: {
      bpm: 84,
      chords: [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]],
      bass: [45, 41, 48, 43],
      melody: [76, 0, 74, 0, 72, 0, 0, 0, 69, 0, 0, 0, 0, 0, 72, 0,
               72, 0, 74, 0, 72, 0, 69, 0, 65, 0, 0, 0, 0, 0, 0, 0,
               67, 0, 72, 0, 76, 0, 79, 0, 76, 0, 0, 0, 74, 0, 72, 0,
               74, 0, 0, 0, 71, 0, 67, 0, 74, 0, 0, 0, 0, 0, 0, 0],
      arp: [0, 1, 2, 3, 2, 1, 0, 1, 0, 1, 2, 3, 2, 1, 2, 1], arpGain: 1, melodyEvery: 2,
    },
    day: {
      bpm: 72,
      chords: [[55, 60, 64], [57, 60, 64], [53, 57, 60], [55, 59, 62]],
      bass: [48, 45, 41, 43],
      melody: [79, 0, 0, 0, 76, 0, 74, 0, 72, 0, 0, 0, 0, 0, 0, 0,
               76, 0, 0, 0, 72, 0, 69, 0, 72, 0, 0, 0, 0, 0, 0, 0,
               69, 0, 72, 0, 74, 0, 0, 0, 72, 0, 69, 0, 65, 0, 0, 0,
               67, 0, 0, 0, 71, 0, 74, 0, 79, 0, 0, 0, 0, 0, 0, 0],
      arp: [0, -1, 1, -1, 2, -1, 1, -1, 0, -1, 1, -1, 2, -1, 3, -1], arpGain: 0.8, melodyEvery: 3,
    },
    night: {
      bpm: 60,
      chords: [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]],
      bass: [45, 41, 38, 40],
      melody: null,
      arp: [0, -1, -1, -1, 2, -1, -1, -1, 1, -1, -1, -1, 3, -1, -1, -1], arpGain: 0.6, melodyEvery: 0,
    },
  };

  function ensure() {
    if (ctx) { if (ctx.state === "suspended" && !document.hidden) ctx.resume().catch(() => {}); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { ctx = new AC(); } catch (e) { return false; }
    master = ctx.createGain(); master.gain.value = enabled ? volume * 0.8 : 0; master.connect(ctx.destination);
    songGain = ctx.createGain(); songGain.gain.value = 0; songGain.connect(master);
    // a soft room: a convolver with a noise impulse fading over 2.4 s
    verb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.4), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    verb.buffer = ir;
    wet = ctx.createGain(); wet.gain.value = 0.32; verb.connect(wet); wet.connect(songGain);
    timer = setInterval(tick, 60);
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return true;
  }

  function out(node, dry = 1) { const g = ctx.createGain(); g.gain.value = dry; node.connect(g); g.connect(songGain); node.connect(verb); }

  function pad(t, notes, dur) {
    for (const n of notes) for (const det of [-6, 6]) {
      const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = mtof(n); o.detune.value = det;
      const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 900;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.028, t + 0.9);
      g.gain.setValueAtTime(0.028, t + dur - 0.2); g.gain.linearRampToValueAtTime(0, t + dur + 1.2);
      o.connect(f); f.connect(g); out(g, 0.9); o.start(t); o.stop(t + dur + 1.3);
    }
  }
  function pluck(t, n, gain) {
    const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = mtof(n);
    const o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = mtof(n + 12);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.075 * gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0008, t + 1.0);
    const g2 = ctx.createGain(); g2.gain.value = 0.25; o2.connect(g2); g2.connect(g);
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 2600;
    o.connect(g); g.connect(f); out(f, 0.8); o.start(t); o2.start(t); o.stop(t + 1.05); o2.stop(t + 1.05);
  }
  function bell(t, n) {
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0006, t + 1.8);
    for (const [r, a] of [[1, 1], [2.76, 0.22], [5.4, 0.06]]) {
      const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = mtof(n) * r;
      const ga = ctx.createGain(); ga.gain.value = a; o.connect(ga); ga.connect(g); o.start(t); o.stop(t + 1.85);
    }
    out(g, 0.7);
  }
  function bass(t, n, dur) {
    const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = mtof(n);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.11, t + 0.04); g.gain.exponentialRampToValueAtTime(0.03, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.15);
    o.connect(g); out(g, 1); o.start(t); o.stop(t + dur + 0.2);
  }

  function tick() {
    if (!ctx || ctx.state !== "running") return;
    if (want !== song) { // fade out, then switch
      const now = ctx.currentTime;
      if (song && songGain.gain.value > 0.02) { songGain.gain.setTargetAtTime(0, now, 0.35); if (!tick.fading) tick.fading = now; if (now - tick.fading < 1.1) return; }
      tick.fading = 0;
      song = want; step = 0; cycle = 0; nextAt = now + 0.15;
      if (song) { songGain.gain.cancelScheduledValues(now); songGain.gain.setValueAtTime(0, now); songGain.gain.linearRampToValueAtTime(1, now + 2.5); }
    }
    const S = SONGS[song];
    if (!S) return;
    const eighth = 60 / S.bpm / 2;
    while (nextAt < ctx.currentTime + 0.25) {
      const ci = Math.floor(step / 16) % 4, s16 = step % 16;
      const chord = S.chords[ci];
      if (s16 === 0) { pad(nextAt, chord, eighth * 16); bass(nextAt, S.bass[ci], eighth * 7.5); }
      if (s16 === 8) bass(nextAt, S.bass[ci] + (ci % 2 ? 7 : 12), eighth * 7);
      const ai = S.arp[s16];
      if (ai >= 0) { const tones = [chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[0] + 24]; pluck(nextAt, tones[ai], S.arpGain); }
      if (S.melody && S.melodyEvery && cycle % S.melodyEvery === 1) { const m = S.melody[step % 64]; if (m) bell(nextAt, m); }
      nextAt += eighth;
      step++;
      if (step % 64 === 0) cycle++;
    }
  }

  function applyVolume() { if (master) master.gain.setTargetAtTime(enabled ? volume * 0.8 : 0, ctx.currentTime, 0.1); }

  // the first tap / click / key starts the audio (browsers need a gesture)
  const kick = () => { if (want && enabled) ensure(); };
  for (const ev of ["pointerdown", "keydown", "touchstart"]) window.addEventListener(ev, kick, { capture: true, passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {}); else if (want && enabled) ctx.resume().catch(() => {});
  });

  return {
    play(name) { want = name; if (enabled) ensure(); },
    stop() { want = null; },
    current() { return want; },
    getVolume() { return volume; },
    setVolume(v) { volume = Math.max(0, Math.min(1, v)); try { localStorage.setItem("agn-music-vol", String(volume)); } catch (e) { /* ignore */ } applyVolume(); },
    isEnabled() { return enabled; },
    setEnabled(on) { enabled = !!on; try { localStorage.setItem("agn-music-on", enabled ? "1" : "0"); } catch (e) { /* ignore */ } if (enabled) ensure(); applyVolume(); },
  };
})();

// In the game: the day theme by day, the night one by night (checked every 5 s).
setInterval(() => {
  const cur = Music.current();
  if (cur !== "day" && cur !== "night") return;
  if (typeof isDaytime !== "function") return;
  Music.play(isDaytime() ? "day" : "night");
}, 5000);
