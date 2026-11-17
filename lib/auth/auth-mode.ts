export type AuthEntryMode = 'login' | 'signup' | 'forgot-password' | 'update-password';

const VALID_AUTH_ENTRY_MODES: ReadonlySet<string> = new Set<AuthEntryMode>([
  'login',
  'signup',
  'forgot-password',
  'update-password',
]);

/**
 * Strictly normalizes incoming auth mode values (e.g. from React click handlers
 * or URL params) so non-string objects like MouseEvent never corrupt auth view state.
 */
export function normalizeAuthEntryMode(
  mode: unknown,
  fallback: AuthEntryMode = 'login'
): AuthEntryMode {
  if (typeof mode === 'string' && VALID_AUTH_ENTRY_MODES.has(mode)) {
    return mode as AuthEntryMode;
  }
  return fallback;
}
