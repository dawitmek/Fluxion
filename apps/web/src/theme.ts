import type { UiMode, UiTheme, UiThemeStyle } from '@fluxion/shared';

// The account's look on the dashboard and login pages (see @fluxion/theme's themes.css): its theme, and light or
// dark mode. It's also remembered in this browser, so the login page and the first paint of the dashboard already
// have it before the account loads (index.html applies it before anything shows). Other pages, the public site and
// the overlays, keep their own look and follow the system's light or dark.

const KEY = 'fluxion-theme';
type Choice = { theme: UiTheme; style: UiThemeStyle; mode: UiMode };

const systemDark = matchMedia('(prefers-color-scheme: dark)');
let mode: UiMode = 'system';
const applyMode = () => {
  document.documentElement.dataset.mode = mode === 'dark' || (mode === 'system' && systemDark.matches) ? 'dark' : 'light';
};
// Following the system: switch when it does.
systemDark.addEventListener('change', applyMode);

export function applyTheme(choice: Choice | null) {
  const root = document.documentElement;
  if (!choice || choice.theme === 'default') delete root.dataset.theme;
  else root.dataset.theme = choice.theme;
  if (choice?.style === 'full') root.dataset.themeStyle = 'full';
  else delete root.dataset.themeStyle;
  mode = choice?.mode ?? 'system';
  applyMode();
}

export function rememberTheme(choice: Choice) {
  applyTheme(choice);
  try {
    localStorage.setItem(KEY, JSON.stringify(choice));
  } catch {
    // Storage can be off; the account's look still applies once it loads.
  }
}

export function rememberedTheme(): Choice | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Choice | null;
    return saved && typeof saved.theme === 'string' ? saved : null;
  } catch {
    return null;
  }
}

// Pages that take the account's look. index.html has the same test.
export const themedPath = (path: string) => path.startsWith('/dashboard') || path === '/login' || path === '/signup';
