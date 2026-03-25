/**
 * Shared theme CSS generator — works in both Node.js (server) and browser (frontend).
 *
 * Produces the full `:root { --dt-* }` CSS token block from an accent color and
 * theme mode. Uses `culori` for hex→OKLCH conversion; all other logic is pure math.
 *
 * This module has NO DOM dependency.
 */
import { converter, parse } from 'culori';

export type ThemeMode = 'light' | 'dark';

export interface ThemePreferences {
  accentColor: string;
  theme: ThemeMode;
}

const DEFAULT_ACCENT_COLOR = '#7c6ff7';

const toOklch = converter('oklch');

const SCALE: Array<[string, number, number]> = [
  ['50', 0.98, 0.005],
  ['100', 0.94, 0.01],
  ['150', 0.88, 0.015],
  ['200', 0.8, 0.02],
  ['300', 0.7, 0.025],
  ['400', 0.6, 0.03],
  ['500', 0.5, 0.04],
  ['600', 0.4, 0.03],
  ['700', 0.32, 0.025],
  ['800', 0.24, 0.03],
  ['850', 0.2, 0.035],
  ['900', 0.16, 0.04],
  ['950', 0.12, 0.05],
];

const STATUS_HUES = {
  danger: 25,
  success: 155,
  warning: 80,
  info: 250,
} as const;

