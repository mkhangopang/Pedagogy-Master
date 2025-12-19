
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  env: {
    // Explicitly mapping the Vercel secret to the client-side process.env
    API_KEY: process.env.API_KEY || "",
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
