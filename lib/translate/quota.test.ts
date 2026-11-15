import { describe, it, expect } from 'vitest';
import {
  buildQuotaExceededMessage,
  buildTranslationCacheKey,
  computeTranslationQuota,
  getQuotaWindow,
} from './quota';
import { SubscriptionPlan, UserRole } from '../../types';

describe('Translation Quota & Token Optimization Engine', () => {
  const fixedDate = new Date('2026-11-15T10:30:00.000Z');

  it('restricts free users to 5 Urdu/Sindhi translations per month', () => {
    const underLimit = computeTranslationQuota({
      role: UserRole.TEACHER,
      email: 'teacher@school.edu.pk',
      plan: SubscriptionPlan.FREE,
      used: 3,
      now: fixedDate,
    });

    expect(underLimit.allowed).toBe(true);
    expect(underLimit.isDeveloper).toBe(false);
    expect(underLimit.limit).toBe(5);
    expect(underLimit.remaining).toBe(2);
    expect(underLimit.period).toBe('month');
    expect(underLimit.resetsAt).toBe('2026-12-01T00:00:00.000Z');

    const atLimit = computeTranslationQuota({
      role: UserRole.TEACHER,
      email: 'teacher@school.edu.pk',
      plan: SubscriptionPlan.FREE,
      used: 5,
      now: fixedDate,
    });

    expect(atLimit.allowed).toBe(false);
    expect(atLimit.remaining).toBe(0);
    expect(buildQuotaExceededMessage(atLimit)).toContain('this month');
  });

  it('allows paid customers (Pro & Enterprise) 5 translations per day', () => {
    for (const plan of [SubscriptionPlan.PRO, SubscriptionPlan.ENTERPRISE]) {
      const ok = computeTranslationQuota({
        role: UserRole.TEACHER,
        email: 'pro@school.edu.pk',
        plan,
        used: 4,
        now: fixedDate,
      });

      expect(ok.allowed).toBe(true);
      expect(ok.isDeveloper).toBe(false);
      expect(ok.limit).toBe(5);
      expect(ok.remaining).toBe(1);
      expect(ok.period).toBe('day');
      expect(ok.resetsAt).toBe('2026-11-16T00:00:00.000Z');

      const blocked = computeTranslationQuota({
        role: UserRole.TEACHER,
        email: 'pro@school.edu.pk',
        plan,
        used: 5,
        now: fixedDate,
      });

      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
      expect(buildQuotaExceededMessage(blocked)).toContain('today');
    }
  });

  it('grants full unlimited access to Developer mode (APP_ADMIN role or developer email)', () => {
    const byRole = computeTranslationQuota({
      role: UserRole.APP_ADMIN,
      email: 'admin@example.com',
      plan: SubscriptionPlan.FREE,
      used: 999,
      now: fixedDate,
    });

    expect(byRole.allowed).toBe(true);
    expect(byRole.isDeveloper).toBe(true);
    expect(byRole.limit).toBeNull();
    expect(byRole.remaining).toBeNull();
    expect(byRole.period).toBe('unlimited');

    const byEmail = computeTranslationQuota({
      role: UserRole.TEACHER,
      email: 'mkgopang@gmail.com',
      plan: SubscriptionPlan.FREE,
      used: 500,
      now: fixedDate,
    });

    expect(byEmail.allowed).toBe(true);
    expect(byEmail.isDeveloper).toBe(true);
    expect(byEmail.period).toBe('unlimited');
  });

  it('computes accurate UTC windows and deterministic token-saving cache keys', () => {
    const dayWin = getQuotaWindow('day', fixedDate);
    expect(dayWin.windowKey).toBe('2026-11-15');
    expect(dayWin.windowStartIso).toBe('2026-11-15T00:00:00.000Z');

    const monthWin = getQuotaWindow('month', fixedDate);
    expect(monthWin.windowKey).toBe('2026-11');
    expect(monthWin.windowStartIso).toBe('2026-11-01T00:00:00.000Z');

    const k1 = buildTranslationCacheKey('  Photosynthesis lesson  ', 'sd');
    const k2 = buildTranslationCacheKey('Photosynthesis lesson', 'sd');
    const k3 = buildTranslationCacheKey('Photosynthesis lesson', 'ur');
    expect(k1).toBe(k2);
    expect(k1).not.toBe(k3);
  });
});
