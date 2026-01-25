
/**
 * NEURAL INITIALIZATION LAYER (v8.4)
 * Optimized for Public Repository Safety and Next.js 15 Runtime.
 */
if (typeof window !== 'undefined') {
  const win = window as any;
  win.process = win.process || { env: {} };
  
  let envSource: any = {};
  try {
    envSource = process.env;
  } catch (e) {
    envSource = {};
  }

  const publicVars = {
    NEXT_PUBLIC_SUPABASE_URL: envSource.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: envSource.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_R2_PUBLIC_URL: envSource.NEXT_PUBLIC_R2_PUBLIC_URL
  };

  Object.entries(publicVars).forEach(([k, v]) => {
    if (v) win.process.env[k] = v;
  });

  console.log('📡 [System] Infrastructure Handshake: Node Verified');
}

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/page';

const container = document.getElementById('root');

if (container) {
  // Check if we are already in a hydrated state from Next.js
  const isHydrated = container.hasChildNodes() && !window.location.pathname.endsWith('.html');
  
  if (!isHydrated) {
    const root = createRoot(container);
    root.render(
      <React.StrictMode>
        {/* Render App directly. RootLayout is used by Next.js or provides shell via index.html */}
        <App />
      </React.StrictMode>
    );
  }
}
