
'use client';

import React, { useState } from 'react';
import { Users, ChevronRight, Check, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { DifferentiatedLesson } from '../../lib/pedagogy/differentiation';

interface DifferentiationPanelProps {
  onGenerate: (level: 'below' | 'at' | 'above') => void;
  isLoading: boolean;
  results: Record<string, DifferentiatedLesson | null>;
}

export const DifferentiationPanel: React.FC<DifferentiationPanelProps> = ({ onGenerate, isLoading, results }) => {
  const [activeTab, setActiveTab] = useState<'below' | 'at' | 'above'>('at');

  const levels = [
    { id: 'below', label: 'Support Needed', color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { id: 'at', label: 'At Grade Level', color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { id: 'above', label: 'Advanced / Extension', color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
  ];

  const currentResult = results[activeTab];

  return (
    <div className="bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/5 rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
      <div className="p-6 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-600 rounded-xl text-white shadow-lg"><Users size={20} /></div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Tiered Differentiation</h3>
            <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest">3-Level Synthesis</p>
          </div>
        </div>
      </div>

      <div className="flex p-2 bg-slate-50 dark:bg-black/20 m-4 rounded-2xl gap-1">
        {levels.map(l => (
          <button
            key={l.id}
            onClick={() => setActiveTab(l.id as any)}
            className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${
              activeTab === l.id 
                ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm' 
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            {l.id}
          </button>
        ))}
      </div>

      <div className="p-6 pt-2 min-h-[300px]">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Loader2 className="animate-spin text-indigo-500 mb-4" size={32} />
            <p className="text-sm font-bold text-slate-500">Synthesizing Tier: {activeTab.toUpperCase()}</p>
          </div>
        ) : currentResult ? (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="space-y-2">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Objective</h4>
              <p className="text-sm text-slate-700 dark:text-slate-300 italic">{currentResult.objective}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Materials</h4>
                <ul className="space-y-1">
                  {currentResult.materials.map((m, i) => (
                    <li key={i} className="text-xs text-slate-500 dark:text-slate-400 flex items-start gap-2">
                      <div className="w-1 h-1 bg-emerald-500 rounded-full mt-1.5 shrink-0" /> {m}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="space-y-2">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-amber-500">Supports</h4>
                <ul className="space-y-1">
                  {currentResult.supports.map((s, i) => (
                    <li key={i} className="text-xs text-slate-500 dark:text-slate-400 flex items-start gap-2">
                      <div className="w-1 h-1 bg-amber-500 rounded-full mt-1.5 shrink-0" /> {s}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="space-y-2 pt-4 border-t border-slate-100 dark:border-white/5">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Core Activities</h4>
              <ul className="space-y-2">
                {currentResult.activities.map((a, i) => (
                  <li key={i} className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-white/5 p-2 rounded-lg">
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="p-4 bg-purple-50 dark:bg-purple-900/10 rounded-full text-purple-600 mb-4"><Sparkles size={24} /></div>
            <p className="text-sm font-bold text-slate-900 dark:text-white mb-2">Ready for Tiered Adaptation</p>
            <p className="text-xs text-slate-500 max-w-[200px] mb-6">Select a tier and generate a specialized version based on the current lesson.</p>
            <button
              onClick={() => onGenerate(activeTab)}
              className="px-6 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl shadow-lg hover:bg-indigo-700 transition-all active:scale-95"
            >
              Generate {activeTab.toUpperCase()} Tier
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
