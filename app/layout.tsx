import React from 'react';
import HydrationBoundary from '../components/HydrationBoundary';
import './globals.css';

/**
 * RootLayout (v6.0)
 * Wraps the app in a HydrationBoundary to prevent server/client UI mismatches.
 */
export default function RootLayout({
  children,
}: {
  // Fixed children to be required to match HydrationBoundary and standard Next.js layout patterns
  children: React.ReactNode;
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