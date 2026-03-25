import type { Meta, StoryObj } from '@storybook/web-components-vite';

import {
  DEFAULT_THEME_PREFERENCES,
  generateThemeCSS,
  FONT_FACES_CSS,
  FONT_VARIABLES_CSS,
  HTML_BASE_STYLESHEET,
} from '../theme-css';
import '../index';

const meta: Meta = {
  title: 'Stores/All Components',
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

// ── Theme Application ───────────────────────────────────────────────────────

const THEME_STYLE_ID = 'dt-stores-theme';
const BASE_STYLE_ID = 'dt-stores-base';
const FONTS_STYLE_ID = 'dt-stores-fonts';

function ensureStyleTag(id: string): HTMLStyleElement {
  let style = document.getElementById(id) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = id;
    document.head.appendChild(style);
  }
  return style;
}

function applyTheme(): void {
  // Inject font faces (from local font files)
  ensureStyleTag(FONTS_STYLE_ID).textContent = FONT_FACES_CSS + '\n' + FONT_VARIABLES_CSS;

  // Inject base HTML stylesheet (h1-h3, typography, etc.)
  ensureStyleTag(BASE_STYLE_ID).textContent = HTML_BASE_STYLESHEET;

  // Inject theme colors
  ensureStyleTag(THEME_STYLE_ID).textContent = generateThemeCSS(DEFAULT_THEME_PREFERENCES);
  document.documentElement.dataset.theme = DEFAULT_THEME_PREFERENCES.theme;
}

// ── Story Template ──────────────────────────────────────────────────────────

