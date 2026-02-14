
'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { X, FileText, Copy, Share2, Check, AlignLeft, Layers, BookOpen, Fingerprint, Database, GraduationCap } from 'lucide-react';
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
    if (!activeDoc.extractedText) return '<div class="py-20 text-center opacity-40 italic">Syncing with neural grid...</div>';
    
    let text = activeDoc.extractedText;

    // 1. Grade-Level Aesthetic Chapters
    // Matches: # GRADE IX
    text = text.replace(/^# GRADE\s+(.+)$/gm, '\n\n<div class="grade-gate pt-20 mt-20 border-t-8 border-indigo-600/10"><div class="flex flex-col items-center text-center"><div class="w-16 h-16 bg-indigo-600 rounded-3xl flex items-center justify-center text-white shadow-2xl mb-6"><GraduationCap size={32}/></div><span class="text-indigo-600 font-black text-xs uppercase tracking-[0.5em] mb-4">Vertical Curriculum Node</span><h1 class="text-6xl md:text-8xl font-black text-slate-900 dark:text-white tracking-tighter uppercase mb-16">$1</h1></div></div>');
    
    // 2. Domain Block Architecture
    // Matches: ## DOMAIN A: Title
    text = text.replace(/^## DOMAIN\s+([A-Z]):\s+(.+)$/gm, '\n\n<div class="domain-wrapper mt-16 mb-8 bg-slate-50 dark:bg-white/5 p-10 rounded-[3.5rem] border border-slate-100 dark:border-white/5 shadow-sm"><div class="flex items-center gap-4 mb-2"><span class="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-500">Subject Domain</span><div class="h-px bg-indigo-500/20 flex-1"></div></div><h2 class="text-3xl md:text-5xl font-black text-slate-900 dark:text-white uppercase tracking-tight">$1: $2</h2></div>');

    // 3. Policy & Strategy Blocks
    text = text.replace(/^\*\*Standard:\*\*\s*(.+)$/gm, '<div class="bg-indigo-600/5 dark:bg-indigo-400/5 p-8 rounded-3xl border-l-4 border-indigo-600 mb-10"><strong class="block text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-2">Institutional Standard</strong><p class="text-xl font-bold text-slate-800 dark:text-slate-100 leading-snug">$1</p></div>');
    text = text.replace(/^\*\*Benchmark\s+(.+):\*\*\s*(.+)$/gm, '<div class="mt-12 mb-6 pl-6 border-l-2 border-slate-200 dark:border-white/10"><span class="text-[9px] font-black uppercase text-slate-400 tracking-widest">Benchmark $1</span><h4 class="text-2xl font-bold text-slate-900 dark:text-white mt-1">$2</h4></div>');

    // 4. Interactive SLO Identity Cards
    // Matches: - SLO: P-09-A-01: [Description]
    const sloRegex = /^- SLO:\s*([A-Z0-9-]+):\s*([^\n<]+)/gm;
    text = text.replace(sloRegex, (match, code, desc) => {
        return `\n<div class="slo-card group relative bg-white dark:bg-[#151515] p-6 rounded-[2rem] border border-slate-100 dark:border-white/5 shadow-sm hover:shadow-xl hover:border-indigo-500/50 transition-all cursor-pointer mb-5 slo-interactive-pill overflow-hidden" data-slo="${code.trim()}">
          <div class="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-10 transition-opacity"><Database size={40} /></div>
          <div class="flex items-start gap-6">
             <div class="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-black text-[12px] tracking-widest shadow-lg shadow-indigo-600/20 shrink-0 border-b-4 border-indigo-800">
               ${code.trim()}
             </div>
             <div class="flex-1 min-w-0">
               <p class="text-[16px] font-bold leading-relaxed text-slate-700 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">${desc.trim()}</p>
             </div>
             <div class="opacity-0 group-hover:opacity-100 transition-opacity p-2 bg-slate-50 dark:bg-white/5 rounded-xl text-slate-400">
               <Copy size={18} />
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
      <header className="h-20 border-b dark:border-white/5 bg-white/95 dark:bg-[#0d0d0d]/95 backdrop-blur-xl flex items-center justify-between px-10 shrink-0 z-50">
        <div className="flex items-center gap-6">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-2xl shadow-indigo-600/20"><FileText size={24}/></div>
          <div>
            <h2 className="text-base font-black uppercase tracking-tight dark:text-white leading-none mb-1">{activeDoc.name}</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.4em]">Verified Master Ledger • Vertical Sequence v2.0</p>
          </div>
        </div>
        <button onClick={onClose} className="p-3.5 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-rose-500 rounded-2xl transition-all hover:scale-105 active:scale-95"><X size={24}/></button>
      </header>

      <main className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-16 lg:p-32 bg-slate-50 dark:bg-[#080808]">
        <div 
          className="max-w-4xl mx-auto bg-white dark:bg-[#0d0d0d] shadow-2xl rounded-[6rem] p-10 md:p-24 lg:p-40 border border-slate-100 dark:border-white/5 min-h-full relative overflow-hidden"
          onClick={handleCopyCode}
        >
          <div className="absolute top-0 right-0 p-24 opacity-[0.015] -z-10"><BookOpen size={800} /></div>
          
          <div className="mb-32 text-center space-y-6">
             <div className="inline-flex items-center gap-3 px-6 py-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-full border border-indigo-100 dark:border-indigo-500/20">
                <Fingerprint size={18} className="text-indigo-600" />
                <span className="text-[11px] font-black uppercase tracking-[0.5em] text-indigo-600">Institutional Source Node</span>
             </div>
             <p className="text-sm font-bold text-slate-400 uppercase tracking-[0.3em]">Authority: {activeDoc.authority} • Subject: {activeDoc.subject} • Dialect: {activeDoc.gradeLevel}</p>
          </div>

          <div className="prose dark:prose-invert max-w-none reader-canvas select-text"
               dangerouslySetInnerHTML={{ __html: renderedHtml }} />
          
          <div className="mt-80 pt-32 border-t dark:border-white/5 text-center opacity-20">
             <p className="text-[10px] font-black uppercase tracking-[1em] mb-10">End of Active Node</p>
             <div className="flex justify-center"><Fingerprint size={64} /></div>
          </div>
        </div>
      </main>

      {copyFeedback && (
        <div className="fixed top-28 left-1/2 -translate-x-1/2 z-[600] animate-in slide-in-from-top-10">
          <div className="bg-slate-900 text-white px-10 py-5 rounded-[2rem] shadow-3xl flex items-center gap-5 border border-white/10">
            <div className="p-1.5 bg-emerald-500 rounded-full"><Check size={16} className="text-white" /></div>
            <span className="text-xs font-black uppercase tracking-[0.3em]">{copyFeedback} Captured</span>
          </div>
        </div>
      )}

      <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[550]">
        <div className="flex items-center gap-12 bg-slate-900/95 backdrop-blur-3xl px-16 py-8 rounded-[4rem] shadow-3xl border border-white/10 group hover:border-indigo-500 transition-all active:scale-95">
           <button onClick={() => window.print()} className="flex items-center gap-4 text-white/90 hover:text-white text-xs font-black uppercase tracking-[0.3em] transition-all hover:scale-110">
              <AlignLeft size={22} className="text-indigo-400" /> Print Master
           </button>
           <div className="w-px h-10 bg-white/10" />
           <button onClick={handleShare} className="flex items-center gap-4 text-white/90 hover:text-white text-xs font-black uppercase tracking-[0.3em] transition-all hover:scale-110">
              <Share2 size={22} className="text-emerald-400" /> Share Ledger
           </button>
        </div>
      </div>
    </div>
  );
};
