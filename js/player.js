// Audio player: mini-player bar, playback, sequence play for threads
import { state, getThread } from './state.js';
import { EventBus } from './event-bus.js';
import { formatTime } from './utils.js';

const playerBar = document.getElementById('playerBar');
const playerAuthor = document.getElementById('playerAuthor');
const playerLabel = document.getElementById('playerLabel');
const playerPosition = document.getElementById('playerPosition');
const playerPrev = document.getElementById('playerPrev');
const playerPlayPause = document.getElementById('playerPlayPause');
const playerNext = document.getElementById('playerNext');
const playerProgress = document.getElementById('playerProgress');
const playerProgressFill = document.getElementById('playerProgressFill');
const playerTimeCurrent = document.getElementById('playerTimeCurrent');
const playerTimeTotal = document.getElementById('playerTimeTotal');
const playerVolume = document.getElementById('playerVolume');

let currentAudio = null;
let currentUrl = null;
let currentPlaylist = []; // annotations in sequence
let currentIndex = 0;
let autoPlayEnabled = true;
let updateInterval = null;

const ICON_PLAY = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const ICON_PAUSE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';

function setPlayPauseIcon(isPlaying) {
  playerPlayPause.innerHTML = isPlaying ? ICON_PAUSE : ICON_PLAY;
}

export function initPlayer() {
  playerPrev.addEventListener('click', playPrev);
  playerNext.addEventListener('click', playNext);
  playerPlayPause.addEventListener('click', togglePlayPause);

  playerProgress.addEventListener('click', e => {
    if (!currentAudio) return;
    const rect = playerProgress.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    currentAudio.currentTime = ratio * currentAudio.duration;
  });

  playerVolume.addEventListener('input', e => {
    if (currentAudio) currentAudio.volume = e.target.value;
  });

  // Auto-play toggle in player bar
  const autoToggle = document.getElementById('playerAutoToggle');
  autoToggle.addEventListener('click', () => {
    autoPlayEnabled = !autoPlayEnabled;
    autoToggle.classList.toggle('active', autoPlayEnabled);
  });
}

export function playSingle(annotation, marker) {
  currentPlaylist = [annotation];
  currentIndex = 0;
  playAtIndex(0, marker);
}

export function playThread(rootId, startIndex = 0) {
  const thread = getThread(rootId);
  if (!thread.length) return;
  currentPlaylist = thread;
  currentIndex = startIndex;
  playAtIndex(currentIndex, null);
}

export function playAnnotation(annotation, marker) {
  // Check if this is part of a thread
  const rootId = annotation.parentId || annotation.id;
  const thread = getThread(rootId);
  if (thread.length > 1 && autoPlayEnabled) {
    const idx = thread.findIndex(a => a.id === annotation.id);
    playThread(rootId, idx >= 0 ? idx : 0);
  } else {
    playSingle(annotation, marker);
  }
}

function playAtIndex(index, marker) {
  stopCurrent();
  if (index < 0 || index >= currentPlaylist.length) {
    hidePlayer();
    return;
  }
  currentIndex = index;
  const a = currentPlaylist[currentIndex];
  if (!a.audioBlob) return;

  currentUrl = URL.createObjectURL(a.audioBlob);
  currentAudio = new Audio(currentUrl);
  currentAudio.volume = playerVolume.value;

  // Update mini-player UI
  showPlayer();
  playerAuthor.textContent = a.author || 'Anonyme';
  playerLabel.textContent = a.label || `Page ${a.pageNum}`;
  if (currentPlaylist.length > 1) {
    playerPosition.textContent = `${currentIndex + 1}/${currentPlaylist.length}`;
    playerPosition.style.display = 'inline';
  } else {
    playerPosition.style.display = 'none';
  }
  setPlayPauseIcon(true);
  playerTimeCurrent.textContent = '00:00';
  playerTimeTotal.textContent = formatTime(a.duration);
  playerProgressFill.style.width = '0%';

  updateInterval = setInterval(updateProgress, 200);

  currentAudio.onended = () => {
    clearInterval(updateInterval);
    // Emit stop for marker animation
    EventBus.emit('player:stopped', a);

    if (autoPlayEnabled && currentIndex < currentPlaylist.length - 1) {
      playAtIndex(currentIndex + 1, null);
    } else {
      setPlayPauseIcon(false);
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      currentAudio = null;
      currentUrl = null;
    }
  };

  currentAudio.play();
  EventBus.emit('player:playing', a);
}

function stopCurrent() {
  if (currentAudio) {
    currentAudio.pause();
    clearInterval(updateInterval);
    EventBus.emit('player:stopped', currentPlaylist[currentIndex]);
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentAudio = null;
    currentUrl = null;
  }
}

function togglePlayPause() {
  if (!currentAudio) {
    if (currentPlaylist.length) playAtIndex(currentIndex, null);
    return;
  }
  if (currentAudio.paused) {
    currentAudio.play();
    setPlayPauseIcon(true);
    EventBus.emit('player:playing', currentPlaylist[currentIndex]);
  } else {
    currentAudio.pause();
    setPlayPauseIcon(false);
    EventBus.emit('player:paused', currentPlaylist[currentIndex]);
  }
}

function playPrev() {
  if (currentIndex > 0) playAtIndex(currentIndex - 1, null);
}

function playNext() {
  if (currentIndex < currentPlaylist.length - 1) playAtIndex(currentIndex + 1, null);
}

function updateProgress() {
  if (!currentAudio || !currentAudio.duration) return;
  const pct = (currentAudio.currentTime / currentAudio.duration) * 100;
  playerProgressFill.style.width = pct + '%';
  playerTimeCurrent.textContent = formatTime(currentAudio.currentTime);
}

function showPlayer() {
  playerBar.classList.add('visible');
}

function hidePlayer() {
  playerBar.classList.remove('visible');
}

export function stopAll() {
  stopCurrent();
  hidePlayer();
}
