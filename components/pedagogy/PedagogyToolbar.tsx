
'use client';

import React from 'react';
import { FileCheck, Users, Target, Sparkles } from 'lucide-react';

interface PedagogyToolbarProps {
  onToolSelect: (tool: string) => void;
  activeTool?: string | null;
}

export const PedagogyToolbar: React.FC<PedagogyToolbarProps> = ({ onToolSelect, activeTool }) => {
  const tools = [
    { id: 'validate', name: 'Validation', icon: FileCheck, color: 'text-indigo-400' },
    { id: 'differentiate', name: 'Differentiate', icon: Users, color: 'text-purple-400' },
    { id: 'assessment', name: 'Quiz Gen', icon: Target, color: 'text-emerald-400' },
    { id: 'bloom', name: 'Bloom Up', icon: Sparkles, color: 'text-amber-400' },
  ];

  return (
    <div className="flex items-center gap-2 p-1.5 bg-slate-900/50 border border-white/5 rounded-2xl overflow-x-auto scrollbar-hide">
      {tools.map(tool => (
        <button
          key={tool.id}
          onClick={() => onToolSelect(tool.id)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all shrink-0 border ${
            activeTool === tool.id 
              ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' 
              : 'bg-white/5 border-transparent text-slate-400 hover:bg-white/10'
          }`}
        >
          <tool.icon size={12} className={activeTool === tool.id ? 'text-white' : tool.color} />
          {tool.name}
        </button>
      ))}
    </div>
  );
};
