/**
 * NEURAL INITIALIZATION LAYER (v4.0)
 * Ensuring process.env and win.process are hydrated before any hoisted imports execute.
 */
if (typeof window !== 'undefined') {
  const win = window as any;
  win.process = win.process || { env: {} };
  win.process.env = win.process.env || {};
  
  const getVal = (key: string) => {
    // Check various common sources for environment keys in studio/preview environments
    return (process.env as any)?.[key] || 
           (process.env as any)?.[`NEXT_PUBLIC_${key}`] ||
           win[key] || 
           win[`NEXT_PUBLIC_${key}`] ||
           '';
  };

  ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'API_KEY', 'GEMINI_API_KEY'].forEach(k => {
    const val = getVal(k);
    if (val) {
      win.process.env[k] = val;
      win.process.env[`NEXT_PUBLIC_${k}`] = val;
    }
  });

  if (win.process.env.API_KEY && !win.process.env.GEMINI_API_KEY) {
    win.process.env.GEMINI_API_KEY = win.process.env.API_KEY;
  }
  console.log('📡 [System] Handshake initiated.');
}

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/page';
import RootLayout from './app/layout';

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