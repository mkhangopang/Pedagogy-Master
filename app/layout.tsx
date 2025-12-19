import React from 'react';
import './globals.css';
import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Pedagogy Master - Advanced Pedagogical Assistant',
  description: 'Elevating education with Neural AI',
};

export default function RootLayout({
  children,
}: {
  // Fixed: Added React import to provide React namespace for ReactNode
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={jakarta.className}>{children}</body>
    </html>
  );
}