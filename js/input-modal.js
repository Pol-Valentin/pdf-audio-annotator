// Reusable input modal — replaces prompt() everywhere
const overlay = document.getElementById('inputModal');
const titleEl = document.getElementById('inputModalTitle');
const labelEl = document.getElementById('inputModalLabel');
const inputEl = document.getElementById('inputModalInput');
const okBtn = document.getElementById('inputModalOk');
const cancelBtn = document.getElementById('inputModalCancel');
const closeBtn = document.getElementById('inputModalClose');

let resolvePromise = null;

function close(value) {
  overlay.classList.remove('visible');
  if (resolvePromise) {
    resolvePromise(value);
    resolvePromise = null;
  }
}

okBtn.addEventListener('click', () => close(inputEl.value.trim()));
cancelBtn.addEventListener('click', () => close(null));
closeBtn.addEventListener('click', () => close(null));
overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
inputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); close(inputEl.value.trim()); }
  if (e.key === 'Escape') close(null);
});

/**
 * Show a modal input dialog. Returns a promise that resolves to
 * the entered string, or null if cancelled.
 */
export function showInputModal({ title = '', label = '', placeholder = '', value = '' } = {}) {
  titleEl.textContent = title;
  labelEl.textContent = label;
  inputEl.placeholder = placeholder;
  inputEl.value = value;
  overlay.classList.add('visible');
  inputEl.focus();
  inputEl.select();

  return new Promise(resolve => {
    resolvePromise = resolve;
  });
}
