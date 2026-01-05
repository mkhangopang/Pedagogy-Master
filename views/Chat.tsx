
import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, FileText, Check, AlertCircle, Zap, Clock, Copy, RefreshCcw, Save, Loader2, RefreshCw, Pencil, X } from 'lucide-react';
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
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editInput, setEditInput] = useState('');
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

  const handleSend = async (overrideInput?: string, regenerateFromIdx?: number) => {
    const msgContent = overrideInput || input;
    if (!msgContent.trim() || isLoading || cooldown > 0 || !canQuery) return;

    let updatedMessages = [...messages];
    
    if (regenerateFromIdx !== undefined) {
      // Cut off everything from this point
      updatedMessages = updatedMessages.slice(0, regenerateFromIdx);
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: msgContent,
      timestamp: new Date().toISOString(),
      documentId: selectedDocId || undefined
    };

    if (regenerateFromIdx === undefined) {
      setMessages(prev => [...prev, userMessage]);
      setInput('');
      updatedMessages = [...updatedMessages, userMessage];
    } else {
      updatedMessages = [...updatedMessages, userMessage];
      setMessages(updatedMessages);
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
      // Exclude the current AI message being built
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
      setCooldown(4);
      
    } catch (err: any) {
      setMessages(prev => 
        prev.map(m => m.id === aiMessageId ? { ...m, content: "Neural sync interrupted. Please wait." } : m)
      );
    } finally {
      setIsLoading(false);
      setEditingMessageId(null);
    }
  };

  const handleEditMessage = (msg: ChatMessage) => {
    setEditingMessageId(msg.id);
    setEditInput(msg.content);
  };

  const submitEdit = (idx: number) => {
    if (!editInput.trim()) return;
    handleSend(editInput, idx);
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col md:flex-row gap-6 relative animate-in fade-in duration-500">
      <div className="w-full md:w-64 flex-shrink-0">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm h-full flex flex-col">
          <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2 px-2">
            <Clock size={12} /> Knowledge Nodes
          </h2>
          <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
            <button
              onClick={() => setSelectedDocId(null)}
              className={`w-full text-left p-3 rounded-xl border transition-all text-sm flex items-center gap-3 ${
                selectedDocId === null ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-transparent text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Zap size={14} className={selectedDocId === null ? 'text-indigo-200' : 'text-slate-400'} />
              <span className="font-bold truncate">General Brain</span>
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
                <span className="truncate font-bold">{doc.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-12 text-center max-w-lg mx-auto opacity-30">
              <Bot size={64} className="text-indigo-600 mb-8" />
              <h3 className="text-2xl font-bold text-slate-900 mb-2">Neural Dialogue Hub</h3>
              <p className="text-sm font-medium">Calibrated for adaptive pedagogical support.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {messages.map((m, idx) => (
                <div key={m.id} className={`p-8 md:p-12 group ${m.role === 'assistant' ? 'bg-slate-50/20' : 'bg-white'}`}>
                  <div className="max-w-4xl mx-auto flex gap-6">
                    <div className={`w-10 h-10 rounded-xl shrink-0 flex items-center justify-center shadow-lg ${m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-emerald-500 text-white'}`}>
                      {m.role === 'user' ? <User size={20} /> : <Bot size={20} />}
                    </div>
                    <div className="flex-1 min-w-0 space-y-6">
                      {editingMessageId === m.id ? (
                        <div className="space-y-4">
                          <textarea 
                            value={editInput}
                            onChange={(e) => setEditInput(e.target.value)}
                            className="w-full p-4 bg-slate-50 border border-indigo-200 rounded-2xl text-lg font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                            rows={3}
                          />
                          <div className="flex items-center gap-3">
                            <button 
                              onClick={() => submitEdit(idx)}
                              className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all"
                            >
                              Save & Regenerate
                            </button>
                            <button 
                              onClick={() => setEditingMessageId(null)}
                              className="px-6 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all flex items-center gap-2"
                            >
                              <X size={14} /> Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="relative">
                          <div className="text-slate-900 leading-relaxed text-lg font-medium whitespace-pre-wrap">
                            {m.content || (isLoading && idx === messages.length - 1 ? <Loader2 size={20} className="animate-spin text-indigo-300" /> : "")}
                          </div>
                          
                          {/* ACTIONS AT BOTTOM OF MESSAGE */}
                          <div className="flex items-center gap-6 pt-4 border-t border-slate-100 mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                            {m.role === 'assistant' ? (
                              <button onClick={() => handleCopy(m.id, m.content)} className="text-slate-400 hover:text-indigo-600 transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                                {copiedId === m.id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                                {copiedId === m.id ? 'Saved' : 'Copy'}
                              </button>
                            ) : (
                              <button 
                                onClick={() => handleEditMessage(m)}
                                disabled={isLoading}
                                className="text-slate-400 hover:text-indigo-600 transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"
                              >
                                <Pencil size={14} /> Edit
                              </button>
                            )}
                          </div>
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
                placeholder={cooldown > 0 ? "Neural Sync in Progress..." : "Compose query..."}
                className="w-full pl-6 pr-14 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all text-base font-medium resize-none shadow-inner"
              />
              <button onClick={() => handleSend()} disabled={isLoading || !input.trim() || cooldown > 0} className="absolute right-3 bottom-3 p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all">
                <Send size={20} />
              </button>
            </div>
            {cooldown > 0 && <p className="mt-2 text-[10px] font-black text-amber-600 uppercase tracking-widest text-center">Engine Sync: {cooldown}s</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chat;
