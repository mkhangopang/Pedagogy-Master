
import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, FileText, Check, AlertCircle, Zap, Clock, Copy, RefreshCcw, Save, Loader2 } from 'lucide-react';
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
  const [currentArtifactId, setCurrentArtifactId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectedDoc = documents.find(d => d.id === selectedDocId);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleCopy = async (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);

    // FEEDBACK: Copy is a strong success signal (Export/Accept)
    if (currentArtifactId) {
      await adaptiveService.captureEvent(user.id, currentArtifactId, 'accept');
    }
  };

  const handleRegenerate = async (index: number) => {
    if (isLoading || messages.length < 2) return;
    const userMsg = messages[index - 1];
    if (userMsg.role !== 'user') return;
    
    // FEEDBACK: Regeneration is a failure signal for the previous output
    if (currentArtifactId) {
      await adaptiveService.captureEvent(user.id, currentArtifactId, 'abandon', { reason: 'regeneration' });
    }

    setMessages(prev => prev.slice(0, index));
    setInput(userMsg.content);
    setTimeout(() => handleSend(userMsg.content), 0);
  };

  const handleSend = async (overrideInput?: string) => {
    const msgContent = overrideInput || input;
    if (!msgContent.trim() || isLoading) return;
    if (!canQuery) return;

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
        {
          base64: selectedDoc?.base64Data,
          mimeType: selectedDoc?.mimeType
        },
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

      // RECORD ARTIFACT: Store the generated response for behavioral analysis
      const artifactId = await adaptiveService.captureGeneration(
        user.id, 
        'chat-response', 
        fullContent, 
        { query: msgContent, context: selectedDocId || 'global' }
      );
      setCurrentArtifactId(artifactId);
      
    } catch (err) {
      console.error(err);
      const errorText = "The AI engine encountered an error. Please check your connectivity or API key.";
      setMessages(prev => 
        prev.map(m => m.id === aiMessageId ? { ...m, content: errorText } : m)
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col md:flex-row gap-6 relative animate-in fade-in duration-500">
      {/* Context Sidebar */}
      <div className="w-full md:w-64 flex-shrink-0">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm h-full overflow-hidden flex flex-col">
          <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2 px-2">
            <Clock className="w-3 h-3" />
            Active Context
          </h2>
          <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
            <button
              onClick={() => setSelectedDocId(null)}
              className={`w-full text-left p-3 rounded-xl border transition-all text-sm flex items-center gap-3 ${
                selectedDocId === null 
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' 
                  : 'bg-white border-transparent text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Zap className={`w-4 h-4 shrink-0 ${selectedDocId === null ? 'text-indigo-200' : 'text-slate-400'}`} />
              <span className="font-medium truncate">Global Brain</span>
            </button>
            
            <div className="pt-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 px-2 tracking-wider">Curriculum Context</p>
              {documents.length === 0 ? (
                <p className="text-[10px] text-slate-400 italic px-2">No files available.</p>
              ) : (
                documents.map(doc => (
                  <button
                    key={doc.id}
                    onClick={() => setSelectedDocId(doc.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all text-sm mb-1 flex items-center gap-3 ${
                      selectedDocId === doc.id 
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' 
                        : 'bg-white border-transparent text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <FileText className={`w-4 h-4 shrink-0 ${selectedDocId === doc.id ? 'text-indigo-200' : 'text-slate-400'}`} />
                    <span className="truncate font-medium">{doc.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          {user.successRate > 0 && (
            <div className="mt-4 p-3 bg-indigo-50 rounded-xl border border-indigo-100">
              <div className="flex items-center gap-2 text-indigo-600 mb-1">
                <Zap size={12} />
                <span className="text-[10px] font-bold uppercase tracking-widest">Engine Precision</span>
              </div>
              <div className="h-1.5 w-full bg-indigo-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-indigo-600 transition-all duration-1000" 
                  style={{ width: `${user.successRate * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Chat Interface */}
      <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden relative">
        <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar">
          {messages.length === 0 && !isLoading ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto">
              <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6">
                <Bot className="w-8 h-8 text-indigo-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Adaptive AI Tutor</h3>
              <p className="text-slate-500 text-sm">
                Ask about learning outcomes or pedagogical alignment. I'm currently set to {user.teachingStyle || 'balanced'} mode for {user.gradeLevel || 'general education'}.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {messages.map((m, idx) => (
                <div key={m.id} className={`p-6 md:p-8 ${m.role === 'assistant' ? 'bg-slate-50/40' : 'bg-white'}`}>
                  <div className="max-w-3xl mx-auto flex gap-4 md:gap-6">
                    <div className={`w-9 h-9 rounded-xl shrink-0 flex items-center justify-center shadow-sm ${m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-emerald-500 text-white'}`}>
                      {m.role === 'user' ? <User size={18} /> : <Bot size={18} />}
                    </div>
                    <div className="flex-1 min-w-0 space-y-4">
                      <div className={`text-slate-800 leading-relaxed text-base ${m.role === 'assistant' ? 'font-serif' : 'font-medium'} whitespace-pre-wrap`}>
                        {m.content || (isLoading && idx === messages.length - 1 ? (
                          <div className="flex items-center gap-2 text-indigo-400">
                            <Loader2 size={16} className="animate-spin" />
                            <span className="text-sm italic">Engine thinking...</span>
                          </div>
                        ) : "")}
                      </div>
                      
                      {m.role === 'assistant' && m.content && !isLoading && (
                        <div className="flex items-center gap-4 pt-2 border-t border-slate-100/50">
                          <button 
                            onClick={() => handleCopy(m.id, m.content)} 
                            className="text-slate-400 hover:text-indigo-600 transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider"
                          >
                            {copiedId === m.id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                            {copiedId === m.id ? 'Saved to Clipboard' : 'Copy Output'}
                          </button>
                          <button 
                            onClick={() => handleRegenerate(idx)} 
                            className="text-slate-400 hover:text-indigo-600 transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider"
                          >
                            <RefreshCcw size={14} />
                            Regenerate
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

        <div className="p-4 md:p-6 bg-white border-t border-slate-100">
          <div className="max-w-3xl mx-auto">
            {!canQuery && (
              <div className="mb-3 p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-3 text-rose-700">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <p className="text-[10px] font-bold uppercase tracking-wider">Usage limit reached. Upgrade for unlimited queries.</p>
              </div>
            )}
            <div className="relative group">
              <textarea 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                rows={1}
                disabled={!canQuery || isLoading}
                placeholder={!canQuery ? "Subscription limit reached..." : "Ask your pedagogical tutor..."}
                className="w-full pl-5 pr-14 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all disabled:opacity-50 text-base font-medium resize-none shadow-sm max-h-40"
              />
              <button 
                onClick={() => handleSend()}
                disabled={isLoading || !input.trim() || !canQuery}
                className="absolute right-2.5 bottom-2.5 p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-md active:scale-95 flex items-center justify-center"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chat;
