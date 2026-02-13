'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  ClipboardCheck, Target, BarChart3, 
  ChevronRight, Search, CheckCircle2, 
  Clock, BookOpen, Loader2, ChevronDown, Layers, Filter
} from 'lucide-react';
import { UserProfile, Document, TeacherProgress } from '../types';
import { curriculumService } from '../lib/curriculum-service';
import { supabase } from '../lib/supabase';

interface TrackerProps {
  user: UserProfile;
  documents: Document[];
}

interface SloRecord {
  id: string;
  slo_code: string;
  slo_full_text: string;
  documents: {
    grade_level: string;
    subject: string;
    authority: string;
  };
}

interface GroupedSLOs {
  [grade: string]: {
    [subject: string]: SloRecord[];
  };
}

const Tracker: React.FC<TrackerProps> = ({ user, documents }) => {
  const [slos, setSlos] = useState<SloRecord[]>([]);
  const [progress, setProgress] = useState<Record<string, TeacherProgress>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'planning' | 'teaching' | 'completed'>('all');
  const [isSaving, setIsSaving] = useState<string | null>(null);
  
  // Accordion State: Keep track of which grades are expanded
  const [expandedGrades, setExpandedGrades] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Fetch SLOs with Grade and Subject info from parent document
        const { data: sloData } = await supabase
          .from('slo_database')
          .select('*, documents!inner(user_id, name, grade_level, subject, authority)')
          .eq('documents.user_id', user.id);
        
        // Fix: Cast unknown/any data from Supabase to any[] to avoid property access errors
        const rawData = (sloData as any[]) || [];
        setSlos((rawData as unknown as SloRecord[]) || []);

        // Initialize all found grades to expanded by default
        const uniqueGrades = Array.from(new Set(rawData.map((s: any) => s.documents?.grade_level || 'General')));
        const initialExpanded: Record<string, boolean> = {};
        uniqueGrades.forEach((g: any) => initialExpanded[String(g)] = true);
        setExpandedGrades(initialExpanded);

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

  const toggleGrade = (grade: string) => {
    setExpandedGrades(prev => ({...prev, [grade]: !prev[grade]}));
  };

  const toggleAll = (expand: boolean) => {
    const newState: Record<string, boolean> = {};
    Object.keys(groupedSLOs).forEach(g => newState[g] = expand);
    setExpandedGrades(newState);
  };

  // --- Logic: Group, Filter, Deduplicate ---
  const groupedSLOs = useMemo(() => {
    const groups: GroupedSLOs = {};
    const seenCodes = new Set<string>(); // For deduplication within the same view

    // 1. Filter
    const filtered = slos.filter(s => {
      const matchesSearch = s.slo_code.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            s.slo_full_text.toLowerCase().includes(searchTerm.toLowerCase());
      const currentProgress = progress[s.slo_code];
      const matchesFilter = statusFilter === 'all' || (currentProgress?.status === statusFilter) || (statusFilter === 'planning' && !currentProgress);
      return matchesSearch && matchesFilter;
    });

    // 2. Sort & Group
    filtered.forEach(slo => {
      const grade = slo.documents?.grade_level || 'General';
      const subject = slo.documents?.subject || 'General';
      const compositeKey = `${grade}-${subject}-${slo.slo_code}`;

      // Deduplication: If we've seen this exact code in this exact grade/subject, skip repeats
      if (seenCodes.has(compositeKey)) return; 
      seenCodes.add(compositeKey);

      if (!groups[grade]) groups[grade] = {};
      if (!groups[grade][subject]) groups[grade][subject] = [];

      groups[grade][subject].push(slo);
    });

    return groups;
  }, [slos, searchTerm, statusFilter, progress]);

  // Helper to sort grades naturally (9 before 10)
  const sortedGrades = Object.keys(groupedSLOs).sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, '')) || 999;
    const numB = parseInt(b.replace(/\D/g, '')) || 999;
    return numA - numB;
  });

  const stats = {
    total: slos.length,
    completed: (Object.values(progress) as TeacherProgress[]).filter(p => p.status === 'completed').length,
    teaching: (Object.values(progress) as TeacherProgress[]).filter(p => p.status === 'teaching').length,
    planning: slos.length - (Object.values(progress) as TeacherProgress[]).filter(p => p.status === 'completed' || p.status === 'teaching').length
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20 px-4 max-w-6xl mx-auto">
      {/* Header Stats */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight uppercase">Curriculum Tracker</h1>
          <p className="text-slate-500 mt-1 text-sm font-medium">Audit coverage and track student mastery across objectives.</p>
        </div>
        
        <div className="flex bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl p-4 gap-8 shadow-sm">
          <StatMini label="Completed" value={stats.completed} total={stats.total} color="text-emerald-500" />
          <StatMini label="In Progress" value={stats.teaching} total={stats.total} color="text-indigo-500" />
          <StatMini label="Pending" value={stats.planning} total={stats.total} color="text-slate-400" />
        </div>
      </header>

      {/* Controls Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-[2rem] border border-slate-100 dark:border-white/5 shadow-sm sticky top-20 z-20">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Search objectives..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-950 border-none rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
          />
        </div>
        
        <div className="flex gap-2 w-full md:w-auto overflow-x-auto scrollbar-hide items-center">
          <div className="flex gap-1 mr-4">
             <button onClick={() => toggleAll(true)} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg text-xs font-bold text-indigo-500">Expand All</button>
             <button onClick={() => toggleAll(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg text-xs font-bold text-slate-500">Collapse All</button>
          </div>
          <div className="h-6 w-px bg-slate-200 dark:bg-white/10 mx-2" />
          {(['all', 'planning', 'teaching', 'completed'] as const).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border shrink-0 ${
                statusFilter === f 
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
        <div className="space-y-8">
          {sortedGrades.map(grade => {
            const isExpanded = expandedGrades[grade];
            const subjects = groupedSLOs[grade];
            const sloCount = Object.values(subjects).reduce((acc, list) => acc + list.length, 0);

            return (
              <div key={grade} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                {/* Grade Header */}
                <button 
                  onClick={() => toggleGrade(grade)}
                  className={`w-full flex items-center justify-between p-6 rounded-[2rem] border transition-all group ${
                    isExpanded 
                      ? 'bg-slate-900 text-white border-slate-800 shadow-xl' 
                      : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-200 dark:border-white/5 hover:border-indigo-400'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-xl ${isExpanded ? 'bg-indigo-500 text-white' : 'bg-slate-100 dark:bg-white/10 text-slate-500'}`}>
                      <Layers size={20} />
                    </div>
                    <div className="text-left">
                      <h2 className="text-lg font-black uppercase tracking-tight">{grade} Curriculum</h2>
                      <p className={`text-[10px] font-bold uppercase tracking-widest ${isExpanded ? 'text-slate-400' : 'text-slate-500'}`}>
                        {sloCount} Objectives Found
                      </p>
                    </div>
                  </div>
                  <div className={`p-2 rounded-full transition-transform duration-300 ${isExpanded ? 'rotate-180 bg-white/10' : 'bg-slate-100 dark:bg-white/5'}`}>
                    <ChevronDown size={20} />
                  </div>
                </button>

                {/* Grade Content */}
                {isExpanded && (
                  <div className="mt-4 space-y-6 pl-2 md:pl-6 border-l-2 border-slate-200 dark:border-white/5 ml-6 md:ml-10">
                    {Object.entries(subjects).map(([subject, subjectSLOs]) => (
                      <div key={subject} className="space-y-4">
                        <div className="flex items-center gap-3 mt-6 mb-2">
                           <span className="w-2 h-2 rounded-full bg-indigo-500" />
                           <h3 className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400">{subject}</h3>
                           <div className="h-px bg-slate-200 dark:bg-white/5 flex-1" />
                        </div>

                        <div className="grid grid-cols-1 gap-3">
                          {subjectSLOs.map((slo) => {
                            const p = progress[slo.slo_code];
                            const isSavingThis = isSaving === slo.slo_code;
                            
                            return (
                              <div 
                                key={slo.id} 
                                className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-white/5 hover:border-indigo-500 transition-all flex flex-col md:flex-row items-start md:items-center gap-4 group shadow-sm hover:shadow-lg"
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-3 mb-1.5">
                                    <span className="font-black text-white bg-indigo-600 px-2 py-0.5 rounded text-[10px] tracking-wide">{slo.slo_code}</span>
                                    <span className="text-[9px] font-bold text-slate-400 uppercase truncate">
                                      {slo.documents.authority}
                                    </span>
                                  </div>
                                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 leading-snug">{slo.slo_full_text}</p>
                                </div>

                                <div className="flex items-center gap-2 shrink-0 w-full md:w-auto justify-end border-t md:border-t-0 border-slate-100 dark:border-white/5 pt-3 md:pt-0">
                                  <StatusBtn 
                                    active={p?.status === 'planning' || !p} 
                                    label="Plan" 
                                    icon={<Clock size={12} />} 
                                    onClick={() => handleUpdateStatus(slo.slo_code, 'planning')}
                                    disabled={isSavingThis}
                                  />
                                  <StatusBtn 
                                    active={p?.status === 'teaching'} 
                                    label="Teach" 
                                    icon={<BookOpen size={12} />} 
                                    onClick={() => handleUpdateStatus(slo.slo_code, 'teaching')}
                                    disabled={isSavingThis}
                                  />
                                  <StatusBtn 
                                    active={p?.status === 'completed'} 
                                    label="Done" 
                                    icon={<CheckCircle2 size={12} />} 
                                    onClick={() => handleUpdateStatus(slo.slo_code, 'completed')}
                                    disabled={isSavingThis}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {sortedGrades.length === 0 && (
            <div className="text-center py-20 bg-slate-50 dark:bg-white/5 rounded-[3rem] border-2 border-dashed border-slate-200 dark:border-white/10">
              <ClipboardCheck className="mx-auto text-slate-200 mb-4" size={48} />
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200">No objectives found</h3>
              <p className="text-slate-400 text-sm mt-1">Adjust filters or upload curriculum docs to populate the grid.</p>
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
    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
      active 
        ? 'bg-indigo-600 text-white shadow-md' 
        : 'bg-slate-50 dark:bg-white/5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10'
    } disabled:opacity-50`}
  >
    {icon}
    <span>{label}</span>
  </button>
);

export default Tracker;