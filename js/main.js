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
EventBus.on('pdf:loaded', () => {
  dropzone.style.display = 'none';
  viewer.style.display = 'flex';
  sidebar.style.display = 'flex';
  headerControls.style.display = 'flex';
  pageCountEl.textContent = state.totalPages;
  renderPage(state.currentPage);
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
window.addEventListener('resize', () => { if (state.pdfJsDoc) updateMarkers(); });
