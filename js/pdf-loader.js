// PDF loading and Sound annotation extraction
import { state, addAnnotation } from './state.js';
import { EventBus } from './event-bus.js';
import { num, resolve, streamDict, getStreamBytes, pcmToWav, PDFName, PDFArray, PDFDict, PDFRef } from './utils.js';

const { PDFDocument } = PDFLib;

export async function loadPDF(file) {
  const ab = await file.arrayBuffer();
  state.pdfBytes = new Uint8Array(ab);
  state.annotations = [];
  state.deletedImportedIndices = [];
  state.hasMovedAnnotations = false;

  state.pdfDoc = await PDFDocument.load(state.pdfBytes, { ignoreEncryption: true });
  state.pdfJsDoc = await pdfjsLib.getDocument({ data: state.pdfBytes.slice() }).promise;
  state.totalPages = state.pdfJsDoc.numPages;
  state.currentPage = 1;

  for (let i = 1; i <= state.totalPages; i++) {
    const p = await state.pdfJsDoc.getPage(i);
    state.pageHeights[i] = p.getViewport({ scale: 1 }).height;
  }

  EventBus.emit('pdf:loaded');

  const count = await extractSoundAnnotations();
  if (count > 0) {
    EventBus.emit('pdf:hasImportedAnnotations', count);
  }

  EventBus.emit('annotations:changed');
}

async function extractSoundAnnotations() {
  const ctx = state.pdfDoc.context;
  const pages = state.pdfDoc.getPages();
  let count = 0;

  // First pass: collect all Sound annotations with their PDF refs for IRT linking
  const annotRefMap = new Map(); // PDFRef string -> annotation id
  const irtQueue = []; // { annotation, irtRef } to resolve after all loaded

  for (let pi = 0; pi < pages.length; pi++) {
    const aRaw = pages[pi].node.get(PDFName.of('Annots'));
    if (!aRaw) continue;
    const arr = resolve(ctx, aRaw);
    if (!(arr instanceof PDFArray)) continue;

    for (let ai = 0; ai < arr.size(); ai++) {
      try {
        const annotRef = arr.get(ai);
        const annot = resolve(ctx, annotRef);
        if (!(annot instanceof PDFDict)) continue;
        const sub = annot.get(PDFName.of('Subtype'));
        if (!sub || sub.toString() !== '/Sound') continue;

        const rectArr = resolve(ctx, annot.get(PDFName.of('Rect')));
        if (!(rectArr instanceof PDFArray)) continue;
        const x1 = num(rectArr.get(0)) ?? 0;
        const y1 = num(rectArr.get(1)) ?? 0;

        const snd = resolve(ctx, annot.get(PDFName.of('Sound')));
        if (!snd) continue;
        const sd = streamDict(snd);
        const gp = (n, d) => { const v = sd?.get(PDFName.of(n)); return v ? (num(v) ?? d) : d; };
        const sampleRate = gp('R', 16000), channels = gp('C', 1), bits = gp('B', 16);

        const pcm = getStreamBytes(ctx, snd);
        if (!pcm || !pcm.length) continue;

        const dur = Math.max(1, Math.round(pcm.length / (sampleRate * channels * (bits / 8))));
        const wavBlob = pcmToWav(pcm, sampleRate, channels, bits);

        // Read author from /T
        const tObj = annot.get(PDFName.of('T'));
        let author = '';
        if (tObj) {
          const s = typeof tObj.value === 'function' ? tObj.value() : String(tObj);
          author = s.replace(/^\(|\)$/g, '');
          if (author === 'PDF Audio Annotator') author = '';
        }

        // Read label from /Contents
        const cObj = annot.get(PDFName.of('Contents'));
        let label = '';
        if (cObj) {
          const s = typeof cObj.value === 'function' ? cObj.value() : String(cObj);
          label = s.replace(/^\(|\)$/g, '');
        }

        // Read date from /M (modification date)
        let createdAt = null;
        const mObj = annot.get(PDFName.of('M'));
        if (mObj) {
          const ms = typeof mObj.value === 'function' ? mObj.value() : String(mObj);
          const dateStr = ms.replace(/^\(|\)$/g, '');
          // PDF date format: D:YYYYMMDDHHmmSS or variants
          const match = dateStr.match(/D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?/);
          if (match) {
            createdAt = new Date(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +(match[6] || 0));
          }
        }

        const id = Date.now() + Math.random();
        const annotation = {
          id, type: 'imported',
          pageIndex: pi, pageNum: pi + 1, pdfX: x1, pdfY: y1,
          pcmData: pcm, sampleRate, channels, bits, duration: dur,
          audioBlob: wavBlob, label, author,
          origAnnotIndex: ai, moved: false,
          parentId: null, createdAt,
        };

        state.annotations.push(annotation);

        // Map PDF ref to our id for IRT resolution
        if (annotRef instanceof PDFRef) {
          annotRefMap.set(annotRef.toString(), id);
        }

        // Check for IRT (InReplyTo)
        const irtRef = annot.get(PDFName.of('IRT'));
        if (irtRef) {
          irtQueue.push({ annotation, irtRef });
        }

        count++;
      } catch (e) {
        console.warn('Skip:', e);
      }
    }
  }

  // Resolve IRT references
  for (const { annotation, irtRef } of irtQueue) {
    const refStr = irtRef instanceof PDFRef ? irtRef.toString() : String(irtRef);
    const parentId = annotRefMap.get(refStr);
    if (parentId) {
      annotation.parentId = parentId;
    }
  }

  return count;
}
