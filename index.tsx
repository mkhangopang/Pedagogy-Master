
/**
 * PLATFORM SYNC
 * Synchronizes public environment keys into the application scope.
 */
const performSystemHandshake = () => {
  if (typeof window === 'undefined') return;

  const win = window as any;
  win.process = win.process || { env: {} };
  win.process.env = win.process.env || {};
  
  const keys = [
    'NEXT_PUBLIC_SUPABASE_URL', 
    'NEXT_PUBLIC_SUPABASE_ANON_KEY', 
    'NEXT_PUBLIC_R2_PUBLIC_URL'
  ];
  
  const metaEnv = (import.meta as any).env || {};

  keys.forEach(key => {
    const viteKey = `VITE_${key.replace('NEXT_PUBLIC_', '')}`;
    const value = win.process.env[key] || win[key] || metaEnv[key] || metaEnv[viteKey] || '';
    
    if (value && value !== 'undefined' && value !== 'null' && value.trim() !== '') {
      const trimmed = value.trim();
      win.process.env[key] = trimmed;
      win[key] = trimmed;
    }
  });
};

performSystemHandshake();

import React from 'react';
import { createRoot } from 'react-dom/client';

const startApp = async () => {
  try {
    // Dynamic import of the main app component - extension removed to fix TS build error
    const { default: App } = await import('./app/page');
    const container = document.getElementById('root');
    if (container) {
      createRoot(container).render(
        <React.StrictMode>
          <App />
        </React.StrictMode>
      );
    }
  } catch (error) {
    console.error("Pedagogy Master: Startup Failure", error);
    // Add visual error indicator if possible
    const root = document.getElementById('root');
    if (root) {
      root.innerHTML = `<div style="padding: 20px; color: #ef4444; font-family: sans-serif;">
        <h1 style="font-size: 1.5rem; font-weight: bold;">Startup Failure</h1>
        <p>Failed to initialize the application grid. Please check your cloud configuration.</p>
        <pre style="background: #f1f5f9; padding: 10px; border-radius: 8px; font-size: 0.8rem; overflow: auto;">${error instanceof Error ? error.message : String(error)}</pre>
      </div>`;
    }
  }
};

startApp();