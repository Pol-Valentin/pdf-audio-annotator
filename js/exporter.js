// PDF export: write annotations with author (/T), replies (/IRT, /RT)
import { state, getReplies } from './state.js';
import { EventBus } from './event-bus.js';
import { PDFName, PDFNumber, PDFString, PDFArray, PDFDict, PDFRawStream } from './utils.js';

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

    // 1. Remove deleted + moved imported annotations
    const toRemove = {};
    state.deletedImportedIndices.forEach(d => {
      (toRemove[d.pageIndex] ||= new Set()).add(d.annotIndex);
    });
    movedImported.forEach(a => {
      if (a.origAnnotIndex != null) {
        (toRemove[a.pageIndex] ||= new Set()).add(a.origAnnotIndex);
      }
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

    // Map annotation id -> PDF ref for IRT linking
    const refMap = new Map();

    // 2. Re-add moved imported + new recorded (roots first, then replies)
    const toWrite = [...movedImported, ...rec];
    const roots = toWrite.filter(a => !a.parentId);
    const replies = toWrite.filter(a => a.parentId);

    for (const a of roots) {
      const ref = writeAnnotation(doc, ctx, a, null);
      refMap.set(a.id, ref);
    }

    for (const a of replies) {
      const parentRef = refMap.get(a.parentId);
      writeAnnotation(doc, ctx, a, parentRef || null);
    }

    const bytes = await doc.save({ useObjectStreams: false });
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'annotated_audio.pdf';
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    URL.revokeObjectURL(url);

    const parts = [];
    if (rec.length) parts.push(`${rec.length} ajoutee(s)`);
    if (state.deletedImportedIndices.length) parts.push(`${state.deletedImportedIndices.length} supprimee(s)`);
    if (movedImported.length) parts.push(`${movedImported.length} deplacee(s)`);
    EventBus.emit('toast', `PDF exporte — ${parts.join(', ')}`);
  } catch (err) {
    console.error('Export:', err);
    EventBus.emit('toast', 'Erreur export');
  }
}

function writeAnnotation(doc, ctx, a, parentRef) {
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

  // IRT for replies
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
