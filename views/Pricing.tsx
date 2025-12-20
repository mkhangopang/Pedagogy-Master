
import React, { useState } from 'react';
import { Check, Zap, Building2, UserCircle, Star, Loader2 } from 'lucide-react';
import { SubscriptionPlan } from '../types';
import { ROLE_LIMITS } from '../constants';

interface PricingProps {
  currentPlan: SubscriptionPlan;
  onUpgrade: (plan: SubscriptionPlan) => void;
}

const Pricing: React.FC<PricingProps> = ({ currentPlan, onUpgrade }) => {
  const [loadingPlan, setLoadingPlan] = useState<SubscriptionPlan | null>(null);

  /**
   * Placeholder for Lemon Squeezy checkout.
   * In a real app, you would fetch a checkout URL from Lemon Squeezy API
   * or use their Overlay JS SDK.
   */
  const handleLemonSqueezyCheckout = async (plan: SubscriptionPlan) => {
    setLoadingPlan(plan);
    
    // Simulating API call to get Lemon Squeezy Checkout URL
    console.log(`Initializing Lemon Squeezy checkout for ${plan}...`);
    
    setTimeout(() => {
      // In production, window.location.href = checkoutUrl;
      onUpgrade(plan);
      setLoadingPlan(null);
    }, 1500);
  };

  const tiers = [
    { 
      id: SubscriptionPlan.FREE, 
      name: "Core Educator", 
      icon: <UserCircle size={28} />, 
      color: "indigo" 
    },
    { 
      id: SubscriptionPlan.PRO, 
      name: "Expert Designer", 
      icon: <Star size={28} className="text-amber-500" />, 
      color: "emerald",
      popular: true
    },
    { 
      id: SubscriptionPlan.ENTERPRISE, 
      name: "Institution", 
      icon: <Building2 size={28} />, 
      color: "purple" 
    },
  ];

  return (
    <div className="py-8 animate-in fade-in duration-500">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Scale Your Pedagogy</h1>
        <p className="text-slate-500 mt-4 text-lg">Choose the tier that matches your instructional complexity. Upgrade anytime to unlock advanced AI capabilities.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
        {tiers.map((tier) => {
          const limits = ROLE_LIMITS[tier.id];
          const isCurrent = currentPlan === tier.id;
          const isLoading = loadingPlan === tier.id;

          return (
            <div 
              key={tier.id} 
              className={`relative bg-white rounded-3xl p-8 border-2 transition-all duration-300 flex flex-col ${
                tier.popular ? 'border-indigo-500 shadow-2xl scale-105 z-10' : 'border-slate-100 hover:border-slate-300 shadow-sm'
              }`}
            >
              {tier.popular && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-indigo-600 text-white px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-lg">
                  Most Popular
                </div>
              )}

              <div className="mb-8">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 bg-slate-50 text-indigo-600 shadow-inner`}>
                  {tier.icon}
                </div>
                <h3 className="text-2xl font-bold text-slate-900">{tier.name}</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-slate-900">{limits.price}</span>
                  <span className="text-slate-500 font-medium">/month</span>
                </div>
              </div>

              <div className="space-y-4 mb-10 flex-1">
                {limits.features.map((feature, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="mt-1 bg-emerald-100 rounded-full p-0.5 shadow-sm">
                      <Check size={12} className="text-emerald-600" />
                    </div>
                    <span className="text-slate-600 text-sm font-medium">{feature}</span>
                  </div>
                ))}
              </div>

              <button 
                onClick={() => !isCurrent && handleLemonSqueezyCheckout(tier.id)}
                disabled={isCurrent || isLoading}
                className={`w-full py-4 rounded-xl font-bold transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 ${
                  isCurrent 
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none' 
                    : tier.popular 
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200' 
                      : 'bg-white border-2 border-indigo-600 text-indigo-600 hover:bg-indigo-50 shadow-slate-100'
                }`}
              >
                {isLoading ? <Loader2 className="animate-spin" size={18} /> : null}
                {isCurrent ? 'Active Plan' : `Upgrade to ${tier.name}`}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-20 bg-indigo-900 rounded-[2.5rem] p-12 text-white flex flex-col md:flex-row items-center justify-between gap-10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500 rounded-full opacity-10 blur-[100px]" />
        <div className="max-w-md relative z-10 text-center md:text-left">
          <h2 className="text-3xl font-bold leading-tight">Institutional Deployment?</h2>
          <p className="text-indigo-100 mt-4 text-lg">Centralize pedagogical standards across your school district or university campus with SSO and priority infrastructure.</p>
        </div>
        <button className="px-10 py-5 bg-white text-indigo-950 rounded-2xl font-bold hover:bg-indigo-50 transition-all shadow-xl hover:shadow-indigo-900/40 active:scale-95 shrink-0 relative z-10">
          Contact Academic Sales
        </button>
      </div>
      
      <p className="mt-8 text-center text-slate-400 text-sm font-medium">
        Payments secured by Lemon Squeezy. Cancel anytime from your account settings.
      </p>
    </div>
  );
};

export default Pricing;
