/**
 * sessions.js — Session persistence
 *
 * • On localhost  → calls Python FastAPI backend (localhost:8000)
 * • On production → calls Supabase JS directly (no backend needed)
 *
 * Falls back to localStorage guest mode if backend / Supabase is unavailable.
 */

// Auto-detect environment
const IS_LOCAL = window.location.hostname === 'localhost' ||
                 window.location.hostname === '127.0.0.1';
const API_BASE  = 'http://localhost:8000';
const GUEST_KEY = 'deepfocus-guest-sessions';

// ─── Supabase direct helper (production only) ─────────────────────────────────
// Reads the already-initialised supabase client from window (set by supabase-client.js)
function getSupabaseClient() {
  return window._supabaseClient || null;
}

async function saveSessionDirect({ userId, label, durationMin }) {
  const sb = getSupabaseClient();
  if (!sb) throw new Error('Supabase client not ready');
  const { data, error } = await sb.from('sessions').insert([{
    user_id:      userId,
    label:        label || null,
    duration_min: durationMin,
    session_type: 'focus',
    completed_at: new Date().toISOString(),
  }]).select().single();
  if (error) throw error;
  return data;
}

async function fetchSessionsDirect(userId) {
  const sb = getSupabaseClient();
  if (!sb) throw new Error('Supabase client not ready');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const { data, error } = await sb
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .gte('completed_at', today.toISOString())
    .order('completed_at', { ascending: false });
  if (error) throw error;
  return data || [];
}


// In-memory/localStorage fallback for guest mode
let guestSessions = loadGuestSessions();

// ─── Save Session ─────────────────────────────────────────────────────────────

/**
 * Save a completed Pomodoro session.
 * @param {Object} opts
 * @param {string|null} opts.userId    - Supabase user ID (null = guest)
 * @param {string}      opts.label     - Task label (can be empty)
 * @param {number}      opts.durationMin - Duration in minutes
 */
async function saveSession({ userId, label, durationMin }) {
  const sessionData = {
    label: label || null,
    duration_min: durationMin,
    session_type: 'focus',
    completed_at: new Date().toISOString(),
  };

  if (!userId) {
    // Guest mode: save to localStorage
    guestSessions.push({ ...sessionData, id: crypto.randomUUID() });
    persistGuestSessions();
    updateHistoryPanel(guestSessions);
    return { success: true, source: 'guest' };
  }

  // ── Production: call Supabase directly ──
  if (!IS_LOCAL) {
    try {
      await saveSessionDirect({ userId, label, durationMin });
      const sessions = await fetchSessionsDirect(userId);
      const total = sessions.reduce((a, s) => a + (s.duration_min || 25), 0);
      updateHistoryPanel(sessions, sessions.length, total);
      return { success: true, source: 'supabase-direct' };
    } catch (err) {
      console.warn('Supabase direct save failed, using guest mode:', err.message);
      guestSessions.push({ ...sessionData, id: crypto.randomUUID() });
      persistGuestSessions();
      updateHistoryPanel(guestSessions);
      return { success: true, source: 'guest_fallback' };
    }
  }

  // ── Local dev: call Python FastAPI backend ──
  try {
    const res = await fetch(`${API_BASE}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, ...sessionData }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    await fetchAndUpdateHistory(userId);
    return { success: true, source: 'backend', data };
  } catch (err) {
    console.warn('Backend unavailable, saving to guest mode:', err.message);
    guestSessions.push({ ...sessionData, id: crypto.randomUUID() });
    persistGuestSessions();
    updateHistoryPanel(guestSessions);
    return { success: true, source: 'guest_fallback' };
  }
}

// ─── Fetch Sessions ───────────────────────────────────────────────────────────

/**
 * Fetch today's sessions from backend and update the UI panel.
 */
async function fetchAndUpdateHistory(userId) {
  if (!userId) {
    updateHistoryPanel(getTodayGuestSessions());
    return;
  }

  // ── Production: Supabase direct ──
  if (!IS_LOCAL) {
    try {
      const sessions = await fetchSessionsDirect(userId);
      const total = sessions.reduce((a, s) => a + (s.duration_min || 25), 0);
      updateHistoryPanel(sessions, sessions.length, total);
    } catch (err) {
      console.warn('Failed to fetch sessions from Supabase:', err.message);
      updateHistoryPanel(getTodayGuestSessions());
    }
    return;
  }

  // ── Local dev: Python backend ──
  try {
    const res = await fetch(`${API_BASE}/api/sessions?user_id=${encodeURIComponent(userId)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { sessions, count, total_minutes } = await res.json();
    updateHistoryPanel(sessions, count, total_minutes);
  } catch (err) {
    console.warn('Failed to fetch sessions from backend:', err.message);
    updateHistoryPanel(getTodayGuestSessions());
  }
}

// ─── History Panel UI ─────────────────────────────────────────────────────────

function updateHistoryPanel(sessions, count, totalMin) {
  const todaySessions = sessions || [];
  const sessionCount  = count  ?? todaySessions.length;
  const totalMinutes  = totalMin ?? todaySessions.reduce((a, s) => a + (s.duration_min || 25), 0);

  // Stats
  const countEl = document.getElementById('stat-session-count');
  const minEl   = document.getElementById('stat-total-minutes');
  if (countEl) countEl.textContent = sessionCount;
  if (minEl)   minEl.textContent   = totalMinutes;

  // List
  const listEl = document.getElementById('session-list');
  if (!listEl) return;

  if (todaySessions.length === 0) {
    listEl.innerHTML = `
      <div class="no-sessions fade-in">
        <div class="no-sessions-icon">🎯</div>
        <div>No sessions yet today.<br>Start your first Pomodoro!</div>
      </div>`;
    return;
  }

  listEl.innerHTML = todaySessions.map((s, i) => {
    const time = formatTime(s.completed_at);
    const label = s.label || 'Focus session';
    return `
      <div class="session-item slide-up" style="animation-delay: ${i * 0.05}s">
        <div class="session-icon">🍅</div>
        <div class="session-info">
          <div class="session-title" title="${escapeHtml(label)}">${escapeHtml(label)}</div>
          <div class="session-time">${time}</div>
        </div>
        <div class="session-dur">${s.duration_min}m</div>
      </div>`;
  }).join('');
}

// ─── Settings ─────────────────────────────────────────────────────────────────

async function fetchSettings(userId) {
  if (!userId) return null;

  try {
    const res = await fetch(`${API_BASE}/api/settings/${encodeURIComponent(userId)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('Failed to fetch settings:', err.message);
    return null;
  }
}

async function saveSettings(userId, settings) {
  if (!userId) return;

  try {
    await fetch(`${API_BASE}/api/settings/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
  } catch (err) {
    console.warn('Failed to save settings:', err.message);
  }
}

// ─── Guest Storage ────────────────────────────────────────────────────────────

function loadGuestSessions() {
  try {
    return JSON.parse(localStorage.getItem(GUEST_KEY) || '[]');
  } catch { return []; }
}

function persistGuestSessions() {
  localStorage.setItem(GUEST_KEY, JSON.stringify(guestSessions));
}

function getTodayGuestSessions() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return guestSessions.filter(s => {
    const d = new Date(s.completed_at);
    return d >= todayStart;
  });
}

function clearGuestSessions() {
  guestSessions = [];
  persistGuestSessions();
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export {
  saveSession,
  fetchAndUpdateHistory,
  updateHistoryPanel,
  fetchSettings,
  saveSettings,
  getTodayGuestSessions,
};
