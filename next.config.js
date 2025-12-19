
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  env: {
    // Bridges your custom environment variable (e.g. GEMINI_API_KEY) 
    // to the application's process.env.API_KEY requirement.
    API_KEY: process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.API_KEY || "",
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
        ],
      },
    ];
  },
};

module.exports = nextConfig;
