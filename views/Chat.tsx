
import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, FileText, Check, AlertCircle, Zap } from 'lucide-react';
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
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectedDoc = documents.find(d => d.id === selectedDocId);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    if (!canQuery) return;

    const userMsgContent = input;
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: userMsgContent,
      timestamp: new Date().toISOString(),
      documentId: selectedDocId || undefined
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    const aiMessageId = (Date.now() + 1).toString();
    const initialAiMessage: ChatMessage = {
      id: aiMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, initialAiMessage]);

    try {
      onQuery();
      let fullContent = '';
      
      const stream = geminiService.chatWithDocumentStream(
        userMsgContent,
        {
          fileUri: selectedDoc?.geminiFileUri,
          mimeType: selectedDoc?.mimeType
        },
        messages.map(m => ({ role: m.role, content: m.content })),
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
      setMessages(prev => 
        prev.map(m => m.id === aiMessageId ? { ...m, content: "Error: The AI failed to respond. Please check your connection." } : m)
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-6">
      <div className="w-72 flex flex-col gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col h-full overflow-hidden">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Context Selection</h2>
          <div className="flex-1 overflow-y-auto space-y-2 pr-2">
            <button
              onClick={() => setSelectedDocId(null)}
              className={`w-full text-left p-3 rounded-xl border transition-all text-sm group ${
                selectedDocId === null 
                  ? 'bg-indigo-600 border-indigo-600 text-white' 
                  : 'bg-white border-slate-100 text-slate-700 hover:border-indigo-200 hover:bg-indigo-50/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <Zap className={`w-4 h-4 ${selectedDocId === null ? 'text-indigo-200' : 'text-slate-400 group-hover:text-indigo-500'}`} />
                <span className="font-medium">General Knowledge</span>
              </div>
            </button>
            
            <div className="my-4 border-t border-slate-100 pt-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">My Curriculum</p>
              {documents.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No documents available.</p>
              ) : (
                documents.map(doc => (
                  <button
                    key={doc.id}
                    onClick={() => setSelectedDocId(doc.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all text-sm group mb-2 ${
                      selectedDocId === doc.id 
                        ? 'bg-indigo-600 border-indigo-600 text-white' 
                        : 'bg-white border-slate-100 text-slate-700 hover:border-indigo-200 hover:bg-indigo-50/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <FileText className={`w-4 h-4 shrink-0 ${selectedDocId === doc.id ? 'text-indigo-200' : 'text-slate-400 group-hover:text-indigo-500'}`} />
                      <span className="truncate font-medium">{doc.name}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100">
             <div className="bg-emerald-50 text-emerald-700 p-3 rounded-xl text-xs flex items-start gap-2">
               <Check className="w-4 h-4 shrink-0 mt-0.5" />
               <p>AI Focus: {selectedDoc ? 'Document Data' : 'Pedagogical Framework'}</p>
             </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Pedagogical Assistant</h3>
              <p className="text-xs text-emerald-600 font-medium">Context: {selectedDoc?.name || 'Global'}</p>
            </div>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/30">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto opacity-50">
              <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-4 shadow-sm">
                <Send className="w-8 h-8 text-indigo-400" />
              </div>
              <h4 className="font-bold text-slate-800">Direct Document Analysis</h4>
              <p className="text-sm text-slate-500 mt-2">Gemini is processing your selected file directly via URI.</p>
            </div>
          )}
          
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center ${m.role === 'user' ? 'bg-indigo-100' : 'bg-emerald-100'}`}>
                  {m.role === 'user' ? <User className="w-4 h-4 text-indigo-600" /> : <Bot className="w-4 h-4 text-emerald-600" />}
                </div>
                <div className={`p-4 rounded-2xl text-sm leading-relaxed shadow-sm whitespace-pre-wrap ${
                  m.role === 'user' 
                    ? 'bg-indigo-600 text-white rounded-tr-none' 
                    : 'bg-white text-slate-800 border border-slate-100 rounded-tl-none'
                }`}>
                  {m.content || (isLoading && m.role === 'assistant' ? "..." : "")}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-100 bg-white">
          {!canQuery && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-3 text-rose-700">
              <AlertCircle className="w-5 h-5" />
              <p className="text-xs font-bold uppercase tracking-wider">AI Limit Reached</p>
            </div>
          )}
          <div className="relative flex items-center gap-2">
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              disabled={!canQuery}
              placeholder={!canQuery ? "Query limit reached..." : (selectedDoc ? `Consult "${selectedDoc.name}"...` : "Type a message...")}
              className="w-full pl-4 pr-12 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all disabled:opacity-50"
            />
            <button 
              onClick={handleSend}
              disabled={isLoading || !input.trim() || !canQuery}
              className="absolute right-2 p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 shadow-lg shadow-indigo-600/20"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chat;
