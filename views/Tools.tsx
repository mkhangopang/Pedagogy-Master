
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, ClipboardCheck, BookOpen, Layers, Loader2, 
  FileText, Copy, ArrowRight, Printer, Share2, 
  MessageSquare, FileEdit, Zap, GraduationCap,
  ShieldCheck, Library,
  ChevronLeft, Crown, Mail,
  PenTool, Compass, SearchCode, BookMarked, Globe2, Globe
} from 'lucide-react';
import { geminiService } from '../services/geminiService';
import { adaptiveService } from '../services/adaptiveService';
import { NeuralBrain, Document, UserProfile, SubscriptionPlan } from '../types';
import { ChatInput } from '../components/chat/ChatInput';
import { MessageItem } from '../components/chat/MessageItem';
import { supabase } from '../lib/supabase';
import { ToolType, getToolDisplayName } from '../lib/ai/tool-router';
import { renderSTEM } from '../lib/math-renderer';

interface ToolsProps {
  brain: NeuralBrain;
  documents: Document[];
  onQuery: () => void;
  canQuery: boolean;
  user: UserProfile;
}

type PersonaMode = 'architect' | 'creative' | 'auditor';

const Tools: React.FC<ToolsProps> = ({ brain, documents, onQuery, canQuery, user }) => {
  const [activeTool, setActiveTool] = useState<ToolType | null>(null);
  const [persona, setPersona] = useState<PersonaMode>('architect');
  const [messages, setMessages] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [canvasContent, setCanvasContent] = useState<string>('');
  const [mobileActiveTab, setMobileActiveTab] = useState<'logs' | 'artifact'>('logs');
  
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
    
    const effectiveTool = activeTool || 'master_plan';
    setIsGenerating(true);
    const aiMsgId = crypto.randomUUID();
    
    setMessages(prev => [...prev, 
      { id: crypto.randomUUID(), role: 'user', content: userInput, timestamp: new Date().toISOString() },
      { id: aiMsgId, role: 'assistant', content: '', timestamp: new Date().toISOString() }
    ]);

    try {
      onQuery();
      if (window.innerWidth < 768) setMobileActiveTab('artifact');

      const personaPrompt = `
[CONTEXT_MODES]
CURRICULUM_MODE: ${isCurriculumEnabled ? 'ACTIVE' : 'INACTIVE'}
GLOBAL_RESOURCES_MODE: ${isGlobalEnabled ? 'ACTIVE' : 'INACTIVE'}
EXPERT_MODULE: ${getToolDisplayName(effectiveTool)}

[PERSONA_OVERLAY]
${persona === 'creative' ? '[CREATIVE_MODE: ON] Use highly engaging, active learning strategies.' : persona === 'auditor' ? '[AUDIT_MODE: ON] Focus on standards rigor.' : ''}

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

  const saveToGoogleDrive = () => {
    if (!isPro) {
      alert("Pro License Required for Google Drive Integration.");
      return;
    }
    
    const cleanText = canvasContent.split('--- Synthesis Hub:')[0].trim();
    if (!cleanText) {
      alert("Synthesis Canvas is empty. Generate content first.");
      return;
    }

    const blob = new Blob([cleanText], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTool || 'Artifact'}_${new Date().toISOString().slice(0,10)}.md`;
    a.click();
    
    alert("Pedagogical Artifact downloaded. Upload this .md file to Google Drive or paste it into a Doc to finalize.");
  };

  const handlePrint = () => {
    if (!canvasContent) {
      alert("Synthesis Canvas is empty.");
      return;
    }
    window.print();
  };

  const shareSnapshot = async () => {
    const cleanText = canvasContent.split('--- Synthesis Hub:')[0].trim();
    const summary = `🚀 EduNexus AI Artifact\n\n🎯 Tool: ${getToolDisplayName(activeTool || 'master_plan')}\n🏛️ Authority: ${activeDoc?.authority || 'Standardized'}\n📖 Subject: ${activeDoc?.subject || 'General'}\n\nJoin the grid: edunexus.ai`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'EduNexus AI Lesson Plan',
          text: summary,
          url: 'https://edunexus.ai'
        });
      } catch (e) { 
        console.log("Sharing cancelled"); 
      }
    } else {
      navigator.clipboard.writeText(summary);
      alert("Synthesis metadata card copied to clipboard. Ready for WhatsApp/Messenger sharing.");
    }
  };

  const toolDefinitions: { id: ToolType, name: string, icon: any, desc: string, color: string }[] = [
    { id: 'master_plan', name: 'Master Plan', icon: BookOpen, desc: 'Instructional Architecture (5E/Madeline Hunter)', color: 'bg-indigo-600' },
    { id: 'neural_quiz', name: 'Neural Quiz', icon: ClipboardCheck, desc: 'Bloom-Aligned Assessment Synthesis', color: 'bg-emerald-600' },
    { id: 'fidelity_rubric', name: 'Fidelity Rubric', icon: Layers, desc: 'Measurable Performance Criteria', color: 'bg-amber-600' },
    { id: 'audit_tagger', name: 'Audit Tagger', icon: SearchCode, desc: 'Standards Mapping & Vertical Alignment', color: 'bg-cyan-600' },
  ];

  const getRenderedContent = () => {
    if (!canvasContent) return '';
    const contentToParse = canvasContent.split('--- Synthesis Hub:')[0].trim();
    return renderSTEM(contentToParse);
  };

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
              onClick={() => isPro ? setIsGlobalEnabled(!isGlobalEnabled) : alert("PRO LICENSE REQUIRED")}
              className={`flex items-center gap-3 px-6 py-3 rounded-full transition-all border relative ${isGlobalEnabled ? 'bg-emerald-600 border-emerald-400 text-white shadow-lg' : 'bg-slate-50 dark:bg-white/5 border-transparent text-slate-400'}`}
            >
              {!isPro && <Crown size={10} className="absolute -top-1 -right-1 text-amber-500 bg-white rounded-full p-0.5 shadow-sm" />}
              <Globe2 size={16} />
              <div className="text-left">
                <p className="text-[8px] font-black uppercase leading-none mb-0.5 tracking-widest">Global</p>
                <p className="text-[10px] font-bold">Creative Library</p>
              </div>
            </button>

            <button 
              onClick={() => setIsSliderOpen(true)}
              className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-600 rounded-full transition-all ml-1 shadow-inner"
            >
              <Library size={20} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4 md:gap-8">
          {toolDefinitions.map((tool) => (
            <button key={tool.id} onClick={() => setActiveTool(tool.id)} className={`p-8 md:p-10 rounded-[2.5rem] md:rounded-[3.5rem] border transition-all text-left flex flex-col gap-4 md:gap-6 group bg-white dark:bg-[#111] border-slate-200 dark:border-white/5 hover:border-indigo-500 hover:shadow-2xl`}>
              <div className={`w-14 h-14 ${tool.color} rounded-2xl flex items-center justify-center text-white shadow-lg`}><tool.icon size={28} /></div>
              <div><h3 className="font-black text-xl md:text-2xl text-slate-900 dark:text-white uppercase tracking-tight">{tool.name}</h3><p className="text-slate-500 dark:text-slate-400 text-sm md:text-base mt-2 font-medium leading-relaxed">{tool.desc}</p></div>
              <div className="flex items-center justify-between mt-auto">
                 <span className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-500 flex items-center gap-1">
                    <Sparkles size={10} /> Expert Logic Active
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
      <div className="md:hidden flex p-1 bg-white dark:bg-slate-900 border-b dark:border-white/5 no-print">
        <button onClick={() => setMobileActiveTab('logs')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mobileActiveTab === 'logs' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400'}`}>
          <MessageSquare size={14} /> Logs
        </button>
        <button onClick={() => setMobileActiveTab('artifact')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mobileActiveTab === 'artifact' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400'}`}>
          <FileEdit size={14} /> Canvas
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className={`flex flex-col border-r border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-[#0d0d0d] transition-all duration-300 no-print ${mobileActiveTab === 'artifact' ? 'hidden md:flex' : 'flex'} w-full md:w-[380px] shrink-0`}>
          <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between bg-white dark:bg-[#0d0d0d]">
             <div className="flex items-center gap-3">
               <button onClick={() => {setActiveTool(null); setMessages([]); setCanvasContent('');}} className="p-2 -ml-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl text-slate-500 transition-all"><ChevronLeft size={22}/></button>
               <div className="flex items-center gap-2"><MessageSquare size={14} className="text-slate-400" /><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{getToolDisplayName(activeTool)}</span></div>
             </div>
             <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/5 p-1 rounded-xl">
                <button onClick={() => setPersona('architect')} className={`p-1.5 rounded-lg transition-all ${persona === 'architect' ? 'bg-white dark:bg-white/10 text-indigo-600 shadow-sm' : 'text-slate-400'}`} title="Instructional Architect"><PenTool size={14}/></button>
                <button onClick={() => setPersona('creative')} className={`p-1.5 rounded-lg transition-all ${persona === 'creative' ? 'bg-white dark:bg-white/10 text-rose-600 shadow-sm' : 'text-slate-400'}`} title="Creative Specialist"><Compass size={14}/></button>
                <button onClick={() => setPersona('auditor')} className={`p-1.5 rounded-lg transition-all ${persona === 'auditor' ? 'bg-white dark:bg-white/10 text-emerald-600 shadow-sm' : 'text-slate-400'}`} title="Standards Auditor"><SearchCode size={14}/></button>
             </div>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar py-6 space-y-2">
            {messages.map((m) => (<MessageItem key={m.id} id={m.id} role={m.role} content={m.content} timestamp={m.timestamp} metadata={m.metadata} />))}
            {isGenerating && <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-indigo-500" /></div>}
          </div>
          <div className="p-6 border-t dark:border-white/5 bg-white dark:bg-[#0d0d0d]">
            <ChatInput onSend={handleGenerate} isLoading={isGenerating} placeholder={`Refine the ${getToolDisplayName(activeTool)}...`} />
          </div>
        </div>

        <div className={`flex-1 flex flex-col bg-white dark:bg-[#0a0a0a] transition-all duration-300 ${mobileActiveTab === 'logs' ? 'hidden md:flex' : 'flex'} overflow-hidden`}>
           <div className="px-8 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between shrink-0 bg-white dark:bg-[#0a0a0a] z-10 no-print">
              <div className="flex items-center gap-3">
                <FileEdit size={18} className="text-indigo-600" />
                <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white">Expert Artifact</span>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                <button onClick={handlePrint} className="px-4 py-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl text-slate-600 dark:text-slate-300 transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest border dark:border-white/5 shrink-0"><Printer size={14}/> Print</button>
                <button onClick={saveToGoogleDrive} className="px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest border border-indigo-100 dark:border-indigo-900/40 shrink-0"><Globe size={14}/> G-Drive</button>
                <button onClick={shareSnapshot} className="px-4 py-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl text-slate-600 dark:text-slate-300 transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest border dark:border-white/5 shrink-0"><Share2 size={14}/> Share</button>
                <div className="w-px h-4 bg-slate-200 dark:bg-white/10 mx-1 shrink-0" />
                <button onClick={() => {
                  const cleanText = canvasContent.split('--- Synthesis Hub:')[0].trim();
                  navigator.clipboard.writeText(cleanText);
                }} className="px-4 py-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl text-slate-600 dark:text-slate-300 transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest border dark:border-white/5 shrink-0"><Copy size={14}/> Copy</button>
              </div>
           </div>
           
           <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-12 lg:p-20 bg-slate-50/20 dark:bg-[#0a0a0a]">
              <div className="max-w-4xl mx-auto bg-white dark:bg-[#111] p-6 md:p-16 lg:p-20 rounded-[3rem] shadow-2xl border border-slate-100 dark:border-white/5 min-h-full overflow-x-hidden print-container">
                {/* 🏷️ INSTITUTIONAL BRANDING */}
                <div className="hidden print-header space-y-4">
                   <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                         <div className="p-2 bg-indigo-600 rounded-lg text-white"><GraduationCap size={32} /></div>
                         <div>
                            <h1 className="text-2xl font-black uppercase tracking-tight">{user.workspaceName || 'EduNexus AI Workspace'}</h1>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Institutional Pedagogical Intelligence</p>
                         </div>
                      </div>
                      <div className="text-right">
                         <p className="text-[9px] font-bold text-slate-400 uppercase">Artifact Synthesized By</p>
                         <p className="text-xs font-black uppercase text-indigo-600">{user.name}</p>
                      </div>
                   </div>
                   <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                      <div>
                         <p className="text-[8px] font-bold text-slate-400 uppercase">Curriculum Authority</p>
                         <p className="text-sm font-bold">{activeDoc?.authority || 'Verified Standard'}</p>
                      </div>
                      <div className="text-right">
                         <p className="text-[8px] font-bold text-slate-400 uppercase">Subject / Grade</p>
                         <p className="text-sm font-bold">{activeDoc?.subject || 'General'} / {activeDoc?.gradeLevel || 'Mixed'}</p>
                      </div>
                   </div>
                </div>

                {canvasContent ? (
                   <div className="artifact-canvas-container">
                    <div className="prose dark:prose-invert max-w-full text-sm md:text-base leading-relaxed md:leading-[1.8] animate-in fade-in duration-500 break-words" 
                         dangerouslySetInnerHTML={{ __html: getRenderedContent() }} />
                   </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full py-40 text-center opacity-30 no-print">
                    <div className="w-20 h-20 bg-slate-100 dark:bg-white/5 rounded-[2rem] flex items-center justify-center mb-8"><FileText size={48} className="text-slate-300" /></div>
                    <h2 className="text-lg font-black text-slate-300 uppercase tracking-widest">Awaiting Expert Synthesis</h2>
                  </div>
                )}

                <div className="hidden print-footer">
                   <p>© {new Date().getFullYear()} {user.workspaceName || 'EduNexus AI'} • Authenticity Verified through Neural Audit</p>
                </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default Tools;
