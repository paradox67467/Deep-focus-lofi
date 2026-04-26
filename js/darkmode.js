/**
 * darkmode.js — Smooth VIBEIFY-style dark/light toggle
 * Reads system preference on first load, persists to localStorage.
 * Applies .no-transition before paint to prevent flash.
 */

const STORAGE_KEY = 'deepfocus-theme';

/**
 * Apply theme without animation (used on initial page load).
 */
function applyThemeImmediately(theme) {
  const html = document.documentElement;
  html.classList.add('no-transition');
  html.setAttribute('data-theme', theme);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      html.classList.remove('no-transition');
    });
  });
}

/**
 * Toggle between dark and light with smooth animation.
 */
function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem(STORAGE_KEY, next);

  // Notify other modules (e.g. settings sync)
  window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: next } }));
}

/**
 * Get current theme.
 */
function getCurrentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

/**
 * Initialize dark mode on page load.
 * Priority: localStorage → system preference → dark (default)
 */
function initDarkMode() {
  let theme = localStorage.getItem(STORAGE_KEY);

  if (!theme) {
    // Default to light (LoFi Pink) on first visit
    theme = 'light';
  }

  applyThemeImmediately(theme);

  // Wire up the toggle button
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.addEventListener('click', toggleTheme);
    btn.setAttribute('aria-label', 'Toggle dark/light mode');
  }
}

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDarkMode);
} else {
  initDarkMode();
}

export { initDarkMode, toggleTheme, getCurrentTheme };
