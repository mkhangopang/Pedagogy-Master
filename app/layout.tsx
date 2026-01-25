import React from 'react';
import HydrationBoundary from '../components/HydrationBoundary';
import './globals.css';

/**
 * RootLayout (v7.0)
 * Valid Next.js Root Layout for Production Deployment.
 * Ensures the document shell is present for Vercel/Next.js runtime.
 */
export default function RootLayout({
  children,
}: {
  children?: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%234f46e5' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M22 10v6M2 10l10-5 10 5-10 5z'/><path d='M6 12v5c3 3 9 3 12 0v-5'/></svg>" />
      </head>
      <body className="h-full antialiased bg-slate-50 dark:bg-slate-950 font-sans selection:bg-indigo-500 selection:text-white">
        <div id="root" className="min-h-full">
          <HydrationBoundary fallback={
            <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
              <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
          }>
            {children}
          </HydrationBoundary>
        </div>
      </body>
    </html>
  );
}
