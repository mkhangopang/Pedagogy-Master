import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/page';
import './app/globals.css';

// Critical: Shim process.env for browser environment compatibility
// This ensures that libraries expecting Node-like environment variables don't crash.
if (typeof window !== 'undefined') {
  const win = window as any;
  win.process = win.process || { env: {} };
  
  // Safely map environment variables from injected meta or platform globals
  const metaEnv = (import.meta as any).env || {};
  win.process.env = {
    ...win.process.env,
    ...metaEnv,
    NEXT_PUBLIC_SUPABASE_URL: win.process.env.NEXT_PUBLIC_SUPABASE_URL || metaEnv.VITE_SUPABASE_URL || '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: win.process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || metaEnv.VITE_SUPABASE_ANON_KEY || '',
    API_KEY: win.process.env.API_KEY || metaEnv.VITE_GEMINI_API_KEY || '',
  };
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}