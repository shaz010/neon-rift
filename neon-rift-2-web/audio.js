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

  return {
    unlock() { ensure(); },
    setMuted(next) {
      muted = !!next;
      if (master) master.gain.value = muted ? 0 : 0.9;
    },
    get muted() { return muted; },
    play(name) {
      if (name === 'pulse') {
        tone(540, 110, 0.09, 0.22, 'sine');
        burst(0.045, 1600, 0.7, 0.28, 'bandpass');
      } else if (name === 'torpedo') {
        tone(96, 42, 0.22, 0.4, 'sine');
        burst(0.16, 240, 0.6, 0.35, 'lowpass');
      } else if (name === 'impact') {
        tone(86, 34, 0.16, 0.55, 'sine');
        burst(0.12, 180, 0.5, 0.4, 'lowpass');
      } else if (name === 'blast') {
        tone(62, 26, 0.42, 0.75, 'sine');
        tone(44, 22, 0.5, 0.45, 'sine');
        burst(0.38, 520, 0.4, 0.5, 'lowpass');
      } else if (name === 'hurt') {
        tone(70, 28, 0.28, 0.6, 'sine');
        burst(0.2, 140, 0.4, 0.45, 'lowpass');
      } else if (name === 'bolt') {
        tone(220, 90, 0.12, 0.3, 'triangle');
        tone(480, 180, 0.08, 0.12, 'sine');
        burst(0.06, 900, 1, 0.2, 'bandpass');
      } else if (name === 'dash') {
        burst(0.09, 700, 0.6, 0.22, 'bandpass');
        tone(180, 70, 0.1, 0.18, 'sine');
      } else if (name === 'graze') {
        tone(880, 1320, 0.06, 0.08, 'sine');
      } else if (name === 'card' || name === 'start') {
        tone(420, 640, 0.08, 0.1, 'sine');
      } else if (name === 'win') {
        tone(180, 90, 0.3, 0.3, 'sine');
        tone(360, 180, 0.34, 0.16, 'sine');
      } else if (name === 'die') {
        tone(90, 30, 0.45, 0.5, 'sine');
        burst(0.35, 120, 0.3, 0.4, 'lowpass');
      } else if (name === 'boss') {
        tone(70, 40, 0.35, 0.35, 'sine');
        burst(0.25, 200, 0.4, 0.3, 'lowpass');
      }
    },
  };
}

export function vibrate(name) {
  const map = {
    pulse: 8,
    torpedo: 16,
    impact: 14,
    blast: [28, 24, 56],
    hurt: [36, 30, 70],
    bolt: 22,
    dash: 12,
    graze: 8,
    boss: 20,
    win: [20, 30, 40],
    die: [50, 40, 80],
  };
  const pattern = map[name];
  if (pattern == null) return;
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}
