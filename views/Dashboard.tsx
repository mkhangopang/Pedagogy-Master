
'use client';

import React, { useState } from 'react';
import { 
  FileText, MessageSquare, Zap, Target, TrendingUp, 
  BarChart3, Brain, Sparkles, Save, CheckCircle, 
  ShieldCheck, Users, Activity, GraduationCap,
  Database, AlertCircle
} from 'lucide-react';
import { UserProfile, Document, UserRole } from '../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

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
  const isEnterprise = user.role === UserRole.ENTERPRISE_ADMIN || user.role === UserRole.APP_ADMIN;

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

  const activityData = [
    { name: 'Mon', queries: 4 }, { name: 'Tue', queries: 7 },
    { name: 'Wed', queries: 5 }, { name: 'Thu', queries: 8 },
    { name: 'Fri', queries: 12 }, { name: 'Sat', queries: 6 },
    { name: 'Sun', queries: 9 },
  ];

  const bloomData = [
    { level: 'Remember', count: 12 }, { level: 'Understand', count: 19 },
    { level: 'Apply', count: 15 }, { level: 'Analyze', count: 8 },
    { level: 'Evaluate', count: 5 }, { level: 'Create', count: 3 },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Educator Workspace</h1>
          <p className="text-slate-500 mt-1">Hello, {displayName}. Your personalized pedagogical layer is active.</p>
        </div>
        <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border shadow-sm w-fit ${isSupabaseConfigured ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-amber-50 border-amber-100 text-amber-700'}`}>
          {isSupabaseConfigured ? <Database className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span className="text-sm font-bold">
            {isSupabaseConfigured ? 'Database: Active' : 'Database: Local Mode'}
          </span>
        </div>
      </header>

      {isEnterprise && (
        <section className="bg-white border border-indigo-100 rounded-[2rem] p-8 shadow-xl shadow-indigo-500/5">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-600 text-white rounded-2xl"><Activity size={24}/></div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Institutional Health Dashboard</h2>
                <p className="text-slate-500 text-sm">Aggregated pedagogical alignment across your organization.</p>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Bloom's Distribution</p>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bloomData}>
                    <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                    <Tooltip cursor={{fill: 'transparent'}} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-xl border border-slate-100 flex items-center gap-4">
                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center"><Users size={20}/></div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Active Teachers</p>
                  <p className="text-lg font-bold">142</p>
                </div>
              </div>
              <div className="bg-white p-4 rounded-xl border border-slate-100 flex items-center gap-4">
                <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center"><Target size={20}/></div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">SLO Compliance</p>
                  <p className="text-lg font-bold">94.2%</p>
                </div>
              </div>
            </div>
            <div className="bg-indigo-900 text-white p-6 rounded-2xl relative overflow-hidden">
              <div className="relative z-10">
                <h3 className="font-bold mb-2">Institutional RAG</h3>
                <p className="text-xs text-indigo-200 leading-relaxed mb-4">Departmental insights prevents teaching silos.</p>
              </div>
              <GraduationCap className="absolute -bottom-4 -right-4 w-24 h-24 opacity-10 rotate-12" />
            </div>
          </div>
        </section>
      )}

      <section className="bg-indigo-950 text-white rounded-3xl p-8 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 p-8 opacity-10"><Brain size={120} /></div>
        <div className="relative z-10 flex flex-col lg:flex-row gap-8">
          <div className="lg:w-1/3">
            <h2 className="text-xl font-bold flex items-center gap-2 mb-2">
              <Sparkles className="text-amber-400" />
              AI Adaptive Profile
            </h2>
            <p className="text-indigo-200 text-sm leading-relaxed">
              Gemini learns your pedagogical style. Updates recalibrate the neural engine.
            </p>
          </div>
          
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">Target Grade Level</label>
              <select value={profileForm.gradeLevel} onChange={e => setProfileForm({...profileForm, gradeLevel: e.target.value})} className="w-full bg-indigo-900/50 border border-indigo-700 rounded-xl px-4 py-2 text-sm focus:outline-none">
                <option>Elementary</option>
                <option>Middle School</option>
                <option>High School</option>
                <option>Higher Education</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">Default Subject Area</label>
              <input value={profileForm.subjectArea} onChange={e => setProfileForm({...profileForm, subjectArea: e.target.value})} placeholder="e.g. STEM" className="w-full bg-indigo-900/50 border border-indigo-700 rounded-xl px-4 py-2 text-sm focus:outline-none" />
            </div>
          </div>

          <div className="flex items-end">
            <button onClick={handleSaveProfile} disabled={isSaving} className="w-full lg:w-auto px-6 py-3 bg-indigo-500 hover:bg-indigo-400 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-xl">
              {isSaving ? <Activity className="animate-spin" size={18}/> : (showSaved ? <CheckCircle size={18}/> : <Save size={18}/>)}
              {showSaved ? 'Updated' : 'Save Profile'}
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Library Size" value={documents.length.toString()} icon={<FileText className="w-6 h-6 text-indigo-600" />} trend="Docs Uploaded" color="indigo" />
        <StatCard title="AI Quota" value={`${user.queriesUsed}/${user.queriesLimit}`} icon={<Zap className="w-6 h-6 text-emerald-600" />} trend={`${Math.round(usagePercentage)}% utilized`} color="emerald" />
        <StatCard title="SLO Points" value={totalSLOs.toString()} icon={<Target className="w-6 h-6 text-amber-600" />} trend="Items mapped" color="amber" />
        <StatCard title="Session Plan" value={user.plan.toUpperCase()} icon={<ShieldCheck className="w-6 h-6 text-purple-600" />} trend="Active Subscription" color="purple" />
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
