'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { X, FileText, Share2, Check, BookOpen, Fingerprint, GraduationCap, Printer, Zap, Search, Target, Focus } from 'lucide-react';
import { Document } from '../types';
import { renderSTEM } from '../lib/math-renderer';

interface DocumentReaderProps {
  document: Document;
  onClose: () => void;
}

export const DocumentReader: React.FC<DocumentReaderProps> = ({ document: activeDoc, onClose }) => {
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [focusSlo, setFocusSlo] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { e.key === 'Escape' && onClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const renderedHtml = useMemo(() => {
    if (!activeDoc.extractedText) return '<div class="py-20 text-center opacity-40 italic font-black uppercase tracking-widest text-[10px]">Neural sync active...</div>';
    
    let text = activeDoc.extractedText.split('<STRUCTURED_INDEX>')[0].trim();

    // 1. GRADE GATES
    text = text.replace(/^# GRADE\s+(.+)$/gm, (match, grade) => {
      const gNum = grade.replace(/\D/g, '');
      return `\n\n<div class="grade-gate pt-32 mt-20 border-t-8 border-indigo-600/10 text-center" id="grade-${gNum}">
        <div class="inline-flex w-24 h-24 bg-indigo-600 rounded-[2.5rem] items-center justify-center text-white shadow-3xl mb-8">
          <span class="text-4xl font-black">${gNum}</span>
        </div>
        <h1 class="text-7xl md:text-[10rem] font-black text-slate-900 dark:text-white tracking-tighter uppercase mb-20 leading-none">${grade}</h1>
      </div>`;
    });
    
    // 2. CHAPTERS
    text = text.replace(/^##\s*(.+)$/gm, '\n\n<div class="chapter-node mt-20 mb-12 bg-slate-950 text-white p-10 md:p-16 rounded-[4rem] border-2 border-white/5 relative"><h2 class="text-4xl md:text-6xl font-black tracking-tight uppercase">$1</h2></div>');
    
    // 3. HIGH-PRIORITY GRANULAR SLO RADAR TAGS
    const sloRegex = /^- \[TAG:([A-Z0-9.]+)\]\s*\|?\s*([A-Za-z]+)?\s*[:]\s*([^\n<]+)/gm;
    text = text.replace(sloRegex, (match, code, bloom, desc) => {
        const cleanCode = code.trim().toUpperCase();
        const bloomTag = bloom ? `<span class="px-3 py-1 bg-slate-100 dark:bg-white/10 rounded-full text-[8px] font-black text-slate-500 uppercase tracking-widest">${bloom}</span>` : '';
        
        return `\n<div class="slo-granular-node group bg-white dark:bg-white/5 p-8 rounded-[3rem] border border-slate-200 dark:border-white/5 hover:border-indigo-500 hover:shadow-2xl transition-all mb-6 relative overflow-hidden" data-slo="${cleanCode}">
          <div class="flex flex-col md:flex-row items-start gap-6 relative z-10">
             <div class="flex flex-col gap-2 shrink-0">
                <div class="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black text-xs tracking-[0.15em] shadow-lg flex items-center gap-2 group-hover:scale-105 transition-transform">
                   <Target size={14}/> ${cleanCode}
                </div>
                ${bloomTag}
             </div>
             <div class="flex-1">
               <p class="text-xl md:text-3xl font-bold leading-relaxed text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 transition-colors">${desc.trim()}</p>
               <div class="flex gap-4 mt-6 opacity-0 group-hover:opacity-100 transition-all">
                  <span class="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-emerald-500"><Check size={12}/> Granular Node Verified</span>
               </div>
             </div>
          </div>
        </div>`;
    });

    return renderSTEM(text);
  }, [activeDoc.extractedText]);

  return (
    <div className="fixed inset-0 z-[500] bg-white dark:bg-[#050505] flex flex-col animate-in fade-in duration-300 overflow-hidden">
      <header className="h-20 border-b dark:border-white/5 bg-white/95 dark:bg-[#0d0d0d]/95 backdrop-blur-3xl flex items-center justify-between px-8 md:px-12 shrink-0 z-50 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-xl rotate-3"><Target size={20}/></div>
          <div>
            <h2 className="text-sm md:text-lg font-black uppercase tracking-tight dark:text-white truncate">{activeDoc.name}</h2>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Granular SLO Alignment • Master MD v140.0</p>
          </div>
        </div>
        <button onClick={onClose} className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-rose-500 rounded-xl transition-all hover:scale-110"><X size={20}/></button>
      </header>

      <main className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-[#080808] p-4 md:p-8 lg:p-12">
        <div className="max-w-5xl mx-auto bg-white dark:bg-[#0d0d0d] shadow-3xl rounded-[4rem] p-8 md:p-20 lg:p-28 border border-slate-100 dark:border-white/5 min-h-full relative overflow-hidden">
          <div className="mb-24 text-center space-y-6">
             <div className="inline-flex items-center gap-2 px-6 py-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-full border border-indigo-100 dark:border-indigo-500/20">
                <Focus size={16} className="text-indigo-600" />
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600">SLO Focus Grid Active</span>
             </div>
             <p className="text-xs md:text-sm font-bold text-slate-400 uppercase tracking-[0.4em] max-w-xl mx-auto">
               Authority: ${activeDoc.authority || 'Sindh/Federal'} • Atomized Curricula
             </p>
          </div>

          <div className="prose dark:prose-invert prose-2xl max-w-none reader-canvas select-text"
               dangerouslySetInnerHTML={{ __html: renderedHtml }} />
        </div>
      </main>

      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[550] w-full max-w-xs px-4">
        <div className="flex items-center justify-around bg-slate-900/95 dark:bg-white/95 backdrop-blur-3xl px-8 py-5 rounded-full shadow-3xl border border-white/10 dark:border-slate-200">
           <button onClick={() => window.print()} className="flex flex-col items-center gap-1 text-white dark:text-slate-900 hover:opacity-70 transition-all">
              <Printer size={22} className="text-indigo-400" />
              <span className="text-[8px] font-black uppercase tracking-widest">Print Ledger</span>
           </button>
           <div className="w-px h-8 bg-white/10 dark:bg-slate-200" />
           <button onClick={() => {}} className="flex flex-col items-center gap-1 text-white dark:text-slate-900 hover:opacity-70 transition-all">
              <Zap size={22} className="text-amber-400" />
              <span className="text-[8px] font-black uppercase tracking-widest">Deep Synthesis</span>
           </button>
        </div>
      </div>
    </div>
  );
};