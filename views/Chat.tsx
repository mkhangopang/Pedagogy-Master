
import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, FileText, Check, AlertCircle, Zap, Clock, Copy, RefreshCcw, Save, Loader2, RefreshCw, Pencil, X, Sparkles, RotateCcw } from 'lucide-react';
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
    const cleanText = text.split('[SUGGESTIONS]')[0].trim();
    navigator.clipboard.writeText(cleanText);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const parseContent = (content: string) => {
    if (!content.includes('[SUGGESTIONS]')) return { text: content, suggestions: [] };
    const [text, suggestionStr] = content.split('[SUGGESTIONS]');
    const suggestions = suggestionStr
      .split('|')
      .map(s => s.trim())
      .filter(s => s.length > 0);
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

    const newMessagesState = [...updatedMessages, userMessage];
    setMessages(newMessagesState);
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
      setCooldown(4);
      
    } catch (err: any) {
      setMessages(prev => 
        prev.map(m => m.id === aiMessageId ? { ...m, content: "Neural sync interrupted." } : m)
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

  const handleRegenerateLast = () => {
    const lastUserMsgIdx = [...messages].reverse().findIndex(m => m.role === 'user');
    if (lastUserMsgIdx === -1) return;
    const actualIdx = messages.length - 1 - lastUserMsgIdx;
    handleSend(messages[actualIdx].content, actualIdx);
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col md:flex-row gap-8 relative animate-in fade-in duration-700 max-w-[1600px] mx-auto">
      <div className="w-full md:w-72 flex-shrink-0">
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm h-full flex flex-col">
          <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2 px-2">
            <Clock size={14} /> Knowledge Nodes
          </h2>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            <button
              onClick={() => setSelectedDocId(null)}
              className={`w-full text-left p-4 rounded-2xl border transition-all text-sm flex items-center gap-4 ${
                selectedDocId === null ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl' : 'bg-slate-50 border-transparent text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Zap size={16} className={selectedDocId === null ? 'text-indigo-200' : 'text-slate-400'} />
              <span className="font-bold truncate">General Brain</span>
            </button>
            {documents.map(doc => (
              <button
                key={doc.id}
                onClick={() => setSelectedDocId(doc.id)}
                className={`w-full text-left p-4 rounded-2xl border transition-all text-sm mb-1 flex items-center gap-4 ${
                  selectedDocId === doc.id ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl' : 'bg-slate-50 border-transparent text-slate-700 hover:bg-slate-100'
                }`}
              >
                <FileText size={16} className={selectedDocId === doc.id ? 'text-indigo-200' : 'text-slate-400'} />
                <span className="truncate font-bold">{doc.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-[2.5rem] shadow-sm overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar scroll-smooth">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-20 text-center max-w-2xl mx-auto">
              <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-[2rem] flex items-center justify-center mb-10 shadow-inner">
                <Bot size={40} />
              </div>
              <h3 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">Pedagogical Dialogue</h3>
              <p className="text-slate-500 font-medium text-lg leading-relaxed">Engage with the neural engine to refine lesson objectives, build rubrics, or analyze curriculum documents.</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {messages.map((m, idx) => {
                const { text, suggestions } = parseContent(m.content);
                const isLastAiMessage = m.role === 'assistant' && idx === messages.length - 1;

                return (
                  <div key={m.id} className={`w-full py-16 px-6 md:px-12 border-b border-slate-50 transition-colors ${m.role === 'assistant' ? 'bg-slate-50/30' : 'bg-white'}`}>
                    <div className="max-w-6xl mx-auto flex flex-col md:flex-row gap-10">
                      <div className={`w-12 h-12 rounded-2xl shrink-0 flex items-center justify-center shadow-lg transition-transform hover:scale-110 ${m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-emerald-500 text-white'}`}>
                        {m.role === 'user' ? <User size={24} /> : <Bot size={24} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        {editingMessageId === m.id ? (
                          <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
                            <textarea 
                              value={editInput}
                              onChange={(e) => setEditInput(e.target.value)}
                              autoFocus
                              className="w-full p-10 bg-slate-50 border border-indigo-400 rounded-3xl text-xl font-medium outline-none shadow-inner min-h-[200px] leading-relaxed"
                            />
                            <div className="flex items-center gap-4">
                              <button 
                                onClick={() => submitEdit(idx)}
                                className="px-8 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-xl active:scale-95"
                              >
                                Save & Regenerate
                              </button>
                              <button 
                                onClick={() => setEditingMessageId(null)}
                                className="px-8 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all flex items-center gap-2"
                              >
                                <X size={16} /> Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="relative">
                            <div className={`text-slate-800 leading-[1.6] text-lg font-normal whitespace-pre-wrap ${m.role === 'assistant' ? 'font-mono text-sm' : 'font-sans text-lg'}`}>
                              {text || (isLoading && idx === messages.length - 1 ? (
                                <div className="flex gap-3 py-4">
                                  <div className="w-3 h-3 bg-indigo-100 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                  <div className="w-3 h-3 bg-indigo-200 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                  <div className="w-3 h-3 bg-indigo-300 rounded-full animate-bounce"></div>
                                </div>
                              ) : "")}
                            </div>
                            
                            {isLastAiMessage && !isLoading && suggestions.length > 0 && (
                              <div className="mt-12 flex flex-wrap gap-3 animate-in fade-in slide-in-from-bottom-4 duration-700">
                                {suggestions.map((suggestion, sIdx) => (
                                  <button
                                    key={sIdx}
                                    onClick={() => handleSend(suggestion)}
                                    className="flex items-center gap-3 px-6 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-600 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all shadow-sm"
                                  >
                                    <Sparkles size={14} className="text-indigo-400" />
                                    {suggestion}
                                  </button>
                                ))}
                              </div>
                            )}

                            <div className="flex items-center gap-8 pt-10 border-t border-slate-100/50 mt-10 opacity-0 group-hover:opacity-100 transition-opacity">
                              {m.role === 'assistant' ? (
                                <>
                                  <button onClick={() => handleCopy(m.id, m.content)} className="text-slate-400 hover:text-indigo-600 transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em]">
                                    {copiedId === m.id ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                                    {copiedId === m.id ? 'Captured' : 'Copy Response'}
                                  </button>
                                  {isLastAiMessage && !isLoading && (
                                    <button 
                                      onClick={handleRegenerateLast}
                                      className="text-slate-400 hover:text-indigo-600 transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em]"
                                    >
                                      <RotateCcw size={16} /> Regenerate
                                    </button>
                                  )}
                                </>
                              ) : (
                                <button 
                                  onClick={() => handleEditMessage(m)}
                                  disabled={isLoading}
                                  className="text-slate-400 hover:text-indigo-600 transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em]"
                                >
                                  <Pencil size={16} /> Edit Request
                                </button>
                              )}
                            </div>
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

        <div className="p-10 bg-white border-t border-slate-100">
          <div className="max-w-6xl mx-auto">
            <div className="relative shadow-2xl rounded-[2rem]">
              <textarea 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
                rows={1}
                disabled={!canQuery || isLoading || cooldown > 0}
                placeholder={cooldown > 0 ? "Calibrating Neural Sync..." : "Describe a teaching challenge or objective..."}
                className="w-full pl-8 pr-20 py-6 bg-slate-50 border border-slate-200 rounded-[2rem] focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 focus:outline-none transition-all text-lg font-medium resize-none shadow-inner"
              />
              <button 
                onClick={() => handleSend()} 
                disabled={isLoading || !input.trim() || cooldown > 0} 
                className="absolute right-4 bottom-4 p-4 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-xl active:scale-90"
              >
                {isLoading ? <Loader2 size={24} className="animate-spin" /> : <Send size={24} />}
              </button>
            </div>
            {cooldown > 0 && <p className="mt-4 text-[10px] font-black text-amber-600 uppercase tracking-[0.3em] text-center animate-pulse">Neural Engine Syncing: {cooldown}s</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chat;
