import React from 'react';
import { createRoot } from 'react-dom/client';
import { Shell } from './components/Shell.js';
import './styles/global.css';

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
