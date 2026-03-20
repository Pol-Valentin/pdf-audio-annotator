// Canvas markers: display, drag, popover for multi-audio threads
import { state, getRootAnnotations, getThread, getThreadCount } from './state.js';
import { EventBus } from './event-bus.js';
import { SPEAKER_SVG } from './utils.js';
import { playAnnotation, playThread } from './player.js';
import { startRecording } from './recorder.js';
import { ensureAuthor } from './author.js';

const canvasWrapper = document.getElementById('canvasWrapper');
const pdfCanvas = document.getElementById('pdfCanvas');
const DRAG_THRESHOLD = 5;

let activePopover = null;
let popoverJustOpened = false; // flag to prevent immediate close

export function initMarkers() {
  // Close popover on outside click — skip if just opened
  document.addEventListener('mousedown', e => {
    if (activePopover && !popoverJustOpened && !activePopover.contains(e.target)) {
      closePopover();
    }
    popoverJustOpened = false;
  });

  EventBus.on('player:playing', (a) => {
    document.querySelectorAll('.audio-marker').forEach(m => {
      if (m._rootId === (a.parentId || a.id)) m.classList.add('playing');
    });
  });

  EventBus.on('player:stopped', () => {
    document.querySelectorAll('.audio-marker.playing').forEach(m => m.classList.remove('playing'));
  });

  EventBus.on('player:paused', () => {
    document.querySelectorAll('.audio-marker.playing').forEach(m => m.classList.remove('playing'));
  });
}

export function updateMarkers() {
  canvasWrapper.querySelectorAll('.audio-marker').forEach(el => el.remove());
  closePopover();
  const cr = pdfCanvas.getBoundingClientRect();

  const roots = getRootAnnotations(state.currentPage);

  roots.forEach(a => {
    const ph = state.pageHeights[a.pageNum];
    const dx = (a.pdfX * state.scale) * (cr.width / pdfCanvas.width);
    const dy = ((ph - a.pdfY) * state.scale) * (cr.height / pdfCanvas.height);

    const m = document.createElement('div');
    const threadCount = getThreadCount(a.id);
    m.className = `audio-marker ${a.type}`;
    m._rootId = a.id;
    m.style.left = dx + 'px';
    m.style.top = dy + 'px';
    m.innerHTML = SPEAKER_SVG;

    if (threadCount > 1) {
      const badge = document.createElement('span');
      badge.className = 'marker-badge';
      badge.textContent = threadCount;
      m.appendChild(badge);
    }

    m.title = `${a.author || 'Anonyme'} — ${a.duration}s` +
      (threadCount > 1 ? ` — ${threadCount} audios` : '') +
      ' — glisse pour deplacer';

    setupDragAndClick(m, a);
    canvasWrapper.appendChild(m);
  });
}

function setupDragAndClick(m, a) {
  let downX, downY, origLeft, origTop, isDragging = false, didDrag = false;

  m.addEventListener('mousedown', e => {
    e.stopPropagation();
    e.preventDefault();
    downX = e.clientX; downY = e.clientY;
    origLeft = parseFloat(m.style.left); origTop = parseFloat(m.style.top);
    isDragging = true; didDrag = false;
    m.style.zIndex = '20';

    const onMove = ev => {
      if (!isDragging) return;
      const ddx = ev.clientX - downX, ddy = ev.clientY - downY;
      if (Math.abs(ddx) > DRAG_THRESHOLD || Math.abs(ddy) > DRAG_THRESHOLD) didDrag = true;
      if (didDrag) {
        m.style.left = (origLeft + ddx) + 'px';
        m.style.top = (origTop + ddy) + 'px';
        m.style.cursor = 'grabbing';
      }
    };

    const onUp = () => {
      isDragging = false; m.style.zIndex = '5'; m.style.cursor = 'grab';
      window.removeEventListener('mousemove', onMove);
      if (didDrag) {
        const newLeft = parseFloat(m.style.left), newTop = parseFloat(m.style.top);
        const crr = pdfCanvas.getBoundingClientRect();
        const ph2 = state.pageHeights[a.pageNum];
        a.pdfX = (newLeft / (crr.width / pdfCanvas.width)) / state.scale;
        a.pdfY = ph2 - ((newTop / (crr.height / pdfCanvas.height)) / state.scale);
        if (a.type === 'imported') a.moved = true;
        state.hasMovedAnnotations = true;
        EventBus.emit('annotations:changed');
      } else {
        showPopover(m, a, getThread(a.id));
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp, { once: true });
  });

  // Block click event from reaching document (would close the popover)
  m.addEventListener('click', e => {
    e.stopPropagation();
  });
}

function showPopover(marker, rootAnnotation, thread) {
  closePopover();
  popoverJustOpened = true;

  const pop = document.createElement('div');
  pop.className = 'marker-popover';
  pop.addEventListener('mousedown', e => e.stopPropagation());
  pop.addEventListener('click', e => e.stopPropagation());

  // Header
  const header = document.createElement('div');
  header.className = 'popover-header';
  header.innerHTML = `<span>${thread.length} audio${thread.length > 1 ? 's' : ''}</span>`;
  pop.appendChild(header);

  // Audio list
  const list = document.createElement('div');
  list.className = 'popover-list';
  thread.forEach((a, i) => {
    const item = document.createElement('div');
    item.className = 'popover-item';
    item.innerHTML = `
      <button class="popover-play" title="Jouer">▶</button>
      <span class="popover-author">${a.author || 'Anonyme'}</span>
      <span class="popover-duration">${a.duration}s</span>
    `;
    item.querySelector('.popover-play').addEventListener('click', e => {
      e.stopPropagation();
      playThread(rootAnnotation.id, i);
    });
    list.appendChild(item);
  });
  pop.appendChild(list);

  // Reply button
  const replyBtn = document.createElement('button');
  replyBtn.className = 'popover-reply';
  replyBtn.textContent = '🎙️ Répondre';
  replyBtn.addEventListener('click', async e => {
    e.stopPropagation();
    closePopover();
    if (!(await ensureAuthor())) return;
    startRecording({
      pageIndex: rootAnnotation.pageIndex,
      pageNum: rootAnnotation.pageNum,
      pdfX: rootAnnotation.pdfX,
      pdfY: rootAnnotation.pdfY,
      parentId: rootAnnotation.id,
    });
  });
  pop.appendChild(replyBtn);

  // Position popover below marker
  const mRect = marker.getBoundingClientRect();
  const wrapRect = canvasWrapper.getBoundingClientRect();
  pop.style.left = (mRect.left - wrapRect.left + mRect.width / 2) + 'px';
  pop.style.top = (mRect.top - wrapRect.top + mRect.height + 8) + 'px';

  canvasWrapper.appendChild(pop);
  activePopover = pop;
}

function closePopover() {
  if (activePopover) {
    activePopover.remove();
    activePopover = null;
  }
}

export function highlightMarker(rootId) {
  document.querySelectorAll('.audio-marker').forEach(m => {
    m.classList.toggle('highlighted', m._rootId === rootId);
  });
}

export function clearHighlight() {
  document.querySelectorAll('.audio-marker.highlighted').forEach(m => {
    m.classList.remove('highlighted');
  });
}
