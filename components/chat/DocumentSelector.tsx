
'use client';

import React from 'react';
import { FileText, CheckCircle, Circle, Library } from 'lucide-react';
import { Document } from '../../types';

interface DocumentSelectorProps {
  documents: Document[];
  onToggle: (id: string) => void;
}

export const DocumentSelector: React.FC<DocumentSelectorProps> = ({ documents, onToggle }) => {
  if (documents.length === 0) return null;

  return (
    <div className="space-y-3 p-4 bg-white/5 rounded-2xl border border-white/5">
      <div className="flex items-center gap-2 mb-2">
        <Library size={14} className="text-indigo-400" />
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Curriculum Context</span>
      </div>
      <div className="space-y-1.5">
        {documents.map(doc => (
          <button
            key={doc.id}
            onClick={() => onToggle(doc.id)}
            className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-all border ${
              doc.isSelected 
                ? 'bg-indigo-600/20 border-indigo-500/50 text-white shadow-lg shadow-indigo-500/10' 
                : 'bg-white/5 border-transparent text-slate-400 hover:bg-white/10'
            }`}
          >
            {doc.isSelected ? <CheckCircle size={14} className="text-indigo-400" /> : <Circle size={14} className="opacity-20" />}
            <div className="flex-1 text-left min-w-0">
              <p className="text-xs font-bold truncate">{doc.name}</p>
              <p className="text-[10px] opacity-50 font-medium">{doc.subject} • Grade {doc.gradeLevel}</p>
            </div>
            <FileText size={12} className="opacity-30" />
          </button>
        ))}
      </div>
    </div>
  );
};
