'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { X, Copy, Check, Target, Zap, Search, ChevronRight, Layers, LayoutGrid } from 'lucide-react';
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
   * 🧠 SURGICAL PARSER (v7.0)
   * Resilient to both legacy [SLO:...] and modern Master MD formats.
   */
  const hierarchicalSLOs = useMemo<HierarchicalData>(() => {
    const content = activeDoc.extractedText || "";
    if (!content) return {};
    
    const slos: ParsedSLO[] = [];
    const lines = content.split('\n');
    let currentGrade = "09";
    let currentDomain = "A";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Detect Grade Headers
      const gMatch = line.match(/# GRADE\s+([\dIX]+)/i);
      if (gMatch) {
        let g = gMatch[1].toUpperCase();
        if (g === 'IX') g = '09';
        else if (g === 'X') g = '10';
        else if (g === 'XI') g = '11';
        else if (g === 'XII') g = '12';
        currentGrade = g.padStart(2, '0');
      }

      // Detect Domain Headers
      const dMatch = line.match(/### DOMAIN\s+([A-Z])/i);
      if (dMatch) currentDomain = dMatch[1].toUpperCase();

      // Extract SLO Nodes
      // Pattern 1: Modern Master MD format: - [TAG:CODE] | BLOOM : TEXT
      const modernMatch = line.match(/^- \[TAG:([A-Z0-9.-]+)\]\s*\|?\s*([A-Za-z]+)?\s*[:]\s*([^\n<]+)/i);
      // Pattern 2: Raw PDF format: [SLO:CODE] followed by text on next line
      const rawMatch = line.match(/\[SLO:([A-Z0-9.-]+)\]/i);

      if (modernMatch) {
        slos.push({
          code: modernMatch[1].trim().toUpperCase(),
          bloom: modernMatch[2]?.trim() || "Analyze",
          text: modernMatch[3].trim(),
          grade: currentGrade,
          domain: currentDomain
        });
      } else if (rawMatch) {
        const code = rawMatch[1].trim().toUpperCase();
        // Look ahead for text description if not on same line
        const desc = lines[i + 1]?.trim() || "Pedagogical node description pending neural unrolling.";
        
        // Infer grade and domain from code if possible (Sindh Format: P-09-C-55)
        const parts = code.split('-');
        let inferredGrade = currentGrade;
        let inferredDomain = currentDomain;
        
        if (parts.length >= 3) {
          inferredGrade = parts[1].padStart(2, '0');
          inferredDomain = parts[2];
        }

        slos.push({
          code,
          bloom: "Understand",
          text: desc,
          grade: inferredGrade,
          domain: inferredDomain
        });
      }
    }

    // Sort into Deep Hierarchy
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
    <div className="fixed inset-0 z-[500] bg-slate-50 dark:bg-[#050505] flex flex-col animate-in fade-in duration-300 overflow-hidden text-left">
      <header className="h-20 border-b dark:border-white/5 bg-white dark:bg-[#0d0d0d] flex items-center justify-between px-8 md:px-12 shrink-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg"><Zap size={20}/></div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-tight dark:text-white truncate max-w-[200px] md:max-w-md">{activeDoc.name}</h2>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Surgical SLO Radar • Minimalist Alignment</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Filter Codes (e.g. P-09)..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-slate-100 dark:bg-white/5 border-none rounded-full text-[10px] font-bold outline-none focus:ring-2 focus:ring-indigo-500 w-64"
            />
          </div>
          <button onClick={onClose} className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-rose-500 rounded-xl transition-all"><X size={20}/></button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-12 lg:p-20">
        <div className="max-w-6xl mx-auto space-y-24">
          
          {sortedGrades.length > 0 ? sortedGrades.map(grade => (
            <section key={grade} className="space-y-12">
              <div className="flex items-center gap-6">
                <div className="px-10 py-5 bg-indigo-600 text-white rounded-[2rem] font-black text-3xl shadow-2xl tracking-tighter">GRADE {grade}</div>
                <div className="h-px bg-slate-200 dark:bg-white/10 flex-1" />
              </div>

              <div className="space-y-16">
                {Object.keys(hierarchicalSLOs[grade]).sort().map(domain => {
                  const filteredSLOs = hierarchicalSLOs[grade][domain].filter(s => 
                    s.code.includes(searchTerm.toUpperCase()) || 
                    s.text.toLowerCase().includes(searchTerm.toLowerCase())
                  );

                  if (filteredSLOs.length === 0) return null;

                  return (
                    <div key={domain} className="space-y-8">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-black text-lg border border-emerald-500/20">{domain}</div>
                        <h3 className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">DOMAIN {domain} SEGMENTS</h3>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
                        {filteredSLOs.map((slo) => (
                          <div 
                            key={slo.code}
                            onClick={() => handleCopy(slo.code)}
                            className="group relative bg-white dark:bg-white/5 p-8 rounded-[3rem] border-2 border-transparent hover:border-indigo-500 transition-all cursor-pointer hover:shadow-2xl active:scale-[0.98] shadow-sm"
                          >
                            <div className="flex items-center justify-between mb-5">
                              <div className="flex items-center gap-3">
                                <span className="px-5 py-2 bg-indigo-600 text-white rounded-full text-[11px] font-black tracking-widest shadow-md group-hover:scale-105 transition-transform uppercase">
                                  {slo.code}
                                </span>
                                <span className="text-[9px] font-black uppercase text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-3 py-1 rounded-lg">
                                  {slo.bloom}
                                </span>
                              </div>
                              {copiedCode === slo.code ? (
                                <div className="flex items-center gap-1.5 text-emerald-500 font-black text-[9px] uppercase">
                                  <Check size={14} /> Synced
                                </div>
                              ) : (
                                <Copy size={16} className="text-slate-300 group-hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-all" />
                              )}
                            </div>
                            <p 
                              className="text-sm font-bold text-slate-700 dark:text-slate-200 leading-relaxed group-hover:text-indigo-600 transition-colors line-clamp-4"
                              dangerouslySetInnerHTML={{ __html: renderSTEM(slo.text) }} 
                            />
                            
                            <div className="mt-6 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Click to link context</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )) : (
            <div className="flex flex-col items-center justify-center py-48 text-center opacity-30">
               <div className="w-24 h-24 bg-slate-100 dark:bg-white/5 rounded-[3rem] flex items-center justify-center mb-8 border border-dashed border-slate-300">
                 <Target size={48} className="text-slate-400" />
               </div>
               <h3 className="text-2xl font-black uppercase tracking-widest text-slate-500">Node Inversion Required</h3>
               <p className="text-sm font-medium mt-3 max-w-sm text-slate-400">The neural reader cannot find structured SLO tags. The ledger might require re-ingestion via the v146.0 engine.</p>
            </div>
          )}
        </div>
      </main>

      <footer className="h-16 border-t dark:border-white/5 bg-white dark:bg-[#0d0d0d] flex items-center justify-between px-12 shrink-0">
         <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Grounded Perspective v7.0</span>
            </div>
         </div>
         <div className="flex items-center gap-6">
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest bg-slate-100 dark:bg-white/5 px-4 py-1.5 rounded-full">
              Target Nodes: {Object.values(hierarchicalSLOs).reduce((a, b) => a + Object.values(b).reduce((c, d) => c + d.length, 0), 0)}
            </span>
         </div>
      </footer>
    </div>
  );
};
