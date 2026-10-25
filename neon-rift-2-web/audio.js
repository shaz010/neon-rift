/** One-shot sci-fi impacts. No looping engine, no drone while you move. */

export function createAudio() {
  let ctx = null;
  let master = null;
  let noise = null;
  let muted = false;

  function ensure() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.knee.value = 6;
      comp.ratio.value = 2.4;
      comp.attack.value = 0.002;
      comp.release.value = 0.18;
      master.connect(comp);
      comp.connect(ctx.destination);
      const seconds = 1;
      const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      noise = buffer;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function burst(duration, freq, q, gain, type) {
    const c = ensure();
    if (!c || muted || !noise) return;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noise;
    const filter = c.createBiquadFilter();
    filter.type = type || 'lowpass';
    filter.frequency.setValueAtTime(Math.max(40, freq), t);
    filter.Q.value = q;
    const amp = c.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter);
    filter.connect(amp);
    amp.connect(master);
    src.start(t);
    src.stop(t + duration + 0.02);
  }

  function tone(from, to, duration, gain, type) {
    const c = ensure();
    if (!c || muted) return;
    const t = c.currentTime;
    const osc = c.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(Math.max(28, from), t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(24, to), t + duration);
    const amp = c.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(amp);
    amp.connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  function bass(freq, duration, gain) {
    tone(freq, Math.max(28, freq * 0.42), duration, gain, 'sine');
    tone(Math.max(24, freq * 0.5), Math.max(22, freq * 0.2), duration * 1.35, gain * 0.9, 'sine');
    burst(duration * 0.85, Math.max(48, freq * 0.7), 0.45, gain * 0.55, 'lowpass');
  }

  return {
    unlock() { ensure(); },
    setMuted(next) {
      muted = !!next;
      if (master) master.gain.value = muted ? 0 : 0.9;
    },
    get muted() { return muted; },
    play(name) {
      if (name === 'pulse') {
        bass(78, 0.11, 0.42);
        tone(640, 150, 0.08, 0.16, 'sine');
        burst(0.05, 1900, 0.7, 0.22, 'bandpass');
      } else if (name === 'spread') {
        bass(64, 0.12, 0.4);
        tone(520, 180, 0.1, 0.16, 'triangle');
        tone(880, 240, 0.08, 0.1, 'sine');
      } else if (name === 'arc') {
        bass(90, 0.14, 0.38);
        tone(240, 860, 0.12, 0.14, 'sawtooth');
        burst(0.08, 1400, 1.2, 0.2, 'bandpass');
      } else if (name === 'rail') {
        bass(48, 0.28, 0.7);
        tone(180, 40, 0.22, 0.28, 'sine');
        burst(0.16, 900, 0.5, 0.32, 'bandpass');
      } else if (name === 'mine') {
        bass(55, 0.16, 0.36);
        tone(140, 70, 0.12, 0.14, 'triangle');
      } else if (name === 'charge') {
        tone(90, 140, 0.08, 0.08, 'sine');
      } else if (name === 'torpedo') {
        bass(42, 0.34, 0.72);
        tone(70, 32, 0.28, 0.4, 'sine');
        burst(0.22, 160, 0.4, 0.4, 'lowpass');
      } else if (name === 'impact') {
        bass(54, 0.2, 0.62);
        burst(0.14, 140, 0.45, 0.42, 'lowpass');
      } else if (name === 'blast') {
        bass(40, 0.42, 0.8);
        tone(90, 28, 0.36, 0.34, 'sine');
        burst(0.32, 220, 0.35, 0.48, 'lowpass');
      } else if (name === 'shock') {
        bass(32, 0.62, 0.95);
        tone(48, 22, 0.55, 0.55, 'sine');
        tone(96, 30, 0.4, 0.28, 'triangle');
        burst(0.5, 180, 0.3, 0.55, 'lowpass');
      } else if (name === 'hurt') {
        bass(46, 0.32, 0.7);
        burst(0.22, 110, 0.35, 0.4, 'lowpass');
      } else if (name === 'bolt' || name === 'shield') {
        bass(72, 0.16, 0.4);
        tone(260, 110, 0.12, 0.22, 'triangle');
        tone(620, 220, 0.08, 0.1, 'sine');
      } else if (name === 'spike') {
        bass(60, 0.14, 0.45);
        tone(900, 180, 0.1, 0.16, 'square');
      } else if (name === 'dash') {
        bass(58, 0.18, 0.5);
        tone(220, 70, 0.14, 0.2, 'sine');
        burst(0.1, 500, 0.5, 0.22, 'bandpass');
      } else if (name === 'streak') {
        bass(50, 0.24, 0.62);
        tone(160, 50, 0.2, 0.24, 'sine');
        tone(480, 140, 0.12, 0.1, 'triangle');
      } else if (name === 'brake') {
        bass(44, 0.2, 0.55);
        burst(0.16, 200, 0.6, 0.3, 'lowpass');
      } else if (name === 'dodge') {
        bass(52, 0.16, 0.58);
        tone(300, 90, 0.12, 0.2, 'sine');
        burst(0.08, 1200, 0.7, 0.18, 'bandpass');
      } else if (name === 'switch') {
        tone(420, 680, 0.07, 0.1, 'sine');
        bass(80, 0.08, 0.2);
      } else if (name === 'graze') {
        tone(880, 1320, 0.06, 0.08, 'sine');
      } else if (name === 'card' || name === 'start') {
        tone(420, 640, 0.08, 0.12, 'sine');
        bass(90, 0.1, 0.22);
      } else if (name === 'win') {
        bass(70, 0.4, 0.45);
        tone(180, 90, 0.3, 0.28, 'sine');
        tone(360, 180, 0.34, 0.14, 'sine');
      } else if (name === 'die') {
        bass(36, 0.55, 0.75);
        tone(90, 24, 0.5, 0.4, 'sine');
        burst(0.4, 100, 0.3, 0.4, 'lowpass');
      } else if (name === 'boss') {
        bass(34, 0.45, 0.7);
        tone(70, 36, 0.35, 0.3, 'sine');
        burst(0.28, 160, 0.35, 0.32, 'lowpass');
      }
    },
  };
}

export function vibrate(name) {
  const map = {
    pulse: 10,
    spread: 12,
    arc: 14,
    rail: [18, 20, 28],
    mine: 12,
    torpedo: [24, 16, 36],
    impact: [16, 12, 22],
    blast: [32, 20, 64],
    shock: [40, 24, 36, 70],
    hurt: [40, 28, 80],
    bolt: 24,
    shield: 18,
    spike: 20,
    dash: [14, 10, 18],
    streak: [20, 12, 28],
    brake: [22, 16, 30],
    dodge: [18, 12, 26],
    boss: [24, 16, 32],
    win: [20, 30, 40],
    die: [56, 40, 90],
  };
  const pattern = map[name];
  if (pattern == null) return;
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}
