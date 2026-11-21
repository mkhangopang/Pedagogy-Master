'use client';

import React, { useState, useEffect } from 'react';
import { 
  FileText, Zap, Activity, BookOpen, ArrowRight, Building, 
  Cloud, CloudOff, Settings, Save, TrendingUp, Loader2, X
} from 'lucide-react';
import { UserProfile, Document, SubscriptionPlan } from '../types';
import { supabase } from '../lib/supabase';
import { logActivity } from '../lib/activity-logger';

interface DashboardProps {
  user: UserProfile;
  documents: Document[];
  onProfileUpdate: (profile: UserProfile) => void;
  health: { status: string, message: string };
  onCheckHealth: () => Promise<boolean>;
  onViewChange: (view: string) => void;
  onExitGuest?: (targetMode?: 'login' | 'signup') => void;
}

const Dashboard: React.FC<DashboardProps> = ({ user, documents, health, onCheckHealth, onViewChange, onProfileUpdate, onExitGuest }) => {
  const [latency, setLatency] = useState('110ms');
  const [isEditingBranding, setIsEditingBranding] = useState(false);
  const [tempWorkspaceName, setTempWorkspaceName] = useState(user.workspaceName || '');
  const [isSavingBranding, setIsSavingBranding] = useState(false);

  const brandName = user.workspaceName || 'EduNexus AI';

  useEffect(() => {
    const interval = setInterval(() => {
      const val = Math.floor(Math.random() * (140 - 90) + 90);
      setLatency(`${val}ms`);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveBranding = async () => {
    setIsSavingBranding(true);
    try {
      const { error } = await supabase.from('profiles').update({ workspace_name: tempWorkspaceName }).eq('id', user.id);
      if (!error) {
        onProfileUpdate({ ...user, workspaceName: tempWorkspaceName });
        logActivity({
          category: 'setting_adjustment',
          action: 'Institutional Branding Adjusted',
          summary: `Updated workspace branding to "${tempWorkspaceName}"`,
          status: 'success',
          metadata: {
            settingKey: 'workspaceName',
            previousValue: user.workspaceName,
            newValue: tempWorkspaceName
          }
        });
        setIsEditingBranding(false);
      }
    } finally { setIsSavingBranding(false); }
  };

  const displayName = user.isGuest ? 'Guest Preview' : (user.name || user.email.split('@')[0]);
  const isConnected = health.status === 'connected';

  return (
    <div className="space-y-8 md:space-y-12 animate-in fade-in duration-500 pb-20 px-2 md:px-0 text-left">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
             <Building size={12} className="text-slate-500 dark:text-slate-400" />
             <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-400">{brandName} Node</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-bold text-slate-900 dark:text-slate-100 tracking-tighter uppercase">Workspace</h1>
          <p className="text-slate-600 dark:text-slate-300 mt-1 font-semibold text-xs">Ident: <span className="text-indigo-600 dark:text-indigo-400">{displayName}</span></p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={() => onViewChange('activity_log')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-indigo-700 dark:text-indigo-300 hover:scale-[1.02] transition-all shadow-sm"
          >
            <Activity size={14} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Activity Log</span>
          </button>

          {!user.isGuest && (
            <button 
              onClick={() => setIsEditingBranding(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:scale-[1.02] transition-all shadow-sm"
            >
              <Settings size={14} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Settings</span>
            </button>
          )}

          {user.isGuest && onExitGuest && (
            <button
              type="button"
              onClick={() => onExitGuest('signup')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-sm"
            >
              <span className="text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">Create Free Account</span>
            </button>
          )}

          <button 
            onClick={() => onCheckHealth()}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border shadow-sm transition-all ${
              isConnected
                ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300'
            }`}
          >
            {isConnected ? <Cloud size={14} /> : <CloudOff size={14} />}
            <span className="text-[10px] font-bold uppercase tracking-widest">{user.isGuest ? 'Preview Active' : isConnected ? 'Grid Online' : 'Grid Offline'}</span>
          </button>
        </div>
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
        {/* STAT FIX: Ensure Vault count includes all documents regardless of state */}
        <StatCard title="Vault" value={documents.length.toString()} icon={<FileText size={18} className="text-indigo-600" />} color="indigo" />
        <StatCard title="Latency" value={latency} icon={<Activity size={18} className="text-emerald-500" />} color="emerald" />
        <StatCard title="Sync Rate" value="99.9%" icon={<Zap size={18} className="text-amber-500" />} color="amber" />
        <StatCard title="Efficiency" value="+85%" icon={<TrendingUp size={18} className="text-purple-600" />} color="purple" />
      </section>

      <div className="grid grid-cols-1 gap-6">
        <section 
          onClick={() => onViewChange('tools')}
          className="bg-indigo-600 rounded-[2.5rem] p-8 md:p-14 shadow-2xl relative overflow-hidden text-white group cursor-pointer hover:shadow-indigo-500/20 transition-all" 
        >
          <div className="absolute top-0 right-0 p-8 opacity-[0.05] text-white group-hover:scale-105 transition-transform duration-700"><BookOpen size={250} /></div>
          <div className="relative z-10 max-w-2xl space-y-6">
            <h2 className="text-3xl md:text-6xl font-bold tracking-tighter leading-none">Synthesis <br />Hub <span className="text-emerald-300">Active.</span></h2>
            <p className="text-indigo-100 text-sm md:text-lg leading-relaxed font-semibold opacity-90">
              Access high-fidelity tools for 5E lesson planning and Bloom-scaled assessments.
            </p>
            <div className="pt-4">
               <button className="px-8 py-4 bg-white text-indigo-950 rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-2xl group-hover:scale-105 transition-all flex items-center gap-3">
                 Open Synthesis Node <ArrowRight size={14} />
               </button>
            </div>
          </div>
        </section>
      </div>

      {isEditingBranding && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xl animate-in fade-in duration-300">
           <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[3rem] p-10 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-8">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight uppercase">Settings</h3>
                <button onClick={() => setIsEditingBranding(false)} className="p-2 text-slate-500 dark:text-slate-400 hover:text-rose-500"><X size={24} /></button>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest ml-1">Workspace Identity</label>
                  <input 
                    type="text" 
                    value={tempWorkspaceName} 
                    onChange={(e) => setTempWorkspaceName(e.target.value)}
                    className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl font-bold text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-600 transition-all"
                    placeholder="Workspace Name"
                  />
                </div>
                <button 
                  onClick={handleSaveBranding}
                  disabled={isSavingBranding}
                  className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
                >
                  {isSavingBranding ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                  Commit Identity Changes
                </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

const STAT_COLOR_MAP: Record<string, string> = {
  indigo: 'bg-indigo-50 dark:bg-indigo-950/50',
  emerald: 'bg-emerald-50 dark:bg-emerald-950/50',
  amber: 'bg-amber-50 dark:bg-amber-950/50',
  purple: 'bg-purple-50 dark:bg-purple-950/50',
};

const StatCard = ({ title, value, icon, color }: any) => (
  <div className="bg-white dark:bg-slate-900 p-5 md:p-8 rounded-[1.5rem] md:rounded-[2rem] border border-slate-200 dark:border-slate-800 flex flex-col gap-4 hover:shadow-lg transition-all group">
    <div className={`w-8 h-8 md:w-10 md:h-10 ${STAT_COLOR_MAP[color] || 'bg-slate-100 dark:bg-slate-800'} rounded-lg md:rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform`}>{icon}</div>
    <div>
      <div className="text-xl md:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tighter">{value}</div>
      <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest">{title}</p>
    </div>
  </div>
);

export default Dashboard;