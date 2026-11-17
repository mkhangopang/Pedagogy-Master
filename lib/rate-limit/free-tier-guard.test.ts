import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  computeAiQuotaStatus,
  buildAiQuotaExceededMessage,
  FREE_DAILY_AI_LIMIT,
  GLOBAL_DAILY_AI_LIMIT,
} from './free-tier-guard';
import { SubscriptionPlan } from '../../types';

describe('Free Tier Daily Quota & Capacity Guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows free users within daily limit and computes accurate remaining syntheses', () => {
    const status = computeAiQuotaStatus({
      plan: SubscriptionPlan.FREE,
      role: 'teacher',
      email: 'teacher@example.com',
      userUsed: 5,
      globalUsed: 42,
    });

    expect(status.allowed).toBe(true);
    expect(status.isDeveloper).toBe(false);
    expect(status.limit).toBe(FREE_DAILY_AI_LIMIT);
    expect(status.remaining).toBe(FREE_DAILY_AI_LIMIT - 5);
  });

  it('blocks free users smoothly when daily limit is reached', () => {
    const status = computeAiQuotaStatus({
      plan: SubscriptionPlan.FREE,
      role: 'teacher',
      email: 'teacher@example.com',
      userUsed: FREE_DAILY_AI_LIMIT,
      globalUsed: 100,
    });

    expect(status.allowed).toBe(false);
    expect(status.reason).toBe('user_daily_limit');
    expect(status.remaining).toBe(0);
    expect(buildAiQuotaExceededMessage(status)).toContain('resets automatically tomorrow');
  });

  it('trips global circuit breaker when shared viral traffic exceeds global capacity', () => {
    const status = computeAiQuotaStatus({
      plan: SubscriptionPlan.FREE,
      role: 'teacher',
      email: 'teacher@example.com',
      userUsed: 1,
      globalUsed: GLOBAL_DAILY_AI_LIMIT,
    });

    expect(status.allowed).toBe(false);
    expect(status.reason).toBe('global_capacity_limit');
    expect(buildAiQuotaExceededMessage(status)).toContain('High community traffic');
  });

  it('bypasses all limits for developer/admin account', () => {
    const status = computeAiQuotaStatus({
      plan: SubscriptionPlan.FREE,
      role: 'app_admin',
      email: 'mkgopang@gmail.com',
      userUsed: 9999,
      globalUsed: 99999,
    });

    expect(status.allowed).toBe(true);
    expect(status.isDeveloper).toBe(true);
    expect(status.limit).toBeNull();
    expect(status.remaining).toBeNull();
  });
});
