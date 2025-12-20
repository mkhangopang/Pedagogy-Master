
import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, FileText, Check, AlertCircle, Zap, Clock, Copy, RefreshCcw, Save, MoreHorizontal } from 'lucide-react';
import { ChatMessage, Document, NeuralBrain } from '../types';
import { geminiService } from '../services/geminiService';

interface ChatProps {
  brain: NeuralBrain;
  documents: Document[];
  onQuery: () => void;
  canQuery: boolean;
}

const Chat: React.FC<ChatProps> = ({ brain, documents, onQuery, canQuery }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectedDoc = documents.find(d => d.id === selectedDocId);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRegenerate = async (index: number) => {
    if (isLoading || messages.length < 2) return;
    const userMsg = messages[index - 1];
    if (userMsg.role !== 'user') return;
    
    // Remove all messages from this assistant message onwards
    setMessages(prev => prev.slice(0, index));
    setInput(userMsg.content);
    // Actually just trigger a new send with that content
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
        brain
      );

      for await (const chunk of stream) {
        if (chunk) {
          fullContent += chunk;
          setMessages(prev => 
            prev.map(m => m.id === aiMessageId ? { ...m, content: fullContent } : m)
          );
        }
      }
      
    } catch (err) {
      console.error(err);
      const errorText = "Error: The AI failed to respond. Please try again later.";
      setMessages(prev => 
        prev.map(m => m.id === aiMessageId ? { ...m, content: errorText } : m)
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col md:flex-row gap-6 relative">
      {/* Context Sidebar - Desktop Only or Top Bar Mobile */}
      <div className="w-full md:w-64 flex-shrink-0">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm h-full overflow-hidden flex flex-col">
          <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2 px-2">
            <Clock className="w-3 h-3" />
            Contexts
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
              <span className="font-medium truncate">Global AI</span>
            </button>
            
            <div className="pt-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 px-2 tracking-wider">Documents</p>
              {documents.length === 0 ? (
                <p className="text-[10px] text-slate-400 italic px-2">No curriculum files uploaded.</p>
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
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden relative">
        <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar">
          {messages.length === 0 && !isLoading ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto">
              <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6">
                <Bot className="w-7 h-7 text-indigo-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">How can I help you today?</h3>
              <p className="text-slate-500 text-sm">
                Ask about learning outcomes, lesson structures, or pedagogical alignment. 
                {selectedDoc ? ` Current context: ${selectedDoc.name}` : ''}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {messages.map((m, idx) => (
                <div key={m.id} className={`p-6 md:p-8 ${m.role === 'assistant' ? 'bg-slate-50/30' : 'bg-white'}`}>
                  <div className="max-w-3xl mx-auto flex gap-4 md:gap-6">
                    <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center shadow-sm ${m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-emerald-500 text-white'}`}>
                      {m.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                    </div>
                    <div className="flex-1 min-w-0 space-y-4">
                      <div className={`text-slate-800 leading-relaxed text-[15px] ${m.role === 'assistant' ? 'font-serif' : ''} whitespace-pre-wrap`}>
                        {m.content || (isLoading && idx === messages.length - 1 ? "Typing..." : "")}
                      </div>
                      
                      {m.role === 'assistant' && m.content && !isLoading && (
                        <div className="flex items-center gap-3 pt-2">
                          <button 
                            onClick={() => handleCopy(m.id, m.content)} 
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
                          >
                            {copiedId === m.id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                            {copiedId === m.id ? 'Copied' : 'Copy'}
                          </button>
                          <button 
                            onClick={() => handleRegenerate(idx)} 
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
                          >
                            <RefreshCcw size={14} />
                            Regenerate
                          </button>
                          <button 
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
                          >
                            <Save size={14} />
                            Save
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

        {/* Input area */}
        <div className="p-4 md:p-6 bg-white border-t border-slate-100">
          <div className="max-w-3xl mx-auto">
            {!canQuery && (
              <div className="mb-3 p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-3 text-rose-700">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <p className="text-[10px] font-bold uppercase tracking-wider">Usage limit reached. Upgrade to Pro for more queries.</p>
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
                placeholder={!canQuery ? "Query limit reached..." : "Ask your pedagogical assistant anything..."}
                className="w-full pl-5 pr-14 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all disabled:opacity-50 text-[15px] font-medium resize-none shadow-sm max-h-40"
              />
              <button 
                onClick={() => handleSend()}
                disabled={isLoading || !input.trim() || !canQuery}
                className="absolute right-2.5 bottom-2.5 p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-md active:scale-95 flex items-center justify-center"
              >
                <Send size={18} />
              </button>
            </div>
            <p className="mt-2 text-[10px] text-center text-slate-400 font-medium">
              AI can make mistakes. Verify important pedagogical decisions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chat;
