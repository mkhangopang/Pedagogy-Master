/**
 * PLATFORM SYNC (v2.9)
 * High-priority environment injection and diagnostic layer.
 * This file ensures that critical infrastructure keys are available to both
 * server-side and client-side modules before the React tree initializes.
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

  // Critical key list for neural (AI) and data (Supabase) nodes
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

  // Cross-pollination to ensure both variants of AI keys are present
  if (win.process.env.GEMINI_API_KEY && !win.process.env.API_KEY) {
    win.process.env.API_KEY = win.process.env.GEMINI_API_KEY;
  } else if (win.process.env.API_KEY && !win.process.env.GEMINI_API_KEY) {
    win.process.env.GEMINI_API_KEY = win.process.env.API_KEY;
  }

  console.log('📡 [System] Neural Handshake verified. Authoritative nodes mapped.');
};

// Execute immediately before any imports
performSystemHandshake();

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/page';
import RootLayout from './app/layout';

const renderErrorUI = (error: any) => {
  const rootElement = document.getElementById('root');
  if (rootElement) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    rootElement.innerHTML = `
      <div style="padding: 40px; font-family: sans-serif; text-align: center; background: #0a0a0a; min-height: 100vh; display: flex; align-items: center; justify-content: center; color: white;">
        <div style="background: #111; padding: 48px; border-radius: 32px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); max-width: 500px; border: 1px solid #333;">
          <div style="margin-bottom: 24px; display: inline-flex; padding: 16px; background: rgba(239, 68, 68, 0.1); border-radius: 20px; color: #ef4444;">
             <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
          </div>
          <h1 style="color: #ef4444; font-weight: 900; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 2px;">Neural Node Offline</h1>
          <p style="color: #94a3b8; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">${errorMsg}</p>
          <div style="display: flex; gap: 12px; justify-content: center;">
            <button onclick="window.location.reload()" style="background: #4f46e5; color: white; border: none; padding: 12px 24px; border-radius: 12px; font-weight: 700; cursor: pointer;">Retry Handshake</button>
          </div>
        </div>
      </div>
    `;
  }
};

try {
  const container = document.getElementById('root');
  if (container) {
    const root = createRoot(container);
    root.render(
      <React.StrictMode>
        <RootLayout>
          <App />
        </RootLayout>
      </React.StrictMode>
    );
  }
} catch (error) {
  console.error('Critical boot failure:', error);
  renderErrorUI(error);
}