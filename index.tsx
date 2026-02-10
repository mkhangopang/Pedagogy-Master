/**
 * NEURAL INITIALIZATION LAYER (v10.0)
 * Optimized for Public Repository Safety and Runtime Credential Bridging.
 * This MUST execute before any other imports to correctly shim the environment.
 */
if (typeof window !== 'undefined') {
  const win = window as any;
  win.process = win.process || { env: {} };
  win.process.env = win.process.env || {};
  
  // Bridge statically replaced Next.js variables to the global window scope
  // These variables are replaced as string literals by the compiler.
  const buildUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const buildKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (buildUrl) win.process.env.NEXT_PUBLIC_SUPABASE_URL = buildUrl;
  if (buildKey) win.process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = buildKey;

  // Final validation log
  const hasUrl = !!(buildUrl || win.NEXT_PUBLIC_SUPABASE_URL);
  const hasKey = !!(buildKey || win.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  console.log(`📡 [System] Infrastructure Handshake: ${hasUrl && hasKey ? 'VERIFIED' : 'PENDING'}`);
  if (!hasUrl || !hasKey) {
    console.warn('⚠️ [System] Supabase credentials missing from runtime context.');
  }
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