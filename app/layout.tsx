import React from 'react';
import type { Metadata } from 'next';
import './globals.css';
import 'katex/dist/katex.min.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://pedagogymaster.ai'),
  title: 'Pedagogy Master AI | Intelligent Curriculum Analysis & Instructional Architecture',
  description: 'Production-ready EdTech SaaS platform for automated curriculum alignment, Student Learning Outcomes (SLO) deconstruction, rubrics, and high-fidelity pedagogy generation.',
  keywords: [
    'Curriculum Alignment', 'EdTech AI', 'Student Learning Outcomes', 'SLO Audit', 
    'Lesson Plan Generator', 'Bloom Taxonomy Assessment', 'Instructional Architecture',
    'Pedagogy Master', 'Math KaTeX Generator'
  ],
  authors: [{ name: 'Pedagogy Master AI Team' }],
  creator: 'EduNexus Engineering',
  publisher: 'Pedagogy Master AI',
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%234f46e5' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M22 10v6M2 10l10-5 10 5-10 5z'/><path d='M6 12v5c3 3 9 3 12 0v-5'/></svg>",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://pedagogymaster.ai',
    siteName: 'Pedagogy Master AI',
    title: 'Pedagogy Master AI | Intelligent Curriculum Analysis & Instructional Architecture',
    description: 'Transform national curriculums and learning standards into rigorous lesson plans, bloom rubrics, and conceptual scaffolds in seconds.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pedagogy Master AI',
    description: 'Intelligent Curriculum Analysis & Pedagogical Architecture SaaS',
  },
};

export default function RootLayout({
  children,
}: {
  children?: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body suppressHydrationWarning className="h-full antialiased bg-slate-50 dark:bg-slate-950 font-sans selection:bg-indigo-500 selection:text-white">
        <div id="root" className="min-h-full">
          {children}
        </div>
      </body>
    </html>
  );
}
