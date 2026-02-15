'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { X, FileText, Share2, Check, BookOpen, Fingerprint, GraduationCap, Printer, AlignLeft } from 'lucide-react';
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
    if (!activeDoc.extractedText) return '<div class="py-20 text-center opacity-40 italic font-bold uppercase tracking-widest text-[10px]">Initializing neural sync...</div>';
    
    let text = activeDoc.extractedText;

    // 1. Grade-Level Aesthetic Chapters (Mobile Optimized)
    text = text.replace(/^# GRADE\s+(.+)$/gm, '\n\n<div class="grade-gate pt-12 mt-12 border-t-4 border-indigo-600/10 text-center"><div class="inline-flex w-12 h-12 bg-indigo-600 rounded-2xl items-center justify-center text-white shadow-xl mb-4"><GraduationCap size={24}/></div><p class="text-indigo-600 font-black text-[10px] uppercase tracking-[0.3em] mb-2">Vertical Node</p><h1 class="text-4xl md:text-6xl font-black text-slate-900 dark:text-white tracking-tighter uppercase mb-10">$1</h1></div>');
    
    // 2. Chapter / Domain Block Architecture
    text = text.replace(/^## CHAPTER\s+(\d+):\s*(.+)$/gm, '\n\n<div class="chapter-wrapper mt-10 mb-6 bg-indigo-50 dark:bg-indigo-950/20 p-6 md:p-8 rounded-[2rem] border border-indigo-100 dark:border-indigo-500/20"><div class="flex items-center gap-3 mb-1"><span class="text-[9px] font-black uppercase tracking-widest text-indigo-500">Chapter $1</span><div class="h-px bg-indigo-500/10 flex-1"></div></div><h2 class="text-2xl md:text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight">$2</h2></div>');
    
    text = text.replace(/^### DOMAIN\s*([A-Z]):\s*(.+)$/gm, '\n\n<div class="domain-header mt-8 mb-4 px-2 flex items-center gap-3"><span class="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">DOMAIN $1</span><div class="h-px bg-slate-200 dark:bg-white/5 flex-1"></div></div><h3 class="text-xl font-bold dark:text-slate-200 mb-6 px-2">$2</h3>');

    // 3. Compact SLO Identity Cards (Vertical Sindh/Master Format)
    const sloRegex = /^- SLO\s*([A-Z0-9-]+):\s*([^\n<]+)/gm;
    text = text.replace(sloRegex, (match, code, desc) => {
        return `\n<div class="slo-card group relative bg-white dark:bg-white/5 p-4 md:p-5 rounded-2xl border border-slate-100 dark:border-white/5 shadow-sm hover:border-indigo-500/40 transition-all cursor-pointer mb-3 slo-interactive-pill overflow-hidden" data-slo="${code.trim()}">
          <div class="flex items-start gap-4">
             <div class="px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-black text-[9px] tracking-widest shadow-md shrink-0">
               ${code.trim()}
             </div>
             <div class="flex-1 min-w-0">
               <p class="text-sm font-bold leading-relaxed text-slate-700 dark:text-slate-200 group-hover:text-indigo-600 transition-colors">${desc.trim()}</p>
             </div>
          </div>
        </div>`;
    });

    return renderSTEM(text);
  }, [activeDoc.extractedText]);

  const handleCopyCode = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const pill = target.closest('.slo-interactive-pill');
    if (pill) {
      const code = pill.getAttribute('data-slo');
      if (code) {
        navigator.clipboard.writeText(code);
        setCopyFeedback(code);
        setTimeout(() => setCopyFeedback(null), 2000);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[500] bg-white dark:bg-[#050505] flex flex-col animate-in fade-in duration-300">
      <header className="h-16 border-b dark:border-white/5 bg-white/95 dark:bg-[#0d0d0d]/95 backdrop-blur-xl flex items-center justify-between px-6 shrink-0 z-50">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shrink-0"><FileText size={20}/></div>
          <div className="min-w-0">
            <h2 className="text-sm font-black uppercase tracking-tight dark:text-white truncate mb-0.5">{activeDoc.name}</h2>
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Master Vertical Ledger</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-rose-500 rounded-xl transition-all shrink-0"><X size={20}/></button>
      </header>

      <main className="flex-1 overflow-y-auto custom-scrollbar p-0 bg-slate-50 dark:bg-[#080808]">
        <div 
          className="max-w-4xl mx-auto bg-white dark:bg-[#0d0d0d] shadow-xl md:my-10 md:rounded-[3rem] p-6 md:p-16 lg:p-24 border border-slate-100 dark:border-white/5 min-h-full relative overflow-hidden"
          onClick={handleCopyCode}
        >
          <div className="absolute top-0 right-0 p-12 opacity-[0.01] -z-10"><BookOpen size={600} /></div>
          
          <div className="mb-12 md:mb-16 text-center space-y-4">
             <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 rounded-full border border-indigo-100 dark:border-indigo-500/20">
                <Fingerprint size={14} className="text-indigo-600" />
                <span className="text-[9px] font-black uppercase tracking-widest text-indigo-600">Institutional Master Node</span>
             </div>
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 leading-relaxed">Authority: {activeDoc.authority} • Subject: {activeDoc.subject}</p>
          </div>

          <div className="prose dark:prose-invert prose-sm md:prose-base max-w-none reader-canvas select-text"
               dangerouslySetInnerHTML={{ __html: renderedHtml }} />
          
          <div className="mt-40 pt-20 border-t dark:border-white/5 text-center opacity-20 pb-40">
             <p className="text-[9px] font-black uppercase tracking-[0.5em] mb-6">End of Vertical Curriculum Segment</p>
             <div className="flex justify-center"><Fingerprint size={32} /></div>
          </div>
        </div>
      </main>

      {copyFeedback && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[600] animate-in slide-in-from-top-4">
          <div className="bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 border border-white/10">
            <Check size={14} className="text-emerald-500" />
            <span className="text-[10px] font-black uppercase tracking-widest">{copyFeedback} Captured</span>
          </div>
        </div>
      )}

      {/* Optimized Floating Bar for Mobile */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[550] w-[90%] max-w-sm">
        <div className="flex items-center justify-around bg-slate-900/95 dark:bg-white/95 backdrop-blur-2xl px-4 py-4 rounded-[2rem] shadow-3xl border border-white/10 dark:border-slate-200">
           <button onClick={() => window.print()} className="flex items-center gap-2 text-white dark:text-slate-900 hover:opacity-80 text-[10px] font-black uppercase tracking-widest transition-all">
              <Printer size={18} className="text-indigo-400" /> Print
           </button>
           <div className="w-px h-6 bg-white/10 dark:bg-slate-200" />
           <button onClick={handleShare} className="flex items-center gap-2 text-white dark:text-slate-900 hover:opacity-80 text-[10px] font-black uppercase tracking-widest transition-all">
              <Share2 size={18} className="text-emerald-400" /> Share
           </button>
        </div>
      </div>
    </div>
  );
};