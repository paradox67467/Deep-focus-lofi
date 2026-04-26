/**
 * audio.js — Ambient Sound Mixer using Web Audio API
 *
 * Generates all 4 ambient sounds PROGRAMMATICALLY via Web Audio API.
 * No external files required — works offline, zero dependencies.
 *
 * Sounds:
 *   rain       — Brown noise filtered through resonant bandpass
 *   cafe       — Pink noise with low-pass, simulates crowd murmur
 *   fire       — Crackle pattern via amplitude-modulated noise
 *   whitenoise — Pure white noise
 */

const STORAGE_KEY = 'deepfocus-sound-mix';

let audioCtx = null;
let masterGain = null;

// Each sound: { gainNode, sourceNode, active }
const sounds = {
  rain:       { gainNode: null, sourceNode: null, active: false, volume: 0.5 },
  cafe:       { gainNode: null, sourceNode: null, active: false, volume: 0.3 },
  fire:       { gainNode: null, sourceNode: null, active: false, volume: 0.4 },
  whitenoise: { gainNode: null, sourceNode: null, active: false, volume: 0.0 },
};

// ─── Noise Buffer Generator ───────────────────────────────────────────────────

function createNoiseBuffer(ctx, type = 'white') {
  const bufferSize = ctx.sampleRate * 4; // 4-second loop
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  if (type === 'white') {
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  } else if (type === 'brown') {
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = data[i];
      data[i] *= 3.5;
    }
  } else if (type === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
  }

  return buffer;
}

// ─── Sound Builders ───────────────────────────────────────────────────────────

function buildRain(ctx) {
  // Brown noise → bandpass filter (rain frequency range)
  const buffer = createNoiseBuffer(ctx, 'brown');
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 400;
  filter.Q.value = 0.7;

  const filter2 = ctx.createBiquadFilter();
  filter2.type = 'highpass';
  filter2.frequency.value = 200;

  source.connect(filter);
  filter.connect(filter2);
  return { source, output: filter2 };
}

function buildCafe(ctx) {
  // Pink noise → low-pass (warm murmur) with slight chorus
  const buffer = createNoiseBuffer(ctx, 'pink');
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 800;
  filter.Q.value = 0.5;

  source.connect(filter);
  return { source, output: filter };
}

function buildFire(ctx) {
  // Brown noise → low-pass + amplitude modulation for crackle
  const buffer = createNoiseBuffer(ctx, 'brown');
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 200;
  filter.Q.value = 1.5;

  // LFO for crackle amplitude modulation
  const lfo = ctx.createOscillator();
  lfo.type = 'sawtooth';
  lfo.frequency.value = 8;

  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.4;

  const modGain = ctx.createGain();
  modGain.gain.value = 0.7;

  lfo.connect(lfoGain);
  lfoGain.connect(modGain.gain);
  source.connect(filter);
  filter.connect(modGain);
  lfo.start();

  return { source, output: modGain, extra: lfo };
}

function buildWhiteNoise(ctx) {
  const buffer = createNoiseBuffer(ctx, 'white');
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 100;

  source.connect(filter);
  return { source, output: filter };
}

// ─── Builders map ─────────────────────────────────────────────────────────────
const builders = { rain: buildRain, cafe: buildCafe, fire: buildFire, whitenoise: buildWhiteNoise };

// ─── Init ─────────────────────────────────────────────────────────────────────

function initAudio() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 1.0;
  masterGain.connect(audioCtx.destination);

  // Build all sound chains (sources start on demand)
  Object.entries(builders).forEach(([key, builder]) => {
    const { source, output, extra } = builder(audioCtx);
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = 0;
    output.connect(gainNode);
    gainNode.connect(masterGain);
    sounds[key].gainNode = gainNode;
    sounds[key].sourceNode = source;
    if (extra) sounds[key].extra = extra;
  });

  // Start all source nodes (they don't produce sound until gain > 0)
  Object.values(sounds).forEach(s => s.sourceNode.start(0));

  // Load saved mix from localStorage
  loadMix();
}

// ─── Controls ─────────────────────────────────────────────────────────────────

function resumeContext() {
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function setVolume(soundKey, value) {
  resumeContext();
  const sound = sounds[soundKey];
  if (!sound || !sound.gainNode) return;

  const vol = Math.max(0, Math.min(1, parseFloat(value)));
  sound.volume = vol;
  sound.gainNode.gain.setTargetAtTime(vol, audioCtx.currentTime, 0.1);

  // Update active state
  sound.active = vol > 0;

  // Persist
  saveMix();
}

function toggleSound(soundKey) {
  const sound = sounds[soundKey];
  if (!sound) return;

  if (sound.active) {
    // Mute
    setVolume(soundKey, 0);
    sound.volume = 0;
    return false;
  } else {
    // Restore to 0.5 default or last saved volume
    const vol = sound.lastVolume || 0.5;
    setVolume(soundKey, vol);
    sound.lastVolume = vol;
    return true;
  }
}

function getVolume(soundKey) {
  return sounds[soundKey]?.volume ?? 0;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

function saveMix() {
  const mix = {};
  Object.entries(sounds).forEach(([key, s]) => { mix[key] = s.volume; });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mix));
  return mix;
}

function loadMix() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const mix = JSON.parse(raw);
      Object.entries(mix).forEach(([key, vol]) => {
        if (sounds[key]) {
          sounds[key].volume = vol;
          sounds[key].active = vol > 0;
          if (sounds[key].gainNode) {
            sounds[key].gainNode.gain.value = vol;
          }
        }
      });
      return mix;
    } catch { /* ignore */ }
  }
  return null;
}

function getCurrentMix() {
  const mix = {};
  Object.entries(sounds).forEach(([key, s]) => { mix[key] = s.volume; });
  return mix;
}

export {
  initAudio,
  setVolume,
  toggleSound,
  getVolume,
  saveMix,
  getCurrentMix,
  resumeContext,
};
