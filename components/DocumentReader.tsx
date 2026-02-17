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
   * 🧠 NEURAL PATTERN ENGINE (v176)
   * Aggressive extraction of curriculum hierarchies.
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

      // 1. Hierarchy Shift Sentinels
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

      // 2. Multi-Pattern SLO Detection
      const patterns = [
        /\[(?:SLO|TAG|SL0):([A-Z0-9.-]+)\]\s*(?:\|)?\s*([A-Za-z]+)?\s*[:]\s*([^\n<]+)/i,
        /([A-Z]-\d{2}-[A-Z]-\d{2,})\s*\|\s*([A-Za-z]+)\s*[:]\s*([^\n<]+)/i,
        /SL[O0]\s+([A-Z0-9.-]+)\s*[:]\s*([^\n<]+)/i,
        /([A-Z]\d{2}[A-Z]\d{2,})\s*[:]\s*(.+)/i,
        /^(?:\d+\.|\*)\s*([A-Z]-[0-9]{2}-[A-Z]-[0-9]{2,})\s*(.+)/i
      ];

      let matched = false;
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          const rawCode = match[1].trim().toUpperCase();
          const bloom = (match[2] && match[2].length < 15 ? match[2].trim() : "Understand");
          const text = (match[3] || match[2] || "").trim();
          const cleanCode = rawCode.replace(/SLO|[:\[\]\s]/g, '');

          const parts = cleanCode.split('-');
          const gFromCode = parts[1] || currentGrade;
          const dFromCode = parts[2] || currentDomain;

          slos.push({
            code: cleanCode,
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

      // 3. Raw Bullet Fallback (Enables immediate reading of unlinearized docs)
      if (!matched && (line.startsWith('- ') || /^\d+\./.test(line)) && line.length > 25) {
        slos.push({
          code: `NODE-${i}`,
          text: line.replace(/^[-*\d.\s]+/, '').trim(),
          grade: currentGrade,
          subject: currentSubject,
          domain: currentDomain,
          bloom: "Apply"
        });
      }
    }

    const tree: HierarchicalData = {};
    slos.forEach(s => {
      const subj = s.subject || "General";
      const grd = s.grade || "Auto";
      const dom = s.domain || "A";
      if (!tree[subj]) tree[subj] = {};
      if (!tree[subj][grd]) tree[subj][grd] = {};
      if (!tree[subj][grd][dom]) tree[subj][grd][dom] = [];
      tree[subj][grd][dom].push(s);
    });

    return tree;
  }, [activeDoc.extractedText, activeDoc.gradeLevel, activeDoc.subject]);

  const hasStructuredData = Object.keys(curriculumTree).length > 0;
  const hasRawText = !!activeDoc.extractedText;

  return (
    <div className="fixed inset-0 z-[500] bg-white dark:bg-[#050505] flex flex-col animate-in fade-in duration-300 overflow-hidden text-left">
      <header className="h-20 border-b dark:border-white/5 bg-white dark:bg-[#0d0d0d] flex items-center justify-between px-6 md:px-12 shrink-0 z-50 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg"><Zap size={18}/></div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold uppercase tracking-tight dark:text-white truncate max-w-md">{activeDoc.name}</h2>
            <p className="text-[8px] font-semibold text-slate-400 uppercase tracking-widest">Surgical Radar v176 • High-Fidelity Active</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl flex gap-1">
             <button onClick={() => setViewMode('structured')} className={`p-2 rounded-lg transition-all ${viewMode === 'structured' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-400'}`} title="Structured Progression"><LayoutList size={14}/></button>
             <button onClick={() => setViewMode('raw')} className={`p-2 rounded-lg transition-all ${viewMode === 'raw' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-400'}`} title="Linear Ledger"><FileText size={14}/></button>
          </div>
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Search curriculum..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-slate-100 dark:bg-white/5 border-none rounded-full text-[10px] font-bold outline-none focus:ring-2 focus:ring-indigo-500 w-64"
            />
          </div>
          <button onClick={onClose} className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-rose-500 rounded-xl transition-all"><X size={20}/></button>
        </div>
      </header>

      {/* AUTO-PIVOT NOTIFICATION */}
      {hasRawText && !hasStructuredData && (
        <div className="bg-amber-500 text-white px-12 py-2 flex items-center justify-between animate-in slide-in-from-top duration-500">
           <div className="flex items-center gap-2">
             <Activity size={12} className="animate-pulse" />
             <span className="text-[10px] font-bold uppercase tracking-widest">Neural Mapping in Progress • Showing Immediate Linear View</span>
           </div>
           <span className="text-[9px] font-black uppercase tracking-tighter">Automatic Pivot Enabled</span>
        </div>
      )}

      <main className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-12">
        <div className="max-w-6xl mx-auto space-y-16">
          {(viewMode === 'raw' || !hasStructuredData) && hasRawText ? (
             <div className="bg-slate-50 dark:bg-[#0a0a0a] p-10 md:p-16 rounded-[3rem] border border-slate-200 dark:border-white/5 font-mono text-xs md:text-sm leading-relaxed whitespace-pre-wrap dark:text-slate-300 shadow-inner">
               <div className="flex items-center gap-2 mb-8 opacity-50"><History size={16} /><span className="text-[10px] font-black uppercase tracking-widest">Master Linear Ledger</span></div>
               {activeDoc.extractedText}
             </div>
          ) : hasStructuredData ? (
            Object.entries(curriculumTree).map(([subject, grades]) => (
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
                      {Object.entries(domains).sort().map(([domain, items]) => {
                        // Add comment above each fix
                        // Fix: Explicitly cast items to ParsedSLO[] to resolve "Property 'filter' does not exist on type 'unknown'" error on line 208
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
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-40 text-center space-y-8">
               <div className="relative">
                  <div className="w-20 h-20 bg-slate-100 dark:bg-white/5 rounded-[2rem] flex items-center justify-center text-slate-300"><BrainCircuit size={48} className="animate-pulse" /></div>
                  <div className="absolute -top-2 -right-2 p-2 bg-amber-500 text-white rounded-full shadow-lg"><AlertTriangle size={16}/></div>
               </div>
               <div className="space-y-2">
                 <h3 className="text-xl font-bold uppercase tracking-widest text-slate-900 dark:text-white">Neural Handshake Required</h3>
                 <p className="text-xs font-medium max-w-sm mx-auto text-slate-500 leading-relaxed italic">The document buffer is empty. Ensure the PDF upload has finished and the extraction phase is active.</p>
               </div>
               <button onClick={onClose} className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl flex items-center gap-3"><RefreshCcw size={14}/> Re-verify asset</button>
            </div>
          )}
        </div>
      </main>

      <footer className="h-10 border-t dark:border-white/5 bg-slate-50 dark:bg-[#0d0d0d] flex items-center justify-between px-6 md:px-12 shrink-0">
         <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Deterministic Mode: v176 Active</span>
         <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Grounded Nodes: {Object.values(curriculumTree).reduce((a, b) => a + Object.values(b).reduce((c, d) => c + Object.values(d).flat().length, 0), 0)}</span>
      </footer>
    </div>
  );
};
