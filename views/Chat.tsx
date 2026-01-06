import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, FileText, Check, Copy, Loader2, FileDown, Share2 } from 'lucide-react';
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
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
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
        await navigator.share({
          title: 'Pedagogical Insight',
          text: cleanText,
        });
      } catch (err) {
        handleCopy('share', text);
      }
    } else {
      handleCopy('share', text);
    }
  };

  const handleDownload = (text: string) => {
    const cleanText = text.split('[SUGGESTIONS]')[0].trim();
    const header = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'></head><body style="font-family: Arial; line-height: 1.6; padding: 40px;">${cleanText.replace(/\n/g, '<br>')}</body></html>`;
    const blob = new Blob([header], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pedagogy-master-${Date.now()}.doc`;
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
    <div className="flex flex-col h-[calc(100vh-140px)] bg-white dark:bg-slate-950">
      {/* Context Bar */}
      <div className="flex gap-2 overflow-x-auto px-6 py-4 border-b border-slate-100 dark:border-slate-900 scrollbar-hide shrink-0 bg-white/50 dark:bg-slate-950/50 backdrop-blur-sm sticky top-0 z-10">
        <button
          onClick={() => setSelectedDocId(null)}
          className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
            selectedDocId === null ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-lg' : 'bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Neural Core
        </button>
        {documents.map(doc => (
          <button
            key={doc.id}
            onClick={() => setSelectedDocId(doc.id)}
            className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-2 ${
              selectedDocId === doc.id ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-lg' : 'bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <FileText size={12} />
            <span className="max-w-[120px] truncate">{doc.name}</span>
          </button>
        ))}
      </div>

      {/* Message Feed */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar px-4 pt-8 pb-32">
        <div className="max-w-3xl mx-auto space-y-12">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[40vh] text-center opacity-60">
               <Bot size={48} className="text-indigo-600 dark:text-indigo-400 mb-6" />
               <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">How can I assist your teaching today?</h2>
               <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm max-w-xs">Ask for lesson plans, rubrics, or pedagogical analysis.</p>
            </div>
          ) : (
            messages.map((m, idx) => {
              const { text, suggestions } = parseContent(m.content);
              const isAi = m.role === 'assistant';
              return (
                <div key={m.id} className={`flex w-full ${isAi ? 'justify-start' : 'justify-end animate-in slide-in-from-right-4'}`}>
                  <div className={`max-w-[90%] md:max-w-[85%] flex gap-4 ${isAi ? 'flex-row' : 'flex-row-reverse'}`}>
                    {/* Avatar */}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-1 ${isAi ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                      {isAi ? <Bot size={18} /> : <User size={18} />}
                    </div>
                    
                    {/* Content */}
                    <div className={`space-y-4 ${!isAi ? 'text-right' : ''}`}>
                      <div className={`p-4 md:p-6 rounded-[2rem] leading-relaxed text-base break-words ${
                        isAi 
                          ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-slate-100 dark:border-slate-800 shadow-sm' 
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-tr-none'
                      }`}>
                        <div className="prose prose-slate dark:prose-invert max-w-none whitespace-pre-wrap">
                          {text || (isLoading && idx === messages.length - 1 && <div className="flex gap-1.5 py-2"><div className="w-1.5 h-1.5 bg-indigo-300 rounded-full animate-bounce" /><div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]" /><div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce [animation-delay:0.4s]" /></div>)}
                        </div>
                      </div>

                      {/* AI Actions */}
                      {isAi && text && (
                        <div className="flex flex-wrap items-center gap-2 group focus-within:opacity-100">
                          <button onClick={() => handleCopy(m.id, m.content)} className="p-2.5 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-indigo-600 transition-all border border-slate-100 dark:border-slate-800 shadow-sm" title="Copy Text">
                            {copiedId === m.id ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                          </button>
                          <button onClick={() => handleDownload(m.content)} className="p-2.5 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-indigo-600 transition-all border border-slate-100 dark:border-slate-800 shadow-sm" title="Save as DOC">
                            <FileDown size={16} />
                          </button>
                          <button onClick={() => handleShare(m.content)} className="p-2.5 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-indigo-600 transition-all border border-slate-100 dark:border-slate-800 shadow-sm" title="Share Response">
                            <Share2 size={16} />
                          </button>
                          
                          {suggestions.length > 0 && idx === messages.length - 1 && (
                            <div className="flex flex-wrap gap-2 ml-2">
                              {suggestions.map((s, si) => (
                                <button
                                  key={si}
                                  onClick={() => handleSend(s)}
                                  className="px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 dark:hover:text-white rounded-full text-xs font-bold transition-all border border-indigo-100 dark:border-indigo-900 shadow-sm"
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

      {/* Input Dock */}
      <div className="absolute bottom-0 left-0 right-0 p-4 md:p-8 bg-gradient-to-t from-white dark:from-slate-950 via-white/95 dark:via-slate-950/95 to-transparent">
        <div className="max-w-3xl mx-auto relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
            placeholder="Describe your requirement..."
            rows={1}
            className="w-full pl-6 pr-14 py-4 md:py-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2rem] shadow-2xl focus:ring-4 focus:ring-indigo-600/5 focus:border-indigo-600 outline-none resize-none text-base transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />
          <button
            onClick={() => handleSend()}
            disabled={isLoading || !input.trim() || cooldown > 0}
            className={`absolute right-3 bottom-3 p-2.5 md:p-3 rounded-2xl transition-all ${
              input.trim() && !isLoading ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-xl scale-105 active:scale-95' : 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-700'
            }`}
          >
            {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
          </button>
        </div>
        <p className="text-[10px] text-center text-slate-400 dark:text-slate-600 mt-4 font-black uppercase tracking-[0.2em] animate-pulse">
          {cooldown > 0 ? `Neural Cooldown: ${cooldown}s` : 'Neural Processing Node Active'}
        </p>
      </div>
    </div>
  );
};

export default Chat;