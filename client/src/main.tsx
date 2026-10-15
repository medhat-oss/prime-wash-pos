import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import ErrorBoundary from './components/ErrorBoundary.js';
import { setupPwa } from './pwa.js';
import { purgeLegacyPwaCaches } from './utils/pwaNuke.js';
import './index.css';

// Global uncaught rejection and error handlers for production resilience
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    console.warn('⚠️ [Unhandled Promise Rejection]:', event.reason);
  });

  window.addEventListener('error', (event) => {
    console.warn('⚠️ [Global Window Error]:', event.message, event.error);
  });

  // Execute background legacy PWA purge and initialize Workbox Service Worker seamlessly
  purgeLegacyPwaCaches()
    .finally(() => {
      try {
        setupPwa();
      } catch (err) {
        console.warn('⚠️ [PWA Setup Error]:', err);
      }
    });
}

const rootElement = document.getElementById('root');

if (rootElement) {
  try {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </React.StrictMode>
    );
  } catch (err) {
    console.error('Fatal React Root Mounting Error:', err);
    if (rootElement) {
      rootElement.innerHTML = `
        <div style="min-h:100vh;background:#090d16;color:#fff;display:flex;align-items:center;justify-content:center;font-family:sans-serif;padding:20px;text-align:center;">
          <div style="max-width:500px;background:#131b2e;border:1px solid #1e293b;border-radius:16px;padding:24px;">
            <h2 style="font-size:18px;margin-bottom:12px;">PRIME WASH POS</h2>
            <p style="font-size:14px;color:#94a3b8;margin-bottom:16px;">جاري تشغيل النظام... اضغط لتحديث الشاشة</p>
            <button onclick="window.location.reload()" style="background:#bd0000;color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-weight:bold;">
              إعادة تحميل الصفحة
            </button>
          </div>
        </div>
      `;
    }
  }
}

