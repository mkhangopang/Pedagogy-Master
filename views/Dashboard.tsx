
'use client';

import React, { useState, useEffect } from 'react';
import { 
  FileText, Zap, Target, 
  Activity, GraduationCap,
  RefreshCw, Server, BookOpen, CheckCircle, Clock, ArrowRight, Sparkles, Database
} from 'lucide-react';
import { UserProfile, Document } from '../types';
import { curriculumService } from '../lib/curriculum-service';
import { adaptiveService } from '../services/adaptiveService';

interface DashboardProps {
  user: UserProfile;
  documents: Document[];
  onProfileUpdate: (profile: UserProfile) => void;
  health: { status: string, message: string };
  onCheckHealth: () => Promise<boolean>;
  onViewChange?: (view: string) => void; // Added for navigation
}

const Dashboard: React.FC<DashboardProps> = ({ user, documents, health, onCheckHealth, onViewChange }) => {
  const [isRefreshingHealth, setIsRefreshingHealth] = useState(false);
  const [coverage, setCoverage] = useState({ total: 0, completed: 0, percentage: 0 });
  const [recentArtifacts, setRecentArtifacts] = useState<any[]>([]);

  useEffect(() => {
    curriculumService.getCoverageStats(user.id).then(stats => {
      setCoverage(stats);
    });
    
    adaptiveService.getRecentSuccesses(user.id).then(artifacts => {
      setRecentArtifacts(artifacts);
    });
  }, [user.id, documents]);

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
          <p className="text-slate-500 mt-1 font-medium">Educator: <span className="text-indigo-600 font-bold">{displayName}</span></p>
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
        <StatCard title="Coverage" value={`${coverage.percentage}%`} icon={<CheckCircle className="w-5 h-5 text-amber-600" />} color="amber" />
        <StatCard title="Account" value={user.plan.toUpperCase()} icon={<GraduationCap className="w-5 h-5 text-purple-600" />} color="purple" />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-8">
          <section className="bg-indigo-600 rounded-[2.5rem] p-10 md:p-12 shadow-2xl relative overflow-hidden text-white">
            <div className="absolute top-0 right-0 p-8 opacity-[0.1] text-white"><BookOpen size={240} /></div>
            <div className="relative z-10 max-w-lg space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full text-[10px] font-bold uppercase tracking-widest">Neural Link Active</div>
              <h2 className="text-4xl font-black tracking-tight leading-none">Ready for Synthesis?</h2>
              <p className="text-indigo-100 leading-relaxed font-medium">
                Your workspace is synchronized with your curriculum library. Use the <span className="underline font-bold">AI Chat</span> to generate lesson plans grounded in your specific SLOs.
              </p>
              <div className="pt-2 flex items-center gap-4">
                 <button 
                  onClick={() => onViewChange?.('chat')}
                  className="px-6 py-3 bg-white text-indigo-950 rounded-2xl font-black text-sm shadow-xl hover:scale-105 transition-all cursor-pointer"
                 >
                   Start New Draft
                 </button>
              </div>
            </div>
          </section>

          {/* Curriculum Health Grid */}
          <section className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-white/5 shadow-sm">
             <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2"><Database size={18} className="text-indigo-500" /> Curriculum Health</h3>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{documents.length} Assets</span>
             </div>
             <div className="space-y-4">
                {documents.slice(0, 3).map(doc => (
                  <div key={doc.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5">
                    <div className="flex items-center gap-4">
                       <div className={`p-2 rounded-xl ${doc.geminiProcessed ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                         {doc.geminiProcessed ? <CheckCircle size={16} /> : <Clock size={16} />}
                       </div>
                       <div>
                         <p className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-[200px]">{doc.name}</p>
                         <p className="text-[10px] text-slate-400 font-bold uppercase">{doc.geminiProcessed ? 'Neural Indexed' : 'Processing...'}</p>
                       </div>
                    </div>
                    <div className="text-right">
                       <p className="text-[10px] font-black text-indigo-600">{doc.subject}</p>
                       <p className="text-[10px] text-slate-400">Grade {doc.gradeLevel}</p>
                    </div>
                  </div>
                ))}
                {documents.length === 0 && (
                   <div className="text-center py-10 text-slate-400 text-sm font-medium italic">No curriculum assets found.</div>
                )}
             </div>
          </section>
        </div>

        {/* Sidebar Activity Feed */}
        <div className="space-y-8">
          <section className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-white/5 shadow-sm h-full flex flex-col">
            <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2 mb-6"><Sparkles size={18} className="text-amber-500" /> Recent Successes</h3>
            <div className="space-y-6 flex-1">
              {recentArtifacts.map((artifact, idx) => (
                <div key={artifact.id} className="relative pl-6 pb-6 border-l border-slate-100 dark:border-white/5 last:pb-0">
                   <div className="absolute top-0 left-[-4px] w-2 h-2 rounded-full bg-indigo-500" />
                   <div>
                      <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1">{artifact.contentType}</p>
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300 line-clamp-2 mb-2 leading-relaxed">
                        {artifact.content.substring(0, 100).replace(/[#*`]/g, '')}...
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase">
                        <span>{new Date(artifact.createdAt).toLocaleDateString()}</span>
                        <span className="text-emerald-500">{artifact.status}</span>
                      </div>
                   </div>
                </div>
              ))}
              {recentArtifacts.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                  <Activity size={32} className="text-slate-200" />
                  <p className="text-xs text-slate-400 font-medium italic">Your pedagogical history will appear here as you generate content.</p>
                </div>
              )}
            </div>
            <button 
              onClick={() => onViewChange?.('tracker')}
              className="mt-8 w-full py-4 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 rounded-2xl flex items-center justify-center gap-3 text-xs font-black uppercase tracking-widest text-slate-500 transition-all"
            >
              View All History <ArrowRight size={14} />
            </button>
          </section>
        </div>
      </div>
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
