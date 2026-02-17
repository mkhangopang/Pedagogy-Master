'use client';

import React, { useState, useEffect } from 'react';
import { 
  Users, ShieldAlert, CreditCard, Activity, 
  Settings2, Search, Trash2, CheckCircle2, 
  XCircle, Zap, TrendingUp, AlertTriangle, 
  Filter, MoreVertical, Key, Database,
  Wallet, ShieldCheck, Clock, RefreshCcw,
  Scale, Eye, UserCircle, Building
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { UserProfile, SubscriptionPlan, UserRole, StakeholderRole } from '../types';

const MissionControl: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({ totalUsers: 0, proUsers: 0, revenueEst: 0 });
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

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

  const handleUpdateRole = async (userId: string, updates: any) => {
    setIsUpdating(userId);
    try {
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId);

      if (!error) {
        await fetchAdminData();
      } else {
        alert("Authorization Fault: " + error.message);
      }
    } finally {
      setIsUpdating(null);
    }
  };

  const handleManualUpgrade = async (userId: string, plan: SubscriptionPlan) => {
    const confirmMsg = plan === SubscriptionPlan.FREE 
      ? "REVOKE ACCESS: Return node to limited free tier?" 
      : `AUTHORIZATION: Upgrade node to ${plan.toUpperCase()}?`;
      
    if (!window.confirm(confirmMsg)) return;
    
    await handleUpdateRole(userId, { 
      plan, 
      queries_limit: plan === 'pro' ? 1000 : plan === 'enterprise' ? 999999 : 30,
      queries_used: 0 
    });
  };

  const handleStakeholderAssign = async (userId: string, sRole: StakeholderRole | null) => {
    const confirmMsg = !sRole 
      ? "DE-CLASSIFY: Remove stakeholder privileges?" 
      : `ELEVATION: Assign ${sRole.toUpperCase()} credentials to this identity?`;

    if (!window.confirm(confirmMsg)) return;

    await handleUpdateRole(userId, { 
      stakeholder_role: sRole,
      plan: sRole ? SubscriptionPlan.ENTERPRISE : (users.find(u => u.id === userId)?.plan || SubscriptionPlan.FREE),
      queries_limit: sRole ? 999999 : 30
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-20 text-left">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-4 md:px-0">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-rose-50 dark:bg-rose-950/30 rounded-full border border-rose-100 dark:border-rose-900/30 mb-3">
            <ShieldAlert size={12} className="text-rose-600" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-rose-600 dark:text-rose-400">Founder Control</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight uppercase">Mission Control</h1>
          <p className="text-slate-500 mt-1 font-medium text-xs">Bootstrap Grid & Identities.</p>
        </div>
        <div className="flex gap-3">
           <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-white/5 shadow-sm text-center min-w-[120px]">
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1">Rev (PKR)</p>
              <p className="text-xl font-bold text-emerald-600">{(stats.proUsers * 2500).toLocaleString()}</p>
           </div>
           <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-white/5 shadow-sm text-center min-w-[120px]">
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1">Active Nodes</p>
              <p className="text-xl font-bold text-indigo-600">{stats.totalUsers}</p>
           </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 px-4 md:px-0">
        <section className="lg:col-span-1 space-y-6">
           <div className="bg-indigo-50 dark:bg-indigo-950/20 p-6 rounded-[2.5rem] border border-indigo-100 dark:border-indigo-900/30">
              <h3 className="text-xs font-bold uppercase tracking-widest text-indigo-600 mb-4 flex items-center gap-2">
                 <Wallet size={16} /> Activator
              </h3>
              <div className="space-y-4">
                 <div className="p-4 bg-white/50 dark:bg-black/20 rounded-2xl border border-dashed border-indigo-200">
                    <p className="text-[8px] font-bold text-indigo-400 uppercase mb-2">High Usage Nodes</p>
                    {users.filter(u => u.queries_used >= 25 && u.plan === 'free').length > 0 ? (
                       users.filter(u => u.queries_used >= 25 && u.plan === 'free').slice(0, 3).map(u => (
                         <div key={u.id} className="flex items-center justify-between py-2 border-b border-indigo-100 last:border-0">
                           <span className="text-[9px] font-semibold truncate max-w-[100px]">{u.email}</span>
                           <button onClick={() => handleManualUpgrade(u.id, SubscriptionPlan.PRO)} className="text-[8px] font-bold text-indigo-600 uppercase hover:underline">Activate</button>
                         </div>
                       ))
                    ) : (
                      <p className="text-[8px] text-indigo-300 italic text-center py-2">System Balanced.</p>
                    )}
                 </div>
              </div>
           </div>
        </section>

        <section className="lg:col-span-3 space-y-6">
           <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-white/5 shadow-sm overflow-hidden">
              <div className="p-6 border-b dark:border-white/5 flex flex-col sm:flex-row justify-between gap-4">
                 <h3 className="text-md font-bold text-slate-900 dark:text-white uppercase tracking-tight">Identity Grid</h3>
                 <div className="relative">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                   <input 
                     type="text" 
                     placeholder="Search identity..." 
                     value={searchTerm}
                     onChange={(e) => setSearchTerm(e.target.value)}
                     className="pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-[10px] outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-64 font-semibold"
                   />
                 </div>
              </div>
              <div className="overflow-x-auto custom-scrollbar">
                 <table className="w-full text-left text-[10px]">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-400 font-bold uppercase tracking-widest text-[8px]">
                       <tr>
                          <th className="p-4">Identity</th>
                          <th className="p-4">Tier</th>
                          <th className="p-4">Lens</th>
                          <th className="p-4 text-right">Ops</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                       {users.filter(u => u.email.toLowerCase().includes(searchTerm.toLowerCase())).map((user) => (
                          <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                             <td className="p-4">
                                <p className="font-semibold text-slate-900 dark:text-white truncate max-w-[120px]">{user.email}</p>
                                <p className="text-[7px] text-slate-400 font-medium uppercase">{new Date(user.created_at).toLocaleDateString()}</p>
                             </td>
                             <td className="p-4">
                                <span className={`px-2 py-0.5 rounded-full font-bold text-[7px] uppercase tracking-widest ${
                                  user.plan === 'pro' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 
                                  user.plan === 'enterprise' ? 'bg-purple-50 text-purple-600 border border-purple-100' : 'bg-slate-50 text-slate-500'
                                }`}>
                                   {user.plan}
                                </span>
                             </td>
                             <td className="p-4">
                                {user.stakeholder_role ? (
                                  <div className="flex items-center gap-1.5 text-[7px] font-bold text-indigo-600 uppercase">
                                     <Eye size={10}/> Lens Active
                                  </div>
                                ) : (
                                  <span className="text-[7px] text-slate-400 font-medium uppercase italic">User</span>
                                )}
                             </td>
                             <td className="p-4 text-right">
                                <div className="flex gap-1.5 justify-end">
                                   <button 
                                     disabled={isUpdating === user.id}
                                     onClick={() => handleStakeholderAssign(user.id, user.stakeholder_role === StakeholderRole.INST_LEAD ? null : StakeholderRole.INST_LEAD)}
                                     className={`p-1.5 rounded-lg transition-all ${user.stakeholder_role === StakeholderRole.INST_LEAD ? 'bg-purple-600 text-white shadow-md' : 'bg-purple-50 text-purple-600 hover:bg-purple-100'}`}
                                   >
                                      <Building size={12} />
                                   </button>
                                   <button 
                                     disabled={isUpdating === user.id}
                                     onClick={() => handleManualUpgrade(user.id, user.plan === 'pro' ? SubscriptionPlan.FREE : SubscriptionPlan.PRO)}
                                     className={`p-1.5 rounded-lg transition-all ${user.plan === 'pro' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-400 hover:text-indigo-600'}`}
                                   >
                                      <Zap size={12} />
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
    </div>
  );
};

export default MissionControl;