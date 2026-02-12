import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/page';

/**
 * NEURAL INITIALIZATION LAYER (v11.0)
 * Logic: Direct hydration of the root component.
 * Environment bridging is now handled internally by lib/supabase.ts
 */
const container = document.getElementById('root');

if (container) {
  const isHydrated = container.hasChildNodes() && !window.location.pathname.endsWith('.html');
  if (!isHydrated) {
    const root = createRoot(container);
    root.render(<App />);
  }
}