
/**
 * PLATFORM SYNC (v2.3)
 * High-priority environment injection.
 */
const performSystemHandshake = () => {
  if (typeof window === 'undefined') return;

  const win = window as any;
  win.process = win.process || { env: {} };
  win.process.env = win.process.env || {};
  
  // Scrape all possible sources for keys
  const getVal = (key: string) => {
    return process.env[key] || 
           (process.env as any)[`NEXT_PUBLIC_${key}`] ||
           win[key] || 
           win[`NEXT_PUBLIC_${key}`] ||
           (import.meta as any).env?.[key] || 
           '';
  };

  const keys = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'API_KEY', 'GEMINI_API_KEY'];
  
  keys.forEach(k => {
    const val = getVal(k);
    if (val && val !== 'undefined' && val !== 'null') {
      win.process.env[k] = val;
      win.process.env[`NEXT_PUBLIC_${k}`] = val;
      win[k] = val;
      win[`NEXT_PUBLIC_${k}`] = val;
    }
  });

  console.log('📡 [System] Neural Handshake complete.');
};

performSystemHandshake();

import React from 'react';
import { createRoot } from 'react-dom/client';

const renderErrorUI = (error: any) => {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `
      <div style="padding: 40px; font-family: sans-serif; text-align: center; background: #f8fafc; min-height: 100vh; display: flex; align-items: center; justify-content: center;">
        <div style="background: white; padding: 48px; border-radius: 32px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.1); max-width: 500px; border: 1px solid #e2e8f0;">
          <h1 style="color: #ef4444;">Node Offline</h1>
          <p style="color: #64748b;">${error instanceof Error ? error.message : String(error)}</p>
          <button onclick="window.location.reload()" style="padding: 12px 24px; background: #4f46e5; color: white; border: none; border-radius: 8px; cursor: pointer;">Retry Sync</button>
        </div>
      </div>
    `;
  }
};

const startApp = async () => {
  try {
    const { default: App } = await import('./app/page');
    const container = document.getElementById('root');
    if (container) {
      createRoot(container).render(<React.StrictMode><App /></React.StrictMode>);
    }
  } catch (error) {
    renderErrorUI(error);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
