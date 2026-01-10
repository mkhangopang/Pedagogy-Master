
'use client';

import React, { useState } from 'react';
import { 
  FileText, Zap, Target, 
  Activity, GraduationCap,
  RefreshCw, Server, BookOpen
} from 'lucide-react';
import { UserProfile, Document } from '../types';
import { supabase } from '../lib/supabase';

interface DashboardProps {
  user: UserProfile;
  documents: Document[];
  onProfileUpdate: (profile: UserProfile) => void;
  health: { status: string, message: string };
  onCheckHealth: () => Promise<boolean>;
}

const Dashboard: React.FC<DashboardProps> = ({ user, documents, health, onCheckHealth }) => {
  const [isRefreshingHealth, setIsRefreshingHealth] = useState(false);

  const totalSLOs = documents.reduce((acc, doc) => acc + (doc.sloTags?.length || 0), 0);
  const displayName = user.name || user.email.split('@')[0];

  const handleRefreshHealth = async () => {
    setIsRefreshingHealth(true);
    await onCheckHealth();
    setIsRefreshingHealth(false);
  };

  const isConnected = health.status === 'connected';

  return (
    <div className="space-y-10 animate-in fade-in duration-500 pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">Workspace</h1>
          <p className="text-slate-500 mt-1 font-medium">Educator: {displayName}</p>
        </div>
        <button 
          onClick={handleRefreshHealth}
          disabled={isRefreshingHealth}
          className={`flex items-center gap-3 px-4 py-2 rounded-xl border shadow-sm transition-all ${
            isConnected ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'
          }`}
        >
          {isRefreshingHealth ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Server className="w-3 h-3" />}
          <span className="text-[10px] font-black uppercase tracking-widest">{isConnected ? 'Cloud Node Online' : 'Cloud Sync Error'}</span>
        </button>
      </header>

      {/* Hero Stats Section */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Library" value={documents.length.toString()} icon={<FileText className="w-5 h-5 text-indigo-600" />} color="indigo" />
        <StatCard title="AI Usage" value={`${user.queriesUsed}/${user.queriesLimit}`} icon={<Zap className="w-5 h-5 text-emerald-600" />} color="emerald" />
        <StatCard title="SLO Points" value={totalSLOs.toString()} icon={<Target className="w-5 h-5 text-amber-600" />} color="amber" />
        <StatCard title="Account" value={user.plan.toUpperCase()} icon={<GraduationCap className="w-5 h-5 text-purple-600" />} color="purple" />
      </section>

      {/* Quick Access or Welcome Area */}
      <section className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/5 rounded-[2.5rem] p-10 md:p-12 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-[0.03] text-indigo-500"><BookOpen size={240} /></div>
        <div className="relative z-10 max-w-2xl space-y-4">
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Welcome to your Neural Pedagogy Hub</h2>
          <p className="text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
            Your workspace is synchronized with the latest pedagogical frameworks. 
            Ingest your curriculum documents in the <b>Library</b> to enable localized AI grounding 
            across all synthesis tools.
          </p>
          <div className="pt-4 flex items-center gap-4">
            <div className="flex -space-x-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="w-10 h-10 rounded-full border-2 border-white dark:border-slate-900 bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-[10px] font-black">AI</div>
              ))}
            </div>
            <p className="text-xs font-bold text-slate-400">Multi-provider nodes connected & ready.</p>
          </div>
        </div>
      </section>
    </div>
  );
};

const StatCard = ({ title, value, icon, color }: { title: string, value: string, icon: React.ReactNode, color: string }) => (
  <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] shadow-sm border border-slate-100 dark:border-white/5 flex flex-col gap-6 hover:shadow-xl transition-all">
    <div className="flex items-center justify-between">
      <div className={`p-3 bg-${color}-50 dark:bg-${color}-950/20 rounded-2xl`}>{icon}</div>
      <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{title}</span>
    </div>
    <div className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{value}</div>
  </div>
);

export default Dashboard;
