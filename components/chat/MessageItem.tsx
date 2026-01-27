'use client';

import React, { useState, useMemo } from 'react';
import { User, Bot, Copy, Check, Sparkles, Globe, ExternalLink, Library } from 'lucide-react';
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
    const cleanText = content.split('--- Synthesis Node:')[0].trim();
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
          <div className={`w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center shrink-0 shadow-md border-2 ${
            isAi ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-300 border-slate-400 dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-white'
          }`}>
            {isAi ? <Bot size={14} className="md:size-4" /> : <User size={14} className="md:size-4" />}
          </div>
          <span className="text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em] text-slate-800 dark:text-slate-200">
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
              : 'bg-indigo-600 text-white px-5 md:px-7 py-4 rounded-[2rem] rounded-tr-none shadow-2xl max-w-[95%] md:max-w-[85%]'
          }`}>
            <div 
              className={`prose dark:prose-invert max-w-full text-sm md:text-[16px] font-semibold leading-relaxed md:leading-[1.8] ${isAi ? '' : 'text-white'}`}
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />

            {isAi && metadata?.sources?.length > 0 && (
              <div className="mt-8 pt-8 border-t border-slate-200 dark:border-white/10 space-y-4">
                <p className="text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em] text-indigo-700 dark:text-indigo-300 flex items-center gap-2">
                  <Globe size={12} className="text-indigo-500" /> Grounded Teacher Pack
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {metadata.sources.map((source: any, i: number) => (
                    <a 
                      key={i} 
                      href={source.uri} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="group flex flex-col p-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl transition-all hover:bg-indigo-600 hover:border-indigo-500 shadow-sm"
                    >
                      <span className="text-[10px] font-black text-slate-900 dark:text-white group-hover:text-white line-clamp-1 mb-1">{source.title}</span>
                      <div className="flex items-center justify-between">
                         <span className="text-[8px] font-bold text-slate-400 group-hover:text-indigo-100 truncate max-w-[80%]">{source.uri}</span>
                         <ExternalLink size={10} className="text-slate-400 group-hover:text-white" />
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer: Metadata */}
        <div className={`flex items-center gap-3 px-1 ${isAi ? 'justify-start' : 'justify-end'}`}>
          {isAi && (
            <div className="flex items-center gap-1.5 text-[9px] md:text-[10px] font-black uppercase tracking-widest text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/40 px-3 py-1 rounded-full border border-indigo-200 dark:border-indigo-800/50 shadow-sm">
              <Sparkles size={8} className="text-indigo-500" />
              {metadata?.isGrounded ? 'Vault Anchored' : 'Neural Mode'}
              {metadata?.gradeIsolation && <span className="ml-2 px-1.5 bg-indigo-600 text-white rounded-[4px] text-[7px] tracking-tight">Grade {metadata.gradeIsolation} Lock</span>}
            </div>
          )}
          <span className="text-[9px] md:text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest opacity-80">
            {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </div>
  );
};