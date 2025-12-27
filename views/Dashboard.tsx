
'use client';

import React, { useState } from 'react';
import { 
  FileText, MessageSquare, Zap, Target, TrendingUp, 
  BarChart3, Plus, Settings2, Brain, Sparkles, Save, CheckCircle
} from 'lucide-react';
import { UserProfile, Document } from '../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../lib/supabase';

interface DashboardProps {
  user: UserProfile;
  documents: Document[];
  onProfileUpdate: (profile: UserProfile) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ user, documents, onProfileUpdate }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [profileForm, setProfileForm] = useState({
    gradeLevel: user.gradeLevel || 'High School',
    subjectArea: user.subjectArea || 'Science',
    teachingStyle: user.teachingStyle || 'balanced',
    pedagogicalApproach: user.pedagogicalApproach || 'direct-instruction'
  });

  const usagePercentage = (user.queriesUsed / user.queriesLimit) * 100;
  const totalSLOs = documents.reduce((acc, doc) => acc + (doc.sloTags?.length || 0), 0);
  const displayName = user.name || user.email.split('@')[0];

  const handleSaveProfile = async () => {
    setIsSaving(true);
    const { error } = await supabase.from('profiles').update({
      grade_level: profileForm.gradeLevel,
      subject_area: profileForm.subjectArea,
      teaching_style: profileForm.teachingStyle,
      pedagogical_approach: profileForm.pedagogicalApproach
    }).eq('id', user.id);

    if (!error) {
      onProfileUpdate({ ...user, ...profileForm });
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 2000);
    }
    setIsSaving(false);
  };

  const chartData = [
    { name: 'Mon', queries: 4 },
    { name: 'Tue', queries: 7 },
    { name: 'Wed', queries: 5 },
    { name: 'Thu', queries: 8 },
    { name: 'Fri', queries: 12 },
    { name: 'Sat', queries: 6 },
    { name: 'Sun', queries: 9 },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Welcome, {displayName}</h1>
          <p className="text-slate-500 mt-1">Adaptive AI Engine is active and learning from your patterns.</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-slate-200 shadow-sm w-fit">
          <TrendingUp className="w-4 h-4 text-emerald-500" />
          <span className="text-sm font-semibold text-slate-600">Adaptive Layer: Active</span>
        </div>
      </header>

      {/* Adaptive Intelligence Configuration */}
      <section className="bg-indigo-950 text-white rounded-3xl p-8 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 p-8 opacity-10"><Brain size={120} /></div>
        <div className="relative z-10 flex flex-col lg:flex-row gap-8">
          <div className="lg:w-1/3">
            <h2 className="text-xl font-bold flex items-center gap-2 mb-2">
              <Sparkles className="text-amber-400" />
              Personalization Engine
            </h2>
            <p className="text-indigo-200 text-sm leading-relaxed">
              Configure Layer 1 of your adaptive brain. These settings guide Gemini's default verbosity, complexity, and pedagogical tone.
            </p>
          </div>
          
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">Target Grade</label>
              <select 
                value={profileForm.gradeLevel}
                onChange={e => setProfileForm({...profileForm, gradeLevel: e.target.value})}
                className="w-full bg-indigo-900/50 border border-indigo-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              >
                <option>Elementary</option>
                <option>Middle School</option>
                <option>High School</option>
                <option>Higher Ed</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">Default Subject</label>
              <input 
                value={profileForm.subjectArea}
                onChange={e => setProfileForm({...profileForm, subjectArea: e.target.value})}
                placeholder="e.g. STEM, Humanities"
                className="w-full bg-indigo-900/50 border border-indigo-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">AI Verbosity</label>
              <select 
                value={profileForm.teachingStyle}
                onChange={e => setProfileForm({...profileForm, teachingStyle: e.target.value as any})}
                className="w-full bg-indigo-900/50 border border-indigo-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              >
                <option value="concise">Concise (Bullet Points)</option>
                <option value="balanced">Balanced (Standard)</option>
                <option value="comprehensive">Comprehensive (In-Depth)</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">Pedagogical Approach</label>
              <select 
                value={profileForm.pedagogicalApproach}
                onChange={e => setProfileForm({...profileForm, pedagogicalApproach: e.target.value as any})}
                className="w-full bg-indigo-900/50 border border-indigo-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              >
                <option value="direct-instruction">Direct Instruction</option>
                <option value="inquiry-based">Inquiry-Based</option>
                <option value="flipped-classroom">Flipped Classroom</option>
              </select>
            </div>
          </div>

          <div className="flex items-end">
            <button 
              onClick={handleSaveProfile}
              disabled={isSaving}
              className="w-full lg:w-auto px-6 py-3 bg-indigo-500 hover:bg-indigo-400 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-xl shadow-indigo-900"
            >
              {isSaving ? <Settings2 className="animate-spin" size={18}/> : (showSaved ? <CheckCircle size={18}/> : <Save size={18}/>)}
              {showSaved ? 'Saved!' : 'Update Engine'}
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Documents" value={documents.length.toString()} icon={<FileText className="w-6 h-6 text-indigo-600" />} trend="In library" color="indigo" />
        <StatCard title="AI Activity" value={`${user.queriesUsed}/${user.queriesLimit}`} icon={<MessageSquare className="w-6 h-6 text-emerald-600" />} trend={`${Math.round(usagePercentage)}% of monthly quota`} color="emerald" />
        <StatCard title="SLO Insights" value={totalSLOs.toString()} icon={<Target className="w-6 h-6 text-amber-600" />} trend="Knowledge items mapped" color="amber" />
        <StatCard title="Subscription" value={user.plan.toUpperCase()} icon={<Zap className="w-6 h-6 text-purple-600" />} trend="Plan Status" color="purple" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-500" />
                Query Engagement
              </h2>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorQueries" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} dy={10} />
                  <YAxis hide />
                  <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} />
                  <Area type="monotone" dataKey="queries" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorQueries)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon, trend, color }: { title: string, value: string, icon: React.ReactNode, trend: string, color: string }) => (
  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col gap-4 hover:shadow-md transition-all">
    <div className="flex items-center justify-between">
      <div className={`p-2 bg-${color}-50 rounded-lg`}>{icon}</div>
      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{title}</span>
    </div>
    <div>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mt-1">{trend}</div>
    </div>
  </div>
);

export default Dashboard;
