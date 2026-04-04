import selectMenuCss from './styles/select-menu.css?raw';
import selectTriggerCss from './styles/select-trigger.css?raw';

const TRIGGER_CLS = 'dt-select-trigger';
const LABEL_CLS = 'dt-select-label';
const CHEVRON_CLS = 'dt-select-chevron';
const MENU_CLS = 'dt-select-menu';
const OPTION_CLS = 'dt-select-option';
const OPTION_ACTIVE_CLS = 'dt-select-option--active';

/** Shape of an option passed via the `options` property. */
export interface DtSelectOption {
  value: string;
  label: string;
}

/** Ensure the shared global menu stylesheet is injected exactly once. */
let menuStyleInjected = false;
function ensureMenuStyles(): void {
  if (menuStyleInjected) return;
  const style = document.createElement('style');
  style.setAttribute('data-dt-select', '');
  style.textContent = selectMenuCss;
  document.head.appendChild(style);
  menuStyleInjected = true;
}

export type DtSelectAlign = 'left' | 'right';

/**
 * `<dt-select>` — framework-agnostic select/dropdown web component.
 *
 * Uses Shadow DOM for the trigger button and appends the dropdown menu to
 * `document.body` so it can escape overflow/clip ancestors.
 *
 * ## Attributes
 * - `value`       — the currently selected option value
 * - `placeholder` — text shown when no value is selected (default "Select...")
 * - `disabled`    — when present, interaction is suppressed
 * - `align`       — horizontal alignment of the popup relative to the trigger:
 *                   "left" (default) or "right"
 *
 * ## Properties
 * - `options`     — `Array<{ value: string; label: string }>` set via JS
 *
 * ## Events
 * - `dt-change`   — fired when the user selects an option; `detail.value` is
 *                   the selected value
 *
 * ## Usage
 * ```html
 * <dt-select placeholder="Choose session" value="s1" align="right"></dt-select>
 * <script>
 *   const sel = document.querySelector('dt-select');
 *   sel.options = [
 *     { value: 's1', label: 'Session 1' },
 *     { value: 's2', label: 'Session 2' },
 *   ];
 *   sel.addEventListener('dt-change', (e) => console.log(e.detail.value));
 * </script>
 * ```
 */
export class DtSelect extends HTMLElement {
  // ── Private state ───────────────────────────────────────────────────────
  private _menu: HTMLDivElement | null = null;
  private _trigger: HTMLButtonElement | null = null;
  private _options: DtSelectOption[] = [];
  private _open = false;
  private _menuId = '';

  // ── Observed attributes ─────────────────────────────────────────────────
  static get observedAttributes(): string[] {
    return ['value', 'placeholder', 'disabled', 'align'];
  }

  // ── Attribute helpers ───────────────────────────────────────────────────

  get value(): string {
    return this.getAttribute('value') ?? '';
  }
  set value(val: string) {
    this.setAttribute('value', val);
  }

  get placeholder(): string {
    return this.getAttribute('placeholder') ?? 'Select\u2026';
  }
  set placeholder(val: string) {
    this.setAttribute('placeholder', val);
  }

  get disabled(): boolean {
    return this.hasAttribute('disabled');
  }
  set disabled(val: boolean) {
    if (val) {
      this.setAttribute('disabled', '');
    } else {
      this.removeAttribute('disabled');
    }
  }

  get align(): DtSelectAlign {
    const val = this.getAttribute('align');
    if (val === 'right') return 'right';
    return 'left';
  }
  set align(val: DtSelectAlign) {
    this.setAttribute('align', val);
  }

  // ── Options property (JS-only, not reflected as attribute) ──────────────

