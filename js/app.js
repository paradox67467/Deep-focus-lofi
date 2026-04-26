/**
 * app.js — Deep-Focus LoFi Dashboard
 * Main application orchestrator. Wires all modules together.
 *
 * Module load order (all via ES module imports in index.html):
 *   darkmode.js → supabase-client.js → audio.js → youtube.js
 *   → timer.js → sessions.js → app.js
 */

import { initDarkMode } from './darkmode.js';
import { initSupabase, signInWithMagicLink, signOut, getCurrentUser, onAuthStateChange } from './supabase-client.js';
import { initYouTube, createPlayer, setYTVolume } from './youtube.js';
import { initTimer, toggleTimer, resetTimer, setDurations, getDurations } from './timer.js';
import { saveSession, fetchAndUpdateHistory, updateHistoryPanel, getTodayGuestSessions } from './sessions.js';

// ─── App State ────────────────────────────────────────────────────────────────
let currentUser = null;
let animeIndex  = 0;
let animeInterval = null;

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function init() {
  // 1. Dark mode (before render)
  initDarkMode();

  // 2. Supabase auth
  initSupabase();

  // 3. Check existing auth session
  currentUser = await getCurrentUser();
  updateAuthUI(currentUser);

  // 4. Listen for auth changes (magic link redirect)
  onAuthStateChange(async (event, session) => {
    currentUser = session?.user ?? null;
    updateAuthUI(currentUser);

    if (currentUser) {
      showToast('✨ Welcome back!', 'success');
      await fetchAndUpdateHistory(currentUser.id);
    }
  });

  // 5. Load today's sessions
  if (currentUser) {
    await fetchAndUpdateHistory(currentUser.id);
  } else {
    updateHistoryPanel(getTodayGuestSessions());
  }

  // 6. Timer init
  initTimer();

  // 7. YouTube API
  initYouTube();

  // 8. Wire UI events
  wireTimerControls();
  wireYouTubeControls();
  wireSettingsModal();
  wireAnimeBackgrounds();
  wireHeaderEvents();

  // 9. Timer event listeners
  wireTimerEvents();

  console.log('🎧 Deep-Focus LoFi Dashboard ready.');
}

// ─── First Interaction ───────────────────────────────────────────────────────
// (kept for audio context resume on YouTube)
function handleFirstInteraction() {}


// ─── Timer Controls ───────────────────────────────────────────────────────────

function wireTimerControls() {
  document.getElementById('timer-toggle')?.addEventListener('click', () => {
    toggleTimer();
  });

  document.getElementById('timer-reset')?.addEventListener('click', () => {
    resetTimer();
  });

  document.getElementById('timer-settings-btn')?.addEventListener('click', () => {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.classList.add('open');
    const dur = getDurations();
    const focusInput = document.getElementById('modal-focus-dur');
    const breakInput = document.getElementById('modal-break-dur');
    if (focusInput) focusInput.value = dur.focus;
    if (breakInput) breakInput.value = dur.breakDur;
  });

  // Inline duration chip event from index.html
  window.addEventListener('timer:setDurations', (e) => {
    const { focus, breakDur } = e.detail;
    setDurations(focus, breakDur);
  });
}

// ─── Timer Events → Anime Backgrounds ────────────────────────────────────────

function wireTimerEvents() {
  window.addEventListener('timer:started', (e) => {
    if (e.detail.mode === 'focus') {
      startAnimeBackground();
    } else {
      stopAnimeBackground();
    }
  });

  window.addEventListener('timer:paused', () => {
    stopAnimeBackground();
  });

  window.addEventListener('timer:resumed', (e) => {
    if (e.detail.mode === 'focus') startAnimeBackground();
  });

  window.addEventListener('timer:stopped', () => {
    stopAnimeBackground();
  });

  window.addEventListener('timer:focusDone', async (e) => {
    const label = document.getElementById('task-label')?.value || '';
    const dur   = getDurations();
    showToast('🍅 Focus session complete! Take a break.', 'success');
    fireConfetti();

    await saveSession({
      userId:      currentUser?.id || null,
      label:       label,
      durationMin: dur.focus,
    });
  });
}

// ─── Anime Backgrounds ────────────────────────────────────────────────────────

function wireAnimeBackgrounds() {
  // Kick bg-1 into idle state immediately on load — always visible
  const bg1 = document.querySelector('.anime-bg.bg-1');
  if (bg1) {
    // CSS already sets opacity: 0.35 for .anime-bg by default
    // Nothing extra needed — bg2 starts hidden
  }
}

