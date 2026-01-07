
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, ClipboardCheck, BookOpen, Layers, ArrowLeft, Loader2, 
  Bot, Target, FileText, Check, Copy, Download, Share2
} from 'lucide-react';
import { geminiService } from '../services/geminiService';
import { adaptiveService } from '../services/adaptiveService';
import { NeuralBrain, Document, UserProfile } from '../types';
import { ChatInput } from '../components/chat/ChatInput';
import { MessageItem } from '../components/chat/MessageItem';
import { SuggestedPrompts } from '../components/chat/SuggestedPrompts';

interface ToolsProps {
  brain: NeuralBrain;
  documents: Document[];
  onQuery: () => void;
  canQuery: boolean;
  user: UserProfile;
}

const Tools: React.FC<ToolsProps> = ({ brain, documents, onQuery, canQuery, user }) => {
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectedDoc = documents.find(d => d.id === selectedDocId);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isGenerating]);

  const handleGenerate = async (userInput: string) => {
    if (!activeTool || !userInput.trim() || isGenerating || !canQuery) return;
    
    setIsGenerating(true);
    const userMsg = { id: crypto.randomUUID(), role: 'user', content: userInput, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);

    const aiMsgId = crypto.randomUUID();
    setMessages(prev => [...prev, { id: aiMsgId, role: 'assistant', content: '', timestamp: new Date().toISOString() }]);

    try {
      onQuery();
      let fullContent = '';
      const stream = geminiService.generatePedagogicalToolStream(
        activeTool, 
        userInput, 
        { base64: selectedDoc?.base64Data, mimeType: selectedDoc?.mimeType, filePath: selectedDoc?.filePath }, 
        brain,
        user
      );

      for await (const chunk of stream) {
        if (chunk) {
          fullContent += chunk;
          setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: fullContent } : m));
        }
      }
      await adaptiveService.captureGeneration(user.id, activeTool, fullContent, { tool: activeTool });
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: "Synthesis error." } : m));
    } finally {
      setIsGenerating(false);
    }
  };

  const toolDefinitions = [
    { id: 'lesson-plan', name: 'Lesson Plan', icon: BookOpen, desc: 'Detailed pedagogical flow' },
    { id: 'assessment', name: 'Assessment', icon: ClipboardCheck, desc: 'Balanced query sets' },
    { id: 'rubric', name: 'Rubric', icon: Layers, desc: 'Criteria & Leveling' },
    { id: 'slo-tagger', name: 'SLO Tagger', icon: Target, desc: 'Extract & Map Outcomes' },
  ];

  if (!activeTool) {
    return (
      <div className="max-w-4xl mx-auto w-full pt-8 pb-20 px-4">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2 tracking-tight">Pedagogical Toolkit</h1>
        <p className="text-slate-500 dark:text-slate-400 mb-10">Select a specialized engine to synthesize academic artifacts.</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {toolDefinitions.map((tool) => (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              className="p-8 bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/5 rounded-[32px] hover:border-indigo-600 transition-all text-left flex items-center gap-6 group shadow-sm hover:shadow-xl active:scale-[0.98]"
            >
              <div className="w-14 h-14 bg-slate-100 dark:bg-white/5 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-all shrink-0">
                <tool.icon size={24} />
              </div>
              <div>
                <h3 className="font-bold text-lg text-slate-900 dark:text-white">{tool.name}</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">{tool.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] lg:h-[calc(100vh-40px)] bg-slate-50 dark:bg-[#0a0a0a] relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 dark:border-white/5 bg-white/80 dark:bg-[#0a0a0a]/80 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <button onClick={() => {setActiveTool(null); setMessages([]);}} className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all">
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-indigo-600 text-white rounded-lg"><Sparkles size={14} /></div>
            <span className="font-bold text-sm text-slate-900 dark:text-white tracking-tight capitalize">{activeTool.replace('-', ' ')}</span>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {documents.map(doc => (
            <button 
              key={doc.id} 
              onClick={() => setSelectedDocId(selectedDocId === doc.id ? null : doc.id)} 
              className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all shrink-0 flex items-center gap-1.5 border ${
                selectedDocId === doc.id 
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm' 
                  : 'bg-white dark:bg-white/5 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-white/5'
              }`}
            >
              <FileText size={10} />
              <span className="max-w-[100px] truncate">{doc.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Workspace Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar px-4 pt-10 pb-4">
        <div className="max-w-3xl mx-auto">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-8 animate-in fade-in duration-700">
              <div className="w-20 h-20 bg-indigo-600 text-white rounded-[24px] flex items-center justify-center shadow-2xl relative z-10">
                {React.createElement(toolDefinitions.find(t => t.id === activeTool)?.icon || Sparkles, { size: 40 })}
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Ready to generate.</h2>
                <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto text-sm">
                  Describe the parameters for your {activeTool.replace('-', ' ')}. You can iterate and refine the result after the first generation.
                </p>
              </div>
              <SuggestedPrompts type="tools" onSelect={handleGenerate} />
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((m) => (
                <MessageItem key={m.id} id={m.id} role={m.role} content={m.content} timestamp={m.timestamp} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Input Section */}
      <div className="shrink-0">
        <ChatInput 
          onSend={handleGenerate} 
          isLoading={isGenerating} 
          placeholder={`Synthesize a ${activeTool.replace('-', ' ')}...`} 
        />
      </div>
    </div>
  );
};

export default Tools;
