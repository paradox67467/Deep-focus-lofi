/**
 * timer.js — Pomodoro Timer
 *
 * Uses Date.now() diff-based countdown to prevent background-tab drift.
 * Fires custom DOM events for anime background and focus mode triggers.
 *
 * Events dispatched on window:
 *   timer:started  — Focus session started
 *   timer:paused   — Timer paused
 *   timer:resumed  — Timer resumed from pause
 *   timer:stopped  — Timer reset/idle
 *   timer:complete — A Pomodoro cycle (focus OR break) completed
 *   timer:focusDone — Focus segment done, break starting
 *   timer:breakDone — Break done, next focus starting
 *   timer:tick     — Every second, detail: { remaining, total, mode }
 */

const STORAGE_KEY_DURATIONS = 'deepfocus-durations';

// ─── State ────────────────────────────────────────────────────────────────────
let state = {
  mode:          'idle',    // 'idle' | 'focus' | 'break'
  focusDuration: 25 * 60,  // seconds
  breakDuration: 5  * 60,  // seconds
  remaining:     25 * 60,  // seconds
  total:         25 * 60,
  cyclesCompleted: 0,
  startTime:     null,     // Date.now() when last started/resumed
  pausedAt:      null,     // remaining seconds when paused
  raf:           null,     // requestAnimationFrame id
};

// ─── Init ─────────────────────────────────────────────────────────────────────

function initTimer(focusMin = 25, breakMin = 5) {
  // Load persisted durations
  const saved = loadDurations();
  state.focusDuration = (saved?.focus || focusMin) * 60;
  state.breakDuration = (saved?.breakDur || breakMin) * 60;
  state.remaining     = state.focusDuration;
  state.total         = state.focusDuration;
  state.mode          = 'idle';

  updateDisplay();
  updateProgress(0);
  renderCycles();
}

// ─── Controls ─────────────────────────────────────────────────────────────────

function startTimer() {
  if (state.mode === 'idle') {
    // Fresh start
    state.remaining = state.focusDuration;
    state.total     = state.focusDuration;
    state.mode      = 'focus';
    state.startTime = Date.now();
    state.pausedAt  = null;
    dispatch('timer:started', { mode: 'focus' });
  } else if (state.pausedAt !== null) {
    // Resume from pause
    state.startTime = Date.now() - (state.total - state.pausedAt) * 1000;
    state.pausedAt  = null;
    dispatch('timer:resumed', { mode: state.mode });
  } else {
    return; // Already running
  }

  document.body.classList.add('focus-active');
  tick();
  updateMainBtn('pause');
}

function pauseTimer() {
  if (state.mode === 'idle' || state.pausedAt !== null) return;
  state.pausedAt = state.remaining;
  if (state.raf) { cancelAnimationFrame(state.raf); state.raf = null; }
  dispatch('timer:paused', { remaining: state.remaining });
  updateMainBtn('play');
}

function resetTimer() {
  if (state.raf) { cancelAnimationFrame(state.raf); state.raf = null; }
  state.mode      = 'idle';
  state.remaining = state.focusDuration;
  state.total     = state.focusDuration;
  state.pausedAt  = null;
  state.startTime = null;

  document.body.classList.remove('focus-active');
  dispatch('timer:stopped', {});
  updateDisplay();
  updateProgress(0);
  updateMainBtn('play');
  updateModeLabel('idle');
}

function toggleTimer() {
  if (state.mode === 'idle' || state.pausedAt !== null) {
    startTimer();
  } else {
    pauseTimer();
  }
}

// ─── Tick Loop ────────────────────────────────────────────────────────────────

function tick() {
  const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
  state.remaining = Math.max(0, state.total - elapsed);

  updateDisplay();
  updateProgress(state.remaining / state.total);
  dispatch('timer:tick', { remaining: state.remaining, total: state.total, mode: state.mode });

  if (state.remaining <= 0) {
    onSegmentComplete();
    return;
  }

  state.raf = requestAnimationFrame(tick);
}

// ─── Segment Complete ─────────────────────────────────────────────────────────

