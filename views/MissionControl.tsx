'use client';

import React, { useState, useEffect } from 'react';
import { 
  Users, ShieldAlert, CreditCard, Activity, 
  Settings2, Search, Trash2, CheckCircle2, 
  XCircle, Zap, TrendingUp, AlertTriangle, 
  Filter, MoreVertical, Key, Database,
  Wallet, ShieldCheck, Clock
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { UserProfile, SubscriptionPlan, UserRole } from '../types';

const MissionControl: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [pendingPayments, setPendingPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({ totalUsers: 0, proUsers: 0, revenueEst: 0 });

  useEffect(() => {
    fetchAdminData();
  }, []);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Profiles
      const { data: profiles } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      
      // 2. Fetch Manual Payment Proofs (Simulated table for bootstrap business)
      // In your actual DB, create a 'payment_claims' table
      const { data: claims } = await supabase.from('profiles').select('*').eq('plan', 'free').not('queries_used', 'eq', 0);

      if (profiles) {
        setUsers(profiles);
        const pro = profiles.filter(p => p.plan === 'pro' || p.plan === 'enterprise').length;
        setStats({
          totalUsers: profiles.length,
          proUsers: pro,
          revenueEst: pro * 2500 // Estimated PKR for local bootstrap
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleManualUpgrade = async (userId: string, plan: SubscriptionPlan) => {
    if (!window.confirm(`AUTHORIZATION REQUIRED: Upgrade node to ${plan.toUpperCase()}?`)) return;
    
    const { error } = await supabase
      .from('profiles')
      .update({ 
        plan, 
        queries_limit: plan === 'pro' ? 1000 : plan === 'enterprise' ? 999999 : 30,
        // Log the upgrade event internally
        generation_count: 0 // Resetting usage for new plan cycle
      })
      .eq('id', userId);

    if (!error) {
      alert("UPGRADE SUCCESSFUL: Node refreshed globally.");
      fetchAdminData();
    }
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-700 pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-rose-50 dark:bg-rose-950/30 rounded-full border border-rose-100 dark:border-rose-900/30 mb-4">
            <ShieldAlert size={14} className="text-rose-600" />
            <span className="text-[10px] font-black uppercase tracking-widest text-rose-600 dark:text-rose-400">Owner Access Only</span>
          </div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">Mission Control</h1>
          <p className="text-slate-500 mt-1 font-medium italic text-sm">Managing the Bootstrap Grid on Free Tiers.</p>
        </div>
        <div className="flex gap-4">
           <div className="p-5 bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-100 dark:border-white/5 shadow-sm text-center min-w-[140px]">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Local Rev (PKR)</p>
              <p className="text-2xl font-black text-emerald-600">{stats.revenueEst.toLocaleString()}</p>
           </div>
           <div className="p-5 bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-100 dark:border-white/5 shadow-sm text-center min-w-[140px]">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Active Nodes</p>
              <p className="text-2xl font-black text-indigo-600">{stats.totalUsers}</p>
           </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Bootstrap Payment Verifier */}
        <section className="lg:col-span-1 bg-indigo-50 dark:bg-indigo-950/20 p-8 rounded-[3rem] border border-indigo-100 dark:border-indigo-900/30 h-fit">
           <h3 className="text-sm font-black uppercase tracking-widest text-indigo-600 mb-6 flex items-center gap-2">
              <Wallet size={18} /> Manual Activations
           </h3>
           <div className="space-y-4">
              <p className="text-xs text-indigo-700/60 font-medium leading-relaxed">
                 Use this section to verify screenshots sent to your email. Upgrading here bypasses Lemon Squeezy (International) and activates local nodes.
              </p>
              <div className="pt-4 space-y-3">
                 {users.filter(u => u.plan === 'free' && u.queries_used > 5).slice(0, 3).map(u => (
                    <div key={u.id} className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-indigo-100 dark:border-indigo-900/30 flex items-center justify-between">
                       <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-black text-slate-400 uppercase truncate">{u.email}</p>
                          <p className="text-xs font-bold text-slate-900 dark:text-white">High Usage Node</p>
                       </div>
                       <button 
                         onClick={() => handleManualUpgrade(u.id, SubscriptionPlan.PRO)}
                         className="p-2 bg-indigo-600 text-white rounded-xl shadow-lg hover:scale-110 transition-all"
                       >
                          <CheckCircle2 size={16} />
                       </button>
                    </div>
                 ))}
                 {users.length === 0 && <p className="text-[10px] text-center text-indigo-300 py-10 italic">No manual claims detected.</p>}
              </div>
           </div>
        </section>

        {/* Global Node Directory */}
        <section className="lg:col-span-2 space-y-6">
           <div className="bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-100 dark:border-white/5 shadow-sm overflow-hidden">
              <div className="p-8 border-b dark:border-white/5 flex flex-col md:flex-row justify-between gap-4">
                 <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2 uppercase tracking-tight">
                   <Users size={20} className="text-indigo-600" /> User Grid
                 </h3>
                 <div className="relative">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                   <input 
                     type="text" 
                     placeholder="Search node id or email..." 
                     value={searchTerm}
                     onChange={(e) => setSearchTerm(e.target.value)}
                     className="pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 w-full md:w-64"
                   />
                 </div>
              </div>
              <div className="overflow-x-auto">
                 <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-400 font-black uppercase tracking-widest text-[9px]">
                       <tr>
                          <th className="p-6">Identity Node</th>
                          <th className="p-6">Sync Status</th>
                          <th className="p-6">Usage</th>
                          <th className="p-6">Override</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                       {users.filter(u => u.email.includes(searchTerm)).map((user) => (
                          <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                             <td className="p-6">
                                <p className="font-bold text-slate-900 dark:text-white">{user.email}</p>
                                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest mt-0.5">{user.role}</p>
                             </td>
                             <td className="p-6">
                                <span className={`px-3 py-1 rounded-full font-black text-[9px] uppercase tracking-widest ${
                                  user.plan === 'pro' ? 'bg-emerald-100 text-emerald-700' : 
                                  user.plan === 'enterprise' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-500'
                                }`}>
                                   {user.plan}
                                </span>
                             </td>
                             <td className="p-6">
                                <div className="flex items-center gap-2">
                                  <p className="font-bold text-slate-700 dark:text-slate-300">{user.queries_used}</p>
                                  <div className="w-16 h-1 bg-slate-100 dark:bg-slate-800 rounded-full">
                                     <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(100, (user.queries_used / user.queries_limit) * 100)}%` }} />
                                  </div>
                                </div>
                             </td>
                             <td className="p-6">
                                <div className="flex gap-2">
                                   <button 
                                     onClick={() => handleManualUpgrade(user.id, SubscriptionPlan.PRO)}
                                     className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-all"
                                     title="Force Pro Upgrade"
                                   >
                                      <Zap size={14} />
                                   </button>
                                   <button 
                                     onClick={() => handleManualUpgrade(user.id, SubscriptionPlan.FREE)}
                                     className="p-2 bg-slate-50 text-slate-400 rounded-lg hover:bg-rose-50 hover:text-rose-600 transition-all"
                                     title="Revoke Pro Access"
                                   >
                                      <XCircle size={14} />
                                   </button>
                                </div>
                             </td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
           </div>
        </section>
      </div>

      {/* Grid Security Advice */}
      <div className="bg-slate-900 p-8 rounded-[3rem] text-white shadow-2xl relative overflow-hidden">
         <div className="absolute top-0 right-0 p-12 opacity-5"><ShieldCheck size={200} /></div>
         <div className="relative z-10 max-w-2xl">
            <h3 className="text-xl font-black uppercase tracking-tight text-emerald-400 mb-2">Operational Integrity Guide</h3>
            <p className="text-sm text-slate-400 leading-relaxed font-medium">
               Since you are using <b>Free Tier Vercel and Supabase</b>, avoid bulk indexing documents for multiple users at once. 
               If the system hits a rate limit, the Vercel serverless function will timeout at 10s. 
               <b>Recommendation:</b> Encourage users to upload smaller, focused curriculum documents rather than 500-page textbooks.
            </p>
         </div>
      </div>
    </div>
  );
};

export default MissionControl;