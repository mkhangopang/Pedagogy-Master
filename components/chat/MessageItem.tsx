
'use client';

import React, { useState, useMemo } from 'react';
import { User, Bot, Copy, Check, Sparkles, Globe, ExternalLink, Library, AlertTriangle } from 'lucide-react';
import { renderSTEM } from '../../lib/math-renderer';

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
  
  const isGlitch = content.includes('Neural Glitch Guard');

  const handleCopy = async () => {
    const cleanText = content.split('--- Synthesis Node:')[0].trim();
    await navigator.clipboard.writeText(cleanText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderedHtml = useMemo(() => {
    return renderSTEM(content);
  }, [content]);

  return (
    <div className={`w-full animate-chat-turn mb-10 ${isAi ? 'bg-transparent' : ''}`}>
      <div className={`flex flex-col gap-4 mx-auto max-w-full px-4 md:px-8`}>
        
        {/* Header: Persona Label */}
        <div className={`flex items-center gap-3 ${isAi ? 'flex-row' : 'flex-row-reverse'}`}>
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-xl border-2 transition-all ${
            isAi 
              ? isGlitch ? 'bg-rose-600 border-rose-400 text-white' : 'bg-indigo-600 border-indigo-400 text-white' 
              : 'bg-indigo-950 border-indigo-700 text-white'
          }`}>
            {isAi ? isGlitch ? <AlertTriangle size={16} /> : <Bot size={16} /> : <User size={16} />}
          </div>
          <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${isGlitch ? 'text-rose-600' : 'text-slate-600 dark:text-slate-300'}`}>
            {isAi ? isGlitch ? 'System Override' : 'Pedagogy Master' : 'Educator Node'}
          </span>
          {isAi && content && !isGlitch && (
            <button onClick={handleCopy} className="p-1.5 text-slate-400 hover:text-indigo-600 transition-all">
              {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
            </button>
          )}
        </div>
        
        {/* Message Bubble */}
        <div className={`w-full ${isAi ? '' : 'flex justify-end'}`}>
          <div className={`relative transition-all duration-500 overflow-hidden ${
            isAi 
              ? isGlitch 
                ? 'w-full bg-rose-50 dark:bg-rose-950/20 border-2 border-rose-200 dark:border-rose-900/40 p-6 rounded-[2rem]' 
                : 'w-full text-slate-900 dark:text-slate-100' 
              : 'bg-indigo-700 text-white px-7 py-5 rounded-[2.5rem] rounded-tr-none shadow-2xl max-w-[95%] md:max-w-[80%] border border-white/10'
          }`}>
            
            {isAi ? (
              <div 
                className="prose dark:prose-invert max-w-full text-sm md:text-base leading-relaxed md:leading-[1.8] break-words"
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
              />
            ) : (
              <div className="text-sm md:text-[16px] font-black leading-relaxed text-white tracking-tight selection:bg-indigo-400">
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

        {/* Footer: Metadata */}
        <div className={`flex items-center gap-3 ${isAi ? 'justify-start' : 'justify-end opacity-70'}`}>
          {isAi && (
            <div className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border shadow-sm ${
              isGlitch 
                ? 'text-rose-600 bg-rose-50 border-rose-200' 
                : 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 border-indigo-100 dark:border-indigo-800/50'
            }`}>
              <Sparkles size={8} />
              {isGlitch ? 'Sanity Intercept' : metadata?.isGrounded ? 'Standard Anchored' : 'Neural Grid'}
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
