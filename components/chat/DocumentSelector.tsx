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
    <div className="space-y-4 p-4 bg-white/5 rounded-3xl border border-white/5">
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <Library size={14} className="text-indigo-400" />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Neural Context</span>
        </div>
        {documents.some(d => d.isSelected) && (
          <span className="flex items-center gap-1.5 text-[8px] font-black text-emerald-500 uppercase tracking-tighter animate-pulse">
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
                ? 'bg-indigo-600/10 border-indigo-500/50 text-white shadow-lg' 
                : 'bg-white/5 border-transparent text-slate-400 hover:bg-white/10'
            }`}
          >
            {doc.isSelected && <div className="absolute inset-0 bg-indigo-500/5 animate-pulse pointer-events-none" />}
            
            {doc.isSelected ? (
              <CheckCircle size={16} className="text-indigo-400 shrink-0 relative z-10" />
            ) : (
              <Circle size={16} className="opacity-20 shrink-0 group-hover:opacity-40 transition-opacity" />
            )}
            
            <div className="flex-1 text-left min-w-0 relative z-10">
              <p className={`text-xs font-bold truncate ${doc.isSelected ? 'text-indigo-100' : ''}`}>{doc.name}</p>
              <p className="text-[9px] opacity-50 font-medium uppercase tracking-tighter">
                {doc.subject || 'Processing'} • Grade {doc.gradeLevel || '...'}
              </p>
            </div>
            <FileText size={14} className={`shrink-0 transition-opacity ${doc.isSelected ? 'opacity-40' : 'opacity-20'}`} />
          </button>
        ))}
      </div>
    </div>
  );
};