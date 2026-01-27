'use client';

import React, { useState, useMemo } from 'react';
import { User, Bot, Copy, Check, Sparkles, Globe, ExternalLink } from 'lucide-react';
import { marked } from 'marked';

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
      return marked.parse(content) as string;
    } catch (e) {
      return content;
    }
  }, [content]);

  return (
    <div className={`w-full animate-chat-turn mb-6 md:mb-10 ${isAi ? 'bg-transparent' : ''}`}>
      <div className={`flex flex-col gap-3 md:gap-4 mx-auto max-w-full px-4 md:px-8`}>
        
        {/* Header: Identity & Actions */}
        <div className={`flex items-center gap-3 ${isAi ? 'flex-row' : 'flex-row-reverse'}`}>
          <div className={`w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm border ${
            isAi ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-200 border-slate-300 dark:border-slate-700 text-slate-700'
          }`}>
            {isAi ? <Bot size={14} className="md:size-4" /> : <User size={14} className="md:size-4" />}
          </div>
          <span className="text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em] text-slate-600 dark:text-slate-300">
            {isAi ? 'Pedagogy Master' : 'Educator'}
          </span>
          {isAi && content && (
            <button onClick={handleCopy} className="p-1.5 text-slate-500 hover:text-indigo-600 transition-all ml-1 hidden xs:block">
              {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
            </button>
          )}
        </div>
        
        {/* Content Node */}
        <div className={`w-full overflow-hidden ${isAi ? '' : 'flex justify-end'}`}>
          <div className={`relative break-words ${
            isAi 
              ? 'w-full text-slate-900 dark:text-slate-100' 
              : 'bg-indigo-600 text-white px-4 md:px-5 py-3 rounded-2xl rounded-tr-none shadow-lg max-w-[95%] md:max-w-[80%]'
          }`}>
            <div 
              className={`prose dark:prose-invert max-w-full text-sm md:text-[15px] font-medium leading-relaxed md:leading-[1.75] ${isAi ? '' : 'text-white'}`}
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />

            {isAi && metadata?.sources?.length > 0 && (
              <div className="mt-6 pt-6 border-t border-slate-200 dark:border-white/10 space-y-3">
                <p className="text-[10px] md:text-[11px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400 flex items-center gap-2">
                  <Globe size={10} className="text-indigo-500" /> Research Grounding
                </p>
                <div className="flex flex-wrap gap-2">
                  {metadata.sources.map((source: any, i: number) => (
                    <a 
                      key={i} 
                      href={source.uri} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-2.5 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg text-[10px] font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                    >
                      {source.title.substring(0, 25)}...
                      <ExternalLink size={10} />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer: Metadata */}
        <div className={`flex items-center gap-3 px-1 ${isAi ? 'justify-start' : 'justify-end opacity-60'}`}>
          {isAi && (
            <div className="flex items-center gap-1.5 text-[9px] md:text-[10px] font-black uppercase tracking-widest text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-md border border-indigo-100 dark:border-indigo-800/50">
              <Sparkles size={8} className="text-indigo-500" />
              {metadata?.isGrounded ? 'Curriculum Grounded' : 'Neural Synthesis'}
            </div>
          )}
          <span className="text-[9px] md:text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </div>
  );
};