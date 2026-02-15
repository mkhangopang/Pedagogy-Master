'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { X, FileText, Share2, Check, BookOpen, Fingerprint, GraduationCap, Printer, Layout, Table as TableIcon } from 'lucide-react';
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
    if (!activeDoc.extractedText) return '<div class="py-20 text-center opacity-40 italic font-bold uppercase tracking-widest text-[10px]">Neural sync in progress...</div>';
    
    // Scrub debug report before rendering
    let text = activeDoc.extractedText.split('<DEBUG_REPORT>')[0].trim();

    // 1. GRADE GATES (Landmarks for long scrolls)
    text = text.replace(/^## Grade\s+(.+)$/gm, '\n\n<div class="grade-node pt-16 mt-16 border-t-4 border-indigo-600/10 text-center"><div class="inline-flex w-14 h-14 bg-indigo-600 rounded-2xl items-center justify-center text-white shadow-xl mb-4"><GraduationCap size={28}/></div><p class="text-indigo-600 font-black text-[10px] uppercase tracking-[0.4em] mb-2">Curriculum Node</p><h2 class="text-4xl md:text-7xl font-black text-slate-900 dark:text-white tracking-tighter uppercase mb-10">Grade $1</h2></div>');

    // 2. DOMAIN SEPARATORS (If present in text)
    text = text.replace(/^### Domain\s+([A-Z]):\s*(.+)$/gm, '\n\n<div class="domain-gate mt-12 mb-6 px-4 py-3 bg-slate-50 dark:bg-white/5 rounded-2xl border-l-4 border-indigo-500 flex items-center gap-4"><div class="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-black">$1</div><h3 class="text-xl font-bold dark:text-slate-200 uppercase tracking-tight">$2</h3></div>');

    // 3. TABLE WRAPPING (Fixes "squished" mobile view)
    // The actual table rendering is handled by Marked/renderSTEM, but we inject a wrapper here if needed.
    // However, the globals.css already has artifact-canvas-container table styles.
    // We just ensure the Markdown tables are surrounded by a scroll-safe div.

    return renderSTEM(text);
  }, [activeDoc.extractedText]);

  const handleCopyCode = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // Special handling for SLO codes inside tables
    if (target.tagName === 'TD' || target.tagName === 'B' || target.tagName === 'SPAN') {
      const text = target.innerText.trim();
      if (/^[A-Z]\d{2}[A-Z]-\d{2}$/.test(text) || /^[A-Z]\d{2}[A-Z]\d{2}$/.test(text)) {
        navigator.clipboard.writeText(text);
        setCopyFeedback(text);
        setTimeout(() => setCopyFeedback(null), 2000);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[500] bg-white dark:bg-[#050505] flex flex-col animate-in fade-in duration-300 print:bg-white overflow-hidden">
      <header className="h-16 md:h-20 border-b dark:border-white/5 bg-white/95 dark:bg-[#0d0d0d]/95 backdrop-blur-2xl flex items-center justify-between px-4 md:px-8 shrink-0 z-50 no-print">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-10 h-10 md:w-12 md:h-12 bg-indigo-600 rounded-xl md:rounded-2xl flex items-center justify-center text-white shadow-lg shrink-0"><FileText size={20}/></div>
          <div className="min-w-0">
            <h2 className="text-xs md:text-sm font-black uppercase tracking-tight dark:text-white truncate mb-0.5">{activeDoc.name}</h2>
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Layout size={10}/> v110.0 Master Ledger</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-rose-500 rounded-xl transition-all shrink-0 hover:scale-110 active:scale-95"><X size={20}/></button>
      </header>

      <main className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-[#080808] p-0 md:p-6 print:p-0">
        <div 
          className="max-w-6xl mx-auto bg-white dark:bg-[#0d0d0d] shadow-2xl md:rounded-[4rem] p-5 md:p-16 lg:p-24 border border-slate-100 dark:border-white/5 min-h-full relative overflow-hidden print:shadow-none print:border-none print:p-0"
          onClick={handleCopyCode}
        >
          <div className="absolute top-0 right-0 p-12 opacity-[0.01] -z-10 no-print"><BookOpen size={600} /></div>
          
          <div className="mb-12 md:mb-20 text-center space-y-4 no-print">
             <div className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-full border border-indigo-100 dark:border-indigo-500/20">
                <Fingerprint size={16} className="text-indigo-600" />
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Universal Ingestion Node</span>
             </div>
             <p className="text-[10px] md:text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] px-4 leading-relaxed">Authority: {activeDoc.authority} • Subject: {activeDoc.subject} • Mode: Production</p>
          </div>

          <div className="prose dark:prose-invert prose-sm md:prose-lg max-w-none reader-canvas select-text artifact-canvas-container"
               dangerouslySetInnerHTML={{ __html: renderedHtml }} />
          
          <div className="mt-40 pt-20 border-t-2 dark:border-white/5 text-center opacity-20 pb-40 no-print">
             <p className="text-[10px] font-black uppercase tracking-[0.6em] mb-8">End of Ingested Curriculum Segment</p>
             <div className="flex justify-center"><Fingerprint size={48} /></div>
          </div>
        </div>
      </main>

      {copyFeedback && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[600] animate-in slide-in-from-top-4">
          <div className="bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 border border-white/10">
            <Check size={14} className="text-emerald-500" />
            <span className="text-[10px] font-black uppercase tracking-widest">{copyFeedback} Captured</span>
          </div>
        </div>
      )}

      {/* Floating Action Glass Bar */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[550] w-[90%] max-w-sm no-print animate-in slide-in-from-bottom-8">
        <div className="flex items-center justify-around bg-slate-900/95 dark:bg-white/95 backdrop-blur-3xl px-6 py-4 rounded-[2.5rem] shadow-3xl border border-white/10 dark:border-slate-200">
           <button onClick={() => window.print()} className="flex items-center gap-2.5 text-white dark:text-slate-900 hover:opacity-70 text-[10px] font-black uppercase tracking-widest transition-all">
              <Printer size={18} className="text-indigo-400" /> Print
           </button>
           <div className="w-px h-6 bg-white/10 dark:bg-slate-200" />
           <button onClick={handleShare} className="flex items-center gap-2.5 text-white dark:text-slate-900 hover:opacity-70 text-[10px] font-black uppercase tracking-widest transition-all">
              <Share2 size={18} className="text-emerald-400" /> Share
           </button>
        </div>
      </div>
    </div>
  );
};