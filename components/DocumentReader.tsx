'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { X, Copy, Check, Target, Zap, Search, AlertTriangle, FileText, LayoutList, BookOpen, BrainCircuit, Layers, Hash } from 'lucide-react';
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

// Hierarchy: Subject -> Grade -> Domain -> SLOs
type HierarchicalData = Record<string, Record<string, Record<string, ParsedSLO[]>>>;

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
   * 🧠 UNIVERSAL PEDAGOGICAL PARSER (v173)
   * Specialized for Sindh/Federal/International Progression Grids.
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
      if (!line || line.length < 5) continue;

      // 1. Context Sentinels (Headers)
      const subjectMatch = line.match(/^Subject:\s*(.+)/i);
      if (subjectMatch) currentSubject = subjectMatch[1].trim();

      const gradeMatch = line.match(/(?:# GRADE|Grade:)\s*([\dIXV-]+)/i);
      if (gradeMatch) {
        let g = gradeMatch[1].toUpperCase();
        if (g.includes('IX')) g = '09';
        else if (g.includes('X')) g = '10';
        else if (g.includes('XI')) g = '11';
        else if (g.includes('XII')) g = '12';
        currentGrade = g.replace(/\D/g, '').padStart(2, '0');
      }

      const domainMatch = line.match(/(?:### DOMAIN|Domain)\s*([A-Z0-9])[:\s-]/i);
      if (domainMatch) currentDomain = domainMatch[1].toUpperCase();

      // 2. SLO Pattern Detection: Supports [SLO:P-09-A-01], [TAG:B11B02], or Standard numbered lists
      const patterns = [
        // Hyphenated Node: [SLO:P-09-A-01] | Remember : Text
        /^(?:[-*]\s*)?\[(?:SLO|TAG|SL0):([A-Z0-9.-]+)\]\s*(?:\|)?\s*([A-Za-z]+)?\s*[:]\s*([^\n<]+)/i,
        // Standard code: P09A01 | Text
        /^(?:[-*]\s*)?([A-Z]\d{2}[A-Z]\d{2,})\s*\|\s*([A-Za-z]+)\s*[:]\s*([^\n<]+)/i,
        // Raw code fallback: P09A01: Text
        /^(?:[-*]\s*)?([A-Z]\d{2}[A-Z]\d{2,})\s*[:]\s*(.+)/i,
        // Bullet Fallback (Numbered lines)
        /^(?:\d+\.|\*)\s*([A-Z]-\d{2}-[A-Z]-\d{2,})\s+(.+)/i
      ];

      let matched = false;
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          const rawCode = match[1].trim().toUpperCase();
          const bloom = (match[2] && match[2].length < 20 ? match[2].trim() : "Apply");
          const text = (match[3] || match[2] || "").trim();

          // Standardize code for tree sorting (Remove extra brackets/SLO tags)
          const cleanCode = rawCode.replace(/SLO|[:\[\]\s]/g, '');

          // Extra Context Extraction from Code
          // If code is P-09-A-01, we can infer grade and domain even if headers missed it
          const parts = cleanCode.split('-');
          const gradeFromCode = parts[1] || currentGrade;
          const domainFromCode = parts[2] || currentDomain;

          slos.push({
            code: cleanCode,
            text,
            grade: gradeFromCode,
            subject: currentSubject,
            domain: domainFromCode,
            bloom
          });
          matched = true;
          break;
        }
      }
    }

    // 3. TREE CONSTRUCTION
    const tree: HierarchicalData = {};
    slos.forEach(s => {
      if (!tree[s.subject]) tree[s.subject] = {};
      if (!tree[s.subject][s.grade]) tree[s.subject][s.grade] = {};
      if (!tree[s.subject][s.grade][s.domain]) tree[s.subject][s.grade][s.domain] = [];
      tree[s.subject][s.grade][s.domain].push(s);
    });

    return tree;
  }, [activeDoc.extractedText, activeDoc.gradeLevel, activeDoc.subject]);

  return (
    <div className="fixed inset-0 z-[500] bg-white dark:bg-[#050505] flex flex-col animate-in fade-in duration-300 overflow-hidden text-left">
      <header className="h-20 border-b dark:border-white/5 bg-white dark:bg-[#0d0d0d] flex items-center justify-between px-6 md:px-12 shrink-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg"><Zap size={18}/></div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold uppercase tracking-tight dark:text-white truncate max-w-md">{activeDoc.name}</h2>
            <p className="text-[8px] font-semibold text-slate-400 uppercase tracking-widest">Surgical Radar v173 • Universal Ingestion Hub</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl flex gap-1">
             <button onClick={() => setViewMode('structured')} className={`p-2 rounded-lg transition-all ${viewMode === 'structured' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-400'}`} title="Progression Grid"><LayoutList size={14}/></button>
             <button onClick={() => setViewMode('raw')} className={`p-2 rounded-lg transition-all ${viewMode === 'raw' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-400'}`} title="Trace Log"><FileText size={14}/></button>
          </div>
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Search SLO codes (e.g. P-09)..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-slate-100 dark:bg-white/5 border-none rounded-full text-[10px] font-bold outline-none focus:ring-2 focus:ring-indigo-500 w-64"
            />
          </div>
          <button onClick={onClose} className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-rose-500 rounded-xl transition-all"><X size={20}/></button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-12">
        <div className="max-w-6xl mx-auto space-y-16">
          {viewMode === 'raw' ? (
             <div className="bg-slate-50 dark:bg-[#0a0a0a] p-10 md:p-16 rounded-[3rem] border border-slate-200 dark:border-white/5 font-mono text-xs md:text-sm leading-relaxed whitespace-pre-wrap dark:text-slate-300 shadow-inner">
               <div className="flex items-center gap-2 mb-8 opacity-50"><FileText size={16} /><span className="text-[10px] font-black uppercase tracking-widest">Master Linear Trace</span></div>
               {activeDoc.extractedText || "Awaiting neural buffer..."}
             </div>
          ) : Object.keys(curriculumTree).length > 0 ? Object.entries(curriculumTree).map(([subject, grades]) => (
            <div key={subject} className="space-y-12">
              <div className="flex items-center gap-4">
                 <div className="p-4 bg-indigo-600 text-white rounded-3xl shadow-xl"><BookOpen size={24}/></div>
                 <div>
                    <h3 className="text-2xl font-black uppercase tracking-tight dark:text-white">{subject}</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Core Progression Grid</p>
                 </div>
              </div>

              {Object.entries(grades).sort().map(([grade, domains]) => (
                <div key={grade} className="space-y-8 pl-4 md:pl-12 border-l border-slate-200 dark:border-white/10">
                  <div className="inline-flex items-center gap-3 px-6 py-2 bg-slate-900 text-white rounded-full font-black text-xs uppercase tracking-widest">
                    <Layers size={14}/> Grade {grade}
                  </div>

                  <div className="grid grid-cols-1 gap-12">
                    {/* 
                      // Add comment above each fix
                      // Fix: Added explicit type casting for items to resolve 'unknown' type error during filter callback for ParsedSLO properties
                    */}
                    {Object.entries(domains).sort().map(([domain, items]) => {
                      const filtered = (items as ParsedSLO[]).filter(s => 
                        s.code.includes(searchTerm.toUpperCase()) || s.text.toLowerCase().includes(searchTerm.toLowerCase())
                      );
                      if (filtered.length === 0) return null;
                      
                      return (
                        <div key={domain} className="space-y-6">
                           <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-black text-xs border border-emerald-500/20">{domain}</div>
                              <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Domain {domain}</h4>
                           </div>
                           
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {filtered.map((slo) => (
                                <div key={slo.code} onClick={() => handleCopy(slo.code)} className="group bg-white dark:bg-white/5 p-6 rounded-[2rem] border border-slate-100 dark:border-white/5 hover:border-indigo-500 transition-all cursor-pointer shadow-sm active:scale-[0.98] relative overflow-hidden">
                                   <div className="flex items-start justify-between mb-4 relative z-10">
                                      <div className="flex items-center gap-2">
                                         <span className="px-3 py-1 bg-indigo-600 text-white rounded-full text-[9px] font-black tracking-widest uppercase">{slo.code}</span>
                                         <span className="text-[8px] font-bold uppercase text-slate-400 bg-slate-50 dark:bg-white/10 px-2 py-1 rounded-md">{slo.bloom}</span>
                                      </div>
                                      {copiedCode === slo.code ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-all" />}
                                   </div>
                                   <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 leading-relaxed group-hover:text-indigo-600 transition-colors relative z-10" dangerouslySetInnerHTML={{ __html: renderSTEM(slo.text) }} />
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
          )) : (
            <div className="flex flex-col items-center justify-center py-40 text-center space-y-8">
               <div className="relative">
                  <div className="w-20 h-20 bg-slate-100 dark:bg-white/5 rounded-[2rem] flex items-center justify-center text-slate-300"><BrainCircuit size={48} className="animate-pulse" /></div>
                  <div className="absolute -top-2 -right-2 p-2 bg-amber-500 text-white rounded-full shadow-lg"><AlertTriangle size={16}/></div>
               </div>
               <div className="space-y-2">
                 <h3 className="text-xl font-bold uppercase tracking-widest text-slate-900 dark:text-white">Neural Handshake Pending</h3>
                 <p className="text-xs font-medium max-w-sm mx-auto text-slate-500 leading-relaxed">The engine is currently linearizing the raw curriculum data. If this persists, switch to Raw Mode to verify the extraction.</p>
               </div>
               <button onClick={() => setViewMode('raw')} className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl flex items-center gap-3"><BookOpen size={14}/> Read Master Ledger</button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};