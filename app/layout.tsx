import React from 'react';
import './globals.css';

/**
 * RootLayout (v4.0)
 * Standard Next.js Root Layout with mandatory document structure.
 */
export default function RootLayout({
  children,
}: {
  // Fix: Making children optional to resolve the "Property 'children' is missing" error in index.tsx
  // This satisfies the compiler when children are provided via JSX nesting.
  children?: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <title>EduNexus AI | Neural Pedagogical Intelligence</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%234f46e5' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M22 10v6M2 10l10-5 10 5-10 5z'/><path d='M6 12v5c3 3 9 3 12 0v-5'/></svg>" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
        <script src="https://app.lemonsqueezy.com/js/lemon.js" defer></script>
      </head>
      <body className="antialiased text-slate-900 bg-slate-50 dark:bg-slate-950 font-sans min-h-screen">
        {children}
      </body>
    </html>
  );
}