'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { X, Copy, Check, Target, Zap, Search } from 'lucide-react';
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

  // 🧠 SURGICAL PARSER: Extract only SLO nodes for the Radar View
  const hierarchicalSLOs = useMemo<HierarchicalData>(() => {
    if (!activeDoc.extractedText) return {};
    
    const slos: ParsedSLO[] = [];
    const lines = activeDoc.extractedText.split('\n');
    let currentGrade = "09";
    let currentDomain = "A";

    lines.forEach(line => {
      const gMatch = line.match(/# GRADE\s+([\dIX]+)/i);
      if (gMatch) {
        let g = gMatch[1].toUpperCase();
        if (g === 'IX') g = '09';
        if (g === 'X') g = '10';
        currentGrade = g.padStart(2, '0');
      }

      const dMatch = line.match(/### DOMAIN\s+([A-Z])/i);
      if (dMatch) currentDomain = dMatch[1].toUpperCase();

      const sloMatch = line.match(/^- \[TAG:([A-Z0-9.]+)\]\s*\|?\s*([A-Za-z]+)?\s*[:]\s*([^\n<]+)/i);
      if (sloMatch) {
        slos.push({
          code: sloMatch[1].trim().toUpperCase(),
          bloom: sloMatch[2]?.trim() || "Analyze",
          text: sloMatch[3].trim(),
          grade: currentGrade,
          domain: currentDomain
        });
      }
    });

    // Grouping Logic
    const grouped: HierarchicalData = {};
    slos.forEach(s => {
      if (!grouped[s.grade]) grouped[s.grade] = {};
      if (!grouped[s.grade][s.domain]) grouped[s.grade][s.domain] = [];
      grouped[s.grade][s.domain].push(s);
    });

    return grouped;
  }, [activeDoc.extractedText]);

  const sortedGrades = useMemo(() => Object.keys(hierarchicalSLOs).sort(), [hierarchicalSLOs]);

  return (
    <div className="fixed inset-0 z-[500] bg-slate-50 dark:bg-[#050505] flex flex-col animate-in fade-in duration-300 overflow-hidden">
      <header className="h-20 border-b dark:border-white/5 bg-white dark:bg-[#0d0d0d] flex items-center justify-between px-8 md:px-12 shrink-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg"><Zap size={20}/></div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-tight dark:text-white truncate max-w-[200px] md:max-w-md">{activeDoc.name}</h2>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Minimalist SLO Focus View • v146.0</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Search SLO Codes..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-slate-100 dark:bg-white/5 border-none rounded-full text-[10px] font-bold outline-none focus:ring-2 focus:ring-indigo-500 w-64"
            />
          </div>
          <button onClick={onClose} className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-rose-500 rounded-xl transition-all"><X size={20}/></button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-12 lg:p-20">
        <div className="max-w-6xl mx-auto space-y-20">
          
          {sortedGrades.length > 0 ? sortedGrades.map(grade => (
            <section key={grade} className="space-y-12">
              <div className="flex items-center gap-6">
                <div className="px-8 py-4 bg-indigo-600 text-white rounded-[2rem] font-black text-2xl shadow-2xl">GRADE {grade}</div>
                <div className="h-px bg-slate-200 dark:bg-white/10 flex-1" />
              </div>

              <div className="space-y-16">
                {Object.keys(hierarchicalSLOs[grade]).sort().map(domain => (
                  <div key={domain} className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-black text-sm border border-emerald-500/20">{domain}</div>
                      <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Domain {domain} Navigation Nodes</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {hierarchicalSLOs[grade][domain]
                        .filter(s => s.code.includes(searchTerm.toUpperCase()) || s.text.toLowerCase().includes(searchTerm.toLowerCase()))
                        .map((slo) => (
                        <div 
                          key={slo.code}
                          onClick={() => handleCopy(slo.code)}
                          className="group relative bg-white dark:bg-white/5 p-6 rounded-[2.5rem] border border-slate-200 dark:border-white/5 hover:border-indigo-500 transition-all cursor-pointer hover:shadow-xl active:scale-[0.98]"
                        >
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <span className="px-4 py-1.5 bg-indigo-600 text-white rounded-full text-[10px] font-black tracking-widest shadow-md group-hover:scale-105 transition-transform uppercase">
                                {slo.code}
                              </span>
                              <span className="text-[8px] font-black uppercase text-slate-400 bg-slate-100 dark:bg-white/10 px-2 py-1 rounded-md">
                                {slo.bloom}
                              </span>
                            </div>
                            {copiedCode === slo.code ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} className="text-slate-300 group-hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-all" />}
                          </div>
                          <p className="text-sm font-bold text-slate-700 dark:text-slate-200 leading-relaxed line-clamp-3 group-hover:text-indigo-600 transition-colors"
                             dangerouslySetInnerHTML={{ __html: renderSTEM(slo.text) }} />
                          
                          <div className="absolute top-4 right-4 text-[7px] font-black text-slate-300 uppercase opacity-0 group-hover:opacity-100 tracking-tighter">Click to Copy Node</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )) : (
            <div className="flex flex-col items-center justify-center py-40 text-center opacity-30">
               <Target size={64} className="mb-6" />
               <h3 className="text-xl font-black uppercase tracking-widest">No SLO Nodes Synchronized</h3>
               <p className="text-sm font-medium mt-2">The neural extractor is still unrolling this ledger.</p>
            </div>
          )}
        </div>
      </main>

      <footer className="h-16 border-t dark:border-white/5 bg-white dark:bg-[#0d0d0d] flex items-center justify-center px-8 shrink-0">
         <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">System Grounded</span>
            </div>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Atomic Nodes: {Object.values(hierarchicalSLOs).reduce((a, b) => a + Object.values(b).reduce((c, d) => c + d.length, 0), 0)}</span>
         </div>
      </footer>
    </div>
  );
};
