'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { X, Copy, Check, Target, Zap, Search, AlertTriangle, FileText, LayoutList, BookOpen, BrainCircuit, Layers, Hash, Info, History, RefreshCcw, Activity } from 'lucide-react';
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
  subject: string;
  domain: string;
  bloom: string;
}

type HierarchicalData = Record<string, Record<string, Record<string, ParsedSLO[]>>>;

export const DocumentReader: React.FC<DocumentReaderProps> = ({ document: activeDoc, onClose }) => {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'ledger' | 'raw'>('ledger');

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
   * 🧠 NEURAL SLO LEDGER ENGINE (v2.0)
   * High-fidelity extraction of Subject-Grade-Domain sequence.
   */
  const curriculumTree = useMemo<HierarchicalData>(() => {
    const content = activeDoc.extractedText || "";
    if (!content) return {};
    
    const slos: ParsedSLO[] = [];
    const lines = content.split('\n');
    
    let currentGrade = activeDoc.gradeLevel?.replace(/\D/g, '') || "09";
    let currentSubject = activeDoc.subject || "General";
    let currentDomain = "A";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.length < 3) continue;

      // 1. Hierarchy Shift Logic
      const sMatch = line.match(/^(?:Subject|Board|Subject Area):\s*(.+)/i);
      if (sMatch) currentSubject = sMatch[1].trim();

      const gMatch = line.match(/(?:# GRADE|Grade|Class|Grade Level):\s*([\dIXV-]+)/i);
      if (gMatch) {
        let g = gMatch[1].toUpperCase();
        if (g.includes('IX')) g = '09';
        else if (g.includes('X')) g = '10';
        else if (g.includes('XI')) g = '11';
        else if (g.includes('XII')) g = '12';
        currentGrade = g.replace(/\D/g, '').padStart(2, '0');
      }

      const dMatch = line.match(/(?:### DOMAIN|Domain)\s*([A-Z0-9])[:\s-]/i);
      if (dMatch) currentDomain = dMatch[1].toUpperCase();

      // 2. SLO Code Detection (Handles B09A01, B-09-A-01, [SLO:B-09-A-01])
      const sloPatterns = [
        /(?:\[)?SL[O0]:\s*([A-Z]-?\d{2}-?[A-Z]-?\d{2,})(?:\])?\s*\|?\s*(\w+)?\s*[:]\s*(.+)/i,
        /([A-Z]\d{2}[A-Z]\d{2,})\s*[:]\s*(.+)/i,
        /\b([A-Z]-\d{2}-[A-Z]-\d{2,})\s*[:]\s*(.+)/i
      ];

      let matched = false;
      for (const pattern of sloPatterns) {
        const match = line.match(pattern);
        if (match) {
          const rawCode = match[1].trim().toUpperCase().replace(/[:\[\]]/g, '');
          const bloom = (match[2] && match[2].length < 15 ? match[2].trim() : "Understand");
          const text = (match[3] || match[2] || "").trim();
          
          // SLO Sequence Decomposition
          const parts = rawCode.split('-');
          const gFromCode = parts[1] || currentGrade;
          const dFromCode = parts[2] || currentDomain;

          slos.push({
            code: rawCode,
            text,
            grade: gFromCode,
            subject: currentSubject,
            domain: dFromCode,
            bloom
          });
          matched = true;
          break;
        }
      }
    }

    const tree: HierarchicalData = {};
    slos.forEach(s => {
      const subj = s.subject;
      const grd = s.grade;
      const dom = s.domain;
      if (!tree[subj]) tree[subj] = {};
      if (!tree[subj][grd]) tree[subj][grd] = {};
      if (!tree[subj][grd][dom]) tree[subj][grd][dom] = [];
      tree[subj][grd][dom].push(s);
    });

    return tree;
  }, [activeDoc.extractedText, activeDoc.gradeLevel, activeDoc.subject]);

  const hasStructuredData = Object.keys(curriculumTree).length > 0;

  return (
    <div className="fixed inset-0 z-[500] bg-white dark:bg-[#080808] flex flex-col animate-in fade-in duration-300 overflow-hidden text-left">
      <header className="h-16 border-b dark:border-white/5 bg-white dark:bg-[#0d0d0d] flex items-center justify-between px-6 shrink-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white"><LayoutList size={18}/></div>
          <div>
            <h2 className="text-xs font-black uppercase tracking-tight dark:text-white truncate max-w-xs">{activeDoc.name}</h2>
            <p className="text-[7px] font-bold text-slate-400 uppercase tracking-[0.2em]">Universal Ingestion Ledger v2.0</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
            <input 
              type="text" 
              placeholder="Search code or keywords..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-4 py-1.5 bg-slate-50 dark:bg-white/5 border-none rounded-full text-[10px] font-bold outline-none focus:ring-1 focus:ring-indigo-500 w-48 transition-all"
            />
          </div>
          <div className="bg-slate-100 dark:bg-white/5 p-1 rounded-lg flex gap-1">
             <button onClick={() => setViewMode('ledger')} className={`px-3 py-1 rounded-md text-[9px] font-black uppercase transition-all ${viewMode === 'ledger' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-400'}`}>Ledger</button>
             <button onClick={() => setViewMode('raw')} className={`px-3 py-1 rounded-md text-[9px] font-black uppercase transition-all ${viewMode === 'raw' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-400'}`}>Raw</button>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 transition-colors"><X size={20}/></button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/50 dark:bg-[#080808]">
        <div className="max-w-4xl mx-auto p-6 md:p-12 space-y-12">
          {viewMode === 'raw' ? (
            <div className="bg-white dark:bg-[#0d0d0d] p-8 rounded-3xl border border-slate-200 dark:border-white/5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap dark:text-slate-300 shadow-inner">
               <div className="flex items-center gap-2 mb-6 opacity-30 uppercase text-[9px] font-black"><History size={12} /> Archive View</div>
               {activeDoc.extractedText}
            </div>
          ) : hasStructuredData ? (
            Object.entries(curriculumTree).map(([subject, grades]) => (
              <div key={subject} className="space-y-10">
                <div className="flex items-center gap-3">
                   <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-lg"><BookOpen size={16}/></div>
                   <h3 className="text-sm font-black uppercase tracking-widest dark:text-white">{subject}</h3>
                </div>

                {Object.entries(grades).sort().map(([grade, domains]) => (
                  <div key={grade} className="space-y-8 pl-4 border-l border-slate-200 dark:border-white/10 ml-2">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-900 text-white rounded-md font-black text-[9px] uppercase tracking-widest">
                      <Layers size={10}/> Grade {grade}
                    </div>

                    <div className="space-y-12">
                      {Object.entries(domains).sort((a, b) => a[0].localeCompare(b[0])).map(([domain, items]) => {
                        const filtered = (items as ParsedSLO[]).filter(s => 
                          s.code.includes(searchTerm.toUpperCase()) || s.text.toLowerCase().includes(searchTerm.toLowerCase())
                        );
                        if (filtered.length === 0) return null;
                        
                        return (
                          <div key={domain} className="space-y-4">
                             <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Domain {domain}</span>
                                <div className="h-px bg-slate-100 dark:bg-white/5 flex-1" />
                             </div>
                             
                             <div className="space-y-2">
                                {filtered.map((slo) => (
                                  <div key={slo.code} className="flex gap-4 p-4 bg-white dark:bg-[#0d0d0d] rounded-2xl border border-slate-100 dark:border-white/5 hover:border-indigo-500/50 group transition-all">
                                     <button 
                                       onClick={() => handleCopy(slo.code)}
                                       className="shrink-0 flex items-center justify-between gap-3 px-3 py-2 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 group-hover:border-indigo-500 transition-all min-w-[120px]"
                                     >
                                        <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 tracking-wider">{slo.code}</span>
                                        {copiedCode === slo.code ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-all" />}
                                     </button>
                                     <div className="flex-1 min-w-0 py-1.5">
                                        <div className="flex items-center gap-2 mb-1.5">
                                          <span className="text-[8px] font-bold text-slate-400 uppercase bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded">{slo.bloom}</span>
                                        </div>
                                        <p className="text-[13px] font-medium text-slate-700 dark:text-slate-300 leading-relaxed" dangerouslySetInnerHTML={{ __html: renderSTEM(slo.text) }} />
                                     </div>
                                  </div>
                                ))}
                             </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-40 text-center opacity-30">
               <BrainCircuit size={48} className="mb-4 animate-pulse" />
               <h3 className="text-lg font-black uppercase tracking-widest">Neural Indexing...</h3>
               <p className="text-xs font-medium max-w-xs mt-2">The ledger is awaiting the linearization phase of your curriculum PDF.</p>
            </div>
          )}
        </div>
      </main>

      <footer className="h-8 border-t dark:border-white/5 bg-white dark:bg-[#0d0d0d] flex items-center justify-between px-6 shrink-0">
         <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Click code to auto-copy for Synthesis Hub</span>
         <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">High-Fidelity Deterministic Grid</span>
      </footer>
    </div>
  );
};