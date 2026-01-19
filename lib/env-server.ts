/**
 * SERVER-SIDE ENVIRONMENT RESOLVER
 * Maps exclusively to the primary API_KEY.
 * Robust against undefined globals in browser context.
 */
export const resolveApiKey = (): string => {
  if (typeof window !== 'undefined') {
    const win = window as any;
    return (win.process?.env?.API_KEY || win.process?.env?.GEMINI_API_KEY || '').trim();
  }
  return (process.env.API_KEY || process.env.GEMINI_API_KEY || '').trim();
};

export const isGeminiEnabled = (): boolean => {
  return resolveApiKey().length > 10;
};
