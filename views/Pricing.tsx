'use client';

import React, { useState, useEffect } from 'react';
import {
  Check,
  Building2,
  UserCircle,
  Star,
  Bell,
  CheckCircle2,
  Sparkles,
  Clock,
  ShieldCheck,
  Share2,
} from 'lucide-react';
import { SubscriptionPlan } from '../types';
import { ROLE_LIMITS } from '../constants';
import { supabase } from '../lib/supabase';
import { trackProductEvent } from '../lib/analytics';

interface PricingProps {
  currentPlan: SubscriptionPlan;
  onUpgrade: (plan: SubscriptionPlan) => void;
  onShowPolicy?: () => void;
}

const Pricing: React.FC<PricingProps> = ({ currentPlan, onUpgrade, onShowPolicy }) => {
  const [notifiedPlans, setNotifiedPlans] = useState<Record<string, boolean>>({});
  const [submittingPlan, setSubmittingPlan] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => {
    trackProductEvent({
      action: 'view_opened',
      category: 'navigation',
      label: 'pricing',
      toolType: 'pricing',
    });
  }, []);

  const handlePlanInterest = async (plan: SubscriptionPlan.PRO | SubscriptionPlan.ENTERPRISE) => {
    if (notifiedPlans[plan] || submittingPlan) return;
    setSubmittingPlan(plan);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (token) {
        await fetch('/api/feedback', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            kind: 'plan_interest',
            plan,
            approxPriceUsd: ROLE_LIMITS[plan].price,
          }),
        });
      }
      setNotifiedPlans((prev) => ({ ...prev, [plan]: true }));
      trackProductEvent({
        action: 'paid_plan_interest',
        category: 'pricing',
        label: plan,
        toolType: 'pricing',
      });
    } catch {
      setNotifiedPlans((prev) => ({ ...prev, [plan]: true }));
    } finally {
      setSubmittingPlan(null);
    }
  };

  const handleShareWorkspace = async () => {
    if (typeof window === 'undefined') return;
    const shareUrl = window.location.origin;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
      trackProductEvent({
        action: 'share_link_copied',
        category: 'growth',
        label: 'pricing_banner',
        toolType: 'pricing',
      });
    } catch {
      // ignore clipboard restriction
    }
  };

  const tiers = [
    {
      id: SubscriptionPlan.FREE,
      name: 'Core Educator',
      subtitle: 'Active Now for All Educators',
      icon: <UserCircle size={24} />,
      comingSoon: false,
    },
    {
      id: SubscriptionPlan.PRO,
      name: 'Expert Designer',
      subtitle: 'Upcoming Individual Upgrade',
      icon: <Star size={24} className="text-amber-500" />,
      comingSoon: true,
    },
    {
      id: SubscriptionPlan.ENTERPRISE,
      name: 'Institution',
      subtitle: 'Upcoming School & Campus Plan',
      icon: <Building2 size={24} className="text-indigo-500" />,
      comingSoon: true,
    },
  ];

  return (
    <div className="py-6 md:py-10 animate-in fade-in duration-500 max-w-6xl mx-auto px-4 lg:px-0 text-left space-y-10">
      <div className="text-center max-w-2xl mx-auto space-y-4">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
          <Sparkles size={14} />
          <span>Public Free Access Open • No Payment Needed</span>
        </div>

        <h1 className="text-3xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight">
          Workspace Plans &amp; Upcoming Tiers
        </h1>
        <p className="text-slate-600 dark:text-slate-400 text-base md:text-lg font-medium">
          Every educator starts immediately on the active <strong>Free Plan ($0/mo)</strong> with fair daily limits so the platform runs smoothly for everyone. Paid plans below preview upcoming features with approximate USD pricing and will be <strong>available soon</strong>.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
        {tiers.map((tier) => {
          const limits = ROLE_LIMITS[tier.id] as any;
          const isFreeActive = tier.id === SubscriptionPlan.FREE && (currentPlan === SubscriptionPlan.FREE || !tier.comingSoon);
          const isCurrent = currentPlan === tier.id;
          const isComingSoon = Boolean(tier.comingSoon);
          const isNotified = Boolean(notifiedPlans[tier.id]);

          return (
            <div
              key={tier.id}
              className={`relative rounded-3xl p-7 md:p-8 border transition-all flex flex-col ${
                isComingSoon
                  ? 'bg-slate-50/70 dark:bg-slate-900/60 border-slate-200 dark:border-white/10'
                  : 'bg-white dark:bg-slate-900 border-indigo-500 shadow-xl ring-1 ring-indigo-500/20'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-6">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-slate-100 dark:bg-white/5 text-indigo-600 dark:text-indigo-400 shrink-0">
                  {tier.icon}
                </div>
                {isComingSoon ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-700/40 text-amber-700 dark:text-amber-300 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap">
                    <Clock size={12} />
                    Available Soon
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-700/40 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap">
                    <CheckCircle2 size={12} />
                    Active Free Plan
                  </span>
                )}
              </div>

              <div className="mb-6">
                <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                  {tier.name}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
                  {tier.subtitle}
                </p>

                <div className="mt-5 flex items-baseline gap-2">
                  <span className="text-4xl font-black text-slate-900 dark:text-white tabular-nums">
                    {limits.price}
                  </span>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {isComingSoon ? 'USD approx. / mo' : 'USD / month'}
                  </span>
                </div>
                {isComingSoon && (
                  <p className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Placeholder preview — billing is not active yet
                  </p>
                )}
              </div>

              <div className="space-y-3.5 mb-8 flex-1">
                {limits.features.map((feature: string, i: number) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="mt-0.5 bg-emerald-100 dark:bg-emerald-900/30 rounded-full p-0.5 shrink-0">
                      <Check size={12} className="text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <span className="text-slate-700 dark:text-slate-300 text-sm font-medium leading-snug">
                      {feature}
                    </span>
                  </div>
                ))}
              </div>

              {isComingSoon ? (
                <button
                  type="button"
                  disabled={submittingPlan === tier.id}
                  onClick={() =>
                    handlePlanInterest(
                      tier.id === SubscriptionPlan.PRO
                        ? SubscriptionPlan.PRO
                        : SubscriptionPlan.ENTERPRISE
                    )
                  }
                  className={`w-full py-3.5 px-4 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 whitespace-nowrap ${
                    isNotified
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-700/40 text-emerald-700 dark:text-emerald-300'
                      : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90'
                  }`}
                >
                  {isNotified ? (
                    <>
                      <CheckCircle2 size={15} />
                      Notify Request Saved
                    </>
                  ) : (
                    <>
                      <Bell size={15} />
                      Available Soon — Notify Me
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onUpgrade(SubscriptionPlan.FREE)}
                  className="w-full py-3.5 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 whitespace-nowrap shadow-lg shadow-indigo-600/20"
                >
                  <ShieldCheck size={15} />
                  {isCurrent || isFreeActive ? 'Active — Start Synthesizing' : 'Use Free Plan'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-slate-900 dark:bg-indigo-950/60 border border-slate-800 dark:border-indigo-500/20 rounded-3xl p-7 md:p-10 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full text-[11px] font-bold uppercase tracking-wider text-indigo-200">
            Invite Fellow Educators
          </div>
          <h3 className="text-2xl font-black tracking-tight">
            Help colleagues teach faster — Share Free Access
          </h3>
          <p className="text-sm text-slate-300 leading-relaxed">
            Built for smooth reliability across classrooms: daily rate protection keeps response speed fast for all teachers while we gather feedback before launching paid tiers.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleShareWorkspace}
            className="px-5 py-3.5 bg-white text-slate-950 hover:bg-indigo-50 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 whitespace-nowrap"
          >
            {shareCopied ? <CheckCircle2 size={15} className="text-emerald-600" /> : <Share2 size={15} />}
            {shareCopied ? 'Link Copied' : 'Copy Invite Link'}
          </button>
          {onShowPolicy && (
            <button
              type="button"
              onClick={onShowPolicy}
              className="px-4 py-3.5 rounded-2xl border border-white/20 text-xs font-bold uppercase tracking-wider text-white/90 hover:bg-white/10 whitespace-nowrap"
            >
              Usage Policy
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Pricing;
