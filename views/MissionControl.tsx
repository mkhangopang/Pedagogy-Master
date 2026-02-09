
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
      // Automatically boost them to enterprise tier for stakeholder access
      plan: sRole ? SubscriptionPlan.ENTERPRISE : (users.find(u => u.id === userId)?.plan || SubscriptionPlan.FREE),
      queries_limit: sRole ? 999999 : 30
    });
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-700 pb-20 text-left">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-rose-50 dark:bg-rose-950/30 rounded-full border border-rose-100 dark:border-rose-900/30 mb-4">
            <ShieldAlert size={14} className="text-rose-600" />
            <span className="text-[10px] font-black uppercase tracking-widest text-rose-600 dark:text-rose-400">Founder Control Pane</span>
          </div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">Mission Control</h1>
          <p className="text-slate-500 mt-1 font-medium italic text-sm">Managing the Bootstrap Grid & Institutional Identities.</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <section className="lg:col-span-1 space-y-6">
           <div className="bg-indigo-50 dark:bg-indigo-950/20 p-8 rounded-[3rem] border border-indigo-100 dark:border-indigo-900/30 h-fit">
              <h3 className="text-sm font-black uppercase tracking-widest text-indigo-600 mb-6 flex items-center gap-2">
                 <Wallet size={18} /> Bootstrap Activator
              </h3>
              <div className="space-y-4">
                 <p className="text-xs text-indigo-700/60 font-medium leading-relaxed">
                    Manual activation for EasyPaisa / JazzCash payments.
                 </p>
                 <div className="pt-4 space-y-3">
                    <div className="p-4 bg-white/50 dark:bg-black/20 rounded-2xl border border-dashed border-indigo-200">
                       <p className="text-[10px] font-black text-indigo-400 uppercase mb-2">Awaiting Verification</p>
                       {users.filter(u => u.queries_used >= 25 && u.plan === 'free' && !u.stakeholder_role).length > 0 ? (
                          users.filter(u => u.queries_used >= 25 && u.plan === 'free').slice(0, 3).map(u => (
                            <div key={u.id} className="flex items-center justify-between py-2 border-b border-indigo-100 last:border-0">
                              <span className="text-[10px] font-bold truncate max-w-[120px]">{u.email}</span>
                              <button onClick={() => handleManualUpgrade(u.id, SubscriptionPlan.PRO)} className="text-[9px] font-black text-indigo-600 uppercase hover:underline">Activate</button>
                            </div>
                          ))
                       ) : (
                         <p className="text-[9px] text-indigo-300 italic text-center py-4">No high-usage free nodes.</p>
                       )}
                    </div>
                 </div>
              </div>
           </div>

           <div className="bg-slate-900 p-8 rounded-[3rem] text-white space-y-6 shadow-2xl border border-white/5">
              <div className="flex items-center gap-3">
                 <Building size={20} className="text-purple-400" />
                 <h3 className="text-sm font-black uppercase tracking-widest text-purple-400">Chain Operations</h3>
              </div>
              <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                Elevate users to <b>Institutional Lead</b> status to allow them to manage school chains and private curricula.
              </p>
              <div className="space-y-2">
                 <div className="flex items-center gap-2 text-[8px] font-black text-blue-400 uppercase">
                    <Scale size={10} /> Govt Auditor: Standards Compliance
                 </div>
                 <div className="flex items-center gap-2 text-[8px] font-black text-emerald-400 uppercase">
                    <Eye size={10} /> NGO Observer: Impact Data
                 </div>
                 <div className="flex items-center gap-2 text-[8px] font-black text-purple-400 uppercase">
                    <Building size={10} /> Inst. Lead: School Chain Manager
                 </div>
              </div>
           </div>
        </section>

        <section className="lg:col-span-3 space-y-6">
           <div className="bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-100 dark:border-white/5 shadow-sm overflow-hidden">
              <div className="p-8 border-b dark:border-white/5 flex flex-col md:flex-row justify-between gap-4">
                 <div className="flex items-center gap-4">
                    <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Identity Grid</h3>
                    <button onClick={fetchAdminData} className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"><RefreshCcw size={14}/></button>
                 </div>
                 <div className="relative">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                   <input 
                     type="text" 
                     placeholder="Search educator identity..." 
                     value={searchTerm}
                     onChange={(e) => setSearchTerm(e.target.value)}
                     className="pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 w-full md:w-64 font-bold"
                   />
                 </div>
              </div>
              <div className="overflow-x-auto">
                 <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-400 font-black uppercase tracking-widest text-[9px]">
                       <tr>
                          <th className="p-6">Identity</th>
                          <th className="p-6">Grid Tier</th>
                          <th className="p-6">Role Lens</th>
                          <th className="p-6 text-right">Overrides</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                       {users.filter(u => u.email.toLowerCase().includes(searchTerm.toLowerCase())).map((user) => (
                          <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group">
                             <td className="p-6">
                                <p className="font-bold text-slate-900 dark:text-white truncate max-w-[200px]">{user.email}</p>
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
                                {user.stakeholder_role ? (
                                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border w-fit ${
                                    user.stakeholder_role === StakeholderRole.GOVT_AUDITOR ? 'bg-blue-50 border-blue-100 text-blue-700' : 
                                    user.stakeholder_role === StakeholderRole.NGO_OBSERVER ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
                                    'bg-purple-50 border-purple-100 text-purple-700'
                                  }`}>
                                     {user.stakeholder_role === StakeholderRole.GOVT_AUDITOR ? <Scale size={12}/> : 
                                      user.stakeholder_role === StakeholderRole.NGO_OBSERVER ? <Eye size={12}/> : 
                                      <Building size={12}/>}
                                     <span className="text-[9px] font-black uppercase tracking-tight">{
                                      user.stakeholder_role === StakeholderRole.GOVT_AUDITOR ? 'Govt Auditor' :
                                      user.stakeholder_role === StakeholderRole.NGO_OBSERVER ? 'NGO Observer' :
                                      'Inst. Lead'
                                     }</span>
                                  </div>
                                ) : (
                                  <span className="text-[9px] text-slate-400 font-bold uppercase italic">Standard User</span>
                                )}
                             </td>
                             <td className="p-6 text-right">
                                <div className="flex gap-2 justify-end">
                                   {/* PROMO TO GOVT */}
                                   <button 
                                     disabled={isUpdating === user.id}
                                     onClick={() => handleStakeholderAssign(user.id, user.stakeholder_role === StakeholderRole.GOVT_AUDITOR ? null : StakeholderRole.GOVT_AUDITOR)}
                                     className={`p-2 rounded-lg transition-all ${user.stakeholder_role === StakeholderRole.GOVT_AUDITOR ? 'bg-blue-600 text-white shadow-lg' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
                                     title="Sovereign Audit Lens"
                                   >
                                      <Scale size={14} />
                                   </button>
                                   {/* PROMO TO NGO */}
                                   <button 
                                     disabled={isUpdating === user.id}
                                     onClick={() => handleStakeholderAssign(user.id, user.stakeholder_role === StakeholderRole.NGO_OBSERVER ? null : StakeholderRole.NGO_OBSERVER)}
                                     className={`p-2 rounded-lg transition-all ${user.stakeholder_role === StakeholderRole.NGO_OBSERVER ? 'bg-emerald-600 text-white shadow-lg' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
                                     title="Impact Observation Lens"
                                   >
                                      <Eye size={14} />
                                   </button>
                                   {/* PROMO TO INST LEAD (SCHOOL CHAIN) */}
                                   <button 
                                     disabled={isUpdating === user.id}
                                     onClick={() => handleStakeholderAssign(user.id, user.stakeholder_role === StakeholderRole.INST_LEAD ? null : StakeholderRole.INST_LEAD)}
                                     className={`p-2 rounded-lg transition-all ${user.stakeholder_role === StakeholderRole.INST_LEAD ? 'bg-purple-600 text-white shadow-lg' : 'bg-purple-50 text-purple-600 hover:bg-purple-100'}`}
                                     title="Institutional Cluster Lead"
                                   >
                                      <Building size={14} />
                                   </button>
                                   <div className="w-px h-8 bg-slate-100 dark:bg-white/5 mx-1" />
                                   {/* PLAN OVERRIDES */}
                                   <button 
                                     disabled={isUpdating === user.id}
                                     onClick={() => handleManualUpgrade(user.id, user.plan === 'pro' ? SubscriptionPlan.FREE : SubscriptionPlan.PRO)}
                                     className={`p-2 rounded-lg transition-all ${user.plan === 'pro' ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600'}`}
                                     title="Plan Toggle"
                                   >
                                      {user.plan === 'pro' ? <Zap size={14} /> : <UserCircle size={14} />}
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
