
'use client';

import React, { useState, useEffect } from 'react';
import { 
  ClipboardCheck, Target, Calendar, BarChart3, 
  ChevronRight, Search, Filter, CheckCircle2, 
  Clock, BookOpen, AlertCircle, Save, Loader2
} from 'lucide-react';
import { UserProfile, Document, TeacherProgress } from '../types';
import { curriculumService } from '../lib/curriculum-service';
import { supabase } from '../lib/supabase';

interface TrackerProps {
  user: UserProfile;
  documents: Document[];
}

const Tracker: React.FC<TrackerProps> = ({ user, documents }) => {
  const [slos, setSlos] = useState<any[]>([]);
  const [progress, setProgress] = useState<Record<string, TeacherProgress>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'planning' | 'teaching' | 'completed'>('all');
  const [isSaving, setIsSaving] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Fetch identified SLOs
        const { data: sloData } = await supabase
          .from('slo_database')
          .select('*, documents!inner(user_id, name)')
          .eq('documents.user_id', user.id);
        
        setSlos(sloData || []);

        // Fetch user progress
        const progressRecords = await curriculumService.getProgress(user.id);
        const progressMap: Record<string, TeacherProgress> = {};
        progressRecords.forEach(p => {
          progressMap[p.sloCode] = p;
        });
        setProgress(progressMap);
      } catch (e) {
        console.error("Tracker fetch failure", e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [user.id]);

  const handleUpdateStatus = async (sloCode: string, status: TeacherProgress['status']) => {
    setIsSaving(sloCode);
    try {
      await curriculumService.updateProgress(user.id, {
        sloCode,
        status,
        taughtDate: status === 'completed' ? new Date().toISOString().split('T')[0] : undefined
      });
      
      // Update local state
      const { data: updated } = await supabase
        .from('teacher_progress')
        .select('*')
        .eq('user_id', user.id)
        .eq('slo_code', sloCode)
        .single();

      if (updated) {
        setProgress(prev => ({
          ...prev,
          [sloCode]: {
            id: updated.id,
            userId: updated.user_id,
            sloCode: updated.slo_code,
            status: updated.status,
            taughtDate: updated.taught_date,
            studentMasteryPercentage: updated.student_mastery_percentage,
            notes: updated.notes,
            createdAt: updated.created_at
          }
        }));
      }
    } finally {
      setIsSaving(null);
    }
  };

  const filteredSLOs = slos.filter(s => {
    const matchesSearch = s.slo_code.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          s.slo_full_text.toLowerCase().includes(searchTerm.toLowerCase());
    const currentProgress = progress[s.slo_code];
    const matchesFilter = filter === 'all' || (currentProgress?.status === filter) || (filter === 'planning' && !currentProgress);
    return matchesSearch && matchesFilter;
  });

  // Explicitly cast to TeacherProgress[] to avoid "unknown" type inference errors
  const stats = {
    total: slos.length,
    completed: (Object.values(progress) as TeacherProgress[]).filter(p => p.status === 'completed').length,
    teaching: (Object.values(progress) as TeacherProgress[]).filter(p => p.status === 'teaching').length,
    planning: slos.length - (Object.values(progress) as TeacherProgress[]).filter(p => p.status === 'completed' || p.status === 'teaching').length
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20 px-4 max-w-6xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Curriculum Tracker</h1>
          <p className="text-slate-500 mt-1">Audit coverage and track student mastery across objectives.</p>
        </div>
        
        <div className="flex bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl p-4 gap-8 shadow-sm">
          <StatMini label="Completed" value={stats.completed} total={stats.total} color="text-emerald-500" />
          <StatMini label="In Progress" value={stats.teaching} total={stats.total} color="text-indigo-500" />
          <StatMini label="Pending" value={stats.planning} total={stats.total} color="text-slate-400" />
        </div>
      </header>

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-[2rem] border border-slate-100 dark:border-white/5">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Search objectives..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-950 border-none rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
        
        <div className="flex gap-2 w-full md:w-auto overflow-x-auto scrollbar-hide">
          {(['all', 'planning', 'teaching', 'completed'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border shrink-0 ${
                filter === f 
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-md' 
                  : 'bg-white dark:bg-white/5 text-slate-400 border-slate-200 dark:border-white/5 hover:border-indigo-400'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="animate-spin text-indigo-600 mb-4" size={40} />
          <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Loading Coverage Map...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredSLOs.map(slo => {
            const p = progress[slo.slo_code];
            const isSavingThis = isSaving === slo.slo_code;
            
            return (
              <div 
                key={slo.id} 
                className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-white/5 hover:border-indigo-500 transition-all flex flex-col md:flex-row items-center gap-6 group"
              >
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
                  p?.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 
                  p?.status === 'teaching' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-400'
                }`}>
                  <Target size={24} />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-black text-indigo-600 dark:text-indigo-400 text-sm">{slo.slo_code}</span>
                    <span className="px-2 py-0.5 bg-slate-100 dark:bg-white/10 text-slate-400 rounded text-[9px] font-bold uppercase truncate max-w-[150px]">
                      {slo.documents.name}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200 line-clamp-1">{slo.slo_full_text}</p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <StatusBtn 
                    active={p?.status === 'planning' || !p} 
                    label="Plan" 
                    icon={<Clock size={14} />} 
                    onClick={() => handleUpdateStatus(slo.slo_code, 'planning')}
                    disabled={isSavingThis}
                  />
                  <StatusBtn 
                    active={p?.status === 'teaching'} 
                    label="Teaching" 
                    icon={<BookOpen size={14} />} 
                    onClick={() => handleUpdateStatus(slo.slo_code, 'teaching')}
                    disabled={isSavingThis}
                  />
                  <StatusBtn 
                    active={p?.status === 'completed'} 
                    label="Done" 
                    icon={<CheckCircle2 size={14} />} 
                    onClick={() => handleUpdateStatus(slo.slo_code, 'completed')}
                    disabled={isSavingThis}
                  />
                </div>
              </div>
            );
          })}

          {filteredSLOs.length === 0 && (
            <div className="text-center py-20 bg-slate-50 dark:bg-white/5 rounded-[3rem] border-2 border-dashed border-slate-200 dark:border-white/10">
              <ClipboardCheck className="mx-auto text-slate-200 mb-4" size={48} />
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200">No objectives found</h3>
              <p className="text-slate-400 text-sm mt-1">Try adjusting your filters or upload more curriculum docs.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const StatMini = ({ label, value, total, color }: any) => (
  <div className="flex flex-col">
    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
    <div className="flex items-baseline gap-1">
      <span className={`text-xl font-black ${color}`}>{value}</span>
      <span className="text-[10px] font-bold text-slate-300">/ {total}</span>
    </div>
  </div>
);

const StatusBtn = ({ active, label, icon, onClick, disabled }: any) => (
  <button 
    onClick={onClick}
    disabled={disabled}
    className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
      active 
        ? 'bg-indigo-600 text-white shadow-lg' 
        : 'bg-slate-50 dark:bg-white/5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10'
    } disabled:opacity-50`}
  >
    {icon}
    <span className="hidden sm:inline">{label}</span>
  </button>
);

export default Tracker;
