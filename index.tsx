import './polyfills';
import React from 'react';
import ReactDOM from 'react-dom/client';

// Load the main App component using a dynamic import to ensure polyfills are ready.
// The path is root-relative (./App) to follow the flattened project structure.
import('./App')
  .then(({ default: App }) => {
    const rootElement = document.getElementById('root');
    if (!rootElement) {
      throw new Error("Could not find root element to mount to");
    }

    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  })
  .catch((err) => {
    console.error("Failed to load application:", err);
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