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

export function initSidebar() {
  EventBus.on('annotations:changed', refreshUI);

  document.getElementById('bulkEditAuthor').addEventListener('click', () => {
    if (!state.annotations.length) return;

    // Collect unique authors
    const authors = [...new Set(state.annotations.map(a => a.author || 'Anonyme'))];
    const currentFilter = authors.length === 1 ? authors[0] : '';

    const oldName = prompt(
      `Quel auteur remplacer ?\n(Auteurs actuels : ${authors.join(', ')}\nLaisser vide pour tout modifier)`,
      currentFilter
    );
    if (oldName === null) return;

    const newName = prompt('Nouveau nom :', oldName || '');
    if (newName === null || !newName.trim()) return;

    let count = 0;
    state.annotations.forEach(a => {
      const match = oldName === ''
        || (a.author || 'Anonyme') === oldName
        || (a.author || '') === oldName;
      if (match) {
        a.author = newName.trim();
        if (a.type === 'imported') a.moved = true;
        count++;
      }
    });

    if (count > 0) {
      state.hasMovedAnnotations = true;
      EventBus.emit('annotations:changed');
      EventBus.emit('toast', `${count} annotation(s) modifiee(s)`);
    }
  });
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

  // Edit author on click
  el.querySelector('.author-tag').addEventListener('click', e => {
    e.stopPropagation();
    const newName = prompt('Nom de l\'auteur :', a.author || '');
    if (newName !== null) {
      a.author = newName.trim();
      if (a.type === 'imported') a.moved = true; // flag as modified for re-export
      state.hasMovedAnnotations = true;
      EventBus.emit('annotations:changed');
    }
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
