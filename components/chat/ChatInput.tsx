
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Plus, Loader2 } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
  placeholder?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({ 
  onSend, 
  disabled, 
  isLoading, 
  placeholder = "Ask your AI Tutor..." 
}) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || disabled || isLoading) return;
    
    onSend(input.trim());
    setInput('');
    
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  return (
    <div className="w-full bg-gradient-to-t from-slate-50 dark:from-[#0a0a0a] via-slate-50 dark:via-[#0a0a0a] to-transparent pt-10 pb-6 px-4">
      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
        <div className="relative flex items-end gap-2 bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-[28px] p-2 pl-4 shadow-2xl focus-within:border-indigo-500/50 transition-all">
          <button
            type="button"
            className="p-2 text-slate-400 hover:text-indigo-500 transition-colors mb-1"
            title="Upload attachment"
          >
            <Plus size={20} />
          </button>
          
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || isLoading}
            rows={1}
            className="flex-1 bg-transparent border-none outline-none text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 resize-none py-3 text-[15px] max-h-[160px] custom-scrollbar"
          />
          
          <button
            type="submit"
            disabled={!input.trim() || disabled || isLoading}
            className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all mb-1 mr-1 ${
              input.trim() && !isLoading 
                ? 'bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 active:scale-90' 
                : 'bg-slate-100 dark:bg-white/5 text-slate-300 dark:text-slate-600'
            }`}
          >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
        <p className="text-[10px] text-center mt-3 text-slate-400 font-medium uppercase tracking-[0.1em]">
          Powered by Pedagogy Master Multi-Provider Grid
        </p>
      </form>
    </div>
  );
};
