// Entry point: wire all modules together
import { state } from './state.js';
import { EventBus } from './event-bus.js';
import { loadPDF } from './pdf-loader.js';
import { initAuthor, ensureAuthor } from './author.js';
import { initRecorder, startRecording } from './recorder.js';
import { initPlayer } from './player.js';
import { initMarkers, updateMarkers } from './markers.js';
import { initSidebar } from './sidebar.js';
import { initExporter } from './exporter.js';
import { initTheme } from './theme.js';

// DOM refs
const dropzone = document.getElementById('dropzone');
const dropArea = document.getElementById('dropArea');
const fileInput = document.getElementById('fileInput');
const viewer = document.getElementById('viewer');
const sidebar = document.getElementById('sidebar');
const canvasWrapper = document.getElementById('canvasWrapper');
const pdfCanvas = document.getElementById('pdfCanvas');
const headerControls = document.getElementById('headerControls');
const pageNumEl = document.getElementById('pageNum');
const pageCountEl = document.getElementById('pageCount');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');
const toggleAnnotateBtn = document.getElementById('toggleAnnotate');
const toastEl = document.getElementById('toast');
const infoBar = document.getElementById('infoBar');
const loadingMsg = document.getElementById('loadingMsg');

// Init pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Init all modules
initAuthor();
initRecorder();
initPlayer();
initMarkers();
initSidebar();
initExporter();
initTheme();

// ── Open new file ──
document.getElementById('openNewFile').addEventListener('click', () => {
  const rec = state.annotations.filter(a => a.type === 'recorded');
  const hasChanges = rec.length > 0 || state.deletedImportedIndices.length > 0 || state.hasMovedAnnotations;
  if (hasChanges && !confirm('Tu as des modifications non exportées. Continuer ?')) return;
  fileInput.click();
});

// ── Drag & drop ──
dropArea.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => { if (e.target.files[0]) handleLoadPDF(e.target.files[0]); });
dropArea.addEventListener('dragover', e => { e.preventDefault(); dropArea.classList.add('dragover'); });
dropArea.addEventListener('dragleave', () => dropArea.classList.remove('dragover'));
dropArea.addEventListener('drop', e => {
  e.preventDefault(); dropArea.classList.remove('dragover');
  if (e.dataTransfer.files[0]) handleLoadPDF(e.dataTransfer.files[0]);
});

async function handleLoadPDF(file) {
  loadingMsg.classList.add('visible');
  await loadPDF(file);
  loadingMsg.classList.remove('visible');
}

// ── PDF loaded ──
EventBus.on('pdf:loaded', async () => {
  dropzone.style.display = 'none';
  viewer.style.display = 'flex';
  sidebar.style.display = 'flex';
  headerControls.style.display = 'flex';
  pageCountEl.textContent = state.totalPages;
  // Auto-fit to width on mobile, or if PDF would overflow
  if (window.innerWidth <= 1024) {
    await fitToWidth();
  } else {
    renderPage(state.currentPage);
  }
  updatePageNav();
});

EventBus.on('pdf:hasImportedAnnotations', count => {
  infoBar.style.display = 'block';
  showToast(`${count} annotation(s) audio trouvee(s)`);
});

// ── Page navigation ──
function updatePageNav() {
  prevPageBtn.disabled = state.currentPage <= 1;
  nextPageBtn.disabled = state.currentPage >= state.totalPages;
}

async function renderPage(n) {
  const page = await state.pdfJsDoc.getPage(n);
  const vp = page.getViewport({ scale: state.scale });
  pdfCanvas.width = vp.width;
  pdfCanvas.height = vp.height;
  await page.render({ canvasContext: pdfCanvas.getContext('2d'), viewport: vp }).promise;
  pageNumEl.textContent = n;
  updateMarkers();
}

prevPageBtn.addEventListener('click', () => {
  if (state.currentPage > 1) { state.currentPage--; renderPage(state.currentPage); updatePageNav(); }
});
nextPageBtn.addEventListener('click', () => {
  if (state.currentPage < state.totalPages) { state.currentPage++; renderPage(state.currentPage); updatePageNav(); }
});

EventBus.on('page:changed', () => {
  renderPage(state.currentPage);
  updatePageNav();
});

// ── Zoom ──
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 5;

function getFitScale() {
  if (!state.pdfJsDoc) return 1.5;
  const page = state.pdfJsDoc.getPage(state.currentPage);
  return page.then(p => {
    const vp = p.getViewport({ scale: 1 });
    const viewerWidth = viewer.clientWidth - 16;
    return viewerWidth / vp.width;
  });
}

async function fitToWidth() {
  const fitScale = await getFitScale();
  state.scale = Math.min(Math.max(fitScale, ZOOM_MIN), ZOOM_MAX);
  renderPage(state.currentPage);
}

// Pinch-to-zoom on touch devices
{
  let initialDistance = 0;
  let initialScale = 1;

  function getDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  canvasWrapper.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      e.preventDefault();
      initialDistance = getDistance(e.touches);
      initialScale = state.scale;
    }
  }, { passive: false });

  canvasWrapper.addEventListener('touchmove', e => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = getDistance(e.touches);
      const ratio = dist / initialDistance;
      state.scale = Math.min(Math.max(initialScale * ratio, ZOOM_MIN), ZOOM_MAX);
    }
  }, { passive: false });

  canvasWrapper.addEventListener('touchend', e => {
    if (initialDistance > 0 && e.touches.length < 2) {
      initialDistance = 0;
      renderPage(state.currentPage);
    }
  });
}

