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
    { id: "B", tag: "B", name: "BLACK VEIL", preview: true, bpm: 70, rush: 82, bars: 12, lp: [2200, 4000],
      line: "Neon-noir pulse. Slow heartbeat and a deep bass." },
    { id: "C", tag: "C", name: "ASCENT", preview: true, bpm: 136, rush: 142, bars: 24, lp: [6400, 12000],
      line: "Uplifting trance. A long build that opens into a drop." },
    { id: "D", tag: "D", name: "SPLIT", preview: true, bpm: 174, rush: 178, bars: 32, lp: [3800, 7200],
      line: "Drum and bass. Fast breakbeat and a moving reese bass." },
    { id: "E", tag: "E", name: "LATE SHIFT", preview: true, bpm: 80, rush: 90, bars: 12, swing: 0.64, lp: [2600, 4200],
      line: "Lo-fi hop. Swung drums, dusty chords, a soft bass." },
    { id: "F", tag: "F", name: "FLOOR", preview: true, bpm: 122, rush: 128, bars: 20, lp: [3400, 9000],
      line: "Funky French house. Pumping kick, chopped chords, a short hook." },
    { id: "J", tag: "", name: "JANGLE", preview: false, bpm: 118, rush: 130, bars: 16, grid: "8", swing: 0.57, lp: [6200, 10800],
      line: "Bright 60s band. Strums, a walking bass, and a short hook." }
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
  function hitB(api, t, pos, rush, menu) {
    const s = pos % 16, bar = (pos / 16) | 0;
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
    if (s === 4 || s === 12) api.snare(t, 0.18);
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
    let root = 55, third = 3;
    if (bar >= 8 && bar < 12) { root = 48; third = 3; }
    else if (bar >= 12 && bar < 16) { root = 51; third = 4; }
    else if (bar >= 16) { root = 50; third = 4; }
    if (s % 4 === 0) { api.kick(t, 0.76, 49); api.duck(t); }
    if (s % 4 === 2) api.hat(t, rush ? 0.065 : 0.046, true);
    if (s === 4 || s === 12) api.snare(t, 0.2);
    if (rush && (s === 6 || s === 14)) api.snare(t, 0.07);
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
  tracks[0].hit = hitA; tracks[1].hit = hitB; tracks[2].hit = hitC; tracks[3].hit = hitD;
  tracks[4].hit = hitE; tracks[5].hit = hitF; tracks[6].hit = hitJ;

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
      }
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
      const bpm = opts.rush ? tr.rush : tr.bpm;
      const per = tr.grid === "8" ? 8 : 16;
      const loop = tr.bars * per;
      const ahead = Math.min(2.5, opts.ahead || 0.16);
      const cap = opts.ahead ? 500 : 8;
      if (next < ctx.currentTime - 0.4) next = ctx.currentTime + 0.04;
      const horizon = ctx.currentTime + ahead;
      let guard = 0;
      const pair = tr.lp || [7200, 11000];
      lp.frequency.setTargetAtTime(opts.rush ? pair[1] : pair[0], ctx.currentTime, 0.25);
      try {
        while (next < horizon && guard++ < cap) {
          const pos = step % loop;
          const down = step % 2 === 0;
          tr.hit(api, next, pos, !!opts.rush, !!opts.menu);
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
      info.id = id; info.step = step; info.rush = !!opts.rush; info.bpm = bpm;
    }
    return {
      tick: tick,
      arm: arm,
      info: info,
      get lastError() { return lastError; }
    };
  }

  const byId = {};
  tracks.forEach(function (t) {
    t.loop = Math.round(t.bars * 4 * 60 / t.bpm);
    byId[t.id] = t;
  });
  root.NRLBed = { tracks: tracks, byId: byId, attach: attach };
})(typeof window !== "undefined" ? window : globalThis);
