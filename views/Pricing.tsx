
import React from 'react';
import { Check, Zap, Building2, UserCircle, Star } from 'lucide-react';
import { SubscriptionPlan } from '../types';
import { ROLE_LIMITS } from '../constants';

interface PricingProps {
  currentPlan: SubscriptionPlan;
  onUpgrade: (plan: SubscriptionPlan) => void;
}

const Pricing: React.FC<PricingProps> = ({ currentPlan, onUpgrade }) => {
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
        <p className="text-slate-500 mt-4 text-lg">Choose the tier that matches your instructional complexity.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
        {tiers.map((tier) => {
          const limits = ROLE_LIMITS[tier.id];
          const isCurrent = currentPlan === tier.id;

          return (
            <div 
              key={tier.id} 
              className={`relative bg-white rounded-3xl p-8 border-2 transition-all duration-300 flex flex-col ${
                tier.popular ? 'border-emerald-500 shadow-xl scale-105 z-10' : 'border-slate-100 hover:border-slate-300'
              }`}
            >
              {tier.popular && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-emerald-500 text-white px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest">
                  Most Popular
                </div>
              )}

              <div className="mb-8">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 bg-${tier.color}-50 text-${tier.color}-600`}>
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
                    <div className="mt-1 bg-emerald-100 rounded-full p-0.5">
                      <Check size={12} className="text-emerald-600" />
                    </div>
                    <span className="text-slate-600 text-sm">{feature}</span>
                  </div>
                ))}
              </div>

              <button 
                onClick={() => !isCurrent && onUpgrade(tier.id)}
                disabled={isCurrent}
                className={`w-full py-4 rounded-xl font-bold transition-all shadow-lg ${
                  isCurrent 
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none' 
                    : tier.popular 
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200' 
                      : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200'
                }`}
              >
                {isCurrent ? 'Current Plan' : 'Select Plan'}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-16 bg-slate-900 rounded-3xl p-10 text-white flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="max-w-md">
          <h2 className="text-2xl font-bold">Academic Site License?</h2>
          <p className="text-slate-400 mt-2">Deploy EduNexus AI across your entire university or school district with SSO and advanced compliance.</p>
        </div>
        <button className="px-8 py-4 bg-white text-slate-900 rounded-xl font-bold hover:bg-slate-50 transition-colors shrink-0">
          Contact Academic Sales
        </button>
      </div>
    </div>
  );
};

export default Pricing;
