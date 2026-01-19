'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, ClipboardCheck, BookOpen, Layers, ArrowLeft, Loader2, 
  Bot, Target, FileText, Check, Copy, Download, Share2, GitMerge,
  Maximize2, LayoutPanelLeft, Edit3, Save, FileJson, Globe, ArrowRight,
  MessageSquare, FileEdit, ChevronLeft, Search, Zap, X, ChevronRight,
  Info, ShieldCheck, Library, Circle, CheckCircle, Layout
} from 'lucide-react';
import { geminiService } from '../services/geminiService';
import { adaptiveService } from '../services/adaptiveService';
import { NeuralBrain, Document, UserProfile } from '../types';
import { ChatInput } from '../components/chat/ChatInput';
import { MessageItem } from '../components/chat/MessageItem';
import { SuggestedPrompts } from '../components/chat/SuggestedPrompts';
import { marked } from 'marked';
import { supabase } from '../lib/supabase';

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
  
  // Slider / Context State
  const [isSliderOpen, setIsSliderOpen] = useState(false);
  const [localDocs, setLocalDocs] = useState<Document[]>(documents);
  const [isSwitchingContext, setIsSwitchingContext] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeDoc = localDocs.find(d => d.isSelected);

  useEffect(() => {
    setLocalDocs(documents);
  }, [documents]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isGenerating]);

  const toggleDocContext = async (docId: string) => {
    if (isSwitchingContext) return;
    setIsSwitchingContext(true);
    
    // Optimistic Update
    const updated = localDocs.map(d => ({ 
      ...d, 
      isSelected: d.id === docId ? !d.isSelected : false 
    }));
    setLocalDocs(updated);

    try {
      await supabase.from('documents').update({ is_selected: false }).eq('user_id', user.id);
      const target = updated.find(d => d.id === docId);
      if (target?.isSelected) {
        await supabase.from('documents').update({ is_selected: true }).eq('id', docId);
      }
      onQuery(); 
    } catch (e) {
      console.error("Context Switch Fail:", e);
    } finally {
      setIsSwitchingContext(false);
    }
  };

  const handleGenerate = async (userInput: string) => {
    if (!userInput.trim() || isGenerating || !canQuery) return;
    
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
    { id: 'slo-tagger', name: 'Audit', icon: Target, desc: 'Standards Mapping', color: 'bg-rose-600' },
  ];

  if (!activeTool) {
    return (
      <div className="max-w-5xl mx-auto w-full pt-8 pb-20 px-4 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div className="flex items-center gap-6">
            <div className="p-4 bg-indigo-600 rounded-[2rem] text-white shadow-2xl shadow-indigo-600/20">
              <Zap size={32} />
            </div>
            <div>
              <h1 className="text-3xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">Synthesis Hub</h1>
              <p className="text-slate-500 font-medium text-sm md:text-lg mt-1 italic flex items-center gap-2">
                {activeDoc ? (
                  <><ShieldCheck size={18} className="text-emerald-500" /> Anchored to: {activeDoc.name}</>
                ) : (
                  <><Info size={18} /> Ready for general pedagogical assistance.</>
                )}
              </p>
            </div>
          </div>
          
          <button 
            onClick={() => setIsSliderOpen(true)}
            className="flex items-center gap-3 px-6 py-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl text-xs font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 hover:shadow-xl transition-all active:scale-95"
          >
            <Library size={18} />
            Context
          </button>
        </div>

        {isSliderOpen && (
          <div className="fixed inset-0 z-[200] flex justify-end">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => setIsSliderOpen(false)} />
            <div className="relative w-full max-w-sm bg-white dark:bg-[#0d0d0d] h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-500">
              <div className="p-6 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 rounded-lg"><Library size={20} /></div>
                  <h3 className="font-black text-xs uppercase tracking-[0.2em] text-slate-500">Curriculum Assets</h3>
                </div>
                <button onClick={() => setIsSliderOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors"><X size={20}/></button>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
                <div className="space-y-3">
                  {localDocs.map(doc => (
                    <button
                      key={doc.id}
                      onClick={() => toggleDocContext(doc.id)}
                      className={`w-full flex items-center gap-4 p-5 rounded-[1.5rem] transition-all border text-left group ${
                        doc.isSelected 
                          ? 'bg-indigo-600/10 border-indigo-500 shadow-xl shadow-indigo-500/10 ring-1 ring-indigo-500' 
                          : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/5 text-slate-400 hover:border-indigo-400'
                      }`}
                    >
                      <div className="shrink-0 relative">
                        {doc.isSelected ? (
                          <div className="w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center text-white shadow-lg"><Check size={14} strokeWidth={4} /></div>
                        ) : (
                          <div className="w-6 h-6 border-2 border-slate-200 dark:border-white/10 rounded-full" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold truncate ${doc.isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-300'}`}>{doc.name}</p>
                        <p className="text-[10px] opacity-60 font-medium mt-0.5">{doc.subject} • {doc.gradeLevel}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-6 border-t border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-black/20">
                <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl">
                  <p className="text-[10px] text-indigo-400 font-bold leading-relaxed">
                    <span className="font-black text-indigo-600 uppercase">Pro Tip:</span> Grounding is locked to one document for maximum SLO precision. Switch assets to change context.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
        
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
                <h3 className="font-bold text-xl text-slate-900 dark:text-white uppercase tracking-tight">{tool.name}</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 font-medium leading-relaxed">{tool.desc}</p>
              </div>
              <div className="mt-auto flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all">
                Initialize node <ArrowRight size={12} />
              </div>
            </button>
          ))}
          <button
              onClick={() => setActiveTool('general-chat')}
              className="p-8 bg-slate-900 border border-white/10 rounded-[3rem] hover:border-indigo-500 transition-all text-left flex flex-col gap-6 group shadow-sm hover:shadow-2xl hover:-translate-y-1"
            >
              <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-600/10">
                <MessageSquare size={28} />
              </div>
              <div>
                <h3 className="font-bold text-xl text-white uppercase tracking-tight">General Chat</h3>
                <p className="text-slate-400 text-sm mt-1 font-medium leading-relaxed">Free-form Pedagogical Assistant</p>
              </div>
              <div className="mt-auto flex items-center gap-2 text-indigo-400 text-[10px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all">
                Launch assistant <ArrowRight size={12} />
              </div>
            </button>
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

  const currentTool = toolDefinitions.find(t => t.id === activeTool);

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] lg:h-[calc(100vh-64px)] bg-slate-50 dark:bg-[#080808] relative overflow-hidden">
      
      {/* HEADER: Matches Screenshot Design */}
      <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-slate-100 dark:border-white/5 bg-white dark:bg-[#0a0a0a] z-30">
        <div className="flex items-center gap-3 md:gap-5">
          <button onClick={() => {setActiveTool(null); setMessages([]); setCanvasContent('');}} className="p-2.5 bg-slate-50 dark:bg-white/5 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-2xl transition-all">
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 ${currentTool?.color || 'bg-indigo-600'} text-white rounded-xl shadow-lg shadow-indigo-600/20`}><Sparkles size={16} /></div>
            <div className="hidden sm:block">
              <span className="font-black text-xs md:text-sm text-slate-900 dark:text-white tracking-tight uppercase leading-none">{activeTool?.replace('-', ' ')}</span>
              <p className="text-[8px] md:text-[9px] font-bold text-emerald-500 uppercase tracking-widest mt-0.5">Neural Mode: Gemini 3 Thinking</p>
            </div>
            {/* Mobile Tool Name Display */}
            <div className="sm:hidden">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Synthesis</p>
              <p className="text-xs font-black text-slate-900 dark:text-white uppercase truncate max-w-[100px]">{activeTool?.replace('-', ' ')}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          <button 
            onClick={() => setIsSliderOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 transition-all hover:bg-slate-100"
          >
            <Library size={14} /> <span className="hidden xs:inline">Context</span>
          </button>

          {/* Desktop View Switcher */}
          <div className="hidden md:flex items-center gap-2 bg-slate-100 dark:bg-white/5 p-1 rounded-xl border dark:border-white/5">
            <button onClick={() => setViewMode('chat')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${viewMode === 'chat' ? 'bg-white dark:bg-slate-800 shadow-sm text-indigo-600' : 'text-slate-400'}`}>Logs</button>
            <button onClick={() => setViewMode('split')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${viewMode === 'split' ? 'bg-white dark:bg-slate-800 shadow-sm text-indigo-600' : 'text-slate-400'}`}>Workspace</button>
            <button onClick={() => setViewMode('canvas')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${viewMode === 'canvas' ? 'bg-white dark:bg-slate-800 shadow-sm text-indigo-600' : 'text-slate-400'}`}>Artifact</button>
          </div>

          {/* SINGLE TOGGLE BUTTON FOR MOBILE: Matches Screenshot "LOGS" Button */}
          <button 
            onClick={() => setMobileActiveTab(mobileActiveTab === 'logs' ? 'artifact' : 'logs')}
            className={`md:hidden flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 ${
              mobileActiveTab === 'artifact' ? 'bg-indigo-600 text-white shadow-indigo-600/30' : 'bg-slate-900 text-white'
            }`}
          >
            {mobileActiveTab === 'artifact' ? <><MessageSquare size={14}/> Logs</> : <><FileText size={14}/> Canvas</>}
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* CONTEXT SELECTOR DRAWER (INTERNAL) */}
        {isSliderOpen && (
          <div className="fixed inset-0 z-[200] flex justify-end">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsSliderOpen(false)} />
            <div className="relative w-full max-w-sm bg-white dark:bg-[#0d0d0d] h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-500">
              <div className="p-6 border-b dark:border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Library size={18} className="text-indigo-500" />
                  <span className="font-black text-xs uppercase tracking-widest text-slate-500">Active Library</span>
                </div>
                <button onClick={() => setIsSliderOpen(false)} className="p-2"><X size={20}/></button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                {localDocs.map(doc => (
                  <button
                    key={doc.id}
                    onClick={() => toggleDocContext(doc.id)}
                    className={`w-full flex items-center gap-4 p-5 rounded-2xl border transition-all text-left ${
                      doc.isSelected ? 'bg-indigo-600/10 border-indigo-500 shadow-lg' : 'border-slate-100 dark:border-white/5'
                    }`}
                  >
                    <div className="shrink-0">
                      {doc.isSelected ? <CheckCircle size={20} className="text-indigo-600" /> : <Circle size={20} className="text-slate-300" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate dark:text-white">{doc.name}</p>
                      <p className="text-[10px] opacity-60 font-medium">{doc.subject}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SIDEBAR: Strategy Logs (Strategy View) */}
        <div className={`
          flex flex-col border-r border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-[#0d0d0d] transition-all duration-500
          ${viewMode === 'chat' ? 'w-full' : 'w-full md:w-[380px] lg:w-[450px] shrink-0'}
          ${viewMode === 'canvas' ? 'hidden' : 'flex'}
          ${mobileActiveTab === 'artifact' ? 'hidden md:flex' : 'flex'}
        `}>
          <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between bg-white/50 dark:bg-[#0d0d0d]">
            <div className="flex items-center gap-2">
               <MessageSquare size={14} className="text-slate-400" />
               <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Strategy Logs</span>
            </div>
            {activeDoc && (
               <div className="px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-lg flex items-center gap-2">
                  <Globe size={10} className="text-indigo-400" />
                  <span className="text-[9px] font-bold text-indigo-500 truncate max-w-[100px]">{activeDoc.name}</span>
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
          <div className="p-4 border-t dark:border-white/5 bg-white dark:bg-[#0d0d0d]">
            <ChatInput 
              onSend={handleGenerate} 
              isLoading={isGenerating} 
              placeholder={activeTool === 'general-chat' ? "Ask anything..." : `Enhance the ${activeTool?.replace('-', ' ')}...`} 
            />
          </div>
        </div>

        {/* MAIN: High-Fidelity Canvas (Artifact View) */}
        <div className={`
          flex-1 flex flex-col bg-white dark:bg-[#0a0a0a] transition-all duration-500
          ${viewMode === 'chat' ? 'hidden' : 'flex'}
          ${mobileActiveTab === 'logs' ? 'hidden md:flex' : 'flex'}
        `}>
           <div className="px-6 md:px-8 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between bg-slate-50/50 dark:bg-[#0d0d0d] shrink-0">
              <div className="flex items-center gap-2 md:gap-3">
                <FileEdit size={18} className="text-indigo-600" />
                <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white">Active Artifact</span>
              </div>
              <div className="flex items-center gap-2 md:gap-3">
                 <button className="flex items-center gap-2 px-3 md:px-4 py-2 bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-300 transition-all">
                    <Download size={12} /> PDF
                 </button>
                 <button className="flex items-center gap-2 px-4 md:px-6 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-600/20 active:scale-95">
                    <Save size={12} /> Finalize
                 </button>
              </div>
           </div>

           <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-12 lg:p-20 bg-slate-50/20 dark:bg-[#0a0a0a]">
              <div className="max-w-4xl mx-auto bg-white dark:bg-[#111] p-8 md:p-12 lg:p-16 rounded-[2rem] shadow-sm border border-slate-100 dark:border-white/5 min-h-full relative animate-in fade-in duration-700">
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