
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
          className="flex items-center gap-3 p-4 bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/5 rounded-2xl text-left text-sm text-slate-600 dark:text-slate-300 hover:border-indigo-500 hover:bg-slate-50 dark:hover:bg-white/5 transition-all group shadow-sm"
        >
          <div className="p-2 bg-slate-100 dark:bg-white/5 text-slate-400 group-hover:text-indigo-500 rounded-lg transition-colors">
            {p.icon}
          </div>
          <span className="font-medium">{p.text}</span>
        </button>
      ))}
    </div>
  );
};
