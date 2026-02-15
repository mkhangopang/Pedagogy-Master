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
    if (!activeDoc.extractedText) return '<div class="py-20 text-center opacity-40 italic font-bold">Neural sync active...</div>';
    
    // Scrub the hidden JSON metadata block before rendering
    let text = activeDoc.extractedText.split('<SLO_INDEX_JSON>')[0].trim();

    // 1. GRADE GATES (Large landmark headers)
    text = text.replace(/^# GRADE\s+(.+)$/gm, '\n\n<div class="grade-gate pt-16 mt-12 border-t-8 border-indigo-600/20 text-center"><div class="inline-flex w-14 h-14 bg-indigo-600 rounded-3xl items-center justify-center text-white shadow-2xl mb-4 animate-pulse"><GraduationCap size={28}/></div><p class="text-indigo-600 font-black text-[10px] uppercase tracking-[0.4em] mb-3">Institutional Node</p><h1 class="text-5xl md:text-8xl font-black text-slate-900 dark:text-white tracking-tighter uppercase mb-12">$1</h1></div>');
    
    // 2. CHAPTER WRAPPERS (Containerized units)
    text = text.replace(/^## CHAPTER\s+(\d+):\s*(.+)$/gm, '\n\n<div class="chapter-container mt-12 mb-8 bg-indigo-50 dark:bg-indigo-950/20 p-8 md:p-12 rounded-[3rem] border-2 border-indigo-100 dark:border-indigo-500/20 shadow-xl"><div class="flex items-center gap-4 mb-2"><span class="px-4 py-1.5 bg-indigo-600 text-white rounded-full text-[10px] font-black uppercase tracking-widest">Chapter $1</span><div class="h-px bg-indigo-500/20 flex-1"></div></div><h2 class="text-3xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight uppercase">$2</h2></div>');
    
    // 3. DOMAIN FOCUS AREAS
    text = text.replace(/^### DOMAIN\s*([A-Z]):\s*(.+)$/gm, '\n\n<div class="domain-header mt-10 mb-6 px-4 flex items-center gap-4"><div class="w-10 h-10 rounded-full border-2 border-slate-200 dark:border-white/10 flex items-center justify-center font-black text-indigo-500">$1</div><h3 class="text-2xl font-bold dark:text-slate-200">$2</h3></div>');

    // 4. TOUCH-OPTIMIZED SLO CARDS
    const sloRegex = /^- SLO\s*([A-Z0-9-]+):\s*([^\n<]+)/gm;
    text = text.replace(sloRegex, (match, code, desc) => {
        return `\n<div class="slo-card group bg-white dark:bg-white/5 p-5 md:p-7 rounded-[2rem] border border-slate-100 dark:border-white/5 shadow-sm hover:border-indigo-500/50 transition-all cursor-pointer mb-4 slo-interactive-pill" data-slo="${code.trim()}">
          <div class="flex items-start gap-5">
             <div class="px-4 py-2 bg-slate-900 text-white dark:bg-white dark:text-black rounded-2xl font-black text-[10px] tracking-widest shadow-lg shrink-0">
               ${code.trim()}
             </div>
             <div class="flex-1 min-w-0">
               <p class="text-base md:text-lg font-bold leading-relaxed text-slate-700 dark:text-slate-200 group-hover:text-indigo-600 transition-colors">${desc.trim()}</p>
             </div>
          </div>
        </div>`;
    });

    return renderSTEM(text);
  }, [activeDoc.extractedText]);

  return (
    <div className="fixed inset-0 z-[500] bg-white dark:bg-[#050505] flex flex-col animate-in fade-in duration-300 print:bg-white">
      <header className="h-20 border-b dark:border-white/5 bg-white/95 dark:bg-[#0d0d0d]/95 backdrop-blur-2xl flex items-center justify-between px-6 md:px-10 shrink-0 z-50 no-print">
        <div className="flex items-center gap-5 min-w-0">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shrink-0"><FileText size={24}/></div>
          <div className="min-w-0">
            <h2 className="text-base font-black uppercase tracking-tight dark:text-white truncate mb-0.5">{activeDoc.name}</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Layout size={12}/> Master MD Vertical Node
            </p>
          </div>
        </div>
        <button onClick={onClose} className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-rose-500 rounded-2xl transition-all shrink-0 hover:scale-110 active:scale-95"><X size={24}/></button>
      </header>

      <main className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-[#080808] p-0 md:p-6 print:p-0">
        <div 
          className="max-w-5xl mx-auto bg-white dark:bg-[#0d0d0d] shadow-2xl md:rounded-[3.5rem] p-6 md:p-20 lg:p-24 border border-slate-100 dark:border-white/5 min-h-full relative overflow-hidden print:shadow-none print:border-none print:p-0"
        >
          <div className="absolute top-0 right-0 p-12 opacity-[0.01] -z-10 no-print"><BookOpen size={600} /></div>
          
          <div className="mb-20 text-center space-y-4 no-print">
             <div className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-full border border-indigo-100 dark:border-indigo-500/20">
                <Fingerprint size={16} className="text-indigo-600" />
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Verified Institutional Ledger</span>
             </div>
             <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] px-4 leading-relaxed">Authority: {activeDoc.authority} • Subject: {activeDoc.subject} • Year: 2024</p>
          </div>

          <div className="prose dark:prose-invert prose-base md:prose-lg max-w-none reader-canvas select-text"
               dangerouslySetInnerHTML={{ __html: renderedHtml }} />
          
          <div className="mt-40 pt-20 border-t-2 dark:border-white/5 text-center opacity-20 pb-40 no-print">
             <p className="text-[10px] font-black uppercase tracking-[0.6em] mb-8">End of Ingested Curriculum</p>
             <div className="flex justify-center"><Fingerprint size={48} /></div>
          </div>
        </div>
      </main>

      {/* Glassmorphism Floating Bar for Mobile */}
      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[550] w-[95%] max-w-md no-print animate-in slide-in-from-bottom-8 duration-700">
        <div className="flex items-center justify-around bg-slate-900/95 dark:bg-white/95 backdrop-blur-3xl px-8 py-5 rounded-[2.5rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.5)] border border-white/10 dark:border-slate-200">
           <button onClick={() => window.print()} className="flex items-center gap-3 text-white dark:text-slate-900 hover:opacity-70 text-xs font-black uppercase tracking-widest transition-all active:scale-95">
              <Printer size={20} className="text-indigo-400" /> Print
           </button>
           <div className="w-px h-8 bg-white/10 dark:bg-slate-200" />
           <button onClick={handleShare} className="flex items-center gap-3 text-white dark:text-slate-900 hover:opacity-70 text-xs font-black uppercase tracking-widest transition-all active:scale-95">
              <Share2 size={20} className="text-emerald-400" /> Share
           </button>
        </div>
      </div>
    </div>
  );
};