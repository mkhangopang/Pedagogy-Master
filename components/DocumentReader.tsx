
'use client';

import React, { useMemo } from 'react';
import { X, FileText, Download, Copy, Share2, ZoomIn, ZoomOut, Search, Maximize2 } from 'lucide-react';
import { Document } from '../types';
import { renderSTEM } from '../lib/math-renderer';

interface DocumentReaderProps {
  document: Document;
  onClose: () => void;
}

export const DocumentReader: React.FC<DocumentReaderProps> = ({ document, onClose }) => {
  const renderedHtml = useMemo(() => {
    if (!document.extractedText) return '<p class="text-center opacity-50 py-20 italic">Intelligence not yet extracted for this node.</p>';
    
    // The renderSTEM utility now handles the entire pipeline (KaTeX + SLO Highlighting + Markdown)
    // We add the SLO span highlighting via standard Markdown or post-processing if needed, 
    // but first we ensure the text itself is rendered professionally.
    
    let text = document.extractedText;
    
    // Inject SLO highlighting as Markdown-friendly spans before full render
    text = text.replace(
      /(SLO[:\s]*[A-Z0-9\.-]{3,15})/gi, 
      '<span class="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded-md font-bold">$1</span>'
    );
    
    return renderSTEM(text);
  }, [document.extractedText]);

  const handleCopy = () => {
    if (document.extractedText) {
      navigator.clipboard.writeText(document.extractedText);
      alert("Curriculum text copied to clipboard.");
    }
  };

  return (
    <div className="fixed inset-0 z-[500] bg-slate-50 dark:bg-[#050505] flex flex-col animate-in fade-in zoom-in-95 duration-300">
      {/* Reader Header */}
      <header className="h-16 border-b border-slate-200 dark:border-white/5 bg-white dark:bg-[#0d0d0d] flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <div className="p-2 bg-indigo-600 rounded-lg text-white">
            <FileText size={18} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-black text-slate-900 dark:text-white truncate uppercase tracking-tight">{document.name}</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {document.authority} • {document.subject} • Grade {document.gradeLevel}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center bg-slate-100 dark:bg-white/5 rounded-xl px-1 mr-4 border border-slate-200 dark:border-white/5">
             <button className="p-2 text-slate-400 hover:text-indigo-600 transition-all"><ZoomOut size={16}/></button>
             <div className="w-px h-4 bg-slate-200 dark:bg-white/10 mx-1" />
             <button className="p-2 text-slate-400 hover:text-indigo-600 transition-all"><ZoomIn size={16}/></button>
          </div>
          <button 
            onClick={handleCopy}
            className="p-2.5 text-slate-400 hover:text-indigo-600 dark:hover:text-white transition-all rounded-xl"
            title="Copy Source"
          >
            <Copy size={20} />
          </button>
          <div className="w-px h-6 bg-slate-200 dark:bg-white/10 mx-1" />
          <button 
            onClick={onClose}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-rose-500 rounded-xl transition-all shadow-sm"
          >
            <X size={20} />
          </button>
        </div>
      </header>

      {/* Reader Body */}
      <main className="flex-1 overflow-y-auto custom-scrollbar bg-slate-100/50 dark:bg-[#050505] p-4 md:p-12 lg:p-20">
        <div className="max-w-4xl mx-auto bg-white dark:bg-[#0d0d0d] shadow-2xl rounded-[2.5rem] border border-slate-200 dark:border-white/5 p-8 md:p-16 lg:p-20 relative min-h-full">
          {/* Metadata Overlay Badge */}
          <div className="absolute top-8 right-8 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-2xl hidden lg:block">
             <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.2em]">Verified Source</span>
          </div>

          <div 
            className="prose dark:prose-invert max-w-none prose-indigo selection:bg-indigo-100 dark:selection:bg-indigo-900"
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
          
          <div className="mt-20 pt-10 border-t border-slate-100 dark:border-white/5 flex flex-col items-center justify-center text-center space-y-4 opacity-40">
             <div className="w-12 h-12 bg-slate-50 dark:bg-white/5 rounded-full flex items-center justify-center">
               <Maximize2 size={24} className="text-slate-300" />
             </div>
             <p className="text-[10px] font-black uppercase tracking-[0.3em]">End of Document</p>
          </div>
        </div>
      </main>

      {/* Floating Action Bar */}
      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-slate-900/90 dark:bg-slate-800/90 backdrop-blur-xl px-6 py-3 rounded-full shadow-2xl border border-white/10 animate-in slide-in-from-bottom-10 duration-700">
         <button className="flex items-center gap-2 text-white/70 hover:text-white text-xs font-bold transition-all">
            <Search size={14} /> Find SLO
         </button>
         <div className="w-px h-4 bg-white/10" />
         <button className="flex items-center gap-2 text-white/70 hover:text-white text-xs font-bold transition-all">
            <Share2 size={14} /> Export Node
         </button>
      </div>
    </div>
  );
};
