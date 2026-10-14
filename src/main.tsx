import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundaryWrapper } from './components/ErrorBoundaryWrapper';
import './index.css';

// Intercept and swallow third-party browser extension errors (e.g. frame_ant chrome extensions)
window.addEventListener('error', (event) => {
  const msg = (event.message || '').toLowerCase();
  const filename = (event.filename || '').toLowerCase();
  const stack = (event.error?.stack || '').toLowerCase();
  if (
    filename.includes('chrome-extension:') ||
    filename.includes('moz-extension:') ||
    stack.includes('chrome-extension:') ||
    stack.includes('moz-extension:') ||
    msg.includes('cannot set property fetch') ||
    msg.includes('frame_ant')
  ) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, true);

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const msg = (reason instanceof Error ? reason.message : String(reason || '')).toLowerCase();
  const stack = ((reason as any)?.stack || '').toLowerCase();
  if (
    stack.includes('chrome-extension:') ||
    stack.includes('moz-extension:') ||
    msg.includes('cannot set property fetch') ||
    msg.includes('frame_ant')
  ) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, true);

// Guard against browser extension injection errors on window.fetch
try {
  let _fetch = window.fetch;
  Object.defineProperty(window, 'fetch', {
    get: () => _fetch,
    set: (val) => {
      if (typeof val === 'function') {
        _fetch = val;
      }
    },
    configurable: true,
    enumerable: true
  });
} catch {}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundaryWrapper>
      <App />
    </ErrorBoundaryWrapper>
  </StrictMode>,
);
