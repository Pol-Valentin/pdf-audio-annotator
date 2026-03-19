// Audio recording: capture mic, process to PCM, create annotation
import { state, addAnnotation, getAuthor } from './state.js';
import { EventBus } from './event-bus.js';
import { formatTime } from './utils.js';

const recBar = document.getElementById('recBar');
const recTimer = document.getElementById('recTimer');
const recStop = document.getElementById('recStop');
const recCancel = document.getElementById('recCancel');

export function initRecorder() {
  recStop.addEventListener('click', stopRecording);
  recCancel.addEventListener('click', cancelRecording);
}

export async function startRecording(clickData) {
  state.pendingClick = clickData;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.audioChunks = [];
    state.mediaRecorder = new MediaRecorder(stream);
    state.mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) state.audioChunks.push(e.data);
    };
    state.mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      if (state.audioChunks.length) {
        await processAudio(new Blob(state.audioChunks, { type: state.mediaRecorder.mimeType }));
      }
    };
    state.mediaRecorder.start(100);
    state.isRecording = true;
    state.recStartTime = Date.now();
    recBar.classList.add('visible');
    recTimer.textContent = '00:00';
    state.recTimerInterval = setInterval(() => {
      const s = Math.floor((Date.now() - state.recStartTime) / 1000);
      recTimer.textContent = formatTime(s);
    }, 200);
  } catch (err) {
    console.error('Mic:', err);
    EventBus.emit('toast', 'Acces micro refuse');
    state.pendingClick = null;
  }
}

function stopRecording() {
  if (state.mediaRecorder?.state !== 'inactive') state.mediaRecorder.stop();
  state.isRecording = false;
  clearInterval(state.recTimerInterval);
  recBar.classList.remove('visible');
}

function cancelRecording() {
  if (state.mediaRecorder?.state !== 'inactive') {
    state.mediaRecorder.ondataavailable = null;
    state.mediaRecorder.onstop = () => state.mediaRecorder.stream?.getTracks().forEach(t => t.stop());
    state.mediaRecorder.stop();
  }
  state.audioChunks = [];
  state.isRecording = false;
  state.pendingClick = null;
  clearInterval(state.recTimerInterval);
  recBar.classList.remove('visible');
}

async function processAudio(blob) {
  const click = state.pendingClick;
  if (!click) return;
  state.pendingClick = null;
  try {
    const actx = new AudioContext();
    const decoded = await actx.decodeAudioData(await blob.arrayBuffer());
    const rate = 16000;
    const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * rate), rate);
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start(0);
    const res = await off.startRendering();
    const f32 = res.getChannelData(0);
    const pcm = new Uint8Array(f32.length * 2);
    const dv = new DataView(pcm.buffer);
    for (let i = 0; i < f32.length; i++) {
      const s = Math.max(-1, Math.min(1, f32[i]));
      dv.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    actx.close();
    const duration = Math.max(1, Math.round(decoded.duration));

    addAnnotation({
      id: Date.now(),
      type: 'recorded',
      pageIndex: click.pageIndex,
      pageNum: click.pageNum,
      pdfX: click.pdfX,
      pdfY: click.pdfY,
      pcmData: pcm,
      sampleRate: rate,
      channels: 1,
      bits: 16,
      duration,
      audioBlob: blob,
      author: getAuthor(),
      parentId: click.parentId || null,
      label: '',
    });
    EventBus.emit('toast', `Annotation ajoutee (${duration}s)`);
  } catch (err) {
    console.error('Process:', err);
    EventBus.emit('toast', 'Erreur traitement audio');
  }
}
