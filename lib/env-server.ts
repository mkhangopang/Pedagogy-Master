/**
 * SERVER-SIDE ENVIRONMENT RESOLVER
 * Secure isolation logic for Public Repositories.
 */

export const resolveApiKey = (): string => {
  // CRITICAL: process.env.NEXT_PUBLIC_GEMINI_API_KEY is the standard platform variable.
  // Fallback to API_KEY for legacy support.
  if (typeof window === 'undefined') {
    return (process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.API_KEY || '').trim();
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