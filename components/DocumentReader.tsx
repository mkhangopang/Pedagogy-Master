'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { X, FileText, Share2, Check, BookOpen, Fingerprint, GraduationCap, Printer, Layout, Zap, Search } from 'lucide-react';
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

    // 1. GRADE GATES (World-Class Anchors)
    text = text.replace(/^# GRADE\s+(.+)$/gm, (match, grade) => {
      const gNum = grade.replace(/\D/g, '');
      return `\n\n<div class="grade-gate pt-32 mt-20 border-t-8 border-indigo-600/10 text-center" id="grade-${gNum}">
        <div class="inline-flex w-24 h-24 bg-indigo-600 rounded-[2.5rem] items-center justify-center text-white shadow-3xl mb-8 animate-reveal-bounce">
          <span class="text-4xl font-black">${gNum}</span>
        </div>
        <p class="text-indigo-600 font-black text-xs uppercase tracking-[0.6em] mb-4">Sequential Learning Node</p>
        <h1 class="text-7xl md:text-[10rem] font-black text-slate-900 dark:text-white tracking-tighter uppercase mb-20 leading-none">${grade}</h1>
      </div>`;
    });
    
    // 2. CHAPTER WRAPPERS (Full width optimization)
    text = text.replace(/^## CHAPTER\s+(\d+):\s*(.+)$/gm, '\n\n<div class="chapter-node mt-20 mb-12 bg-slate-950 text-white p-10 md:p-20 rounded-[4rem] border-2 border-white/5 shadow-2xl relative overflow-hidden"><div class="absolute top-0 right-0 p-10 opacity-5"><BookOpen size={200}/></div><div class="flex items-center gap-6 mb-6"><span class="px-8 py-3 bg-indigo-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest">CHAPTER $1</span><div class="h-px bg-white/10 flex-1"></div></div><h2 class="text-5xl md:text-8xl font-black tracking-tight uppercase leading-[0.85] relative z-10">$2</h2></div>');
    
    // 3. DOMAIN HEADERS
    text = text.replace(/^### DOMAIN\s*([A-Z]):\s*(.+)$/gm, '\n\n<div class="domain-focus mt-16 mb-10 px-4 flex items-center gap-8"><div class="w-16 h-16 rounded-3xl bg-indigo-600 text-white flex items-center justify-center font-black text-3xl shadow-xl shadow-indigo-600/20">$1</div><div><p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Core Domain Cluster</p><h3 class="text-4xl font-black text-slate-900 dark:text-white uppercase tracking-tight">$2</h3></div></div>');

    // 4. TOUCH-OPTIMIZED UNIVERSAL SLO CARDS (High Contrast Highlight)
    const sloRegex = /^- SLO\s*([A-Z0-9-]+):\s*([^\n<]+)/gm;
    text = text.replace(sloRegex, (match, code, desc) => {
        const cleanCode = code.trim().toUpperCase();
        return `\n<div class="slo-card group bg-white dark:bg-white/5 p-8 md:p-12 rounded-[3.5rem] border border-slate-200 dark:border-white/5 shadow-sm hover:border-indigo-500 hover:shadow-2xl transition-all cursor-pointer mb-8 relative overflow-hidden">
          <div class="absolute top-0 right-0 p-8 opacity-0 group-hover:opacity-10 transition-opacity"><Zap size={100} className="text-indigo-600" /></div>
          <div class="flex flex-col md:flex-row items-start gap-8 md:gap-12 relative z-10">
             <div class="px-8 py-4 bg-slate-900 text-white dark:bg-indigo-600 dark:text-white rounded-[1.8rem] font-black text-sm md:text-base tracking-[0.2em] shadow-xl shrink-0 group-hover:scale-105 transition-all">
               ${cleanCode}
             </div>
             <div class="flex-1 min-w-0">
               <p class="text-2xl md:text-4xl font-bold leading-[1.3] text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 transition-colors">${desc.trim()}</p>
               <div class="flex gap-4 mt-6 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0">
                  <span class="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-500"><Check size={14}/> Verified Standard</span>
                  <span class="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-indigo-400"><Search size={14}/> Neural Link Ready</span>
               </div>
             </div>
          </div>
        </div>`;
    });

    return renderSTEM(text);
  }, [activeDoc.extractedText]);

  return (
    <div className="fixed inset-0 z-[500] bg-white dark:bg-[#050505] flex flex-col animate-in fade-in duration-300 print:bg-white overflow-hidden">
      <header className="h-24 border-b dark:border-white/5 bg-white/95 dark:bg-[#0d0d0d]/95 backdrop-blur-3xl flex items-center justify-between px-6 md:px-12 shrink-0 z-50 no-print shadow-sm">
        <div className="flex items-center gap-6 min-w-0">
          <div className="w-14 h-14 bg-indigo-600 rounded-[1.5rem] flex items-center justify-center text-white shadow-2xl shrink-0 rotate-3"><GraduationCap size={28}/></div>
          <div className="min-w-0">
            <h2 className="text-base md:text-xl font-black uppercase tracking-tight dark:text-white truncate mb-0.5">{activeDoc.name}</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Zap size={12} className="text-amber-500" /> Neural Architecture v130.0 • Master MD Mode
            </p>
          </div>
        </div>
        <button onClick={onClose} className="p-4 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-rose-500 rounded-2xl transition-all shrink-0 hover:scale-110 active:scale-95"><X size={24}/></button>
      </header>

      <main className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-[#080808] p-0 md:p-6 lg:p-10 print:p-0">
        <div 
          className="max-w-6xl mx-auto bg-white dark:bg-[#0d0d0d] shadow-3xl md:rounded-[5rem] p-6 md:p-20 lg:p-32 border border-slate-100 dark:border-white/5 min-h-full relative overflow-hidden print:shadow-none print:border-none print:p-0"
        >
          <div className="absolute top-0 right-0 p-12 opacity-[0.01] -z-10 no-print"><BookOpen size={1000} /></div>
          
          <div className="mb-32 text-center space-y-8 no-print animate-in slide-in-from-top-4 duration-1000">
             <div className="inline-flex items-center gap-3 px-8 py-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-full border-2 border-indigo-100 dark:border-indigo-500/20">
                <Fingerprint size={24} className="text-indigo-600" />
                <span className="text-xs font-black uppercase tracking-[0.3em] text-indigo-600">Institutional Master Ledger</span>
             </div>
             <p className="text-sm md:text-lg font-bold text-slate-400 uppercase tracking-[0.5em] px-4 leading-relaxed max-w-2xl mx-auto">
               Standards Authority: ${activeDoc.authority || 'Sindh/Federal'} <br /> 
               Subject: ${activeDoc.subject || 'STEM Core'}
             </p>
          </div>

          <div className="prose dark:prose-invert prose-xl md:prose-2xl lg:prose-[2.5rem] max-w-none reader-canvas select-text w-full artifact-canvas-container"
               dangerouslySetInnerHTML={{ __html: renderedHtml }} />
          
          <div className="mt-80 pt-40 border-t-4 border-dashed dark:border-white/5 text-center opacity-20 pb-60 no-print">
             <p className="text-[12px] font-black uppercase tracking-[1em] mb-12">End of Neural Artifact</p>
             <div className="flex justify-center"><Fingerprint size={80} /></div>
          </div>
        </div>
      </main>

      <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[550] w-[95%] max-w-md no-print animate-in slide-in-from-bottom-12 duration-700">
        <div className="flex items-center justify-around bg-slate-900/95 dark:bg-white/95 backdrop-blur-3xl px-12 py-8 rounded-[4rem] shadow-[0_48px_96px_-16px_rgba(0,0,0,0.6)] border border-white/10 dark:border-slate-200">
           <button onClick={() => window.print()} className="flex items-center gap-4 text-white dark:text-slate-900 hover:opacity-70 text-xs font-black uppercase tracking-widest transition-all active:scale-95">
              <Printer size={26} className="text-indigo-400" /> Print Ledger
           </button>
           <div className="w-px h-12 bg-white/10 dark:bg-slate-200" />
           <button onClick={handleShare} className="flex items-center gap-4 text-white dark:text-slate-900 hover:opacity-70 text-xs font-black uppercase tracking-widest transition-all active:scale-95">
              <Share2 size={26} className="text-emerald-400" /> {copyFeedback ? 'Link Ready' : 'Share Asset'}
           </button>
        </div>
      </div>
    </div>
  );
};