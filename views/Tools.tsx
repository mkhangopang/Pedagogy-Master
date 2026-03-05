'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, ClipboardCheck, BookOpen, Layers, Loader2, 
  FileText, Copy, ArrowRight, PenTool, Compass, SearchCode, 
  Zap, ChevronLeft, Library, Crown, Globe2, Globe, Check, X,
  FileEdit, Search, BookMarked, ArrowRightCircle, ShieldCheck
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
  const [copySuccess, setCopySuccess] = useState(false);
  
  const [workflowRecommendation, setWorkflowRecommendation] = useState<{tool: ToolType, reason: string} | null>(null);
  
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

  useEffect(() => {
    if (!canvasContent || isGenerating) return;
    const match = canvasContent.match(/--- Workflow Recommendation:\s*(\w+)\s*\|\s*([^---]+)\s*---/i);
    if (match) {
      setWorkflowRecommendation({
        tool: match[1].toLowerCase() as ToolType,
        reason: match[2].trim()
      });
    } else {
      setWorkflowRecommendation(null);
    }
  }, [canvasContent, isGenerating]);

  const toggleDocContext = async (docId: string) => {
    const updated = localDocs.map(d => ({ ...d, isSelected: d.id === docId ? !d.isSelected : false }));
    setLocalDocs(updated);
    setIsSwitchingContext(true);
    try {
      await supabase.from('documents').update({ is_selected: false }).eq('user_id', user.id);
      if (updated.find(d => d.id === docId)?.isSelected) {
        await supabase.from('documents').update({ is_selected: true }).eq('id', docId);
      }
      setTimeout(() => setIsSliderOpen(false), 300);
    } catch (e) { 
      console.error(e); 
    } finally { 
      setIsSwitchingContext(false); 
    }
  };

  const handleGenerate = async (userInput: string, handoffContext?: string) => {
    if (!userInput.trim() || isGenerating || !canQuery) return;
    
    const effectiveTool = activeTool || 'master_plan';
    setIsGenerating(true);
    setWorkflowRecommendation(null);
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

${handoffContext ? `[WORKFLOW_CONTEXT: Use the following previous synthesis as a base]:\n${handoffContext}` : ''}

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

  const handleWorkflowTransition = () => {
    if (!workflowRecommendation || isGenerating) return;
    const previousArtifact = canvasContent.split('--- Workflow Recommendation')[0].trim();
    const toolName = getToolDisplayName(workflowRecommendation.tool);
    setActiveTool(workflowRecommendation.tool);
    handleGenerate(`Based on the previous ${getToolDisplayName(activeTool)}, synthesize a ${toolName}.`, previousArtifact);
  };

  const handleRichCopy = async () => {
    if (!canvasContent) return;
    const cleanText = canvasContent.split('--- Workflow Recommendation')[0].trim();
    await navigator.clipboard.writeText(cleanText);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const toolDefinitions: { id: ToolType, name: string, icon: any, desc: string, color: string, iconColor: string }[] = [
    { id: 'master_plan', name: 'Master Plan', icon: BookOpen, desc: 'Architecture of Instruction (5E, Madeline Hunter, UbD)', color: 'bg-indigo-600', iconColor: 'text-white' },
    { id: 'neural_quiz', name: 'Neural Quiz', icon: ClipboardCheck, desc: 'Standards-Aligned Assessment (MCQ, CRQ, Bloom Scaling)', color: 'bg-emerald-600', iconColor: 'text-white' },
    { id: 'fidelity_rubric', name: 'Fidelity Rubric', icon: Layers, desc: 'Criterion-Based Assessment (Observable, Measurable Descriptors)', color: 'bg-amber-600', iconColor: 'text-white' },
    { id: 'audit_tagger', name: 'Audit Tagger', icon: SearchCode, desc: 'SLO Logic Mapping (Curriculum Analysis, DOK, Gap ID)', color: 'bg-cyan-600', iconColor: 'text-white' },
  ];

  if (!activeTool) {
    return (
      <div className="max-w-5xl mx-auto w-full pt-8 pb-20 px-4 md:px-6 animate-in fade-in duration-500 relative z-10 text-left">
        <div className={`fixed inset-y-0 right-0 w-80 bg-white dark:bg-[#0d0d0d] shadow-2xl z-[200] transform transition-transform duration-500 border-l border-slate-100 dark:border-white/5 ${isSliderOpen ? 'translate-x-0' : 'translate-x-full'}`}>
           <div className="p-8 flex flex-col h-full">
              <div className="flex items-center justify-between mb-8">
                 <div className="flex items-center gap-3">
                    <Library size={20} className="text-indigo-600" />
                    <h3 className="font-black text-xs uppercase tracking-widest text-slate-900 dark:text-white">Vault Selection</h3>
                 </div>
                 <button onClick={() => setIsSliderOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-all"><X size={20}/></button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2">
                 {localDocs.map(doc => (
                   <button key={doc.id} onClick={() => toggleDocContext(doc.id)} className={`w-full text-left p-5 rounded-2xl border transition-all flex flex-col gap-1.5 ${doc.isSelected ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-slate-50 dark:bg-white/5 border-transparent text-slate-500 hover:border-slate-300'}`}>
                     <span className={`text-[9px] font-black uppercase tracking-widest ${doc.isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>Standard Node</span>
                     <p className={`font-bold text-sm truncate ${doc.isSelected ? 'text-white' : 'text-slate-900 dark:text-slate-100'}`}>{doc.name}</p>
                     <p className={`text-[10px] font-medium uppercase tracking-tight ${doc.isSelected ? 'text-indigo-100' : 'text-slate-400'}`}>{doc.authority} • {doc.subject}</p>
                   </button>
                 ))}
              </div>
           </div>
        </div>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-12">
          <div className="flex items-center gap-6">
            <div className="p-4 bg-indigo-600 rounded-[2rem] text-white shadow-2xl shrink-0"><Zap size={32} /></div>
            <div>
              <h1 className="text-2xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">Synthesis Hub</h1>
              <div className="text-slate-500 font-medium text-xs md:text-lg mt-1 italic flex items-center gap-2">
                {/* Add comment above each fix */}
                {/* Fix: Added ShieldCheck to imports and using it here correctly to display brain sync status */}
                {isCurriculumEnabled && activeDoc ? <><ShieldCheck size={14} className="text-emerald-500" /><span className="truncate">Brain v4.0 Linked: <span className="text-slate-900 dark:text-white font-bold">{activeDoc.name}</span></span></> : <><Globe size={14} /><span className="truncate">Autonomous Creative Intelligence Mode.</span></>}
              </div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-[#111] p-2 rounded-[2.5rem] border border-slate-200 dark:border-white/5 shadow-2xl flex items-center gap-2 no-print">
            <button onClick={() => setIsCurriculumEnabled(!isCurriculumEnabled)} className={`flex items-center gap-3 px-6 py-3 rounded-full transition-all border ${isCurriculumEnabled ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg' : 'bg-slate-50 dark:bg-white/5 border-transparent text-slate-400'}`}><BookMarked size={16} /><div className="text-left"><p className="text-[8px] font-black uppercase leading-none mb-0.5 tracking-widest">Vault</p><p className="text-[10px] font-bold">Curriculum</p></div></button>
            <button onClick={() => setIsSliderOpen(true)} className={`p-3 rounded-full transition-all ml-1 shadow-inner ${isSliderOpen ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-600'}`}><Library size={20} /></button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 no-print">
          {toolDefinitions.map((tool) => (
            <button key={tool.id} onClick={() => setActiveTool(tool.id)} className={`p-10 rounded-[3.5rem] border transition-all text-left flex flex-col gap-6 group bg-white dark:bg-[#111] border-slate-200 dark:border-white/5 hover:border-indigo-500 hover:shadow-2xl`}>
              <div className={`w-14 h-14 ${tool.color} rounded-2xl flex items-center justify-center ${tool.iconColor} shadow-lg`}><tool.icon size={28} /></div>
              <div>
                <h3 className="font-black text-2xl text-slate-900 dark:text-white uppercase tracking-tight">{tool.name}</h3>
                <p className="text-slate-500 dark:text-slate-400 text-base mt-2 font-medium leading-relaxed">{tool.desc}</p>
              </div>
              <div className="flex items-center justify-between mt-auto">
                 <span className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-500 flex items-center gap-1"><Sparkles size={10} /> Specialized Neural Tool</span>
                 <ArrowRight size={24} className="text-indigo-600 transition-transform group-hover:translate-x-1" />
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] lg:h-[calc(100vh-64px)] bg-slate-50 dark:bg-[#080808] relative overflow-hidden print:h-auto print:overflow-visible">
      <div className="flex-1 flex overflow-hidden print:block print:overflow-visible">
        <div className={`flex flex-col border-r border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-[#0d0d0d] transition-all duration-300 no-print ${mobileActiveTab === 'artifact' ? 'hidden md:flex' : 'flex'} w-full md:w-[380px] shrink-0`}>
          <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between bg-white dark:bg-[#0d0d0d]">
             <div className="flex items-center gap-3">
               <button onClick={() => {setActiveTool(null); setMessages([]); setCanvasContent('');}} className="p-2 -ml-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl text-slate-500 transition-all"><ChevronLeft size={22}/></button>
               <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{getToolDisplayName(activeTool)}</span>
             </div>
             <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/5 p-1 rounded-xl">
                <button onClick={() => setPersona('architect')} title="Instructional Architect" className={`p-1.5 rounded-lg ${persona === 'architect' ? 'bg-white dark:bg-white/10 text-indigo-600 shadow-sm' : 'text-slate-400'}`}><PenTool size={14}/></button>
                <button onClick={() => setPersona('creative')} title="Creative Designer" className={`p-1.5 rounded-lg ${persona === 'creative' ? 'bg-white dark:bg-white/10 text-rose-600 shadow-sm' : 'text-slate-400'}`}><Compass size={14}/></button>
                <button onClick={() => setPersona('auditor')} title="Curriculum Auditor" className={`p-1.5 rounded-lg ${persona === 'auditor' ? 'bg-white dark:bg-white/10 text-emerald-600 shadow-sm' : 'text-slate-400'}`}><SearchCode size={14}/></button>
             </div>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar py-6 space-y-2">
            {messages.map((m) => (<MessageItem key={m.id} id={m.id} role={m.role} content={m.content} timestamp={m.timestamp} metadata={m.metadata} />))}
            {isGenerating && <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-indigo-500" /></div>}
          </div>
          <div className="p-6 border-t dark:border-white/5 bg-white dark:bg-[#0d0d0d]">
            <ChatInput onSend={handleGenerate} isLoading={isGenerating} placeholder={`Refine ${getToolDisplayName(activeTool)}...`} />
          </div>
        </div>

        <div className={`flex-1 flex flex-col bg-white dark:bg-[#0a0a0a] transition-all duration-300 ${mobileActiveTab === 'logs' ? 'hidden md:flex' : 'flex'} overflow-hidden print:block print:overflow-visible`}>
           <div className="px-8 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between shrink-0 bg-white dark:bg-[#0a0a0a] z-10 no-print">
              <div className="flex items-center gap-3"><FileEdit size={18} className="text-indigo-600" /><span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white">Neural Artifact Node</span></div>
              <div className="flex items-center gap-2">
                {workflowRecommendation && !isGenerating && (
                  <button onClick={handleWorkflowTransition} className="px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest shadow-lg animate-in slide-in-from-right-2">
                    <ArrowRightCircle size={14}/> Next: {getToolDisplayName(workflowRecommendation.tool)}
                  </button>
                )}
                <button onClick={handleRichCopy} className={`px-4 py-2 ${copySuccess ? 'bg-emerald-50 text-emerald-600' : 'hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600'} rounded-xl transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest shrink-0`}>
                  {copySuccess ? <Check size={14}/> : <Copy size={14}/>} {copySuccess ? 'Copied' : 'Rich Copy'}
                </button>
              </div>
           </div>
           
           <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-12 lg:p-20 bg-slate-50/20 dark:bg-[#0a0a0a] print:p-0">
              <div className="max-w-4xl mx-auto bg-white dark:bg-[#111] p-6 md:p-16 lg:p-20 rounded-[3rem] shadow-2xl border border-slate-100 dark:border-white/5 min-h-full print:shadow-none print:border-none">
                {canvasContent ? (
                  <div className="prose dark:prose-invert max-w-full text-sm md:text-base leading-relaxed animate-in fade-in duration-500" 
                       dangerouslySetInnerHTML={{ __html: renderSTEM(canvasContent.split('--- Workflow Recommendation')[0].trim()) }} />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full py-40 text-center opacity-30 no-print">
                    <div className="w-20 h-20 bg-slate-100 dark:bg-white/5 rounded-[2rem] flex items-center justify-center mb-8"><FileText size={48} className="text-slate-300" /></div>
                    <h2 className="text-lg font-black text-slate-300 uppercase tracking-widest">Select a specialized tool to begin</h2>
                  </div>
                )}
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default Tools;