function onSegmentComplete() {
  if (state.raf) { cancelAnimationFrame(state.raf); state.raf = null; }
  playChime();

  if (state.mode === 'focus') {
    state.cyclesCompleted++;
    renderCycles();
    dispatch('timer:focusDone', { cycles: state.cyclesCompleted });

    // Transition to break
    state.mode      = 'break';
    state.total     = state.breakDuration;
    state.remaining = state.breakDuration;
    state.startTime = Date.now();
    state.pausedAt  = null;

    updateModeLabel('break');
    updateProgress(1);
    document.body.classList.remove('focus-active');
    dispatch('timer:started', { mode: 'break' });

    // Auto-start break
    state.raf = requestAnimationFrame(tick);

  } else if (state.mode === 'break') {
    dispatch('timer:breakDone', { cycles: state.cyclesCompleted });

    // Transition back to focus
    state.mode      = 'focus';
    state.total     = state.focusDuration;
    state.remaining = state.focusDuration;
    state.startTime = Date.now();
    state.pausedAt  = null;

    updateModeLabel('focus');
    document.body.classList.add('focus-active');
    dispatch('timer:started', { mode: 'focus' });

    state.raf = requestAnimationFrame(tick);
  }
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function setDurations(focusMin, breakMin) {
  state.focusDuration = Math.max(1, parseInt(focusMin, 10)) * 60;
  state.breakDuration = Math.max(1, parseInt(breakMin, 10)) * 60;
  saveDurations(focusMin, breakMin);

  // Only apply immediately if idle
  if (state.mode === 'idle') {
    state.remaining = state.focusDuration;
    state.total     = state.focusDuration;
    updateDisplay();
    updateProgress(0);
  }
}

function getDurations() {
  return {
    focus: state.focusDuration / 60,
    breakDur: state.breakDuration / 60,
  };
}

function getCyclesCompleted() { return state.cyclesCompleted; }
function getMode() { return state.mode; }
function isPaused() { return state.pausedAt !== null; }

// ─── Chime ────────────────────────────────────────────────────────────────────

function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 — major chord
    notes.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.15);
      gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + i * 0.15 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 1.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 1.3);
    });
  } catch { /* Chime failed silently */ }
}

// ─── UI Updates ───────────────────────────────────────────────────────────────

function updateDisplay() {
  const el = document.getElementById('timer-display');
  if (!el) return;

  const m = Math.floor(state.remaining / 60);
  const s = state.remaining % 60;
  const formatted = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  if (el.textContent !== formatted) {
    el.classList.add('flip');
    el.textContent = formatted;
    setTimeout(() => el.classList.remove('flip'), 250);
  }
}

function updateProgress(ratio) {
  const el = document.getElementById('timer-progress');
  if (!el) return;
  const circumference = 2 * Math.PI * 100; // r=100 in SVG
  const offset = circumference * (1 - ratio);
  el.style.strokeDashoffset = offset;

  if (state.mode === 'break') {
    el.classList.add('break-mode');
  } else {
    el.classList.remove('break-mode');
  }

  if (state.mode !== 'idle' && state.pausedAt === null) {
    el.classList.add('pulsing');
  } else {
    el.classList.remove('pulsing');
  }
}

function updateMainBtn(icon) {
  const btn = document.getElementById('timer-toggle');
  if (btn) btn.textContent = icon === 'pause' ? '⏸' : '▶';
}

function updateModeLabel(mode) {
  const el = document.getElementById('timer-mode-label');
  if (!el) return;
  const labels = { focus: 'Focus', break: 'Break', idle: 'Ready' };
  el.textContent = labels[mode] || 'Ready';
}

function renderCycles() {
  const wrap = document.getElementById('cycle-badges');
  if (!wrap) return;
  const count = Math.min(state.cyclesCompleted, 8);
  const total = 4;
  const full  = Math.floor(count / total);
  const mod   = count % total;

  wrap.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const dot = document.createElement('div');
    dot.className = 'cycle-dot' + (i < mod || full > 0 ? ' done' : '');
    if (i === mod - 1 && full === 0) dot.classList.add('pop');
    wrap.appendChild(dot);
  }

  const label = document.createElement('span');
  label.className = 'cycle-label';
  label.textContent = `${state.cyclesCompleted} session${state.cyclesCompleted !== 1 ? 's' : ''}`;
  wrap.appendChild(label);
}

// ─── Persistence ──────────────────────────────────────────────────────────────

function saveDurations(focusMin, breakMin) {
  localStorage.setItem(STORAGE_KEY_DURATIONS, JSON.stringify({ focus: focusMin, breakDur: breakMin }));
}

function loadDurations() {
  const raw = localStorage.getItem(STORAGE_KEY_DURATIONS);
  if (!raw) return null;
  try { return JSON.parse(raw); }
  catch { return null; }
}

// ─── Util ─────────────────────────────────────────────────────────────────────

function dispatch(event, detail) {
  window.dispatchEvent(new CustomEvent(event, { detail }));
}

export {
  initTimer,
  startTimer,
  pauseTimer,
  resetTimer,
  toggleTimer,
  setDurations,
  getDurations,
  getCyclesCompleted,
  getMode,
  isPaused,
};
