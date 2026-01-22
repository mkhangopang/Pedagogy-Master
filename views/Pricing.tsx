import React, { useState } from 'react';
import { Check, Zap, Building2, UserCircle, Star, Loader2, ExternalLink, ShieldCheck, Wallet, ArrowRight, CreditCard } from 'lucide-react';
import { SubscriptionPlan } from '../types';
import { ROLE_LIMITS } from '../constants';
import { paymentService } from '../services/paymentService';

interface PricingProps {
  currentPlan: SubscriptionPlan;
  onUpgrade: (plan: SubscriptionPlan) => void;
  onShowPolicy?: () => void;
}

const Pricing: React.FC<PricingProps> = ({ currentPlan, onUpgrade, onShowPolicy }) => {
  const [loadingPlan, setLoadingPlan] = useState<SubscriptionPlan | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'local'>('card');
  const [showLocalModal, setShowLocalModal] = useState(false);

  const handleCheckout = async (plan: SubscriptionPlan) => {
    if (plan === SubscriptionPlan.FREE) {
      onUpgrade(plan);
      return;
    }

    if (paymentMethod === 'local') {
      setShowLocalModal(true);
      return;
    }

    setLoadingPlan(plan);
    try {
      await paymentService.openCheckout(plan);
    } catch (err) {
      console.error("Checkout failed:", err);
      onUpgrade(plan);
    } finally {
      setLoadingPlan(null);
    }
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
    <div className="py-8 animate-in fade-in duration-500 max-w-6xl mx-auto px-4 lg:px-0">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <h1 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight">Scale Your Pedagogy</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-4 text-lg font-medium">Choose the tier that matches your instructional complexity.</p>
        
        {/* Payment Method Switcher */}
        <div className="inline-flex mt-10 p-1.5 bg-slate-100 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/5">
           <button 
             onClick={() => setPaymentMethod('card')}
             className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${paymentMethod === 'card' ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm' : 'text-slate-500'}`}
           >
             <CreditCard size={14}/> International Card
           </button>
           <button 
             onClick={() => setPaymentMethod('local')}
             className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${paymentMethod === 'local' ? 'bg-white dark:bg-slate-800 text-emerald-600 shadow-sm' : 'text-slate-500'}`}
           >
             <Wallet size={14}/> EasyPaisa / JazzCash
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
        {tiers.map((tier) => {
          const limits = ROLE_LIMITS[tier.id];
          const isCurrent = currentPlan === tier.id;
          const isLoading = loadingPlan === tier.id;

          return (
            <div 
              key={tier.id} 
              className={`relative bg-white dark:bg-slate-900 rounded-[3rem] p-8 md:p-10 border-2 transition-all duration-300 flex flex-col ${
                tier.popular ? 'border-indigo-500 shadow-2xl scale-105 z-10' : 'border-slate-100 dark:border-white/5 hover:border-slate-300 shadow-sm'
              }`}
            >
              {tier.popular && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-indigo-600 text-white px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl">
                  Best Value
                </div>
              )}

              <div className="mb-8">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 bg-slate-50 dark:bg-white/5 text-indigo-600 shadow-inner`}>
                  {tier.icon}
                </div>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">{tier.name}</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-black text-slate-900 dark:text-white">{limits.price}</span>
                  <span className="text-slate-500 font-bold text-sm uppercase tracking-widest">/month</span>
                </div>
              </div>

              <div className="space-y-4 mb-10 flex-1">
                {limits.features.map((feature, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="mt-1 bg-emerald-100 dark:bg-emerald-900/30 rounded-full p-0.5 shadow-sm">
                      <Check size={12} className="text-emerald-600" />
                    </div>
                    <span className="text-slate-600 dark:text-slate-400 text-sm font-bold">{feature}</span>
                  </div>
                ))}
              </div>

              <button 
                onClick={() => !isCurrent && handleCheckout(tier.id)}
                disabled={isCurrent || isLoading}
                className={`w-full py-5 rounded-[1.5rem] font-black text-xs uppercase tracking-widest transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2 ${
                  isCurrent 
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed shadow-none' 
                    : tier.popular 
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200' 
                      : 'bg-slate-900 text-white hover:bg-black'
                }`}
              >
                {isLoading ? <Loader2 className="animate-spin" size={18} /> : null}
                {isCurrent ? 'Active Node' : (
                  <>
                    Upgrade Synthesis
                    <ArrowRight size={14} />
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-20 bg-indigo-900 rounded-[3rem] p-10 md:p-16 text-white flex flex-col md:flex-row items-center justify-between gap-10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-white opacity-5 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2" />
        <div className="max-w-lg relative z-10 text-center md:text-left space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full text-[10px] font-bold uppercase tracking-widest">Enterprise API</div>
          <h2 className="text-4xl font-black leading-none tracking-tight">Scaling for Institutions?</h2>
          <p className="text-indigo-100 text-lg font-medium">Centralize pedagogical standards across your campus with dedicated cloud namespaces and priority synthesis nodes.</p>
        </div>
        <button className="px-12 py-6 bg-white text-indigo-950 rounded-[2rem] font-black text-lg shadow-2xl hover:scale-105 transition-all active:scale-95 shrink-0 relative z-10">
          Contact Engineering
        </button>
      </div>
      
      <div className="mt-12 flex flex-col md:flex-row items-center justify-center gap-8 py-8 border-t border-slate-100 dark:border-white/5">
        <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
           <ShieldCheck size={14} className="text-emerald-500" /> Secure Checkout
        </div>
        <button 
          onClick={onShowPolicy}
          className="text-[10px] font-black text-indigo-600 hover:underline uppercase tracking-[0.2em]"
        >
          Privacy Policy
        </button>
        <div className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">
          All synthesized content is 100% user-owned.
        </div>
      </div>

      {/* Local Payment Modal (The "Manual Pro" Strategy) */}
      {showLocalModal && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xl animate-in fade-in duration-300">
           <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[3rem] p-10 border border-slate-100 dark:border-white/5 shadow-2xl space-y-8">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-black dark:text-white tracking-tight uppercase">Local Payment</h3>
                <button onClick={() => setShowLocalModal(false)} className="text-slate-400 hover:text-slate-900">✕</button>
              </div>

              <div className="p-6 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 rounded-[2rem] space-y-4">
                 <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white font-bold text-sm">EP</div>
                    <div>
                       <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">EasyPaisa Account</p>
                       <p className="font-bold text-slate-900 dark:text-white">0300 000 0000</p>
                    </div>
                 </div>
                 <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center text-white font-bold text-sm">JC</div>
                    <div>
                       <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">JazzCash Account</p>
                       <p className="font-bold text-slate-900 dark:text-white">0300 000 0000</p>
                    </div>
                 </div>
              </div>

              <div className="space-y-4">
                 <p className="text-xs text-slate-500 font-medium leading-relaxed">
                   Transfer <b>PKR 2,500</b> for lifetime access (Beta Promo). 
                   After transfer, email your screenshot and registered email to <b>support@edunexus.ai</b>.
                 </p>
                 <button onClick={() => setShowLocalModal(false)} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest">Close Guide</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Pricing;