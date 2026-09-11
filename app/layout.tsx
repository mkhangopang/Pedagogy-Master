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
        {/* Structured Data (JSON-LD) for Search Engines & Education Scanners */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'Pedagogy Master AI',
              applicationCategory: 'EducationalApplication',
              operatingSystem: 'All',
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'USD',
              },
              description: 'AI-powered curriculum deconstruction, Student Learning Outcomes (SLO) alignment, and pedagogical artifact engine.',
              publisher: {
                '@type': 'Organization',
                name: 'EduNexus',
              },
            }),
          }}
        />
        {/* Google Analytics 4 (Conditional on NEXT_PUBLIC_GA_ID) */}
        {process.env.NEXT_PUBLIC_GA_ID && (
          <>
            <script
              async
              src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`}
            />
            <script
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  gtag('config', '${process.env.NEXT_PUBLIC_GA_ID}', { page_path: window.location.pathname });
                `,
              }}
            />
          </>
        )}
      </head>
      <body suppressHydrationWarning className="h-full antialiased bg-slate-50 dark:bg-slate-950 font-sans selection:bg-indigo-500 selection:text-white">
        <div id="root" className="min-h-full">
          {children}
        </div>
      </body>
    </html>
  );
}
