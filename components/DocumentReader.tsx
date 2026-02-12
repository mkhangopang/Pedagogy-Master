
'use client';

import React, { useMemo, useState } from 'react';
import { X, FileText, Copy, Share2, Search, Maximize2, Check, ExternalLink } from 'lucide-react';
import { Document } from '../types';
import { renderSTEM } from '../lib/math-renderer';

interface DocumentReaderProps {
  document: Document;
  onClose: () => void;
}

export const DocumentReader: React.FC<DocumentReaderProps> = ({ document, onClose }) => {
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const renderedHtml = useMemo(() => {
    if (!document.extractedText) return '<p class="text-center opacity-50 py-20 italic">Awaiting neural sync...</p>';
    
    let text = document.extractedText;
    
    // 1. Style "Standard:" exactly like the screenshot (Bold Indigo)
    text = text.replace(
      /\*\*Standard:\*\*/g, 
      '<strong class="text-indigo-600 dark:text-indigo-400 font-black uppercase tracking-wide">Standard:</strong>'
    );

    // 2. Wrap SLO identifiers in the pill/badge format
    // Enhanced Regex to catch:
    // - Bulleted: • SLO: B-09-A-01
    // - Inline: SLO: B-09-A-01
    // - Bare codes: B-09-A-01 (if strict format)
    
    // Strategy: First match the explicit "SLO: CODE" pattern to avoid false positives on random text
    const sloPillClass = "inline-flex items-center px-3 py-1 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 font-bold text-[11px] tracking-wide mx-1 cursor-pointer hover:scale-105 transition-all select-all slo-interactive-pill";
    
    // Pattern A: Explicit "SLO: ..." (Most common in our generated Markdown)
    text = text.replace(
      /(?:•\s*|(?<=\s))((?:SLO|LO)[:\s]+[A-Z0-9\.-]{3,18})/gi, 
      (match, p1) => {
        // Clean the ID for the data attribute
        const cleanId = p1.replace(/^(SLO|LO)[:\s]*/i, '').trim();
        const prefix = match.startsWith('•') ? '• ' : '';
        return `${prefix}<span class="${sloPillClass}" data-slo="${cleanId}" title="Click to Copy SLO Code">${p1}</span>`;
      }
    );

    // Pattern B: Bare Strict Codes (e.g. B-09-A-01) that weren't caught by Pattern A
    // Avoiding things already inside the span we just added
    // We use a negative lookbehind or check if we are inside a tag (simplistic check)
    // For simplicity/safety, we focus on the explicit SLO label which is enforced by our "Master MD" converter.
    
    return renderSTEM(text);
  }, [document.extractedText]);

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const pill = target.closest('.slo-interactive-pill');
    
    if (pill) {
      const sloCode = pill.getAttribute('data-slo');
      if (sloCode) {
        navigator.clipboard.writeText(sloCode);
        setCopyFeedback(sloCode);
        setTimeout(() => setCopyFeedback(null), 2000);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[500] bg-slate-50 dark:bg-[#050505] flex flex-col animate-in fade-in zoom-in-95 duration-300">
      {/* Header Bar */}
      <header className="h-16 border-b border-slate-200 dark:border-white/5 bg-white dark:bg-[#0d0d0d] flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-indigo-600 rounded-lg text-white shadow-lg">
            <FileText size={18} />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">{document.name}</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {document.authority} • {document.subject} • Grade {document.gradeLevel}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-rose-500 rounded-xl transition-all">
          <X size={20} />
        </button>
      </header>

      {/* Reader Body */}
      <main className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-[#080808] p-4 md:p-12">
        <div 
          className="max-w-4xl mx-auto bg-white dark:bg-[#0d0d0d] shadow-2xl rounded-[3rem] border border-slate-200 dark:border-white/5 p-8 md:p-16 relative min-h-full"
          onClick={handleContainerClick}
        >
          <div className="prose dark:prose-invert max-w-none reader-canvas"
               dangerouslySetInnerHTML={{ __html: renderedHtml }} />
          
          <div className="mt-20 pt-10 border-t border-slate-100 dark:border-white/5 flex flex-col items-center opacity-30">
             <Maximize2 size={24} className="text-slate-300 mb-2" />
             <p className="text-[9px] font-black uppercase tracking-[0.3em]">End of Active Context</p>
          </div>
        </div>
      </main>

      {/* Feedback Toast */}
      {copyFeedback && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[600] animate-in slide-in-from-top-4 fade-in duration-300">
          <div className="bg-emerald-600 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3">
            <div className="p-1 bg-white/20 rounded-full"><Check size={12} /></div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-widest opacity-80">Copied to Clipboard</span>
              <span className="text-sm font-bold">{copyFeedback}</span>
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Bar (User Screenshot Matching) */}
      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-6 bg-slate-900/95 dark:bg-[#1a1a2e]/95 backdrop-blur-xl px-10 py-5 rounded-[2.5rem] shadow-[0_20px_60px_rgba(0,0,0,0.5)] border border-white/10 animate-in slide-in-from-bottom-10 duration-700 z-[550]">
         <button className="flex items-center gap-3 text-white/90 hover:text-indigo-400 text-[11px] font-black uppercase tracking-widest transition-all">
            <Search size={16} className="text-indigo-400" /> Find SLO
         </button>
         <div className="w-px h-6 bg-white/10" />
         <button className="flex items-center gap-3 text-white/90 hover:text-emerald-400 text-[11px] font-black uppercase tracking-widest transition-all">
            <Share2 size={16} className="text-emerald-400" /> Export Node
         </button>
      </div>
    </div>
  );
};
