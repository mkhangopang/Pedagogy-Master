'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, ClipboardCheck, BookOpen, Layers, ArrowLeft, Loader2, 
  Bot, Target, FileText, Check, Copy, Download, Share2, GitMerge,
  Maximize2, LayoutPanelLeft, Edit3, Save, FileJson, Globe, ArrowRight,
  MessageSquare, FileEdit, ChevronLeft, Search, Zap
} from 'lucide-react';
import { geminiService } from '../services/geminiService';
import { adaptiveService } from '../services/adaptiveService';
import { NeuralBrain, Document, UserProfile } from '../types';
import { ChatInput } from '../components/chat/ChatInput';
import { MessageItem } from '../components/chat/MessageItem';
import { SuggestedPrompts } from '../components/chat/SuggestedPrompts';
import { marked } from 'marked';

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
  const [canvasContent, setCanvasContent] = useState<string>('');
  const [viewMode, setViewMode] = useState<'split' | 'chat' | 'canvas'>('split');
  const [mobileActiveTab, setMobileActiveTab] = useState<'logs' | 'artifact'>('logs');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Inner Document Selector
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeDoc = documents.find(d => d.isSelected);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isGenerating]);

  const handleGenerate = async (userInput: string) => {
    if (!userInput.trim() || isGenerating || !canQuery) return;
    
    // Default to "general-chat" if no specific tool is active
    const effectiveTool = activeTool || 'general-chat';
    if (!activeTool) setActiveTool('general-chat');

    setIsGenerating(true);
    const userMsg = { id: crypto.randomUUID(), role: 'user', content: userInput, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);

    const aiMsgId = crypto.randomUUID();
    setMessages(prev => [...prev, { id: aiMsgId, role: 'assistant', content: '', timestamp: new Date().toISOString() }]);

    try {
      onQuery();
      let fullContent = '';
      
      if (window.innerWidth < 768) setMobileActiveTab('artifact');

      const stream = geminiService.generatePedagogicalToolStream(
        effectiveTool, 
        userInput, 
        { base64: activeDoc?.base64Data, mimeType: activeDoc?.mimeType, filePath: activeDoc?.filePath }, 
        brain,
        user,
        activeDoc?.id
      );

      for await (const chunk of stream) {
        if (chunk) {
          fullContent += chunk;
          setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: fullContent } : m));
          setCanvasContent(fullContent); 
        }
      }
      await adaptiveService.captureGeneration(user.id, effectiveTool, fullContent, { tool: effectiveTool });
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: "Synthesis gate error. Grid bottleneck detected." } : m));
    } finally {
      setIsGenerating(false);
    }
  };

  const toolDefinitions = [
    { id: 'lesson-plan', name: 'Lesson Plan', icon: BookOpen, desc: '5E Instructional Flow', color: 'bg-indigo-600' },
    { id: 'assessment', name: 'Assessment', icon: ClipboardCheck, desc: 'Standards-aligned MCQ/CRQ', color: 'bg-emerald-600' },
    { id: 'rubric', name: 'Rubric', icon: Layers, desc: 'Bloom-scaled Criteria', color: 'bg-amber-600' },
    { id: 'learning-path', name: 'Pathways', icon: GitMerge, desc: 'Prerequisite Sequencing', color: 'bg-purple-600' },
    { id: 'slo-tagger', name: 'Syllabus Audit', icon: Target, desc: 'Standards Mapping', color: 'bg-rose-600' },
    { id: 'general-chat', name: 'Free Chat', icon: MessageSquare, desc: 'General Pedagogical AI', color: 'bg-slate-700' },
  ];

  // Tool Entry Grid (The "Synthesis Hub")
  if (!activeTool) {
    return (
      <div className="max-w-5xl mx-auto w-full pt-8 pb-20 px-4">
        <div className="flex items-center gap-6 mb-12">
          <div className="p-4 bg-indigo-600 rounded-[2rem] text-white shadow-2xl shadow-indigo-600/20">
            <Zap size={32} />
          </div>
          <div>
            <h1 className="text-3xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tighter">Synthesis Hub</h1>
            <p className="text-slate-500 font-medium text-sm md:text-lg mt-1 italic">
              {activeDoc ? `Anchored to: ${activeDoc.name}` : 'Ready for general pedagogical assistance.'}
            </p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {toolDefinitions.map((tool) => (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              className="p-8 bg-white dark:bg-[#111] border border-slate-200 dark:border-white/5 rounded-[3rem] hover:border-indigo-500 transition-all text-left flex flex-col gap-6 group shadow-sm hover:shadow-2xl hover:-translate-y-1"
            >
              <div className={`w-14 h-14 ${tool.color} rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-600/10`}>
                <tool.icon size={28} />
              </div>
              <div>
                <h3 className="font-bold text-xl text-slate-900 dark:text-white">{tool.name}</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 font-medium leading-relaxed">{tool.desc}</p>
              </div>
              <div className="mt-auto flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all">
                Initialize node <ArrowRight size={12} />
              </div>
            </button>
          ))}
        </div>

        <div className="space-y-6">
           <div className="flex items-center gap-3 px-2">
              <Sparkles size={16} className="text-indigo-600" />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Direct Synthesis</span>
           </div>
           <SuggestedPrompts onSelect={handleGenerate} />
           <div className="pt-4">
              <ChatInput onSend={handleGenerate} isLoading={isGenerating} placeholder="Or just describe what you need here..." />
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] lg:h-[calc(100vh-64px)] bg-slate-50 dark:bg-[#080808] relative overflow-hidden">
      
      {/* TOOLBAR HEADER */}
      <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-slate-200 dark:border-white/5 bg-white/80 dark:bg-[#0a0a0a]/80 backdrop-blur-md z-30">
        <div className="flex items-center gap-3 md:gap-6">
          <button onClick={() => {setActiveTool(null); setMessages([]); setCanvasContent('');}} className="p-2 md:p-2.5 bg-slate-100 dark:bg-white/5 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-xl transition-all">
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-3">
            <div className={`p-2 ${toolDefinitions.find(t => t.id === activeTool)?.color || 'bg-indigo-600'} text-white rounded-xl shadow-lg shadow-indigo-600/20`}><Sparkles size={16} /></div>
            <div>
              <span className="font-black text-xs md:text-sm text-slate-900 dark:text-white tracking-tight uppercase">{activeTool.replace('-', ' ')}</span>
              <p className="text-[8px] md:text-[9px] font-bold text-emerald-500 uppercase tracking-widest">Neural Mode: Gemini 3 Thinking</p>
            </div>
          </div>
        </div>

        {/* Desktop View Switcher */}
        <div className="hidden md:flex items-center gap-2 bg-slate-100 dark:bg-white/5 p-1 rounded-xl border dark:border-white/5">
          <button onClick={() => setViewMode('chat')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${viewMode === 'chat' ? 'bg-white dark:bg-slate-800 shadow-sm text-indigo-600' : 'text-slate-400'}`}>Logs</button>
          <button onClick={() => setViewMode('split')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${viewMode === 'split' ? 'bg-white dark:bg-slate-800 shadow-sm text-indigo-600' : 'text-slate-400'}`}>Workspace</button>
          <button onClick={() => setViewMode('canvas')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${viewMode === 'canvas' ? 'bg-white dark:bg-slate-800 shadow-sm text-indigo-600' : 'text-slate-400'}`}>Artifact</button>
        </div>

        {/* Mobile View Switcher */}
        <div className="flex md:hidden items-center gap-2 bg-slate-100 dark:bg-white/5 p-1 rounded-xl">
           <button onClick={() => setMobileActiveTab('logs')} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${mobileActiveTab === 'logs' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>Logs</button>
           <button onClick={() => setMobileActiveTab('artifact')} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${mobileActiveTab === 'artifact' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>Canvas</button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* SIDEBAR: Strategy Logs */}
        <div className={`
          flex flex-col border-r border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-[#0d0d0d] transition-all duration-500
          ${viewMode === 'chat' ? 'w-full' : 'w-full md:w-[380px] lg:w-[450px] shrink-0'}
          ${viewMode === 'canvas' ? 'hidden' : 'flex'}
          ${mobileActiveTab === 'artifact' ? 'hidden md:flex' : 'flex'}
        `}>
          <div className="px-6 py-4 border-b border-slate-200 dark:border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
               <MessageSquare size={14} className="text-slate-400" />
               <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Strategy Logs</span>
            </div>
            {activeDoc && (
               <div className="px-2 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-md flex items-center gap-1.5">
                  <Globe size={10} className="text-indigo-400" />
                  <span className="text-[9px] font-bold text-indigo-500 truncate max-w-[80px]">{activeDoc.name}</span>
               </div>
            )}
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-6 opacity-40">
                <Bot size={48} className="text-slate-300" />
                <p className="text-xs md:text-sm font-medium text-slate-400 max-w-[200px]">Prompt the engine to begin synthesizing curriculum nodes.</p>
              </div>
            ) : (
              messages.map((m) => (
                <MessageItem key={m.id} id={m.id} role={m.role} content={m.content} timestamp={m.timestamp} />
              ))
            )}
          </div>
          <div className="p-4 border-t dark:border-white/5">
            <ChatInput 
              onSend={handleGenerate} 
              isLoading={isGenerating} 
              placeholder={activeTool === 'general-chat' ? "Ask anything..." : `Enhance the ${activeTool.replace('-', ' ')}...`} 
            />
          </div>
        </div>

        {/* MAIN: High-Fidelity Canvas */}
        <div className={`
          flex-1 flex flex-col bg-white dark:bg-[#0a0a0a] transition-all duration-500
          ${viewMode === 'chat' ? 'hidden' : 'flex'}
          ${mobileActiveTab === 'logs' ? 'hidden md:flex' : 'flex'}
        `}>
           <div className="px-6 md:px-8 py-4 border-b border-slate-200 dark:border-white/5 flex items-center justify-between bg-slate-50/50 dark:bg-[#0d0d0d] shrink-0">
              <div className="flex items-center gap-2 md:gap-3">
                <FileEdit size={18} className="text-indigo-600" />
                <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white">Active Artifact</span>
              </div>
              <div className="flex items-center gap-2 md:gap-3">
                 <button className="flex items-center gap-2 px-3 md:px-4 py-1.5 md:py-2 bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-300 transition-all">
                    <Download size={12} /> PDF
                 </button>
                 <button className="flex items-center gap-2 px-4 md:px-6 py-1.5 md:py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-600/20 active:scale-95">
                    <Save size={12} /> Finalize
                 </button>
              </div>
           </div>

           <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-12 lg:p-20 bg-slate-50/20 dark:bg-[#0a0a0a]">
              <div className="max-w-4xl mx-auto bg-white dark:bg-[#111] p-8 md:p-12 lg:p-16 rounded-[2rem] shadow-sm border border-slate-100 dark:border-white/5 min-h-full relative">
                <div className="prose dark:prose-invert max-w-none text-sm md:text-base leading-loose">
                  {canvasContent ? (
                    <div dangerouslySetInnerHTML={{ __html: marked.parse(canvasContent.split('--- Synthesis by Node:')[0]) }} />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full py-40 text-center space-y-6">
                      <div className="w-20 h-20 bg-slate-50 dark:bg-white/5 rounded-full flex items-center justify-center text-slate-200">
                        <Edit3 size={40} />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-slate-300">Workspace Pending Initialization</h2>
                        <p className="text-sm text-slate-400 max-w-xs mt-2 mx-auto">Instruct the synthesis node to generate standard-aligned content in the Strategy Logs.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default Tools;