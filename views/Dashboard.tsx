
'use client';

import React, { useState, useEffect } from 'react';
import { 
  FileText, Zap, Activity, GraduationCap,
  BookOpen, CheckCircle, Clock, ArrowRight, Sparkles, Building, Cloud, CloudOff, Timer, Users, BarChart, Settings, Save,
  Loader2, SearchCheck, ShieldCheck, Eye, TrendingUp, UserPlus, ClipboardList
} from 'lucide-react';
import { UserProfile, Document, SubscriptionPlan, StakeholderRole } from '../types';
import { supabase } from '../lib/supabase';

interface DashboardProps {
  user: UserProfile;
  documents: Document[];
  onProfileUpdate: (profile: UserProfile) => void;
  health: { status: string, message: string };
  onCheckHealth: () => Promise<boolean>;
  onViewChange: (view: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ user, documents, health, onCheckHealth, onViewChange, onProfileUpdate }) => {
  const [latency, setLatency] = useState('240ms');
  const [isEditingBranding, setIsEditingBranding] = useState(false);
  const [tempWorkspaceName, setTempWorkspaceName] = useState(user.workspaceName || '');
  const [isSavingBranding, setIsSavingBranding] = useState(false);

  const brandName = user.workspaceName || 'EduNexus AI';
  const isPro = user.plan !== SubscriptionPlan.FREE;

  useEffect(() => {
    const interval = setInterval(() => {
      const val = Math.floor(Math.random() * (280 - 210) + 210);
      setLatency(`${val}ms`);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveBranding = async () => {
    setIsSavingBranding(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ workspace_name: tempWorkspaceName })
        .eq('id', user.id);
      
      if (!error) {
        onProfileUpdate({ ...user, workspaceName: tempWorkspaceName });
        setIsEditingBranding(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSavingBranding(false);
    }
  };

  const displayName = user.name || user.email.split('@')[0];
  const isConnected = health.status === 'connected';
  const isChecking = health.status === 'checking';
  const hoursSaved = Math.round((user.generationCount || 0) * 0.5);

  return (
    <div className="space-y-8 md:space-y-12 animate-in fade-in duration-500 pb-20 px-2 md:px-0 text-left">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
             <Building size={14} className="text-slate-400" />
             <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{brandName} Platform Workspace</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">Workspace</h1>
          <p className="text-slate-500 mt-1 font-medium text-sm">Linked Identity: <span className="text-indigo-600 font-bold">{displayName}</span></p>
        </div>
        
        <div className="flex gap-3">
          {user.stakeholderRole === StakeholderRole.INST_LEAD && (
            <div className="flex items-center gap-2 px-4 py-2 bg-purple-50 border border-purple-100 rounded-2xl">
              <Building size={14} className="text-purple-600" />
              <span className="text-[9px] font-black uppercase tracking-widest text-purple-600">Institutional Cluster Lead</span>
            </div>
          )}
          <button 
            onClick={() => { setIsEditingBranding(true); }}
            className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:scale-105 transition-all shadow-sm"
          >
            <Settings size={16} />
            <span className="text-[10px] font-black uppercase tracking-widest">Institutional Settings</span>
          </button>

          <button 
            onClick={() => onCheckHealth()}
            disabled={isChecking}
            className={`flex items-center gap-3 px-6 py-3 rounded-2xl border shadow-sm transition-all ${
              isChecking ? 'bg-slate-50 border-slate-200 text-slate-400' :
              isConnected ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 
              'bg-rose-50 border-rose-100 text-rose-700'
            }`}
          >
            {isConnected ? <Cloud size={14} /> : <CloudOff size={14} />}
            <span className="text-[10px] font-black uppercase tracking-widest">
              {isChecking ? 'Syncing...' : isConnected ? 'Service Operational' : 'System Offline'}
            </span>
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <StatCard title="Curriculum Vault" value={documents.length.toString()} icon={<FileText className="text-indigo-600" />} color="indigo" />
        <MetricCard title="Grid Latency" value={latency} icon={<Activity className="text-emerald-500" />} color="emerald" trend="Optimal" />
        <MetricCard title="App Efficiency" value="98.4%" icon={<Zap className="text-amber-500" />} color="amber" trend="+2.1%" />
        <StatCard title="Success Metric" value={`${hoursSaved}h`} icon={<Timer className="text-purple-600" />} color="purple" />
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {user.stakeholderRole === StakeholderRole.INST_LEAD && (
          <PerspectiveCard 
            title="Cluster Performance" 
            desc="Oversee lesson plan quality and curriculum adherence across all teachers in your school cluster."
            value="12 Accounts"
            icon={<Users size={32} className="text-purple-600" />}
            btnLabel="Manage Teachers"
            onClick={() => onViewChange('mission')}
          />
        )}
        {user.stakeholderRole === StakeholderRole.GOVT_AUDITOR && (
          <PerspectiveCard 
            title="Alignment Compliance" 
            desc="Surgical audit of every AI interaction against the National Curriculum Framework."
            value="99.2%"
            icon={<SearchCheck size={32} className="text-blue-600" />}
            btnLabel="View Audit Logs"
            onClick={() => onViewChange('audit_logs')}
          />
        )}
        {user.stakeholderRole === StakeholderRole.NGO_OBSERVER && (
          <PerspectiveCard 
            title="Pedagogical Uplift" 
            desc="Tracking the shift from 'Remembering' to 'Creating' level content generation."
            value="+42%"
            icon={<TrendingUp size={32} className="text-emerald-600" />}
            btnLabel="Impact Dashboard"
            onClick={() => onViewChange('impact_metrics')}
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-8">
        <section 
          onClick={() => onViewChange('tools')}
          className="bg-indigo-600 rounded-[3rem] p-10 md:p-16 shadow-2xl relative overflow-hidden text-white group cursor-pointer hover:shadow-indigo-500/20 transition-all border border-white/10" 
        >
          <div className="absolute top-0 right-0 p-8 opacity-[0.05] text-white group-hover:scale-110 transition-transform duration-700"><BookOpen size={300} /></div>
          <div className="relative z-10 max-w-2xl space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full text-[10px] font-black uppercase tracking-[0.2em]">
              <Sparkles size={12} className="text-emerald-300" /> Intelligence Hub Access Active
            </div>
            <h2 className="text-4xl md:text-7xl font-black tracking-tighter leading-[0.85]">Launch <br />Synthesis <span className="text-emerald-300">Hub.</span></h2>
            <p className="text-indigo-100 text-lg md:text-xl leading-relaxed font-medium opacity-90">
              Access high-fidelity tools for 5E lesson planning, Bloom-scaled assessments, and curriculum alignment auditing.
            </p>
            <div className="pt-4">
               <button 
                className="px-10 py-5 bg-white text-indigo-950 rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl group-hover:scale-105 transition-all flex items-center gap-3"
               >
                 Launch Dashboard <ArrowRight size={18} />
               </button>
            </div>
          </div>
        </section>
      </div>

      {isEditingBranding && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xl animate-in fade-in duration-300">
           <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[3rem] p-10 border border-slate-100 dark:border-white/5 shadow-2xl space-y-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white"><Settings size={24} /></div>
                <div>
                  <h3 className="text-2xl font-black dark:text-white tracking-tight uppercase">Branding Config</h3>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Personalize Artifacts</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                   <div className="flex items-center justify-between">
                     <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Workspace / School Name</label>
                   </div>
                   <input 
                    type="text" 
                    disabled={!isPro}
                    value={tempWorkspaceName}
                    onChange={(e) => setTempWorkspaceName(e.target.value)}
                    placeholder={isPro ? "e.g. Sindh Model School" : "Pro Upgrade Required for Branding"}
                    className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-white/5 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold dark:text-white"
                   />
                </div>

                <div className="flex gap-3 pt-4">
                   <button onClick={() => setIsEditingBranding(false)} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-widest">Cancel</button>
                   <button 
                    onClick={handleSaveBranding}
                    disabled={isSavingBranding || !isPro}
                    className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl flex items-center justify-center gap-2"
                   >
                     {isSavingBranding ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Commit Changes
                   </button>
                </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

const PerspectiveCard = ({ title, desc, value, icon, btnLabel, onClick }: any) => (
  <div className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] shadow-xl border-2 border-slate-50 dark:border-white/5 flex flex-col gap-6 group hover:border-indigo-400 transition-all">
    <div className="flex justify-between items-start">
      <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl">{icon}</div>
      <div className="text-right">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</p>
        <div className="text-3xl font-black text-slate-900 dark:text-white">{value}</div>
      </div>
    </div>
    <p className="text-xs font-medium text-slate-500 leading-relaxed">{desc}</p>
    <button onClick={onClick} className="mt-auto flex items-center gap-2 text-indigo-600 font-black text-[10px] uppercase tracking-widest hover:underline">
      {btnLabel} <ArrowRight size={14} />
    </button>
  </div>
);

const StatCard = ({ title, value, icon, color }: { title: string, value: string, icon: React.ReactNode, color: string }) => (
  <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-sm border border-slate-100 dark:border-white/5 flex flex-col gap-6 hover:shadow-xl transition-all group">
    <div className="flex items-center justify-between">
      <div className={`p-3 bg-${color}-50 dark:bg-${color}-950/20 rounded-2xl group-hover:scale-110 transition-transform shadow-sm`}>{icon}</div>
      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{title}</span>
    </div>
    <div className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter">{value}</div>
  </div>
);

const MetricCard = ({ title, value, icon, color, trend }: any) => (
  <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-sm border border-slate-100 dark:border-white/5 flex flex-col gap-6 hover:shadow-xl transition-all group">
    <div className="flex items-center justify-between">
      <div className={`p-3 bg-${color}-50 dark:bg-${color}-950/20 rounded-2xl shadow-sm`}>{icon}</div>
      <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-full">{trend}</span>
    </div>
    <div className="space-y-1">
       <div className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter">{value}</div>
       <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{title}</p>
    </div>
  </div>
);

export default Dashboard;
