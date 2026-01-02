import './app/globals.css';

/**
 * 1. Robust Environment Variable Shim
 * MUST run before any other application imports.
 */
const setupEnv = () => {
  if (typeof window !== 'undefined') {
    const win = window as any;
    win.process = win.process || { env: {} };
    win.process.env = win.process.env || {};
    
    // Capture from possible sources
    const metaEnv = (import.meta as any).env || {};
    
    // Explicitly map key variables for Pedagogy Master
    const SUPABASE_URL = win.process.env.NEXT_PUBLIC_SUPABASE_URL || metaEnv.VITE_SUPABASE_URL || metaEnv.NEXT_PUBLIC_SUPABASE_URL || '';
    const SUPABASE_KEY = win.process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || metaEnv.VITE_SUPABASE_ANON_KEY || metaEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    const API_KEY = win.process.env.API_KEY || metaEnv.VITE_GEMINI_API_KEY || metaEnv.API_KEY || '';

    win.process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
    win.process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = SUPABASE_KEY;
    win.process.env.API_KEY = API_KEY;
  }
};

setupEnv();

// 2. Application Entry
import React from 'react';
import { createRoot } from 'react-dom/client';

const initApp = async () => {
  try {
    const { default: App } = await import('./app/page');
    const container = document.getElementById('root');
    
    if (container) {
      const root = createRoot(container);
      root.render(
        <React.StrictMode>
          <App />
        </React.StrictMode>
      );
    }
  } catch (error) {
    console.error("Pedagogy Master Initialization Error:", error);
  }
};

initApp();