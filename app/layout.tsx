import React from 'react';
import './globals.css';
import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import Script from 'next/script';

const jakarta = Plus_Jakarta_Sans({ 
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'EduNexus AI - Intelligent Pedagogical Assistant',
  description: 'Advanced curriculum analysis and educational tool generation powered by Gemini AI.',
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
      <body className={`${jakarta.className} antialiased text-slate-900 bg-slate-50`}>
        {children}
      </body>
    </html>
  );
}