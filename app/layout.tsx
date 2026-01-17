
import React from 'react';
import './globals.css';
import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import Script from 'next/script';

const jakarta = Plus_Jakarta_Sans({ 
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'EduNexus AI - Intelligent Pedagogical Assistant',
  description: 'Advanced curriculum analysis and educational tool generation powered by Gemini AI.',
  icons: {
    icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%234f46e5%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22M22 10v6M2 10l10-5 10 5-10 5z%22/><path d=%22M6 12v5c3 3 9 3 12 0v-5%22/></svg>',
    shortcut: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%234f46e5%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22M22 10v6M2 10l10-5 10 5-10 5z%22/><path d=%22M6 12v5c3 3 9 3 12 0v-5%22/></svg>',
  }
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <Script 
          src="https://app.lemonsqueezy.com/js/lemon.js" 
          strategy="afterInteractive"
        />
      </head>
      <body className={`${jakarta.className} antialiased text-slate-900 bg-slate-50 dark:bg-slate-950`}>
        {children}
      </body>
    </html>
  );
}
