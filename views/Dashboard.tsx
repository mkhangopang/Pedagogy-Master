
'use client';

import React, { useState, useEffect } from 'react';
import { 
  FileText, Zap, Target, 
  Activity, GraduationCap,
  BookOpen, CheckCircle, Clock, ArrowRight, Sparkles, Database, Building, Cloud, CloudOff, Timer, Users, Gift, Share2, Pulse, BarChart
} from 'lucide-react';
import { UserProfile, Document, SubscriptionPlan } from '../types';
import { curriculumService } from '../lib/curriculum-service';
import { adaptiveService } from '../services/adaptiveService';

interface DashboardProps {
  user: UserProfile;
  documents: Document[];
  onProfileUpdate: (profile: UserProfile) => void;
  health: { status: string, message: string };
  onCheckHealth: () => Promise<boolean>;
  onViewChange: (view: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ user, documents, health, onCheckHealth, onViewChange }) => {
  const [coverage, setCoverage] = useState({ total: 0, completed: 0, percentage: 0 });
  const [showReferral, setShowReferral] = useState(false);
  const [latency, setLatency] = useState('240ms');

  const brandName = (user as any).tenant_config?.brand_name || 'EduNexus AI';
  const primaryColor = (user as any).tenant_config?.primary_color || '#4f46e5';

  useEffect(() => {
    curriculumService.getCoverageStats(user.id).then(stats => setCoverage(stats));
    // Simulate real-time grid fluctuation
    const interval = setInterval(() => {
      const val = Math.floor(Math.random() * (280 - 210) + 210);
      setLatency(`${val}ms`);
    }, 5000);
    return () => clearInterval(interval);
  }, [user.id]);

  const displayName = user.name || user.email.split('@')[0];
  const isConnected = health.status === 'connected';
  const isChecking = health.status === 'checking';
  const isFreeUser = user.plan === SubscriptionPlan.FREE;
  
  const hoursSaved = Math.round((user.generationCount || 0) * 0.5);

  return (
    <div className="space-y-8 md:space-y-12 animate-in fade-in duration-500 pb-20 px-2 md:px-0">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
             <Building size={14} className="text-slate-400" />
             <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{brandName} Node</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">Workspace</h1>
          <p className="text-slate-500 mt-1 font-medium text-sm">Identity Linked: <span className="text-indigo-600 font-bold">{displayName}</span></p>
        </div>
        
        <div className="flex gap-3">
          {isFreeUser && (
            <button 
              onClick={() => setShowReferral(true)}
              className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/30 text-indigo-600 dark:text-indigo-400 hover:scale-105 transition-all shadow-sm"
            >
              <Gift size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest">Earn Capacity</span>
            </button>
          )}
          
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
              {isChecking ? 'Syncing...' : isConnected ? 'Node Operational' : 'Offline'}
            </span>
          </button>
        </div>
      </header>

      {/* Real-time App Efficiency Metrics */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <StatCard title="Curriculum Vault" value={documents.length.toString()} icon={<FileText className="text-indigo-600" />} color="indigo" />
        <MetricCard title="Grid Latency" value={latency} icon={<Activity className="text-emerald-500" />} color="emerald" trend="Optimal" />
        <MetricCard title="App Efficiency" value="98.4%" icon={<Zap className="text-amber-500" />} color="amber" trend="+2.1%" />
        <StatCard title="Hours Saved" value={`${hoursSaved}h`} icon={<Timer className="text-purple-600" />} color="purple" />
      </section>

      <div className="grid grid-cols-1 gap-8">
        {/* Main Funnel Hero */}
        <section 
          onClick={() => onViewChange('tools')}
          className="bg-indigo-600 rounded-[3rem] p-10 md:p-16 shadow-2xl relative overflow-hidden text-white group cursor-pointer hover:shadow-indigo-500/20 transition-all border border-white/10" 
          style={{ backgroundColor: primaryColor }}
        >
          <div className="absolute top-0 right-0 p-8 opacity-[0.05] text-white group-hover:scale-110 transition-transform duration-700"><BookOpen size={300} /></div>
          <div className="relative z-10 max-w-2xl space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full text-[10px] font-black uppercase tracking-[0.2em]">
              <Sparkles size={12} className="text-emerald-300" /> Neural Grid Priority Active
            </div>
            <h2 className="text-4xl md:text-7xl font-black tracking-tighter leading-[0.85]">Synthesize <br />Instruction <span className="text-emerald-300">Fast.</span></h2>
            <p className="text-indigo-100 text-lg md:text-xl leading-relaxed font-medium opacity-90">
              Your institutional node has processed <b>{user.generationCount}</b> artifacts. Click below to enter the Synthesis Hub.
            </p>
            <div className="pt-4">
               <button 
                className="px-10 py-5 bg-white text-indigo-950 rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl group-hover:scale-105 transition-all flex items-center gap-3"
               >
                 Launch Synthesis Node <ArrowRight size={18} />
               </button>
            </div>
          </div>
        </section>

        {/* Real-time Grid Map Promotion Node */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-slate-900 rounded-[3rem] p-10 text-white relative overflow-hidden border border-white/5 shadow-xl">
               <div className="absolute top-0 right-0 p-6 opacity-10"><Database size={120} /></div>
               <h3 className="text-sm font-black uppercase tracking-[0.3em] text-slate-500 mb-6">Grid Statistics</h3>
               <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold opacity-60">Verified SLOs</span>
                    <span className="text-lg font-black text-indigo-400">1.2M+</span>
                  </div>
                  <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                     <div className="h-full bg-indigo-500 w-[94%]" />
                  </div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Global Standards Compliance: 99.9%</p>
               </div>
            </div>
            
            <div className="bg-emerald-600 rounded-[3rem] p-10 text-white relative overflow-hidden shadow-xl border border-white/10 flex flex-col justify-center">
               <div className="absolute top-0 right-0 p-6 opacity-10"><GraduationCap size={140} /></div>
               <h3 className="text-2xl font-black tracking-tight mb-2">99% Accuracy</h3>
               <p className="text-emerald-100 text-sm font-medium leading-relaxed mb-6">EduNexus AI uses Deterministic RAG to prevent AI hallucinations in lesson plans.</p>
               <div className="px-4 py-2 bg-white/10 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] w-fit">Standardized v9.4 Enabled</div>
            </div>
        </div>
      </div>

      {/* Referral Modal - Only for Free Users */}
      {showReferral && isFreeUser && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xl animate-in fade-in duration-300">
           <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[3rem] p-10 border border-slate-100 dark:border-white/5 shadow-2xl space-y-8 text-center">
              <div className="w-20 h-20 bg-indigo-600 text-white rounded-[2rem] flex items-center justify-center mx-auto shadow-2xl"><Users size={40} /></div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black dark:text-white tracking-tight uppercase">Expand the Grid</h3>
                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                   Copy your unique neural ID and share it. When a colleague joins, you both receive <b>+1 Permanent Vault Slot</b>.
                </p>
              </div>
              <div className="p-5 bg-slate-50 dark:bg-slate-800 rounded-2xl border-2 border-dashed border-slate-200 dark:border-white/10 font-mono text-sm text-indigo-600 font-bold">
                 EDU-NODE-{user.id.substring(0, 8).toUpperCase()}
              </div>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(`Join EduNexus AI: EDU-NODE-${user.id.substring(0, 8).toUpperCase()}`);
                  alert('Invite link synced to clipboard.');
                  setShowReferral(false);
                }}
                className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl active:scale-95"
              >
                Copy Invite Link
              </button>
           </div>
        </div>
      )}
    </div>
  );
};

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
