
/**
 * PLATFORM SYNC
 * Synchronizes public environment keys into the application scope.
 * This is critical for Vercel/Next.js deployments where NEXT_PUBLIC_ prefixes are required.
 */
const performSystemHandshake = () => {
  if (typeof window === 'undefined') return;

  const win = window as any;
  win.process = win.process || { env: {} };
  win.process.env = win.process.env || {};
  win.__SYSTEM_DIAGNOSTICS = { keys: {} };
  
  // Define standard keys and their common variants
  const keyMap: Record<string, string[]> = {
    'NEXT_PUBLIC_SUPABASE_URL': ['SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'supabase_url'],
    'NEXT_PUBLIC_SUPABASE_ANON_KEY': ['SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'supabase_key'],
    'NEXT_PUBLIC_R2_PUBLIC_URL': ['R2_PUBLIC_URL', 'VITE_R2_PUBLIC_URL', 'NEXT_PUBLIC_R2_PUBLIC_URL'],
    'API_KEY': ['API_KEY', 'GEMINI_API_KEY', 'AI_GATEWAY_API_KEY', 'VITE_GEMINI_API_KEY', 'api_key']
  };
  
  const metaEnv = (import.meta as any).env || {};
  const statusReport: Record<string, string> = {};

  Object.entries(keyMap).forEach(([standardKey, variants]) => {
    let foundValue = '';

    // Check all variants in all possible scopes
    for (const variant of variants) {
      const val = 
        win.process.env[variant] || 
        win[variant] || 
        win.env?.[variant] ||
        metaEnv[variant] || 
        (typeof process !== 'undefined' ? (process.env as any)[variant] : '');

      if (val && val !== 'undefined' && val !== 'null' && String(val).trim() !== '') {
        foundValue = String(val).trim();
        break;
      }
    }
    
    if (foundValue) {
      // Inject into all standard locations
      win.process.env[standardKey] = foundValue;
      win[standardKey] = foundValue;
      
      // Specifically ensure API_KEY is available for the Gemini SDK
      if (standardKey === 'API_KEY') {
        win.process.env['API_KEY'] = foundValue;
        win['API_KEY'] = foundValue;
      }
      
      statusReport[standardKey] = 'LOADED';
      win.__SYSTEM_DIAGNOSTICS.keys[standardKey] = 'LOADED';
    } else {
      statusReport[standardKey] = 'MISSING';
      win.__SYSTEM_DIAGNOSTICS.keys[standardKey] = 'MISSING';
    }
  });

  console.log('--- Pedagogy Master: Neural Handshake ---');
  console.table(statusReport);
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
    const root = document.getElementById('root');
    if (root) {
      root.innerHTML = `<div style="padding: 40px; color: #ef4444; font-family: 'Plus Jakarta Sans', sans-serif; text-align: center; background: #fff; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <h1 style="font-size: 2rem; font-weight: 800; margin-bottom: 1rem;">System Handshake Failed</h1>
        <p style="color: #64748b; max-width: 500px; margin: 0 auto 2rem;">The neural grid could not initialize. This usually means environment variables (Supabase URL/Key) are missing in Vercel or misconfigured.</p>
        <pre style="background: #f8fafc; padding: 20px; border-radius: 16px; font-size: 0.75rem; overflow: auto; border: 1px solid #e2e8f0; text-align: left; max-width: 600px; margin: 0 auto; color: #1e293b;">${error instanceof Error ? error.message : String(error)}</pre>
        <button onclick="window.location.reload()" style="margin-top: 2rem; padding: 12px 24px; background: #4f46e5; color: #fff; border: none; border-radius: 12px; font-weight: bold; cursor: pointer;">Retry Handshake</button>
      </div>`;
    }
  }
};

startApp();
