
'use client';

import React, { useState } from 'react';
import { Target, FileText, CheckCircle2, Loader2, Sparkles, HelpCircle, Save } from 'lucide-react';
import { Assessment, Question, AssessmentOptions } from '../../lib/pedagogy/assessment-generator';

interface AssessmentGeneratorProps {
  onGenerate: (options: AssessmentOptions) => void;
  isLoading: boolean;
  result: Assessment | null;
}

export const AssessmentGenerator: React.FC<AssessmentGeneratorProps> = ({ onGenerate, isLoading, result }) => {
  const [options, setOptions] = useState<AssessmentOptions>({
    type: 'formative',
    format: 'MCQ',
    questionCount: 5,
    bloomLevels: ['Understand', 'Apply'],
    difficulty: 'Medium'
  });

  const bloomOptions = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];

  const toggleBloom = (level: string) => {
    setOptions(prev => ({
      ...prev,
      bloomLevels: prev.bloomLevels.includes(level)
        ? prev.bloomLevels.filter(l => l !== level)
        : [...prev.bloomLevels, level]
    }));
  };

  return (
    <div className="bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/5 rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
      <div className="p-6 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-600 rounded-xl text-white shadow-lg"><Target size={20} /></div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Quiz Synthesizer</h3>
            <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest">Assessment Logic</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {!result || isLoading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Type</label>
                <select 
                  value={options.type} 
                  onChange={e => setOptions({...options, type: e.target.value as any})}
                  className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs font-bold outline-none"
                >
                  <option value="formative">Formative</option>
                  <option value="summative">Summative</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Format</label>
                <select 
                  value={options.format} 
                  onChange={e => setOptions({...options, format: e.target.value as any})}
                  className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs font-bold outline-none"
                >
                  <option value="MCQ">MCQ Only</option>
                  <option value="Short Answer">Short Answer</option>
                  <option value="Mixed">Mixed Modes</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cognitive Levels (Bloom's)</label>
              <div className="flex flex-wrap gap-2">
                {bloomOptions.map(l => (
                  <button
                    key={l}
                    onClick={() => toggleBloom(l)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${
                      options.bloomLevels.includes(l)
                        ? 'bg-emerald-600 border-emerald-500 text-white shadow-md'
                        : 'bg-white dark:bg-white/5 text-slate-400 border-slate-200 dark:border-white/10'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => onGenerate(options)}
              disabled={isLoading}
              className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold text-sm shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
              {isLoading ? 'Synthesizing Questions...' : 'Generate Neural Quiz'}
            </button>
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-bold text-slate-900 dark:text-white">{result.title}</h4>
              <button 
                onClick={() => onGenerate(options)} 
                className="p-2 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-all"
              >
                <RefreshCcw size={16} />
              </button>
            </div>

            <div className="space-y-6">
              {result.questions.map((q, idx) => (
                <div key={q.id} className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5 space-y-3">
                  <div className="flex justify-between items-start gap-4">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{idx + 1}. {q.question}</p>
                    <span className="shrink-0 px-2 py-1 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-lg text-[9px] font-black uppercase">
                      {q.bloomLevel}
                    </span>
                  </div>
                  
                  {q.options && (
                    <div className="grid grid-cols-1 gap-2 pl-4">
                      {q.options.map((opt, i) => (
                        <div key={i} className={`text-xs p-2 rounded-xl border ${
                          opt.startsWith(q.correctAnswer) || opt.includes(`) ${q.correctAnswer}`) || opt.startsWith(`${q.correctAnswer})`)
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 font-bold'
                          : 'border-slate-200 dark:border-white/10 text-slate-500'
                        }`}>
                          {opt}
                        </div>
                      ))}
                    </div>
                  )}

                  <details className="group mt-2">
                    <summary className="text-[10px] font-black uppercase tracking-widest text-indigo-400 cursor-pointer hover:text-indigo-500 flex items-center gap-1">
                      <HelpCircle size={10} /> Explanation
                    </summary>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 italic leading-relaxed pl-2 border-l-2 border-indigo-500/30">
                      {q.explanation}
                    </p>
                  </details>
                </div>
              ))}
            </div>

            <button className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all shadow-lg">
              <Save size={16} /> Export to LMS / PDF
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

import { RefreshCcw } from 'lucide-react';
