/**
 * SERVER-SIDE ENVIRONMENT RESOLVER
 * Maps various provider aliases to standard internal keys.
 * This runs only in Node.js/Edge environments.
 */
export const resolveApiKey = (): string => {
  const keys = [
    process.env.API_KEY,
    process.env.GEMINI_API_KEY,
    process.env.AI_GATEWAY_API_KEY,
    process.env.NEXT_PUBLIC_GEMINI_API_KEY // Fallback for local dev
  ];

  for (const key of keys) {
    if (key && key !== 'undefined' && key.trim() !== '') {
      return key.trim();
    }
  }

  return '';
};

export const isGeminiEnabled = (): boolean => {
  return resolveApiKey().length > 10;
};