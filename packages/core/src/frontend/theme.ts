import { converter, parse } from 'culori';

export type ThemeMode = 'light' | 'dark';

export interface ThemePreferences {
  accentColor: string;
  theme: ThemeMode;
}

const DEFAULT_ACCENT_COLOR = '#7c6ff7';
const DEFAULT_THEME_MODE: ThemeMode = 'light';
const THEME_STYLE_ID = 'dt-theme';
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
  theme: DEFAULT_THEME_MODE,
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

function ensureThemeStyleElement(): HTMLStyleElement {
  let styleEl = document.getElementById(THEME_STYLE_ID) as HTMLStyleElement | null;

  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = THEME_STYLE_ID;
    document.head.appendChild(styleEl);
  }

  return styleEl;
}

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

  return `:root {\n${lines.join('\n')}\n}`;
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