  get options(): DtSelectOption[] {
    return this._options;
  }
  set options(val: DtSelectOption[]) {
    this._options = val;
    this._updateLabel();
    if (this._open) {
      this._renderMenuItems();
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = selectTriggerCss;
    shadow.appendChild(style);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = TRIGGER_CLS;
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');

    const label = document.createElement('span');
    label.className = LABEL_CLS;
    btn.appendChild(label);

    const chevron = document.createElement('span');
    chevron.className = CHEVRON_CLS;
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '\u25BE'; // ▾ small down-pointing triangle
    btn.appendChild(chevron);

    shadow.appendChild(btn);

    this._trigger = btn;
    this._menuId = `dt-sel-${Math.random().toString(36).slice(2, 9)}`;
  }

  connectedCallback(): void {
    ensureMenuStyles();
    this._trigger!.addEventListener('click', this._onTriggerClick);
    this._updateLabel();
  }

  disconnectedCallback(): void {
    this._trigger!.removeEventListener('click', this._onTriggerClick);
    this._close();
  }

  attributeChangedCallback(name: string): void {
    if (name === 'value') {
      this._updateLabel();
      if (this._open) {
        this._renderMenuItems();
      }
    }
    if (name === 'placeholder' && !this.value) {
      this._updateLabel();
    }
    if (name === 'disabled' && this.disabled) {
      this._close();
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private _updateLabel(): void {
    const labelEl = this._trigger!.querySelector(`.${LABEL_CLS}`) as HTMLSpanElement;
    const selected = this._options.find((o) => o.value === this.value);
    labelEl.textContent = selected?.label ?? this.placeholder;
  }

  // ── Toggle / open / close ───────────────────────────────────────────────

  private _onTriggerClick = (): void => {
    if (this.disabled) return;
    if (this._open) {
      this._close();
    } else {
      this._openMenu();
    }
  };

  private _openMenu(): void {
    if (this._open) return;

    const menu = document.createElement('div');
    menu.className = MENU_CLS;
    menu.id = this._menuId;
    menu.setAttribute('role', 'listbox');
    document.body.appendChild(menu);
    this._menu = menu;

    this._renderMenuItems();
    this._position();

    // Show after a microtask so the transition plays
    requestAnimationFrame(() => {
      menu.setAttribute('data-open', '');
    });

    this._open = true;
    this._trigger!.setAttribute('aria-expanded', 'true');

    // Close on outside click (next tick to avoid the current click)
    requestAnimationFrame(() => {
      document.addEventListener('mousedown', this._onOutsideClick);
      document.addEventListener('keydown', this._onKeyDown);
      window.addEventListener('blur', this._onWindowBlur);
    });
  }

  private _close(): void {
    if (!this._open) return;

    document.removeEventListener('mousedown', this._onOutsideClick);
    document.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('blur', this._onWindowBlur);

    if (this._menu) {
      this._menu.removeAttribute('data-open');
      // Remove after the fade-out transition
      const menu = this._menu;
      setTimeout(() => menu.remove(), 140);
      this._menu = null;
    }

    this._open = false;
    this._trigger!.setAttribute('aria-expanded', 'false');
  }

  private _onOutsideClick = (e: MouseEvent): void => {
    const target = e.target as Node;
    // Click inside the menu or on the trigger — ignore
    if (this._menu?.contains(target) || this.contains(target)) return;
    this._close();
  };

  private _onWindowBlur = (): void => {
    requestAnimationFrame(() => {
      if (document.activeElement?.tagName === 'IFRAME') {
        this._close();
      }
    });
  };

  private _onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      this._close();
      this._trigger!.focus();
    }
  };

  // ── Menu rendering ──────────────────────────────────────────────────────

  private _renderMenuItems(): void {
    const menu = this._menu;
    if (!menu) return;

    menu.innerHTML = '';

    for (const opt of this._options) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = OPTION_CLS;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(opt.value === this.value));

      if (opt.value === this.value) {
        item.classList.add(OPTION_ACTIVE_CLS);
      }

      const label = document.createElement('span');
      label.textContent = opt.label;
      item.appendChild(label);

      item.addEventListener('click', () => {
        this._selectValue(opt.value);
      });

      menu.appendChild(item);
    }
  }

  private _selectValue(val: string): void {
    const prev = this.value;
    this.value = val;
    this._updateLabel();
    this._close();

    if (val !== prev) {
      this.dispatchEvent(
        new CustomEvent('dt-change', {
          detail: { value: val },
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  // ── Positioning ─────────────────────────────────────────────────────────

  private _position(): void {
    const menu = this._menu;
    if (!menu) return;

    const triggerRect = this.getBoundingClientRect();
    const gap = 10;
    const minW = Math.max(triggerRect.width, 240);

    // Place below the trigger by default
    let top = triggerRect.bottom + gap;

    // If the menu would overflow the viewport bottom, flip above
    const menuHeight = menu.scrollHeight || 260;
    const vh = window.innerHeight;
    if (top + menuHeight > vh && triggerRect.top - menuHeight - gap > 0) {
      top = triggerRect.top - menuHeight - gap;
    }

    menu.style.minWidth = `${minW}px`;

    // Horizontal alignment
    if (this.align === 'right') {
      // Anchor the menu's right edge to the trigger's right edge
      const vw = window.innerWidth;
      menu.style.right = `${vw - triggerRect.right}px`;
      menu.style.left = 'auto';
    } else {
      menu.style.left = `${triggerRect.left}px`;
      menu.style.right = 'auto';
    }

    menu.style.top = `${top}px`;
  }
}
