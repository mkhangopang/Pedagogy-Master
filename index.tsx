/**
 * NEURAL INITIALIZATION LAYER (v5.0)
 * Robust environment hydration for Vercel / AI Studio / Local nodes.
 */
if (typeof window !== 'undefined') {
  const win = window as any;
  win.process = win.process || { env: {} };
  win.process.env = win.process.env || {};
  
  // Scavenger function to pull keys from all possible runtime injections
  const scavenge = (key: string) => {
    return (process.env as any)?.[key] || 
           (process.env as any)?.[`NEXT_PUBLIC_${key}`] ||
           win[key] || 
           win[`NEXT_PUBLIC_${key}`] ||
           win.process?.env?.[key] ||
           win.process?.env?.[`NEXT_PUBLIC_${key}`] ||
           '';
  };

  const criticalKeys = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'API_KEY', 'GEMINI_API_KEY'];
  
  criticalKeys.forEach(k => {
    const val = scavenge(k);
    if (val) {
      // Map to both standard and NEXT_PUBLIC formats for cross-compatibility
      win.process.env[k] = val;
      win.process.env[`NEXT_PUBLIC_${k}`] = val;
      // Also inject into window root for legacy node support
      win[`NEXT_PUBLIC_${k}`] = val;
    }
  });

  // Alias API_KEY to GEMINI_API_KEY for the SDK
  if (win.process.env.API_KEY && !win.process.env.GEMINI_API_KEY) {
    win.process.env.GEMINI_API_KEY = win.process.env.API_KEY;
  }

  console.log('📡 [System] Neural Handshake: Hydration Grid Active');
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