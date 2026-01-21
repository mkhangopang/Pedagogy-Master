'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, ClipboardCheck, BookOpen, Layers, ArrowLeft, Loader2, 
  Bot, Target, FileText, Check, Copy, Download, Share2, GitMerge,
  Maximize2, LayoutPanelLeft, Edit3, Save, FileJson, Globe, ArrowRight,
  MessageSquare, FileEdit, ChevronLeft, Search, Zap, X, ChevronRight,
  Info, ShieldCheck, Library, Circle, CheckCircle, Layout, Image as ImageIcon,
  Rocket
} from 'lucide-react';
import { geminiService } from '../services/geminiService';
import { adaptiveService } from '../services/adaptiveService';
import { NeuralBrain, Document, UserProfile, SubscriptionPlan } from '../types';
import { ChatInput } from '../components/chat/ChatInput';
import { MessageItem } from '../components/chat/MessageItem';
import { DocumentSelector } from '../components/chat/DocumentSelector';
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
  const [canvasImage, setCanvasImage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'split' | 'chat' | 'canvas'>('split');
  const [mobileActiveTab, setMobileActiveTab] = useState<'logs' | 'artifact'>('logs');
  
  const [isSliderOpen, setIsSliderOpen] = useState(false);
  const [localDocs, setLocalDocs] = useState<Document[]>(documents);
  const [isSwitchingContext, setIsSwitchingContext] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeDoc = localDocs.find(d => d.isSelected);

  const isEnterprise = user.plan === SubscriptionPlan.ENTERPRISE;

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
    
    // Optimistic UI Update
    const updated = localDocs.map(d => ({ 
      ...d, 
      isSelected: d.id === docId ? !d.isSelected : false 
    }));
    setLocalDocs(updated);

    try {
      const target = updated.find(d => d.id === docId);
      const shouldBeSelected = target?.isSelected || false;

      // Atomic Update Pattern: Set all to false, then target to intended state
      await supabase.from('documents').update({ is_selected: false }).eq('user_id', user.id);
      
      if (shouldBeSelected) {
        await supabase.from('documents').update({ is_selected: true }).eq('id', docId);
      }
      
      onQuery(); 
    } catch (e) {
      console.error("Context Switch Fail:", e);
      // Revert optimism on failure
      setLocalDocs(documents);
    } finally {
      setIsSwitchingContext(false);
    }
  };

  const handleGenerate = async (userInput: string) => {
    if (!userInput.trim() || isGenerating || !canQuery) return;
    
    if (activeTool === 'visual-aid' && isEnterprise) {
      setIsGenerating(true);
      setCanvasImage(null);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
          body: JSON.stringify({ task: 'generate-visual', userInput, toolType: activeDoc?.subject || 'general' })
        });
        const data = await res.json();
        if (data.imageUrl) {
          setCanvasImage(data.imageUrl);
          setMessages(prev => [...prev, { 
            id: crypto.randomUUID(), 
            role: 'assistant', 
            content: "Neural Visual Aid synthesized successfully. See the Canvas.", 
            timestamp: new Date().toISOString() 
          }]);
          if (window.innerWidth < 768) setMobileActiveTab('artifact');
        } else {
           alert(data.error || "Visual synthesis failed.");
        }
      } catch (e) { 
        console.error(e); 
      } finally { 
        setIsGenerating(false); 
        return; 
      }
    }

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
      
      // Crucial: Use current activeDoc from state for immediate request payload
      const stream = geminiService.generatePedagogicalToolStream(
        effectiveTool, 
        userInput, 
        { 
          base64: activeDoc?.base64Data, 
          mimeType: activeDoc?.mimeType, 
          filePath: activeDoc?.filePath,
          id: activeDoc?.id 
        }, 
        brain, 
        user, 
        activeDoc?.id // Passing explicitly as priorityDocumentId
      );

      for await (const chunk of stream) {
        if (chunk) {
          fullContent += chunk;
          setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: fullContent } : m));
          setCanvasContent(fullContent); 
        }
      }
      await adaptiveService.captureGeneration(user.id, effectiveTool, fullContent, { tool: effectiveTool, document_id: activeDoc?.id });
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: "Synthesis gate error. Neural grid under high load." } : m));
    } finally { 
      setIsGenerating(false); 
    }
  };

  const toolDefinitions = [
    { id: 'lesson-plan', name: 'Lesson Plan', icon: BookOpen, desc: '5E Instructional Flow', color: 'bg-indigo-600' },
    { id: 'assessment', name: 'Assessment', icon: ClipboardCheck, desc: 'Standards-aligned MCQ/CRQ', color: 'bg-emerald-600' },
    { id: 'rubric', name: 'Rubric', icon: Layers, desc: 'Bloom-scaled Criteria', color: 'bg-amber-600' },
    { id: 'visual-aid', name: 'Visual Aid', icon: ImageIcon, desc: 'Enterprise Diagram Node', color: 'bg-rose-600', enterprise: true },
    { id: 'learning-path', name: 'Pathways', icon: GitMerge, desc: 'Prerequisite Sequencing', color: 'bg-purple-600' },
  ];

  if (!activeTool) {
    return (
      <div className="max-w-5xl mx-auto w-full pt-8 pb-20 px-4 animate-in fade-in duration-500">
        {isSliderOpen && (
          <>
            <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[100] animate-in fade-in duration-300" onClick={() => setIsSliderOpen(false)} />
            <div className="fixed top-0 right-0 h-full w-full max-w-sm bg-white dark:bg-[#0d0d0d] z-[110] shadow-2xl animate-in slide-in-from-right duration-500 flex flex-col border-l border-slate-200 dark:border-white/5">
              <div className="p-8 border-b border-slate-100 dark:border-white/5 flex items-center justify-between bg-slate-50 dark:bg-[#0a0a0a]">
                <div>
                  <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Active Context</h2>
                  <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mt-1">Curriculum Library</p>
                </div>
                <button onClick={() => setIsSliderOpen(false)} className="p-3 hover:bg-slate-200 dark:hover:bg-white/10 rounded-2xl transition-all text-slate-400 hover:text-slate-900 dark:hover:text-white"><X size={24}/></button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                <DocumentSelector documents={localDocs} onToggle={toggleDocContext} />
                {localDocs.length === 0 && (
                  <div className="py-20 text-center opacity-40">
                    <FileText size={48} className="mx-auto mb-4" />
                    <p className="text-sm font-bold uppercase tracking-widest">Library Empty</p>
                  </div>
                )}
              </div>
              <div className="p-8 border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-[#0a0a0a]">
                 <p className="text-[10px] text-slate-400 font-bold leading-relaxed text-center">
                   Select a document to anchor synthesis. Only one asset can be active for maximum precision.
                 </p>
              </div>
            </div>
          </>
        )}

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div className="flex items-center gap-6">
            <div className="p-4 bg-indigo-600 rounded-[2rem] text-white shadow-2xl shadow-indigo-600/20"><Zap size={32} /></div>
            <div>
              <h1 className="text-3xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">Synthesis Hub</h1>
              <p className="text-slate-500 font-medium text-sm md:text-lg mt-1 italic flex items-center gap-2">
                {activeDoc ? (
                  <><ShieldCheck size={18} className="text-emerald-500" /> Anchored to: <span className="text-slate-900 dark:text-white font-bold">{activeDoc.name}</span></>
                ) : (
                  <><Info size={18} /> Ready for general pedagogical assistance.</>
                )}
              </p>
            </div>
          </div>
          <button 
            onClick={() => setIsSliderOpen(true)} 
            className="flex items-center gap-3 px-8 py-4 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 hover:shadow-xl hover:-translate-y-0.5 transition-all active:scale-95 shadow-sm"
          >
            <Library size={18} /> 
            Context Settings
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {toolDefinitions.map((tool) => (
            <button
              key={tool.id}
              onClick={() => {
                if (tool.enterprise && !isEnterprise) { 
                  alert("Enterprise node required for Neural Vision features."); 
                  return; 
                }
                setActiveTool(tool.id);
              }}
              className={`p-8 rounded-[3rem] border transition-all text-left flex flex-col gap-6 group shadow-sm hover:shadow-2xl hover:-translate-y-1 ${
                tool.enterprise && !isEnterprise 
                  ? 'bg-slate-50 dark:bg-slate-900/50 grayscale border-dashed border-slate-300' 
                  : 'bg-white dark:bg-[#111] border-slate-200 dark:border-white/5 hover:border-indigo-500'
              }`}
            >
              <div className={`w-14 h-14 ${tool.color} rounded-2xl flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform`}>
                <tool.icon size={28} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-xl text-slate-900 dark:text-white uppercase tracking-tight">{tool.name}</h3>
                  {tool.enterprise && <span className="bg-amber-400 text-white text-[8px] font-black px-1.5 py-0.5 rounded uppercase">PRO</span>}
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 font-medium leading-relaxed">{tool.desc}</p>
              </div>
              <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                <ArrowRight size={20} className="text-indigo-600" />
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const currentTool = toolDefinitions.find(t => t.id === activeTool);

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] lg:h-[calc(100vh-64px)] bg-slate-50 dark:bg-[#080808] relative overflow-hidden">
      <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-slate-100 dark:border-white/5 bg-white dark:bg-[#0a0a0a] z-30">
        <div className="flex items-center gap-3 md:gap-5">
          <button 
            onClick={() => {setActiveTool(null); setMessages([]); setCanvasContent(''); setCanvasImage(null);}} 
            className="p-2.5 bg-slate-50 dark:bg-white/5 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-2xl transition-all"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 ${currentTool?.color || 'bg-indigo-600'} text-white rounded-xl shadow-lg`}><Sparkles size={16} /></div>
            <div className="hidden sm:block">
              <span className="font-black text-xs md:text-sm text-slate-900 dark:text-white tracking-tight uppercase">{activeTool?.replace('-', ' ')}</span>
              <p className="text-[8px] md:text-[9px] font-bold text-emerald-500 uppercase tracking-widest mt-0.5">
                Neural Mode: {activeTool === 'visual-aid' ? 'Gemini Vision 2.5' : 'Gemini 3 Pro'}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          <button 
            onClick={() => setIsSliderOpen(true)} 
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 transition-all hover:bg-slate-100 shadow-sm"
          >
            <Library size={14} /> <span className="hidden xs:inline">Context</span>
          </button>
          <button 
            onClick={() => setMobileActiveTab(mobileActiveTab === 'logs' ? 'artifact' : 'logs')} 
            className={`md:hidden flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg ${mobileActiveTab === 'artifact' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-white'}`}
          >
            {mobileActiveTab === 'artifact' ? <><MessageSquare size={14}/> Logs</> : <><FileText size={14}/> Canvas</>}
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className={`flex flex-col border-r border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-[#0d0d0d] transition-all duration-500 ${viewMode === 'chat' ? 'w-full' : 'w-full md:w-[380px] lg:w-[450px] shrink-0'} ${viewMode === 'canvas' ? 'hidden' : 'flex'} ${mobileActiveTab === 'artifact' ? 'hidden md:flex' : 'flex'}`}>
          <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between bg-white/50 dark:bg-[#0d0d0d]">
            <div className="flex items-center gap-2">
              <MessageSquare size={14} className="text-slate-400" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Strategy Logs</span>
            </div>
            {activeDoc && (
              <div className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[8px] font-black text-emerald-500 uppercase">
                Grounded
              </div>
            )}
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-6 opacity-40">
                <Bot size={48} className="text-slate-300" />
                <p className="text-xs md:text-sm font-medium text-slate-400 max-w-[200px]">Prompt the engine to begin synthesis.</p>
              </div>
            ) : (
              messages.map((m) => (
                <MessageItem key={m.id} id={m.id} role={m.role} content={m.content} timestamp={m.timestamp} />
              ))
            )}
            {isGenerating && (
              <div className="flex justify-center py-4">
                <Loader2 size={24} className="animate-spin text-indigo-500 opacity-50" />
              </div>
            )}
          </div>
          <div className="p-4 border-t dark:border-white/5 bg-white dark:bg-[#0d0d0d]">
            <ChatInput 
              onSend={handleGenerate} 
              isLoading={isGenerating} 
              placeholder={activeTool === 'visual-aid' ? "Describe the diagram or concept..." : "Enhance the synthesis..."} 
            />
          </div>
        </div>

        <div className={`flex-1 flex flex-col bg-white dark:bg-[#0a0a0a] transition-all duration-500 ${viewMode === 'chat' ? 'hidden' : 'flex'} ${mobileActiveTab === 'logs' ? 'hidden md:flex' : 'flex'}`}>
           <div className="px-6 md:px-8 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between bg-slate-50/50 dark:bg-[#0d0d0d] shrink-0">
              <div className="flex items-center gap-2 md:gap-3">
                <FileEdit size={18} className="text-indigo-600" />
                <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white">Active Artifact</span>
              </div>
              <div className="flex items-center gap-2">
                 <button onClick={() => {
                   const clean = canvasContent.split('---')[0];
                   navigator.clipboard.writeText(clean);
                   alert("Artifact copied to clipboard.");
                 }} className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg text-slate-400 transition-all"><Copy size={16}/></button>
              </div>
           </div>
           <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-12 lg:p-20 bg-slate-50/20 dark:bg-[#0a0a0a]">
              <div className="max-w-4xl mx-auto bg-white dark:bg-[#111] p-8 md:p-12 lg:p-16 rounded-[2rem] shadow-sm border border-slate-100 dark:border-white/5 min-h-full relative">
                {canvasImage ? (
                  <div className="space-y-6 animate-in fade-in zoom-in-95 duration-700">
                    <img src={canvasImage} alt="Neural Visual Aid" className="w-full h-auto rounded-3xl shadow-2xl border border-white/5" />
                    <div className="flex justify-center gap-4">
                      <button onClick={() => { const a = document.createElement('a'); a.href = canvasImage; a.download = 'neural-diagram.png'; a.click(); }} className="px-8 py-3 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-indigo-700 transition-all">Download Asset</button>
                    </div>
                  </div>
                ) : canvasContent ? (
                  <div className="prose dark:prose-invert max-w-none text-sm md:text-base leading-loose animate-in fade-in duration-700" dangerouslySetInnerHTML={{ __html: marked.parse(canvasContent.split('--- Synthesis by Node:')[0]) }} />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full py-40 text-center space-y-6 opacity-30">
                    <div className="w-20 h-20 bg-slate-50 dark:bg-white/5 rounded-full flex items-center justify-center text-slate-200"><Edit3 size={40} /></div>
                    <h2 className="text-xl font-bold text-slate-300 uppercase tracking-widest">Awaiting Synthesis</h2>
                  </div>
                )}
              </div>
           </div>
        </div>
      </div>

      {isSliderOpen && (
        <>
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[100] animate-in fade-in duration-300" onClick={() => setIsSliderOpen(false)} />
          <div className="fixed top-0 right-0 h-full w-full max-w-sm bg-white dark:bg-[#0d0d0d] z-[110] shadow-2xl animate-in slide-in-from-right duration-500 flex flex-col border-l border-slate-200 dark:border-white/5">
            <div className="p-8 border-b border-slate-100 dark:border-white/5 flex items-center justify-between bg-slate-50 dark:bg-[#0a0a0a]">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Active Context</h2>
                <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mt-1">Curriculum Library</p>
              </div>
              <button onClick={() => setIsSliderOpen(false)} className="p-3 hover:bg-slate-200 dark:hover:bg-white/10 rounded-2xl transition-all text-slate-400 hover:text-slate-900 dark:hover:text-white"><X size={24}/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              <DocumentSelector documents={localDocs} onToggle={toggleDocContext} />
            </div>
            <div className="p-8 border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-[#0a0a0a]">
               <p className="text-[10px] text-slate-400 font-bold leading-relaxed text-center">
                 Changes to context will apply to subsequent generations. Existing artifacts remain unchanged.
               </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Tools;