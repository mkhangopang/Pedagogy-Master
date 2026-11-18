import { createHash } from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import { kv } from '../kv';
import { isAdminUser } from '../auth/user-role';
import { SubscriptionPlan, UserProfile, UserRole } from '../../types';

export interface AiQuotaStatus {
  allowed: boolean;
  isDeveloper: boolean;
  plan: SubscriptionPlan;
  limit: number | null;
  used: number;
  remaining: number | null;
  globalUsed: number;
  globalLimit: number;
  resetsAt: string;
  reason?: 'user_daily_limit' | 'global_capacity_limit';
}

export const FREE_DAILY_AI_LIMIT = parseInt(
  process.env.FREE_DAILY_AI_LIMIT || process.env.DAILY_USER_AI_LIMIT || '25',
  10
);
export const PAID_DAILY_AI_LIMIT = parseInt(
  process.env.PAID_DAILY_AI_LIMIT || '200',
  10
);
export const GLOBAL_DAILY_AI_LIMIT = parseInt(
  process.env.DAILY_GLOBAL_AI_LIMIT || '1500',
  10
);

export function getUtcDayWindow(now: Date = new Date()): {
  dayKey: string;
  startIso: string;
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
    startIso: start.toISOString(),
    resetsAtIso: end.toISOString(),
    ttlSeconds: 2 * 86400,
  };
}

export function computeAiQuotaStatus(params: {
  role?: string | null;
  email?: string | null;
  plan?: string | null;
  userUsed: number;
  globalUsed: number;
  now?: Date;
}): AiQuotaStatus {
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

  const { resetsAtIso } = getUtcDayWindow(params.now);

  if (isDeveloper) {
    return {
      allowed: true,
      isDeveloper: true,
      plan: normalizedPlan,
      limit: null,
      used: Math.max(0, params.userUsed),
      remaining: null,
      globalUsed: Math.max(0, params.globalUsed),
      globalLimit: GLOBAL_DAILY_AI_LIMIT,
      resetsAt: resetsAtIso,
    };
  }

  const isPaid =
    normalizedPlan === SubscriptionPlan.PRO ||
    normalizedPlan === SubscriptionPlan.ENTERPRISE;
  const userLimit = isPaid ? PAID_DAILY_AI_LIMIT : FREE_DAILY_AI_LIMIT;
  const safeUserUsed = Math.max(0, params.userUsed);
  const safeGlobalUsed = Math.max(0, params.globalUsed);

  if (safeUserUsed >= userLimit) {
    return {
      allowed: false,
      isDeveloper: false,
      plan: normalizedPlan,
      limit: userLimit,
      used: safeUserUsed,
      remaining: 0,
      globalUsed: safeGlobalUsed,
      globalLimit: GLOBAL_DAILY_AI_LIMIT,
      resetsAt: resetsAtIso,
      reason: 'user_daily_limit',
    };
  }

  if (safeGlobalUsed >= GLOBAL_DAILY_AI_LIMIT) {
    return {
      allowed: false,
      isDeveloper: false,
      plan: normalizedPlan,
      limit: userLimit,
      used: safeUserUsed,
      remaining: Math.max(0, userLimit - safeUserUsed),
      globalUsed: safeGlobalUsed,
      globalLimit: GLOBAL_DAILY_AI_LIMIT,
      resetsAt: resetsAtIso,
      reason: 'global_capacity_limit',
    };
  }

  return {
    allowed: true,
    isDeveloper: false,
    plan: normalizedPlan,
    limit: userLimit,
    used: safeUserUsed,
    remaining: Math.max(0, userLimit - safeUserUsed),
    globalUsed: safeGlobalUsed,
    globalLimit: GLOBAL_DAILY_AI_LIMIT,
    resetsAt: resetsAtIso,
  };
}

export function buildAiQuotaExceededMessage(status: AiQuotaStatus): string {
  if (status.reason === 'global_capacity_limit') {
    return 'High community traffic right now — shared free capacity has reached today’s limit to keep the platform stable. Please try again tomorrow (UTC).';
  }
  return `You have used all ${status.limit} free daily AI syntheses (${status.used}/${status.limit}) for today. Your quota resets automatically tomorrow (UTC) so the platform stays fast and smooth for every educator.`;
}

