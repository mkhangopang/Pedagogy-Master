'use client';

import React, { useState } from 'react';
import { UserProfile, Document, SLO } from '../types';
import { Search, Filter, BookOpen, Target, ArrowRight, Copy, CheckCircle2, AlertTriangle, ChevronRight, BarChart3 } from 'lucide-react';

interface StandardsBrowserProps {
  user: UserProfile;
  documents: Document[];
}

const StandardsBrowser: React.FC<StandardsBrowserProps> = ({ user, documents }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGrade, setSelectedGrade] = useState('all');
  const [selectedSubject, setSelectedSubject] = useState('all');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Mock data for standards since we don't have a direct fetch here yet
  const mockSLOs: SLO[] = [
    { code: 'B-09-A-01', description: 'Identify the major structures of a typical plant cell.', bloomLevel: 'Remember', grade: '09' },
    { code: 'B-09-A-02', description: 'Explain the function of mitochondria in cellular respiration.', bloomLevel: 'Understand', grade: '09' },
    { code: 'B-10-B-05', description: 'Analyze the impact of genetic mutations on protein synthesis.', bloomLevel: 'Analyze', grade: '10' },
    { code: 'B-12-C-12', description: 'Evaluate the ethical implications of CRISPR technology.', bloomLevel: 'Evaluate', grade: '12' },
  ];

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

        <div className="grid grid-cols-1 gap-4">
          {mockSLOs.map((slo) => (
            <div key={slo.code} className="group bg-slate-50 dark:bg-black/20 p-6 rounded-3xl border border-slate-100 dark:border-white/5 hover:border-indigo-500/30 transition-all flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-start gap-6">
                <div className="w-14 h-14 bg-white dark:bg-slate-800 rounded-2xl flex flex-col items-center justify-center shadow-sm shrink-0">
                  <span className="text-[8px] font-black text-slate-400 uppercase">Grade</span>
                  <span className="text-lg font-bold text-indigo-600 leading-none">{slo.grade}</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => handleCopy(slo.code)}
                      className="text-[10px] font-black uppercase tracking-widest px-2 py-1 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 rounded-md hover:bg-indigo-100 transition-all flex items-center gap-2"
                    >
                      {slo.code} {copiedCode === slo.code ? <CheckCircle2 size={10} /> : <Copy size={10} />}
                    </button>
                    <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-md ${
                      slo.bloomLevel === 'Analyze' || slo.bloomLevel === 'Evaluate' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
                    }`}>
                      {slo.bloomLevel}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 leading-relaxed">{slo.description}</p>
                </div>
              </div>
              
              <button className="px-6 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-all flex items-center gap-2 shrink-0">
                View Alignment <ArrowRight size={14} />
              </button>
            </div>
          ))}
        </div>
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
