// Author management: modal prompt, localStorage, header display, edit
import { state, getAuthor, setAuthor } from './state.js';
import { EventBus } from './event-bus.js';
import { showInputModal } from './input-modal.js';

const authorDisplay = document.getElementById('authorDisplay');
const authorName = document.getElementById('authorName');

export async function promptAuthor() {
  const current = getAuthor();
  const name = await showInputModal({
    title: 'Qui es-tu ?',
    label: 'Ton nom',
    placeholder: 'Ex: Marie, Pol...',
    value: current,
  });
  if (name !== null && name.trim()) {
    setAuthor(name.trim());
  }
  return getAuthor();
}

export async function ensureAuthor() {
  if (!getAuthor()) {
    await promptAuthor();
  }
  return getAuthor();
}

export function initAuthor() {
  EventBus.on('annotateMode:changed', async (active) => {
    authorDisplay.style.display = active ? 'flex' : 'none';
    if (active && !getAuthor()) {
      await promptAuthor();
    }
    updateAuthorDisplay();
  });

  EventBus.on('author:changed', updateAuthorDisplay);

  authorDisplay.addEventListener('click', () => {
    promptAuthor();
  });
}

function updateAuthorDisplay() {
  const name = getAuthor();
  authorName.textContent = name || 'Anonyme';
}
