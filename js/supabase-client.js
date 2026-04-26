/**
 * supabase-client.js — Supabase JS v2 client + auth helpers
 * Uses the anon (public) key for client-side auth only.
 * Replace SUPABASE_URL and SUPABASE_ANON_KEY with your project values.
 */

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const SUPABASE_URL      = 'https://obiwiylbbgvyiiwztufx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9iaXdpeWxiYmd2eWlpd3p0dWZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxNjkyMDAsImV4cCI6MjA5Mjc0NTIwMH0.dWCvf3NdviVwMmAoYYFKeDZA3q_oWC5MkEzgw_aXE1M';
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_CONFIGURED = (
  SUPABASE_URL !== 'https://YOUR_PROJECT_ID.supabase.co' &&
  SUPABASE_ANON_KEY !== 'YOUR_ANON_PUBLIC_KEY_HERE'
);

let supabaseClient = null;

/**
 * Initialize Supabase client. Called by app.js.
 */
function initSupabase() {
  if (!SUPABASE_CONFIGURED) {
    console.warn(
      '⚠️ Supabase credentials not set. ' +
      'Open frontend/js/supabase-client.js and fill in SUPABASE_URL and SUPABASE_ANON_KEY. ' +
      'App will run in guest mode.'
    );
    return null;
  }

  try {
    // supabase-js is loaded via CDN script in index.html
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window._supabaseClient = supabaseClient;   // Expose for sessions.js production mode
    console.log('✅ Supabase client ready.');
    return supabaseClient;
  } catch (err) {
    console.error('❌ Supabase init failed:', err);
    return null;
  }
}

/**
 * Send a Magic Link to the given email address.
 * @param {string} email
 * @returns {{ error: null | Error }}
 */
async function signInWithMagicLink(email) {
  if (!supabaseClient) return { error: new Error('Supabase not configured') };

  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: {
      // Use current page URL — works on localhost AND GitHub Pages subdirectory
      emailRedirectTo: window.location.href.split('?')[0].split('#')[0],
    },
  });

  return { error };
}

/**
 * Sign out current user.
 */
async function signOut() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
}

/**
 * Get currently authenticated user. Returns null in guest mode.
 */
async function getCurrentUser() {
  if (!supabaseClient) return null;
  const { data: { user } } = await supabaseClient.auth.getUser();
  return user;
}

/**
 * Register a callback that fires whenever auth state changes.
 * @param {function} callback - Called with (event, session)
 */
function onAuthStateChange(callback) {
  if (!supabaseClient) return () => {};
  const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(callback);
  return () => subscription.unsubscribe();
}

/**
 * Whether Supabase is properly configured.
 */
function isSupabaseReady() {
  return supabaseClient !== null;
}

export {
  initSupabase,
  signInWithMagicLink,
  signOut,
  getCurrentUser,
  onAuthStateChange,
  isSupabaseReady,
};
