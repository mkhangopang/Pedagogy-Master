/**
 * NEXT.JS EDGE MIDDLEWARE — Per-User Rate Limiting
 *
 * BUG-05 FIX: The previous codebase had no HTTP-level rate limiting.
 * The only rate limiting was per AI provider (shared across ALL users),
 * meaning one heavy user could exhaust the free Gemini quota for everyone.
 *
 * This middleware enforces per-user limits on the expensive API routes:
 *   - /api/chat          — 30 req/min  (conversational AI)
 *   - /api/query         — 20 req/min  (RAG search)
 *   - /api/docs/process  — 5 req/min   (ingestion — already slow by design)
 *
 * Implementation uses the edge runtime's built-in Request IP as the key
 * combined with the Authorization token prefix (first 16 chars of JWT) so
 * that different users on the same IP are tracked separately.
 *
 * Storage: In-memory Map on the edge worker. This is intentionally simple —
 * for multi-region deployments replace with an Upstash Redis KV call.
 *
 * NOTE: Vercel Edge Middleware runs before any route handler, adding <1ms overhead.
 */

import { NextRequest, NextResponse } from 'next/server';

export const config = {
  matcher: ['/api/chat', '/api/query', '/api/docs/process/:path*'],
};

interface RateWindow {
  count: number;
  resetAt: number;
}

// In-memory store — resets on cold start (acceptable for edge workers)
const rateLimitStore = new Map<string, RateWindow>();

const LIMITS: Record<string, { rpm: number }> = {
  '/api/chat':  { rpm: 30 },
  '/api/query': { rpm: 20 },
  '/api/docs/process': { rpm: 5 },
};

function getLimitForPath(pathname: string): number {
  for (const [prefix, cfg] of Object.entries(LIMITS)) {
    if (pathname.startsWith(prefix)) return cfg.rpm;
  }
  return 60; // default
}

function getRateLimitKey(req: NextRequest): string {
  // Use token prefix so different users on shared IPs are tracked separately.
  const authHeader = req.headers.get('Authorization') ?? '';
  const tokenPrefix = authHeader.replace('Bearer ', '').substring(0, 16) || 'anon';
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  return `${ip}:${tokenPrefix}`;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const rpm = getLimitForPath(pathname);
  const key = `${getRateLimitKey(req)}:${pathname.split('/').slice(0, 4).join('/')}`;
  const now = Date.now();

  let window = rateLimitStore.get(key);

  if (!window || now > window.resetAt) {
    window = { count: 0, resetAt: now + 60_000 };
  }

  window.count++;
  rateLimitStore.set(key, window);

  const remaining = Math.max(0, rpm - window.count);
  const resetIn = Math.ceil((window.resetAt - now) / 1000);

  if (window.count > rpm) {
    return new NextResponse(
      JSON.stringify({
        error: 'Rate limit exceeded. Please slow down.',
        retryAfter: resetIn,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': String(rpm),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(window.resetAt / 1000)),
          'Retry-After': String(resetIn),
        },
      }
    );
  }

  const res = NextResponse.next();
  res.headers.set('X-RateLimit-Limit', String(rpm));
  res.headers.set('X-RateLimit-Remaining', String(remaining));
  res.headers.set('X-RateLimit-Reset', String(Math.ceil(window.resetAt / 1000)));
  return res;
}
