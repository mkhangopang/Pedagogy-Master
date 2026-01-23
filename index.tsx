/**
 * NEURAL INITIALIZATION LAYER (v8.0)
 * Optimized for Public Repository Safety.
 */
if (typeof window !== 'undefined') {
  const win = window as any;
  win.process = win.process || { env: {} };
  
  // SECURE SCOPING: Only map public-prefixed infrastructure nodes
  const publicVars = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_R2_PUBLIC_URL: process.env.NEXT_PUBLIC_R2_PUBLIC_URL
  };

  Object.entries(publicVars).forEach(([k, v]) => {
    if (v) {
      win.process.env[k] = v;
      win[k] = v;
    }
  });

  // Ensure sensitive API_KEY is NEVER mapped here
  delete (win.process.env as any).API_KEY;
  delete (win as any).API_KEY;

  console.log('📡 [System] Infrastructure Handshake: Secure Client Node');
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