export const AllComponents: StoryObj = {
  render: () => {
    applyTheme();

    const container = document.createElement('div');
    container.style.cssText = `
      min-height: 100vh;
      padding: 48px 24px;
      background: var(--dt-bg);
      color: var(--dt-text);
      font-family: var(--font-ui), 'Work Sans', system-ui, sans-serif;
    `;

    container.innerHTML = `
      <style>
        /* Use h1-h3 styles from theme-css.ts for modern tech look */
        h2 { border-bottom: 1px solid var(--dt-border); padding-bottom: 12px; }
        .section { margin-bottom: 32px; }
        .component-row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin: 16px 0; }
        .component-grid { display: grid; gap: 16px; margin: 16px 0; }
        .component-grid.cols-2 { grid-template-columns: repeat(2, 1fr); }
        .component-grid.cols-3 { grid-template-columns: repeat(3, 1fr); }
        .component-grid.cols-4 { grid-template-columns: repeat(4, 1fr); }
        .card-content { padding: 16px; }
        .card-content h4 { margin: 0 0 8px 0; font-size: 1rem; font-weight: 500; color: var(--dt-text); }
        .card-content p { margin: 0; color: var(--dt-text-secondary); font-size: 0.875rem; }
      </style>

      <!-- H1: Page Title -->
      <h1>DeskTalk UI Components</h1>
      <p style="color: var(--dt-text-secondary); margin-bottom: 48px;">
        A comprehensive showcase of all available components using the DeskTalk design system.
      </p>

      <!-- H2: Buttons Section -->
      <h2>Buttons</h2>
      
      <h3>Button Variants</h3>
      <div class="section">
        <div class="component-row">
          <dt-button>Primary</dt-button>
          <dt-button variant="secondary">Secondary</dt-button>
          <dt-button variant="ghost">Ghost</dt-button>
          <dt-button variant="danger">Danger</dt-button>
        </div>
      </div>

      <h3>Button Sizes</h3>
      <div class="section">
        <div class="component-row">
          <dt-button size="sm">Small</dt-button>
          <dt-button size="md">Medium</dt-button>
          <dt-button size="lg">Large</dt-button>
        </div>
      </div>

      <h3>Button States</h3>
      <div class="section">
        <div class="component-row">
          <dt-button disabled>Disabled</dt-button>
          <dt-button fullwidth style="max-width: 300px;">Full Width</dt-button>
        </div>
      </div>

      <!-- H2: Badges Section -->
      <h2>Badges</h2>
      
      <h3>Badge Variants</h3>
      <div class="section">
        <div class="component-row">
          <dt-badge>Accent</dt-badge>
          <dt-badge variant="success">Success</dt-badge>
          <dt-badge variant="danger">Danger</dt-badge>
          <dt-badge variant="warning">Warning</dt-badge>
          <dt-badge variant="info">Info</dt-badge>
          <dt-badge variant="neutral">Neutral</dt-badge>
        </div>
      </div>

      <h3>Badge Sizes</h3>
      <div class="section">
        <div class="component-row">
          <dt-badge size="sm">Small</dt-badge>
          <dt-badge size="md">Medium</dt-badge>
          <dt-badge size="lg">Large</dt-badge>
        </div>
      </div>

      <!-- H2: Cards Section -->
      <h2>Cards</h2>
      
      <h3>Card Variants</h3>
      <div class="section">
        <div class="component-grid cols-3">
          <dt-card>
            <div class="card-content">
              <h4>Default Card</h4>
              <p>This is a default card with standard styling.</p>
            </div>
          </dt-card>
          <dt-card variant="outlined">
            <div class="card-content">
              <h4>Outlined Card</h4>
              <p>This card has an outlined appearance.</p>
            </div>
          </dt-card>
          <dt-card variant="filled">
            <div class="card-content">
              <h4>Filled Card</h4>
              <p>This card has a filled background.</p>
            </div>
          </dt-card>
        </div>
      </div>

      <!-- H2: Statistics Section -->
      <h2>Statistics</h2>
      
      <h3>Stat Displays</h3>
      <div class="section">
        <div class="component-grid cols-4">
          <dt-stat label="Users" value="12,345" description="Total registered users"></dt-stat>
          <dt-stat label="Revenue" value="$89.2k" description="Monthly revenue" trend="up" trend-value="+12%"></dt-stat>
          <dt-stat label="Bounce Rate" value="42%" description="Average bounce rate" trend="down" trend-value="-5%"></dt-stat>
          <dt-stat label="Uptime" value="99.9%" description="System availability"></dt-stat>
        </div>
      </div>

      <h3>Stat Variants</h3>
      <div class="section">
        <div class="component-grid cols-3">
          <dt-stat label="Default" value="1,234" size="md"></dt-stat>
          <dt-stat label="Outlined" value="5,678" variant="outlined" size="md"></dt-stat>
          <dt-stat label="Filled" value="9,012" variant="filled" size="md"></dt-stat>
        </div>
      </div>

      <!-- H2: Layout Components -->
      <h2>Layout Components</h2>
      
      <h3>Stack (Vertical)</h3>
      <div class="section">
        <dt-stack direction="column" gap="16">
          <dt-button>Item 1</dt-button>
          <dt-button>Item 2</dt-button>
          <dt-button>Item 3</dt-button>
        </dt-stack>
      </div>

      <h3>Stack (Horizontal)</h3>
      <div class="section">
        <dt-stack direction="row" gap="12">
          <dt-badge>Tag 1</dt-badge>
          <dt-badge variant="success">Tag 2</dt-badge>
          <dt-badge variant="info">Tag 3</dt-badge>
        </dt-stack>
      </div>

      <h3>Grid</h3>
      <div class="section">
        <dt-grid cols="3" gap="16">
          <dt-card><div class="card-content"><p>Grid Item 1</p></div></dt-card>
          <dt-card><div class="card-content"><p>Grid Item 2</p></div></dt-card>
          <dt-card><div class="card-content"><p>Grid Item 3</p></div></dt-card>
          <dt-card><div class="card-content"><p>Grid Item 4</p></div></dt-card>
          <dt-card><div class="card-content"><p>Grid Item 5</p></div></dt-card>
          <dt-card><div class="card-content"><p>Grid Item 6</p></div></dt-card>
        </dt-grid>
      </div>

      <!-- H2: Form Components -->
      <h2>Form Components</h2>
      
      <h3>Select Dropdown</h3>
      <div class="section">
        <div class="component-row">
          <dt-select placeholder="Choose an option...">
            <option value="">Select an option</option>
            <option value="1">Option 1</option>
            <option value="2">Option 2</option>
            <option value="3">Option 3</option>
          </dt-select>
        </div>
      </div>

      <h3>Text Input</h3>
      <div class="section">
        <div class="component-grid cols-3">
          <div>
            <label>Default</label>
            <input type="text" placeholder="Enter text..." />
          </div>
          <div>
            <label>With Value</label>
            <input type="text" value="Hello World" />
          </div>
          <div>
            <label>Disabled</label>
            <input type="text" disabled placeholder="Disabled input" />
          </div>
        </div>
      </div>

      <!-- H2: Content Display -->
      <h2>Content Display</h2>
      
      <h3>Dividers</h3>
      <div class="section">
        <p>Default Divider:</p>
        <dt-divider></dt-divider>
        <p>Strong Divider:</p>
        <dt-divider style-variant="strong"></dt-divider>
        <p>Subtle Divider:</p>
        <dt-divider style-variant="subtle"></dt-divider>
      </div>

      <h3>Markdown</h3>
      <div class="section">
        <dt-markdown>
# Hello World

This is a **markdown** example with:
- Bullet points
- *Italic* text
- \`inline code\`

> A blockquote for emphasis
        </dt-markdown>
      </div>

      <!-- H2: Data Display -->
      <h2>Data Display</h2>
      
      <h3>List View</h3>
      <div class="section">
        <dt-list-view style="max-height: 200px;">
          <div>Item 1</div>
          <div>Item 2</div>
          <div>Item 3</div>
          <div>Item 4</div>
          <div>Item 5</div>
        </dt-list-view>
      </div>

      <h3>Table View</h3>
      <div class="section">
        <dt-table-view>
          <dt-column field="name" header="Name"></dt-column>
          <dt-column field="role" header="Role"></dt-column>
          <dt-column field="status" header="Status"></dt-column>
        </dt-table-view>
        <script>
          // Add sample data to the table
          setTimeout(() => {
            const table = document.querySelector('dt-table-view');
            if (table) {
              table.items = [
                { name: 'Alice Johnson', role: 'Developer', status: 'Active' },
                { name: 'Bob Smith', role: 'Designer', status: 'Away' },
                { name: 'Carol White', role: 'Manager', status: 'Active' },
              ];
            }
          }, 100);
        </script>
      </div>

      <h3>Chart</h3>
      <div class="section">
        <dt-chart type="bar" labels="Jan,Feb,Mar,Apr,May" style="height: 300px;">
          <dt-dataset label="Sales" values="12,19,3,5,2" color="#7c6ff7"></dt-dataset>
          <dt-dataset label="Revenue" values="8,15,7,11,4" color="#22b573"></dt-dataset>
        </dt-chart>
      </div>

      <!-- H2: Interactive Components -->
      <h2>Interactive Components</h2>
      
      <h3>Tooltip</h3>
      <div class="section">
        <div class="component-row">
          <dt-tooltip content="This is a tooltip!" placement="top">
            <dt-button>Hover me (Top)</dt-button>
          </dt-tooltip>
          <dt-tooltip content="Another tooltip" placement="bottom">
            <dt-button variant="secondary">Hover me (Bottom)</dt-button>
          </dt-tooltip>
        </div>
      </div>

      <!-- H2: Component Combinations -->
      <h2>Component Combinations</h2>
      
      <h3>Card with Badge and Button</h3>
      <div class="section">
        <dt-card style="max-width: 400px;">
          <div class="card-content">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <h4 style="margin: 0;">Feature Card</h4>
              <dt-badge variant="success" size="sm">New</dt-badge>
            </div>
            <p>This card combines multiple components: badge, button, and card.</p>
            <dt-stack direction="row" gap="8" style="margin-top: 16px;">
              <dt-button size="sm">Learn More</dt-button>
              <dt-button variant="ghost" size="sm">Dismiss</dt-button>
            </dt-stack>
          </div>
        </dt-card>
      </div>

      <h3>Stat Grid with Cards</h3>
      <div class="section">
        <dt-grid cols="2" gap="16">
          <dt-card variant="filled">
            <dt-stat label="Performance" value="92%" trend="up" trend-value="+5%" size="lg"></dt-stat>
          </dt-card>
          <dt-card variant="filled">
            <dt-stat label="Errors" value="3" trend="down" trend-value="-2" size="lg"></dt-stat>
          </dt-card>
        </dt-grid>
      </div>

      <div style="margin-top: 64px; padding-top: 24px; border-top: 1px solid var(--dt-border); color: var(--dt-text-muted); text-align: center;">
        <p>End of Component Showcase</p>
        <p style="font-size: 0.875rem;">All components styled with DeskTalk theme system</p>
      </div>
    `;

    return container;
  },
};
