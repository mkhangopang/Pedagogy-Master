'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  FileText, Zap, Activity, BookOpen, ArrowRight, Building, 
  Cloud, CloudOff, Settings, Save, TrendingUp, Loader2, X,
  Flame, Target, BookMarked, ClipboardCheck, Sparkles,
  CheckCircle2, Clock, BarChart3, ChevronRight, Trophy
} from 'lucide-react';
import { UserProfile, Document, SubscriptionPlan } from '../types';
import { supabase } from '../lib/supabase';

interface DashboardProps {
  user: UserProfile;
  documents: Document[];
  onProfileUpdate: (profile: UserProfile) => void;
  health: { status: string; message: string };
  onCheckHealth: () => Promise<boolean>;
  onViewChange: (view: string) => void;
}

interface ActivityEvent {
  id: string;
  event_type: string;
  metadata: any;
  created_at: string;
}

interface UsageStats {
  lessonsCreated: number;
  quizzesCreated: number;
  standardsViewed: number;
  totalGenerations: number;
  streakDays: number;
  bloomCounts: Record<string, number>;
}

const BLOOM_COLORS: Record<string, string> = {
  Remember:   '#6366f1',
  Understand: '#3b82f6',
  Apply:      '#10b981',
  Analyze:    '#f59e0b',
  Evaluate:   '#f97316',
  Create:     '#a855f7',
};