async function resolveProfileForQuota(
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

export async function getAiQuotaStatus(params: {
  supabase: SupabaseClient;
  userId: string;
  authEmail?: string | null;
  now?: Date;
}): Promise<AiQuotaStatus> {
  const { supabase, userId, authEmail } = params;
  const now = params.now ?? new Date();
  const profile = await resolveProfileForQuota(supabase, userId, authEmail);
  const preview = computeAiQuotaStatus({
    ...profile,
    userUsed: 0,
    globalUsed: 0,
    now,
  });

  if (preview.isDeveloper) {
    return preview;
  }

  const { dayKey, startIso, ttlSeconds } = getUtcDayWindow(now);
  const userKvKey = `ai:quota:v1:user:${userId}:${dayKey}`;
  const globalKvKey = `ai:quota:v1:global:${dayKey}`;

  const [dbCountRes, kvUserCount, kvGlobalCount] = await Promise.all([
    Promise.resolve(
      supabase
        .from('improvement_signals')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('signal_type', 'ai_quota_usage')
        .gte('created_at', startIso)
    )
      .then(({ count, error }) => (!error && typeof count === 'number' ? count : 0))
      .catch(() => 0),
    kv.get<number>(userKvKey).then((v) => v || 0).catch(() => 0),
    kv.get<number>(globalKvKey).then((v) => v || 0).catch(() => 0),
  ]);

  const dbUserCount = dbCountRes;
  const userUsed = Math.max(dbUserCount, kvUserCount);
  if (dbUserCount > kvUserCount) {
    kv.set(userKvKey, dbUserCount, ttlSeconds).catch(() => {});
  }

  return computeAiQuotaStatus({
    ...profile,
    userUsed,
    globalUsed: kvGlobalCount,
    now,
  });
}

export async function checkAndConsumeAiQuota(params: {
  supabase: SupabaseClient;
  userId: string;
  authEmail?: string | null;
  routeName: string;
  now?: Date;
}): Promise<AiQuotaStatus> {
  const { supabase, userId, authEmail, routeName } = params;
  const now = params.now ?? new Date();
  const statusBefore = await getAiQuotaStatus({ supabase, userId, authEmail, now });

  if (statusBefore.isDeveloper || !statusBefore.allowed) {
    return statusBefore;
  }

  const { dayKey, ttlSeconds } = getUtcDayWindow(now);
  const userKvKey = `ai:quota:v1:user:${userId}:${dayKey}`;
  const globalKvKey = `ai:quota:v1:global:${dayKey}`;

  const [nextUserKv, nextGlobalKv] = await Promise.all([
    kv.incr(userKvKey, ttlSeconds).catch(() => statusBefore.used + 1),
    kv.incr(globalKvKey, ttlSeconds).catch(() => statusBefore.globalUsed + 1),
  ]);

  // Persist user's consumption in Supabase non-blocking so stream TTFB has zero extra DB wait
  void Promise.resolve(
    supabase.from('improvement_signals').insert({
      user_id: userId,
      signal_type: 'ai_quota_usage',
      signal_data: {
        route: routeName,
        dayKey,
      },
      tool_type: routeName,
      compiled: false,
      created_at: now.toISOString(),
    })
  ).catch(() => {});

  const nextUsed = Math.max(statusBefore.used + 1, nextUserKv);
  const nextGlobalUsed = Math.max(statusBefore.globalUsed + 1, nextGlobalKv);

  return computeAiQuotaStatus({
    email: authEmail,
    plan: statusBefore.plan,
    role: UserRole.TEACHER,
    userUsed: nextUsed,
    globalUsed: nextGlobalUsed,
    now,
  });
}

export function buildShortCooldownMessage(retryAfterSeconds?: number): string {
  const wait = retryAfterSeconds && retryAfterSeconds > 0 ? retryAfterSeconds : 15;
  return `High demand right now — please wait about ${wait}s before sending your next request so the system stays smooth for everyone.`;
}

export function hashAnonIdentifier(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}
