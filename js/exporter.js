// PDF export: write annotations with author (/T), replies (/IRT, /RT)
import { state, getReplies } from './state.js';
import { EventBus } from './event-bus.js';
import { resolve, PDFName, PDFNumber, PDFString, PDFArray, PDFDict, PDFRawStream, PDFRef } from './utils.js';

const { PDFDocument } = PDFLib;

export function initExporter() {
  document.getElementById('downloadBtn').addEventListener('click', buildAndDownload);
  document.getElementById('downloadBtn2').addEventListener('click', buildAndDownload);
}

async function buildAndDownload() {
  const rec = state.annotations.filter(a => a.type === 'recorded');
  const movedImported = state.annotations.filter(a => a.type === 'imported' && a.moved);
  const hasChanges = rec.length > 0 || state.deletedImportedIndices.length > 0 || movedImported.length > 0;
  if (!hasChanges) return;

  try {
    const doc = await PDFDocument.load(state.pdfBytes, { ignoreEncryption: true });
    const ctx = doc.context;

    // 1. Remove ONLY deleted annotations (not moved ones!)
    const toRemove = {};
    state.deletedImportedIndices.forEach(d => {
      (toRemove[d.pageIndex] ||= new Set()).add(d.annotIndex);
    });

    for (const pi of Object.keys(toRemove)) {
      const page = doc.getPage(parseInt(pi));
      const annotsRaw = page.node.get(PDFName.of('Annots'));
      if (!annotsRaw) continue;
      let arr = annotsRaw instanceof PDFArray ? annotsRaw : ctx.lookup(annotsRaw);
      if (!(arr instanceof PDFArray)) continue;
      const indices = [...toRemove[pi]].sort((a, b) => b - a);
      for (const idx of indices) { if (idx < arr.size()) arr.remove(idx); }
    }

    // 2. Patch moved imported annotations IN PLACE (no stream duplication)
    for (const a of movedImported) {
      const page = doc.getPage(a.pageIndex);
      const annotsRaw = page.node.get(PDFName.of('Annots'));
      if (!annotsRaw) continue;
      const arr = resolve(ctx, annotsRaw);
      if (!(arr instanceof PDFArray)) continue;

      // Find the annotation dict — account for deleted indices shifting positions
      // We need to find the Sound annotation at the adjusted index
      const deletedOnPage = toRemove[a.pageIndex];
      let adjustedIndex = a.origAnnotIndex;
      if (deletedOnPage) {
        // Count how many deleted indices are before this one
        const deletedBefore = [...deletedOnPage].filter(i => i < a.origAnnotIndex).length;
        adjustedIndex -= deletedBefore;
      }

      if (adjustedIndex < 0 || adjustedIndex >= arr.size()) continue;
      const annot = resolve(ctx, arr.get(adjustedIndex));
      if (!(annot instanceof PDFDict)) continue;

      // Patch fields in place — no new stream needed
      annot.set(PDFName.of('T'), PDFString.of(a.author || 'Anonyme'));
      annot.set(PDFName.of('Contents'), PDFString.of(a.label || `Note audio - ${a.duration}s`));
      annot.set(PDFName.of('Rect'), ctx.obj([a.pdfX, a.pdfY, a.pdfX + 24, a.pdfY + 24]));
    }

    // 3. Add new recorded annotations
    const refMap = new Map();
    const roots = rec.filter(a => !a.parentId);
    const replies = rec.filter(a => a.parentId);

    for (const a of roots) {
      const ref = writeNewAnnotation(doc, ctx, a, null);
      refMap.set(a.id, ref);
    }

    for (const a of replies) {
      const parentRef = refMap.get(a.parentId);
      writeNewAnnotation(doc, ctx, a, parentRef || null);
    }

    const bytes = await doc.save({ useObjectStreams: false });
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'annotated_audio.pdf';
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    URL.revokeObjectURL(url);

    const parts = [];
    if (rec.length) parts.push(`${rec.length} ajoutée(s)`);
    if (state.deletedImportedIndices.length) parts.push(`${state.deletedImportedIndices.length} supprimée(s)`);
    if (movedImported.length) parts.push(`${movedImported.length} modifiée(s)`);
    EventBus.emit('toast', `PDF exporté — ${parts.join(', ')}`);
  } catch (err) {
    console.error('Export:', err);
    EventBus.emit('toast', 'Erreur export');
  }
}

function writeNewAnnotation(doc, ctx, a, parentRef) {
  const page = doc.getPage(a.pageIndex);

  // Sound stream
  const sdm = new Map();
  sdm.set(PDFName.of('Type'), PDFName.of('Sound'));
  sdm.set(PDFName.of('R'), PDFNumber.of(a.sampleRate));
  sdm.set(PDFName.of('C'), PDFNumber.of(a.channels || 1));
  sdm.set(PDFName.of('B'), PDFNumber.of(a.bits || 16));
  sdm.set(PDFName.of('E'), PDFName.of('Signed'));
  sdm.set(PDFName.of('Length'), PDFNumber.of(a.pcmData.length));
  const sRef = ctx.register(new PDFRawStream(PDFDict.fromMapWithContext(sdm, ctx), a.pcmData));

  // Annotation dict
  const adm = new Map();
  adm.set(PDFName.of('Type'), PDFName.of('Annot'));
  adm.set(PDFName.of('Subtype'), PDFName.of('Sound'));
  adm.set(PDFName.of('Rect'), ctx.obj([a.pdfX, a.pdfY, a.pdfX + 24, a.pdfY + 24]));
  adm.set(PDFName.of('Sound'), sRef);
  adm.set(PDFName.of('Name'), PDFName.of('Speaker'));
  adm.set(PDFName.of('T'), PDFString.of(a.author || 'Anonyme'));
  adm.set(PDFName.of('Contents'), PDFString.of(a.label || `Note audio - ${a.duration}s`));
  adm.set(PDFName.of('F'), PDFNumber.of(4));

  // Write date /M in PDF date format
  if (a.createdAt) {
    const d = a.createdAt;
    const pad = n => String(n).padStart(2, '0');
    const pdfDate = `D:${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    adm.set(PDFName.of('M'), PDFString.of(pdfDate));
  }

  if (parentRef) {
    adm.set(PDFName.of('IRT'), parentRef);
    adm.set(PDFName.of('RT'), PDFName.of('R'));
  }

  const aRef = ctx.register(PDFDict.fromMapWithContext(adm, ctx));

  const raw = page.node.get(PDFName.of('Annots'));
  if (raw) {
    let ar = raw instanceof PDFArray ? raw : ctx.lookup(raw);
    if (ar instanceof PDFArray) ar.push(aRef);
  } else {
    page.node.set(PDFName.of('Annots'), ctx.obj([aRef]));
  }

  return aRef;
}
