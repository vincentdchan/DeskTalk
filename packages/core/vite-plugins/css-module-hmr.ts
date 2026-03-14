/**
 * CSS module HMR fix plugin.
 *
 * Vite's built-in CSS modules transform does NOT add `import.meta.hot.accept()`
 * because exported class-name mappings may change.  Instead the HMR update
 * propagates to the importing React component via React Fast Refresh.  However,
 * Fast Refresh re-renders the component *without* re-executing the CSS module's
 * top-level `__vite__updateStyle(...)` call, so the <style> tag is never
 * updated.
 *
 * This plugin runs after `vite:css-post` and appends a self-accept call so that
 * CSS-value edits (by far the most common change during development) are
 * reflected instantly.  If class names are added or removed the component will
 * still need a full reload, but React Fast Refresh already handles that via
 * invalidation.
 */

import type { Plugin } from 'vite';

export function cssModuleHmrPlugin(): Plugin {
  return {
    name: 'desktalk-css-module-hmr',
    enforce: 'post',
    transform(code, id) {
      if (!id.includes('.module.')) return null;
      if (!/\.(?:css|scss|sass|less|styl|stylus)(?:\?|$)/.test(id)) return null;
      // Only patch when Vite has already injected its HMR scaffolding but
      // omitted a self-accept (i.e. `import.meta.hot.accept()` is absent).
      if (!code.includes('import.meta.hot')) return null;
      if (code.includes('import.meta.hot.accept(')) return null;

      return { code: `${code}\nimport.meta.hot.accept();`, map: null };
    },
  };
}
