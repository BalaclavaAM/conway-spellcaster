// Audio system: Web Audio API with oscillators, optional asset loading, lazy context
let ctx = null;
let master = null;
let musicBuffer = null;
let musicSource = null;
let muted = false;
const MASTER_GAIN = 0.25;

const buffers = {
  cast: null,
  step: null,
  die: null,
  win: null,
  alarm: null,
  ui: null,
};

function ensureContext() {
  if (typeof window === 'undefined' || !window.AudioContext && !window.webkitAudioContext) return;
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.setValueAtTime(MASTER_GAIN, ctx.currentTime);
    master.connect(ctx.destination);
    loadAssets();
    music(true);
  }
}

async function loadAssets() {
  if (typeof window === 'undefined') return;
  for (const name of Object.keys(buffers)) {
    try {
      const res = await fetch(`assets/sfx/${name}.wav`);
      if (!res.ok) continue;
      const arrayBuffer = await res.arrayBuffer();
      buffers[name] = await ctx.decodeAudioData(arrayBuffer);
    } catch (e) {
      // Silent fail; use oscillator fallback
    }
  }

  try {
    const res = await fetch('assets/music/loop.ogg');
    if (res.ok) {
      const arrayBuffer = await res.arrayBuffer();
      musicBuffer = await ctx.decodeAudioData(arrayBuffer);
    }
  } catch (e) {
    // Silent fail
  }
}

function playBuffer(buffer, gain = 1) {
  if (!ctx || !master || !buffer) return;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, ctx.currentTime);
  src.connect(g);
  g.connect(master);
  src.start(ctx.currentTime);
}

function note(freq, duration, type = 'sine', gain = 1) {
  if (!ctx || !master) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
  osc.connect(g);
  g.connect(master);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

function whiteNoise(duration, gain = 1) {
  if (!ctx || !master) return;
  const len = ctx.sampleRate * duration;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  playBuffer(buf, gain);
}

export const sfx = {
  cast() {
    if (!ctx || muted) return;
    if (buffers.cast) {
      playBuffer(buffers.cast);
      return;
    }
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    const dur = 0.15; // 150 ms
    osc.frequency.setValueAtTime(220, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + dur);
    g.gain.setValueAtTime(1, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + dur);
  },

  step() {
    if (!ctx || muted) return;
    if (buffers.step) {
      playBuffer(buffers.step);
      return;
    }
    note(200, 0.06, 'triangle', 0.15); // 60 ms
  },

  die() {
    if (!ctx || muted) return;
    if (buffers.die) {
      playBuffer(buffers.die);
      return;
    }
    const dur = 0.4; // 400 ms
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + dur);
    g.gain.setValueAtTime(0.8, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + dur);
    whiteNoise(dur * 0.5, 0.1);
  },

  win() {
    if (!ctx || muted) return;
    if (buffers.win) {
      playBuffer(buffers.win);
      return;
    }
    // C5=262 E5=330 G5=392 C6=523 Hz, 120 ms each = 480 ms total
    const dur = 0.12;
    const freqs = [262, 330, 392, 523];
    freqs.forEach((freq, i) => {
      setTimeout(() => note(freq, dur, 'square', 0.8), i * dur * 1000);
    });
  },

  alarm() {
    if (!ctx || muted) return;
    if (buffers.alarm) {
      playBuffer(buffers.alarm);
      return;
    }
    // 3 cycles of 180 ms = 540 ms total (600/450 Hz alternating)
    const toneDur = 0.09; // 90 ms per tone
    const freqs = [600, 450];
    for (let cycle = 0; cycle < 3; cycle++) {
      for (let i = 0; i < 2; i++) {
        setTimeout(() => note(freqs[i], toneDur, 'square', 0.9), (cycle * 2 + i) * toneDur * 1000);
      }
    }
  },

  ui() {
    if (!ctx || muted) return;
    if (buffers.ui) {
      playBuffer(buffers.ui);
      return;
    }
    note(880, 0.03, 'triangle', 0.5); // 30 ms
  },
};

export function unlock() {
  ensureContext();
}

export function toggleMute() {
  if (!ctx || !master) return muted;
  muted = !muted;
  master.gain.setValueAtTime(muted ? 0 : MASTER_GAIN, ctx.currentTime);
  return muted;
}

export function isMuted() {
  return muted;
}

export function music(on) {
  if (!ctx) return;
  if (on && musicBuffer && !musicSource) {
    musicSource = ctx.createBufferSource();
    musicSource.buffer = musicBuffer;
    musicSource.loop = true;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    musicSource.connect(g);
    g.connect(master);
    musicSource.start(ctx.currentTime);
  } else if (!on && musicSource) {
    musicSource.stop();
    musicSource = null;
  }
}
