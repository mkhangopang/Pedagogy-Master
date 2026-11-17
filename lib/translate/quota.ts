import { createHash } from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import { isAdminUser } from '../auth/user-role';
import { kv } from '../kv';
import { SubscriptionPlan, UserProfile, UserRole } from '../../types';

export type QuotaPeriod = 'unlimited' | 'day' | 'month';

export interface TranslationQuotaStatus {
  allowed: boolean;
  isDeveloper: boolean;
  plan: SubscriptionPlan;
  limit: number | null;
  used: number;
  remaining: number | null;
  period: QuotaPeriod;
  resetsAt: string | null;
}

export const FREE_MONTHLY_TRANSLATION_LIMIT = 5;
export const PAID_DAILY_TRANSLATION_LIMIT = 5;

export function getQuotaWindow(period: 'day' | 'month', now: Date = new Date()): {
  windowKey: string;
  windowStartIso: string;
  resetsAtIso: string;
  ttlSeconds: number;
} {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();

  if (period === 'day') {
    const start = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, day + 1, 0, 0, 0, 0));
    const windowKey = start.toISOString().slice(0, 10);
    return {
      windowKey,
      windowStartIso: start.toISOString(),
      resetsAtIso: end.toISOString(),
      ttlSeconds: 2 * 86400,
    };
  }

  const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));
  const windowKey = start.toISOString().slice(0, 7);
  return {
    windowKey,
    windowStartIso: start.toISOString(),
    resetsAtIso: end.toISOString(),
    ttlSeconds: 32 * 86400,
  };
}

export function computeTranslationQuota(params: {
  role?: string | null;
  email?: string | null;
  plan?: string | null;
  used: number;
  now?: Date;
}): TranslationQuotaStatus {
  const normalizedPlan =
    params.plan === SubscriptionPlan.PRO
      ? SubscriptionPlan.PRO
      : params.plan === SubscriptionPlan.ENTERPRISE
        ? SubscriptionPlan.ENTERPRISE
        : SubscriptionPlan.FREE;

  const isDeveloper = isAdminUser({
    email: params.email || '',
    role: (params.role as UserRole) || UserRole.TEACHER,
  } as UserProfile);

  if (isDeveloper) {
    return {
      allowed: true,
      isDeveloper: true,
      plan: normalizedPlan,
      limit: null,
      used: params.used,
      remaining: null,
      period: 'unlimited',
      resetsAt: null,
    };
  }

  const isPaid =
    normalizedPlan === SubscriptionPlan.PRO ||
    normalizedPlan === SubscriptionPlan.ENTERPRISE;
  const period: 'day' | 'month' = isPaid ? 'day' : 'month';
  const limit = isPaid
    ? PAID_DAILY_TRANSLATION_LIMIT
    : FREE_MONTHLY_TRANSLATION_LIMIT;
  const { resetsAtIso } = getQuotaWindow(period, params.now);
  const safeUsed = Math.max(0, params.used);
  const remaining = Math.max(0, limit - safeUsed);

  return {
    allowed: safeUsed < limit,
    isDeveloper: false,
    plan: normalizedPlan,
    limit,
    used: safeUsed,
    remaining,
    period,
    resetsAt: resetsAtIso,
  };
}

export function buildQuotaExceededMessage(quota: TranslationQuotaStatus): string {
  if (quota.period === 'day') {
    return `Daily translation limit reached (${quota.used}/${quota.limit} Urdu & Sindhi translations used today). Your limit resets tomorrow (UTC).`;
  }
  return `Free plan translation limit reached (${quota.used}/${quota.limit} Urdu & Sindhi translations used this month). Pro (~$9/mo USD) with 5 translations/day will be available soon.`;
}

async function resolveUserAccessProfile(
  supabase: SupabaseClient,
  userId: string,
  authEmail?: string | null
): Promise<{ role: string | null; email: string | null; plan: string | null }> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, email, plan')
      .eq('id', userId)
      .maybeSingle();

    return {
      role: profile?.role ?? null,
      email: profile?.email ?? authEmail ?? null,
      plan: profile?.plan ?? null,
    };
  } catch {
    return {
      role: null,
      email: authEmail ?? null,
      plan: null,
    };
  }
}

