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
    <div className={`w-full animate-chat-turn mb-8 ${isAi ? 'bg-transparent' : ''}`}>
      <div className={`flex flex-col gap-3 mx-auto max-w-full px-4 md:px-8`}>
        
        {/* Header: Persona Label */}
        <div className={`flex items-center gap-3 ${isAi ? 'flex-row' : 'flex-row-reverse'}`}>
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-lg border-2 ${
            isAi ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-900 border-slate-700 text-white'
          }`}>
            {isAi ? <Bot size={16} /> : <User size={16} />}
          </div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            {isAi ? 'Pedagogy Master' : 'Educator'}
          </span>
          {isAi && content && (
            <button onClick={handleCopy} className="p-1.5 text-slate-400 hover:text-indigo-600 transition-all">
              {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
            </button>
          )}
        </div>
        
        {/* Message Bubble */}
        <div className={`w-full ${isAi ? '' : 'flex justify-end'}`}>
          <div className={`relative ${
            isAi 
              ? 'w-full text-slate-900 dark:text-slate-100' 
              : 'bg-indigo-600 text-white px-6 py-4 rounded-[2rem] rounded-tr-none shadow-2xl max-w-[90%] md:max-w-[75%]'
          }`}>
            {/* Fix: Specifically ensuring high contrast for user message with absolute white text and no opacity */}
            {isAi ? (
              <div 
                className="prose dark:prose-invert max-w-full text-sm md:text-base leading-relaxed md:leading-[1.8]"
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
              />
            ) : (
              <div className="text-sm md:text-[15px] font-extrabold leading-relaxed text-white !opacity-100 selection:bg-indigo-400">
                {content}
              </div>
            )}

            {isAi && metadata?.sources?.length > 0 && (
              <div className="mt-8 pt-8 border-t border-slate-200 dark:border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {metadata.sources.map((source: any, i: number) => (
                  <a 
                    key={i} 
                    href={source.uri} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex flex-col p-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl transition-all hover:bg-indigo-600 group"
                  >
                    <span className="text-[10px] font-black text-slate-900 dark:text-white group-hover:text-white line-clamp-1 mb-1 uppercase tracking-tight">{source.title}</span>
                    <div className="flex items-center justify-between">
                       <span className="text-[8px] font-bold text-slate-400 group-hover:text-indigo-100 truncate max-w-[85%]">{source.uri}</span>
                       <ExternalLink size={10} className="text-slate-400 group-hover:text-white" />
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer: Contextual Metadata */}
        <div className={`flex items-center gap-3 ${isAi ? 'justify-start' : 'justify-end opacity-60'}`}>
          {isAi && (
            <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1 rounded-full border border-indigo-100 dark:border-indigo-800/50 shadow-sm">
              <Sparkles size={8} />
              {metadata?.isGrounded ? 'Standard Validated' : 'Neural Mode'}
              {metadata?.imageUrl && <span className="ml-2 flex items-center gap-1"><Library size={8}/> Visual Aid</span>}
            </div>
          )}
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
            {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </div>
  );
};