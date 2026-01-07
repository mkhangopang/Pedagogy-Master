
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Bot, FileText, Sparkles, AlertCircle } from 'lucide-react';
import { ChatMessage, Document, NeuralBrain, UserProfile } from '../types';
import { geminiService } from '../services/geminiService';
import { adaptiveService } from '../services/adaptiveService';
import { MessageItem } from '../components/chat/MessageItem';
import { ChatInput } from '../components/chat/ChatInput';
import { SuggestedPrompts } from '../components/chat/SuggestedPrompts';

interface ChatProps {
  brain: NeuralBrain;
  documents: Document[];
  onQuery: () => void;
  canQuery: boolean;
  user: UserProfile;
}

const Chat: React.FC<ChatProps> = ({ brain, documents, onQuery, canQuery, user }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectedDoc = documents.find(d => d.id === selectedDocId);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  const handleSend = async (msgContent: string) => {
    if (!msgContent.trim() || isLoading || !canQuery) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: msgContent,
      timestamp: new Date().toISOString(),
      documentId: selectedDocId || undefined
    };

    setMessages(prev => [...prev, userMessage]);
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
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === aiMessageId ? { ...m, content: "Neural sync interrupted." } : m));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] lg:h-[calc(100vh-40px)] bg-slate-50 dark:bg-[#0a0a0a] relative overflow-hidden">
      {/* Context Selection Header */}
      <div className="flex items-center gap-2 overflow-x-auto px-6 py-3 border-b border-slate-200 dark:border-white/5 scrollbar-hide shrink-0 bg-white/80 dark:bg-[#0a0a0a]/80 backdrop-blur-md sticky top-0 z-20">
        <button
          onClick={() => setSelectedDocId(null)}
          className={`shrink-0 px-4 py-1.5 rounded-full text-[11px] font-bold tracking-tight transition-all border ${
            selectedDocId === null 
              ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20' 
              : 'bg-white dark:bg-white/5 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/5 hover:border-indigo-500/50'
          }`}
        >
          General Intelligence
        </button>
        {documents.map(doc => (
          <button
            key={doc.id}
            onClick={() => setSelectedDocId(doc.id)}
            className={`shrink-0 px-4 py-1.5 rounded-full text-[11px] font-bold tracking-tight transition-all flex items-center gap-2 border ${
              selectedDocId === doc.id 
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20' 
                : 'bg-white dark:bg-white/5 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/5 hover:border-indigo-500/50'
            }`}
          >
            <FileText size={12} />
            <span className="max-w-[140px] truncate">{doc.name}</span>
          </button>
        ))}
      </div>

      {/* Messages Scroll Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar px-4 pt-10 pb-4">
        <div className="max-w-3xl mx-auto">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-8 animate-in fade-in duration-700">
              <div className="relative">
                <div className="w-20 h-20 bg-indigo-600 text-white rounded-[24px] flex items-center justify-center shadow-2xl shadow-indigo-500/40 relative z-10">
                  <Bot size={40} />
                </div>
                <div className="absolute inset-0 bg-indigo-600 rounded-[24px] blur-2xl opacity-20 -z-10 animate-pulse" />
              </div>
              
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">How can I help you today?</h2>
                <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto text-sm">
                  Your pedagogical partner is ready. Select a document for specialized context or start a general chat.
                </p>
              </div>

              <SuggestedPrompts onSelect={handleSend} />
            </div>
          ) : (
            <div className="space-y-2">
              {messages.map((m, idx) => (
                <MessageItem 
                  key={m.id} 
                  id={m.id} 
                  role={m.role} 
                  content={m.content} 
                  timestamp={m.timestamp} 
                  isLatest={idx === messages.length - 1} 
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Input Section */}
      <div className="shrink-0">
        {!canQuery && (
          <div className="max-w-2xl mx-auto mb-2 px-4 py-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/50 rounded-2xl flex items-center gap-3 text-rose-800 dark:text-rose-400 text-xs font-bold animate-in slide-in-from-bottom-2">
            <AlertCircle size={16} />
            Neural limit reached. Upgrade to Pro for unlimited synthesis.
          </div>
        )}
        <ChatInput onSend={handleSend} isLoading={isLoading} disabled={!canQuery} />
      </div>
    </div>
  );
};

export default Chat;
