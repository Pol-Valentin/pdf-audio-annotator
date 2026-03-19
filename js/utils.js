// Shared helpers for PDF manipulation
const { PDFName, PDFNumber, PDFString, PDFArray, PDFDict, PDFRawStream, PDFRef } = PDFLib;

export { PDFName, PDFNumber, PDFString, PDFArray, PDFDict, PDFRawStream, PDFRef };

export function num(o) {
  if (o == null) return null;
  if (typeof o === 'number') return o;
  if (typeof o.numberValue === 'number') return o.numberValue;
  if (typeof o.value === 'function') return o.value();
  const n = parseFloat(String(o));
  return isNaN(n) ? null : n;
}

export function resolve(ctx, o) {
  return o instanceof PDFRef ? ctx.lookup(o) : o;
}

export function streamDict(s) {
  if (s.dict && s.dict instanceof PDFDict) return s.dict;
  if (s instanceof PDFDict) return s;
  if (typeof s.get === 'function') return s;
  return null;
}

export function getStreamBytes(ctx, s) {
  let raw = null;
  if (s.contents && s.contents.length > 0) raw = new Uint8Array(s.contents);
  if (!raw && typeof s.getContents === 'function') {
    try {
      const c = s.getContents();
      if (c && c.length > 0) raw = new Uint8Array(c);
    } catch (e) { /* skip */ }
  }
  if (!raw || !raw.length) return null;
  const d = streamDict(s);
  if (d) {
    const f = d.get(PDFName.of('Filter'));
    if (f && f.toString() === '/FlateDecode') {
      try { return pako.inflate(raw); } catch (e) { return raw; }
    }
  }
  return raw;
}

export function pcmToWav(pcm, rate, ch, bits) {
  const br = rate * ch * (bits / 8);
  const ba = ch * (bits / 8);
  const buf = new ArrayBuffer(44 + pcm.length);
  const v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + pcm.length, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, rate, true); v.setUint32(28, br, true); v.setUint16(32, ba, true);
  v.setUint16(34, bits, true); w(36, 'data'); v.setUint32(40, pcm.length, true);
  new Uint8Array(buf, 44).set(pcm);
  return new Blob([buf], { type: 'audio/wav' });
}

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

export const SPEAKER_SVG = `<svg viewBox="0 0 24 24"><path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
