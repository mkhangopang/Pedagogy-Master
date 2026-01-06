
import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, FileText, Check, Copy, RefreshCw, Loader2, X, Sparkles, RotateCcw, FileDown, FileJson } from 'lucide-react';
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
    navigator.clipboard.writeText(cleanText);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownload = (text: string, format: 'txt' | 'doc') => {
    const cleanText = text.split('[SUGGESTIONS]')[0].trim();
    if (format === 'txt') {
      const blob = new Blob([cleanText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pedagogy-${Date.now()}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      // Basic DOC wrapper
      const header = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'></head><body><div style="font-family: Arial;">${cleanText.replace(/\n/g, '<br>')}</div></body></html>`;
      const blob = new Blob([header], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pedagogy-${Date.now()}.doc`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const parseContent = (content: string) => {
    if (!content.includes('[SUGGESTIONS]')) return { text: content, suggestions: [] };
    const [text, suggestionStr] = content.split('[SUGGESTIONS]');
    const suggestions = suggestionStr.split('|').map(s => s.trim()).filter(s => s.length > 0);
    return { text: text.trim(), suggestions };
  };

  const handleSend = async (overrideInput?: string, regenerateFromIdx?: number) => {
    const msgContent = overrideInput || input;
    if (!msgContent.trim() || isLoading || cooldown > 0 || !canQuery) return;

    let updatedMessages = [...messages];
    if (regenerateFromIdx !== undefined) {
      updatedMessages = updatedMessages.slice(0, regenerateFromIdx);
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: msgContent,
      timestamp: new Date().toISOString(),
      documentId: selectedDocId || undefined
    };

    setMessages([...updatedMessages, userMessage]);
    if (regenerateFromIdx === undefined) setInput('');
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
        updatedMessages.map(m => ({ role: m.role, content: m.content })),
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
    <div className="flex flex-col h-[calc(100vh-120px)] bg-white relative">
      {/* Dynamic Knowledge Context Switcher */}
      <div className="flex gap-2 overflow-x-auto p-4 border-b border-slate-50 scrollbar-hide shrink-0">
        <button
          onClick={() => setSelectedDocId(null)}
          className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${
            selectedDocId === null ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-500'
          }`}
        >
          Neural Core
        </button>
        {documents.map(doc => (
          <button
            key={doc.id}
            onClick={() => setSelectedDocId(doc.id)}
            className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center gap-2 ${
              selectedDocId === doc.id ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-500'
            }`}
          >
            <FileText size={12} />
            <span className="max-w-[100px] truncate">{doc.name}</span>
          </button>
        ))}
      </div>

      {/* Spacious Feed */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar px-4">
        <div className="max-w-3xl mx-auto py-10 space-y-12">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[50vh] text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
               <Bot size={40} className="text-indigo-600 mb-6" />
               <h2 className="text-2xl font-bold text-slate-900">Neural Workspace</h2>
               <p className="text-slate-500 mt-2 text-sm max-w-xs">Ask anything about your curriculum or educational strategy.</p>
            </div>
          ) : (
            messages.map((m, idx) => {
              const { text, suggestions } = parseContent(m.content);
              const isAi = m.role === 'assistant';
              return (
                <div key={m.id} className="flex gap-4 md:gap-8 group">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-1 ${isAi ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-500'}`}>
                    {isAi ? <Bot size={18} /> : <User size={18} />}
                  </div>
                  <div className="flex-1 min-w-0 space-y-6">
                    <div className="text-slate-800 leading-relaxed text-base prose prose-slate max-w-none break-words">
                      {text || (isLoading && idx === messages.length - 1 && <div className="flex gap-1.5 pt-2"><div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" /><div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.2s]" /><div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.4s]" /></div>)}
                    </div>

                    {isAi && text && (
                      <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-50 opacity-0 group-hover:opacity-100 transition-opacity">
                         <div className="flex gap-1">
                            <button onClick={() => handleCopy(m.id, m.content)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-indigo-600 transition-all">
                              {copiedId === m.id ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                            </button>
                            <button onClick={() => handleDownload(m.content, 'doc')} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-indigo-600 transition-all" title="Save as DOCX">
                              <FileDown size={16} />
                            </button>
                         </div>
                         {suggestions.length > 0 && idx === messages.length - 1 && (
                            <div className="flex flex-wrap gap-2">
                              {suggestions.map((s, si) => (
                                <button
                                  key={si}
                                  onClick={() => handleSend(s)}
                                  className="px-3 py-1.5 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg border border-slate-100 transition-all"
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
              );
            })
          )}
          <div className="h-32" />
        </div>
      </div>

      {/* Floating Input */}
      <div className="absolute bottom-0 left-0 right-0 p-4 md:p-8 bg-gradient-to-t from-white via-white/90 to-transparent">
        <div className="max-w-3xl mx-auto relative group">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
            placeholder="Neural query..."
            rows={1}
            className="w-full pl-6 pr-14 py-4 bg-white border border-slate-200 rounded-2xl shadow-xl focus:ring-2 focus:ring-indigo-600 focus:border-transparent outline-none resize-none text-base transition-all group-hover:border-slate-300"
          />
          <button
            onClick={() => handleSend()}
            disabled={isLoading || !input.trim() || cooldown > 0}
            className={`absolute right-3 bottom-3 p-2 rounded-xl transition-all ${
              input.trim() && !isLoading ? 'bg-slate-900 text-white shadow-lg scale-110' : 'bg-slate-100 text-slate-300'
            }`}
          >
            {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
          </button>
        </div>
        <p className="text-[10px] text-center text-slate-400 mt-3 font-bold uppercase tracking-widest">
          {cooldown > 0 ? `Neural Refractory: ${cooldown}s` : 'AI can make mistakes. Verify important facts.'}
        </p>
      </div>
    </div>
  );
};

export default Chat;
