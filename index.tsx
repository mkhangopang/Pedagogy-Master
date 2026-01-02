import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/page';
import './app/globals.css';

// Shim process.env for browser environment compatibility
if (typeof window !== 'undefined') {
  (window as any).process = {
    env: {
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
      ...(import.meta as any).env,
    },
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