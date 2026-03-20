// Sidebar: annotation list grouped by thread, with author display and edit
import { state, getReplies, removeAnnotation } from './state.js';
import { EventBus } from './event-bus.js';
import { SPEAKER_SVG } from './utils.js';
import { playAnnotation } from './player.js';

const annotationList = document.getElementById('annotationList');
const emptyState = document.getElementById('emptyState');
const countBadge = document.getElementById('countBadge');
const downloadBtn = document.getElementById('downloadBtn');
const downloadBtn2 = document.getElementById('downloadBtn2');

// Modal elements
const modal = document.getElementById('bulkEditModal');
const modalSelect = document.getElementById('bulkEditSelect');
const modalNewName = document.getElementById('bulkEditNewName');
const modalPreview = document.getElementById('bulkEditPreview');

export function initSidebar() {
  EventBus.on('annotations:changed', refreshUI);
  initBulkEditModal();
}

function initBulkEditModal() {
  const openBtn = document.getElementById('bulkEditAuthor');
  const closeBtn = document.getElementById('bulkEditClose');
  const cancelBtn = document.getElementById('bulkEditCancel');
  const applyBtn = document.getElementById('bulkEditApply');

  openBtn.addEventListener('click', openBulkEdit);
  closeBtn.addEventListener('click', closeBulkEdit);
  cancelBtn.addEventListener('click', closeBulkEdit);
  modal.addEventListener('click', e => { if (e.target === modal) closeBulkEdit(); });

  // Live preview
  modalSelect.addEventListener('change', updatePreview);
  modalNewName.addEventListener('input', updatePreview);

  applyBtn.addEventListener('click', () => {
    const selected = modalSelect.value;
    const newName = modalNewName.value.trim();
    if (!newName) return;

    let count = 0;
    state.annotations.forEach(a => {
      const authorKey = a.author || '';
      const match = selected === '__all__' || authorKey === selected;
      if (match) {
        a.author = newName;
        if (a.type === 'imported') a.moved = true;
        count++;
      }
    });

    if (count > 0) {
      state.hasMovedAnnotations = true;
      EventBus.emit('annotations:changed');
      EventBus.emit('toast', `${count} annotation(s) modifiée(s)`);
    }
    closeBulkEdit();
  });
}

function openBulkEdit() {
  if (!state.annotations.length) return;

  // Populate select with unique authors
  const authorCounts = {};
  state.annotations.forEach(a => {
    const key = a.author || '';
    authorCounts[key] = (authorCounts[key] || 0) + 1;
  });

  modalSelect.innerHTML = '';

  // "All" option
  const allOpt = document.createElement('option');
  allOpt.value = '__all__';
  allOpt.textContent = `Tous (${state.annotations.length} annotations)`;
  modalSelect.appendChild(allOpt);

  // Per-author options
  Object.entries(authorCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([author, count]) => {
      const opt = document.createElement('option');
      opt.value = author;
      opt.textContent = `${author || 'Anonyme'} (${count})`;
      modalSelect.appendChild(opt);
    });

  modalNewName.value = '';
  updatePreview();
  modal.classList.add('visible');
  modalNewName.focus();
}

function closeBulkEdit() {
  modal.classList.remove('visible');
}

function updatePreview() {
  const selected = modalSelect.value;
  const newName = modalNewName.value.trim();
  const count = selected === '__all__'
    ? state.annotations.length
    : state.annotations.filter(a => (a.author || '') === selected).length;

  if (!newName) {
    modalPreview.textContent = `${count} annotation(s) seront modifiée(s)`;
  } else {
    const oldLabel = selected === '__all__' ? 'tous les auteurs' : (selected || 'Anonyme');
    modalPreview.textContent = `${oldLabel} → ${newName} (${count} annotation(s))`;
  }
}

function refreshUI() {
  const roots = state.annotations.filter(a => !a.parentId);
  const imp = roots.filter(a => a.type === 'imported');
  const rec = roots.filter(a => a.type === 'recorded');

  countBadge.textContent = state.annotations.length;
  annotationList.innerHTML = '';

  if (!state.annotations.length) {
    annotationList.appendChild(emptyState);
  } else {
    if (imp.length) {
      const l = document.createElement('div');
      l.className = 'section-label imp';
      l.innerHTML = `Importees (${imp.length})<div class="line"></div>`;
      annotationList.appendChild(l);
      imp.forEach(a => appendThread(a));
    }
    if (rec.length) {
      const l = document.createElement('div');
      l.className = 'section-label rec';
      l.innerHTML = `Enregistrees (${rec.length})<div class="line"></div>`;
      annotationList.appendChild(l);
      rec.forEach(a => appendThread(a));
    }
  }

  updateExportBtn();
}

function appendThread(rootAnnotation) {
  annotationList.appendChild(makeItem(rootAnnotation, false));
  const replies = getReplies(rootAnnotation.id);
  replies.forEach(r => annotationList.appendChild(makeItem(r, true)));
}

function makeItem(a, isReply) {
  const el = document.createElement('div');
  el.className = 'annotation-item' + (isReply ? ' reply' : '');
  const dc = a.type === 'imported' ? 'imp' : 'rec';
  const kb = (a.pcmData.length / 1024).toFixed(0);
  const authorText = a.author || 'Anonyme';
  const lbl = a.label || `Page ${a.pageNum}`;

  el.innerHTML = `
    <div class="dot ${dc}">${SPEAKER_SVG}</div>
    <div class="info">
      <div class="label">
        <span class="author-tag" title="Clic pour editer">${authorText}</span>
        ${isReply ? '<span class="reply-icon">↩</span>' : ''}
        ${lbl}
      </div>
      <div class="meta">p.${a.pageNum} · ${a.duration}s · ${kb} KB</div>
    </div>
    <button class="del-btn" title="Supprimer">✕</button>
  `;

  // Inline edit author on click
  const authorTag = el.querySelector('.author-tag');
  authorTag.addEventListener('click', e => {
    e.stopPropagation();
    const tag = e.currentTarget;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'author-inline-edit';
    input.value = a.author || '';
    input.placeholder = 'Nom...';
    tag.replaceWith(input);
    input.focus();
    input.select();

    const commit = () => {
      const val = input.value.trim();
      a.author = val;
      if (a.type === 'imported') a.moved = true;
      state.hasMovedAnnotations = true;
      EventBus.emit('annotations:changed');
    };
    input.addEventListener('keydown', ev => {
      if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
      if (ev.key === 'Escape') { EventBus.emit('annotations:changed'); }
    });
    input.addEventListener('blur', commit);
  });

  el.querySelector('.info').addEventListener('click', () => {
    if (state.currentPage !== a.pageNum) {
      state.currentPage = a.pageNum;
      EventBus.emit('page:changed');
    }
    playAnnotation(a, null);
  });

  el.querySelector('.dot').addEventListener('click', () => playAnnotation(a, null));

  el.querySelector('.del-btn').addEventListener('click', e => {
    e.stopPropagation();
    removeAnnotation(a);
  });

  return el;
}

function updateExportBtn() {
  const rec = state.annotations.filter(a => a.type === 'recorded');
  const hasChanges = rec.length > 0 || state.deletedImportedIndices.length > 0 || state.hasMovedAnnotations;
  downloadBtn.disabled = downloadBtn2.disabled = !hasChanges;
}
