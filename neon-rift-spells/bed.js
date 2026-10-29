"use strict";
/* Procedural beds for nrl1. Original melodies only. No samples. */
(function (root) {
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function chordHz(key, chord) {
    let ns = chord.map(function (o) { return key + o; });
    const top = Math.max.apply(null, ns);
    ns = ns.map(function (n) { return n < top - 11 ? n + 12 : n; });
    ns.sort(function (a, b) { return a - b; });
    return ns.map(hz);
  }

  const tracks = [
    { id: "A", tag: "A", name: "NIGHT RUN", preview: true, bpm: 102, rush: 116, bars: 16, lp: [5200, 11000],
      line: "Dark outrun. A driving minor arp and a four-on-the-floor kick." },
    { id: "B", tag: "B", name: "BLACK VEIL", preview: true, audition: true, bpm: 70, rush: 82, bars: 12, lp: [2200, 4000],
      line: "Neon-noir pulse. Slow heartbeat and a deep bass." },
    { id: "C", tag: "C", name: "ASCENT", preview: true, bpm: 136, rush: 142, bars: 24, lp: [6400, 12000],
      line: "Uplifting trance. A long build that opens into a drop." },
    { id: "D", tag: "D", name: "SPLIT", preview: true, bpm: 174, rush: 178, bars: 32, lp: [3800, 7200],
      line: "Drum and bass. Fast breakbeat and a moving reese bass." },
    { id: "E", tag: "E", name: "LATE SHIFT", preview: true, audition: true, bpm: 80, rush: 90, bars: 12, swing: 0.64, lp: [2600, 4200],
      line: "Late-night groove. Swung drums, dusty chords, a soft bass." },
    { id: "F", tag: "F", name: "FLOOR", preview: true, audition: true, bpm: 122, rush: 128, bars: 20, lp: [3400, 9000],
      line: "Club floor. Pumping kick, chopped chords, a short hook." },
    { id: "J", tag: "", name: "JANGLE", preview: false, bpm: 118, rush: 130, bars: 16, grid: "8", swing: 0.57, lp: [6200, 10800],
      line: "Bright 60s band. Strums, a walking bass, and a short hook." },
    { id: "v1", tag: "4", name: "LOW LAMP", audition: true, bpm: 66, rush: 74, bars: 12, lp: [1400, 2800],
      line: "Dark noir drone. A lamp in an empty room, almost still." },
    { id: "v2", tag: "5", name: "NIGHT BUS", audition: true, bpm: 86, rush: 94, bars: 14, swing: 0.62, lp: [2400, 4600],
      line: "Late-night groove. The city sliding past a wet window." },
    { id: "v3", tag: "6", name: "CELLAR", audition: true, bpm: 126, rush: 130, bars: 16, lp: [3200, 8600],
      line: "Club energy. A low room and a steady kick." },
    { id: "v4", tag: "7", name: "AFTERDARK", audition: true, bpm: 112, rush: 120, bars: 16, lp: [2800, 9000],
      line: "Darksynth. A minor arp over a cold bass." },
    { id: "v5", tag: "8", name: "DEEPER", audition: true, bpm: 122, rush: 126, bars: 16, lp: [2600, 6400],
      line: "Deep house. Warm chords under a soft four-on-the-floor." },
    { id: "v6", tag: "9", name: "WAREHOUSE", audition: true, bpm: 132, rush: 136, bars: 18, lp: [3000, 7800],
      line: "Berlin techno. Hypnotic, dry, one note for a long time." },
    { id: "v7", tag: "10", name: "COWL", audition: true, bpm: 150, rush: 156, bars: 24, lp: [1800, 4200],
      line: "Phonk-ish bass. Half-time weight and a metallic tick." },
    { id: "v8", tag: "11", name: "DOCKSIDE", audition: true, bpm: 84, rush: 92, bars: 12, swing: 0.6, lp: [2000, 3800],
      line: "Trip-hop. Dusty drums and a slow minor bass." },
    { id: "v9", tag: "12", name: "GLASS HALL", audition: true, bpm: 72, rush: 80, bars: 12, lp: [2200, 5600],
      line: "Cinematic hybrid. Low strings and a distant pulse." },
    { id: "v10", tag: "13", name: "CHROME FUNK", audition: true, bpm: 100, rush: 108, bars: 16, lp: [2800, 6200],
      line: "Retro funk. A clipped bass and bright stabs." },
    { id: "v11", tag: "14", name: "DRIFT", audition: true, bpm: 60, rush: 68, bars: 8, lp: [1600, 3200],
      line: "Ambient pulse. Soft light, no hurry." },
    { id: "v12", tag: "15", name: "TWO STEP", audition: true, bpm: 132, rush: 136, bars: 20, swing: 0.58, lp: [3400, 8000],
      line: "Garage / 2-step. A skippy kick and shuffled hats." },
    { id: "v13", tag: "16", name: "SWING WIRE", audition: true, bpm: 116, rush: 124, bars: 16, swing: 0.66, lp: [3000, 7000],
      line: "Electro-swing. A swung brass stab over a walking bass." },
    { id: "v14", tag: "17", name: "IRON", audition: true, bpm: 118, rush: 126, bars: 16, lp: [2400, 6400],
      line: "Industrial. Rigid metal and a dissonant bass." },
    { id: "v15", tag: "18", name: "SHORE", audition: true, bpm: 92, rush: 100, bars: 16, lp: [2600, 5400],
      line: "Chillwave. Washed major-sevens and a soft drum." }
  ];

  function hitA(api, t, pos, rush, menu) {
    const s = pos % 16, bar = (pos / 16) | 0;
    const roots = [57, 53, 48, 55, 57, 53, 50, 52];
    const maj = [0, 1, 1, 1, 0, 1, 0, 1];
    const bi = bar % 8, root = roots[bi], third = maj[bi] ? 4 : 3;
    if (s % 4 === 0) api.kick(t, rush ? 0.82 : 0.68, 48);
    if (s === 4 || s === 12) api.snare(t, rush ? 0.28 : 0.18);
    if (s % 2 === 1) api.hat(t, rush ? 0.07 : 0.04, false);
    if (rush && (s === 6 || s === 14)) api.hat(t, 0.06, true);
    if (s % 2 === 0) {
      const oct = (s === 6 || s === 14) ? 12 : 0;
      api.sine(hz(root - 24 + oct), t, 0.18, rush ? 0.2 : 0.14);
    }
    const tones = [0, third, 7, 12], order = [0, 2, 3, 1, 0, 3, 2, 1];
    const midi = root + 12 + tones[order[s % 8]];
    const accent = s % 4 === 0 ? 1 : 0.55;
    api.saw(hz(midi), t, 0.1, (rush ? 0.05 : 0.032) * accent, 0, { type: "lowpass", f: rush ? 3400 : 1500, q: 0.7 });
    if (s === 0) [0, third, 7].forEach(function (d) { api.tri(hz(root + d), t, 1.8, rush ? 0.03 : 0.016); });
    if (!menu && s % 2 === 0 && (rush || bar >= 8)) {
      const shape = [0, third, 7, 12, 7, third, 0, -1];
      api.tri(hz(root + 12 + shape[(s >> 1) % 8]), t, 0.22, rush ? 0.055 : 0.04);
    }
  }
  function layerOf(rush) {
    if (typeof rush !== "number") return null;
    const d = rush < 0 ? 0 : rush > 1 ? 1 : rush;
    const fade = function (a, b) {
      if (d <= a) return 0;
      if (d >= b) return 1;
      const u = (d - a) / (b - a);
      return u * u * (3 - 2 * u);
    };
    return { d: d, hats: fade(0.02, 0.34), snare: fade(0.28, 0.64), full: fade(0.58, 0.94) };
  }
  function hitB(api, t, pos, rush, menu) {
    const s = pos % 16, bar = (pos / 16) | 0;
    const L = layerOf(rush);
    if (L) {
      const roots = [50, 46, 43, 57], maj = [0, 1, 0, 1];
      const bi = bar % 4, root = roots[bi];
      if (s === 0) api.kick(t, 0.7 + 0.16 * L.hats, 40);
      if (s === 10) api.kick(t, 0.36 + 0.14 * L.hats, 36);
      if (s % 4 === 0) api.hat(t, 0.01 + 0.035 * L.hats, false);
      if (L.full > 0.04 && s % 2 === 0) api.hat(t, 0.03 * L.full, false);
      if (L.snare > 0.04 && (s === 4 || s === 12)) api.snare(t, 0.14 * L.snare);
      if (s === 0) {
        const n = root - 24;
        api.sine(hz(n), t, 3.1, 0.16 + 0.1 * L.full, hz(Math.max(24, n - 2)));
        if (L.full > 0.04) api.saw(hz(root + 12), t, 2.4, 0.028 * L.full, 0, { type: "lowpass", f: 520, q: 0.5 });
      }
      if ((s === 0 || s === 12) && !menu) api.tri(hz(root + (maj[bi] ? 11 : 10)), t, 0.8, 0.04 + 0.02 * L.hats);
      if (s === 0 && !menu) {
        const mel = [0, 3, 7, 10, 12, 10, 8, 7, 5, 3, 2, 0];
        api.sine(hz(62 + mel[bar % 12]), t, 2.2, 0.035 + 0.025 * L.full, hz(62 + mel[bar % 12] - 1));
      }
      return;
    }
    const roots = [50, 46, 43, 57], maj = [0, 1, 0, 1];
    const bi = bar % 4, root = roots[bi];
    if (s === 0) api.kick(t, 0.86, 40);
    if (s === 10) api.kick(t, 0.5, 36);
    if (s % 4 === 0) api.hat(t, rush ? 0.045 : 0.022, false);
    if (rush && s % 2 === 0) api.hat(t, 0.03, false);
    if (s === 0) {
      const n = root - 24;
      api.sine(hz(n), t, 3.1, rush ? 0.26 : 0.18, hz(Math.max(24, n - 2)));
      if (rush) api.saw(hz(root + 12), t, 2.4, 0.028, 0, { type: "lowpass", f: 520, q: 0.5 });
    }
    if ((s === 0 || s === 12) && !menu) {
      const color = maj[bi] ? 11 : 10;
      api.tri(hz(root + color), t, 0.8, 0.06);
    }
    if (s === 0 && !menu) {
      const mel = [0, 3, 7, 10, 12, 10, 8, 7, 5, 3, 2, 0];
      const n = 62 + mel[bar % 12];
      api.sine(hz(n), t, 2.2, rush ? 0.06 : 0.04, hz(n - 1));
    }
  }
  function hitC(api, t, pos, rush, menu) {
    const s = pos % 16, bar = (pos / 16) | 0;
    const roots = [57, 55, 53, 48], thirds = [3, 4, 4, 4];
    const bi = bar % 4, root = roots[bi], third = thirds[bi];
    const e = rush ? 1 : Math.min(1, bar / 16);
    if (s % 4 === 0) { api.kick(t, 0.74, 50); api.duck(t); }
    if (s === 4 || s === 12) api.snare(t, 0.12 + e * 0.12);
    if (s % 4 === 2) api.hat(t, 0.04 + e * 0.03, true);
    if (s % 2 === 0 && s % 4 !== 2) api.hat(t, 0.02, false);
    if (s % 2 === 0) {
      const shape = [0, 0, 7, 0, 0, 8, 7, 0];
      api.saw(hz(root - 12 + shape[(s >> 1) % 8]), t, 0.16, 0.09 + e * 0.03, 0, { type: "lowpass", f: 180 + e * 260, q: 0.6 });
    }
    if (s % 4 === 2 && e > 0.15) {
      const f = 500 + e * 3600;
      [0, 7].forEach(function (d) {
        api.saw(hz(root + 12 + d), t, 0.11, 0.022 * (0.4 + e), 0, { type: "lowpass", f: f, q: 0.6 }, "pump");
        if (e > 0.55) api.saw(hz(root + 12 + d) * 1.007, t, 0.11, 0.016 * e, 0, { type: "lowpass", f: f, q: 0.5 }, "pump");
      });
    }
    if (!menu && s % 2 === 0 && (rush || bar >= 8)) {
      const hook = [0, 7, 12, 7, 3, 7, 10, 7];
      api.tri(hz(69 + hook[(s >> 1) % 8] + (third === 3 ? 0 : 1)), t, 0.18, 0.04 * (rush ? 1 : Math.max(0.4, e)));
    }
    if ((rush && bar % 8 >= 6) || (!rush && bar >= 16 && bar < 20)) {
      if (s % 2 === 0 || bar >= 18) api.snare(t, 0.07);
    }
    if (s === 0 && (bar === 20 || (rush && bar % 8 === 0))) api.hat(t, 0.12, true);
  }
  function hitD(api, t, pos, rush, menu) {
    const p = pos % 32, s = pos % 16, bar = (pos / 16) | 0;
    const kicks = { 0: 1, 6: 1, 11: 1, 16: 1, 22: 1, 27: 1 };
    if (kicks[p]) api.kick(t, p === 0 || p === 16 ? 0.78 : 0.58, 56);
    if (p === 4 || p === 12 || p === 20 || p === 28) api.snare(t, 0.3);
    if (p === 7 || p === 15 || p === 23) api.snare(t, 0.07);
    if (p % 2 === 0) api.hat(t, p % 4 === 0 ? 0.045 : 0.026, false);
    if (rush && (p === 14 || p === 30)) api.hat(t, 0.055, true);
    if (bar % 8 === 7 && s >= 8 && s % 2 === 0) api.snare(t, 0.1);
    if (s % 2 === 0) {
      const roots = [42, 42, 40, 42];
      const n = roots[(bar >> 1) % 4];
      const wob = [220, 360, 260, 440, 240, 400, 200, 320][(s >> 1) % 8] + (rush ? 180 : 0);
      api.saw(hz(n), t, 0.14, 0.06, 0, { type: "lowpass", f: wob, q: 0.7 });
      api.saw(hz(n) * 1.012, t, 0.14, 0.045, 0, { type: "lowpass", f: wob * 0.9, q: 0.6 });
    }
    if (!menu && s === 0 && bar % 2 === 0) [0, 3, 7].forEach(function (d) { api.tri(hz(54 + d), t, 0.35, 0.035); });
  }
  function hitE(api, t, pos, rush, menu) {
    const s = pos % 16, bar = (pos / 16) | 0;
    const L = layerOf(rush);
    if (L) {
      const chords = [
        [60, 63, 67, 70],
        [56, 60, 63, 67],
        [53, 56, 60, 63],
        [55, 59, 62, 65],
        [60, 63, 67, 70],
        [56, 60, 63, 67]
      ];
      const chord = chords[(bar >> 1) % 6];
      if (s === 0 || s === 7 || s === 10) api.kick(t, (s === 0 ? 0.48 : 0.3) * (0.55 + 0.45 * L.hats), 58);
      if (s % 2 === 0) api.hat(t, 0.01 + 0.02 * L.hats, false);
      if (L.full > 0.04 && s % 2 === 1) api.hat(t, 0.018 * L.full, false);
      if (L.snare > 0.04 && (s === 4 || s === 12)) api.snare(t, 0.14 * L.snare);
      if (s % 4 === 0) api.noise(t, 0.04, 0.008 + 0.006 * L.hats, "highpass", 5000);
      if (s === 0 || (L.full > 0.35 && s === 8)) chord.forEach(function (n, i) {
        api.sine(hz(n), t, 1.15, i === 0 ? 0.04 : 0.028);
        if (i < 3) api.tri(hz(n), t, 0.9, 0.016);
      });
      if (s === 0) api.sine(hz(chord[0] - 24), t, 0.85, 0.15);
      if (s === 8) api.sine(hz(chord[2] - 24), t, 0.42, 0.09);
      if (!menu && bar % 2 === 1 && s % 4 === 0) {
        const mel = [0, 3, 7, 10, 7, 3, 0, -2, 0, 3, 7, 3];
        api.sine(hz(72 + mel[bar % 12]), t, 0.36, 0.03 + 0.02 * L.full);
      }
      return;
    }
    const chords = [
      [60, 63, 67, 70],
      [56, 60, 63, 67],
      [53, 56, 60, 63],
      [55, 59, 62, 65],
      [60, 63, 67, 70],
      [56, 60, 63, 67]
    ];
    const chord = chords[(bar >> 1) % 6];
    if (s === 0 || s === 7 || s === 10) api.kick(t, s === 0 ? 0.52 : 0.36, 58);
    if (s === 4 || s === 12) api.snare(t, 0.126);
    if (s % 2 === 0) api.hat(t, 0.028, false);
    if (rush && s % 2 === 1) api.hat(t, 0.018, false);
    if (s % 4 === 0) api.noise(t, 0.04, 0.012, "highpass", 5000);
    if (s === 0 || (rush && s === 8)) chord.forEach(function (n, i) {
      api.sine(hz(n), t, 1.15, i === 0 ? 0.04 : 0.028);
      if (i < 3) api.tri(hz(n), t, 0.9, 0.016);
    });
    if (s === 0) api.sine(hz(chord[0] - 24), t, 0.85, 0.15);
    if (s === 8) api.sine(hz(chord[2] - 24), t, 0.42, 0.09);
    if (!menu && bar % 2 === 1 && s % 4 === 0) {
      const mel = [0, 3, 7, 10, 7, 3, 0, -2, 0, 3, 7, 3];
      api.sine(hz(72 + mel[bar % 12]), t, 0.36, rush ? 0.05 : 0.035);
    }
  }
  function hitF(api, t, pos, rush, menu) {
    const s = pos % 16, bar = (pos / 16) | 0;
    const L = layerOf(rush);
    if (L) {
      let root = 55, third = 3;
      if (bar >= 8 && bar < 12) { root = 48; third = 3; }
      else if (bar >= 12 && bar < 16) { root = 51; third = 4; }
      else if (bar >= 16) { root = 50; third = 4; }
      if (s % 4 === 0) { api.kick(t, 0.62 + 0.16 * L.hats, 49); api.duck(t); }
      if (s % 4 === 2) api.hat(t, 0.02 + 0.045 * L.hats, true);
      if (L.snare > 0.04 && (s === 4 || s === 12)) api.snare(t, 0.154 * L.snare);
      if (L.full > 0.04 && (s === 6 || s === 14)) api.snare(t, 0.049 * L.full);
      const on = [1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0];
      const deg = [0, 0, 0, 7, 0, 10, 7, 0, 0, 3, 0, 7, 10, 7, 3, 0];
      if (on[s]) {
        const jump = (bar % 4 === 3 && s >= 8) ? 12 : 0;
        api.saw(hz(root - 12 + deg[s] + jump), t, 0.11, 0.07 + 0.03 * L.full, 0, { type: "lowpass", f: 400 + 480 * L.d, q: 0.8 });
      }
      if (s === 2 || s === 6 || s === 10 || s === 14) {
        [0, third, 7].forEach(function (d) {
          api.saw(hz(root + 12 + d), t, 0.08, 0.012 + 0.016 * L.full, 0, { type: "bandpass", f: 860 + 840 * L.d, q: 0.7 }, "pump");
        });
      }
      if (!menu && s % 2 === 0 && (L.full > 0.2 || bar >= 8)) {
        const hook = [0, 3, 7, 10, 7, 3, 5, 7];
        const amp = bar >= 8 ? 1 : L.full;
        api.saw(hz(root + 12 + hook[(s >> 1) % 8]), t, 0.14, 0.038 * amp, 0, { type: "bandpass", f: 780 + 720 * L.d, q: 3.2 });
      }
      return;
    }
    let root = 55, third = 3;
    if (bar >= 8 && bar < 12) { root = 48; third = 3; }
    else if (bar >= 12 && bar < 16) { root = 51; third = 4; }
    else if (bar >= 16) { root = 50; third = 4; }
    if (s % 4 === 0) { api.kick(t, 0.76, 49); api.duck(t); }
    if (s % 4 === 2) api.hat(t, rush ? 0.065 : 0.046, true);
    if (s === 4 || s === 12) api.snare(t, 0.14);
    if (rush && (s === 6 || s === 14)) api.snare(t, 0.049);
    const on = [1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0];
    const deg = [0, 0, 0, 7, 0, 10, 7, 0, 0, 3, 0, 7, 10, 7, 3, 0];
    if (on[s]) {
      const jump = (bar % 4 === 3 && s >= 8) ? 12 : 0;
      api.saw(hz(root - 12 + deg[s] + jump), t, 0.11, rush ? 0.1 : 0.075, 0, { type: "lowpass", f: rush ? 880 : 400, q: 0.8 });
    }
    if (s === 2 || s === 6 || s === 10 || s === 14) {
      [0, third, 7].forEach(function (d) {
        api.saw(hz(root + 12 + d), t, 0.08, 0.026, 0, { type: "bandpass", f: rush ? 1700 : 860, q: 0.7 }, "pump");
      });
    }
    if (!menu && s % 2 === 0 && (rush || bar >= 8)) {
      const hook = [0, 3, 7, 10, 7, 3, 5, 7];
      api.saw(hz(root + 12 + hook[(s >> 1) % 8]), t, 0.14, 0.038, 0, { type: "bandpass", f: rush ? 1500 : 780, q: 3.2 });
    }
  }
  function hitJ(api, t, pos, rush, menu) {
    const phrase = pos % 32;
    const down = phrase % 2 === 0;
    const beatIn = ((phrase % 8) >> 1);
    const chordIdx = (phrase >> 3) % 4;
    const prog = [[0, 4, 7], [9, 0, 4], [5, 9, 0], [7, 11, 2]];
    const chord = prog[chordIdx], next = prog[(chordIdx + 1) % 4], key = 62;
    if (!down) {
      api.hat(t, menu ? 0.014 : (rush ? 0.05 : 0.028), false);
      if (rush && !menu) chordHz(key, chord).forEach(function (f, i) { api.tri(f, t + i * 0.012, 0.09, 0.028); });
      return;
    }
    const walk = [chord[0], chord[0] + 7, chord[1], next[0] - 2][beatIn];
    let b = key - 24 + walk;
    while (b > 52) b -= 12;
    while (b < 30) b += 12;
    api.sine(hz(b), t, 0.42, menu ? 0.11 : 0.17);
    api.tri(hz(b) * 2, t, 0.16, 0.045);
    if (!menu && (beatIn === 0 || beatIn === 2)) api.kick(t, rush ? 0.55 : 0.4, 62);
    if (!menu && (beatIn === 1 || beatIn === 3)) api.snare(t, rush ? 0.18 : 0.12);
    if (!menu || beatIn % 2 === 0) chordHz(key, chord).forEach(function (f, i) { api.tri(f, t + i * 0.016, 0.16, (menu ? 0.028 : 0.042) * (rush ? 1.2 : 1)); });
    const hook = [0, 4, 7, 4, 9, 7, 5, 2, 4, 7, 4, 0, 2, 0, -1, 0];
    const mask = [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1];
    if (!menu && mask[phrase % 16]) api.tri(hz(key + hook[phrase % 16]), t, 0.26, rush ? 0.065 : 0.046);
    if (rush && !menu && mask[phrase % 16]) api.sine(hz(key + hook[phrase % 16] + 12), t, 0.2, 0.028);
    if (beatIn === 0 || (rush && beatIn === 2)) {
      api.tri(hz(key - 12 + chord[1]), t, 0.7, rush ? 0.045 : 0.026);
      api.tri(hz(key - 12 + chord[2]), t, 0.74, rush ? 0.036 : 0.02);
    }
  }
  function hitV1(api, t, pos, rush, menu) {
    const s = pos % 16, bar = (pos / 16) | 0;
    const roots = [46, 41, 43, 39], root = roots[bar % 4];
    if (s === 0) api.kick(t, menu ? 0.4 : 0.72, 36);
    if (s === 0) api.sine(hz(root - 24), t, 3.6, rush ? 0.24 : 0.16, hz(Math.max(24, root - 27)));
    if (s === 8 && !menu) api.sine(hz(root - 12), t, 1.5, 0.045);
    if (s % 8 === 0) api.hat(t, rush ? 0.028 : 0.014, false);
    if (s === 0) {
      api.tri(hz(root + 3), t, 3.2, menu ? 0.016 : 0.03);
      api.tri(hz(root + 10), t, 3.4, 0.02);
    }
    if (!menu && (s === 12 || (rush && s === 4))) api.sine(hz(root + 15), t, 0.9, rush ? 0.045 : 0.026);
  }
  function hitV2(api, t, pos, rush, menu) {
    const s = pos % 16, bar = (pos / 16) | 0;
    const chords = [[58, 61, 65], [56, 60, 63], [53, 56, 60], [51, 55, 58]];
    const chord = chords[bar % 4];
    if (s === 0 || s === 10) api.kick(t, s === 0 ? 0.62 : 0.4, 50);
    if (s === 4 || s === 12) api.snare(t, rush ? 0.2 : 0.14);
    if (s % 2 === 0) api.hat(t, 0.03, false);
    if (rush && s % 2 === 1) api.hat(t, 0.016, false);
    if (s === 0 || s === 8) api.sine(hz(chord[0] - 24), t, 0.7, 0.14);
    if (s === 0 && !menu) chord.forEach(function (n, i) { api.tri(hz(n), t, 1.1, i ? 0.02 : 0.028); });
    if (!menu && s % 4 === 2) {
      const mel = [0, 3, 7, 10, 7, 3, 5, 0];
      api.sine(hz(chord[0] + 12 + mel[(bar + (s >> 2)) % 8]), t, 0.28, rush ? 0.04 : 0.028);
    }
  }
  function hitV3(api, t, pos, rush, menu) {
    const s = pos % 16, bar = (pos / 16) | 0;
    const root = [48, 48, 46, 43][bar % 4];
    if (s % 4 === 0) { api.kick(t, 0.78, 48); api.duck(t); }
    if (s % 4 === 2) api.hat(t, rush ? 0.07 : 0.05, true);
    if (s === 4 || s === 12) api.snare(t, 0.16);
    const bass = [0, 0, 0, 7, 0, 10, 7, 3];
    if (s % 2 === 0) api.saw(hz(root - 12 + bass[(s >> 1) % 8]), t, 0.12, rush ? 0.08 : 0.06, 0, { type: "lowpass", f: rush ? 520 : 280, q: 0.8 });
    if (!menu && (s === 2 || s === 10)) {
      [0, 3, 7].forEach(function (d) { api.saw(hz(root + 12 + d), t, 0.08, 0.02, 0, { type: "bandpass", f: rush ? 1600 : 900, q: 0.7 }, "pump"); });
    }
  }
  function hitV4(api, t, pos, rush, menu) {
    const s = pos % 16, bar = (pos / 16) | 0;
    const root = [45, 48, 41, 43][bar % 4];
    if (s % 4 === 0) api.kick(t, s === 0 ? 0.74 : 0.5, 46);
    if (s === 4 || s === 12) api.snare(t, 0.18);
    if (s % 2 === 1) api.hat(t, rush ? 0.04 : 0.022, false);
    if (s % 2 === 0) api.saw(hz(root - 12), t, 0.16, rush ? 0.07 : 0.05, 0, { type: "lowpass", f: rush ? 420 : 220, q: 0.9 });
    const arp = [0, 3, 7, 12, 10, 7, 3, 0];
    if (!menu) api.saw(hz(root + 12 + arp[s % 8]), t, 0.09, rush ? 0.035 : 0.022, 0, { type: "lowpass", f: rush ? 3200 : 1400, q: 0.6 });
    if (s === 0) api.tri(hz(root + 15), t, 0.5, menu ? 0.012 : 0.02);
  }
  function hitV5(api, t, pos, rush, menu) {
    const s = pos % 16, bar = (pos / 16) | 0;
    const root = [53, 55, 48, 50][(bar >> 1) % 4];
    const third = (bar >> 1) % 4 === 2 ? 3 : 4;
    if (s % 4 === 0) { api.kick(t, 0.66, 50); if (s === 0) api.duck(t); }
    if (s % 8 === 4) api.hat(t, rush ? 0.06 : 0.04, true);
    if (s === 4 || s === 12) api.snare(t, 0.12);
    const walk = [0, 0, 7, 3, 0, 10, 7, 5];
    if (s % 2 === 0) api.sine(hz(root - 12 + walk[(s >> 1) % 8]), t, 0.22, 0.11);
    if ((s === 0 || s === 8) && !menu) [0, third, 7, 11].forEach(function (d, i) {
      api.tri(hz(root + d), t, 0.7, i === 0 ? 0.03 : 0.018);
    });
    if (rush && s === 14) api.hat(t, 0.04, true);
  }
  function hitV6(api, t, pos, rush, menu) {
    const s = pos % 16, bar = (pos / 16) | 0;
    const root = bar % 8 < 6 ? 43 : 41;
    if (s % 4 === 0) api.kick(t, 0.8, 47);
    api.hat(t, s % 4 === 0 ? 0.02 : (s % 2 === 0 ? 0.035 : 0.018), false);
    if (rush && s % 4 === 2) api.hat(t, 0.03, true);
    if (s === 4 || s === 12 || (bar % 4 === 3 && s === 14)) api.noise(t, 0.05, 0.04, "bandpass", 1800);
    if (s % 8 === 4) api.saw(hz(root - 12), t, 0.18, rush ? 0.07 : 0.05, hz(root - 12), { type: "lowpass", f: 160 + ((bar + s) % 5) * 40, q: 0.7 });
    if (!menu && s === 0 && bar % 2 === 0) api.sine(hz(root + 12), t, 0.3, 0.02);
  }
  function hitV7(api, t, pos, rush, menu) {
    const s = pos % 16, bar = (pos / 16) | 0;
    const root = [40, 40, 38, 43][(bar >> 1) % 4];
    if (s === 0) api.kick(t, 0.86, 42);
    if (s === 8) api.snare(t, rush ? 0.28 : 0.2);
    if (s === 8) api.noise(t, 0.08, 0.05, "bandpass", 2400);
    if (s % 2 === 0) api.hat(t, 0.03, false);
    if (s % 4 === 2) api.noise(t, 0.04, rush ? 0.04 : 0.025, "highpass", 5000);
    if (s % 2 === 0) {
      const wob = [180, 240, 160, 300][(s >> 1) % 4] + (rush ? 80 : 0);
      api.saw(hz(root - 12), t, 0.16, 0.07, 0, { type: "lowpass", f: wob, q: 0.8 });
      api.saw(hz(root - 12) * 1.01, t, 0.16, 0.04, 0, { type: "lowpass", f: wob * 0.8, q: 0.6 });
    }
    if (!menu && s === 12) api.sine(hz(root + 15), t, 0.2, 0.03);
  }
  function hitV8(api, t, pos, rush, menu) {
    const s = pos % 16, bar = (pos / 16) | 0;
    const root = [50, 45, 47, 43][bar % 4];
    if (s === 0 || s === 7) api.kick(t, s === 0 ? 0.6 : 0.36, 48);
    if (s === 4 || s === 12) api.snare(t, 0.2);
    if (s % 2 === 0) api.hat(t, 0.022, false);
    if (s % 4 === 0) api.noise(t, 0.06, 0.012, "highpass", 4000);
    if (s === 0 || s === 6 || s === 10) api.sine(hz(root - 24 + (s === 10 ? 5 : 0)), t, 0.55, 0.15);
    if (s === 0 && !menu) [0, 3, 10].forEach(function (d, i) { api.tri(hz(root + d), t, 1.4, 0.022); });
    if (!menu && bar % 2 === 1 && s % 4 === 0) api.sine(hz(root + 12 + [0, 3, 7, 3][(s >> 2) % 4]), t, 0.4, rush ? 0.04 : 0.028);
  }
  function hitV9(api, t, pos, rush, menu) {
    const s = pos % 16, bar = (pos / 16) | 0;
    const roots = [48, 43, 46, 41], root = roots[bar % 4];
    if (s === 0) api.kick(t, menu ? 0.28 : 0.5, 40);
    if (s === 0 || s === 8) api.sine(hz(root - 24), t, 1.8, rush ? 0.16 : 0.11);
    if (s % 8 === 0) {
      [0, 3, 7, 12].forEach(function (d, i) { api.tri(hz(root + d), t, 1.6, i === 3 ? 0.012 : 0.022); });
      api.sine(hz(root + 7), t, 1.5, 0.03);
    }
    if (!menu && (s === 4 || s === 12)) api.saw(hz(root + 12), t, 0.35, rush ? 0.03 : 0.016, 0, { type: "lowpass", f: rush ? 900 : 420, q: 0.5 });
    if (rush && s === 8) api.noise(t, 0.2, 0.03, "bandpass", 800);
    if (s % 4 === 2) api.hat(t, 0.012, false);
  }
  function hitV10(api, t, pos, rush, menu) {
    const s = pos % 16, bar = (pos / 16) | 0;
    const root = [55, 53, 50, 58][bar % 4];
    if (s === 0 || s === 8 || s === 11) api.kick(t, s === 0 ? 0.64 : 0.4, 62);
    if (s === 4 || s === 12) api.snare(t, 0.18);
    if (s % 2 === 1) api.hat(t, rush ? 0.04 : 0.025, false);
    const slapOn = [1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1];
    const slap = [0, 0, 3, 7, 0, 10, 7, 5, 0, 3, 7, 10, 12, 10, 7, 3];
    if (slapOn[s]) api.saw(hz(root - 12 + slap[s]), t, 0.09, s % 2 === 0 ? 0.07 : 0.035, 0, { type: "lowpass", f: rush ? 900 : 480, q: 1 });
    if (!menu && (s === 0 || s === 6)) [0, 4, 7].forEach(function (d) {
      api.tri(hz(root + d), t, 0.16, 0.03);
    });
  }
  function hitV11(api, t, pos, rush, menu) {
    const s = pos % 16, bar = (pos / 16) | 0;
    const root = [53, 48, 55, 50][bar % 4];
    if (s === 0) api.sine(hz(root - 24), t, 3.8, rush ? 0.14 : 0.1, hz(root - 24));
    if (s === 0) api.kick(t, 0.32, 44);
    if (s % 8 === 0) {
      [0, 3, 7, 14].forEach(function (d) { api.sine(hz(root + d), t, 3.2, d === 14 ? 0.012 : 0.02); });
    }
    if (s === 8) api.tri(hz(root + 19), t, 1.2, rush ? 0.03 : 0.016);
    if (rush && s % 4 === 0) api.hat(t, 0.012, false);
    if (!menu && s === 12) api.sine(hz(root + 10), t, 0.8, 0.02);
  }
  function hitV12(api, t, pos, rush, menu) {
    const s = pos % 16, bar = (pos / 16) | 0;
    const root = [56, 51, 53, 58][(bar >> 1) % 4];
    if (s === 0 || s === 7 || s === 10) api.kick(t, s === 0 ? 0.72 : 0.48, 52);
    if (s === 4 || s === 12) api.snare(t, 0.16);
    if (s % 2 === 1) api.hat(t, rush ? 0.05 : 0.032, s % 4 === 3);
    const bass = [0, 0, 3, 7, 0, 10, 7, 0];
    if (s % 2 === 0) api.sine(hz(root - 12 + bass[(s >> 1) % 8]), t, 0.16, 0.1);
    if (!menu && (s === 2 || s === 6 || s === 14)) api.saw(hz(root + 12), t, 0.08, 0.028, 0, { type: "bandpass", f: rush ? 1800 : 980, q: 2.4 });
  }
  function hitV13(api, t, pos, rush, menu) {
    const s = pos % 16, bar = (pos / 16) | 0;
    const prog = [[0, 4, 7], [5, 9, 0], [7, 11, 2], [9, 0, 4]];
    const chord = prog[bar % 4], next = prog[(bar + 1) % 4], key = 60;
    if (s === 0 || s === 8) api.kick(t, 0.58, 58);
    if (s === 4 || s === 12) api.snare(t, rush ? 0.2 : 0.14);
    if (s % 2 === 0) api.hat(t, 0.03, false);
    const beat = (s >> 2) % 4;
    const walk = [chord[0], chord[1], chord[2], next[0] - 2][beat];
    if (s % 4 === 0) api.sine(hz(key - 24 + walk), t, 0.34, 0.13);
    if (!menu && (s === 0 || s === 8)) chord.forEach(function (n, i) {
      api.saw(hz(key + n), t, 0.18, 0.02, 0, { type: "bandpass", f: rush ? 1400 : 700, q: 0.8 });
    });
    if (!menu && s % 4 === 2) api.tri(hz(key + 12 + chord[s % 3]), t, 0.16, rush ? 0.04 : 0.026);
  }
  function hitV14(api, t, pos, rush, menu) {
    const s = pos % 16, bar = (pos / 16) | 0;
    const root = [42, 42, 40, 45][bar % 4];
    if (s % 4 === 0) api.kick(t, 0.84, 44);
    if (s % 2 === 0) api.noise(t, 0.04, rush ? 0.05 : 0.03, "bandpass", 2200 + (s % 8) * 80);
    if (s === 4 || s === 12) api.snare(t, 0.22);
    if (s === 4) api.noise(t, 0.1, 0.06, "highpass", 3000);
    if (s % 2 === 0) {
      const f = hz(root - 12 + (s === 8 ? 1 : 0));
      api.saw(f, t, 0.12, 0.06, 0, { type: "lowpass", f: rush ? 360 : 190, q: 1.2 });
      api.saw(f * 1.02, t, 0.12, 0.03, 0, { type: "lowpass", f: 160, q: 0.6 });
    }
    if (!menu && s === 0 && bar % 2 === 1) api.tri(hz(root + 6), t, 0.25, 0.03);
  }
  function hitV15(api, t, pos, rush, menu) {
    const s = pos % 16, bar = (pos / 16) | 0;
    const chords = [[60, 64, 67, 71], [57, 60, 64, 67], [55, 59, 62, 65], [53, 57, 60, 64]];
    const chord = chords[(bar >> 1) % 4];
    if (s === 0 || s === 10) api.kick(t, s === 0 ? 0.48 : 0.3, 54);
    if (s === 4 || s === 12) api.snare(t, 0.1);
    if (s % 2 === 0) api.hat(t, rush ? 0.028 : 0.016, false);
    if (s === 0 || s === 8) {
      chord.forEach(function (n, i) { api.sine(hz(n), t, 1.3, i ? 0.016 : 0.024); });
      api.sine(hz(chord[0] - 24), t, 0.8, 0.1);
    }
    if (!menu && s % 4 === 2) api.tri(hz(chord[2] + 12), t, 0.3, rush ? 0.03 : 0.02);
  }
  const hits = { A: hitA, B: hitB, C: hitC, D: hitD, E: hitE, F: hitF, J: hitJ,
    v1: hitV1, v2: hitV2, v3: hitV3, v4: hitV4, v5: hitV5, v6: hitV6, v7: hitV7,
    v8: hitV8, v9: hitV9, v10: hitV10, v11: hitV11, v12: hitV12, v13: hitV13, v14: hitV14, v15: hitV15 };
  tracks.forEach(function (tr) { if (hits[tr.id]) tr.hit = hits[tr.id]; });

  function attach(ctx, dest) {
    const noiseLen = Math.floor(ctx.sampleRate * 0.5);
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) ch[i] = Math.random() * 2 - 1;
    const gate = ctx.createGain(); gate.gain.value = 1; gate.connect(dest);
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 7200; lp.connect(gate);
    const dry = ctx.createGain(); dry.connect(gate);
    const pump = ctx.createGain(); pump.gain.value = 1; pump.connect(lp);
    const music = ctx.createGain(); music.connect(lp);
    const pre = ctx.createGain();
    const d1 = ctx.createDelay(0.9); d1.delayTime.value = 0.18;
    const d2 = ctx.createDelay(0.9); d2.delayTime.value = 0.29;
    const damp = ctx.createBiquadFilter(); damp.type = "lowpass"; damp.frequency.value = 3400;
    const fb = ctx.createGain(); fb.gain.value = 0.33;
    const wet = ctx.createGain(); wet.gain.value = 0.3;
    pre.connect(d1); d1.connect(damp); damp.connect(d2); d2.connect(fb); fb.connect(d1); d2.connect(wet); wet.connect(gate);
    let cur = "", step = 0, next = ctx.currentTime + 0.05, lastError = "";
    const info = { id: "", step: 0, rush: false, bpm: 0 };

    function voice(f, t, d, type, vol, bus, slide, filt) {
      if (!(f > 20) || !(vol > 0) || !(d > 0.02)) return;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f, t);
      if (slide > 0) o.frequency.exponentialRampToValueAtTime(Math.max(1, slide), t + d * 0.85);
      let node = o;
      if (filt) {
        const bp = ctx.createBiquadFilter();
        bp.type = filt.type; bp.frequency.setValueAtTime(Math.max(40, filt.f), t); bp.Q.value = filt.q || 0.7;
        o.connect(bp); node = bp;
      }
      node.connect(g);
      const atk = Math.min(0.02, Math.max(0.004, d * 0.2));
      const end = t + Math.max(d, atk + 0.03);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + atk);
      g.gain.exponentialRampToValueAtTime(0.0001, end);
      g.connect(bus);
      o.onended = function () { try { o.disconnect(); g.disconnect(); if (node !== o) node.disconnect(); } catch (e) {} };
      o.start(t); o.stop(end + 0.02);
    }
    function noise(t, d, vol, kind, freq, bus) {
      if (!(vol > 0) || !(d > 0.01)) return;
      const s = ctx.createBufferSource(); s.buffer = noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = kind || "highpass"; f.frequency.value = freq || 7000;
      if (kind === "bandpass") f.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(Math.max(0.0002, vol), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(f); f.connect(g); g.connect(bus || dry);
      s.onended = function () { try { s.disconnect(); f.disconnect(); g.disconnect(); } catch (e) {} };
      s.start(t); s.stop(t + d + 0.02);
    }
    const api = {
      hz: hz,
      sine: function (f, t, d, vol, slide) { voice(f, t, d, "sine", vol, music, slide); },
      tri: function (f, t, d, vol) { voice(f, t, d, "triangle", vol, music); },
      saw: function (f, t, d, vol, slide, filt, bus) { voice(f, t, d, "sawtooth", vol, bus === "pump" ? pump : music, slide, filt); },
      noise: function (t, d, vol, kind, freq) { noise(t, d, vol, kind, freq, music); },
      kick: function (t, vol, body) {
        body = body || 48;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine";
        o.frequency.setValueAtTime(Math.max(90, body * 3.1), t);
        o.frequency.exponentialRampToValueAtTime(Math.max(28, body), t + 0.1);
        const dec = body > 60 ? 0.14 : 0.24;
        g.gain.setValueAtTime(Math.max(0.0002, vol), t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
        o.connect(g); g.connect(dry);
        o.onended = function () { try { o.disconnect(); g.disconnect(); } catch (e) {} };
        o.start(t); o.stop(t + dec + 0.02);
        noise(t, 0.018, vol * 0.18, "highpass", 1600, dry);
      },
      snare: function (t, vol) {
        noise(t, 0.12, vol, "bandpass", 1800, dry);
        voice(196, t, 0.07, "triangle", vol * 0.25, dry);
      },
      hat: function (t, vol, open) { noise(t, open ? 0.09 : 0.03, vol, "highpass", open ? 6000 : 8000, dry); },
      duck: function (t) {
        pump.gain.setValueAtTime(1, t);
        pump.gain.linearRampToValueAtTime(0.38, t + 0.028);
        pump.gain.linearRampToValueAtTime(1, t + 0.16);
      },
      room: function (f, time, dur, vol) { voice(f, time, dur, "sine", vol, pre); }
    };
    function arm() {
      const t = ctx.currentTime;
      gate.gain.cancelScheduledValues(t);
      gate.gain.setValueAtTime(Math.max(0.0001, gate.gain.value), t);
      gate.gain.linearRampToValueAtTime(0.0001, t + 0.03);
      gate.gain.linearRampToValueAtTime(1, t + 0.07);
      try { pump.gain.cancelScheduledValues(t); pump.gain.setValueAtTime(1, t); } catch (e) {}
      step = 0; next = t + 0.08;
    }
    function tick(id, opts) {
      opts = opts || {};
      const tr = byId[id];
      if (!tr) return;
      if (id !== cur) { cur = id; arm(); }
      const numeric = opts.drive != null;
      const drive = numeric ? Math.max(0, Math.min(1, +opts.drive || 0)) : (opts.rush ? 1 : 0);
      const bpm = numeric ? (tr.bpm + (tr.rush - tr.bpm) * drive) : (opts.rush ? tr.rush : tr.bpm);
      const per = tr.grid === "8" ? 8 : 16;
      const loop = tr.bars * per;
      const ahead = Math.min(2.5, opts.ahead || 0.16);
      const cap = opts.ahead ? 80 : 3;
      if (next < ctx.currentTime - 0.12) next = ctx.currentTime + 0.02;
      const horizon = ctx.currentTime + ahead;
      let guard = 0;
      const pair = tr.lp || [7200, 11000];
      const open = numeric ? (pair[0] + (pair[1] - pair[0]) * drive) : (opts.rush ? pair[1] : pair[0]);
      lp.frequency.setTargetAtTime(open, ctx.currentTime, numeric ? 1.1 : 0.25);
      try {
        while (next < horizon && guard++ < cap) {
          const pos = step % loop;
          const down = step % 2 === 0;
          tr.hit(api, next, pos, numeric ? drive : !!opts.rush, !!opts.menu);
          let sp;
          if (tr.swing && tr.grid === "8") {
            const quarter = 60 / bpm;
            sp = down ? quarter * tr.swing : quarter * (1 - tr.swing);
          } else if (tr.swing) {
            const eighth = 60 / bpm / 2;
            sp = down ? eighth * tr.swing : eighth * (1 - tr.swing);
          } else sp = 60 / bpm / 4;
          step++; next += sp;
        }
        lastError = "";
      } catch (err) {
        lastError = String(err && err.message || err);
      }
      info.id = id; info.step = step; info.rush = numeric ? drive > 0.9 : !!opts.rush; info.bpm = bpm; info.drive = drive;
    }
    return {
      tick: tick,
      arm: arm,
      info: info,
      get lastError() { return lastError; }
    };
  }

  function richDrums(api, t, s, style, rush, B, menu, fill) {
    const h = menu ? 0.015 : (rush || B ? 0.05 : 0.03);
    if (s === 0 && style !== "floor") api.duck(t);
    if (style === "pulse") {
      if (s === 0) api.kick(t, 0.9, 38);
      if (s === 10) api.kick(t, 0.5, 34);
      if (s % 4 === 0) api.hat(t, h * 0.5, false);
      if (B && s === 8) api.snare(t, 0.16);
    } else if (style === "hop") {
      if (s === 0 || s === 7 || s === 10) api.kick(t, s === 0 ? 0.68 : 0.42, 52);
      if (s === 4 || s === 12) api.snare(t, B ? 0.24 : 0.18);
      if (s % 2 === 0) api.hat(t, h, false);
      if ((B || rush) && s % 2 === 1) api.hat(t, h * 0.4, false);
    } else if (style === "floor") {
      if (s % 4 === 0) { api.kick(t, 0.86, 48); api.duck(t); }
      if (s % 4 === 2) api.hat(t, h, true);
      if (s === 4 || s === 12) api.snare(t, B ? 0.24 : 0.16);
      if (B && (s === 6 || s === 14)) api.snare(t, 0.06);
    } else if (style === "cine") {
      if (s === 0 || (B && s === 8)) api.kick(t, B ? 0.74 : 0.4, 40);
      if (B && (s === 4 || s === 12)) api.snare(t, 0.18);
      if (s % 8 === 4) api.hat(t, h * 0.45, false);
      if (B && s === 0) api.noise(t, 0.2, 0.03, "bandpass", 700);
    } else if (style === "garage") {
      if (s === 0 || s === 6 || s === 11) api.kick(t, s === 0 ? 0.8 : 0.5, 55);
      if (s === 4 || s === 12) api.snare(t, 0.2);
      if (s % 2 === 1) api.hat(t, h, s % 4 === 3);
    } else {
      if (s % 4 === 0) api.kick(t, 0.84, 46);
      api.hat(t, s % 2 ? h * 0.4 : h * 0.7, false);
      if (B && s % 8 === 4) api.noise(t, 0.05, 0.04, "bandpass", 2000);
    }
    if (fill && s % 2 === 0) api.snare(t, 0.045 + s * 0.004);
  }
  const BASS = {
    veil: [0, 99, 99, 99, 0, 99, 7, 99, 99, 99, 3, 99, 0, 99, 99, 99],
    floor: [0, 99, 0, 99, 7, 99, 0, 99, 3, 99, 0, 99, 10, 99, 7, 99],
    hop: [0, 99, 99, 0, 99, 5, 99, 99, 7, 99, 0, 99, 3, 99, 99, 10],
    cine: [0, 99, 99, 99, 99, 99, 99, 99, 7, 99, 99, 99, 99, 99, 3, 99],
    garage: [0, 99, 99, 0, 99, 99, 7, 99, 0, 99, 10, 99, 7, 99, 99, 3],
    funk: [0, 0, 99, 7, 0, 99, 10, 7, 0, 3, 99, 7, 5, 99, 3, 0]
  };
  const MASK = {
    a: [1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0],
    b: [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1],
    c: [0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0],
    d: [1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0]
  };
  const HOOK = {
    noir: [0, 3, 7, 10, 12, 10, 7, 3, 2, 0, -2, 0, 3, 7, 3, 0],
    hop: [0, 0, 3, 7, 10, 7, 3, 0, -2, 0, 3, 5, 7, 3, 0, -2],
    floor: [0, 7, 12, 7, 3, 7, 10, 7, 12, 10, 7, 3, 0, 3, 7, 12],
    cine: [0, 2, 3, 7, 12, 10, 8, 7, 3, 2, 0, -2, 0, 7, 12, 15],
    funk: [0, 4, 7, 4, 10, 7, 5, 3, 0, 3, 5, 7, 10, 7, 4, 0],
    dark: [0, 1, 0, 3, 7, 6, 3, 1, 0, -1, 0, 3, 6, 3, 1, 0]
  };
  function richHit(spec) {
    return function (api, time, pos, rush, menu) {
      const s = pos % 16, bar = (pos / 16) | 0;
      const split = spec.split || ((spec.bars / 2) | 0);
      const B = bar >= split;
      const prog = B && spec.progB ? spec.progB : spec.prog;
      const chord = prog[Math.floor(bar / (spec.every || 1)) % prog.length];
      const root = chord[0];
      const open = B ? 1 : Math.min(1, (bar + 1) / Math.max(1, split));
      const fill = bar % split === split - 1;
      richDrums(api, time, s, B && spec.drumsB ? spec.drumsB : spec.drums, rush, B, menu, fill);
      const line = BASS[B && spec.bassB ? spec.bassB : spec.bass];
      const deg = line[s];
      if (deg !== 99) {
        const f = hz(root - 12 + deg);
        if (spec.saw) api.saw(f, time, 0.12, (menu ? 0.04 : 0.075) * (rush ? 1.15 : 1), 0, { type: "lowpass", f: (spec.cut || 240) + open * 220, q: 0.8 });
        else api.sine(f, time, B ? 0.36 : 0.5, menu ? 0.08 : 0.15, hz(Math.max(26, root - 15 + deg)));
      }
      if (s === 0 || (B && s === 8)) {
        const stab = s === 8 ? 0.6 : 1;
        for (let i = 1; i < chord.length && i < 5; i++) {
          const vol = (i === 1 ? 0.048 : 0.028) * stab * (menu ? 0.5 : 1) * (0.6 + open * 0.55);
          api.saw(hz(chord[i]), time, s === 0 ? 1.8 : 0.42, vol, 0, { type: "lowpass", f: 380 + open * (B ? 2400 : 1100), q: 0.5 }, "pump");
        }
        if (s === 0) {
          api.sine(hz(root - 24), time, 0.85, menu ? 0.06 : 0.11);
          api.room(hz(chord[Math.min(2, chord.length - 1)]), time, 1.6, 0.045 * (B ? 1.4 : 1));
        }
      }
      const hook = B ? HOOK[spec.hookB || spec.hook].slice().reverse() : HOOK[spec.hook];
      const mask = MASK[B && spec.maskB ? spec.maskB : spec.mask];
      if (!menu && mask[s]) {
        const step = hook[s % hook.length];
        api.tri(hz(root + 12 + step), time, 0.22, rush || B ? 0.058 : 0.038);
        if (B && s % 8 === 0) api.sine(hz(root + 24 + step), time, 0.18, 0.02);
      }
    };
  }
  const RICH = [
    { id: "v16", num: "19", name: "RED LAMP", bpm: 76, rush: 84, bars: 24, split: 12, every: 2, lp: [1800, 3600], drums: "pulse", bass: "veil", saw: false, hook: "noir", mask: "c",
      line: "Noir, slower than a heartbeat. A minor lamp and a long answer.",
      prog: [[45, 57, 60, 64, 67], [41, 53, 57, 60, 65], [48, 55, 60, 64], [43, 55, 58, 62, 67]],
      progB: [[40, 52, 55, 59, 62], [45, 57, 60, 64], [38, 50, 57, 62], [43, 55, 59, 62]] },
    { id: "v17", num: "20", name: "LATE WINDOW", bpm: 88, rush: 96, bars: 24, split: 12, swing: 0.62, every: 2, lp: [2400, 4800], drums: "hop", bass: "hop", hook: "hop", mask: "b",
      line: "Late-shift groove with a swung hook that moves to a new chord.",
      prog: [[50, 62, 65, 69, 72], [48, 60, 63, 67], [45, 57, 60, 64, 69], [43, 55, 59, 62]],
      progB: [[46, 58, 62, 65], [41, 53, 58, 62], [48, 60, 63, 67, 70], [43, 55, 58, 62]] },
    { id: "v18", num: "21", name: "CELLAR TWO", bpm: 124, rush: 128, bars: 32, split: 16, lp: [3200, 8600], drums: "floor", bass: "floor", saw: true, cut: 420, hook: "floor", mask: "a",
      line: "Club floor. Chords pump, then the hook opens in the second half.",
      prog: [[45, 57, 60, 64], [43, 55, 58, 62], [41, 53, 57, 60], [40, 52, 55, 59]],
      progB: [[48, 60, 63, 67, 70], [45, 57, 60, 64], [43, 50, 55, 58], [41, 53, 57, 60]] },
    { id: "v19", num: "22", name: "GLASS CUT", bpm: 72, rush: 80, bars: 24, split: 12, every: 2, lp: [2000, 5200], drums: "cine", bass: "cine", hook: "cine", mask: "c",
      line: "Cinematic hybrid. Low strings, then a brighter second theme.",
      prog: [[41, 53, 57, 60, 65], [46, 58, 62, 65], [43, 55, 58, 62], [36, 48, 55, 60]],
      progB: [[48, 60, 64, 67, 72], [45, 57, 60, 64], [50, 62, 65, 69], [43, 55, 59, 62, 67]] },
    { id: "v20", num: "23", name: "NIGHT MARKET", bpm: 102, rush: 110, bars: 24, split: 12, lp: [2800, 6400], drums: "hop", bass: "funk", saw: true, cut: 520, hook: "funk", mask: "d",
      line: "A funky night walk. The bass talks, the chords answer.",
      prog: [[50, 62, 65, 69], [48, 60, 64, 67], [53, 65, 69, 72], [45, 57, 60, 64]],
      progB: [[55, 67, 71, 74], [50, 62, 65, 69], [48, 60, 63, 67, 70], [43, 55, 59, 62]] },
    { id: "v21", num: "24", name: "UNDERFLOOR", bpm: 121, rush: 126, bars: 32, split: 16, lp: [2600, 7000], drums: "floor", bass: "hop", saw: true, cut: 300, hook: "hop", mask: "b",
      line: "Deep house. Warm chords under the kick, a new loop after the drop.",
      prog: [[41, 53, 56, 60, 63], [46, 58, 61, 65], [43, 55, 58, 62], [48, 60, 63, 67, 70]],
      progB: [[39, 51, 55, 58, 62], [44, 56, 60, 63], [41, 53, 56, 60], [46, 53, 58, 62]] },
    { id: "v22", num: "25", name: "BLACK MILE", bpm: 128, rush: 132, bars: 32, split: 16, lp: [2400, 7800], drums: "floor", bass: "floor", saw: true, cut: 260, hook: "dark", mask: "a",
      line: "Dark club. A minor mile that breaks into a higher hook.",
      prog: [[40, 52, 55, 59], [38, 50, 53, 57], [45, 57, 60, 63], [43, 55, 58, 62]],
      progB: [[42, 54, 58, 61], [40, 52, 55, 59, 62], [37, 49, 52, 56], [35, 47, 51, 54]] },
    { id: "v23", num: "26", name: "RAIN NAVE", bpm: 78, rush: 86, bars: 24, split: 12, every: 2, lp: [1900, 4600], drums: "cine", bass: "veil", hook: "cine", mask: "b",
      line: "A wet nave. Slow chords, then the melody steps into the aisle.",
      prog: [[43, 55, 58, 62, 67], [38, 50, 55, 58], [41, 53, 57, 60, 65], [36, 48, 53, 57]],
      progB: [[46, 58, 62, 65, 70], [41, 53, 57, 60], [48, 55, 60, 64, 67], [43, 50, 55, 59]] },
    { id: "v24", num: "27", name: "SECOND SHIFT", bpm: 92, rush: 100, bars: 24, split: 12, swing: 0.6, every: 2, lp: [2300, 5000], drums: "hop", bass: "hop", hook: "noir", mask: "d",
      line: "Another late shift. Dusty chords and a hook that turns the corner.",
      prog: [[46, 58, 61, 65, 68], [43, 55, 58, 62], [41, 53, 56, 60, 65], [48, 60, 63, 67]],
      progB: [[44, 56, 60, 63], [39, 51, 55, 58, 62], [46, 53, 58, 62], [41, 53, 57, 60]] },
    { id: "v25", num: "28", name: "KILN ROOM", bpm: 116, rush: 124, bars: 24, split: 12, lp: [2200, 6400], drums: "techno", bass: "floor", saw: true, cut: 220, hook: "dark", mask: "a",
      line: "Industrial, but it has a tune. Metal hats, a bass hook, a second room.",
      prog: [[38, 50, 53, 57], [40, 52, 56, 59], [43, 55, 58, 62], [36, 48, 51, 55]],
      progB: [[41, 53, 56, 60, 63], [39, 51, 54, 58], [34, 46, 50, 53], [36, 48, 52, 55]] },
    { id: "v26", num: "29", name: "HARBOR LIGHT", bpm: 84, rush: 92, bars: 24, split: 12, swing: 0.58, every: 2, lp: [2100, 4400], drums: "hop", bass: "cine", hook: "hop", mask: "c",
      line: "Trip-hop on the water. A slow bass and chords that change harbor.",
      prog: [[44, 56, 59, 63, 67], [42, 54, 57, 61], [39, 51, 54, 58, 63], [37, 49, 53, 56]],
      progB: [[46, 58, 61, 65], [41, 53, 56, 60, 65], [44, 51, 56, 60], [39, 51, 55, 58]] },
    { id: "v27", num: "30", name: "HALF DROP", bpm: 140, rush: 146, bars: 32, split: 16, lp: [2000, 8200], drums: "hop", drumsB: "floor", bass: "hop", bassB: "floor", saw: true, cut: 340, hook: "floor", mask: "b", maskB: "a",
      line: "Half-time weight, then the floor drops and the hook shouts.",
      prog: [[40, 52, 55, 59], [38, 50, 53, 57], [43, 55, 58, 62], [36, 48, 52, 55]],
      progB: [[45, 57, 60, 64, 67], [43, 55, 58, 62], [40, 52, 55, 59], [38, 50, 54, 57]] },
    { id: "v28", num: "31", name: "COLD CHORUS", bpm: 110, rush: 118, bars: 32, split: 16, lp: [2600, 9000], drums: "floor", bass: "veil", saw: true, cut: 380, hook: "dark", hookB: "floor", mask: "c", maskB: "a",
      line: "Darksynth with a chorus you can hum, and a brighter second half.",
      prog: [[42, 54, 57, 61], [39, 51, 54, 58], [44, 56, 59, 63, 66], [37, 49, 53, 56]],
      progB: [[46, 58, 61, 65, 68], [44, 56, 59, 63], [41, 53, 56, 60], [39, 51, 55, 58]] },
    { id: "v29", num: "32", name: "SHORELINE", bpm: 96, rush: 104, bars: 24, split: 12, every: 2, lp: [2500, 5400], drums: "hop", bass: "funk", saw: false, hook: "cine", mask: "d",
      line: "Chillwave with a tide. Major colors pull toward a minor shore.",
      prog: [[53, 65, 69, 72, 76], [48, 60, 64, 67], [50, 62, 65, 69, 72], [45, 57, 60, 64]],
      progB: [[51, 63, 66, 70], [46, 58, 62, 65, 69], [48, 55, 60, 64], [43, 55, 58, 62]] },
    { id: "v30", num: "33", name: "SKIP STEP", bpm: 132, rush: 136, bars: 28, split: 16, swing: 0.57, lp: [3000, 7600], drums: "garage", bass: "garage", saw: true, cut: 480, hook: "funk", mask: "b",
      line: "Garage skip with chords. The second half swings a new bass.",
      prog: [[51, 63, 66, 70], [49, 61, 64, 68], [46, 58, 61, 65, 68], [44, 56, 60, 63]],
      progB: [[53, 65, 68, 72], [48, 60, 63, 67, 70], [50, 62, 65, 69], [46, 58, 62, 65]] },
    { id: "v31", num: "34", name: "LONG HALL", bpm: 70, rush: 78, bars: 24, split: 12, every: 2, lp: [1600, 4800], drums: "cine", bass: "cine", hook: "noir", mask: "c",
      line: "A long hall. One chord at a time, then the hall answers.",
      prog: [[36, 48, 55, 60, 64], [41, 53, 57, 60, 65], [38, 50, 55, 58], [43, 55, 58, 62, 67]],
      progB: [[40, 52, 55, 59, 64], [45, 57, 60, 64, 69], [37, 49, 53, 56], [42, 54, 58, 61]] },
    { id: "v32", num: "35", name: "VEIL SONG", bpm: 82, rush: 90, bars: 24, split: 12, every: 2, lp: [1900, 4200], drums: "pulse", bass: "veil", hook: "noir", mask: "a",
      line: "Black Veil with a melody. The same dark pulse, a song on top.",
      prog: [[45, 57, 60, 64, 69], [40, 52, 55, 59], [43, 55, 58, 62, 67], [38, 50, 53, 57]],
      progB: [[47, 59, 62, 66], [42, 54, 57, 61, 66], [45, 52, 57, 61], [40, 52, 56, 59]] },
    { id: "v33", num: "36", name: "YARD LIGHT", bpm: 132, rush: 136, bars: 32, split: 16, lp: [2800, 7400], drums: "techno", bass: "floor", saw: true, cut: 200, hook: "floor", mask: "c", maskB: "a",
      line: "A yard at night. Techno kick, but the chords actually go somewhere.",
      prog: [[43, 55, 58, 62], [41, 53, 56, 60], [39, 51, 55, 58], [46, 58, 61, 65]],
      progB: [[40, 52, 55, 59, 62], [38, 50, 53, 57], [45, 57, 60, 63], [43, 50, 55, 59]] },
    { id: "v34", num: "37", name: "AFTER FLOOR", bpm: 118, rush: 124, bars: 32, split: 16, lp: [3000, 8000], drums: "floor", bass: "funk", saw: true, cut: 460, hook: "funk", mask: "d", maskB: "a",
      line: "Floor energy with a noir chord. The drop keeps the funk bass.",
      prog: [[48, 60, 63, 67, 70], [46, 58, 61, 65], [43, 55, 58, 62], [41, 53, 57, 60, 65]],
      progB: [[50, 62, 65, 69], [45, 57, 60, 64, 67], [48, 55, 60, 64], [43, 55, 59, 62]] },
    { id: "v35", num: "38", name: "THREAD", bpm: 90, rush: 98, bars: 24, split: 12, every: 2, lp: [2200, 5600], drums: "cine", drumsB: "hop", bass: "hop", hook: "cine", mask: "b", maskB: "a",
      line: "A cinematic thread. The pulse stays, the second half grows a groove.",
      prog: [[44, 56, 59, 63, 67], [42, 54, 57, 61], [39, 51, 55, 58, 63], [37, 49, 52, 56]],
      progB: [[46, 58, 62, 65, 69], [41, 53, 56, 60], [48, 60, 63, 67], [43, 55, 58, 62, 67]] }
  ];
  RICH.forEach(function (spec) {
    const tr = { id: spec.id, tag: spec.num, name: spec.name, audition: true, bpm: spec.bpm, rush: spec.rush, bars: spec.bars, lp: spec.lp, line: spec.line, hit: richHit(spec) };
    if (spec.swing) tr.swing = spec.swing;
    tracks.push(tr);
  });

  /* 39–58. The kept beds (Late Shift, Floor, Night Market, Shoreline) are
     7ths and 9ths, a melody on the chord, and a bass that sits on the root
     or the fifth with the kick. These twenty do that on purpose. */
  const QUAL = { m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], "7": [0, 4, 7, 10], m9: [0, 3, 7, 10, 2], maj9: [0, 4, 7, 11, 2], "9": [0, 4, 7, 10, 2] };
  const KICKV = {
    late: { 0: 0.56, 7: 0.34, 10: 0.3 },
    floor: { 0: 0.78, 4: 0.7, 8: 0.76, 12: 0.7 },
    market: { 0: 0.64, 7: 0.4, 10: 0.36 },
    shore: { 0: 0.48, 10: 0.28 }
  };
  function voiceLead(prev, root, q, same) {
    const degs = QUAL[q];
    if (prev && same) return prev.slice();
    if (!prev) {
      const v = [];
      let floorN = 60;
      degs.slice(0, 4).forEach(function (d) {
        let n = root + d;
        while (n < floorN) n += 12;
        while (n >= floorN + 12) n -= 12;
        v.push(n); floorN = n + 2;
      });
      return v;
    }
    const used = {};
    return prev.slice(0, 4).map(function (p) {
      const held = ((p - root) % 12 + 12) % 12;
      if (degs.indexOf(held) >= 0 && p >= 55 && p <= 86 && !used[p]) { used[p] = 1; return p; }
      let best = null, bd = 99;
      for (let o = -2; o <= 3; o++) {
        degs.forEach(function (d) {
          const n = root + d + o * 12;
          if (n < 55 || n > 86 || used[n]) return;
          const dist = Math.abs(n - p);
          if (dist < bd) { bd = dist; best = n; }
        });
      }
      if (best == null) { best = p; while (degs.indexOf(((best - root) % 12 + 12) % 12) < 0) best++; }
      used[best] = 1;
      return best;
    });
  }
  function melodyOf(root, q, phrase) {
    const degs = QUAL[q], pool = [];
    degs.forEach(function (d) {
      let n = root + d;
      while (n < 70) n += 12;
      while (n > 84) n -= 12;
      if (pool.indexOf(n) < 0) pool.push(n);
    });
    let tonic = root;
    while (tonic < 72) tonic += 12;
    while (tonic > 84) tonic -= 12;
    if (pool.indexOf(tonic) < 0) pool.push(tonic);
    pool.sort(function (a, b) { return a - b; });
    const shapes = [[0, 1, 2, 1], [2, 1, 0, 1], [1, 2, 1, 0], [0, 1, 0, 0]];
    const shape = shapes[phrase];
    const slots = phrase === 3 ? [0, 4, 8] : [0, 4, 8, 12];
    const mel = [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null];
    slots.forEach(function (s, i) { mel[s] = pool[shape[i] % pool.length]; });
    if (phrase === 0 && pool.length > 2) mel[6] = pool[2];
    if (phrase === 2 && pool.length > 1) mel[10] = pool[1];
    if (phrase === 3) mel[0] = tonic;
    return mel;
  }
  function bassLine(root, pocket) {
    let r = root - 12;
    while (r > 50) r -= 12;
    while (r < 36) r += 12;
    let f = r + 7;
    if (f > 57) f -= 12;
    const line = [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null];
    if (pocket === "late") { line[0] = r; line[7] = f; line[10] = r; }
    else if (pocket === "floor") { line[0] = r; line[4] = f; line[8] = r; line[12] = f; }
    else if (pocket === "market") { line[0] = r; line[7] = f; line[10] = r; }
    else { line[0] = r; line[10] = f; }
    return line;
  }
  function compileHuman(spec) {
    const bars = [];
    let prev = null, last = null;
    spec.changes.forEach(function (ch) {
      for (let i = 0; i < ch.bars; i++) {
        const same = !!(last && last.n === ch.n && last.q === ch.q);
        const voices = voiceLead(prev, ch.n, ch.q, same);
        prev = voices; last = ch;
        bars.push({ q: ch.q, root: ch.n, voices: voices, bass: bassLine(ch.n, spec.pocket), mel: melodyOf(ch.n, ch.q, bars.length % 4) });
      }
    });
    return bars;
  }
  function humanPlay(spec, bars) {
    const kicks = KICKV[spec.pocket];
    const half = bars.length / 2;
    return function (api, time, pos, rush, menu) {
      const s = pos % 16, bar = (pos / 16) | 0, info = bars[bar % bars.length];
      const B = (bar % bars.length) >= half;
      const late = kicks[s] || s % 4 === 0 ? 0 : 0.012 + (s % 3) * 0.003;
      const when = time + (menu ? 0 : late);
      const human = 0.9 + ((bar + s) % 4) * 0.035;
      if (kicks[s]) api.kick(when, kicks[s] * human * (menu ? 0.72 : 1) * (rush ? 1.08 : 1), spec.pocket === "floor" ? 50 : 56);
      if (s === 4 || s === 12) api.snare(when, (spec.pocket === "shore" ? 0.1 : 0.16) * (B ? 1.12 : 1) * (menu ? 0.6 : 1));
      if (spec.pocket === "floor") {
        if (s % 4 === 2) api.hat(when, (rush ? 0.05 : 0.032) * human, true);
        if (s % 4 === 0) api.duck(when);
      } else if (spec.pocket === "shore") {
        if (s % 4 === 0) api.hat(when, 0.016 * human, false);
      } else {
        if (s % 2 === 0) api.hat(when, (rush || B ? 0.03 : 0.02) * human, false);
        if ((rush || B) && s % 2 === 1) api.hat(when, 0.012, false);
      }
      if (info.bass[s] != null) api.sine(hz(info.bass[s]), when, spec.pocket === "floor" ? 0.16 : 0.34, (menu ? 0.07 : 0.12) * human);
      const stab = spec.pocket === "floor" || spec.pocket === "market";
      if (s === 0 || (stab && s === 8)) {
        const hold = s === 0 ? (spec.pocket === "floor" ? 0.7 : 1.45) : 0.36;
        info.voices.forEach(function (n, i) {
          const vol = (i ? 0.022 : 0.034) * (s === 8 ? 0.6 : 1) * (menu ? 0.5 : 1) * (B ? 1.12 : 0.86) * human;
          api.sine(hz(n), when, hold, vol);
          if (i < 3) api.tri(hz(n), when, hold * 0.8, vol * 0.4);
        });
        if (s === 0) api.room(hz(info.voices[Math.min(2, info.voices.length - 1)]), when, 1.3, 0.028 * (B ? 1.3 : 1));
      }
      if (!menu && info.mel[s] != null) api.sine(hz(info.mel[s]), when, 0.32, (B ? 0.05 : 0.036) * (s % 4 === 0 ? 1 : 0.7) * (rush ? 1.12 : 1));
    };
  }
  const HUMAN = [
    { id: "v36", num: "39", name: "LATE ROOM", bpm: 82, rush: 90, swing: 0.63, pocket: "late", line: "A late shift in C minor. Cm7, Abmaj7, Fm7, then home.",
      changes: [{ n: 60, q: "m7", bars: 2 }, { n: 56, q: "maj7", bars: 2 }, { n: 53, q: "m7", bars: 2 }, { n: 55, q: "7", bars: 2 }, { n: 60, q: "m7", bars: 2 }, { n: 56, q: "maj7", bars: 2 }, { n: 53, q: "m7", bars: 2 }, { n: 60, q: "m7", bars: 2 }] },
    { id: "v37", num: "40", name: "SOFT FLOOR", bpm: 120, rush: 126, pocket: "floor", line: "Floor kick, soft 7ths. Gm7 to Bbmaj7 and back.",
      changes: [{ n: 55, q: "m7", bars: 2 }, { n: 60, q: "m7", bars: 2 }, { n: 53, q: "9", bars: 2 }, { n: 58, q: "maj7", bars: 2 }, { n: 55, q: "m7", bars: 2 }, { n: 60, q: "m7", bars: 2 }, { n: 53, q: "9", bars: 2 }, { n: 58, q: "maj7", bars: 2 }] },
    { id: "v38", num: "41", name: "SEVEN MARKET", bpm: 102, rush: 110, pocket: "market", line: "Night-market funk. Dm7, Cmaj7, Fmaj7, Am7.",
      changes: [{ n: 50, q: "m7", bars: 2 }, { n: 48, q: "maj7", bars: 2 }, { n: 53, q: "maj7", bars: 2 }, { n: 45, q: "m7", bars: 2 }, { n: 50, q: "m7", bars: 2 }, { n: 48, q: "maj7", bars: 2 }, { n: 45, q: "m7", bars: 2 }, { n: 50, q: "m7", bars: 2 }] },
    { id: "v39", num: "42", name: "TIDE NINE", bpm: 94, rush: 102, pocket: "shore", line: "Shoreline 9ths. Fmaj9 falls through Dm9 and comes home.",
      changes: [{ n: 53, q: "maj9", bars: 2 }, { n: 48, q: "maj7", bars: 2 }, { n: 50, q: "m9", bars: 2 }, { n: 45, q: "m7", bars: 2 }, { n: 53, q: "maj9", bars: 2 }, { n: 50, q: "m9", bars: 2 }, { n: 48, q: "maj7", bars: 2 }, { n: 53, q: "maj9", bars: 2 }] },
    { id: "v40", num: "43", name: "SECOND LAMP", bpm: 86, rush: 94, swing: 0.6, pocket: "late", line: "ii–V–I with a 9th. Gm7, C9, Fmaj9, resolved.",
      changes: [{ n: 55, q: "m7", bars: 2 }, { n: 60, q: "9", bars: 2 }, { n: 53, q: "maj9", bars: 2 }, { n: 50, q: "m7", bars: 2 }, { n: 55, q: "m7", bars: 2 }, { n: 60, q: "9", bars: 2 }, { n: 50, q: "m7", bars: 2 }, { n: 53, q: "maj9", bars: 2 }] },
    { id: "v41", num: "44", name: "DUST POCKET", bpm: 80, rush: 88, swing: 0.64, pocket: "late", line: "Swung Am7 D9 Gm7 Cmaj7. The melody sits on the chord.",
      changes: [{ n: 45, q: "m7", bars: 2 }, { n: 50, q: "9", bars: 2 }, { n: 55, q: "m7", bars: 2 }, { n: 60, q: "maj7", bars: 2 }, { n: 45, q: "m7", bars: 2 }, { n: 50, q: "9", bars: 2 }, { n: 55, q: "m7", bars: 2 }, { n: 60, q: "maj7", bars: 2 }] },
    { id: "v42", num: "45", name: "WARM KICK", bpm: 118, rush: 124, pocket: "floor", line: "A warm floor. Fm7, Bbm7, Eb9, Abmaj7.",
      changes: [{ n: 53, q: "m7", bars: 2 }, { n: 58, q: "m7", bars: 2 }, { n: 51, q: "9", bars: 2 }, { n: 56, q: "maj7", bars: 2 }, { n: 53, q: "m7", bars: 2 }, { n: 58, q: "m7", bars: 2 }, { n: 51, q: "9", bars: 2 }, { n: 56, q: "maj7", bars: 2 }] },
    { id: "v43", num: "46", name: "NINE STREET", bpm: 98, rush: 106, pocket: "shore", line: "Cmaj9, Am7, Dm9, G9. A street that comes back to C.",
      changes: [{ n: 60, q: "maj9", bars: 2 }, { n: 45, q: "m7", bars: 2 }, { n: 50, q: "m9", bars: 2 }, { n: 55, q: "9", bars: 2 }, { n: 60, q: "maj9", bars: 2 }, { n: 45, q: "m7", bars: 2 }, { n: 55, q: "9", bars: 2 }, { n: 60, q: "maj9", bars: 2 }] },
    { id: "v44", num: "47", name: "AFTER SHIFT", bpm: 84, rush: 92, swing: 0.61, pocket: "late", line: "Two ii–V pairs, then it lands on Cmaj7.",
      changes: [{ n: 52, q: "m7", bars: 2 }, { n: 57, q: "7", bars: 2 }, { n: 50, q: "m7", bars: 2 }, { n: 55, q: "7", bars: 2 }, { n: 60, q: "maj7", bars: 2 }, { n: 57, q: "m7", bars: 2 }, { n: 50, q: "m7", bars: 2 }, { n: 60, q: "maj7", bars: 2 }] },
    { id: "v45", num: "48", name: "LOW SEVEN", bpm: 100, rush: 108, pocket: "market", line: "Dm9 to G7 to Cmaj7. The bass answers the kick.",
      changes: [{ n: 50, q: "m9", bars: 2 }, { n: 55, q: "7", bars: 2 }, { n: 48, q: "maj7", bars: 2 }, { n: 45, q: "m7", bars: 2 }, { n: 50, q: "m9", bars: 2 }, { n: 55, q: "7", bars: 2 }, { n: 45, q: "m7", bars: 2 }, { n: 50, q: "m9", bars: 2 }] },
    { id: "v46", num: "49", name: "CLOSING TIME", bpm: 90, rush: 98, swing: 0.56, pocket: "shore", line: "Closing chords. Bbmaj7, Gm7, Cm7, F9, home.",
      changes: [{ n: 58, q: "maj7", bars: 2 }, { n: 55, q: "m7", bars: 2 }, { n: 60, q: "m7", bars: 2 }, { n: 53, q: "9", bars: 2 }, { n: 58, q: "maj7", bars: 2 }, { n: 55, q: "m7", bars: 2 }, { n: 53, q: "9", bars: 2 }, { n: 58, q: "maj7", bars: 2 }] },
    { id: "v47", num: "50", name: "HEART KICK", bpm: 116, rush: 122, pocket: "floor", line: "Am7 Dm7 G9 Cmaj7, locked to a four-on-the-floor kick.",
      changes: [{ n: 45, q: "m7", bars: 2 }, { n: 50, q: "m7", bars: 2 }, { n: 55, q: "9", bars: 2 }, { n: 48, q: "maj7", bars: 2 }, { n: 45, q: "m7", bars: 2 }, { n: 50, q: "m7", bars: 2 }, { n: 55, q: "9", bars: 2 }, { n: 48, q: "maj7", bars: 2 }] },
    { id: "v48", num: "51", name: "VIOLET HOUR", bpm: 78, rush: 86, swing: 0.62, pocket: "late", line: "Fm9 and Abmaj7, a dominant, then the minor home.",
      changes: [{ n: 53, q: "m9", bars: 2 }, { n: 56, q: "maj7", bars: 2 }, { n: 49, q: "maj7", bars: 2 }, { n: 48, q: "7", bars: 2 }, { n: 53, q: "m9", bars: 2 }, { n: 56, q: "maj7", bars: 2 }, { n: 48, q: "7", bars: 2 }, { n: 53, q: "m9", bars: 2 }] },
    { id: "v49", num: "52", name: "OPEN WINDOW", bpm: 96, rush: 104, pocket: "shore", line: "Gmaj7 Em7 Am7 D9. An open window back to G.",
      changes: [{ n: 55, q: "maj7", bars: 2 }, { n: 52, q: "m7", bars: 2 }, { n: 45, q: "m7", bars: 2 }, { n: 50, q: "9", bars: 2 }, { n: 55, q: "maj7", bars: 2 }, { n: 52, q: "m7", bars: 2 }, { n: 50, q: "9", bars: 2 }, { n: 55, q: "maj7", bars: 2 }] },
    { id: "v50", num: "53", name: "NIGHT BUS", bpm: 88, rush: 96, swing: 0.6, pocket: "late", line: "vi–ii–V–I. Cm7 Fm7 Bb7 Ebmaj7, the long way home.",
      changes: [{ n: 60, q: "m7", bars: 2 }, { n: 53, q: "m7", bars: 2 }, { n: 58, q: "7", bars: 2 }, { n: 51, q: "maj7", bars: 2 }, { n: 60, q: "m7", bars: 2 }, { n: 53, q: "m7", bars: 2 }, { n: 58, q: "7", bars: 2 }, { n: 51, q: "maj7", bars: 2 }] },
    { id: "v51", num: "54", name: "FLOOR NINE", bpm: 122, rush: 128, pocket: "floor", line: "Dm7 G9 Cmaj9. The 9ths ride the kick.",
      changes: [{ n: 50, q: "m7", bars: 2 }, { n: 55, q: "9", bars: 2 }, { n: 48, q: "maj9", bars: 2 }, { n: 45, q: "m7", bars: 2 }, { n: 50, q: "m7", bars: 2 }, { n: 55, q: "9", bars: 2 }, { n: 45, q: "m7", bars: 2 }, { n: 48, q: "maj9", bars: 2 }] },
    { id: "v52", num: "55", name: "SEVEN MILE", bpm: 104, rush: 112, swing: 0.57, pocket: "market", line: "Em7 A7 Dm9 G7, and the mile ends on Cmaj7.",
      changes: [{ n: 52, q: "m7", bars: 2 }, { n: 57, q: "7", bars: 2 }, { n: 50, q: "m9", bars: 2 }, { n: 55, q: "7", bars: 2 }, { n: 48, q: "maj7", bars: 2 }, { n: 45, q: "m7", bars: 2 }, { n: 55, q: "7", bars: 2 }, { n: 48, q: "maj7", bars: 2 }] },
    { id: "v53", num: "56", name: "SHORE MAJOR", bpm: 92, rush: 100, pocket: "shore", line: "Cmaj9 Am9 Fmaj7 G9. Major colors, a soft tide.",
      changes: [{ n: 48, q: "maj9", bars: 2 }, { n: 45, q: "m9", bars: 2 }, { n: 53, q: "maj7", bars: 2 }, { n: 55, q: "9", bars: 2 }, { n: 48, q: "maj9", bars: 2 }, { n: 45, q: "m9", bars: 2 }, { n: 55, q: "9", bars: 2 }, { n: 48, q: "maj9", bars: 2 }] },
    { id: "v54", num: "57", name: "LAST CALL", bpm: 76, rush: 84, swing: 0.63, pocket: "late", line: "Last-call ii–V. Am7 D9 Gmaj7, and it stays there.",
      changes: [{ n: 45, q: "m7", bars: 2 }, { n: 50, q: "9", bars: 2 }, { n: 55, q: "maj7", bars: 2 }, { n: 48, q: "maj7", bars: 2 }, { n: 45, q: "m7", bars: 2 }, { n: 50, q: "9", bars: 2 }, { n: 48, q: "maj7", bars: 2 }, { n: 55, q: "maj7", bars: 2 }] },
    { id: "v55", num: "58", name: "HOME KEY", bpm: 98, rush: 106, pocket: "shore", line: "Fmaj7 Dm7 Gm7 C9. Eight bars out, eight bars home.",
      changes: [{ n: 53, q: "maj7", bars: 2 }, { n: 50, q: "m7", bars: 2 }, { n: 55, q: "m7", bars: 2 }, { n: 48, q: "9", bars: 2 }, { n: 53, q: "maj7", bars: 2 }, { n: 50, q: "m7", bars: 2 }, { n: 48, q: "9", bars: 2 }, { n: 53, q: "maj7", bars: 2 }] }
  ];
  const HLP = { late: [2300, 4400], floor: [3200, 7600], market: [2600, 5800], shore: [2400, 5000] };
  HUMAN.forEach(function (spec) {
    const bars = compileHuman(spec);
    const tr = { id: spec.id, tag: spec.num, name: spec.name, audition: true, bpm: spec.bpm, rush: spec.rush, bars: 16, lp: HLP[spec.pocket], line: spec.line, hit: humanPlay(spec, bars), humanBars: bars };
    if (spec.swing) tr.swing = spec.swing;
    tracks.push(tr);
  });

  const byId = {};
  tracks.forEach(function (t) {
    t.loop = Math.round(t.bars * 4 * 60 / t.bpm);
    byId[t.id] = t;
  });
  root.NRLBed = { tracks: tracks, byId: byId, attach: attach };
})(typeof window !== "undefined" ? window : globalThis);
