# 📄🔊 PDF Audio Annotator

Annotate PDFs with audio recordings — view, record, reply, and export.

**[Try it live →](https://pol-valentin.github.io/pdf-audio-annotator/)**

## Features

- **📄 PDF Viewer** — Drop a PDF, navigate pages, zoom
- **🎙️ Audio annotations** — Click anywhere on the PDF to record a voice note
- **💬 Threaded replies** — Reply to any annotation, building audio conversations
- **👤 Author tracking** — Each annotation is tagged with the author's name, editable anytime
- **🕐 Timestamps** — Date/time recorded on each annotation
- **🔊 Mini-player** — Play/pause, seek, prev/next, volume, auto-play threads
- **✨ Marker highlights** — Hover sidebar items to locate annotations on the page
- **📥 Import** — Reads existing PDF Sound annotations (`/Sound`, `/IRT`, `/T`, `/M`)
- **📤 Export** — Saves everything back into the PDF as standard Sound annotations
- **🔒 Microphone persists** — Hosted on HTTPS (GitHub Pages), so the browser remembers mic permission

## How it works

1. Drop a PDF (or click to select)
2. Click **Annoter** — enter your name once
3. Click on the PDF to start recording
4. Click **Terminer** when done
5. Reply to annotations via the popover or sidebar 🎙️ button
6. **Exporter** to download the annotated PDF

Annotations are stored as standard [PDF Sound annotations](https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/PDF32000_2008.pdf) with:
- `/T` — author name
- `/M` — creation date
- `/IRT` + `/RT` — reply threading
- PCM audio in the Sound stream

## Tech stack

Single-page app, no build step, no backend:

- [pdf.js](https://mozilla.github.io/pdf.js/) — PDF rendering
- [pdf-lib](https://pdf-lib.js.org/) — PDF reading/writing
- [pako](https://github.com/nodeca/pako) — FlateDecode decompression
- ES modules — modular architecture, no bundler needed

## Architecture

```
index.html          — HTML shell
css/styles.css      — All styles
js/
  event-bus.js      — Pub/sub for inter-module communication
  state.js          — Centralized state + annotation helpers
  utils.js          — PDF helpers (PCM→WAV, stream decoding)
  author.js         — Author management (localStorage + modal)
  pdf-loader.js     — PDF loading + Sound annotation extraction
  recorder.js       — Mic capture, PCM conversion
  player.js         — Mini-player, threaded playback
  markers.js        — Canvas markers, drag, popovers
  sidebar.js        — Annotation list, inline edit, bulk edit
  exporter.js       — PDF export (in-place patching + new annotations)
  input-modal.js    — Reusable modal input component
```

## License

[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) — Free to use, share, and adapt for **non-commercial** purposes with attribution.

### Third-party licenses

| Library | License |
|---------|---------|
| [pdf.js](https://mozilla.github.io/pdf.js/) | Apache 2.0 |
| [pdf-lib](https://pdf-lib.js.org/) | MIT |
| [pako](https://github.com/nodeca/pako) | MIT / Zlib |
