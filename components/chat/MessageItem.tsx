
'use client';

import React, { useState, useMemo } from 'react';
import { User, Bot, Copy, Check, Share2, ThumbsUp, ThumbsDown, Sparkles } from 'lucide-react';
import { marked } from 'marked';
import { APP_NAME } from '../../constants';

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

  const handleShare = async () => {
    const cleanText = content.split('--- Synthesis by Node:')[0].trim();
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${APP_NAME} Synthesis`,
          text: cleanText,
          url: window.location.href
        });
      } catch (err) {
        console.log('Share failed', err);
        handleCopy();
      }
    } else {
      handleCopy();
    }
  };

  const { body } = useMemo(() => {
    const parts = content.split('--- Synthesis by Node:');
    return { 
      body: parts[0].trim()
    };
  }, [content]);

  const renderedHtml = useMemo(() => {
    if (!body) return '';
    try {
      marked.setOptions({
        gfm: true,
        breaks: true,
      });

      const html = marked.parse(body) as string;
      return html
        .replace(/<table>/g, '<div class="table-container"><table>')
        .replace(/<\/table>/g, '</table></div>');
    } catch (e) {
      console.error("Markdown parse error:", e);
      return body;
    }
  }, [body]);

  return (
    <div className={`flex w-full group animate-chat-turn ${isAi ? 'justify-start' : 'justify-end'} mb-12`}>
      <div className={`flex gap-4 max-w-[95%] md:max-w-[85%] ${isAi ? 'flex-row' : 'flex-row-reverse'}`}>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-1 shadow-md border ${
          isAi ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-200 text-slate-600'
        }`}>
          {isAi ? <Bot size={18} /> : <User size={18} />}
        </div>
        
        <div className={`flex flex-col gap-4 ${isAi ? 'items-start' : 'items-end'}`}>
          <div className={`px-6 py-5 rounded-[2rem] text-[15px] leading-relaxed shadow-sm border ${
            isAi 
              ? 'bg-white dark:bg-[#1a1a1a] text-slate-800 dark:text-slate-200 border-slate-200 dark:border-white/5 rounded-tl-none' 
              : 'bg-indigo-600 border-indigo-500 text-white rounded-tr-none'
          }`}>
            <div 
              className="prose dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: renderedHtml || (isAi ? '<div class="flex gap-1.5 py-2"><div class="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></div><div class="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.1s]"></div><div class="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]"></div></div>' : '') }}
            />
          </div>
          
          {isAi && body && (
            <div className="flex flex-wrap items-center gap-4 px-2 w-full">
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleCopy}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-200 transition-all shadow-sm active:scale-95"
                >
                  {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                
                <button 
                  onClick={handleShare}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-200 transition-all shadow-sm active:scale-95"
                >
                  <Share2 size={12} />
                  Share
                </button>
              </div>

              <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 dark:bg-white/5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10">
                <Sparkles size={10} className="text-indigo-500" />
                {APP_NAME} Synthesis
              </div>

              <div className="flex items-center gap-1 ml-auto">
                <button 
                  onClick={() => setFeedback(feedback === 'up' ? null : 'up')} 
                  className={`p-2 rounded-lg transition-colors ${feedback === 'up' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500' : 'text-slate-400 hover:text-emerald-500'}`}
                >
                  <ThumbsUp size={14} />
                </button>
                <button 
                  onClick={() => setFeedback(feedback === 'down' ? null : 'down')} 
                  className={`p-2 rounded-lg transition-colors ${feedback === 'down' ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-500' : 'text-slate-400 hover:text-rose-500'}`}
                >
                  <ThumbsDown size={14} />
                </button>
                <span className="text-[10px] text-slate-400 font-bold ml-2 opacity-60">
                  {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
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
