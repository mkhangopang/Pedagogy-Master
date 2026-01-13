
/**
 * PLATFORM SYNC
 * Synchronizes public environment keys into the application scope.
 */
const performSystemHandshake = () => {
  if (typeof window === 'undefined') return;

  const win = window as any;
  win.process = win.process || { env: {} };
  win.process.env = win.process.env || {};
  
  const keys = [
    'NEXT_PUBLIC_SUPABASE_URL', 
    'NEXT_PUBLIC_SUPABASE_ANON_KEY', 
    'NEXT_PUBLIC_R2_PUBLIC_URL',
    'AI_GATEWAY_API_KEY',
    'AI_GATWAY_API_KEY',
    'API_KEY',
    'GEMINI_API_KEY'
  ];
  
  const metaEnv = (import.meta as any).env || {};
  const statusReport: Record<string, string> = {};

  keys.forEach(key => {
    const viteKey = `VITE_${key.replace('NEXT_PUBLIC_', '')}`;
    
    // Check all possible sources (Process, Global, Meta, and prefixed variants)
    const value = 
      win.process.env[key] || 
      win[key] || 
      win.env?.[key] ||
      metaEnv[key] || 
      metaEnv[viteKey] || 
      '';
    
    if (value && value !== 'undefined' && value !== 'null' && String(value).trim() !== '') {
      const trimmed = String(value).trim();
      win.process.env[key] = trimmed;
      win[key] = trimmed;
      statusReport[key] = 'LOADED';
      
      // Ensure AI_GATEWAY_API_KEY maps to standard API_KEY
      if (key === 'AI_GATEWAY_API_KEY' || key === 'AI_GATWAY_API_KEY' || key === 'GEMINI_API_KEY') {
        win.process.env['API_KEY'] = trimmed;
        win['API_KEY'] = trimmed;
      }
    } else {
      statusReport[key] = 'MISSING';
    }
  });

  console.log('--- System Handshake Report ---');
  console.table(statusReport);
};

performSystemHandshake();

import React from 'react';
import { createRoot } from 'react-dom/client';

const startApp = async () => {
  try {
    // Fixed: Remove .tsx extension from module import path to satisfy TS compiler.
    // TypeScript module resolution typically expects extensions to be omitted for source files.
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
      root.innerHTML = `<div style="padding: 40px; color: #ef4444; font-family: 'Plus Jakarta Sans', sans-serif; text-align: center; background: #fff; min-height: 100vh;">
        <h1 style="font-size: 2rem; font-weight: 800; margin-bottom: 1rem;">System Handshake Failed</h1>
        <p style="color: #64748b; max-width: 500px; margin: 0 auto 2rem;">The neural grid could not initialize. This usually means environment variables (Supabase URL/Key) are missing in Vercel or misconfigured.</p>
        <pre style="background: #f8fafc; padding: 20px; border-radius: 16px; font-size: 0.75rem; overflow: auto; border: 1px solid #e2e8f0; text-align: left; max-width: 600px; margin: 0 auto; color: #1e293b;">${error instanceof Error ? error.message : String(error)}</pre>
      </div>`;
    }
  }
};

startApp();
