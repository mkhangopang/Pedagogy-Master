
'use client';

import React, { useState } from 'react';
import { 
  FileText, MessageSquare, Zap, Target, 
  Sparkles, Save, CheckCircle, 
  Activity, GraduationCap,
  RefreshCw, Server, Library, BookOpen
} from 'lucide-react';
import { UserProfile, Document, UserRole } from '../types';
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

  const handleSaveProfile = async () => {
    setIsSaving(true);
    
    // 1. Update Profile record
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

    // 2. Clear all previous document selections for this user
    await supabase.from('documents').update({ is_selected: false }).eq('user_id', user.id);
    
    // 3. Set the new active document as selected in the database
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

  const isConnected = health.status === 'connected';

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Workspace</h1>
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

      {/* Simplified Active Curriculum Hub */}
      <section className="bg-slate-900 text-white rounded-[2.5rem] p-8 md:p-12 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 p-8 opacity-5"><Library size={180} /></div>
        <div className="relative z-10 space-y-10">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-black flex items-center gap-3 mb-4 tracking-tight">
              <BookOpen className="text-indigo-400" />
              Active Curriculum Hub
            </h2>
            <p className="text-slate-400 text-base leading-relaxed font-medium">
              Ground all AI responses in your specific documents. Once saved, the AI will prioritize this content above its general training.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-widest text-indigo-400 ml-1">Primary Source Context</label>
              <div className="relative group">
                <select 
                  value={profileForm.activeDocId} 
                  onChange={e => setProfileForm({...profileForm, activeDocId: e.target.value})} 
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold appearance-none cursor-pointer group-hover:bg-white/10"
                >
                  <option value="" className="bg-slate-900">General AI Knowledge (No Doc)</option>
                  {documents.map(doc => (
                    <option key={doc.id} value={doc.id} className="bg-slate-900">{doc.name}</option>
                  ))}
                </select>
                <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                   <Library size={16} />
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-widest text-indigo-400 ml-1">Grade Level</label>
              <select 
                value={profileForm.gradeLevel} 
                onChange={e => setProfileForm({...profileForm, gradeLevel: e.target.value})} 
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold appearance-none cursor-pointer"
              >
                <option className="bg-slate-900">Elementary</option>
                <option className="bg-slate-900">Middle School</option>
                <option className="bg-slate-900">High School</option>
                <option className="bg-slate-900">Higher Education</option>
              </select>
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-widest text-indigo-400 ml-1">Default Subject</label>
              <input 
                value={profileForm.subjectArea} 
                onChange={e => setProfileForm({...profileForm, subjectArea: e.target.value})} 
                placeholder="e.g. Science" 
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold" 
              />
            </div>
          </div>

          <button 
            onClick={handleSaveProfile} 
            disabled={isSaving || !isConnected} 
            className="w-full md:w-auto px-12 py-5 bg-indigo-500 hover:bg-indigo-400 text-white rounded-3xl font-black flex items-center justify-center gap-3 transition-all shadow-2xl disabled:opacity-50 active:scale-95 text-sm uppercase tracking-widest"
          >
            {isSaving ? <RefreshCw className="animate-spin" size={20}/> : (showSaved ? <CheckCircle size={20}/> : <Save size={20}/>)}
            {showSaved ? 'Context Loaded' : 'Synchronize Hub'}
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Library" value={documents.length.toString()} icon={<FileText className="w-5 h-5 text-indigo-600" />} color="indigo" />
        <StatCard title="AI Usage" value={`${user.queriesUsed}/${user.queriesLimit}`} icon={<Zap className="w-5 h-5 text-emerald-600" />} color="emerald" />
        <StatCard title="SLO Points" value={totalSLOs.toString()} icon={<Target className="w-5 h-5 text-amber-600" />} color="amber" />
        <StatCard title="Account" value={user.plan.toUpperCase()} icon={<GraduationCap className="w-5 h-5 text-purple-600" />} color="purple" />
      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon, color }: { title: string, value: string, icon: React.ReactNode, color: string }) => (
  <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col gap-4 hover:shadow-xl transition-all">
    <div className="flex items-center justify-between">
      <div className={`p-2.5 bg-${color}-50 rounded-xl`}>{icon}</div>
      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</span>
    </div>
    <div className="text-2xl font-black text-slate-900 tracking-tight">{value}</div>
  </div>
);

export default Dashboard;
