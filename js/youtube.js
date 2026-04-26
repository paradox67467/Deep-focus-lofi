/**
 * youtube.js — YouTube IFrame API + Lofi Playlist Navigation
 *
 * Channel: TranquilTunes Hub — @tranquiltuneshub-y5d
 *
 * Features:
 *   - Click-to-load overlay (autoplay policy compliance)
 *   - Next / Prev track buttons cycle a curated lofi playlist
 *   - Manual play only — no auto-start on page load
 */

// ─── Curated LoFi Playlist ────────────────────────────────────────────────────
// Add TranquilTunes Hub video IDs here as you find them.
// Each entry: { id: 'YouTube11CharID', label: 'Track name' }
const LOFI_PLAYLIST = [
  { id: 'jfKfPfyJRdk', label: '☁️ Lofi Hip Hop Radio'         },
  { id: '5qap5aO4i9A', label: '🌿 Beats to Relax / Study To'  },
  { id: 'lTRiuFIWV54', label: '🌙 Lofi Chill Vibes'           },
  { id: 'n61ULEU7CO0', label: '🌸 Lofi Hip Hop Mix'           },
  { id: 'DWcJFNfaw9c', label: '✨ Slowed + Reverb Lofi Mix'   },
  { id: 'aLqc8TkVFmY', label: '🍵 Study Coffee Shop Ambience' },
];

const CHANNEL_LABEL = 'TranquilTunes Hub';
const CHANNEL_URL   = 'https://www.youtube.com/@tranquiltuneshub-y5d';

// ─── State ────────────────────────────────────────────────────────────────────
let ytPlayer        = null;
let ytReady         = false;
let ytVolume        = 70;
let currentTrackIdx = 0;
let playerCreated   = false;

// ─── Init ─────────────────────────────────────────────────────────────────────

function initYouTube() {
  if (window.YT) { ytReady = true; return; }

  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  const first = document.getElementsByTagName('script')[0];
  first.parentNode.insertBefore(tag, first);

  window.onYouTubeIframeAPIReady = () => {
    ytReady = true;
    console.log('▶ YouTube IFrame API ready.');
  };
}

// ─── Player Creation ──────────────────────────────────────────────────────────

function createPlayer(trackIdx = currentTrackIdx) {
  if (!ytReady || playerCreated) return;
  playerCreated = true;

  const track = LOFI_PLAYLIST[trackIdx];

  ytPlayer = new YT.Player('yt-player-container', {
    height: '100%',
    width:  '100%',
    videoId: track.id,
    playerVars: {
      autoplay:       1,
      controls:       1,   // Use YouTube's native controls
      rel:            0,
      modestbranding: 1,
      iv_load_policy: 3,
      fs:             1,   // Allow fullscreen
    },
    events: {
      onReady:       onPlayerReady,
      onStateChange: onPlayerStateChange,
      onError:       onPlayerError,
    },
  });
}

function onPlayerReady(event) {
  event.target.setVolume(ytVolume);
  event.target.playVideo();
  updatePlayPauseBtn(true);
  updateTrackLabel();

  // Hide overlay
  const overlay = document.getElementById('yt-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function onPlayerStateChange(event) {
  const isPlaying = event.data === YT.PlayerState.PLAYING;
  updatePlayPauseBtn(isPlaying);
}

function onPlayerError(event) {
  console.warn('YT error, skipping to next track…', event.data);
  nextTrack();
}

// ─── Controls ─────────────────────────────────────────────────────────────────

function playPause() {
  if (!ytPlayer) { createPlayer(); return; }
  const state = ytPlayer.getPlayerState();
  if (state === YT.PlayerState.PLAYING) {
    ytPlayer.pauseVideo();
  } else {
    ytPlayer.playVideo();
  }
}

function nextTrack() {
  currentTrackIdx = (currentTrackIdx + 1) % LOFI_PLAYLIST.length;
  loadTrack(currentTrackIdx);
}

function prevTrack() {
  currentTrackIdx = (currentTrackIdx - 1 + LOFI_PLAYLIST.length) % LOFI_PLAYLIST.length;
  loadTrack(currentTrackIdx);
}

function loadTrack(idx) {
  const track = LOFI_PLAYLIST[idx];
  if (ytPlayer) {
    ytPlayer.loadVideoById(track.id);
    // Hide overlay if it was still showing
    const overlay = document.getElementById('yt-overlay');
    if (overlay) overlay.classList.add('hidden');
  } else if (ytReady) {
    createPlayer(idx);
  }
  updateTrackLabel();
}

function setYTVolume(value) {
  ytVolume = Math.round(Math.max(0, Math.min(100, value)));
  if (ytPlayer) ytPlayer.setVolume(ytVolume);
}

function getYTVolume() { return ytVolume; }

function isPlaying() {
  if (!ytPlayer) return false;
  return ytPlayer.getPlayerState() === YT.PlayerState.PLAYING;
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function updatePlayPauseBtn(playing) {
  const btn = document.getElementById('yt-playpause');
  if (btn) btn.textContent = playing ? '⏸ Pause' : '▶ Play';
}

function updateTrackLabel() {
  const el = document.getElementById('yt-track-label');
  if (el) el.textContent = LOFI_PLAYLIST[currentTrackIdx]?.label || '🎵 LoFi Track';
}

export {
  initYouTube,
  createPlayer,
  setYTVolume,
};
