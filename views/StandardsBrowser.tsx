'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { UserProfile, Document, SLO } from '../types';
import { Search, Filter, BookOpen, Target, ArrowRight, Copy, CheckCircle2, AlertTriangle, ChevronRight, BarChart3, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { parseSLOCode } from '../lib/rag/slo-parser';

interface StandardsBrowserProps {
  user: UserProfile;
  documents: Document[];
}

const StandardsBrowser: React.FC<StandardsBrowserProps> = ({ user, documents }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGrade, setSelectedGrade] = useState('all');
  const [selectedSubject, setSelectedSubject] = useState('all');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [slos, setSlos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAllSlos = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('slo_database')
          .select('slo_code, slo_full_text, grade_level, domain, domain_name, subject, bloom_level')
          .limit(1000);
        
        if (error) throw error;
        setSlos(data || []);
      } catch (err) {
        console.error("Failed to fetch SLOs:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAllSlos();
  }, []);

  const sortedSlos = useMemo(() => {
    const filtered = slos.filter(s => {
      const matchesSearch = !searchQuery || 
        s.slo_code?.toLowerCase().includes(searchQuery.toLowerCase()) || 
        s.slo_full_text?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesGrade = selectedGrade === 'all' || s.grade_level === selectedGrade;
      const matchesSubject = selectedSubject === 'all' || s.subject === selectedSubject;
      
      return matchesSearch && matchesGrade && matchesSubject;
    });

    return [...filtered].sort((a, b) => {
      const pa = parseSLOCode(a.slo_code);
      const pb = parseSLOCode(b.slo_code);
      
      if (!pa || !pb) return (a.slo_code || '').localeCompare(b.slo_code || '');
      
      if (pa.subject !== pb.subject) return pa.subject.localeCompare(pb.subject);
      if (pa.grade !== pb.grade) return pa.grade.localeCompare(pb.grade);
      if (pa.domain !== pb.domain) return pa.domain.localeCompare(pb.domain);
      return pa.number - pb.number;
    });
  }, [slos, searchQuery, selectedGrade, selectedSubject]);

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20 text-left">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
             <BookOpen size={12} className="text-slate-400" />
             <span className="text-[8px] font-bold uppercase tracking-widest text-slate-400">Registry Node</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-bold text-slate-900 dark:text-white tracking-tighter uppercase">Standards Browser</h1>
          <p className="text-slate-500 mt-1 font-semibold text-xs">Access <span className="text-indigo-600">Global SLO Repository</span></p>
        </div>
      </header>

      <div className="bg-white dark:bg-slate-900 p-6 rounded-[2.5rem] shadow-xl border border-slate-100 dark:border-white/5 space-y-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search by SLO code or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-indigo-600 transition-all dark:text-white"
            />
          </div>
          <div className="flex gap-3">
            <select 
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value)}
              className="px-6 py-4 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-indigo-600 transition-all dark:text-white text-xs uppercase tracking-widest"
            >
              <option value="all">All Grades</option>
              <option value="09">Grade 9</option>
              <option value="10">Grade 10</option>
              <option value="11">Grade 11</option>
              <option value="12">Grade 12</option>
            </select>
            <button className="p-4 bg-indigo-600 text-white rounded-2xl shadow-lg hover:bg-indigo-700 transition-all">
              <Filter size={20} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 opacity-40">
            <Loader2 size={32} className="animate-spin text-indigo-600 mb-4" />
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Retrieving Standards...</p>
          </div>
        ) : sortedSlos.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {sortedSlos.map((slo) => (
              <div key={slo.slo_code} className="group bg-slate-50 dark:bg-black/20 p-6 rounded-3xl border border-slate-100 dark:border-white/5 hover:border-indigo-500/30 transition-all flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-start gap-6">
                  <div className="w-14 h-14 bg-white dark:bg-slate-800 rounded-2xl flex flex-col items-center justify-center shadow-sm shrink-0">
                    <span className="text-[8px] font-black text-slate-400 uppercase">Grade</span>
                    <span className="text-lg font-bold text-indigo-600 leading-none">{slo.grade_level || '??'}</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => handleCopy(slo.slo_code)}
                        className="text-[10px] font-black uppercase tracking-widest px-2 py-1 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 rounded-md hover:bg-indigo-100 transition-all flex items-center gap-2"
                      >
                        {slo.slo_code} {copiedCode === slo.slo_code ? <CheckCircle2 size={10} /> : <Copy size={10} />}
                      </button>
                      <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-md ${
                        slo.bloom_level === 'Analyze' || slo.bloom_level === 'Evaluate' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
                      }`}>
                        {slo.bloom_level || 'Understand'}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 leading-relaxed">{slo.slo_full_text}</p>
                  </div>
                </div>
                
                <button className="px-6 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-all flex items-center gap-2 shrink-0">
                  View Alignment <ArrowRight size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-20 text-center opacity-30">
            <AlertTriangle size={48} className="mx-auto mb-4 text-slate-300" />
            <p className="text-xl font-black uppercase tracking-widest text-slate-400">No Standards Found</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-indigo-600 rounded-[2.5rem] p-8 text-white space-y-4 relative overflow-hidden group cursor-pointer">
          <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform"><BarChart3 size={120} /></div>
          <h3 className="text-2xl font-bold tracking-tight uppercase">Bloom Distribution</h3>
          <p className="text-indigo-100 text-xs opacity-80 leading-relaxed">Analyze the cognitive complexity across your curriculum nodes.</p>
          <button className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest bg-white/10 px-4 py-2 rounded-lg hover:bg-white/20 transition-all">
            Open Analytics <ChevronRight size={14} />
          </button>
        </div>
        
        <div className="bg-emerald-600 rounded-[2.5rem] p-8 text-white space-y-4 relative overflow-hidden group cursor-pointer">
          <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform"><Target size={120} /></div>
          <h3 className="text-2xl font-bold tracking-tight uppercase">Vertical Alignment</h3>
          <p className="text-emerald-100 text-xs opacity-80 leading-relaxed">Map the progression of concepts across grade levels.</p>
          <button className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest bg-white/10 px-4 py-2 rounded-lg hover:bg-white/20 transition-all">
            Open Alignment Map <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default StandardsBrowser;
