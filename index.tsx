/**
 * NEURAL INITIALIZATION LAYER (v9.0)
 * Optimized for Public Repository Safety and Runtime Credential Bridging.
 */
if (typeof window !== 'undefined') {
  const win = window as any;
  win.process = win.process || { env: {} };
  win.process.env = win.process.env || {};
  
  // Bridge statically replaced Next.js variables to the global window scope
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (url) win.process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  if (key) win.process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = key;

  console.log('📡 [System] Infrastructure Handshake:', {
    node: 'Verified',
    url_linked: !!url,
    key_linked: !!key && key.length > 20,
    timestamp: new Date().toISOString()
  });
}

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/page';

const container = document.getElementById('root');

if (container) {
  const isHydrated = container.hasChildNodes() && !window.location.pathname.endsWith('.html');
  if (!isHydrated) {
    const root = createRoot(container);
    root.render(<App />);
  }
}
