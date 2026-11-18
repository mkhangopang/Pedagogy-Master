
'use client';

import React from 'react';
import { Sparkles, BookOpen, Layers, Target } from 'lucide-react';

interface SuggestedPromptsProps {
  onSelect: (prompt: string) => void;
  type?: 'general' | 'tools';
}

export const SuggestedPrompts: React.FC<SuggestedPromptsProps> = ({ onSelect, type = 'general' }) => {
  const prompts = type === 'general' ? [
    { text: "Help me design a lesson on photosynthesis", icon: <BookOpen size={16} /> },
    { text: "What are some effective formative assessments?", icon: <Target size={16} /> },
    { text: "Explain Bloom's Taxonomy for higher education", icon: <Layers size={16} /> },
    { text: "How can I support neurodivergent learners?", icon: <Sparkles size={16} /> }
  ] : [
    { text: "Generate a 10th grade Physics lesson plan", icon: <BookOpen size={16} /> },
    { text: "Create a rubric for an argumentative essay", icon: <Layers size={16} /> },
    { text: "Extract SLOs from a reading passage", icon: <Target size={16} /> },
    { text: "Design a multiple-choice chemistry quiz", icon: <Sparkles size={16} /> }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto w-full px-4">
      {prompts.map((p, i) => (
        <button
          key={i}
          onClick={() => onSelect(p.text)}
          className="flex items-center gap-3 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-left text-sm text-slate-700 dark:text-slate-200 hover:border-indigo-500 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-all group shadow-sm"
        >
          <div className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-300 rounded-lg transition-colors">
            {p.icon}
          </div>
          <span className="font-medium">{p.text}</span>
        </button>
      ))}
    </div>
  );
};
