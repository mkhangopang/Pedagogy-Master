'use client';

import React from 'react';
import { FileText, CheckCircle, Circle, Library, Zap } from 'lucide-react';
import { Document } from '../../types';

interface DocumentSelectorProps {
  documents: Document[];
  onToggle: (id: string) => void;
}

export const DocumentSelector: React.FC<DocumentSelectorProps> = ({ documents, onToggle }) => {
  if (documents.length === 0) return null;

  return (
    <div className="space-y-4 p-4 bg-slate-100/80 dark:bg-slate-900/70 rounded-3xl border border-slate-200/80 dark:border-slate-800">
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <Library size={14} className="text-indigo-600 dark:text-indigo-400" />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">Neural Context</span>
        </div>
        {documents.some(d => d.isSelected) && (
          <span className="flex items-center gap-1.5 text-[8px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-tighter animate-pulse">
            <Zap size={8} fill="currentColor" /> Linked
          </span>
        )}
      </div>
      <div className="space-y-2">
        {documents.map(doc => (
          <button
            key={doc.id}
            onClick={() => onToggle(doc.id)}
            className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all border group relative overflow-hidden ${
              doc.isSelected 
                ? 'bg-indigo-50 dark:bg-indigo-600/20 border-indigo-400 dark:border-indigo-500/60 text-indigo-950 dark:text-white shadow-sm' 
                : 'bg-white dark:bg-slate-800/70 border-slate-200/70 dark:border-slate-700/60 text-slate-700 dark:text-slate-200 hover:border-indigo-300 dark:hover:border-indigo-500/40'
            }`}
          >
            {doc.isSelected ? (
              <CheckCircle size={16} className="text-indigo-600 dark:text-indigo-300 shrink-0 relative z-10" />
            ) : (
              <Circle size={16} className="text-slate-400 dark:text-slate-500 shrink-0 group-hover:text-indigo-500 transition-colors" />
            )}
            
            <div className="flex-1 text-left min-w-0 relative z-10">
              <p className={`text-xs font-bold truncate ${doc.isSelected ? 'text-indigo-950 dark:text-indigo-100' : 'text-slate-800 dark:text-slate-100'}`}>{doc.name}</p>
              <p className={`text-[10px] font-medium uppercase tracking-tight ${doc.isSelected ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400'}`}>
                {doc.subject || 'Processing'} • Grade {doc.gradeLevel || '...'}
              </p>
            </div>
            <FileText size={14} className={`shrink-0 transition-opacity ${doc.isSelected ? 'text-indigo-600 dark:text-indigo-300 opacity-75' : 'text-slate-400 dark:text-slate-500'}`} />
          </button>
        ))}
      </div>
    </div>
  );
};