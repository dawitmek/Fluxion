import type { UiTheme, UiThemeStyle } from '@fluxion/shared';

// The account's theme on the dashboard and login pages (see @fluxion/theme's themes.css). It's also remembered in
// this browser, so the login page and the first paint of the dashboard already have it before the account loads.
// The public site and the overlays keep their own look.

const KEY = 'fluxion-theme';
type Choice = { theme: UiTheme; style: UiThemeStyle };

export function applyTheme(choice: Choice | null) {
  const root = document.documentElement;
  if (!choice || choice.theme === 'default') delete root.dataset.theme;
  else root.dataset.theme = choice.theme;
  if (choice?.style === 'full') root.dataset.themeStyle = 'full';
  else delete root.dataset.themeStyle;
}

export function rememberTheme(choice: Choice) {
  applyTheme(choice);
  try {
    localStorage.setItem(KEY, JSON.stringify(choice));
  } catch {
    // Storage can be off; the account's theme still applies once it loads.
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

// Pages that take the account's theme.
export const themedPath = (path: string) => path.startsWith('/dashboard') || path === '/login' || path === '/signup';