export async function checkTranslationQuota(
  supabase: SupabaseClient,
  userId: string,
  authEmail?: string | null,
  now: Date = new Date()
): Promise<TranslationQuotaStatus> {
  const profile = await resolveUserAccessProfile(supabase, userId, authEmail);

  // Developer mode bypass check before counting
  const devPreview = computeTranslationQuota({
    ...profile,
    used: 0,
    now,
  });
  if (devPreview.isDeveloper) {
    return devPreview;
  }

  const period: 'day' | 'month' =
    devPreview.period === 'day' ? 'day' : 'month';
  const { windowKey, windowStartIso, ttlSeconds } = getQuotaWindow(period, now);
  const kvKey = `translate:quota:v1:${userId}:${period}:${windowKey}`;

  let dbCount = 0;
  try {
    const { count, error } = await supabase
      .from('improvement_signals')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('signal_type', 'translation_usage')
      .gte('created_at', windowStartIso);

    if (!error && typeof count === 'number') {
      dbCount = count;
    }
  } catch {
    // Non-blocking fallback to KV
  }

  const kvCount = (await kv.get<number>(kvKey)) || 0;
  const used = Math.max(dbCount, kvCount);

  if (dbCount > kvCount) {
    await kv.set(kvKey, dbCount, ttlSeconds);
  }

  return computeTranslationQuota({
    ...profile,
    used,
    now,
  });
}

export async function recordTranslationUsage(params: {
  supabase: SupabaseClient;
  userId: string;
  authEmail?: string | null;
  targetLanguage: 'ur' | 'sd';
  provider: string;
  charLength: number;
  cacheHit?: boolean;
  now?: Date;
}): Promise<TranslationQuotaStatus> {
  const { supabase, userId, authEmail, targetLanguage, provider, charLength, cacheHit } = params;
  const now = params.now ?? new Date();
  const statusBefore = await checkTranslationQuota(supabase, userId, authEmail, now);

  if (statusBefore.isDeveloper) {
    return statusBefore;
  }

  const period: 'day' | 'month' =
    statusBefore.period === 'day' ? 'day' : 'month';
  const { windowKey, ttlSeconds } = getQuotaWindow(period, now);
  const kvKey = `translate:quota:v1:${userId}:${period}:${windowKey}`;

  // Record in persistent DB table + KV atomically
  try {
    await supabase.from('improvement_signals').insert({
      user_id: userId,
      signal_type: 'translation_usage',
      signal_data: {
        targetLanguage,
        plan: statusBefore.plan,
        period,
        provider,
        charLength,
        cacheHit: Boolean(cacheHit),
      },
      tool_type: `translate_${targetLanguage}`,
      created_at: now.toISOString(),
      compiled: false,
    });
  } catch (err) {
    console.warn('[TranslateQuota] Persistent DB usage log warning:', err);
  }

  const nextUsed = Math.max(statusBefore.used + 1, await kv.incr(kvKey, ttlSeconds));

  return computeTranslationQuota({
    email: authEmail,
    plan: statusBefore.plan,
    role: UserRole.TEACHER,
    used: nextUsed,
    now,
  });
}

export function buildTranslationCacheKey(
  text: string,
  targetLanguage: 'ur' | 'sd'
): string {
  const normalized = text.trim();
  const digest = createHash('sha256')
    .update(`${targetLanguage}:${normalized}`)
    .digest('hex');
  return `translate:cache:v2:${targetLanguage}:${digest}`;
}

export interface CachedTranslationPayload {
  translatedText: string;
  provider: string;
  qaApplied?: boolean;
  bracketedTermsCount?: number;
  deduplicatedCount?: number;
}

export async function getCachedTranslation(
  text: string,
  targetLanguage: 'ur' | 'sd'
): Promise<CachedTranslationPayload | null> {
  const key = buildTranslationCacheKey(text, targetLanguage);
  return kv.get<CachedTranslationPayload>(key);
}

export async function setCachedTranslation(
  text: string,
  targetLanguage: 'ur' | 'sd',
  payload: CachedTranslationPayload
): Promise<void> {
  const key = buildTranslationCacheKey(text, targetLanguage);
  // Cache for 7 days to avoid burning redundant Google Translate / Gemini tokens
  await kv.set(key, payload, 7 * 86400);
}
