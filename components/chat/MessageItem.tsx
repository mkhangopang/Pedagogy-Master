
'use client';

import React, { useState, useMemo } from 'react';
import { User, Bot, Copy, Check, Share2, ThumbsUp, ThumbsDown, Sparkles, Globe, ExternalLink } from 'lucide-react';
import { marked } from 'marked';
import { APP_NAME } from '../../constants';

interface MessageItemProps {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  id: string;
  isLatest?: boolean;
  metadata?: any;
}

export const MessageItem: React.FC<MessageItemProps> = ({ role, content, timestamp, id, metadata }) => {
  const isAi = role === 'assistant';
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);

  const handleCopy = async () => {
    const cleanText = content.split('--- Synthesis by Node:')[0].trim();
    await navigator.clipboard.writeText(cleanText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderedHtml = useMemo(() => {
    if (!content) return '';
    try {
      marked.setOptions({ gfm: true, breaks: true });
      const html = marked.parse(content) as string;
      return html
        .replace(/<table>/g, '<div class="table-container"><table>')
        .replace(/<\/table>/g, '</table></div>');
    } catch (e) {
      return content;
    }
  }, [content]);

  return (
    <div className={`flex w-full group animate-chat-turn ${isAi ? 'justify-start' : 'justify-end'} mb-12 px-4`}>
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
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />

            {isAi && metadata?.sources?.length > 0 && (
              <div className="mt-6 pt-6 border-t border-slate-100 dark:border-white/5 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                  <Globe size={12} className="text-indigo-500" /> Research Grounding
                </p>
                <div className="flex flex-wrap gap-2">
                  {metadata.sources.map((source: any, i: number) => (
                    <a 
                      key={i} 
                      href={source.uri} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-xl text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                    >
                      {source.title.substring(0, 30)}...
                      <ExternalLink size={10} />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {isAi && content && (
            <div className="flex flex-wrap items-center gap-3 px-2 w-full">
              <button onClick={handleCopy} className="p-2 text-slate-400 hover:text-indigo-600 transition-all">
                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              </button>
              <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 dark:bg-white/5 px-2.5 py-1 rounded-lg">
                <Sparkles size={10} className="text-indigo-500" />
                {metadata?.chunksUsed > 0 ? 'Curriculum Grounded' : 'Neural Synthesis'}
              </div>
              <span className="text-[10px] text-slate-400 font-bold ml-auto opacity-60">
                {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
