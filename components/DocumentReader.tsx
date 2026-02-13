
'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { X, FileText, Copy, Share2, Search, Maximize2, Check, ExternalLink, AlignLeft, Download, BookOpen, Layers } from 'lucide-react';
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
    
    // 1. AGGRESSIVE PRE-CLEANING (The "De-Mingle" Phase)
    // We normalize spaces and force newlines before any patterns that look like headers or SLOs.
    let text = activeDoc.extractedText
      .replace(/\u00A0/g, ' ') // Replace non-breaking spaces
      .replace(/\r\n/g, '\n'); // Normalize line endings

    // FORCE BREAK: If a line contains text followed by [SLO:..., break it.
    // Example: "...end of sentence [SLO:..." -> "...end of sentence\n\n[SLO:..."
    // We use a lookbehind-like approach via capturing groups
    text = text.replace(/([^\n>])\s*(\[\s*SL[O0][^\]]*\])/gi, '$1\n\n$2');
    
    // Also break for Standard: and Benchmark:
    text = text.replace(/([^\n>])\s*(\*\*Standard)/gi, '$1\n\n$2');
    text = text.replace(/([^\n>])\s*(Benchmark\s*\d*:)/gi, '$1\n\n$2');
    
    // 2. Style Structural Headers
    const structuralHeaders = [
      'Major Concepts', 'Learning Outcomes', 'Assessment', 'Guidelines', 
      'Chapter', 'Unit', 'Section', 'Domain', 'Standard', 'Benchmark'
    ];
    
    structuralHeaders.forEach(header => {
      // Ensure headers are on their own lines before processing
      const regex = new RegExp(`(^|\\n)(${header}\\s*\\d*[:.]?)`, 'gi');
      text = text.replace(regex, '\n\n<h3 class="text-lg font-black text-slate-800 dark:text-slate-200 mt-8 mb-4 uppercase tracking-wide border-b border-slate-100 dark:border-white/5 pb-2">$2</h3>');
    });

    text = text.replace(
      /\*\*Standard:\*\*/g, 
      '<strong class="text-indigo-600 dark:text-indigo-400 font-black uppercase tracking-wide block mt-8 mb-2">Standard:</strong>'
    );

    // 3. High-Fidelity SLO Cards (The Blue Pill)
    // Regex Logic:
    // - Matches start of line (due to pre-cleaning step 1)
    // - Captures the full tag: [SLO: B - 09 - A - 01]
    // - Handles spaces inside the tag extensively
    // - Captures the description: Everything after until the next newline
    const sloRegex = /(?:^|\n)\s*(\[\s*SL[O0]\s*[:\-]\s*[^\]]+\])\s*([^\n]+)/gi;
    
    text = text.replace(sloRegex, (match, fullTag, desc) => {
        // Extract the code from inside the brackets
        let innerCode = fullTag.replace(/^\[\s*SL[O0]\s*[:\-]\s*|\]$/gi, '').trim();
        
        // Clean up spaces: "B - 09" -> "B-09"
        // We carefully remove spaces around hyphens specifically, or just remove all spaces if it's a code
        const cleanCode = innerCode.replace(/\s+/g, '').replace(/–/g, '-');
        
        const cleanDesc = desc.trim();
        
        return `\n\n<div class="slo-card-container my-4 group relative pl-0 sm:pl-4 sm:border-l-4 sm:border-indigo-500 bg-white dark:bg-[#1a1a1a] rounded-xl shadow-sm border border-slate-100 dark:border-white/5 p-4 hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 transition-all cursor-pointer slo-interactive-pill" data-slo="${cleanCode}">
          <div class="flex flex-col gap-2">
             <div class="flex items-start justify-between">
                <span class="inline-flex items-center px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-black text-[11px] tracking-widest shadow-sm shrink-0 whitespace-nowrap">
                  SLO: ${cleanCode}
                </span>
                <span class="opacity-0 group-hover:opacity-100 transition-opacity text-[9px] font-bold text-slate-400 flex items-center gap-1 bg-slate-50 dark:bg-white/10 px-2 py-1 rounded">
                  <Copy size={10} /> Copy ID
                </span>
             </div>
             <span class="text-sm font-medium text-slate-700 dark:text-slate-300 leading-relaxed group-hover:text-indigo-900 dark:group-hover:text-indigo-100 transition-colors">
               ${cleanDesc}
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
        navigator.clipboard.writeText(sloCode); 
        setCopyFeedback(`${sloCode}`);
        setTimeout(() => setCopyFeedback(null), 2000);
      }
    }
  };

  const triggerFind = () => {
    setShowFind(!showFind);
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

      {/* Responsive Floating Action Bar */}
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
