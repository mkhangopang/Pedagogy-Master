
'use client';

import React, { useState, useEffect } from 'react';
import { 
  Users, ShieldAlert, CreditCard, Activity, 
  Settings2, Search, Trash2, CheckCircle2, 
  XCircle, Zap, TrendingUp, AlertTriangle, 
  Filter, MoreVertical, Key, Database,
  Wallet, ShieldCheck, Clock, RefreshCcw
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { UserProfile, SubscriptionPlan, UserRole } from '../types';

const MissionControl: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({ totalUsers: 0, proUsers: 0, revenueEst: 0 });

  useEffect(() => {
    fetchAdminData();
  }, []);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const { data: profiles } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      if (profiles) {
        setUsers(profiles);
        const pro = profiles.filter(p => p.plan === 'pro' || p.plan === 'enterprise').length;
        setStats({
          totalUsers: profiles.length,
          proUsers: pro,
          revenueEst: pro * 2500 
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleManualUpgrade = async (userId: string, plan: SubscriptionPlan) => {
    const confirmMsg = plan === SubscriptionPlan.FREE 
      ? "REVOKE ACCESS: Return node to limited free tier?" 
      : `AUTHORIZATION: Upgrade node to ${plan.toUpperCase()}?`;
      
    if (!window.confirm(confirmMsg)) return;
    
    const { error } = await supabase
      .from('profiles')
      .update({ 
        plan, 
        queries_limit: plan === 'pro' ? 1000 : plan === 'enterprise' ? 999999 : 30,
        queries_used: 0 // Reset usage on upgrade
      })
      .eq('id', userId);

    if (!error) {
      alert("MISSION SUCCESS: Node re-aligned.");
      fetchAdminData();
    }
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-700 pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-rose-50 dark:bg-rose-950/30 rounded-full border border-rose-100 dark:border-rose-900/30 mb-4">
            <ShieldAlert size={14} className="text-rose-600" />
            <span className="text-[10px] font-black uppercase tracking-widest text-rose-600 dark:text-rose-400">Founder Control Pane</span>
          </div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">Mission Control</h1>
          <p className="text-slate-500 mt-1 font-medium italic text-sm">Managing the Bootstrap Grid.</p>
        </div>
        <div className="flex gap-4">
           <div className="p-5 bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-100 dark:border-white/5 shadow-sm text-center min-w-[140px]">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Rev (PKR)</p>
              <p className="text-2xl font-black text-emerald-600">{(stats.proUsers * 2500).toLocaleString()}</p>
           </div>
           <div className="p-5 bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-100 dark:border-white/5 shadow-sm text-center min-w-[140px]">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Active Nodes</p>
              <p className="text-2xl font-black text-indigo-600">{stats.totalUsers}</p>
           </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <section className="lg:col-span-1 bg-indigo-50 dark:bg-indigo-950/20 p-8 rounded-[3rem] border border-indigo-100 dark:border-indigo-900/30 h-fit">
           <h3 className="text-sm font-black uppercase tracking-widest text-indigo-600 mb-6 flex items-center gap-2">
              <Wallet size={18} /> Bootstrap Activator
           </h3>
           <div className="space-y-4">
              <p className="text-xs text-indigo-700/60 font-medium leading-relaxed">
                 Manual activation for EasyPaisa / JazzCash payments. Find the user below and click <Zap size={10} className="inline"/> to activate.
              </p>
              <div className="pt-4 space-y-3">
                 <div className="p-4 bg-white/50 dark:bg-black/20 rounded-2xl border border-dashed border-indigo-200">
                    <p className="text-[10px] font-black text-indigo-400 uppercase mb-2">Awaiting Verification</p>
                    {users.filter(u => u.queries_used >= 25 && u.plan === 'free').length > 0 ? (
                       users.filter(u => u.queries_used >= 25 && u.plan === 'free').slice(0, 3).map(u => (
                         <div key={u.id} className="flex items-center justify-between py-2 border-b border-indigo-100 last:border-0">
                           <span className="text-[10px] font-bold truncate max-w-[120px]">{u.email}</span>
                           <button onClick={() => handleManualUpgrade(u.id, SubscriptionPlan.PRO)} className="text-[9px] font-black text-indigo-600 uppercase hover:underline">Activate</button>
                         </div>
                       ))
                    ) : (
                      <p className="text-[9px] text-indigo-300 italic text-center py-4">No high-usage free nodes detected.</p>
                    )}
                 </div>
              </div>
           </div>
        </section>

        <section className="lg:col-span-2 space-y-6">
           <div className="bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-100 dark:border-white/5 shadow-sm overflow-hidden">
              <div className="p-8 border-b dark:border-white/5 flex flex-col md:flex-row justify-between gap-4">
                 <div className="flex items-center gap-4">
                    <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">User Grid</h3>
                    <button onClick={fetchAdminData} className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"><RefreshCcw size={14}/></button>
                 </div>
                 <div className="relative">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                   <input 
                     type="text" 
                     placeholder="Search user email..." 
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
                          <th className="p-6">Educator</th>
                          <th className="p-6">Grid Tier</th>
                          <th className="p-6">Usage</th>
                          <th className="p-6">Override</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                       {users.filter(u => u.email.toLowerCase().includes(searchTerm.toLowerCase())).map((user) => (
                          <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                             <td className="p-6">
                                <p className="font-bold text-slate-900 dark:text-white truncate max-w-[150px]">{user.email}</p>
                                <p className="text-[8px] text-slate-400 font-medium uppercase mt-0.5">{new Date(user.created_at).toLocaleDateString()}</p>
                             </td>
                             <td className="p-6">
                                <span className={`px-3 py-1 rounded-full font-black text-[9px] uppercase tracking-widest ${
                                  user.plan === 'pro' ? 'bg-emerald-100 text-emerald-700 shadow-sm border border-emerald-200' : 
                                  user.plan === 'enterprise' ? 'bg-purple-100 text-purple-700 border border-purple-200' : 'bg-slate-100 text-slate-500'
                                }`}>
                                   {user.plan}
                                </span>
                             </td>
                             <td className="p-6">
                                <div className="flex items-center gap-2">
                                  <p className="font-bold text-slate-700 dark:text-slate-300">{user.queries_used}</p>
                                  <div className="w-12 h-1 bg-slate-100 dark:bg-slate-800 rounded-full">
                                     <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(100, (user.queries_used / (user.queries_limit || 30)) * 100)}%` }} />
                                  </div>
                                </div>
                             </td>
                             <td className="p-6">
                                <div className="flex gap-1.5">
                                   <button 
                                     onClick={() => handleManualUpgrade(user.id, SubscriptionPlan.PRO)}
                                     className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-all"
                                     title="Verify Payment"
                                   >
                                      <Zap size={14} />
                                   </button>
                                   <button 
                                     onClick={() => handleManualUpgrade(user.id, SubscriptionPlan.FREE)}
                                     className="p-2 bg-slate-50 text-slate-400 rounded-lg hover:bg-rose-50 hover:text-rose-600 transition-all"
                                     title="Downgrade Node"
                                   >
                                      <RefreshCcw size={14} />
                                   </button>
                                </div>
                             </td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
                 {users.length === 0 && <div className="p-20 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px]">No nodes detected in grid.</div>}
              </div>
           </div>
        </section>
      </div>
    </div>
  );
};

export default MissionControl;
