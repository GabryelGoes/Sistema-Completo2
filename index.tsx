import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './lightModeContrast.css';
import './styles/patio-vehicle-modal-desktop.css';
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
    navigator.serviceWorker.register('/service-worker.js')
      .then((registration) => {
        if (import.meta.env.DEV) console.log('SW registered:', registration);
      })
      .catch((registrationError) => {
        if (import.meta.env.DEV) console.warn('SW registration failed:', registrationError);
      });
  });
}