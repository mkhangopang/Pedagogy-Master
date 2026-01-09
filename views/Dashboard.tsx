
'use client';

import React, { useState } from 'react';
import { 
  FileText, MessageSquare, Zap, Target, 
  Brain, Sparkles, Save, CheckCircle, 
  Activity, GraduationCap,
  RefreshCw, Server
} from 'lucide-react';
import { UserProfile, Document, UserRole } from '../types';
import { ResponsiveContainer, BarChart, Bar, Tooltip } from 'recharts';
import { supabase } from '../lib/supabase';

interface DashboardProps {
  user: UserProfile;
  documents: Document[];
  onProfileUpdate: (profile: UserProfile) => void;
  health: { status: string, message: string };
  onCheckHealth: () => Promise<boolean>;
}

const Dashboard: React.FC<DashboardProps> = ({ user, documents, onProfileUpdate, health, onCheckHealth }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [isRefreshingHealth, setIsRefreshingHealth] = useState(false);
  const [profileForm, setProfileForm] = useState({
    gradeLevel: user.gradeLevel || 'High School',
    subjectArea: user.subjectArea || 'General',
    activeDocId: user.activeDocId || '',
  });

  const usagePercentage = (user.queriesUsed / user.queriesLimit) * 100;
  const totalSLOs = documents.reduce((acc, doc) => acc + (doc.sloTags?.length || 0), 0);
  const displayName = user.name || user.email.split('@')[0];
  const isEnterprise = user.role === UserRole.ENTERPRISE_ADMIN || user.role === UserRole.APP_ADMIN;

  const handleSaveProfile = async () => {
    setIsSaving(true);
    
    // 1. Update Profile
    const { error: profileError } = await supabase.from('profiles').update({
      grade_level: profileForm.gradeLevel,
      subject_area: profileForm.subjectArea,
      active_doc_id: profileForm.activeDocId,
    }).eq('id', user.id);

    if (profileError) {
      console.error("Profile update error", profileError);
      setIsSaving(false);
      return;
    }

    // 2. Synchronize 'is_selected' in documents table
    // Deselect all user's documents first
    await supabase.from('documents').update({ is_selected: false }).eq('user_id', user.id);
    
    // Select the chosen document if one is provided
    if (profileForm.activeDocId) {
      await supabase.from('documents').update({ is_selected: true }).eq('id', profileForm.activeDocId);
    }

    onProfileUpdate({ ...user, ...profileForm });
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2000);
    setIsSaving(false);
  };

  const handleRefreshHealth = async () => {
    setIsRefreshingHealth(true);
    await onCheckHealth();
    setIsRefreshingHealth(false);
  };

  const bloomData = [
    { level: 'Remember', count: 12 }, { level: 'Understand', count: 19 },
    { level: 'Apply', count: 15 }, { level: 'Analyze', count: 8 },
    { level: 'Evaluate', count: 5 }, { level: 'Create', count: 3 },
  ];

  const isConnected = health.status === 'connected';

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Educator Workspace</h1>
          <p className="text-slate-500 mt-1">Welcome back, {displayName}. Your curriculum brain is online.</p>
        </div>
        <button 
          onClick={handleRefreshHealth}
          disabled={isRefreshingHealth}
          className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl border shadow-sm transition-all group ${
            isConnected 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100' 
              : 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
          }`}
        >
          {isRefreshingHealth ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Server className="w-4 h-4" />}
          <div className="text-left">
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">System Health</p>
            <p className="text-xs font-bold">{isConnected ? 'Verified Connection' : 'Diagnostic Error'}</p>
          </div>
        </button>
      </header>

      {isEnterprise && (
        <section className="bg-white border border-indigo-100 rounded-[2rem] p-8 shadow-xl shadow-indigo-500/5">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-600 text-white rounded-2xl"><Activity size={24}/></div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Institutional Health</h2>
                <p className="text-slate-500 text-sm">Aggregated pedagogical alignment across your organization.</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Cognitive Distribution</p>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bloomData}>
                    <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                    <Tooltip cursor={{fill: 'transparent'}} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-indigo-900 text-white p-6 rounded-2xl relative overflow-hidden flex flex-col justify-center">
              <div className="relative z-10">
                <h3 className="font-bold mb-2">Institutional RAG</h3>
                <p className="text-xs text-indigo-200 leading-relaxed mb-4">Deep curriculum insights prevent teaching silos and ensure standard alignment.</p>
                <div className="flex gap-4">
                   <div className="bg-white/10 px-3 py-1.5 rounded-lg"><span className="text-xs font-bold">142 Teachers</span></div>
                   <div className="bg-white/10 px-3 py-1.5 rounded-lg"><span className="text-xs font-bold">94% Align</span></div>
                </div>
              </div>
              <GraduationCap className="absolute -bottom-4 -right-4 w-24 h-24 opacity-10 rotate-12" />
            </div>
          </div>
        </section>
      )}

      <section className="bg-indigo-950 text-white rounded-[3rem] p-10 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 p-8 opacity-10"><Brain size={140} /></div>
        <div className="relative z-10 flex flex-col gap-8">
          <div className="max-w-xl">
            <h2 className="text-2xl font-bold flex items-center gap-3 mb-2 tracking-tight">
              <Sparkles className="text-amber-400" />
              AI Curriculum Intelligence
            </h2>
            <p className="text-indigo-200 text-sm leading-relaxed font-medium">
              Select your primary curriculum document to ground all AI responses in your specific content.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-widest text-indigo-400 ml-1">Contextual Document</label>
              <select 
                value={profileForm.activeDocId} 
                onChange={e => setProfileForm({...profileForm, activeDocId: e.target.value})} 
                className="w-full bg-white/10 border border-white/20 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold appearance-none cursor-pointer"
              >
                <option value="" className="bg-indigo-950 text-white">General Knowledge (No doc)</option>
                {documents.map(doc => (
                  <option key={doc.id} value={doc.id} className="bg-indigo-950 text-white">{doc.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-widest text-indigo-400 ml-1">Grade Level</label>
              <select 
                value={profileForm.gradeLevel} 
                onChange={e => setProfileForm({...profileForm, gradeLevel: e.target.value})} 
                className="w-full bg-white/10 border border-white/20 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold appearance-none cursor-pointer"
              >
                <option className="bg-indigo-950">Elementary</option>
                <option className="bg-indigo-950">Middle School</option>
                <option className="bg-indigo-950">High School</option>
                <option className="bg-indigo-950">Higher Education</option>
              </select>
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-widest text-indigo-400 ml-1">Subject Area</label>
              <input 
                value={profileForm.subjectArea} 
                onChange={e => setProfileForm({...profileForm, subjectArea: e.target.value})} 
                placeholder="e.g. Physics" 
                className="w-full bg-white/10 border border-white/20 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold" 
              />
            </div>
          </div>

          <div className="flex items-center pt-2">
            <button onClick={handleSaveProfile} disabled={isSaving || !isConnected} className="w-full md:w-auto px-12 py-5 bg-indigo-500 hover:bg-indigo-400 text-white rounded-3xl font-black flex items-center justify-center gap-3 transition-all shadow-2xl disabled:opacity-50 active:scale-95">
              {isSaving ? <RefreshCw className="animate-spin" size={20}/> : (showSaved ? <CheckCircle size={20}/> : <Save size={20}/>)}
              {showSaved ? 'System Calibrated' : 'Save Curriculum Context'}
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Library Size" value={documents.length.toString()} icon={<FileText className="w-6 h-6 text-indigo-600" />} trend="Docs Uploaded" color="indigo" />
        <StatCard title="AI Quota" value={`${user.queriesUsed}/${user.queriesLimit}`} icon={<Zap className="w-6 h-6 text-emerald-600" />} trend={`${Math.round(usagePercentage)}% utilized`} color="emerald" />
        <StatCard title="SLO Points" value={totalSLOs.toString()} icon={<Target className="w-6 h-6 text-amber-600" />} trend="Items mapped" color="amber" />
        <StatCard title="Plan" value={user.plan.toUpperCase()} icon={<GraduationCap className="w-6 h-6 text-purple-600" />} trend="Active License" color="purple" />
      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon, trend, color }: { title: string, value: string, icon: React.ReactNode, trend: string, color: string }) => (
  <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col gap-4 hover:shadow-xl transition-all">
    <div className="flex items-center justify-between">
      <div className={`p-3 bg-${color}-50 rounded-2xl`}>{icon}</div>
      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</span>
    </div>
    <div>
      <div className="text-3xl font-black text-slate-900 tracking-tight">{value}</div>
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mt-1">{trend}</div>
    </div>
  </div>
);

export default Dashboard;
