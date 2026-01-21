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

  // AI messages use a spacious layout (Claude/GPT style), User messages use a distinct bubble
  return (
    <div className={`w-full animate-chat-turn mb-10 ${isAi ? 'bg-transparent' : ''}`}>
      <div className={`flex flex-col gap-4 mx-auto max-w-full px-5 md:px-8`}>
        
        {/* Header: Identity & Actions */}
        <div className={`flex items-center gap-3 ${isAi ? 'flex-row' : 'flex-row-reverse'}`}>
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm border ${
            isAi ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-200 text-slate-600'
          }`}>
            {isAi ? <Bot size={16} /> : <User size={16} />}
          </div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
            {isAi ? 'Pedagogy Master' : 'Educator'}
          </span>
          {isAi && content && (
            <button onClick={handleCopy} className="p-1.5 text-slate-400 hover:text-indigo-600 transition-all ml-1">
              {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
            </button>
          )}
        </div>
        
        {/* Content Node */}
        <div className={`w-full ${isAi ? '' : 'flex justify-end'}`}>
          <div className={`relative ${
            isAi 
              ? 'w-full' 
              : 'bg-indigo-600 text-white px-5 py-3.5 rounded-[1.5rem] rounded-tr-none shadow-md max-w-[90%] md:max-w-[70%]'
          }`}>
            <div 
              className={`prose dark:prose-invert max-w-none text-[15px] leading-[1.75] ${isAi ? 'text-slate-800 dark:text-slate-200' : 'text-white'}`}
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />

            {isAi && metadata?.sources?.length > 0 && (
              <div className="mt-8 pt-6 border-t border-slate-100 dark:border-white/5 space-y-3">
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
        </div>

        {/* Footer: Metadata */}
        <div className={`flex items-center gap-3 px-1 ${isAi ? 'justify-start' : 'justify-end opacity-40'}`}>
          {isAi && (
            <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-md">
              <Sparkles size={8} className="text-indigo-500" />
              {metadata?.chunksUsed > 0 ? 'Curriculum Grounded' : 'Neural Synthesis'}
            </div>
          )}
          <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">
            {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </div>
  );
};