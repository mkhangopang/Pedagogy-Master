
'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { X, FileText, Copy, Share2, Search, Maximize2, Check, AlignLeft, BookOpen, Layers } from 'lucide-react';
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

  // Add comment above each fix
  // Fix: Implemented missing handleShare function to resolve "Cannot find name 'handleShare'" error
  const handleShare = async () => {
    const shareData = {
      title: `Pedagogy Master | ${activeDoc.name}`,
      text: `Reviewing curriculum asset: ${activeDoc.name}`,
      url: window.location.origin,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        // Silently handle share cancellation
      }
    } else {
      try {
        await navigator.clipboard.writeText(window.location.origin);
        setCopyFeedback('Link');
        setTimeout(() => setCopyFeedback(null), 2000);
      } catch (err) {
        console.error('Failed to copy link:', err);
      }
    }
  };

  const renderedHtml = useMemo(() => {
    if (!activeDoc.extractedText) return '<div class="py-20 text-center opacity-40 italic">Syncing with neural grid...</div>';
    
    let text = activeDoc.extractedText;

    // 1. Structural Styling: Grades & Domains
    // Grade headers: # GRADE IX -> Large centered block
    text = text.replace(/^# GRADE\s+(.+)$/gm, '\n\n<div class="grade-header my-12 pt-10 border-t border-slate-100 dark:border-white/5"><h1 class="text-4xl md:text-6xl font-black text-indigo-600 dark:text-indigo-400 text-center tracking-tighter uppercase mb-4">Grade $1</h1><div class="h-1 w-20 bg-indigo-600 mx-auto rounded-full"></div></div>');
    
    // Domain headers: ## DOMAIN A: ...
    text = text.replace(/^## DOMAIN\s+([A-Z]):\s+(.+)$/gm, '\n\n<div class="domain-block mt-16 mb-6"><span class="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Curriculum Domain $1</span><h2 class="text-2xl md:text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight">$2</h2></div>');

    // 2. Standard & Benchmark Emphasis
    text = text.replace(/^\*\*Standard:\*\*\s*(.+)$/gm, '<div class="bg-slate-50 dark:bg-white/5 p-5 rounded-2xl border-l-4 border-indigo-500 mb-6"><strong class="block text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-2">Institutional Standard</strong><p class="text-sm font-bold text-slate-700 dark:text-slate-200">$1</p></div>');
    text = text.replace(/^\*\*Benchmark\s+(.+):\*\*\s*(.+)$/gm, '<div class="mt-8 mb-4 pl-4 border-l-2 border-slate-200 dark:border-white/10"><span class="text-[9px] font-black uppercase text-slate-400 tracking-widest">Benchmark $1</span><h4 class="font-bold text-slate-900 dark:text-white">$2</h4></div>');

    // 3. THE BLUE PILL: Template SLO Cards
    // Supports: - SLO: P-09-A-01: Describe...
    const sloRegex = /^- SLO:\s*([A-Z0-9-]+):\s*(.+)$/gm;
    text = text.replace(sloRegex, (match, code, desc) => {
        return `\n<div class="slo-card group relative bg-white dark:bg-[#151515] p-5 rounded-2xl border border-slate-100 dark:border-white/5 shadow-sm hover:shadow-xl hover:border-indigo-500/50 transition-all cursor-pointer mb-4 slo-interactive-pill" data-slo="${code.trim()}">
          <div class="flex items-start gap-4">
             <div class="px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-black text-[10px] tracking-widest shadow-sm shrink-0">
               SLO: ${code.trim()}
             </div>
             <div class="flex-1">
               <p class="text-sm font-medium leading-relaxed text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">${desc.trim()}</p>
             </div>
             <div class="opacity-0 group-hover:opacity-100 transition-opacity p-2 bg-slate-50 dark:bg-white/5 rounded-lg text-slate-400">
               <Copy size={14} />
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
      <header className="h-16 border-b dark:border-white/5 bg-white/80 dark:bg-[#0d0d0d]/80 backdrop-blur-xl flex items-center justify-between px-6 shrink-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg"><FileText size={20}/></div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-tight dark:text-white">{activeDoc.name}</h2>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Verified Master MD • 2024 Protocol</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-rose-500 rounded-xl transition-all"><X size={20}/></button>
      </header>

      <main className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-12 lg:p-20 bg-slate-50 dark:bg-[#080808]">
        <div 
          className="max-w-4xl mx-auto bg-white dark:bg-[#0d0d0d] shadow-2xl rounded-[3rem] p-8 md:p-20 lg:p-24 border border-slate-100 dark:border-white/5 min-h-full"
          onClick={handleCopyCode}
        >
          {/* Header metadata (Visible only in reader) */}
          <div className="mb-20 text-center space-y-4 opacity-60">
             <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-full">
                <Layers size={14} className="text-indigo-600" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">Institutional Ledger</span>
             </div>
             <p className="text-xs font-medium text-slate-400 uppercase tracking-widest">Subject: {activeDoc.subject} • Board: {activeDoc.authority}</p>
          </div>

          <div className="prose dark:prose-invert max-w-none reader-canvas select-text"
               dangerouslySetInnerHTML={{ __html: renderedHtml }} />
          
          <div className="mt-40 pt-20 border-t dark:border-white/5 text-center opacity-20">
             <p className="text-[9px] font-black uppercase tracking-[0.4em]">End of Active Curriculum Node</p>
          </div>
        </div>
      </main>

      {copyFeedback && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[600] animate-in slide-in-from-top-4">
          <div className="bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 border border-white/10">
            <Check size={16} className="text-emerald-400" />
            <span className="text-[10px] font-black uppercase tracking-widest">{copyFeedback} Copied</span>
          </div>
        </div>
      )}

      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[550]">
        <div className="flex items-center gap-6 bg-slate-900/95 backdrop-blur-xl px-10 py-5 rounded-[2.5rem] shadow-3xl border border-white/10">
           <button onClick={() => window.print()} className="flex items-center gap-2 text-white/90 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all">
              <AlignLeft size={16} className="text-indigo-400" /> Print Master
           </button>
           <div className="w-px h-6 bg-white/10" />
           <button onClick={handleShare} className="flex items-center gap-2 text-white/90 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all">
              <Share2 size={16} className="text-emerald-400" /> Share Ledger
           </button>
        </div>
      </div>
    </div>
  );
};
