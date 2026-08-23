import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import ErrorBoundary from './components/ErrorBoundary.js';
import './index.css';

// Global uncaught rejection and error handlers for production resilience
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    console.warn('⚠️ [Unhandled Promise Rejection]:', event.reason);
  });

  window.addEventListener('error', (event) => {
    console.warn('⚠️ [Global Window Error]:', event.message, event.error);
  });
}

const rootElement = document.getElementById('root');

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}

