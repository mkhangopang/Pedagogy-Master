'use client';

import React, { useEffect } from 'react';
import './globals.css';

/**
 * RootLayout (v3.0)
 * Re-architected as a standard React wrapper for SPA manual bootstrap.
 * Note: Metadata and document shell (html/body) are handled by index.html.
 */
// Fix: children prop made optional to resolve TypeScript validation error in manual bootstrap index.tsx
export default function RootLayout({
  children,
}: {
  children?: React.ReactNode;
}) {
  useEffect(() => {
    // Manually ensure Lemon Squeezy is initialized if the script loaded via index.html
    const win = window as any;
    if (win.createLemonSqueezy) {
      win.createLemonSqueezy();
    }
  }, []);

  return (
    <div className="antialiased text-slate-900 bg-slate-50 dark:bg-slate-950 font-sans min-h-screen">
      {children}
    </div>
  );
}
