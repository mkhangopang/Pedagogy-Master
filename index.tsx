
/**
 * PLATFORM SYNC (v2.4)
 * High-priority environment injection.
 */
const performSystemHandshake = () => {
  if (typeof window === 'undefined') return;

  const win = window as any;
  win.process = win.process || { env: {} };
  win.process.env = win.process.env || {};
  
  const getVal = (key: string) => {
    return (process.env as any)?.[key] || 
           (process.env as any)?.[`NEXT_PUBLIC_${key}`] ||
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

// Execute immediately before any imports
performSystemHandshake();

import React from 'react';
import { createRoot } from 'react-dom/client';

const renderErrorUI = (error: any) => {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `
      <div style="padding: 40px; font-family: sans-serif; text-align: center; background: #0a0a0a; min-height: 100vh; display: flex; align-items: center; justify-content: center; color: white;">
        <div style="background: #111; padding: 48px; border-radius: 32px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); max-width: 500px; border: 1px solid #333;">
          <h1 style="color: #ef4444; font-weight: 900; margin-bottom: 16px;">NODE OFFLINE</h1>
          <p style="color: #94a3b8; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">${error instanceof Error ? error.message : String(error)}</p>
          <button onclick="window.location.reload()" style="padding: 12px 32px; background: #4f46e5; color: white; border: none; border-radius: 12px; cursor: pointer; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Retry Sync</button>
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
    console.error("Fatal boot error:", error);
    renderErrorUI(error);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}