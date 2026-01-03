import './app/globals.css';

/**
 * SYSTEM HANDSHAKE
 * Synchronizes platform environment variables into the application scope.
 */
const performSystemHandshake = () => {
  if (typeof window === 'undefined') return;

  const win = window as any;
  win.process = win.process || { env: {} };
  win.process.env = win.process.env || {};
  
  const envSource = (import.meta as any).env || {};
  
  const keys = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'API_KEY'];
  
  keys.forEach(key => {
    const viteKey = `VITE_${key.replace('NEXT_PUBLIC_', '')}`;
    const value = process.env[key] || win[key] || envSource[key] || envSource[viteKey] || '';
    
    if (value && value !== 'undefined' && value !== 'null') {
      win.process.env[key] = value;
      win[key] = value;
      win.__ENV__ = win.__ENV__ || {};
      win.__ENV__[key] = value;
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
    console.error("Startup Failure:", error);
  }
};

startApp();
