'use client';

import React from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-50 dark:bg-slate-950 font-sans">
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 p-10 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 text-center space-y-6">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white uppercase tracking-tight">System Fault</h2>
            <p className="text-slate-500 text-xs font-medium">An unexpected exception was encountered.</p>
            <button
              onClick={() => reset()}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-colors"
            >
              Reinitialize Application
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