export const DEFAULT_THEME_PREFERENCES: ThemePreferences = {
  accentColor: DEFAULT_ACCENT_COLOR,
  theme: 'dark',
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function wrapHue(value: number): number {
  const wrapped = value % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

function formatNumber(value: number): string {
  return value
    .toFixed(3)
    .replace(/\.0+$/, '')
    .replace(/(\.\d*?)0+$/, '$1');
}

function oklchValue(lightness: number, chroma: number, hue: number, alpha?: number): string {
  const base = `oklch(${formatNumber(clamp(lightness, 0, 1))} ${formatNumber(clamp(chroma, 0, 0.4))} ${formatNumber(wrapHue(hue))}`;
  return alpha === undefined ? `${base})` : `${base} / ${formatNumber(clamp(alpha, 0, 1))})`;
}

function normalizeMode(value: string | undefined): ThemeMode {
  return value === 'dark' ? 'dark' : 'light';
}

function getAccentOklch(accentColor: string): { l: number; c: number; h: number } {
  const parsed = parse(accentColor) ?? parse(DEFAULT_ACCENT_COLOR);
  const converted = parsed ? toOklch(parsed) : null;

  if (!converted) {
    return { l: 0.623, c: 0.234, h: 286 };
  }

  return {
    l: clamp(converted.l ?? 0.623, 0, 1),
    c: clamp(converted.c ?? 0.234, 0, 0.37),
    h: wrapHue(converted.h ?? 286),
  };
}

/**
 * Generate the full `:root { --dt-* }` CSS text for the given theme preferences.
 *
 * This is the single source of truth for the DeskTalk color system.
 */
export function generateThemeCSS(preferences: ThemePreferences): string {
  const mode = normalizeMode(preferences.theme);
  const dark = mode === 'dark';
  const { l, c, h } = getAccentOklch(preferences.accentColor);
  const lines: string[] = [];
  const put = (name: string, value: string | number) => {
    lines.push(`  ${name}: ${value};`);
  };
  const scaleVar = (name: string) => `var(--dt-scale-${name})`;

  put('--dt-accent-h', formatNumber(h));
  put('--dt-accent-c', formatNumber(c));
  put('--dt-accent-l', formatNumber(l));
  put('--dt-mode-sign', dark ? '1' : '-1');

  for (const [name, lightness, chroma] of SCALE) {
    put(`--dt-scale-${name}`, oklchValue(lightness, chroma, h));
  }

  put('--dt-bg', dark ? scaleVar('950') : scaleVar('50'));
  put('--dt-bg-subtle', dark ? scaleVar('900') : scaleVar('100'));
  put('--dt-surface', dark ? scaleVar('850') : scaleVar('100'));
  put('--dt-surface-hover', dark ? scaleVar('800') : scaleVar('150'));
  put('--dt-surface-active', dark ? scaleVar('700') : scaleVar('200'));
  put('--dt-overlay', dark ? oklchValue(0.16, 0.04, h, 0.85) : oklchValue(0.98, 0.005, h, 0.85));

  put('--dt-text', dark ? scaleVar('50') : scaleVar('950'));
  put('--dt-text-secondary', dark ? scaleVar('300') : scaleVar('600'));
  put('--dt-text-muted', dark ? scaleVar('400') : scaleVar('500'));

  put('--dt-border', dark ? scaleVar('800') : scaleVar('200'));
  put(
    '--dt-border-subtle',
    dark ? oklchValue(0.2, 0.035, h, 0.6) : oklchValue(0.88, 0.015, h, 0.6),
  );
  put('--dt-border-strong', dark ? scaleVar('700') : scaleVar('300'));

  const accentHoverShift = dark ? 0.05 : -0.05;
  const accentActiveShift = dark ? 0.1 : -0.1;
  put('--dt-accent', oklchValue(l, c, h));
  put('--dt-accent-hover', oklchValue(l + accentHoverShift, c, h));
  put('--dt-accent-active', oklchValue(l + accentActiveShift, c, h));
  put('--dt-accent-subtle', oklchValue(l, c, h, 0.15));
  put('--dt-accent-ghost', oklchValue(l, c, h, 0.08));
  put('--dt-text-on-accent', l > 0.6 ? scaleVar('950') : scaleVar('50'));

  for (const [name, hue] of Object.entries(STATUS_HUES)) {
    const lightness = dark ? 0.7 : 0.45;
    put(`--dt-${name}`, oklchValue(lightness, 0.18, hue));
    put(`--dt-${name}-subtle`, oklchValue(lightness, 0.18, hue, 0.15));
  }

  put('--dt-dock-bg', 'var(--dt-overlay)');
  put('--dt-actions-bar-bg', 'var(--dt-bg-subtle)');
  put('--dt-window-chrome', 'var(--dt-surface)');
  put('--dt-window-body', 'var(--dt-bg)');
  put('--dt-info-panel-bg', 'var(--dt-bg-subtle)');
  put(
    '--dt-wallpaper',
    dark
      ? `linear-gradient(135deg, ${oklchValue(0.25, 0.08, h)} 0%, ${oklchValue(0.3, 0.1, h)} 50%, ${oklchValue(0.4, 0.04, h + 30)} 100%)`
      : `linear-gradient(135deg, ${oklchValue(0.85, 0.06, h)} 0%, ${oklchValue(0.8, 0.08, h)} 50%, ${oklchValue(0.75, 0.03, h + 30)} 100%)`,
  );

  put('--dt-glass', dark ? oklchValue(0.2, 0.035, h, 0.7) : oklchValue(0.94, 0.01, h, 0.7));
  put(
    '--dt-glass-border',
    dark ? oklchValue(0.98, 0.005, h, 0.1) : oklchValue(0.12, 0.05, h, 0.12),
  );
  put(
    '--dt-glass-highlight',
    dark ? oklchValue(0.98, 0.005, h, 0.05) : oklchValue(0.98, 0.005, h, 0.45),
  );
  put('--dt-shadow-color', dark ? oklchValue(0.12, 0.05, h, 0.4) : oklchValue(0.12, 0.05, h, 0.15));

  // Font variables
  put('--font-display', "'Sora', system-ui, -apple-system, sans-serif");
  put('--font-ui', "'Work Sans', system-ui, -apple-system, sans-serif");
  put('--font-mono', "'SF Mono', 'Fira Code', 'Fira Mono', Menlo, Consolas, monospace");

  return `:root {\n${lines.join('\n')}\n}`;
}

/**
 * Base stylesheet for AI-generated HTML.
 *
 * Provides sensible defaults for body, headings, tables, cards, buttons, and
 * code blocks — all using semantic `--dt-*` tokens. This ensures generated HTML
 * looks native to DeskTalk without the AI needing to emit its own reset/base styles.
 */
/**
 * Font face definitions for self-hosted Google Fonts.
 * Include this in your HTML <head> before theme CSS.
 */
export const FONT_FACES_CSS = `
/* Sora - Display font for headings and decorative numbers */
@font-face {
  font-family: 'Sora';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('sora-400.ttf') format('truetype');
}
@font-face {
  font-family: 'Sora';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('sora-500.ttf') format('truetype');
}
@font-face {
  font-family: 'Sora';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url('sora-600.ttf') format('truetype');
}
@font-face {
  font-family: 'Sora';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('sora-700.ttf') format('truetype');
}

/* Work Sans - UI font for body text and buttons */
@font-face {
  font-family: 'Work Sans';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('work-sans-400.ttf') format('truetype');
}
@font-face {
  font-family: 'Work Sans';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('work-sans-500.ttf') format('truetype');
}
@font-face {
  font-family: 'Work Sans';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url('work-sans-600.ttf') format('truetype');
}
@font-face {
  font-family: 'Work Sans';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('work-sans-700.ttf') format('truetype');
}
`.trim();

/**
 * CSS variables for font families.
 */
export const FONT_VARIABLES_CSS = `
:root {
  --font-display: 'Sora', system-ui, -apple-system, sans-serif;
  --font-ui: 'Work Sans', system-ui, -apple-system, sans-serif;
  --font-mono: 'SF Mono', 'Fira Code', 'Fira Mono', Menlo, Consolas, monospace;
}
`.trim();

/**
 * Base stylesheet for AI-generated HTML.
 *
 * Provides sensible defaults for body, headings, tables, cards, buttons, and
 * code blocks — all using semantic `--dt-*` tokens. This ensures generated HTML
 * looks native to DeskTalk without the AI needing to emit its own reset/base styles.
 */
export const HTML_BASE_STYLESHEET = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: var(--font-ui, 'Work Sans'), system-ui, -apple-system, sans-serif;
  background: var(--dt-bg);
  color: var(--dt-text);
  line-height: 1.5;
  padding: 16px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-display, 'Sora'), system-ui, -apple-system, sans-serif !important;
  color: var(--dt-text) !important;
  line-height: 1.2 !important;
  margin-top: 0 !important;
  margin-bottom: 0.5em !important;
  font-style: normal !important;
  text-transform: none !important;
  letter-spacing: -0.02em !important;
}
h1 { font-size: 1.5rem !important; font-weight: 500 !important; letter-spacing: -0.03em !important; }
h2 { font-size: 1.25rem !important; font-weight: 500 !important; letter-spacing: -0.02em !important; }
h3 { font-size: 1.125rem !important; font-weight: 500 !important; }
h4 { font-size: 1rem !important; font-weight: 500 !important; }
h5 { font-size: 0.875rem !important; font-weight: 500 !important; }
h6 { font-size: 0.75rem !important; font-weight: 600 !important; text-transform: uppercase !important; letter-spacing: 0.1em !important; }
p {
  font-family: var(--font-ui, 'Work Sans'), system-ui, -apple-system, sans-serif !important;
  font-size: 0.9375rem !important;
  font-weight: 400 !important;
  line-height: 1.5 !important;
  color: var(--dt-text-secondary) !important;
  margin-top: 0 !important;
  margin-bottom: 1em !important;
}
a { color: var(--dt-accent); text-decoration: none; font-weight: 500; }
a:hover { color: var(--dt-accent-hover); text-decoration: none; }
hr {
  border: none;
  border-top: 1px solid var(--dt-border);
  margin: 1.25em 0;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1em;
  font-size: 0.875rem;
}
th, td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid var(--dt-border);
}
th {
  background: var(--dt-surface);
  color: var(--dt-text);
  font-weight: 500;
  font-size: 0.8125rem;
  letter-spacing: 0.01em;
}
tr:hover td { background: var(--dt-surface-hover); }
code {
  font-family: 'SF Mono', 'Fira Code', 'Fira Mono', Menlo, Consolas, monospace;
  background: var(--dt-surface);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.8125em;
  font-weight: 400;
}
pre {
  background: var(--dt-surface);
  border: 1px solid var(--dt-border);
  border-radius: 6px;
  padding: 14px;
  overflow-x: auto;
  margin-bottom: 1em;
  font-size: 0.8125rem;
}
pre code { background: none; padding: 0; }
.text-muted { color: var(--dt-text-muted); }
.text-secondary { color: var(--dt-text-secondary); }
.accent-bg { background: var(--dt-accent-subtle); }
input[type="text"], input[type="email"], input[type="password"], input[type="number"], input[type="search"], input[type="url"] {
  font-family: var(--font-mono, 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, monospace);
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  line-height: 1;
  color: var(--dt-text);
  background: var(--dt-surface);
  border: 1px solid var(--dt-accent);
  border-radius: 2px;
  padding: 6px 10px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
  transition: all 0.1s ease;
  position: relative;
}
input[type="text"]:hover, input[type="email"]:hover, input[type="password"]:hover, input[type="number"]:hover, input[type="search"]:hover, input[type="url"]:hover {
  background: var(--dt-accent);
  color: var(--dt-text-on-accent);
}
input[type="text"]:focus, input[type="email"]:focus, input[type="password"]:focus, input[type="number"]:focus, input[type="search"]:focus, input[type="url"]:focus {
  background: var(--dt-accent);
  color: var(--dt-text-on-accent);
}
input[type="text"]:disabled, input[type="email"]:disabled, input[type="password"]:disabled, input[type="number"]:disabled, input[type="search"]:disabled, input[type="url"]:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}
input[type="text"]::placeholder, input[type="email"]::placeholder, input[type="password"]::placeholder, input[type="number"]::placeholder, input[type="search"]::placeholder, input[type="url"]::placeholder {
  color: var(--dt-text-muted);
  font-weight: 600;
  letter-spacing: 0.04em;
}
`.trim();
