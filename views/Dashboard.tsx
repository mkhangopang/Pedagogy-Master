'use client';

import React, { useState, useEffect } from 'react';
import { 
  FileText, Zap, Target, 
  Activity, GraduationCap,
  RefreshCw, Server, BookOpen, CheckCircle, Clock, ArrowRight, Sparkles, Database, Building, Cloud, CloudOff, Timer, Users, Gift, Share2
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
}

const Dashboard: React.FC<DashboardProps> = ({ user, documents, health, onCheckHealth }) => {
  const [isRefreshingHealth, setIsRefreshingHealth] = useState(false);
  const [coverage, setCoverage] = useState({ total: 0, completed: 0, percentage: 0 });
  const [recentArtifacts, setRecentArtifacts] = useState<any[]>([]);
  const [showReferral, setShowReferral] = useState(false);

  const brandName = (user as any).tenant_config?.brand_name || 'EduNexus AI';
  const primaryColor = (user as any).tenant_config?.primary_color || '#4f46e5';

  useEffect(() => {
    curriculumService.getCoverageStats(user.id).then(stats => setCoverage(stats));
    adaptiveService.getRecentSuccesses(user.id).then(artifacts => setRecentArtifacts(artifacts));
  }, [user.id, documents]);

  const displayName = user.name || user.email.split('@')[0];
  const isConnected = health.status === 'connected';
  const isChecking = health.status === 'checking';
  
  // Calculate "Value Extracted" based on generation count
  const hoursSaved = Math.round((user.generationCount || 0) * 0.5); // Assume 30 mins saved per gen

  return (
    <div className="space-y-10 animate-in fade-in duration-500 pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
             <Building size={16} className="text-slate-400" />
             <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{brandName} Node</span>
          </div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">Workspace</h1>
          <p className="text-slate-500 mt-1 font-medium">Identity: <span className="text-indigo-600 font-bold">{displayName}</span></p>
        </div>
        
        <div className="flex gap-3">
          <button 
            onClick={() => setShowReferral(true)}
            className="flex items-center gap-3 px-5 py-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-800/30 text-indigo-600 dark:text-indigo-400 hover:scale-105 transition-all"
          >
            <Gift size={16} />
            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Earn Slots</span>
          </button>
          
          <button 
            onClick={() => onCheckHealth()}
            disabled={isRefreshingHealth || isChecking}
            className={`flex items-center gap-3 px-5 py-2.5 rounded-2xl border shadow-sm transition-all ${
              isChecking ? 'bg-slate-50 border-slate-200 text-slate-400' :
              isConnected ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 
              'bg-rose-50 border-rose-100 text-rose-700'
            }`}
          >
            {isConnected ? <Cloud size={14} /> : <CloudOff size={14} />}
            <span className="text-[10px] font-black uppercase tracking-widest">
              {isChecking ? 'Syncing...' : isConnected ? 'Node Active' : 'Offline'}
            </span>
          </button>
        </div>
      </header>

      {/* Strategic Value Section */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Curriculum Vault" value={documents.length.toString()} icon={<FileText className="w-5 h-5 text-indigo-600" />} color="indigo" />
        <StatCard title="Inference Used" value={`${user.queriesUsed}/${user.queriesLimit}`} icon={<Zap className="w-5 h-5 text-emerald-600" />} color="emerald" />
        <StatCard title="Hours Saved" value={`${hoursSaved}h`} icon={<Timer className="w-5 h-5 text-amber-600" />} color="amber" />
        <StatCard title="Plan Level" value={user.plan.toUpperCase()} icon={<GraduationCap className="w-5 h-5 text-purple-600" />} color="purple" />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Main Funnel Hero */}
          <section className="bg-indigo-600 rounded-[2.5rem] p-10 md:p-12 shadow-2xl relative overflow-hidden text-white" style={{ backgroundColor: primaryColor }}>
            <div className="absolute top-0 right-0 p-8 opacity-[0.1] text-white"><BookOpen size={240} /></div>
            <div className="relative z-10 max-w-lg space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full text-[10px] font-bold uppercase tracking-widest">
                <Timer size={10} className="text-emerald-400" /> High-Efficiency Protocol
              </div>
              <h2 className="text-4xl font-black tracking-tight leading-none">Synthesize content in <span className="text-emerald-300">&lt; 30 seconds.</span></h2>
              <p className="text-indigo-100 leading-relaxed font-medium">
                Your neural engine has already processed <b>{user.generationCount}</b> artifacts. You are operating at <b>{(user.successRate * 100).toFixed(0)}%</b> efficiency.
              </p>
              <div className="pt-2 flex items-center gap-4">
                 <div className="px-6 py-3 bg-white text-indigo-950 rounded-2xl font-black text-sm shadow-xl hover:scale-105 transition-all cursor-pointer">Launch Synthesis Node</div>
              </div>
            </div>
          </section>

          <section className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-white/5 shadow-sm">
             <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2"><Database size={18} className="text-indigo-500" /> Active Vaults</h3>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{documents.length} Permanent Nodes</span>
             </div>
             <div className="space-y-4">
                {documents.length > 0 ? documents.slice(0, 3).map(doc => (
                  <div key={doc.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5 group hover:border-indigo-400 transition-all">
                    <div className="flex items-center gap-4">
                       <div className={`p-2 rounded-xl ${doc.geminiProcessed ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                         {doc.geminiProcessed ? <CheckCircle size={16} /> : <Clock size={16} />}
                       </div>
                       <div>
                         <p className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-[200px]">{doc.name}</p>
                         <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Anchored to {doc.authority}</p>
                       </div>
                    </div>
                    <ArrowRight size={16} className="text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
                  </div>
                )) : (
                  <div className="py-10 text-center border-2 border-dashed border-slate-100 dark:border-white/5 rounded-3xl opacity-40 italic text-xs">
                    No curriculum nodes mapped yet.
                  </div>
                )}
             </div>
          </section>
        </div>

        <div className="space-y-8">
          {/* Referral Incentive Node (Monetization Hack) */}
          <section className="bg-emerald-600 p-8 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden group cursor-pointer" onClick={() => setShowReferral(true)}>
             <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-125 transition-transform"><Share2 size={100} /></div>
             <h3 className="text-sm font-black uppercase tracking-[0.2em] mb-4">Neural Growth</h3>
             <p className="text-2xl font-black tracking-tight mb-2 leading-none">Get 1 Free Slot</p>
             <p className="text-xs font-medium text-emerald-100 mb-6">Refer a fellow educator to expand your vault capacity.</p>
             <div className="py-2.5 px-4 bg-white/20 rounded-xl text-[10px] font-bold text-center uppercase tracking-widest border border-white/20">Invite Now</div>
          </section>

          <section className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-white/5 shadow-sm h-full flex flex-col">
            <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2 mb-6"><Sparkles size={18} className="text-amber-500" /> Neural Artifacts</h3>
            <div className="space-y-6 flex-1">
              {recentArtifacts.slice(0, 4).map((artifact) => (
                <div key={artifact.id} className="relative pl-6 pb-6 border-l border-slate-100 dark:border-white/5 last:pb-0">
                   <div className="absolute top-0 left-[-4px] w-2 h-2 rounded-full bg-indigo-500" />
                   <div>
                      <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1">{artifact.contentType}</p>
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300 line-clamp-2 mb-2 leading-relaxed">
                        {artifact.content.substring(0, 80).replace(/[#*`]/g, '')}...
                      </p>
                      <span className="text-[9px] font-black text-slate-300 uppercase">{new Date(artifact.createdAt).toLocaleDateString()}</span>
                   </div>
                </div>
              ))}
              {recentArtifacts.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                  <Activity size={32} className="text-slate-200" />
                  <p className="text-xs text-slate-400 font-medium italic">History materializing...</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Referral Modal */}
      {showReferral && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xl animate-in fade-in duration-300">
           <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[3rem] p-10 border border-slate-100 dark:border-white/5 shadow-2xl space-y-8 text-center">
              <div className="w-20 h-20 bg-indigo-600 text-white rounded-[2rem] flex items-center justify-center mx-auto shadow-2xl"><Users size={40} /></div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black dark:text-white tracking-tight uppercase">Expand the Grid</h3>
                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                   Copy your unique neural ID and share it. When a colleague joins and completes their first synthesis, you both receive <b>+1 Permanent Vault Slot</b>.
                </p>
              </div>
              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border-2 border-dashed border-slate-200 dark:border-white/10 font-mono text-sm text-indigo-600 font-bold">
                 EDU-NODE-{user.id.substring(0, 8).toUpperCase()}
              </div>
              <button 
                onClick={() => setShowReferral(false)}
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl active:scale-95"
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
  <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] shadow-sm border border-slate-100 dark:border-white/5 flex flex-col gap-6 hover:shadow-xl transition-all group">
    <div className="flex items-center justify-between">
      <div className={`p-3 bg-${color}-50 dark:bg-${color}-950/20 rounded-2xl group-hover:scale-110 transition-transform`}>{icon}</div>
      <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{title}</span>
    </div>
    <div className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{value}</div>
  </div>
);

export default Dashboard;