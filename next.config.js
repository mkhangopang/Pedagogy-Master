/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Explicitly inline environment variables at build time
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_R2_PUBLIC_URL: process.env.NEXT_PUBLIC_R2_PUBLIC_URL,
  },
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist'],
  experimental: {
    optimizePackageImports: ['@supabase/supabase-js', 'lucide-react', 'recharts'],
    serverActions: {
      bodySizeLimit: '10mb'
    },
  },
  // Build-time diagnostic for CI/CD environments
  webpack: (config, { dev, isServer }) => {
    if (isServer) {
      // Prevents "Can't resolve 'canvas'" warnings from pdf-parse
      config.resolve.alias.canvas = false;
    } else {
      // Logic for client-side bundle verification
      const urlExists = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
      const keyExists = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!urlExists || !keyExists) {
        console.warn('⚠️ [Build] Supabase keys missing in current environment context.');
      }
    }
    return config;
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self' https://*.google.com https://*.aistudio.google.com;",
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
