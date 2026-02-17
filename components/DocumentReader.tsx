'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { X, Copy, Check, Target, Zap, Search, LayoutGrid, List } from 'lucide-react';
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

  /**
   * 🧠 RESILIENT NEURAL PARSER (v160)
   * Handles diverse formatting from different AI nodes (Flash vs Pro).
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
      if (!line) continue;

      // Detect Grade Context
      const gMatch = line.match(/# GRADE\s+([\dIXV]+)/i);
      if (gMatch) {
        let g = gMatch[1].toUpperCase();
        if (g === 'IX') g = '09';
        else if (g === 'X') g = '10';
        currentGrade = g.padStart(2, '0');
      }

      // Detect Domain Context
      const dMatch = line.match(/### DOMAIN\s+([A-Z0-9])/i);
      if (dMatch) currentDomain = dMatch[1].toUpperCase();

      // HEURISTIC MATCHING: Supports [TAG:CODE], [SLO:CODE], or - CODE | BLOOM
      const patterns = [
        /^- \[(?:TAG|SLO):([A-Z0-9.-]+)\]\s*(?:\|)?\s*([A-Za-z]+)?\s*[:]\s*([^\n<]+)/i, // Standard
        /^- ([A-Z][0-9]{2}[A-Z][0-9]{2,})\s*\|\s*([A-Za-z]+)\s*[:]\s*([^\n<]+)/i,      // Minimalist
        /^\[(?:TAG|SLO):([A-Z0-9.-]+)\]\s*(.+)/i                                      // Header-style
      ];

      let matched = false;
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          slos.push({
            code: match[1].trim().toUpperCase(),
            bloom: match[2]?.trim() || "Understand",
            text: (match[3] || match[2] || "").trim(),
            grade: currentGrade,
            domain: currentDomain
          });
          matched = true;
          break;
        }
      }
    }

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
      <header className="h-16 md:h-20 border-b dark:border-white/5 bg-white dark:bg-[#0d0d0d] flex items-center justify-between px-4 md:px-12 shrink-0 z-50">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="w-8 h-8 md:w-10 md:h-10 bg-indigo-600 rounded-lg md:rounded-xl flex items-center justify-center text-white shadow-lg"><Zap size={16}/></div>
          <div className="min-w-0">
            <h2 className="text-xs md:text-sm font-bold uppercase tracking-tight dark:text-white truncate max-w-[150px] md:max-w-md">{activeDoc.name}</h2>
            <p className="text-[8px] font-semibold text-slate-400 uppercase tracking-widest">Surgical Radar v160 • Resilient Node</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 md:gap-4">
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Filter nodes..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-slate-100 dark:bg-white/5 border-none rounded-full text-[10px] font-bold outline-none focus:ring-2 focus:ring-indigo-500 w-40 md:w-64"
            />
          </div>
          <button onClick={onClose} className="p-2 md:p-3 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-rose-500 rounded-lg md:rounded-xl transition-all"><X size={18}/></button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-12">
        <div className="max-w-6xl mx-auto space-y-12">
          {sortedGrades.length > 0 ? sortedGrades.map(grade => (
            <section key={grade} className="space-y-8">
              <div className="flex items-center gap-4">
                <div className="px-6 py-3 bg-indigo-600 text-white rounded-[1.5rem] font-bold text-xl shadow-xl">GRADE {grade}</div>
                <div className="h-px bg-slate-200 dark:bg-white/10 flex-1" />
              </div>

              <div className="space-y-12">
                {Object.keys(hierarchicalSLOs[grade]).sort().map(domain => {
                  const filtered = hierarchicalSLOs[grade][domain].filter(s => 
                    s.code.includes(searchTerm.toUpperCase()) || s.text.toLowerCase().includes(searchTerm.toLowerCase())
                  );
                  if (filtered.length === 0) return null;
                  
                  return (
                    <div key={domain} className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold text-xs border border-emerald-500/20">{domain}</div>
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Section {domain}</h3>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {filtered.map((slo) => (
                          <div 
                            key={slo.code}
                            onClick={() => handleCopy(slo.code)}
                            className="group relative bg-white dark:bg-white/5 p-5 md:p-6 rounded-[1.5rem] md:rounded-[2rem] border border-slate-200 dark:border-white/5 hover:border-indigo-500 transition-all cursor-pointer shadow-sm active:scale-[0.98]"
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <span className="px-3 py-1 bg-indigo-600 text-white rounded-full text-[9px] font-bold tracking-widest uppercase shadow-sm">
                                  {slo.code}
                                </span>
                                <span className="text-[8px] font-semibold uppercase text-slate-400 bg-slate-100 dark:bg-white/10 px-2 py-1 rounded-md">
                                  {slo.bloom}
                                </span>
                              </div>
                              {copiedCode === slo.code ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-all" />}
                            </div>
                            <p className="text-xs md:text-sm font-semibold text-slate-700 dark:text-slate-200 leading-relaxed group-hover:text-indigo-600 transition-colors"
                               dangerouslySetInnerHTML={{ __html: renderSTEM(slo.text) }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )) : (
            <div className="flex flex-col items-center justify-center py-40 text-center opacity-30">
               <Target size={48} className="mb-6 text-slate-400" />
               <h3 className="text-lg font-bold uppercase tracking-widest text-slate-500">Node Logic Search Failed</h3>
               <p className="text-xs font-medium mt-2 max-w-xs mx-auto">The neural reader cannot find structured tags. This asset may require manual re-alignment via the Mission Control node.</p>
            </div>
          )}
        </div>
      </main>

      <footer className="h-12 border-t dark:border-white/5 bg-white dark:bg-[#0d0d0d] flex items-center justify-between px-6 md:px-12 shrink-0">
         <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Reader Engine: v160 Resilient</span>
         <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Active Nodes: {Object.values(hierarchicalSLOs).reduce((a, b) => a + Object.values(b).reduce((c, d) => c + d.length, 0), 0)}</span>
      </footer>
    </div>
  );
};