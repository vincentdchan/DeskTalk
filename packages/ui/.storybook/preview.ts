import type { Preview } from '@storybook/web-components-vite';

import { generateThemeCSS, type ThemeMode } from '../../core/src/services/theme-css';
import '../src/index';

const THEME_STYLE_ID = 'dt-storybook-theme';
const PREVIEW_STYLE_ID = 'dt-storybook-preview';

function ensureStyleTag(id: string): HTMLStyleElement {
  const existing = document.getElementById(id);
  if (existing instanceof HTMLStyleElement) {
    return existing;
  }

  const style = document.createElement('style');
  style.id = id;
  document.head.appendChild(style);
  return style;
}

function applyDeskTalkTheme(mode: ThemeMode, accentColor: string): void {
  ensureStyleTag(THEME_STYLE_ID).textContent = generateThemeCSS({ theme: mode, accentColor });
  ensureStyleTag(PREVIEW_STYLE_ID).textContent = `
    :root {
      --font-sans: "Avenir Next", "Segoe UI", sans-serif;
      --font-mono: "IBM Plex Mono", "SF Mono", "Cascadia Code", monospace;
    }

    html, body {
      min-height: 100%;
    }

    body {
      margin: 0;
      background: var(--dt-bg);
      color: var(--dt-text);
      font-family: var(--font-sans);
    }

    #storybook-root {
      min-height: 100vh;
    }

    .dt-sb-shell {
      min-height: 100vh;
      padding: clamp(24px, 4vw, 48px);
      background:
        radial-gradient(circle at top left, color-mix(in oklab, var(--dt-accent) 24%, transparent), transparent 32%),
        radial-gradient(circle at bottom right, color-mix(in oklab, var(--dt-info) 18%, transparent), transparent 28%),
        var(--dt-wallpaper);
      color: var(--dt-text);
      box-sizing: border-box;
    }

    .dt-sb-panel {
      max-width: 1040px;
      margin: 0 auto;
      padding: clamp(24px, 3vw, 36px);
      border: 1px solid var(--dt-glass-border);
      border-radius: 24px;
      background: color-mix(in oklab, var(--dt-glass) 88%, var(--dt-bg));
      box-shadow:
        0 24px 80px var(--dt-shadow-color),
        inset 0 1px 0 var(--dt-glass-highlight);
      backdrop-filter: blur(28px) saturate(135%);
    }

    .dt-sb-header {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 24px;
    }

    .dt-sb-kicker {
      margin: 0 0 8px;
      color: var(--dt-text-muted);
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }

    .dt-sb-title {
      margin: 0;
      color: var(--dt-text);
      font-size: clamp(1.6rem, 3vw, 2.4rem);
      line-height: 1;
    }

    .dt-sb-note {
      max-width: 34rem;
      margin: 0;
      color: var(--dt-text-secondary);
      font-size: 0.95rem;
      line-height: 1.6;
    }

    .dt-sb-meta {
      display: inline-flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .dt-sb-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border: 1px solid var(--dt-border-subtle);
      border-radius: 999px;
      background: color-mix(in oklab, var(--dt-surface) 82%, transparent);
      color: var(--dt-text-secondary);
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .dt-sb-pill strong {
      color: var(--dt-text);
      font-weight: 700;
    }

    .dt-sb-stage {
      min-height: 420px;
      padding: clamp(20px, 3vw, 32px);
      border: 1px solid color-mix(in oklab, var(--dt-accent) 12%, var(--dt-border));
      border-radius: 18px;
      background:
        linear-gradient(180deg, color-mix(in oklab, var(--dt-surface) 94%, transparent), color-mix(in oklab, var(--dt-bg) 92%, transparent)),
        radial-gradient(circle at top, color-mix(in oklab, var(--dt-accent) 10%, transparent), transparent 45%);
      box-shadow: inset 0 1px 0 color-mix(in oklab, var(--dt-glass-highlight) 90%, transparent);
      box-sizing: border-box;
    }

    @media (max-width: 720px) {
      .dt-sb-header {
        flex-direction: column;
        align-items: flex-start;
      }

      .dt-sb-meta {
        justify-content: flex-start;
      }
    }
  `;
}

function appendStoryResult(target: HTMLElement, storyResult: unknown): void {
  if (storyResult instanceof Node) {
    target.appendChild(storyResult);
    return;
  }

  if (typeof storyResult === 'string') {
    target.innerHTML = storyResult;
  }
}

const preview: Preview = {
  globalTypes: {
    theme: {
      name: 'Theme',
      description: 'DeskTalk theme mode',
      defaultValue: 'dark',
      toolbar: {
        icon: 'mirror',
        items: [
          { value: 'dark', title: 'Dark' },
          { value: 'light', title: 'Light' },
        ],
      },
    },
    accent: {
      name: 'Accent',
      description: 'DeskTalk accent color',
      defaultValue: '#7c6ff7',
      toolbar: {
        icon: 'paintbrush',
        items: [
          { value: '#7c6ff7', title: 'Violet' },
          { value: '#ff6b57', title: 'Ember' },
          { value: '#1aa7ec', title: 'Ocean' },
          { value: '#22b573', title: 'Fern' },
          { value: '#f2a93b', title: 'Amber' },
        ],
      },
    },
  },
  parameters: {
    layout: 'fullscreen',
    backgrounds: { disable: true },
    controls: { expanded: true },
    options: {
      storySort: {
        order: ['Components'],
      },
    },
  },
  decorators: [
    (story, context) => {
      const mode = context.globals.theme as ThemeMode;
      const accentColor = String(context.globals.accent ?? '#7c6ff7');

      applyDeskTalkTheme(mode, accentColor);

      const shell = document.createElement('div');
      shell.className = 'dt-sb-shell';

      const panel = document.createElement('div');
      panel.className = 'dt-sb-panel';
      shell.appendChild(panel);

      const header = document.createElement('header');
      header.className = 'dt-sb-header';
      panel.appendChild(header);

      const headerCopy = document.createElement('div');
      header.appendChild(headerCopy);

      const kicker = document.createElement('p');
      kicker.className = 'dt-sb-kicker';
      kicker.textContent = 'DeskTalk UI Lab';
      headerCopy.appendChild(kicker);

      const title = document.createElement('h1');
      title.className = 'dt-sb-title';
      title.textContent = context.title;
      headerCopy.appendChild(title);

      const note = document.createElement('p');
      note.className = 'dt-sb-note';
      note.textContent =
        'Tune web components against the same OKLCH token system used by the app shell.';
      headerCopy.appendChild(note);

      const meta = document.createElement('div');
      meta.className = 'dt-sb-meta';
      header.appendChild(meta);

      const modePill = document.createElement('span');
      modePill.className = 'dt-sb-pill';
      modePill.innerHTML = `mode <strong>${mode}</strong>`;
      meta.appendChild(modePill);

      const accentPill = document.createElement('span');
      accentPill.className = 'dt-sb-pill';
      accentPill.innerHTML = `accent <strong>${accentColor}</strong>`;
      meta.appendChild(accentPill);

      const stage = document.createElement('div');
      stage.className = 'dt-sb-stage';
      panel.appendChild(stage);

      appendStoryResult(stage, story());

      return shell;
    },
  ],
};

export default preview;
