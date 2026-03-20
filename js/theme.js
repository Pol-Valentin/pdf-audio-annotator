// Theme switcher: dark / light / system with localStorage persistence
const THEMES = ['system', 'dark', 'light'];
const STORAGE_KEY = 'paa-theme';

const toggle = document.getElementById('themeToggle');
let currentTheme = localStorage.getItem(STORAGE_KEY) || 'system';

export function initTheme() {
  applyTheme(currentTheme);

  toggle.addEventListener('click', () => {
    const idx = THEMES.indexOf(currentTheme);
    currentTheme = THEMES[(idx + 1) % THEMES.length];
    localStorage.setItem(STORAGE_KEY, currentTheme);
    applyTheme(currentTheme);
  });

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (currentTheme === 'system') applyTheme('system');
  });
}

function applyTheme(theme) {
  let resolved = theme;
  if (theme === 'system') {
    resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  document.documentElement.setAttribute('data-theme', resolved);
  // Also set the toggle icon indicator
  toggle.setAttribute('data-active', theme);

  // Update icon visibility via data attribute
  document.querySelectorAll('.theme-icon').forEach(el => el.style.display = 'none');
  const activeIcon = toggle.querySelector(`.theme-icon--${theme}`);
  if (activeIcon) activeIcon.style.display = 'block';
}
