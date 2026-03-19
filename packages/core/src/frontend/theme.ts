/**
 * Frontend theme module — thin wrapper around the shared theme-css generator.
 *
 * Re-exports the shared types and `generateThemeCSS` for callers that already
 * import from this path, and adds the DOM-specific `applyTheme()` function.
 */
export { generateThemeCSS, DEFAULT_THEME_PREFERENCES } from '../services/theme-css';
export type { ThemeMode, ThemePreferences } from '../services/theme-css';

import { generateThemeCSS } from '../services/theme-css';
import type { ThemeMode, ThemePreferences } from '../services/theme-css';

const THEME_STYLE_ID = 'dt-theme';

function normalizeMode(value: string | undefined): ThemeMode {
  return value === 'dark' ? 'dark' : 'light';
}

function ensureThemeStyleElement(): HTMLStyleElement {
  let styleEl = document.getElementById(THEME_STYLE_ID) as HTMLStyleElement | null;

  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = THEME_STYLE_ID;
    document.head.appendChild(styleEl);
  }

  return styleEl;
}

export function applyTheme(preferences: ThemePreferences): void {
  const mode = normalizeMode(preferences.theme);
  const styleEl = ensureThemeStyleElement();
  if (styleEl.parentElement === document.head && styleEl !== document.head.lastElementChild) {
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = generateThemeCSS({
    accentColor: preferences.accentColor,
    theme: mode,
  });
  document.documentElement.dataset.theme = mode;
}
