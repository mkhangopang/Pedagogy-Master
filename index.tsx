import './app/globals.css';

/**
 * PLATFORM SYNC
 * Synchronizes platform environment secrets into the application scope.
 */
const performSystemHandshake = () => {
  if (typeof window === 'undefined') return;

  const win = window as any;
  win.process = win.process || { env: {} };
  win.process.env = win.process.env || {};
  
  // Standard secrets expected by the app
  const keys = [
    'NEXT_PUBLIC_SUPABASE_URL', 
    'NEXT_PUBLIC_SUPABASE_ANON_KEY', 
    'API_KEY',
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
    'NEXT_PUBLIC_R2_PUBLIC_URL'
  ];
  
  // Scrape possible alternative sources if process.env isn't fully populated
  const metaEnv = (import.meta as any).env || {};

  keys.forEach(key => {
    const viteKey = `VITE_${key.replace('NEXT_PUBLIC_', '')}`;
    const value = process.env[key] || win[key] || metaEnv[key] || metaEnv[viteKey] || '';
    
    if (value && value !== 'undefined' && value !== 'null' && value.trim() !== '') {
      win.process.env[key] = value.trim();
      // Ensure it's globally available for libraries checking window
      win[key] = value.trim();
    }
  });
};

// Execute Handshake immediately
performSystemHandshake();

import React from 'react';
import { createRoot } from 'react-dom/client';

const startApp = async () => {
  try {
    // Dynamic import allows the environment handshake to complete first
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
    console.error("Pedagogy Master: Critical Startup Failure", error);
  }
};

startApp();