// ── Annotate mode ──
toggleAnnotateBtn.addEventListener('click', () => {
  state.annotateMode = !state.annotateMode;
  toggleAnnotateBtn.classList.toggle('active', state.annotateMode);
  canvasWrapper.classList.toggle('annotate-mode', state.annotateMode);
  toggleAnnotateBtn.innerHTML = state.annotateMode
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/><circle cx="12" cy="12" r="5" fill="currentColor"/></svg> Annoter (ON)`
    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/><circle cx="12" cy="12" r="5"/></svg> Annoter`;
  EventBus.emit('annotateMode:changed', state.annotateMode);
});

pdfCanvas.addEventListener('click', async e => {
  if (!state.annotateMode || state.isRecording) return;
  if (!(await ensureAuthor())) return;
  const rect = pdfCanvas.getBoundingClientRect();
  const cx = (e.clientX - rect.left) * (pdfCanvas.width / rect.width);
  const cy = (e.clientY - rect.top) * (pdfCanvas.height / rect.height);
  const ph = state.pageHeights[state.currentPage];
  startRecording({
    pageIndex: state.currentPage - 1,
    pageNum: state.currentPage,
    pdfX: cx / state.scale,
    pdfY: ph - (cy / state.scale),
    parentId: null,
  });
});

// ── Refresh markers when annotations change ──
EventBus.on('annotations:changed', () => {
  if (state.pdfJsDoc) updateMarkers();
});

// ── Toast ──
EventBus.on('toast', msg => showToast(msg));

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 3500);
}

// ── Resize ──
{
  let resizeTimer;
  window.addEventListener('resize', () => {
    if (!state.pdfJsDoc) return;
    updateMarkers();
    // Re-fit on mobile after resize/orientation change
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (window.innerWidth <= 1024) fitToWidth();
    }, 250);
  });
}

// ── Warn before leaving with unsaved changes ──
function hasUnsavedChanges() {
  const rec = state.annotations.filter(a => a.type === 'recorded');
  return rec.length > 0 || state.deletedImportedIndices.length > 0 || state.hasMovedAnnotations;
}

// Native fallback (can't be customized but catches tab close / reload)
window.addEventListener('beforeunload', e => {
  if (hasUnsavedChanges() && !state._allowLeave) {
    e.preventDefault();
  }
});

// Custom modal for keyboard shortcuts & navigation
{
  const leaveModal = document.getElementById('leaveModal');
  const closeBtn = document.getElementById('leaveModalClose');
  const discardBtn = document.getElementById('leaveModalDiscard');
  const exportBtn = document.getElementById('leaveModalExport');

  function showLeaveModal() {
    if (!hasUnsavedChanges()) return false;
    leaveModal.classList.add('visible');
    return true;
  }

  function hideLeaveModal() {
    leaveModal.classList.remove('visible');
  }

  closeBtn.addEventListener('click', hideLeaveModal);
  leaveModal.addEventListener('click', e => { if (e.target === leaveModal) hideLeaveModal(); });

  discardBtn.addEventListener('click', () => {
    state._allowLeave = true;
    hideLeaveModal();
    window.close(); // works if opened by script, otherwise no-op
  });

  exportBtn.addEventListener('click', async () => {
    hideLeaveModal();
    // Trigger export
    document.getElementById('downloadBtn').click();
    // Small delay for download to start, then allow leave
    setTimeout(() => { state._allowLeave = true; }, 500);
  });

  // Expose for potential use
  EventBus.on('app:tryLeave', showLeaveModal);
}

// ── Mobile sidebar toggle ──
{
  const sidebarToggle = document.getElementById('sidebarToggle');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const toggleBadge = document.getElementById('toggleBadge');

  function isMobile() { return window.innerWidth <= 768; }

  function openSidebar() {
    sidebar.classList.add('open');
    sidebarOverlay.classList.add('visible');
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('visible');
  }

  sidebarToggle.addEventListener('click', () => {
    sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
  });

  sidebarOverlay.addEventListener('click', closeSidebar);
  document.getElementById('sidebarClose').addEventListener('click', closeSidebar);

  // Show/hide toggle button based on viewport
  function updateToggleVisibility() {
    if (isMobile() && headerControls.style.display !== 'none') {
      sidebarToggle.style.display = '';
      // On mobile, hide sidebar from flow (CSS handles positioning)
      if (!sidebar.classList.contains('open')) {
        sidebar.style.display = 'flex';
      }
    } else {
      sidebarToggle.style.display = 'none';
      sidebar.classList.remove('open');
      sidebarOverlay.classList.remove('visible');
    }
  }

  window.addEventListener('resize', updateToggleVisibility);

  // Update badge count when annotations change
  EventBus.on('annotations:changed', () => {
    const count = state.annotations.length;
    if (count > 0) {
      toggleBadge.textContent = count;
      toggleBadge.style.display = '';
    } else {
      toggleBadge.style.display = 'none';
    }
  });

  // Also update toggle visibility when PDF loads
  EventBus.on('pdf:loaded', updateToggleVisibility);
}
