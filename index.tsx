/**
 * NEURAL INITIALIZATION LAYER (v6.0)
 * Aggressive environment hydration for Vercel / Cloudflare nodes.
 */
if (typeof window !== 'undefined') {
  const win = window as any;
  win.process = win.process || { env: {} };
  win.process.env = win.process.env || {};
  
  // Explicitly map Next.js build-time variables to the runtime window
  // This ensures that even if process.env is cleared by the bundler,
  // the Supabase client can still find the keys.
  const coreVariables = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    API_KEY: process.env.API_KEY || process.env.GEMINI_API_KEY,
    NEXT_PUBLIC_R2_PUBLIC_URL: process.env.NEXT_PUBLIC_R2_PUBLIC_URL
  };

  Object.entries(coreVariables).forEach(([k, v]) => {
    if (v) {
      win.process.env[k] = v;
      win[k] = v;
    }
  });

  console.log('📡 [System] Infrastructure Handshake: Primary Node Active');
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