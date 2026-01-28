'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, ClipboardCheck, BookOpen, Layers, ArrowLeft, Loader2, 
  Bot, FileText, Copy, ArrowRight,
  MessageSquare, FileEdit, Zap, X,
  ShieldCheck, Library,
  Tags, ChevronLeft, Download, Timer, Target, Globe, Compass, PenTool, SearchCode,
  Activity, BookMarked, Globe2, Crown
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

type PersonaMode = 'architect' | 'creative' | 'auditor';

const Tools: React.FC<ToolsProps> = ({ brain, documents, onQuery, canQuery, user }) => {
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [persona, setPersona] = useState<PersonaMode>('architect');
  const [messages, setMessages] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [canvasContent, setCanvasContent] = useState<string>('');
  const [mobileActiveTab, setMobileActiveTab] = useState<'logs' | 'artifact'>('logs');
  
  // Dual Perspective State
  const [isCurriculumEnabled, setIsCurriculumEnabled] = useState(true);
  const [isGlobalEnabled, setIsGlobalEnabled] = useState(false);
  
  const [isSliderOpen, setIsSliderOpen] = useState(false);
  const [localDocs, setLocalDocs] = useState<Document[]>(documents);
  const [isSwitchingContext, setIsSwitchingContext] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeDoc = localDocs.find(d => d.isSelected);
  const isPro = user.plan !== SubscriptionPlan.FREE;

  useEffect(() => {
    setLocalDocs(documents);
  }, [documents]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isGenerating]);

  const toggleDocContext = async (docId: string) => {
    const updated = localDocs.map(d => ({ ...d, isSelected: d.id === docId ? !d.isSelected : false }));
    setLocalDocs(updated);
    setIsSwitchingContext(true);
    try {
      await supabase.from('documents').update({ is_selected: false }).eq('user_id', user.id);
      if (updated.find(d => d.id === docId)?.isSelected) {
        await supabase.from('documents').update({ is_selected: true }).eq('id', docId);
      }
      setTimeout(() => setIsSliderOpen(false), 200);
    } catch (e) { console.error(e); } finally { setIsSwitchingContext(false); }
  };

  const handleGenerate = async (userInput: string) => {
    if (!userInput.trim() || isGenerating || !canQuery) return;
    
    const effectiveTool = activeTool || 'general-chat';
    setIsGenerating(true);
    const aiMsgId = crypto.randomUUID();
    
    setMessages(prev => [...prev, 
      { id: crypto.randomUUID(), role: 'user', content: userInput, timestamp: new Date().toISOString() },
      { id: aiMsgId, role: 'assistant', content: '', timestamp: new Date().toISOString() }
    ]);

    try {
      onQuery();
      if (window.innerWidth < 768) setMobileActiveTab('artifact');

      // Injecting strictly formatted mode flags for the synthesizer orchestrator
      const personaPrompt = `
[CONTEXT_MODES]
CURRICULUM_MODE: ${isCurriculumEnabled ? 'ACTIVE' : 'INACTIVE'}
GLOBAL_RESOURCES_MODE: ${isGlobalEnabled ? 'ACTIVE' : 'INACTIVE'}

[PERSONA_OVERLAY]
${persona === 'creative' ? '[CREATIVE_MODE: ON] Use highly engaging, active learning strategies.' : persona === 'auditor' ? '[AUDIT_MODE: ON] Strictly focus on standards alignment and assessment rigor.' : ''}

USER_QUERY: ${userInput}`;

      const stream = geminiService.generatePedagogicalToolStream(
        effectiveTool, 
        personaPrompt, 
        { base64: activeDoc?.base64Data, mimeType: activeDoc?.mimeType, filePath: activeDoc?.filePath, id: activeDoc?.id }, 
        brain, 
        user, 
        isCurriculumEnabled ? activeDoc?.id : undefined 
      );
      
      let fullContent = '';
      for await (const chunk of stream) {
        if (chunk) {
          fullContent += chunk;
          setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: fullContent } : m));
          setCanvasContent(fullContent); 
        }
      }
      await adaptiveService.captureGeneration(user.id, effectiveTool, fullContent, { tool: effectiveTool, document_id: activeDoc?.id, persona, isGlobalEnabled });
    } catch (err: any) {
      setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: `Synthesis Error: ${err.message}` } : m));
    } finally { setIsGenerating(false); }
  };

  const toolDefinitions = [
    { id: 'lesson-plan', name: 'Master Plan', icon: BookOpen, desc: 'Architecture of Instruction', color: 'bg-indigo-600' },
    { id: 'assessment', name: 'Neural Quiz', icon: ClipboardCheck, desc: 'Standards-aligned MCQ/CRQ', color: 'bg-emerald-600' },
    { id: 'rubric', name: 'Fidelity Rubric', icon: Layers, desc: 'Criterion-based Assessment', color: 'bg-amber-600' },
    { id: 'slo-tagger', name: 'Audit Tagger', icon: SearchCode, desc: 'SLO Logic Mapping', color: 'bg-cyan-600' },
  ];

  if (!activeTool) {
    return (
      <div className="max-w-5xl mx-auto w-full pt-8 pb-20 px-4 md:px-6 animate-in fade-in duration-500 relative z-10 text-left">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-12">
          <div className="flex items-center gap-4 md:gap-6">
            <div className="p-3 md:p-4 bg-indigo-600 rounded-2xl md:rounded-[2rem] text-white shadow-2xl shrink-0"><Zap size={24} className="md:size-8" /></div>
            <div className="min-w-0">
              <h1 className="text-2xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tighter uppercase truncate">Synthesis Hub</h1>
              <div className="text-slate-500 font-medium text-xs md:text-lg mt-1 italic flex items-center gap-2 overflow-hidden">
                {isCurriculumEnabled && activeDoc ? <><ShieldCheck size={14} className="text-emerald-500 shrink-0" /><span className="truncate">Vault Linked: <span className="text-slate-900 dark:text-white font-bold">{activeDoc.name}</span></span></> : <><Globe size={14} className="shrink-0" /><span className="truncate">Autonomous Creative Synthesis Mode.</span></>}
              </div>
            </div>
          </div>
          
          {/* PERSPECTIVE CONTROL PANEL */}
          <div className="bg-white dark:bg-[#111] p-2 rounded-[2.5rem] border border-slate-200 dark:border-white/5 shadow-2xl flex flex-col sm:flex-row items-center gap-2">
            <button 
              onClick={() => setIsCurriculumEnabled(!isCurriculumEnabled)}
              className={`flex items-center gap-3 px-6 py-3 rounded-full transition-all border ${isCurriculumEnabled ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg' : 'bg-slate-50 dark:bg-white/5 border-transparent text-slate-400'}`}
            >
              <BookMarked size={16} />
              <div className="text-left">
                <p className="text-[8px] font-black uppercase leading-none mb-0.5 tracking-widest">Curriculum</p>
                <p className="text-[10px] font-bold">Local Vault</p>
              </div>
            </button>

            <button 
              onClick={() => isPro ? setIsGlobalEnabled(!isGlobalEnabled) : alert("PRO UPGRADE REQUIRED: Access best-in-class pedagogy from Finland, Singapore, and Japan.")}
              className={`flex items-center gap-3 px-6 py-3 rounded-full transition-all border relative ${isGlobalEnabled ? 'bg-emerald-600 border-emerald-400 text-white shadow-lg' : 'bg-slate-50 dark:bg-white/5 border-transparent text-slate-400'}`}
            >
              {!isPro && <Crown size={10} className="absolute -top-1 -right-1 text-amber-500 bg-white rounded-full p-0.5 shadow-sm" />}
              <Globe2 size={16} />
              <div className="text-left">
                <p className="text-[8px] font-black uppercase leading-none mb-0.5 tracking-widest">Global</p>
                <p className="text-[10px] font-bold">Creative Node</p>
              </div>
            </button>

            <button 
              onClick={() => setIsSliderOpen(true)}
              className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-600 rounded-full transition-all ml-1 shadow-inner"
              title="Select Document Context"
            >
              <Library size={20} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4 md:gap-8">
          {toolDefinitions.map((tool) => (
            <button key={tool.id} onClick={() => setActiveTool(tool.id)} className={`p-8 md:p-10 rounded-[2.5rem] md:rounded-[3rem] border transition-all text-left flex flex-col gap-4 md:gap-6 group bg-white dark:bg-[#111] border-slate-200 dark:border-white/5 hover:border-indigo-500 hover:shadow-2xl`}>
              <div className={`w-14 h-14 ${tool.color} rounded-2xl flex items-center justify-center text-white shadow-lg`}><tool.icon size={28} /></div>
              <div><h3 className="font-black text-xl md:text-2xl text-slate-900 dark:text-white uppercase tracking-tight">{tool.name}</h3><p className="text-slate-500 dark:text-slate-400 text-sm md:text-base mt-2 font-medium leading-relaxed">{tool.desc}</p></div>
              <div className="flex items-center justify-between mt-auto">
                 <span className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-500 flex items-center gap-1">
                    <Sparkles size={10} /> {isGlobalEnabled ? 'Global Augmentation Active' : 'Vault Anchored'}
                 </span>
                 <ArrowRight size={24} className="text-indigo-600 transition-transform group-hover:translate-x-1" />
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] lg:h-[calc(100vh-64px)] bg-slate-50 dark:bg-[#080808] relative overflow-hidden">
      <div className="md:hidden flex p-1 bg-white dark:bg-slate-900 border-b dark:border-white/5">
        <button onClick={() => setMobileActiveTab('logs')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mobileActiveTab === 'logs' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400'}`}>
          <MessageSquare size={14} /> Logs
        </button>
        <button onClick={() => setMobileActiveTab('artifact')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mobileActiveTab === 'artifact' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400'}`}>
          <FileEdit size={14} /> Canvas
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className={`flex flex-col border-r border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-[#0d0d0d] transition-all duration-300 ${mobileActiveTab === 'artifact' ? 'hidden md:flex' : 'flex'} w-full md:w-[380px] shrink-0`}>
          <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between bg-white dark:bg-[#0d0d0d]">
             <div className="flex items-center gap-3">
               <button onClick={() => {setActiveTool(null); setMessages([]); setCanvasContent('');}} className="p-2 -ml-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl text-slate-500 transition-all"><ChevronLeft size={22}/></button>
               <div className="flex items-center gap-2"><MessageSquare size={14} className="text-slate-400" /><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Synthesis Logs</span></div>
             </div>
             <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/5 p-1 rounded-xl">
                <button onClick={() => setPersona('architect')} className={`p-1.5 rounded-lg transition-all ${persona === 'architect' ? 'bg-white dark:bg-white/10 text-indigo-600 shadow-sm' : 'text-slate-400'}`} title="Architect Mode"><PenTool size={14}/></button>
                <button onClick={() => setPersona('creative')} className={`p-1.5 rounded-lg transition-all ${persona === 'creative' ? 'bg-white dark:bg-white/10 text-rose-600 shadow-sm' : 'text-slate-400'}`} title="Creative Mode"><Compass size={14}/></button>
                <button onClick={() => setPersona('auditor')} className={`p-1.5 rounded-lg transition-all ${persona === 'auditor' ? 'bg-white dark:bg-white/10 text-emerald-600 shadow-sm' : 'text-slate-400'}`} title="Auditor Mode"><SearchCode size={14}/></button>
             </div>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar py-6 space-y-2">
            {messages.map((m) => (<MessageItem key={m.id} id={m.id} role={m.role} content={m.content} timestamp={m.timestamp} metadata={m.metadata} />))}
            {isGenerating && <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-indigo-500" /></div>}
          </div>
          <div className="p-6 border-t dark:border-white/5 bg-white dark:bg-[#0d0d0d]">
            <ChatInput onSend={handleGenerate} isLoading={isGenerating} placeholder={`Prompt as ${persona}...`} />
          </div>
        </div>

        <div className={`flex-1 flex flex-col bg-white dark:bg-[#0a0a0a] transition-all duration-300 ${mobileActiveTab === 'logs' ? 'hidden md:flex' : 'flex'} overflow-hidden`}>
           <div className="px-8 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between shrink-0 bg-white dark:bg-[#0a0a0a] z-10">
              <div className="flex items-center gap-3">
                <FileEdit size={18} className="text-indigo-600" />
                <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white">Authoring Canvas</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-xl mr-2">
                  <button onClick={() => setIsCurriculumEnabled(!isCurriculumEnabled)} className={`p-1.5 rounded-lg transition-all ${isCurriculumEnabled ? 'bg-white dark:bg-white/10 text-indigo-600 shadow-sm' : 'text-slate-400'}`} title="Curriculum Focus"><BookMarked size={14}/></button>
                  <button onClick={() => setIsGlobalEnabled(!isGlobalEnabled)} className={`p-1.5 rounded-lg transition-all ${isGlobalEnabled ? 'bg-white dark:bg-white/10 text-emerald-600 shadow-sm' : 'text-slate-400'}`} title="Global Best Practices"><Globe2 size={14}/></button>
                </div>
                <div className="w-px h-4 bg-slate-200 dark:bg-white/10 mx-1" />
                <button onClick={() => {
                  const cleanText = canvasContent.split('--- Synthesis Node:')[0].trim();
                  navigator.clipboard.writeText(cleanText);
                }} className="px-4 py-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl text-slate-600 dark:text-slate-300 transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest border dark:border-white/5"><Copy size={14}/> Copy</button>
              </div>
           </div>
           
           <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-12 lg:p-20 bg-slate-50/20 dark:bg-[#0a0a0a]">
              <div className="max-w-4xl mx-auto bg-white dark:bg-[#111] p-6 md:p-16 lg:p-20 rounded-[3rem] shadow-2xl border border-slate-100 dark:border-white/5 min-h-full overflow-x-hidden">
                {canvasContent ? (
                   <div className="artifact-canvas-container">
                    <div className="prose dark:prose-invert max-w-full text-sm md:text-base leading-relaxed md:leading-[1.8] animate-in fade-in duration-500 break-words" 
                         dangerouslySetInnerHTML={{ __html: marked.parse(canvasContent.split('--- Synthesis Node:')[0].trim()) }} />
                   </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full py-40 text-center opacity-30">
                    <div className="w-20 h-20 bg-slate-100 dark:bg-white/5 rounded-[2rem] flex items-center justify-center mb-8"><FileText size={48} className="text-slate-300" /></div>
                    <h2 className="text-lg font-black text-slate-300 uppercase tracking-widest">Awaiting Pedagogical Synthesis</h2>
                    <p className="text-xs font-bold text-slate-400 mt-2">Initialize a tool on the left to begin generation.</p>
                  </div>
                )}
              </div>
           </div>
        </div>
      </div>

      {isSliderOpen && (
        <>
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[500]" onClick={() => setIsSliderOpen(false)} />
          <div className="fixed top-0 right-0 h-full w-full max-w-sm bg-white dark:bg-[#0d0d0d] z-[510] shadow-2xl animate-in slide-in-from-right duration-500 flex flex-col border-l border-slate-200 dark:border-white/5">
            <div className="p-8 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
              <div className="text-left">
                <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Active Context</h2>
                <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mt-1">Curriculum Library</p>
              </div>
              <button onClick={() => setIsSliderOpen(false)} className="p-3 text-slate-400 hover:text-slate-900 transition-all hover:rotate-90"><X size={24}/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar relative">
              {isSwitchingContext && <div className="absolute inset-0 bg-white/50 dark:bg-black/50 backdrop-blur-[2px] z-10 flex items-center justify-center"><Loader2 size={32} className="animate-spin text-indigo-600" /></div>}
              <DocumentSelector documents={localDocs} onToggle={toggleDocContext} />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Tools;