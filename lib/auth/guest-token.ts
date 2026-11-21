import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { kv } from '../kv';
import { SubscriptionPlan } from '../../types';

export const GUEST_TOKEN_PREFIX = 'pm_guest_';
export const GUEST_SESSION_TTL_SECONDS = 2 * 60 * 60; // 2 hours
export const CAPTCHA_TTL_SECONDS = 5 * 60; // 5 minutes
export const CAPTCHA_MIN_SOLVE_MS = 400;
export const GUEST_SESSION_QUERY_LIMIT = 5;
export const GUEST_IP_DAILY_LIMIT = 8;

const fallbackSecret = randomBytes(32).toString('hex');

function getGuestSigningSecret(): string {
  return (
    process.env.GUEST_TOKEN_SECRET ||
    process.env.SESSION_SECRET ||
    process.env.CRON_SECRET ||
    fallbackSecret
  );
}

function toBase64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const mod = padded.length % 4;
  const full = mod === 0 ? padded : padded + '='.repeat(4 - mod);
  return Buffer.from(full, 'base64').toString('utf8');
}

function signHmac(data: string): string {
  return toBase64Url(
    createHmac('sha256', getGuestSigningSecret()).update(data).digest()
  );
}

function constantTimeMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function hashAnswer(answer: string, nonce: string): string {
  return createHash('sha256')
    .update(`${nonce}:${answer.trim()}`)
    .digest('hex');
}

export function hashClientIp(ip: string): string {
  return createHash('sha256')
    .update(`${getGuestSigningSecret()}:ip:${ip}`)
    .digest('hex')
    .slice(0, 16);
}

export interface CaptchaChallengePayload {
  nonce: string;
  answerHash: string;
  iat: number;
  exp: number;
}

export interface CaptchaChallengeResponse {
  challengeToken: string;
  imageDataUrl: string;
  expiresAt: number;
}

