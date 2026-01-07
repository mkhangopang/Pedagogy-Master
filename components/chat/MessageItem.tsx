
'use client';

import React, { useState } from 'react';
import { User, Bot, Copy, Check, Share2, ThumbsUp, ThumbsDown, MoreHorizontal } from 'lucide-react';

interface MessageItemProps {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  id: string;
  isLatest?: boolean;
}

export const MessageItem: React.FC<MessageItemProps> = ({ role, content, timestamp, id }) => {
  const isAi = role === 'assistant';
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);

  const handleCopy = async () => {
    // Clean suggestions if present
    const cleanText = content.split('[SUGGESTIONS]')[0].trim();
    await navigator.clipboard.writeText(cleanText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const parseContent = (text: string) => {
    if (!text.includes('[SUGGESTIONS]')) return { body: text, suggestions: [] };
    const [body, suggestStr] = text.split('[SUGGESTIONS]');
    const suggestions = suggestStr.split('|').map(s => s.trim()).filter(Boolean);
    return { body: body.trim(), suggestions };
  };

  const { body } = parseContent(content);

  return (
    <div className={`flex w-full group animate-chat-turn ${isAi ? 'justify-start' : 'justify-end'} mb-6`}>
      <div className={`flex gap-3 max-w-[85%] md:max-w-[75%] ${isAi ? 'flex-row' : 'flex-row-reverse'}`}>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 shadow-sm border ${
          isAi ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-100 dark:bg-white/10 border-slate-200 dark:border-white/5 text-slate-500'
        }`}>
          {isAi ? <Bot size={16} /> : <User size={16} />}
        </div>
        
        <div className={`flex flex-col ${isAi ? 'items-start' : 'items-end'}`}>
          <div className={`px-4 py-3 rounded-2xl text-[15px] leading-relaxed shadow-sm ${
            isAi 
              ? 'bg-white dark:bg-[#1a1a1a] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-white/5 rounded-tl-none' 
              : 'bg-indigo-600 text-white rounded-tr-none shadow-indigo-500/10'
          }`}>
            <div className="prose dark:prose-invert max-w-none whitespace-pre-wrap">
              {body || (isAi && <div className="flex gap-1.5 py-2"><div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" /><div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.1s]" /><div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]" /></div>)}
            </div>
          </div>
          
          <div className="flex items-center gap-3 mt-1.5 px-1">
            <span className="text-[10px] text-slate-400 font-medium">
              {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            
            {isAi && body && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={handleCopy} className="p-1 text-slate-400 hover:text-indigo-500 transition-colors">
                  {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                </button>
                <button 
                  onClick={() => setFeedback(feedback === 'up' ? null : 'up')} 
                  className={`p-1 transition-colors ${feedback === 'up' ? 'text-emerald-500' : 'text-slate-400 hover:text-emerald-500'}`}
                >
                  <ThumbsUp size={12} />
                </button>
                <button 
                  onClick={() => setFeedback(feedback === 'down' ? null : 'down')} 
                  className={`p-1 transition-colors ${feedback === 'down' ? 'text-rose-500' : 'text-slate-400 hover:text-rose-500'}`}
                >
                  <ThumbsDown size={12} />
                </button>
                <button className="p-1 text-slate-400 hover:text-indigo-500 transition-colors">
                  <Share2 size={12} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
