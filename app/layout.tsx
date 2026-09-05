import React from 'react';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pedagogy Master AI',
  description: 'A production-ready EdTech SaaS platform for intelligent curriculum analysis and pedagogical tool generation.',
  openGraph: {
    title: 'Pedagogy Master AI',
    description: 'A production-ready EdTech SaaS platform for intelligent curriculum analysis and pedagogical tool generation.',
  },
};

/**
 * RootLayout (v7.1 - Performance Optimized)
 * Direct SSR rendering for instantaneous Largest Contentful Paint (LCP).
 * Eliminates synthetic hydration spinners on initial document request.
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
        {/* Inline Critical CSS for above-the-fold content and LCP element (p#h-desc, h1#h-title) */}
        <style dangerouslySetInnerHTML={{ __html: `
          #h-title {
            font-size: clamp(2.5rem, 6vw + 1rem, 7.5rem);
            font-weight: 900;
            letter-spacing: -0.05em;
            line-height: 0.88;
            margin: 0;
            color: #0f172a;
            contain: layout style;
          }
          #h-desc {
            font-size: 1.125rem;
            line-height: 1.625;
            font-weight: 500;
            color: #64748b;
            max-width: 42rem;
            margin: 0;
            contain: layout style;
          }
          @media (min-width: 768px) {
            #h-desc { font-size: 1.25rem; }
          }
          .dark #h-title { color: #ffffff; }
          .dark #h-desc { color: #94a3b8; }
        `}} />
      </head>
      <body suppressHydrationWarning className="h-full antialiased bg-slate-50 dark:bg-slate-950 font-sans selection:bg-indigo-500 selection:text-white">
        <div id="root" className="min-h-full">
          {children}
        </div>
      </body>
    </html>
  );
}
