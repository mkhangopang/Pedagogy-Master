
'use client';

import React, { useState } from 'react';
import { User, Bot, Copy, Check, Download, ThumbsUp, ThumbsDown, Sparkles } from 'lucide-react';

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
    const cleanText = content.split('--- Synthesis by Node:')[0].trim();
    await navigator.clipboard.writeText(cleanText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const cleanText = content.split('--- Synthesis by Node:')[0].trim();
    const blob = new Blob([cleanText], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `synthesis-${id.substring(0, 8)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseContent = (text: string) => {
    const parts = text.split('--- Synthesis by Node:');
    return { body: parts[0].trim(), provider: parts[1]?.trim() };
  };

  const { body, provider } = parseContent(content);

  return (
    <div className={`flex w-full group animate-chat-turn ${isAi ? 'justify-start' : 'justify-end'} mb-10`}>
      <div className={`flex gap-4 max-w-[90%] md:max-w-[85%] ${isAi ? 'flex-row' : 'flex-row-reverse'}`}>
        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 mt-1 shadow-md border ${
          isAi ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-100 dark:bg-white/10 border-slate-200 dark:border-white/5 text-slate-500'
        }`}>
          {isAi ? <Bot size={20} /> : <User size={20} />}
        </div>
        
        <div className={`flex flex-col gap-3 ${isAi ? 'items-start' : 'items-end'}`}>
          <div className={`px-6 py-5 rounded-[2.5rem] text-[15px] leading-relaxed shadow-sm ${
            isAi 
              ? 'bg-white dark:bg-[#1a1a1a] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-white/5 rounded-tl-none' 
              : 'bg-indigo-600 text-white rounded-tr-none shadow-indigo-500/10'
          }`}>
            <div className="prose dark:prose-invert max-w-none whitespace-pre-wrap">
              {body || (isAi && <div className="flex gap-1.5 py-2"><div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" /><div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.1s]" /><div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]" /></div>)}
            </div>
            
            {isAi && provider && (
               <div className="mt-6 pt-4 border-t border-slate-100 dark:border-white/5 flex items-center gap-2">
                  <Sparkles size={12} className="text-amber-500" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Node: {provider}</span>
               </div>
            )}
          </div>
          
          {isAi && body && (
            <div className="flex items-center gap-2 px-2">
              <button 
                onClick={handleCopy}
                className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm"
              >
                {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              
              <button 
                onClick={handleDownload}
                className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm"
              >
                <Download size={12} />
                Download
              </button>

              <div className="flex items-center gap-1 ml-4 border-l pl-4 border-slate-200 dark:border-white/10">
                <button 
                  onClick={() => setFeedback(feedback === 'up' ? null : 'up')} 
                  className={`p-1.5 rounded-lg transition-colors ${feedback === 'up' ? 'bg-emerald-50 text-emerald-500' : 'text-slate-400 hover:text-emerald-500'}`}
                >
                  <ThumbsUp size={14} />
                </button>
                <button 
                  onClick={() => setFeedback(feedback === 'down' ? null : 'down')} 
                  className={`p-1.5 rounded-lg transition-colors ${feedback === 'down' ? 'bg-rose-50 text-rose-500' : 'text-slate-400 hover:text-rose-500'}`}
                >
                  <ThumbsDown size={14} />
                </button>
              </div>

              <span className="text-[10px] text-slate-400 font-bold ml-auto opacity-60">
                {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          )}

          {!isAi && (
            <span className="text-[10px] text-slate-400 font-bold px-2">
              {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
