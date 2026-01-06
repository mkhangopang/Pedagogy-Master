
import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, FileText, Check, Copy, Loader2, FileDown, Share2, Sparkles } from 'lucide-react';
import { ChatMessage, Document, NeuralBrain, UserProfile } from '../types';
import { geminiService } from '../services/geminiService';
import { adaptiveService } from '../services/adaptiveService';

interface ChatProps {
  brain: NeuralBrain;
  documents: Document[];
  onQuery: () => void;
  canQuery: boolean;
  user: UserProfile;
}

const Chat: React.FC<ChatProps> = ({ brain, documents, onQuery, canQuery, user }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectedDoc = documents.find(d => d.id === selectedDocId);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const handleCopy = async (id: string, text: string) => {
    const cleanText = text.split('[SUGGESTIONS]')[0].trim();
    await navigator.clipboard.writeText(cleanText);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleShare = async (text: string) => {
    const cleanText = text.split('[SUGGESTIONS]')[0].trim();
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Pedagogical Resource', text: cleanText });
      } catch (err) {
        handleCopy('share', text);
      }
    } else {
      handleCopy('share', text);
    }
  };

  const handleDownload = (text: string) => {
    const cleanText = text.split('[SUGGESTIONS]')[0].trim();
    const header = `<html><head><meta charset='utf-8'></head><body style="font-family: Arial; padding: 40px;">${cleanText.replace(/\n/g, '<br>')}</body></html>`;
    const blob = new Blob([header], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PM-Resource-${Date.now()}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseContent = (content: string) => {
    if (!content.includes('[SUGGESTIONS]')) return { text: content, suggestions: [] };
    const [text, suggestionStr] = content.split('[SUGGESTIONS]');
    const suggestions = suggestionStr.split('|').map(s => s.trim()).filter(s => s.length > 0);
    return { text: text.trim(), suggestions };
  };

  const handleSend = async (overrideInput?: string) => {
    const msgContent = overrideInput || input;
    if (!msgContent.trim() || isLoading || cooldown > 0 || !canQuery) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: msgContent,
      timestamp: new Date().toISOString(),
      documentId: selectedDocId || undefined
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    const aiMessageId = crypto.randomUUID();
    setMessages(prev => [...prev, {
      id: aiMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      documentId: selectedDocId || undefined
    }]);

    try {
      onQuery();
      let fullContent = '';
      const stream = geminiService.chatWithDocumentStream(
        msgContent,
        { base64: selectedDoc?.base64Data, mimeType: selectedDoc?.mimeType, filePath: selectedDoc?.filePath },
        messages.map(m => ({ role: m.role, content: m.content })),
        brain,
        user
      );

      for await (const chunk of stream) {
        if (chunk) {
          fullContent += chunk;
          setMessages(prev => prev.map(m => m.id === aiMessageId ? { ...m, content: fullContent } : m));
        }
      }
      await adaptiveService.captureGeneration(user.id, 'chat', fullContent, { query: msgContent });
      setCooldown(2);
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === aiMessageId ? { ...m, content: "Neural sync interrupted." } : m));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] bg-slate-50 dark:bg-slate-950 relative overflow-hidden">
      {/* Dynamic Context Header */}
      <div className="flex gap-2 overflow-x-auto px-6 py-3 border-b border-slate-200 dark:border-slate-800 scrollbar-hide shrink-0 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md sticky top-0 z-20">
        <button
          onClick={() => setSelectedDocId(null)}
          className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
            selectedDocId === null ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
          }`}
        >
          General Intelligence
        </button>
        {documents.map(doc => (
          <button
            key={doc.id}
            onClick={() => setSelectedDocId(doc.id)}
            className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-2 ${
              selectedDocId === doc.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
            }`}
          >
            <FileText size={12} />
            <span className="max-w-[120px] truncate">{doc.name}</span>
          </button>
        ))}
      </div>

      {/* Main Chat Flow */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar px-4 pt-10 pb-40">
        <div className="max-w-4xl mx-auto space-y-12">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[50vh] text-center space-y-6">
              <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center animate-pulse shadow-inner">
                <Sparkles size={32} />
              </div>
              <div>
                <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Pedagogy Master AI</h2>
                <p className="text-slate-500 dark:text-slate-400 mt-2 max-w-sm mx-auto">Upload a curriculum document to start context-aware planning, or ask a general question below.</p>
              </div>
            </div>
          ) : (
            messages.map((m, idx) => {
              const { text, suggestions } = parseContent(m.content);
              const isAi = m.role === 'assistant';
              return (
                <div key={m.id} className={`flex w-full animate-chat-turn ${isAi ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[90%] md:max-w-[80%] flex gap-4 ${isAi ? 'flex-row' : 'flex-row-reverse'}`}>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-1 shadow-sm ${isAi ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                      {isAi ? <Bot size={20} /> : <User size={20} />}
                    </div>
                    
                    <div className="space-y-3">
                      <div className={`p-5 md:p-7 rounded-[2rem] leading-relaxed shadow-sm transition-all ${
                        isAi 
                          ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-slate-100 dark:border-slate-800' 
                          : 'bg-indigo-600 text-white rounded-tr-none'
                      }`}>
                        <div className="prose dark:prose-invert max-w-none whitespace-pre-wrap">
                          {text || (isLoading && idx === messages.length - 1 && <div className="flex gap-2 py-2 items-center"><div className="w-2 h-2 bg-indigo-300 rounded-full animate-bounce" /><div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.2s]" /><div className="w-2 h-2 bg-indigo-700 rounded-full animate-bounce [animation-delay:0.4s]" /></div>)}
                        </div>
                      </div>

                      {isAi && text && (
                        <div className="flex flex-wrap items-center gap-2 group">
                          <button onClick={() => handleCopy(m.id, m.content)} className="p-2.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-indigo-600 border border-slate-200 dark:border-slate-800 transition-all shadow-sm" title="Copy">
                            {copiedId === m.id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                          </button>
                          <button onClick={() => handleDownload(m.content)} className="p-2.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-indigo-600 border border-slate-200 dark:border-slate-800 transition-all shadow-sm" title="Download">
                            <FileDown size={14} />
                          </button>
                          <button onClick={() => handleShare(m.content)} className="p-2.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-indigo-600 border border-slate-200 dark:border-slate-800 transition-all shadow-sm" title="Share">
                            <Share2 size={14} />
                          </button>
                          
                          {suggestions.length > 0 && idx === messages.length - 1 && (
                            <div className="flex flex-wrap gap-2 ml-4">
                              {suggestions.map((s, si) => (
                                <button
                                  key={si}
                                  onClick={() => handleSend(s)}
                                  className="px-4 py-1.5 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white rounded-full text-[11px] font-bold border border-indigo-100 dark:border-indigo-900 transition-all"
                                >
                                  {s}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Floating Input Controller */}
      <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10 bg-gradient-to-t from-slate-50 dark:from-slate-950 via-slate-50/95 dark:via-slate-950/95 to-transparent">
        <div className="max-w-3xl mx-auto relative group">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
            placeholder="Describe your lesson objective or curriculum query..."
            rows={1}
            className="w-full pl-8 pr-16 py-5 md:py-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2.5rem] shadow-2xl shadow-indigo-500/5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none text-base transition-all dark:text-white"
          />
          <button
            onClick={() => handleSend()}
            disabled={isLoading || !input.trim() || cooldown > 0}
            className={`absolute right-4 bottom-4 p-3.5 rounded-2xl transition-all shadow-xl ${
              input.trim() && !isLoading ? 'bg-indigo-600 text-white scale-100 active:scale-90 hover:bg-indigo-700' : 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600'
            }`}
          >
            {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
          </button>
        </div>
        <div className="flex justify-center mt-4">
           <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-600">
             {cooldown > 0 ? `Neural Cooldown: ${cooldown}s` : 'Neural Processing Node Ready'}
           </p>
        </div>
      </div>
    </div>
  );
};

export default Chat;
