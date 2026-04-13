/**
 * SERVER-SIDE ENVIRONMENT RESOLVER
 *
 * FIX-BUG-02: Removed NEXT_PUBLIC_GEMINI_API_KEY from this resolver.
 *   NEXT_PUBLIC_ variables are compiled into the client bundle and are
 *   readable by anyone in DevTools → Sources. Gemini API keys must NEVER
 *   be NEXT_PUBLIC_.
 *
 *   MIGRATION: rename your env var from
 *     NEXT_PUBLIC_GEMINI_API_KEY  →  GEMINI_API_KEY
 *   in .env.local, Vercel, and anywhere else it is set.
 */

export const resolveApiKey = (): string => {
  if (typeof window !== 'undefined') {
    // Client side: NEVER expose API keys — enforcement happens at the API gateway level
    return '';
  }

  // Server-only resolution — priority order (all are private, non-NEXT_PUBLIC_)
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.API_KEY ||
    ''
  ).trim();
};

export const isGeminiEnabled = (): boolean => {
  if (typeof window !== 'undefined') {
    // Client side always returns true — actual enforcement is server-side
    return true;
  }
  const key = resolveApiKey();
  return key.length > 10;
};
