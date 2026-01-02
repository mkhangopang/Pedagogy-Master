import './app/globals.css';

/**
 * 1. Environment Variable Shim
 * MUST run before any other application imports to ensure libraries like Supabase 
 * can read process.env during their evaluation phase.
 */
const setupEnv = () => {
  if (typeof window !== 'undefined') {
    const win = window as any;
    win.process = win.process || { env: {} };
    
    // Attempt to capture variables from import.meta.env (common in ESM environments)
    const metaEnv = (import.meta as any).env || {};
    
    win.process.env = {
      ...win.process.env,
      ...metaEnv,
      // Priority: 1. Existing process.env, 2. VITE_ prefix, 3. NEXT_PUBLIC_ prefix, 4. Root variable
      NEXT_PUBLIC_SUPABASE_URL: win.process.env.NEXT_PUBLIC_SUPABASE_URL || metaEnv.VITE_SUPABASE_URL || metaEnv.NEXT_PUBLIC_SUPABASE_URL || '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: win.process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || metaEnv.VITE_SUPABASE_ANON_KEY || metaEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      API_KEY: win.process.env.API_KEY || metaEnv.VITE_GEMINI_API_KEY || metaEnv.API_KEY || '',
    };
  }
};

setupEnv();

// 2. Application Entry
import React from 'react';
import { createRoot } from 'react-dom/client';

const initApp = async () => {
  try {
    // Dynamic import ensures the setupEnv logic above has fully executed
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