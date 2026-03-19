// Author management: prompt, localStorage, header display, edit
import { state, getAuthor, setAuthor } from './state.js';
import { EventBus } from './event-bus.js';

const authorDisplay = document.getElementById('authorDisplay');
const authorName = document.getElementById('authorName');

export function promptAuthor() {
  const current = getAuthor();
  const name = prompt('Ton nom ?', current);
  if (name !== null && name.trim()) {
    setAuthor(name.trim());
  }
  return getAuthor();
}

export function ensureAuthor() {
  if (!getAuthor()) {
    promptAuthor();
  }
  return getAuthor();
}

export function initAuthor() {
  // Show/hide author display based on annotate mode
  EventBus.on('annotateMode:changed', (active) => {
    authorDisplay.style.display = active ? 'flex' : 'none';
    if (active && !getAuthor()) {
      promptAuthor();
    }
    updateAuthorDisplay();
  });

  EventBus.on('author:changed', updateAuthorDisplay);

  // Click on author name to edit
  authorDisplay.addEventListener('click', () => {
    promptAuthor();
  });
}

function updateAuthorDisplay() {
  const name = getAuthor();
  authorName.textContent = name || 'Anonyme';
}
