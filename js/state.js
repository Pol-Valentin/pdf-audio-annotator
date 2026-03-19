// Centralized application state
import { EventBus } from './event-bus.js';

export const state = {
  pdfBytes: null,
  pdfDoc: null,       // pdf-lib document
  pdfJsDoc: null,     // pdf.js document
  currentPage: 1,
  totalPages: 0,
  scale: 1.5,
  annotateMode: false,
  isRecording: false,
  annotations: [],
  pendingClick: null,
  mediaRecorder: null,
  audioChunks: [],
  recStartTime: null,
  recTimerInterval: null,
  pageHeights: {},
  currentAudio: null,
  currentMarker: null,
  deletedImportedIndices: [],
  hasMovedAnnotations: false,
  author: localStorage.getItem('paa-author') || '',
  autoPlay: true, // auto-play replies in sequence
};

export function getAuthor() {
  return state.author;
}

export function setAuthor(name) {
  state.author = name;
  localStorage.setItem('paa-author', name);
  EventBus.emit('author:changed', name);
}

// Get root annotations (no parentId) for a given page
export function getRootAnnotations(pageNum) {
  return state.annotations.filter(a => a.pageNum === pageNum && !a.parentId);
}

// Get replies for a given annotation id
export function getReplies(parentId) {
  return state.annotations.filter(a => a.parentId === parentId);
}

// Get the full thread (root + all replies in order)
export function getThread(rootId) {
  const root = state.annotations.find(a => a.id === rootId);
  if (!root) return [];
  const replies = getReplies(rootId);
  return [root, ...replies];
}

// Count all audios in a thread
export function getThreadCount(rootId) {
  return getThread(rootId).length;
}

export function addAnnotation(annotation) {
  state.annotations.push(annotation);
  EventBus.emit('annotations:changed');
}

export function removeAnnotation(annotation) {
  if (annotation.type === 'imported' && annotation.origAnnotIndex != null) {
    state.deletedImportedIndices.push({
      pageIndex: annotation.pageIndex,
      annotIndex: annotation.origAnnotIndex,
    });
  }
  // Also remove all replies if this is a root
  const replies = getReplies(annotation.id);
  replies.forEach(r => {
    const idx = state.annotations.indexOf(r);
    if (idx !== -1) state.annotations.splice(idx, 1);
  });
  const i = state.annotations.indexOf(annotation);
  if (i !== -1) state.annotations.splice(i, 1);
  EventBus.emit('annotations:changed');
}
