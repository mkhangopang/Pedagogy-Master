'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { X, Copy, Check, Target, Zap, Search, AlertTriangle, FileText, LayoutList, BookOpen, BrainCircuit } from 'lucide-react';
import { Document } from '../types';
import { renderSTEM } from '../lib/math-renderer';

interface DocumentReaderProps {
  document: Document;
  onClose: () => void;
}

interface ParsedSLO {
  code: string;
  text: string;
  grade: string;
  domain: string;
  bloom: string;
}

type HierarchicalData = Record<string, Record<string, ParsedSLO[]>>;

export const DocumentReader: React.FC<DocumentReaderProps> = ({ document: activeDoc, onClose }) => {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'structured' | 'raw'>('structured');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { e.key === 'Escape' && onClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  /**
   * 🧠 INDESTRUCTIBLE NEURAL PARSER (v171)
   * Aggressive heuristic matching + Raw fallback normalization.
   */
  const hierarchicalSLOs = useMemo<HierarchicalData>(() => {
    const content = activeDoc.extractedText || "";
    if (!content) return {};
    
    const slos: ParsedSLO[] = [];
    const lines = content.split('\n');
    let currentGrade = activeDoc.gradeLevel?.replace(/\D/g, '') || "09";
    let currentDomain = "A";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.length < 5) continue;

      // 1. Structural Detectors
      const gMatch = line.match(/(?:# GRADE|Grade:)\s*([\dIXV]+)/i);
      if (gMatch) {
        let g = gMatch[1].toUpperCase();
        if (g === 'IX') g = '09';
        else if (g === 'X') g = '10';
        else if (g === 'XI') g = '11';
        else if (g === 'XII') g = '12';
        currentGrade = g.padStart(2, '0');
      }

      const dMatch = line.match(/(?:### DOMAIN|Domain:)\s*([A-Z0-9])/i);
      if (dMatch) currentDomain = dMatch[1].toUpperCase();

      // 2. High-Yield Patterns
      const patterns = [
        /^(?:[-*]\s*)?\[(?:TAG|SLO|SL0):([A-Z0-9.-]+)\]\s*(?:\|)?\s*([A-Za-z]+)?\s*[:]\s*([^\n<]+)/i,
        /^(?:[-*]\s*)?([A-Z][0-9]{2}[A-Z][0-9]{2,})\s*\|\s*([A-Za-z]+)\s*[:]\s*([^\n<]+)/i,
        /^(?:[-*]\s*)?\[(?:TAG|SLO|SL0):([A-Z0-9.-]+)\]\s*(.+)/i,
        /^(?:[-*]\s*)?([A-Z][0-9]{2}[A-Z][0-9]{2,})\s*[:]\s*(.+)/i,
        /^(?:[-*]\s*)?([A-Z][0-9]{2}[A-Z][0-9]{2,})\s+(.+)/i // Spaced fallback
      ];

      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          const code = match[1].trim().toUpperCase().replace(/[:\[\]\s]/g, '');
          const bloom = (match[2] && match[2].length < 20 ? match[2].trim() : null) || "Analyze";
          const text = (match[3] || match[2] || "").trim();

          if (code.length >= 4 && /[0-9]/.test(code)) {
            slos.push({
              code,
              bloom,
              text,
              grade: currentGrade,
              domain: currentDomain
            });
            break;
          }
        }
      }
    }

    // GROUPING LOGIC
    const grouped: HierarchicalData = {};
    slos.forEach(s => {
      if (!grouped[s.grade]) grouped[s.grade] = {};
      if (!grouped[s.grade][s.domain]) grouped[s.grade][s.domain] = [];
      grouped[s.grade][s.domain].push(s);
    });

    return grouped;
  }, [activeDoc.extractedText, activeDoc.gradeLevel]);

  const sortedGrades = useMemo(() => Object.keys(hierarchicalSLOs).sort(), [hierarchicalSLOs]);

  return (
    <div className="fixed inset-0 z-[500] bg-white dark:bg-[#050505] flex flex-col animate-in fade-in duration-300 overflow-hidden text-left">
      <header className="h-20 border-b dark:border-white/5 bg-white dark:bg-[#0d0d0d] flex items-center justify-between px-6 md:px-12 shrink-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg"><Zap size={18}/></div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold uppercase tracking-tight dark:text-white truncate max-w-md">{activeDoc.name}</h2>
            <p className="text-[8px] font-semibold text-slate-400 uppercase tracking-widest">Surgical Radar v171 • Neural Recovery Active</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl flex gap-1">
             <button onClick={() => setViewMode('structured')} className={`p-2 rounded-lg transition-all ${viewMode === 'structured' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-400'}`} title="Surgical Nodes"><LayoutList size={14}/></button>
             <button onClick={() => setViewMode('raw')} className={`p-2 rounded-lg transition-all ${viewMode === 'raw' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-400'}`} title="Full Ledger"><FileText size={14}/></button>
          </div>
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Search curriculum nodes..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-slate-100 dark:bg-white/5 border-none rounded-full text-[10px] font-bold outline-none focus:ring-2 focus:ring-indigo-500 w-64"
            />
          </div>
          <button onClick={onClose} className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-rose-500 rounded-xl transition-all"><X size={20}/></button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-12">
        <div className="max-w-6xl mx-auto space-y-12">
          {viewMode === 'raw' ? (
             <div className="bg-slate-50 dark:bg-[#0a0a0a] p-10 md:p-16 rounded-[3rem] border border-slate-200 dark:border-white/5 font-mono text-xs md:text-sm leading-relaxed whitespace-pre-wrap dark:text-slate-300 shadow-inner">
               <div className="flex items-center gap-2 mb-8 opacity-50">
                  <FileText size={16} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Master MD Trace Log</span>
               </div>
               {activeDoc.extractedText || "Awaiting neural linearization..."}
             </div>
          ) : sortedGrades.length > 0 ? sortedGrades.map(grade => (
            <section key={grade} className="space-y-8">
              <div className="flex items-center gap-4">
                <div className="px-8 py-3 bg-indigo-600 text-white rounded-[1.5rem] font-bold text-xl shadow-xl">GRADE {grade}</div>
                <div className="h-px bg-slate-200 dark:bg-white/10 flex-1" />
              </div>
              <div className="space-y-10">
                {Object.keys(hierarchicalSLOs[grade]).sort().map(domain => {
                  const filtered = hierarchicalSLOs[grade][domain].filter(s => 
                    s.code.includes(searchTerm.toUpperCase()) || s.text.toLowerCase().includes(searchTerm.toLowerCase())
                  );
                  if (filtered.length === 0) return null;
                  return (
                    <div key={domain} className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold text-xs border border-emerald-500/20">{domain}</div>
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">DOMAIN {domain}</h3>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        {filtered.map((slo) => (
                          <div key={slo.code} onClick={() => handleCopy(slo.code)} className="group relative bg-white dark:bg-white/5 p-6 rounded-[2rem] border border-slate-200 dark:border-white/5 hover:border-indigo-500 transition-all cursor-pointer shadow-sm active:scale-[0.98]">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <span className="px-3 py-1 bg-indigo-600 text-white rounded-full text-[9px] font-bold tracking-widest uppercase">{slo.code}</span>
                                <span className="text-[8px] font-semibold uppercase text-slate-400 bg-slate-50 dark:bg-white/10 px-2 py-1 rounded-md">{slo.bloom}</span>
                              </div>
                              {copiedCode === slo.code ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-all" />}
                            </div>
                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 leading-relaxed group-hover:text-indigo-600 transition-colors" dangerouslySetInnerHTML={{ __html: renderSTEM(slo.text) }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )) : (
            <div className="flex flex-col items-center justify-center py-40 text-center space-y-8 animate-in fade-in duration-700">
               <div className="relative">
                  <div className="w-20 h-20 bg-slate-100 dark:bg-white/5 rounded-[2rem] flex items-center justify-center text-slate-300">
                    <BrainCircuit size={48} className="animate-pulse" />
                  </div>
                  <div className="absolute -top-2 -right-2 p-2 bg-amber-500 text-white rounded-full shadow-lg"><AlertTriangle size={16}/></div>
               </div>
               <div className="space-y-2">
                 <h3 className="text-xl font-bold uppercase tracking-widest text-slate-900 dark:text-white">Neural Handshake Pending</h3>
                 <p className="text-xs font-medium max-w-sm mx-auto text-slate-500 leading-relaxed">The parser found no surgical SLO tags in the linearized artifact. This usually occurs if the document is still in the 'Linearization' phase.</p>
               </div>
               <div className="flex gap-4">
                 <button onClick={() => setViewMode('raw')} className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-indigo-700 transition-all flex items-center gap-3">
                   <BookOpen size={14}/> Read Full Document
                 </button>
               </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};