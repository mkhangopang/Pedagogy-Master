
/**
 * PLATFORM SYNC (v2.2)
 * Synchronizes public environment keys into the application scope.
 * Enhanced for high-availability across Vercel, Next.js, and local environments.
 */
const performSystemHandshake = () => {
  if (typeof window === 'undefined') return;

  const win = window as any;
  
  // Ensure process.env structure exists immediately for SDK compatibility
  win.process = win.process || { env: {} };
  win.process.env = win.process.env || {};
  win.__SYSTEM_DIAGNOSTICS = { keys: {}, timestamp: new Date().toISOString() };
  
  // Static checks for build-time replacement
  const staticEnv: Record<string, string | undefined> = {
    'NEXT_PUBLIC_SUPABASE_URL': process.env.NEXT_PUBLIC_SUPABASE_URL,
    'NEXT_PUBLIC_SUPABASE_ANON_KEY': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    'NEXT_PUBLIC_R2_PUBLIC_URL': process.env.NEXT_PUBLIC_R2_PUBLIC_URL,
    'API_KEY': process.env.API_KEY || (process.env as any).GEMINI_API_KEY || (process.env as any).NEXT_PUBLIC_GEMINI_API_KEY
  };

  const keyMap: Record<string, string[]> = {
    'NEXT_PUBLIC_SUPABASE_URL': ['SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'supabase_url'],
    'NEXT_PUBLIC_SUPABASE_ANON_KEY': ['SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'supabase_key'],
    'NEXT_PUBLIC_R2_PUBLIC_URL': ['R2_PUBLIC_URL', 'VITE_R2_PUBLIC_URL', 'NEXT_PUBLIC_R2_PUBLIC_URL'],
    'API_KEY': ['API_KEY', 'GEMINI_API_KEY', 'AI_GATEWAY_API_KEY', 'VITE_GEMINI_API_KEY', 'api_key', 'NEXT_PUBLIC_GEMINI_API_KEY']
  };
  
  const metaEnv = (import.meta as any).env || {};
  const statusReport: Record<string, string> = {};

  Object.entries(keyMap).forEach(([standardKey, variants]) => {
    let foundValue = staticEnv[standardKey] || '';

    if (!foundValue || foundValue === 'undefined' || foundValue === 'null') {
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
    }
    
    if (foundValue && foundValue !== 'undefined' && foundValue !== 'null') {
      win.process.env[standardKey] = foundValue;
      win.process.env[standardKey.replace('NEXT_PUBLIC_', '')] = foundValue;
      win[standardKey] = foundValue;
      
      if (standardKey === 'API_KEY' || standardKey === 'GEMINI_API_KEY') {
        win.process.env['API_KEY'] = foundValue;
        win['API_KEY'] = foundValue;
        win.process.env['GEMINI_API_KEY'] = foundValue;
      }
      
      statusReport[standardKey] = 'LOADED';
      win.__SYSTEM_DIAGNOSTICS.keys[standardKey] = 'LOADED';
    } else {
      statusReport[standardKey] = 'MISSING';
      win.__SYSTEM_DIAGNOSTICS.keys[standardKey] = 'MISSING';
    }
  });

  console.log('--- EduNexus AI: Neural Handshake v2.2 ---');
  console.table(statusReport);
};

performSystemHandshake();

import React from 'react';
import { createRoot } from 'react-dom/client';

const renderErrorUI = (error: any) => {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `
      <div style="padding: 40px; font-family: 'Plus Jakarta Sans', sans-serif; text-align: center; background: #f8fafc; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #1e293b;">
        <div style="background: white; padding: 48px; border-radius: 32px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.1); max-width: 550px; border: 1px solid #e2e8f0;">
          <div style="width: 64px; height: 64px; background: #fee2e2; color: #ef4444; border-radius: 16px; display: flex; items-center; justify-content: center; margin: 0 auto 24px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <h1 style="font-size: 1.8rem; font-weight: 800; margin-bottom: 12px; letter-spacing: -0.025em;">Startup Interrupted</h1>
          <p style="color: #64748b; margin-bottom: 32px; line-height: 1.6; font-weight: 500;">
            The neural grid could not initialize. In Incognito, ensure you haven't blocked all cookies/storage. Technical details below.
          </p>
          
          <div style="background: #f1f5f9; padding: 16px; border-radius: 12px; text-align: left; margin-bottom: 32px; border: 1px solid #e2e8f0;">
            <div style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; color: #94a3b8; margin-bottom: 8px;">Technical Payload</div>
            <pre style="font-size: 0.75rem; color: #475569; overflow: auto; margin: 0; white-space: pre-wrap; font-family: monospace;">${error instanceof Error ? error.message : String(error)}</pre>
          </div>

          <div style="display: flex; flex-direction: column; gap: 12px;">
            <button onclick="window.location.reload()" style="width: 100%; padding: 16px; background: #4f46e5; color: #fff; border: none; border-radius: 14px; font-weight: 700; cursor: pointer; font-size: 0.9rem; transition: all 0.2s;">
              Standard Sync (Reload)
            </button>
            <button onclick="localStorage.clear(); sessionStorage.clear(); window.location.href='/';" style="width: 100%; padding: 16px; background: #fff; color: #64748b; border: 1px solid #e2e8f0; border-radius: 14px; font-weight: 700; cursor: pointer; font-size: 0.9rem;">
              Deep Reset (Clear Session)
            </button>
          </div>
          
          <p style="margin-top: 24px; font-size: 0.75rem; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">
            Synthesis Node: offline
          </p>
        </div>
      </div>
    `;
  }
};

const startApp = async () => {
  try {
    // FIXED: Removed .tsx extension to satisfy TypeScript compiler and standard resolution rules
    const { default: App } = await import('./app/page');
    const container = document.getElementById('root');
    
    if (container) {
      const root = createRoot(container);
      root.render(
        <React.StrictMode>
          <App />
        </React.StrictMode>
      );
    } else {
      throw new Error("Critical DOM error: #root container missing.");
    }
  } catch (error) {
    console.error("EduNexus AI: Startup Failure", error);
    renderErrorUI(error);
  }
};

// Check for existing body content (prevent blank screen on slow JS)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