const EVENT_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  lesson_created:    { label: 'Generated a Lesson Plan',  icon: '📋', color: 'text-indigo-600' },
  quiz_generated:    { label: 'Generated a Quiz',         icon: '✅', color: 'text-emerald-600' },
  rubric_created:    { label: 'Created a Rubric',         icon: '📊', color: 'text-amber-600' },
  audit_tagged:      { label: 'Ran Audit Tagger',         icon: '🔍', color: 'text-cyan-600' },
  doc_uploaded:      { label: 'Uploaded a Document',      icon: '📄', color: 'text-purple-600' },
  standard_viewed:   { label: 'Browsed Standards',        icon: '📚', color: 'text-blue-600' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const Dashboard: React.FC<DashboardProps> = ({ user, documents, health, onCheckHealth, onViewChange, onProfileUpdate }) => {
  const [latency, setLatency] = useState('110ms');
  const [isEditingBranding, setIsEditingBranding] = useState(false);
  const [tempWorkspaceName, setTempWorkspaceName] = useState(user.workspaceName || '');
  const [isSavingBranding, setIsSavingBranding] = useState(false);
  const [recentActivity, setRecentActivity] = useState<ActivityEvent[]>([]);
  const [usageStats, setUsageStats] = useState<UsageStats>({
    lessonsCreated: 0, quizzesCreated: 0, standardsViewed: 0,
    totalGenerations: 0, streakDays: 0, bloomCounts: {}
  });
  const [sloCount, setSloCount] = useState(0);
  const [loadingStats, setLoadingStats] = useState(true);

  const brandName = user.workspaceName || 'Pedagogy Master';
  const displayName = user.name || user.email.split('@')[0];
  const isConnected = health.status === 'connected';
  const queriesPct = Math.min(Math.round((user.queriesUsed / user.queriesLimit) * 100), 100);
  const readyDocs = documents.filter(d => d.status === 'ready').length;

  // Latency ticker
  useEffect(() => {
    const interval = setInterval(() => {
      setLatency(`${Math.floor(Math.random() * 50 + 90)}ms`);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Fetch usage data
  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      // Recent activity
      const { data: events } = await supabase
        .from('usage_events')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(8);

      if (events) {
        setRecentActivity(events);

        // Compute stats from events
        const stats: UsageStats = {
          lessonsCreated: events.filter(e => e.event_type === 'lesson_created').length,
          quizzesCreated: events.filter(e => e.event_type === 'quiz_generated').length,
          standardsViewed: events.filter(e => e.event_type === 'standard_viewed').length,
          totalGenerations: events.length,
          streakDays: 0,
          bloomCounts: {},
        };

        // Streak calculation
        const days = new Set(events.map(e => new Date(e.created_at).toDateString()));
        let streak = 0;
        const today = new Date();
        for (let i = 0; i < 30; i++) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          if (days.has(d.toDateString())) streak++;
          else if (i > 0) break;
        }
        stats.streakDays = streak;

        // Bloom counts from metadata
        events.forEach(e => {
          const bl = e.metadata?.bloom_level;
          if (bl) stats.bloomCounts[bl] = (stats.bloomCounts[bl] || 0) + 1;
        });

        setUsageStats(stats);
      }

      // SLO count
      const docIds = documents.map(d => d.id);
      if (docIds.length > 0) {
        const { count } = await supabase
          .from('slo_database')
          .select('id', { count: 'exact', head: true })
          .in('document_id', docIds);
        setSloCount(count || 0);
      }
    } catch (e) {
      console.error('Stats fetch error:', e);
    } finally {
      setLoadingStats(false);
    }
  }, [user.id, documents]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const handleSaveBranding = async () => {
    setIsSavingBranding(true);
    try {
      const { error } = await supabase.from('profiles').update({ workspace_name: tempWorkspaceName }).eq('id', user.id);
      if (!error) { onProfileUpdate({ ...user, workspaceName: tempWorkspaceName }); setIsEditingBranding(false); }
    } finally { setIsSavingBranding(false); }
  };

  const totalBloom = Object.values(usageStats.bloomCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500 pb-20 px-2 md:px-0 text-left">

      {/* ── Header ── */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Building size={12} className="text-slate-400" />
            <span className="text-[8px] font-bold uppercase tracking-widest text-slate-400">{brandName} Node</span>
            {usageStats.streakDays > 0 && (
              <span className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-orange-500 bg-orange-50 dark:bg-orange-900/20 px-2 py-0.5 rounded-full">
                <Flame size={9}/> {usageStats.streakDays} day streak
              </span>
            )}
          </div>
          <h1 className="text-3xl md:text-5xl font-bold text-slate-900 dark:text-white tracking-tighter uppercase">
            Welcome back, {displayName.split(' ')[0]}
          </h1>
          <p className="text-slate-500 mt-1 font-semibold text-xs">
            {readyDocs > 0 ? `${readyDocs} curriculum doc${readyDocs !== 1 ? 's' : ''} ready · ${sloCount} standards indexed` : 'Upload your first curriculum document to get started'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setIsEditingBranding(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:scale-[1.02] transition-all shadow-sm">
            <Settings size={14} />
            <span className="text-[9px] font-bold uppercase tracking-widest">Settings</span>
          </button>
          <button onClick={onCheckHealth} className={`flex items-center gap-2 px-4 py-2 rounded-xl border shadow-sm transition-all ${isConnected ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
            {isConnected ? <Cloud size={14} /> : <CloudOff size={14} />}
            <span className="text-[9px] font-bold uppercase tracking-widest">{isConnected ? 'Grid Online' : 'Offline'}</span>
          </button>
        </div>
      </header>

      {/* ── Stats Row ── */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard title="Curriculum Docs" value={documents.length.toString()} sub={`${readyDocs} ready`} icon={<FileText size={18} className="text-indigo-600"/>} color="indigo" onClick={() => onViewChange('documents')} />
        <StatCard title="Standards Indexed" value={sloCount.toString()} sub="SLO codes" icon={<BookMarked size={18} className="text-emerald-500"/>} color="emerald" onClick={() => onViewChange('standards')} />
        <StatCard title="AI Generations" value={user.queriesUsed.toString()} sub={`of ${user.queriesLimit} this month`} icon={<Zap size={18} className="text-amber-500"/>} color="amber" onClick={() => onViewChange('tools')} />
        <StatCard title="Lessons Created" value={usageStats.lessonsCreated.toString()} sub={`+${usageStats.quizzesCreated} quizzes`} icon={<ClipboardCheck size={18} className="text-purple-600"/>} color="purple" onClick={() => onViewChange('tools')} />
      </section>

      {/* ── Middle Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">

        {/* Query usage ring */}
        <div className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-100 dark:border-white/5 p-6 flex flex-col gap-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Monthly Usage</h3>
            {user.plan === SubscriptionPlan.FREE && (
              <button onClick={() => onViewChange('pricing')} className="text-[9px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full hover:bg-indigo-100 transition-all">
                Upgrade ↗
              </button>
            )}
          </div>
          <div className="flex items-center gap-5">
            {/* Ring */}
            <div className="relative w-20 h-20 shrink-0">
              <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e2e8f0" strokeWidth="3"/>
                <circle cx="18" cy="18" r="15.9" fill="none"
                  stroke={queriesPct > 80 ? '#ef4444' : queriesPct > 60 ? '#f59e0b' : '#6366f1'}
                  strokeWidth="3"
                  strokeDasharray={`${queriesPct} ${100 - queriesPct}`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-black text-slate-800 dark:text-white">{queriesPct}%</span>
              </div>
            </div>
            <div>
              <p className="text-2xl font-black text-slate-900 dark:text-white">{user.queriesUsed}<span className="text-sm font-medium text-slate-400">/{user.queriesLimit}</span></p>
              <p className="text-xs text-slate-400 font-medium">AI queries used</p>
              {queriesPct > 80 && <p className="text-[10px] text-red-500 font-bold mt-1">⚠ Running low</p>}
            </div>
          </div>
          {/* Bar */}
          <div className="w-full bg-slate-100 dark:bg-white/5 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${queriesPct > 80 ? 'bg-red-500' : queriesPct > 60 ? 'bg-amber-500' : 'bg-indigo-600'}`}
              style={{ width: `${queriesPct}%` }}
            />
          </div>
        </div>

        {/* Bloom distribution */}
        <div className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-100 dark:border-white/5 p-6 shadow-sm">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Bloom's Coverage</h3>
          {totalBloom === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 opacity-40">
              <BarChart3 size={28} className="text-slate-300 mb-2"/>
              <p className="text-xs text-slate-400 font-medium text-center">Generate content to see your Bloom's distribution</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {Object.entries(BLOOM_COLORS).map(([level, color]) => {
                const count = usageStats.bloomCounts[level] || 0;
                const pct = totalBloom > 0 ? Math.round((count / totalBloom) * 100) : 0;
                return (
                  <div key={level} className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-500 w-20 shrink-0">{level}</span>
                    <div className="flex-1 bg-slate-100 dark:bg-white/5 rounded-full h-2">
                      <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }}/>
                    </div>
                    <span className="text-[10px] font-black text-slate-400 w-8 text-right">{pct}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Streak + achievements */}
        <div className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-100 dark:border-white/5 p-6 shadow-sm flex flex-col gap-4">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Achievements</h3>
          <div className={`flex items-center gap-4 p-4 rounded-2xl ${usageStats.streakDays > 0 ? 'bg-orange-50 dark:bg-orange-900/10' : 'bg-slate-50 dark:bg-white/5'}`}>
            <Flame size={32} className={usageStats.streakDays > 0 ? 'text-orange-500' : 'text-slate-300'}/>
            <div>
              <p className="text-2xl font-black text-slate-900 dark:text-white">{usageStats.streakDays} days</p>
              <p className="text-xs text-slate-400 font-medium">Current streak</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <AchievementBadge icon="📄" label="First Doc" unlocked={documents.length > 0}/>
            <AchievementBadge icon="🎯" label="First Plan" unlocked={usageStats.lessonsCreated > 0}/>
            <AchievementBadge icon="🏆" label="10 Lessons" unlocked={usageStats.lessonsCreated >= 10}/>
          </div>
        </div>
      </div>

      {/* ── CTA + Activity Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">

        {/* Big CTA */}
        <section
          onClick={() => onViewChange('tools')}
          className="bg-indigo-600 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden text-white group cursor-pointer hover:shadow-indigo-500/20 transition-all"
        >
          <div className="absolute top-0 right-0 p-6 opacity-[0.06] group-hover:scale-105 transition-transform duration-700"><BookOpen size={180}/></div>
          <div className="relative z-10 space-y-4">
            <div className="text-2xl md:text-4xl font-black tracking-tighter leading-none">
              Synthesis Hub<br/><span className="text-emerald-300">Active.</span>
            </div>
            <p className="text-indigo-100 text-sm leading-relaxed opacity-90">
              AI-powered lesson plans, quizzes, rubrics and curriculum audits — aligned to your standards.
            </p>
            <button className="px-6 py-3 bg-white text-indigo-950 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl group-hover:scale-105 transition-all flex items-center gap-2">
              Open Tools <ArrowRight size={12}/>
            </button>
          </div>
        </section>

        {/* Quick actions + Activity */}
        <div className="flex flex-col gap-4">
          {/* Quick actions */}
          <div className="grid grid-cols-2 gap-3">
            <QuickAction icon={<BookOpen size={16}/>} label="Lesson Plan" color="indigo" onClick={() => onViewChange('tools')}/>
            <QuickAction icon={<ClipboardCheck size={16}/>} label="Make Quiz" color="emerald" onClick={() => onViewChange('tools')}/>
            <QuickAction icon={<BookMarked size={16}/>} label="Standards" color="purple" onClick={() => onViewChange('standards')}/>
            <QuickAction icon={<FileText size={16}/>} label="Upload Doc" color="amber" onClick={() => onViewChange('documents')}/>
          </div>

          {/* Recent activity */}
          <div className="bg-white dark:bg-slate-900 rounded-[1.5rem] border border-slate-100 dark:border-white/5 p-5 shadow-sm flex-1">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Recent Activity</h3>
              <Clock size={12} className="text-slate-300"/>
            </div>
            {loadingStats ? (
              <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-slate-300"/></div>
            ) : recentActivity.length === 0 ? (
              <div className="text-center py-4 opacity-40">
                <Sparkles size={20} className="text-slate-300 mx-auto mb-2"/>
                <p className="text-xs text-slate-400">No activity yet — generate something!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentActivity.slice(0, 5).map(event => {
                  const cfg = EVENT_LABELS[event.event_type] || { label: event.event_type, icon: '⚡', color: 'text-slate-500' };
                  return (
                    <div key={event.id} className="flex items-center gap-2.5 py-1.5 border-b border-slate-50 dark:border-white/5 last:border-0">
                      <span className="text-base shrink-0">{cfg.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-bold truncate ${cfg.color}`}>{cfg.label}</p>
                      </div>
                      <span className="text-[9px] text-slate-400 shrink-0 font-medium">{timeAgo(event.created_at)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Settings Modal ── */}
      {isEditingBranding && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[3rem] p-10 border border-slate-100 dark:border-white/5 shadow-2xl space-y-8">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-bold dark:text-white tracking-tight uppercase">Settings</h3>
              <button onClick={() => setIsEditingBranding(false)} className="p-2 text-slate-400 hover:text-rose-500"><X size={24}/></button>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Workspace Identity</label>
                <input
                  type="text"
                  value={tempWorkspaceName}
                  onChange={e => setTempWorkspaceName(e.target.value)}
                  className="w-full px-5 py-4 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-indigo-600 dark:text-white"
                  placeholder="e.g. Beacon House Lahore"
                />
              </div>
              <button
                onClick={handleSaveBranding}
                disabled={isSavingBranding}
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
              >
                {isSavingBranding ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Sub-components ─────────────────────────────────────────────────────────

const StatCard = ({ title, value, sub, icon, color, onClick }: any) => (
  <button
    onClick={onClick}
    className="bg-white dark:bg-slate-900 p-5 md:p-6 rounded-[1.5rem] md:rounded-[2rem] border border-slate-100 dark:border-white/5 flex flex-col gap-3 hover:shadow-lg hover:border-indigo-200 dark:hover:border-indigo-800 transition-all group text-left w-full"
  >
    <div className={`w-9 h-9 bg-${color}-50 dark:bg-${color}-950/20 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform`}>{icon}</div>
    <div>
      <div className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tighter">{value}</div>
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{title}</p>
      {sub && <p className="text-[9px] font-medium text-slate-400 mt-0.5">{sub}</p>}
    </div>
  </button>
);

const QuickAction = ({ icon, label, color, onClick }: any) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 p-3 rounded-xl bg-${color}-50 dark:bg-${color}-900/10 text-${color}-700 dark:text-${color}-300 hover:bg-${color}-100 transition-all font-bold text-xs uppercase tracking-wide border border-${color}-100 dark:border-${color}-800/30`}
  >
    {icon} {label}
  </button>
);

const AchievementBadge = ({ icon, label, unlocked }: { icon: string; label: string; unlocked: boolean }) => (
  <div className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${unlocked ? 'bg-amber-50 dark:bg-amber-900/10' : 'bg-slate-50 dark:bg-white/5 opacity-30'}`}>
    <span className="text-lg">{icon}</span>
    <span className="text-[8px] font-black text-slate-500 uppercase tracking-wide text-center">{label}</span>
    {unlocked && <CheckCircle2 size={10} className="text-amber-500"/>}
  </div>
);

export default Dashboard;
