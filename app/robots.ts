import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://pedagogymaster.ai';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin', '/_next/'],
      },
    ],
    sitemap: `${siteUrl.replace(/\/$/, '')}/sitemap.xml`,
  };
}
