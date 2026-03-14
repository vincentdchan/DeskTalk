import React from 'react';
import * as ReactDOM_NS from 'react-dom';
import { createRoot, hydrateRoot } from 'react-dom/client';
import * as jsxRuntime from 'react/jsx-runtime';
import { Shell } from './components/Shell.js';
import './styles/global.css';

// Expose React libraries on window so MiniApps can read them at runtime
// instead of bundling their own copies.
// Merge react-dom and react-dom/client so miniapps can import from either.
(window as Record<string, unknown>).React = React;
(window as Record<string, unknown>).ReactDOM = { ...ReactDOM_NS, createRoot, hydrateRoot };
(window as Record<string, unknown>).__desktalk_jsx_runtime = jsxRuntime;

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found');
}

const root = createRoot(rootEl);
root.render(
  <React.StrictMode>
    <Shell />
  </React.StrictMode>,
);
