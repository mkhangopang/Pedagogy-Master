
'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { X, FileText, Copy, Share2, Search, Maximize2, Check, ExternalLink, AlignLeft, Download } from 'lucide-react';
import { Document } from '../types';
import { renderSTEM } from '../lib/math-renderer';

interface DocumentReaderProps {
  document: Document;
  onClose: () => void;
}

export const DocumentReader: React.FC<DocumentReaderProps> = ({ document: activeDoc, onClose }) => {
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [showFind, setShowFind] = useState(false);

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleCopyMarkdown = async () => {
    if (!activeDoc.extractedText) return;
    await navigator.clipboard.writeText(activeDoc.extractedText);
    setCopyFeedback("Full Document Markdown");
    setTimeout(() => setCopyFeedback(null), 2000);
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: activeDoc.name, text: `Reviewing ${activeDoc.name} on Pedagogy Master`, url });
        return;
      } catch (e) {}
    }
    await navigator.clipboard.writeText(url);
    setCopyFeedback("Link Copied");
    setTimeout(() => setCopyFeedback(null), 2000);
  };

  const renderedHtml = useMemo(() => {
    if (!activeDoc.extractedText) return '<p class="text-center opacity-50 py-20 italic">Awaiting neural sync...</p>';
    
    let text = activeDoc.extractedText;
    
    // 1. Style "Standard:" headers (Bold Indigo)
    text = text.replace(
      /\*\*Standard:\*\*/g, 
      '<strong class="text-indigo-600 dark:text-indigo-400 font-black uppercase tracking-wide block mt-6 mb-2">Standard:</strong>'
    );

    // 2. High-Fidelity SLO Cards
    // Captures diverse formats:
    // - • SLO: B-09-A-01 : Description
    // - [SLO: B - 11 - B - 21] Description
    // - SLO: B-09-A-01 Description
    
    // We use a specific regex to capture the code and description separately
    // Group 1: Code (e.g. B-09-A-01 or B - 11 - B - 21)
    // Group 2: Description
    const sloRegex = /(?:^|\n)(?:[-•*]\s*)?(?:\[\s*)?(?:SLO|LO)\s*[:\s-]\s*([A-Z0-9\s\.-]+)(?:\]|[:\s-])\s*([^\n\r]+)/gi;
    
    text = text.replace(sloRegex, (match, code, desc) => {
        const cleanCode = code.trim();
        const cleanDesc = desc.replace(/^[:\-\]]\s*/, '').trim(); // Remove leading punctuation if captured
        
        return `\n\n<div class="slo-card-container my-4 group relative pl-4 border-l-4 border-indigo-500 bg-slate-50 dark:bg-white/5 rounded-r-xl p-4 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all cursor-pointer slo-interactive-pill" data-slo="${cleanCode}">
          <div class="flex flex-col sm:flex-row sm:items-center gap-3">
             <span class="inline-flex items-center px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-black text-[10px] tracking-widest shadow-md shrink-0 whitespace-nowrap border border-indigo-400/50">
               SLO: ${cleanCode}
             </span>
             <span class="text-sm font-medium text-slate-700 dark:text-slate-200 leading-relaxed group-hover:text-indigo-900 dark:group-hover:text-indigo-100 transition-colors">
               ${cleanDesc}
             </span>
          </div>
          <div class="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
             <span class="p-1.5 bg-white dark:bg-black rounded-lg text-indigo-500 shadow-sm text-[9px] font-bold flex items-center gap-1 border border-indigo-100 dark:border-white/10">
               <span class="w-3 h-3"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></span> Copy Code
             </span>
          </div>
        </div>\n\n`;
    });

    return renderSTEM(text);
  }, [activeDoc.extractedText]);

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    
    // SLO Copy Logic
    const pill = target.closest('.slo-interactive-pill');
    if (pill) {
      const sloCode = pill.getAttribute('data-slo');
      if (sloCode) {
        // We only copy the Code as requested for tool generation
        navigator.clipboard.writeText(sloCode); 
        setCopyFeedback(`SLO: ${sloCode}`);
        setTimeout(() => setCopyFeedback(null), 2000);
      }
    }
  };

  const triggerFind = () => {
    setShowFind(!showFind);
    // Explicitly use window.document to avoid conflicting with the prop name 'document' (aliased to activeDoc)
    // This fixes the build error: "Property 'querySelector' does not exist on type 'Document'"
    const reader = window.document.querySelector('.reader-canvas');
    if (reader) (reader as HTMLElement).focus();
  };

  return (
    <div className="fixed inset-0 z-[500] bg-slate-50 dark:bg-[#050505] flex flex-col animate-in fade-in zoom-in-95 duration-300">
      {/* Header Bar */}
      <header className="h-16 border-b border-slate-200 dark:border-white/5 bg-white dark:bg-[#0d0d0d] flex items-center justify-between px-4 md:px-6 shrink-0 relative z-[50]">
        <div className="flex items-center gap-3 md:gap-4 overflow-hidden">
          <div className="p-2 bg-indigo-600 rounded-lg text-white shadow-lg shrink-0">
            <FileText size={18} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight truncate">{activeDoc.name}</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">
              {activeDoc.authority} • {activeDoc.subject} • Grade {activeDoc.gradeLevel}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button 
            onClick={handleCopyMarkdown} 
            className="hidden md:flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-all"
            title="Copy Full Markdown Source"
          >
            <AlignLeft size={14} /> Copy Source
          </button>
          <div className="w-px h-6 bg-slate-200 dark:bg-white/10 mx-1 hidden md:block" />
          <button onClick={onClose} className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-rose-500 rounded-xl transition-all">
            <X size={20} />
          </button>
        </div>
      </header>

      {/* Reader Body */}
      <main className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-[#080808] p-4 md:p-8 relative scroll-smooth">
        <div 
          className="max-w-4xl mx-auto bg-white dark:bg-[#0d0d0d] shadow-2xl rounded-[2rem] md:rounded-[3rem] border border-slate-200 dark:border-white/5 p-6 md:p-16 relative min-h-full"
          onClick={handleContainerClick}
        >
          {showFind && (
             <div className="sticky top-0 z-10 mb-6 -mx-2">
                <div className="bg-indigo-900 text-white p-4 rounded-xl shadow-xl flex items-center justify-between animate-in slide-in-from-top-2">
                   <span className="text-xs font-bold flex items-center gap-2"><Search size={14}/> Press Ctrl+F / Cmd+F to search this document.</span>
                   <button onClick={() => setShowFind(false)}><X size={14}/></button>
                </div>
             </div>
          )}

          <div className="prose dark:prose-invert max-w-none reader-canvas select-text"
               dangerouslySetInnerHTML={{ __html: renderedHtml }} />
          
          <div className="mt-20 pt-10 border-t border-slate-100 dark:border-white/5 flex flex-col items-center opacity-30">
             <Maximize2 size={24} className="text-slate-300 mb-2" />
             <p className="text-[9px] font-black uppercase tracking-[0.3em]">End of Active Context</p>
          </div>
        </div>
      </main>

      {/* Feedback Toast */}
      {copyFeedback && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[600] animate-in slide-in-from-top-4 fade-in duration-300 pointer-events-none">
          <div className="bg-emerald-600 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 border border-emerald-400/50">
            <div className="p-1 bg-white/20 rounded-full"><Check size={12} /></div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-widest opacity-80">Success</span>
              <span className="text-sm font-bold">{copyFeedback} Copied</span>
            </div>
          </div>
        </div>
      )}

      {/* Responsive Floating Action Bar (Glassmorphism + Mobile Fit) */}
      <div className="fixed bottom-6 left-4 right-4 md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-auto z-[550]">
        <div className="flex items-center justify-between md:justify-center gap-4 bg-slate-900/95 dark:bg-[#1a1a2e]/95 backdrop-blur-xl px-5 py-4 md:px-10 md:py-5 rounded-2xl md:rounded-[2.5rem] shadow-[0_20px_60px_rgba(0,0,0,0.5)] border border-white/10 animate-in slide-in-from-bottom-10 duration-700">
           
           <button 
             onClick={triggerFind} 
             className="flex-1 md:flex-none flex items-center justify-center gap-3 text-white/90 hover:text-indigo-400 text-[11px] font-black uppercase tracking-widest transition-all"
           >
              <Search size={16} className="text-indigo-400" /> 
              <span className="hidden sm:inline">Find SLO</span>
              <span className="sm:hidden">Find</span>
           </button>
           
           <div className="w-px h-6 bg-white/10 shrink-0" />
           
           <button 
             onClick={handleCopyMarkdown}
             className="flex-1 md:flex-none flex items-center justify-center gap-3 text-white/90 hover:text-white text-[11px] font-black uppercase tracking-widest transition-all md:hidden"
           >
              <AlignLeft size={16} className="text-slate-400" /> 
              <span>Copy</span>
           </button>

           <div className="w-px h-6 bg-white/10 shrink-0 md:hidden" />

           <button 
             onClick={handleShare}
             className="flex-1 md:flex-none flex items-center justify-center gap-3 text-white/90 hover:text-emerald-400 text-[11px] font-black uppercase tracking-widest transition-all"
           >
              <Share2 size={16} className="text-emerald-400" /> 
              <span className="hidden sm:inline">Export Node</span>
              <span className="sm:hidden">Share</span>
           </button>
        </div>
      </div>
    </div>
  );
};
