/**
 * SERVER-SIDE ENVIRONMENT RESOLVER
 * Secure isolation logic for Public Repositories.
 */

export const resolveApiKey = (): string => {
  // CRITICAL: process.env.API_KEY is only available on Vercel's backend.
  // Next.js prevents variables without NEXT_PUBLIC_ from being bundled into the frontend JS.
  if (typeof window === 'undefined') {
    return (process.env.API_KEY || '').trim();
  }
  
  // Return empty string on client side to prevent accidental log leaks
  return '';
};

export const isGeminiEnabled = (): boolean => {
  // This check is performed server-side by API routes
  if (typeof window === 'undefined') {
    const key = resolveApiKey();
    return key.length > 10;
  }
  // Client side always assumes true if the UI is rendered, 
  // actual enforcement happens at the API gateway level.
  return true; 
};