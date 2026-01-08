
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Bot, FileText, Sparkles, AlertCircle, RefreshCw } from 'lucide-react';
import { ChatMessage, Document, NeuralBrain, UserProfile } from '../types';
import { geminiService } from '../services/geminiService';
import { adaptiveService } from '../services/adaptiveService';
import { MessageItem } from '../components/chat/MessageItem';
import { ChatInput } from '../components/chat/ChatInput';
import { SuggestedPrompts } from '../components/chat/SuggestedPrompts';
import { PedagogyToolbar } from '../components/pedagogy/PedagogyToolbar';
import { ValidationPanel } from '../components/pedagogy/ValidationPanel';
import { validateLessonStructure, LessonValidation } from '../lib/pedagogy/pedagogy-engine';

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
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [currentValidation, setCurrentValidation] = useState<LessonValidation | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectedDoc = documents.find(d => d.id === selectedDocId);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isLoading, currentValidation]);

  const handleToolSelect = (tool: string) => {
    if (activeTool === tool) {
      setActiveTool(null);
      setCurrentValidation(null);
      return;
    }
    setActiveTool(tool);
    
    // Auto-validate last assistant message
    if (tool === 'validate') {
      const lastAiMsg = [...messages].reverse().find(m => m.role === 'assistant');
      if (lastAiMsg?.content) {
        setCurrentValidation(validateLessonStructure(lastAiMsg.content));
      }
    }
  };

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
    setCurrentValidation(null);

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
      
      // Post-process with validation if tool is active
      if (activeTool === 'validate') {
        setCurrentValidation(validateLessonStructure(fullContent));
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
      <div className="flex items-center gap-4 px-6 py-3 border-b border-slate-200 dark:border-white/5 shrink-0 bg-white/80 dark:bg-[#0a0a0a]/80 backdrop-blur-md sticky top-0 z-20 overflow-x-auto scrollbar-hide">
        <div className="flex items-center gap-2 pr-4 border-r border-slate-200 dark:border-white/10 shrink-0">
          <button
            onClick={() => setSelectedDocId(null)}
            className={`shrink-0 px-4 py-1.5 rounded-full text-[11px] font-bold tracking-tight transition-all border ${
              selectedDocId === null 
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' 
                : 'bg-white dark:bg-white/5 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/5'
            }`}
          >
            General AI
          </button>
        </div>
        
        <div className="flex-1 flex items-center gap-2 overflow-x-auto scrollbar-hide">
          {documents.map(doc => (
            <button
              key={doc.id}
              onClick={() => setSelectedDocId(doc.id)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-[11px] font-bold tracking-tight transition-all flex items-center gap-2 border ${
                selectedDocId === doc.id 
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' 
                  : 'bg-white dark:bg-white/5 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/5'
              }`}
            >
              <FileText size={12} />
              <span className="max-w-[140px] truncate">{doc.name}</span>
            </button>
          ))}
        </div>

        <PedagogyToolbar onToolSelect={handleToolSelect} activeTool={activeTool} />
      </div>

      {/* Messages Scroll Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar px-4 pt-10 pb-4">
        <div className="max-w-3xl mx-auto">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-8 animate-in fade-in duration-700">
              <div className="relative">
                <div className="w-20 h-20 bg-indigo-600 text-white rounded-[24px] flex items-center justify-center shadow-2xl relative z-10">
                  <Bot size={40} />
                </div>
                <div className="absolute inset-0 bg-indigo-600 rounded-[24px] blur-2xl opacity-20 -z-10 animate-pulse" />
              </div>
              
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">How can I help you today?</h2>
                <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto text-sm">
                  Your pedagogical partner is ready. Start a lesson plan, analyze curriculum, or generate assessments.
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
              
              {currentValidation && (
                <div className="max-w-3xl mx-auto mt-6 px-12">
                   <ValidationPanel validation={currentValidation} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Input Section */}
      <div className="shrink-0">
        {!canQuery && (
          <div className="max-w-2xl mx-auto mb-2 px-4 py-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/50 rounded-2xl flex items-center gap-3 text-rose-800 dark:text-rose-400 text-xs font-bold animate-in slide-in-from-bottom-2">
            <AlertCircle size={16} />
            Neural limit reached. Upgrade for unlimited synthesis.
          </div>
        )}
        <ChatInput onSend={handleSend} isLoading={isLoading} disabled={!canQuery} />
      </div>
    </div>
  );
};

export default Chat;
