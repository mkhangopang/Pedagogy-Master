'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, ClipboardCheck, BookOpen, Layers, ArrowLeft, Loader2, 
  Bot, Target, FileText, Check, Copy, Download, Share2, GitMerge,
  Maximize2, LayoutPanelLeft, Edit3, Save, FileJson, Globe, ArrowRight
} from 'lucide-react';
import { geminiService } from '../services/geminiService';
import { adaptiveService } from '../services/adaptiveService';
import { NeuralBrain, Document, UserProfile } from '../types';
import { ChatInput } from '../components/chat/ChatInput';
import { MessageItem } from '../components/chat/MessageItem';
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
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [canvasContent, setCanvasContent] = useState<string>('');
  const [showCanvas, setShowCanvas] = useState(false);
  const [viewMode, setViewMode] = useState<'split' | 'chat' | 'canvas'>('split');
  
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
      setShowCanvas(true); // Auto-show canvas on first generation
      
      const stream = geminiService.generatePedagogicalToolStream(
        activeTool, 
        userInput, 
        { base64: selectedDoc?.base64Data, mimeType: selectedDoc?.mimeType, filePath: selectedDoc?.filePath }, 
        brain,
        user,
        selectedDocId || undefined
      );

      for await (const chunk of stream) {
        if (chunk) {
          fullContent += chunk;
          setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: fullContent } : m));
          setCanvasContent(fullContent); // Live sync to canvas
        }
      }
      await adaptiveService.captureGeneration(user.id, activeTool, fullContent, { tool: activeTool });
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: "Synthesis gate error. Bottleneck detected." } : m));
    } finally {
      setIsGenerating(false);
    }
  };

  const toolDefinitions = [
    { id: 'lesson-plan', name: 'Lesson Plan', icon: BookOpen, desc: '5E Instructional Flow' },
    { id: 'assessment', name: 'Assessment', icon: ClipboardCheck, desc: 'Standards-aligned MCQ/CRQ' },
    { id: 'rubric', name: 'Rubric', icon: Layers, desc: 'Bloom-scaled Criteria' },
    { id: 'learning-path', name: 'Pathways', icon: GitMerge, desc: 'Prerequisite Sequencing' },
    { id: 'slo-tagger', name: 'Audit', icon: Target, desc: 'Standards Mapping' },
  ];

  if (!activeTool) {
    return (
      <div className="max-w-5xl mx-auto w-full pt-12 pb-20 px-6">
        <div className="flex items-center gap-4 mb-10">
          <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-xl shadow-indigo-600/20">
            <LayoutPanelLeft size={32} />
          </div>
          <div>
            <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">Pedagogical Engines</h1>
            <p className="text-slate-500 font-medium">Select a neural node to begin high-fidelity synthesis.</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {toolDefinitions.map((tool) => (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              className="p-8 bg-white dark:bg-[#111] border border-slate-200 dark:border-white/5 rounded-[2.5rem] hover:border-indigo-500 transition-all text-left flex flex-col gap-6 group shadow-sm hover:shadow-2xl hover:-translate-y-1"
            >
              <div className="w-14 h-14 bg-slate-50 dark:bg-white/5 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                <tool.icon size={28} />
              </div>
              <div>
                <h3 className="font-bold text-xl text-slate-900 dark:text-white">{tool.name}</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 font-medium leading-relaxed">{tool.desc}</p>
              </div>
              <div className="mt-auto flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all">
                Initialize Node <ArrowRight size={12} />
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] lg:h-[calc(100vh-40px)] bg-slate-50 dark:bg-[#080808] relative overflow-hidden">
      {/* Dynamic Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/5 bg-white/80 dark:bg-[#0a0a0a]/80 backdrop-blur-md z-30">
        <div className="flex items-center gap-6">
          <button onClick={() => {setActiveTool(null); setMessages([]); setCanvasContent('');}} className="p-2.5 bg-slate-100 dark:bg-white/5 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-xl transition-all">
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-600/20"><Sparkles size={16} /></div>
            <div>
              <span className="font-black text-sm text-slate-900 dark:text-white tracking-tight uppercase">{activeTool.replace('-', ' ')}</span>
              <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">Neural Mode: Gemini 3 Thinking</p>
            </div>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2 bg-slate-100 dark:bg-white/5 p-1 rounded-xl border dark:border-white/5">
          <button onClick={() => setViewMode('chat')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${viewMode === 'chat' ? 'bg-white dark:bg-slate-800 shadow-sm text-indigo-600' : 'text-slate-400'}`}>Chat Only</button>
          <button onClick={() => setViewMode('split')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${viewMode === 'split' ? 'bg-white dark:bg-slate-800 shadow-sm text-indigo-600' : 'text-slate-400'}`}>Workspace</button>
          <button onClick={() => setViewMode('canvas')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${viewMode === 'canvas' ? 'bg-white dark:bg-slate-800 shadow-sm text-indigo-600' : 'text-slate-400'}`}>Canvas Focus</button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Chat Feed (Visible in Chat & Split modes) */}
        {(viewMode === 'chat' || viewMode === 'split') && (
          <div className={`flex flex-col border-r border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-transparent transition-all duration-500 ${viewMode === 'chat' ? 'w-full' : 'w-1/3 min-w-[400px]'}`}>
            <div className="px-6 py-4 border-b border-slate-200 dark:border-white/5 flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Strategy Logs</span>
              <div className="flex gap-2">
                {selectedDoc && (
                   <div className="px-2 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-md flex items-center gap-1.5">
                      <Globe size={10} className="text-indigo-400" />
                      <span className="text-[9px] font-bold text-indigo-500 truncate max-w-[80px]">{selectedDoc.name}</span>
                   </div>
                )}
              </div>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-6 opacity-40">
                  <Bot size={48} className="text-slate-300" />
                  <p className="text-sm font-medium text-slate-400 max-w-[200px]">Prompt the engine to begin synthesizing curriculum nodes.</p>
                </div>
              ) : (
                messages.map((m) => (
                  <MessageItem key={m.id} id={m.id} role={m.role} content={m.content} timestamp={m.timestamp} />
                ))
              )}
            </div>
            <div className="p-4">
              <ChatInput 
                onSend={handleGenerate} 
                isLoading={isGenerating} 
                placeholder={`Enhance the ${activeTool.replace('-', ' ')}...`} 
              />
            </div>
          </div>
        )}

        {/* Right Side: High-Fidelity Canvas (Visible in Split & Canvas modes) */}
        {(viewMode === 'split' || viewMode === 'canvas') && (
          <div className={`flex-1 flex flex-col bg-white dark:bg-[#0a0a0a] transition-all duration-500 ${viewMode === 'canvas' ? 'w-full' : ''}`}>
             <div className="px-8 py-4 border-b border-slate-200 dark:border-white/5 flex items-center justify-between bg-slate-50/50 dark:bg-[#0d0d0d]">
                <div className="flex items-center gap-3">
                  <FileText size={18} className="text-indigo-600" />
                  <span className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white">Active Artifact</span>
                </div>
                <div className="flex items-center gap-3">
                   <button className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-lg text-[10px] font-black uppercase tracking-widest text-slate-500 transition-all">
                      <Download size={12} /> PDF
                   </button>
                   <button className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-600/20">
                      <Save size={12} /> Finalize
                   </button>
                </div>
             </div>

             <div className="flex-1 overflow-y-auto custom-scrollbar p-12 lg:p-20">
                <div className="max-w-4xl mx-auto prose dark:prose-invert">
                  {canvasContent ? (
                    <div dangerouslySetInnerHTML={{ __html: marked.parse(canvasContent.split('--- Synthesis by Node:')[0]) }} />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full py-40 text-center space-y-4">
                      <div className="w-16 h-16 bg-slate-50 dark:bg-white/5 rounded-full flex items-center justify-center text-slate-200">
                        <Edit3 size={32} />
                      </div>
                      <h2 className="text-xl font-bold text-slate-300">Workspace Empty</h2>
                      <p className="text-sm text-slate-400 max-w-sm">The generated artifact will appear here for live editing and review.</p>
                    </div>
                  )}
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Tools;