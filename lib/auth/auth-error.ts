/**
 * Normalizes and humanizes Supabase / WebView / Fetch authentication errors
 * so raw serialized objects like "{}" or "[object Object]" are never shown in the UI.
 */

export interface AuthErrorLike {
  message?: unknown;
  msg?: unknown;
  error?: unknown;
  error_description?: unknown;
  code?: unknown;
  error_code?: unknown;
  name?: unknown;
  status?: unknown;
}

const EMPTY_SERIALIZED_VALUES = new Set([
  '',
  '{}',
  '[]',
  'null',
  'undefined',
  '[object object]',
]);

function extractRawString(err: unknown, depth = 0): string {
  if (err == null || depth > 3) return '';

  if (typeof err === 'string') {
    const trimmed = err.trim();
    if (EMPTY_SERIALIZED_VALUES.has(trimmed.toLowerCase())) return '';

    // Attempt to unwrap JSON strings like '{"message":"..."}' or '{"error":{}}'
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        return extractRawString(parsed, depth + 1);
      } catch {
        // Not valid JSON; treat literal braces-only strings as empty
        if (/^[\s{}[\]]+$/.test(trimmed)) return '';
        return trimmed;
      }
    }
    return trimmed;
  }

  if (typeof err === 'object') {
    const obj = err as AuthErrorLike;
    const candidates = [obj.message, obj.error_description, obj.msg, obj.error];
    for (const candidate of candidates) {
      const extracted = extractRawString(candidate, depth + 1);
      if (extracted) return extracted;
    }
  }

  return '';
}

function extractStatus(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const status = (err as AuthErrorLike).status;
  return typeof status === 'number' && Number.isFinite(status) ? status : undefined;
}

function extractCode(err: unknown): string {
  if (!err || typeof err !== 'object') return '';
  const obj = err as AuthErrorLike;
  const rawCode = obj.code ?? obj.error_code ?? '';
  return typeof rawCode === 'string' ? rawCode.trim().toLowerCase() : '';
}

function extractName(err: unknown): string {
  if (!err || typeof err !== 'object') return '';
  const name = (err as AuthErrorLike).name;
  return typeof name === 'string' ? name.trim() : '';
}

export function isRetryableAuthError(err: unknown): boolean {
  if (!err) return false;
  const name = extractName(err);
  const status = extractStatus(err);
  const raw = extractRawString(err);
  const lower = raw.toLowerCase();

  if (name === 'AuthRetryableFetchError' || name === 'AuthUnknownError') return true;
  if (status === 0 || (status !== undefined && status >= 500)) return true;
  if (!raw && typeof err === 'object') return true;
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('load failed') ||
    lower.includes('fetch')
  ) {
    return true;
  }
  return false;
}

export function formatAuthError(
  err: unknown,
  fallback = 'Authentication service is temporarily unavailable. Please try again in a moment.'
): string {
  const raw = extractRawString(err);
  const lower = raw.toLowerCase();
  const status = extractStatus(err);
  const code = extractCode(err);
  const name = extractName(err);

  // Known auth domain codes / messages first
  if (
    code === 'user_already_exists' ||
    lower.includes('user already registered') ||
    lower.includes('already registered')
  ) {
    return 'An account with this email already exists. Please Sign In or reset your password.';
  }

  if (
    code === 'invalid_credentials' ||
    lower.includes('invalid login credentials')
  ) {
    return "Invalid email or password. Please verify your credentials or use 'Forgot?' to reset your password.";
  }

  if (
    code === 'email_not_confirmed' ||
    lower.includes('email not confirmed')
  ) {
    return 'Verification Pending: Your email is not confirmed yet. Check your inbox or click below to resend the activation link.';
  }

  if (
    status === 429 ||
    code === 'over_email_send_rate_limit' ||
    code === 'over_request_rate_limit' ||
    lower.includes('rate limit') ||
    lower.includes('for security purposes, you can only request this after')
  ) {
    return 'Too many verification requests right now. Please wait a minute and try again.';
  }

  if (code === 'weak_password' || lower.includes('weak password')) {
    return 'Password is too weak. Please choose a stronger password with at least 8 characters.';
  }

  if (
    code === 'email_address_invalid' ||
    (lower.includes('unable to validate email address') && lower.includes('invalid'))
  ) {
    return 'Please enter a valid email address.';
  }

  if (code === 'signup_disabled' || lower.includes('signups not allowed')) {
    return 'New email sign-ups are temporarily paused. Please try Continue with Google or check back shortly.';
  }

  // Server 5xx / Cloudflare / SMTP timeout (often serialized by auth-js as "{}")
  if (status !== undefined && status >= 500) {
    return 'The authentication service could not complete this request right now (temporary server or email delay). Please try again in a moment or use Continue with Google.';
  }

  // Network / CORS / in-app browser WebView fetch block (status 0 or AuthRetryableFetchError with "{}")
  if (
    status === 0 ||
    name === 'AuthRetryableFetchError' ||
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('load failed')
  ) {
    return 'Could not connect to the authentication server. Please check your connection — or open this page in Chrome/Safari if you are using an in-app browser — and try again.';
  }

  if (name === 'AuthUnknownError' && !raw) {
    return fallback;
  }

  // Never allow literal curly braces or empty serialized values through
  if (!raw || EMPTY_SERIALIZED_VALUES.has(lower) || /^[\s{}[\]]+$/.test(raw)) {
    return fallback;
  }

  return raw;
}
