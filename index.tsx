
import './app/globals.css';

/**
 * PLATFORM SYNC
 * Synchronizes public environment keys into the application scope.
 * API_KEY is excluded to remain strictly on the server-side.
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
  }
};

startApp();
