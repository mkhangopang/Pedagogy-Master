'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { X, FileText, Share2, Check, BookOpen, Fingerprint, GraduationCap, Printer, Layout } from 'lucide-react';
import { Document } from '../types';
import { renderSTEM } from '../lib/math-renderer';

interface DocumentReaderProps {
  document: Document;
  onClose: () => void;
}

export const DocumentReader: React.FC<DocumentReaderProps> = ({ document: activeDoc, onClose }) => {
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { e.key === 'Escape' && onClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleShare = async () => {
    const shareData = {
      title: `Curriculum Master | ${activeDoc.name}`,
      text: `Reviewing institutional asset: ${activeDoc.name}`,
      url: window.location.origin,
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch (err) {}
    } else {
      try {
        await navigator.clipboard.writeText(window.location.origin);
        setCopyFeedback('Link');
        setTimeout(() => setCopyFeedback(null), 2000);
      } catch (err) {}
    }
  };

  const renderedHtml = useMemo(() => {
    if (!activeDoc.extractedText) return '<div class="py-20 text-center opacity-40 italic font-black uppercase tracking-widest text-[10px]">Neural sync active...</div>';
    
    let text = activeDoc.extractedText.split('<STRUCTURED_INDEX>')[0].trim();

    // 1. GRADE GATES (Landmarks)
    text = text.replace(/^# GRADE\s+(.+)$/gm, '\n\n<div class="grade-gate pt-20 mt-12 border-t-8 border-indigo-600/10 text-center"><div class="inline-flex w-16 h-16 bg-indigo-600 rounded-[2rem] items-center justify-center text-white shadow-2xl mb-4 animate-pulse"><GraduationCap size={32}/></div><p class="text-indigo-600 font-black text-[10px] uppercase tracking-[0.5em] mb-4">Institutional Node</p><h1 class="text-6xl md:text-9xl font-black text-slate-900 dark:text-white tracking-tighter uppercase mb-16">$1</h1></div>');
    
    // 2. CHAPTER WRAPPERS (Full width optimization)
    text = text.replace(/^## CHAPTER\s+(\d+):\s*(.+)$/gm, '\n\n<div class="chapter-node mt-16 mb-10 bg-indigo-50 dark:bg-indigo-950/20 p-8 md:p-16 rounded-[4rem] border-2 border-indigo-100 dark:border-indigo-500/20 shadow-xl"><div class="flex items-center gap-4 mb-4"><span class="px-6 py-2 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest">Unit $1</span><div class="h-px bg-indigo-500/20 flex-1"></div></div><h2 class="text-4xl md:text-7xl font-black text-slate-900 dark:text-white tracking-tight uppercase leading-[0.9]">$2</h2></div>');
    
    // 3. DOMAIN HEADERS
    text = text.replace(/^### DOMAIN\s*([A-Z]):\s*(.+)$/gm, '\n\n<div class="domain-focus mt-12 mb-8 px-4 flex items-center gap-6"><div class="w-14 h-14 rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-black flex items-center justify-center font-black text-2xl shadow-xl">$1</div><h3 class="text-3xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight">$2</h3></div>');

    // 4. TOUCH-OPTIMIZED SLO CARDS
    const sloRegex = /^- SLO\s*([A-Z0-9-]+):\s*([^\n<]+)/gm;
    text = text.replace(sloRegex, (match, code, desc) => {
        return `\n<div class="slo-card group bg-white dark:bg-white/5 p-6 md:p-10 rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-sm hover:border-indigo-500/50 transition-all cursor-pointer mb-6 slo-interactive-pill" data-slo="${code.trim()}">
          <div class="flex items-start gap-6 md:gap-10">
             <div class="px-6 py-3 bg-slate-100 dark:bg-indigo-600/20 text-slate-900 dark:text-indigo-400 rounded-2xl font-black text-xs md:text-sm tracking-widest shadow-inner shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-all">
               ${code.trim()}
             </div>
             <div class="flex-1 min-w-0">
               <p class="text-xl md:text-3xl font-bold leading-relaxed text-slate-700 dark:text-slate-200 group-hover:text-indigo-600 transition-colors">${desc.trim()}</p>
             </div>
          </div>
        </div>`;
    });

    return renderSTEM(text);
  }, [activeDoc.extractedText]);

  return (
    <div className="fixed inset-0 z-[500] bg-white dark:bg-[#050505] flex flex-col animate-in fade-in duration-300 print:bg-white overflow-hidden">
      <header className="h-20 border-b dark:border-white/5 bg-white/95 dark:bg-[#0d0d0d]/95 backdrop-blur-3xl flex items-center justify-between px-6 md:px-12 shrink-0 z-50 no-print">
        <div className="flex items-center gap-6 min-w-0">
          <div className="w-12 h-12 bg-indigo-600 rounded-[1.2rem] flex items-center justify-center text-white shadow-2xl shrink-0 rotate-3"><FileText size={24}/></div>
          <div className="min-w-0">
            <h2 className="text-sm md:text-base font-black uppercase tracking-tight dark:text-white truncate mb-0.5">{activeDoc.name}</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Layout size={12}/> Global Master Ledger v130.0
            </p>
          </div>
        </div>
        <button onClick={onClose} className="p-3.5 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-rose-500 rounded-2xl transition-all shrink-0 hover:scale-110 active:scale-95"><X size={24}/></button>
      </header>

      <main className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-[#080808] p-0 md:p-6 lg:p-10 print:p-0">
        <div 
          className="max-w-none mx-auto bg-white dark:bg-[#0d0d0d] shadow-3xl md:rounded-[4.5rem] p-4 md:p-12 lg:p-24 border border-slate-100 dark:border-white/5 min-h-full relative overflow-hidden print:shadow-none print:border-none print:p-0"
        >
          <div className="absolute top-0 right-0 p-12 opacity-[0.01] -z-10 no-print"><BookOpen size={800} /></div>
          
          <div className="mb-24 text-center space-y-6 no-print">
             <div className="inline-flex items-center gap-3 px-6 py-2.5 bg-indigo-50 dark:bg-indigo-900/20 rounded-full border border-indigo-100 dark:border-indigo-500/20">
                <Fingerprint size={18} className="text-indigo-600" />
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Verified Curriculum Asset</span>
             </div>
             <p className="text-[11px] md:text-[14px] font-bold text-slate-400 uppercase tracking-[0.4em] px-4 leading-relaxed">
               Authority: {activeDoc.authority} • Subject: {activeDoc.subject} • Year: 2024
             </p>
          </div>

          {/* Canvas width fix: max-w-none and artifact-canvas-container */}
          <div className="prose dark:prose-invert prose-base md:prose-xl lg:prose-2xl max-w-none reader-canvas select-text w-full artifact-canvas-container"
               dangerouslySetInnerHTML={{ __html: renderedHtml }} />
          
          <div className="mt-60 pt-20 border-t-2 dark:border-white/5 text-center opacity-20 pb-40 no-print">
             <p className="text-[10px] font-black uppercase tracking-[0.8em] mb-10">End of Curriculum Ledger</p>
             <div className="flex justify-center"><Fingerprint size={64} /></div>
          </div>
        </div>
      </main>

      {/* Glassmorphism Floating Bar */}
      <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[550] w-[95%] max-w-md no-print animate-in slide-in-from-bottom-12 duration-700">
        <div className="flex items-center justify-around bg-slate-900/95 dark:bg-white/95 backdrop-blur-3xl px-10 py-6 rounded-[3rem] shadow-[0_32px_80px_-16px_rgba(0,0,0,0.5)] border border-white/10 dark:border-slate-200">
           <button onClick={() => window.print()} className="flex items-center gap-4 text-white dark:text-slate-900 hover:opacity-70 text-xs font-black uppercase tracking-widest transition-all active:scale-95">
              <Printer size={22} className="text-indigo-400" /> Print
           </button>
           <div className="w-px h-10 bg-white/10 dark:bg-slate-200" />
           <button onClick={handleShare} className="flex items-center gap-4 text-white dark:text-slate-900 hover:opacity-70 text-xs font-black uppercase tracking-widest transition-all active:scale-95">
              <Share2 size={22} className="text-emerald-400" /> Share
           </button>
        </div>
      </div>
    </div>
  );
};