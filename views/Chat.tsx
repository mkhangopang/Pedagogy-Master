
import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, FileText, Check, AlertCircle, Zap, Clock, Copy, RefreshCcw, Save, Loader2, RefreshCw } from 'lucide-react';
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
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
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

    if (!overrideInput) {
      setMessages(prev => [...prev, userMessage]);
      setInput('');
    }
    
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
      const chatHistory = messages.map(m => ({ role: m.role, content: m.content }));

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
      setCooldown(4);
      
    } catch (err: any) {
      setMessages(prev => 
        prev.map(m => m.id === aiMessageId ? { ...m, content: "Neural limit reached. Wait 10s." } : m)
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col md:flex-row gap-6 relative animate-in fade-in duration-500">
      <div className="w-full md:w-64 flex-shrink-0">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm h-full flex flex-col">
          <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2 px-2">
            <Clock size={12} /> Context Library
          </h2>
          <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
            <button
              onClick={() => setSelectedDocId(null)}
              className={`w-full text-left p-3 rounded-xl border transition-all text-sm flex items-center gap-3 ${
                selectedDocId === null ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-transparent text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Zap size={14} className={selectedDocId === null ? 'text-indigo-200' : 'text-slate-400'} />
              <span className="font-semibold truncate">General Tutor</span>
            </button>
            {documents.map(doc => (
              <button
                key={doc.id}
                onClick={() => setSelectedDocId(doc.id)}
                className={`w-full text-left p-3 rounded-xl border transition-all text-sm mb-1 flex items-center gap-3 ${
                  selectedDocId === doc.id ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-transparent text-slate-700 hover:bg-slate-50'
                }`}
              >
                <FileText size={14} className={selectedDocId === doc.id ? 'text-indigo-200' : 'text-slate-400'} />
                <span className="truncate font-semibold">{doc.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-12 text-center max-w-lg mx-auto opacity-50">
              <Bot size={48} className="text-indigo-600 mb-6" />
              <h3 className="text-xl font-bold text-slate-900 mb-2">Neural Dialogue Hub</h3>
              <p className="text-sm">Ask about your documents or request instructional design assistance.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {messages.map((m, idx) => (
                <div key={m.id} className={`p-8 md:p-12 ${m.role === 'assistant' ? 'bg-slate-50/30' : 'bg-white'}`}>
                  <div className="max-w-4xl mx-auto flex gap-6">
                    <div className={`w-9 h-9 rounded-xl shrink-0 flex items-center justify-center shadow-sm ${m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-emerald-500 text-white'}`}>
                      {m.role === 'user' ? <User size={18} /> : <Bot size={18} />}
                    </div>
                    <div className="flex-1 min-w-0 space-y-4">
                      <div className="text-slate-800 leading-relaxed text-base font-medium whitespace-pre-wrap">
                        {m.content || (isLoading && idx === messages.length - 1 ? <Loader2 size={16} className="animate-spin text-indigo-400" /> : "")}
                      </div>
                      {m.role === 'assistant' && m.content && !isLoading && (
                        <div className="flex items-center gap-4 pt-4">
                          <button onClick={() => handleCopy(m.id, m.content)} className="text-slate-400 hover:text-indigo-600 transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
                            {copiedId === m.id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                            {copiedId === m.id ? 'Saved' : 'Copy'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 bg-white border-t border-slate-100">
          <div className="max-w-4xl mx-auto">
            <div className="relative">
              <textarea 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
                rows={1}
                disabled={!canQuery || isLoading || cooldown > 0}
                placeholder={cooldown > 0 ? "Cooling down..." : "Message AI..."}
                className="w-full pl-5 pr-14 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all text-base font-medium resize-none shadow-sm"
              />
              <button onClick={() => handleSend()} disabled={isLoading || !input.trim() || cooldown > 0} className="absolute right-2.5 bottom-2.5 p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50">
                <Send size={20} />
              </button>
            </div>
            {cooldown > 0 && <p className="mt-2 text-[10px] font-bold text-amber-600 uppercase tracking-widest text-center">Neural Sync: {cooldown}s</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chat;