function renderMathCaptchaSvg(expression: string): string {
  const chars = expression.split('');
  const width = 220;
  const height = 64;

  // Deterministic-looking subtle noise lines without exposing answer digits cleanly
  const noiseLines: string[] = [];
  for (let i = 0; i < 4; i++) {
    const x1 = randomBytes(1)[0] % 40;
    const y1 = 10 + (randomBytes(1)[0] % 44);
    const x2 = width - (randomBytes(1)[0] % 40);
    const y2 = 10 + (randomBytes(1)[0] % 44);
    noiseLines.push(
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#6366f1" stroke-opacity="0.28" stroke-width="1.5" stroke-dasharray="4 3" />`
    );
  }

  const charNodes = chars
    .map((ch, idx) => {
      const x = 22 + idx * 24 + ((randomBytes(1)[0] % 5) - 2);
      const y = 41 + ((randomBytes(1)[0] % 7) - 3);
      const rot = ((randomBytes(1)[0] % 19) - 9);
      const color = idx % 2 === 0 ? '#1e1b4b' : '#312e81';
      return `<text x="${x}" y="${y}" transform="rotate(${rot} ${x} ${y})" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="25" font-weight="800" fill="${color}">${ch}</text>`;
    })
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Simple math security verification">
  <rect width="${width}" height="${height}" rx="14" fill="#eef2ff" />
  <circle cx="${25 + (randomBytes(1)[0] % 160)}" cy="${14 + (randomBytes(1)[0] % 36)}" r="16" fill="#4f46e5" fill-opacity="0.07" />
  <circle cx="${25 + (randomBytes(1)[0] % 160)}" cy="${14 + (randomBytes(1)[0] % 36)}" r="12" fill="#10b981" fill-opacity="0.08" />
  ${noiseLines.join('')}
  ${charNodes}
</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

export function createCaptchaChallenge(nowMs: number = Date.now()): CaptchaChallengeResponse {
  const isAddition = (randomBytes(1)[0] % 2) === 0;
  let a = 2 + (randomBytes(1)[0] % 8); // 2..9
  let b = 1 + (randomBytes(1)[0] % 8); // 1..8
  if (!isAddition && b > a) {
    [a, b] = [b, a];
  }
  const answer = isAddition ? a + b : a - b;
  const operator = isAddition ? '+' : '-';
  const expression = `${a} ${operator} ${b} = ?`;

  const nonce = randomBytes(12).toString('hex');
  const exp = nowMs + CAPTCHA_TTL_SECONDS * 1000;
  const payload: CaptchaChallengePayload = {
    nonce,
    answerHash: hashAnswer(String(answer), nonce),
    iat: nowMs,
    exp,
  };

  const encoded = toBase64Url(JSON.stringify(payload));
  const sig = signHmac(`captcha:${encoded}`);

  return {
    challengeToken: `${encoded}.${sig}`,
    imageDataUrl: renderMathCaptchaSvg(expression),
    expiresAt: exp,
  };
}

export interface CaptchaVerifyResult {
  ok: boolean;
  error?: string;
}

export async function verifyCaptchaChallenge(params: {
  challengeToken: string;
  answer: string;
  honeypot?: string;
  nowMs?: number;
}): Promise<CaptchaVerifyResult> {
  const { challengeToken, answer, honeypot } = params;
  const nowMs = params.nowMs ?? Date.now();

  if (honeypot && honeypot.trim().length > 0) {
    return { ok: false, error: 'Automated submission rejected.' };
  }

  if (!challengeToken || typeof challengeToken !== 'string' || !challengeToken.includes('.')) {
    return { ok: false, error: 'Security check expired. Please refresh and try again.' };
  }

  const [encoded, sig] = challengeToken.split('.');
  if (!encoded || !sig) {
    return { ok: false, error: 'Invalid security challenge.' };
  }

  const expectedSig = signHmac(`captcha:${encoded}`);
  if (!constantTimeMatch(sig, expectedSig)) {
    return { ok: false, error: 'Security check signature invalid. Please refresh.' };
  }

  let payload: CaptchaChallengePayload;
  try {
    payload = JSON.parse(fromBase64Url(encoded)) as CaptchaChallengePayload;
  } catch {
    return { ok: false, error: 'Malformed security challenge.' };
  }

  if (!payload?.nonce || !payload?.answerHash || typeof payload.exp !== 'number' || typeof payload.iat !== 'number') {
    return { ok: false, error: 'Invalid security challenge payload.' };
  }

  if (nowMs > payload.exp) {
    return { ok: false, error: 'Security check expired. Please refresh and answer the new challenge.' };
  }

  if (nowMs - payload.iat < CAPTCHA_MIN_SOLVE_MS) {
    return { ok: false, error: 'Please take a moment to solve the human verification check.' };
  }

  const cleanAnswer = String(answer ?? '').trim();
  if (!/^-?\d{1,3}$/.test(cleanAnswer)) {
    return { ok: false, error: 'Please enter the numeric answer shown in the verification box.' };
  }

  const candidateHash = hashAnswer(cleanAnswer, payload.nonce);
  if (!constantTimeMatch(candidateHash, payload.answerHash)) {
    return { ok: false, error: 'Incorrect answer. Please check the math prompt or refresh.' };
  }

  // Enforce single-use challenge nonce
  const usedKey = `auth:captcha:used:${payload.nonce}`;
  const alreadyUsed = await kv.get<boolean>(usedKey).catch(() => false);
  if (alreadyUsed) {
    return { ok: false, error: 'This security challenge was already used. Please refresh for a new one.' };
  }
  await kv.set(usedKey, true, CAPTCHA_TTL_SECONDS + 60).catch(() => {});

  return { ok: true };
}

export interface GuestTokenPayload {
  sub: string;
  role: 'guest';
  limit: number;
  iat: number;
  exp: number;
}

export function isGuestToken(token: string | undefined | null): boolean {
  return typeof token === 'string' && token.startsWith(GUEST_TOKEN_PREFIX);
}

export function mintGuestToken(nowMs: number = Date.now()): {
  guestToken: string;
  guestId: string;
  expiresAt: number;
  limit: number;
} {
  const guestId = `guest_${randomBytes(8).toString('hex')}`;
  const exp = nowMs + GUEST_SESSION_TTL_SECONDS * 1000;
  const payload: GuestTokenPayload = {
    sub: guestId,
    role: 'guest',
    limit: GUEST_SESSION_QUERY_LIMIT,
    iat: nowMs,
    exp,
  };

  const encoded = toBase64Url(JSON.stringify(payload));
  const sig = signHmac(`guest:${encoded}`);
  return {
    guestToken: `${GUEST_TOKEN_PREFIX}${encoded}.${sig}`,
    guestId,
    expiresAt: exp,
    limit: GUEST_SESSION_QUERY_LIMIT,
  };
}

export function verifyGuestToken(
  token: string | undefined | null,
  nowMs: number = Date.now()
): GuestTokenPayload | null {
  if (!isGuestToken(token)) return null;
  const raw = token!.slice(GUEST_TOKEN_PREFIX.length);
  const dotIdx = raw.indexOf('.');
  if (dotIdx <= 0) return null;

  const encoded = raw.slice(0, dotIdx);
  const sig = raw.slice(dotIdx + 1);
  if (!encoded || !sig) return null;

  const expectedSig = signHmac(`guest:${encoded}`);
  if (!constantTimeMatch(sig, expectedSig)) return null;

  try {
    const payload = JSON.parse(fromBase64Url(encoded)) as GuestTokenPayload;
    if (
      !payload ||
      payload.role !== 'guest' ||
      typeof payload.sub !== 'string' ||
      !payload.sub.startsWith('guest_') ||
      typeof payload.exp !== 'number' ||
      nowMs > payload.exp
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export interface GuestQuotaStatus {
  allowed: boolean;
  isDeveloper: false;
  isGuest: true;
  plan: SubscriptionPlan;
  limit: number;
  used: number;
  remaining: number;
  period: 'session';
  resetsAt: string;
  reason?: 'guest_session_limit' | 'guest_ip_limit';
}

function getGuestDayWindow(now: Date = new Date()): {
  dayKey: string;
  resetsAtIso: string;
  ttlSeconds: number;
} {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
  );
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0)
  );
  return {
    dayKey: start.toISOString().slice(0, 10),
    resetsAtIso: end.toISOString(),
    ttlSeconds: 86400,
  };
}

export async function getGuestQuotaStatus(params: {
  guestId: string;
  clientIp?: string;
  now?: Date;
}): Promise<GuestQuotaStatus> {
  const now = params.now ?? new Date();
  const { dayKey, resetsAtIso } = getGuestDayWindow(now);
  const sessionKey = `guest:quota:v1:id:${params.guestId}:${dayKey}`;
  const ipHash = params.clientIp ? hashClientIp(params.clientIp) : null;
  const ipKey = ipHash ? `guest:quota:v1:ip:${ipHash}:${dayKey}` : null;

  const [sessionUsed, ipUsed] = await Promise.all([
    kv.get<number>(sessionKey).then((v) => v || 0).catch(() => 0),
    ipKey ? kv.get<number>(ipKey).then((v) => v || 0).catch(() => 0) : Promise.resolve(0),
  ]);

  const remainingSession = Math.max(0, GUEST_SESSION_QUERY_LIMIT - sessionUsed);
  const remainingIp = ipKey ? Math.max(0, GUEST_IP_DAILY_LIMIT - ipUsed) : GUEST_SESSION_QUERY_LIMIT;
  const effectiveRemaining = Math.min(remainingSession, remainingIp);

  if (ipUsed >= GUEST_IP_DAILY_LIMIT) {
    return {
      allowed: false,
      isDeveloper: false,
      isGuest: true,
      plan: SubscriptionPlan.FREE,
      limit: GUEST_SESSION_QUERY_LIMIT,
      used: GUEST_SESSION_QUERY_LIMIT,
      remaining: 0,
      period: 'session',
      resetsAt: resetsAtIso,
      reason: 'guest_ip_limit',
    };
  }

  if (sessionUsed >= GUEST_SESSION_QUERY_LIMIT) {
    return {
      allowed: false,
      isDeveloper: false,
      isGuest: true,
      plan: SubscriptionPlan.FREE,
      limit: GUEST_SESSION_QUERY_LIMIT,
      used: sessionUsed,
      remaining: 0,
      period: 'session',
      resetsAt: resetsAtIso,
      reason: 'guest_session_limit',
    };
  }

  return {
    allowed: true,
    isDeveloper: false,
    isGuest: true,
    plan: SubscriptionPlan.FREE,
    limit: GUEST_SESSION_QUERY_LIMIT,
    used: Math.max(0, GUEST_SESSION_QUERY_LIMIT - effectiveRemaining),
    remaining: effectiveRemaining,
    period: 'session',
    resetsAt: resetsAtIso,
  };
}

export async function consumeGuestQuota(params: {
  guestId: string;
  clientIp?: string;
  now?: Date;
}): Promise<GuestQuotaStatus> {
  const now = params.now ?? new Date();
  const statusBefore = await getGuestQuotaStatus({
    guestId: params.guestId,
    clientIp: params.clientIp,
    now,
  });

  if (!statusBefore.allowed) {
    return statusBefore;
  }

  const { dayKey, resetsAtIso, ttlSeconds } = getGuestDayWindow(now);
  const sessionKey = `guest:quota:v1:id:${params.guestId}:${dayKey}`;
  const ipHash = params.clientIp ? hashClientIp(params.clientIp) : null;
  const ipKey = ipHash ? `guest:quota:v1:ip:${ipHash}:${dayKey}` : null;

  const [nextSessionUsed, nextIpUsed] = await Promise.all([
    kv.incr(sessionKey, ttlSeconds).catch(() => statusBefore.used + 1),
    ipKey ? kv.incr(ipKey, ttlSeconds).catch(() => 1) : Promise.resolve(1),
  ]);

  const remainingSession = Math.max(0, GUEST_SESSION_QUERY_LIMIT - nextSessionUsed);
  const remainingIp = ipKey ? Math.max(0, GUEST_IP_DAILY_LIMIT - nextIpUsed) : GUEST_SESSION_QUERY_LIMIT;
  const effectiveRemaining = Math.min(remainingSession, remainingIp);

  return {
    allowed: nextSessionUsed <= GUEST_SESSION_QUERY_LIMIT && (!ipKey || nextIpUsed <= GUEST_IP_DAILY_LIMIT),
    isDeveloper: false,
    isGuest: true,
    plan: SubscriptionPlan.FREE,
    limit: GUEST_SESSION_QUERY_LIMIT,
    used: Math.min(GUEST_SESSION_QUERY_LIMIT, Math.max(nextSessionUsed, GUEST_SESSION_QUERY_LIMIT - effectiveRemaining)),
    remaining: effectiveRemaining,
    period: 'session',
    resetsAt: resetsAtIso,
  };
}

export function buildGuestQuotaExceededMessage(status: GuestQuotaStatus): string {
  if (status.reason === 'guest_ip_limit') {
    return 'Guest preview limit reached on this network for today. Create a free educator account to unlock 25 daily AI syntheses, PDF uploads, and Urdu/Sindhi translations.';
  }
  return `You have used all ${status.limit} free guest preview syntheses. Create a free educator account to unlock 25 syntheses/day, Curriculum Vault uploads, and Urdu/Sindhi translations.`;
}

export function extractRequestIp(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return 'unknown';
}
