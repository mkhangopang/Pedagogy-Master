
import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, FileText, Check, Copy, RefreshCw, Loader2, X, Sparkles, RotateCcw, FileDown } from 'lucide-react';
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

  const handleDownload = (text: string) => {
    const cleanText = text.split('[SUGGESTIONS]')[0].trim();
    const blob = new Blob([cleanText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pedagogy-response-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
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
    const initialAiMessage: ChatMessage = {
      id: aiMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      documentId: selectedDocId || undefined
    };
    
    setMessages(prev => [...prev, initialAiMessage]);

    try {
      onQuery();
      let fullContent = '';
      const chatHistory = updatedMessages.map(m => ({ role: m.role, content: m.content }));

      const stream = geminiService.chatWithDocumentStream(
        msgContent,
        { base64: selectedDoc?.base64Data, mimeType: selectedDoc?.mimeType, filePath: selectedDoc?.filePath },
        chatHistory,
        brain,
        user
      );

      for await (const chunk of stream) {
        if (chunk) {
          fullContent += chunk;
          setMessages(prev => 
            prev.map(m => m.id === aiMessageId ? { ...m, content: fullContent } : m)
          );
        }
      }
      await adaptiveService.captureGeneration(user.id, 'chat-response', fullContent, { query: msgContent });
      setCooldown(3);
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === aiMessageId ? { ...m, content: "Sync interrupted." } : m));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] md:h-[calc(100vh-140px)] bg-white">
      {/* Horizontal Document Selector - ChatGPT like */}
      <div className="flex gap-2 overflow-x-auto p-4 border-b border-slate-100 scrollbar-hide">
        <button
          onClick={() => setSelectedDocId(null)}
          className={`shrink-0 px-4 py-2 rounded-full text-xs font-bold border transition-all ${
            selectedDocId === null ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          General Brain
        </button>
        {documents.map(doc => (
          <button
            key={doc.id}
            onClick={() => setSelectedDocId(doc.id)}
            className={`shrink-0 px-4 py-2 rounded-full text-xs font-bold border transition-all flex items-center gap-2 ${
              selectedDocId === doc.id ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <FileText size={12} />
            <span className="max-w-[120px] truncate">{doc.name}</span>
          </button>
        ))}
      </div>

      {/* Main Chat Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar bg-white">
        <div className="max-w-3xl mx-auto w-full">
          {messages.length === 0 ? (
            <div className="h-[60vh] flex flex-col items-center justify-center p-10 text-center">
              <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6">
                <Bot size={32} />
              </div>
              <h3 className="text-2xl font-bold text-slate-900">How can I help you today?</h3>
              <p className="text-slate-500 mt-2 text-sm max-w-xs mx-auto">Analyze curriculum, generate assessments, or refine your pedagogical strategy.</p>
            </div>
          ) : (
            <div className="pb-32">
              {messages.map((m, idx) => {
                const { text, suggestions } = parseContent(m.content);
                const isAi = m.role === 'assistant';
                return (
                  <div key={m.id} className={`group py-8 px-4 md:px-0 ${isAi ? 'bg-white' : 'bg-transparent'}`}>
                    <div className="flex gap-4 md:gap-6">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm ${isAi ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                        {isAi ? <Bot size={18} /> : <User size={18} />}
                      </div>
                      <div className="flex-1 min-w-0 space-y-4">
                        <div className="text-slate-800 leading-relaxed text-[15px] md:text-base prose prose-slate max-w-none">
                          {text || (isLoading && idx === messages.length - 1 && <Loader2 className="animate-spin text-slate-300" size={20} />)}
                        </div>
                        
                        {isAi && !isLoading && (
                          <div className="flex items-center gap-4 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleCopy(m.id, m.content)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors" title="Copy">
                              {copiedId === m.id ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                            </button>
                            <button onClick={() => handleDownload(m.content)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors" title="Download TXT">
                              <FileDown size={16} />
                            </button>
                            {idx === messages.length - 1 && (
                              <button onClick={() => handleSend(messages[idx-1].content, idx-1)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors" title="Regenerate">
                                <RotateCcw size={16} />
                              </button>
                            )}
                          </div>
                        )}

                        {isAi && !isLoading && suggestions.length > 0 && idx === messages.length - 1 && (
                          <div className="flex flex-wrap gap-2 pt-2">
                            {suggestions.map((s, si) => (
                              <button
                                key={si}
                                onClick={() => handleSend(s)}
                                className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:border-indigo-400 hover:text-indigo-600 transition-all flex items-center gap-2"
                              >
                                <Sparkles size={12} /> {s}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Floating Input Bar */}
      <div className="fixed bottom-0 left-0 right-0 md:left-auto md:right-auto md:w-[calc(100%-16rem)] flex justify-center pb-8 px-4 pointer-events-none">
        <div className="max-w-3xl w-full bg-white border border-slate-200 rounded-2xl shadow-2xl p-2 pointer-events-auto">
          <div className="relative flex items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
              rows={1}
              disabled={!canQuery || isLoading || cooldown > 0}
              placeholder={cooldown > 0 ? "Neural Sync..." : "Message Pedagogy Master..."}
              className="w-full pl-4 pr-12 py-3 bg-transparent border-none focus:ring-0 outline-none resize-none text-base max-h-40"
            />
            <button
              onClick={() => handleSend()}
              disabled={isLoading || !input.trim() || cooldown > 0}
              className={`absolute right-2 bottom-2 p-2 rounded-xl transition-all ${
                input.trim() && !isLoading ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-slate-100 text-slate-300'
              }`}
            >
              {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
            </button>
          </div>
          {cooldown > 0 && (
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap bg-white px-2 rounded-full border border-slate-100 shadow-sm">
              Cooldown: {cooldown}s
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Chat;
