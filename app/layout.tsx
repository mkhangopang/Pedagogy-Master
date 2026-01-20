import React from 'react';
import './globals.css';

/**
 * RootLayout (v5.0)
 * Clean wrapper layout for the neural workspace.
 * HTML and Body tags are handled by index.html to prevent DOM nesting exceptions.
 */
export default function RootLayout({
  children,
}: {
  children?: React.ReactNode;
}) {
  return (
    <div className="neural-app-root min-h-screen bg-slate-50 dark:bg-slate-950 font-sans selection:bg-indigo-500 selection:text-white">
      {children}
    </div>
  );
}