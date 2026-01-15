/**
 * SERVER-SIDE ENVIRONMENT RESOLVER
 * Maps exclusively to the primary API_KEY.
 */
export const resolveApiKey = (): string => {
  return (process.env.API_KEY || '').trim();
};

export const isGeminiEnabled = (): boolean => {
  return resolveApiKey().length > 10;
};