function startAnimeBackground() {
  const bg1 = document.querySelector('.anime-bg.bg-1');
  const bg2 = document.querySelector('.anime-bg.bg-2');
  const vig  = document.getElementById('vignette');

  if (!bg1 || !bg2) return;

  // Focus mode: full vivid bg-1, hide bg-2
  bg1.classList.add('active');
  bg1.classList.remove('idle-only');
  bg2.classList.remove('active');
  vig?.classList.add('active');

  // Cycle between bg1 and bg2 every 30s
  animeIndex = 0;
  clearInterval(animeInterval);
  animeInterval = setInterval(() => {
    animeIndex = (animeIndex + 1) % 2;
    bg1.classList.toggle('active', animeIndex === 0);
    bg2.classList.toggle('active', animeIndex === 1);
  }, 30000);
}

function stopAnimeBackground() {
  clearInterval(animeInterval);
  const bg1 = document.querySelector('.anime-bg.bg-1');
  const bg2 = document.querySelector('.anime-bg.bg-2');

  // Return to idle: keep bg-1 showing at low opacity, hide bg-2
  bg1?.classList.remove('active');
  bg2?.classList.remove('active');
  document.getElementById('vignette')?.classList.remove('active');
}

// ─── Sound Mixer — REMOVED ───────────────────────────────────────────────────
// Ambient mixer has been removed from the UI.
// The audio.js module is kept but not initialised.


// ─── YouTube Controls ─────────────────────────────────────────────────────────

function wireYouTubeControls() {
  // Overlay click — loads the player with native YT controls
  document.getElementById('yt-overlay')?.addEventListener('click', () => {
    createPlayer();
  });
  // Keyboard: Enter/Space also triggers load
  document.getElementById('yt-overlay')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') createPlayer();
  });
}

// ─── Settings Modal ───────────────────────────────────────────────────────────

function wireSettingsModal() {
  const modal   = document.getElementById('settings-modal');
  const closeBtn = document.getElementById('settings-close');
  const saveBtn  = document.getElementById('settings-save');

  closeBtn?.addEventListener('click', () => modal?.classList.remove('open'));
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('open');
  });

  saveBtn?.addEventListener('click', () => {
    const focus = parseInt(document.getElementById('modal-focus-dur')?.value || 25, 10);
    const brk   = parseInt(document.getElementById('modal-break-dur')?.value || 5, 10);
    setDurations(focus, brk);
    showToast('⚙️ Timer settings saved!', 'info');
    modal?.classList.remove('open');
  });
}

// ─── Header Auth Events ───────────────────────────────────────────────────────

function wireHeaderEvents() {
  document.getElementById('login-btn')?.addEventListener('click', () => {
    window.location.href = 'login.html';
  });

  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await signOut();
    currentUser = null;
    updateAuthUI(null);
    showToast('👋 Signed out.', 'info');
  });
}

// ─── Auth UI ──────────────────────────────────────────────────────────────────

function updateAuthUI(user) {
  const loginBtn  = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const userBadge = document.getElementById('user-badge');
  const guestNote = document.getElementById('guest-note');

  if (user) {
    const email = user.email || 'User';
    const initial = email[0].toUpperCase();
    if (loginBtn)  loginBtn.style.display  = 'none';
    if (logoutBtn) logoutBtn.style.display = '';
    if (userBadge) {
      userBadge.style.display = 'flex';
      userBadge.querySelector('.user-avatar').textContent = initial;
      userBadge.querySelector('.user-email').textContent  = email.split('@')[0];
    }
    if (guestNote) guestNote.style.display = 'none';
  } else {
    if (loginBtn)  loginBtn.style.display  = '';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (userBadge) userBadge.style.display = 'none';
    if (guestNote) guestNote.style.display = '';
  }
}

// ─── Toast Notifications ──────────────────────────────────────────────────────

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icon = { success: '✅', error: '❌', info: 'ℹ️' }[type] || 'ℹ️';
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;

  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 350);
  }, 3500);
}

// ─── Confetti Burst ───────────────────────────────────────────────────────────

function fireConfetti() {
  const colors = ['#7c6fe0', '#4f9eff', '#f6ad55', '#68d391', '#f56565', '#3dd6b5'];
  const origin = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

  for (let i = 0; i < 32; i++) {
    const dot = document.createElement('div');
    dot.className = 'confetti-dot';
    const angle = (i / 32) * Math.PI * 2;
    const dist  = 80 + Math.random() * 160;
    dot.style.cssText = `
      left: ${origin.x}px; top: ${origin.y}px;
      background: ${colors[i % colors.length]};
      --dx: ${(Math.cos(angle) * dist).toFixed(0)}px;
      --dy: ${(Math.sin(angle) * dist).toFixed(0)}px;
      --rot: ${Math.round(Math.random() * 360)}deg;
    `;
    document.body.appendChild(dot);
    setTimeout(() => dot.remove(), 800);
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', init);

// Expose showToast globally for use in other modules
window.showToast = showToast;
