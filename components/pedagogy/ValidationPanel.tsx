
'use client';

import React from 'react';
import { CheckCircle, AlertCircle, XCircle, Award } from 'lucide-react';
import { LessonValidation } from '../../lib/pedagogy/pedagogy-engine';

interface ValidationPanelProps {
  validation: LessonValidation;
}

export const ValidationPanel: React.FC<ValidationPanelProps> = ({ validation }) => {
  return (
    <div className="bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/5 rounded-3xl p-6 space-y-6 shadow-2xl animate-in zoom-in-95 duration-300">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600 rounded-xl text-white shadow-lg"><Award size={20} /></div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Neural Pedagogy Scan</h3>
            <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest">Alignment Index</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-black text-indigo-600">{validation.score}%</div>
          <div className="text-[10px] font-bold text-emerald-500 uppercase">{validation.bloomLevel} Level</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-500 flex items-center gap-2">
            <CheckCircle size={12} /> Key Strengths
          </h4>
          <ul className="space-y-2">
            {validation.strengths.map((s, i) => (
              <li key={i} className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2">
                <div className="w-1 h-1 bg-emerald-500 rounded-full" /> {s}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-amber-500 flex items-center gap-2">
            <AlertCircle size={12} /> Growth Suggestions
          </h4>
          <ul className="space-y-2">
            {validation.suggestions.map((s, i) => (
              <li key={i} className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2 italic">
                {s}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {validation.missingComponents.length > 0 && (
        <div className="pt-4 border-t border-slate-100 dark:border-white/5">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-rose-500 flex items-center gap-2 mb-3">
            <XCircle size={12} /> Missing Neural Markers
          </h4>
          <div className="flex flex-wrap gap-2">
            {validation.missingComponents.map((c, i) => (
              <span key={i} className="px-2 py-1 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 rounded-lg text-[10px] font-bold">
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
