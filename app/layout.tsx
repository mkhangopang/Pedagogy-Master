'use client';

import React from 'react';
import HydrationBoundary from '../components/HydrationBoundary';
import './globals.css';

/**
 * RootLayout (v6.1)
 * Optimized for Client-Side Bootstrapping via index.tsx
 */
export default function RootLayout({
  children,
}: {
  children?: React.ReactNode;
}) {
  return (
    <div className="neural-app-root min-h-screen bg-slate-50 dark:bg-slate-950 font-sans selection:bg-indigo-500 selection:text-white">
      <HydrationBoundary fallback={
        <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }>
        {children}
      </HydrationBoundary>
    </div>
  );
}
