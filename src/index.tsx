import './polyfills';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider, ConnectionStatus } from './components/Toast';
import { Onboarding } from './components/Onboarding';

// Dynamic import ensures that 'polyfills' (above) has finished executing 
// and attaching to window/global before 'App' and its dependencies (ethers, etc) are evaluated.
import('./App')
  .then(({ default: App }) => {
    const rootElement = document.getElementById('root');
    if (!rootElement) {
      throw new Error("Could not find root element to mount to");
    }

    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <ToastProvider>
            <ConnectionStatus />
            <Onboarding onComplete={() => console.log('Onboarding completed')} />
            <App />
          </ToastProvider>
        </ErrorBoundary>
      </React.StrictMode>
    );
  })
  .catch((err) => {
    console.error("Failed to load application:", err);
    // Render error to screen so it's not just blank
    const rootElement = document.getElementById('root');
    if (rootElement) {
      rootElement.innerHTML = `
        <div style="color: #ef4444; padding: 20px; font-family: monospace; background: #0f172a; height: 100vh; overflow: auto;">
          <h1 style="font-size: 24px; margin-bottom: 16px;">Application Error</h1>
          <p style="margin-bottom: 16px;">Failed to initialize the GeoGraph Node.</p>
          <pre style="background: #1e293b; padding: 16px; border-radius: 8px; overflow: auto; border: 1px solid #334155;">${err.message}\n\n${err.stack}</pre>
        </div>
      `;
    }
  });
