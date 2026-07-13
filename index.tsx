import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './lightModeContrast.css';
import './styles/patio-vehicle-modal-desktop.css';
import './styles/desktop-onmotor-shell.css';
import './styles/ios-switch.css';
import App from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { DeviceTypeProvider } from './components/ui/DeviceTypeContext';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <DeviceTypeProvider>
        <App />
      </DeviceTypeProvider>
    </AppErrorBoundary>
  </React.StrictMode>
);

// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then((registration) => {
        if (import.meta.env.DEV) console.log('SW registered:', registration);

        const activateWaitingWorker = (worker: ServiceWorker) => {
          worker.postMessage({ type: 'SKIP_WAITING' });
          worker.addEventListener('statechange', () => {
            if (worker.state === 'activated') {
              window.location.reload();
            }
          });
        };

        if (registration.waiting) {
          activateWaitingWorker(registration.waiting);
        }

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              activateWaitingWorker(installing);
            }
          });
        });
      })
      .catch((registrationError) => {
        if (import.meta.env.DEV) console.warn('SW registration failed:', registrationError);
      });
  });
}