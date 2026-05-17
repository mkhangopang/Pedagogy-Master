/**
 * SERVER-SIDE ENVIRONMENT RESOLVER
 *
 * FIX-BUG-02: Removed NEXT_PUBLIC_GEMINI_API_KEY from this resolver.
 *   NEXT_PUBLIC_ variables are compiled into the client bundle and are
 *   readable by anyone in DevTools → Sources. Gemini API keys must NEVER
 *   be NEXT_PUBLIC_.
 */

export const getAllGeminiKeys = (): string[] => {
  if (typeof window !== 'undefined') return [];
  
  const keys = new Set<string>();
  const envKeys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
    process.env.GEMINI_API_KEY_5,
    process.env.GEMINI_API_KEY_6,
    process.env.GEMINI_API_KEY_7,
    process.env.GEMINI_API_KEY_8,
    process.env.GEMINI_API_KEY_9,
    process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    process.env.API_KEY,
  ];

  envKeys.forEach(k => {
    if (k && k.trim().length > 10) keys.add(k.trim());
  });

  return Array.from(keys);
};

export const resolveApiKey = (): string => {
  if (typeof window !== 'undefined') return '';
  const keys = getAllGeminiKeys();
  if (keys.length === 0) {
    // Fallback to any generic API_KEY if no Gemini specific ones
    return (process.env.API_KEY || '').trim();
  }
  return keys[Math.floor(Math.random() * keys.length)];
};

export const isGeminiEnabled = (): boolean => {
  if (typeof window !== 'undefined') return true;
  const key = resolveApiKey();
  return key.length > 10;
};
