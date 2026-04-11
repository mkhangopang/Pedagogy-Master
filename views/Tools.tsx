// views/Tools.tsx
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, ClipboardCheck, BookOpen, Layers, Loader2, 
  FileText, Copy, ArrowRight, PenTool, Compass, SearchCode, 
  Zap, ChevronLeft, Library, Crown, Globe2, Globe, Check, X,
  FileEdit, Search, BookMarked, ArrowRightCircle, ShieldCheck, Printer
} from 'lucide-react';
import { geminiService } from '../services/geminiService';
import { adaptiveService } from '../services/adaptiveService';
import { NeuralBrain, Document, UserProfile, SubscriptionPlan } from '../types';
import { ChatInput } from '../components/chat/ChatInput';
import { MessageItem } from '../components/chat/MessageItem';
import { supabase } from '../lib/supabase';
import { ToolType, getToolDisplayName } from '../lib/ai/tool-router';
import { markdownToHtml } from '../lib/markdown-renderer';
import { PRINT_STYLES } from '../lib/tools-constants';

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

  // Print styles
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const styleId = 'pm-print-styles';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = PRINT_STYLES;
    document.head.appendChild(style);
  }, []);

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

  // Vault Selector - Toggle selected document
  const toggleDocContext = async (docId: string) => {
    const updated = localDocs.map(d => ({ 
      ...d, 
      isSelected: d.id === docId ? !d.isSelected : false 
    }));
    setLocalDocs(updated);
    setIsSwitchingContext(true);

    try {
      // Deselect all first
      await supabase.from('documents').update({ is_selected: false }).eq('user_id', user.id);
      
      // Select the chosen one
      const selectedDoc = updated.find(d => d.id === docId && d.isSelected);
      if (selectedDoc) {
        await supabase.from('documents').update({ is_selected: true }).eq('id', docId);
      }
      
      setTimeout(() => setIsSliderOpen(false), 300);
    } catch (e) {
      console.error('Failed to switch vault context', e);
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

    // === NEW: Fetch real SLOs from selected document ===
    let sloContext = '';
    if (isCurriculumEnabled && activeDoc) {
      const { data: slos } = await supabase
        .from('slo_database')
        .select('slo_code, slo_full_text, bloom_level, domain')
        .eq('document_id', activeDoc.id)
        .limit(80);   // limit to avoid token overflow

      if (slos && slos.length > 0) {
        sloContext = slos.map(s => 
          `SLO ${s.slo_code}: ${s.slo_full_text} (Bloom: ${s.bloom_level || 'Remember'})`
        ).join('\n');
      }
    }

    const personaPrompt = `
[INSTITUTION CONTEXT]
Selected Curriculum: ${activeDoc ? activeDoc.name : 'None'}
Board: ${activeDoc?.authority || 'Pakistan National Curriculum'}
Total SLOs in Vault: ${activeDoc ? 'Loaded' : 'None'}

[REAL SLO DATA FROM SELECTED DOCUMENT]
${sloContext || 'No specific curriculum selected - use general pedagogical best practices.'}

[TOOL MODE]
Tool: ${getToolDisplayName(effectiveTool)}
Persona: ${persona}

[USER REQUEST]
${userInput}

${handoffContext ? `\n[PREVIOUS ARTIFACT FOR CONTINUITY]\n${handoffContext}` : ''}

Rules:
- Use ONLY the SLOs provided above when relevant.
- Always reference specific SLO codes (e.g. B09A01).
- Maintain strict alignment with Bloom's Taxonomy.
- Output in clean, professional Markdown.
`;

    const stream = geminiService.generatePedagogicalToolStream(
      effectiveTool, 
      personaPrompt, 
      { id: activeDoc?.id }, 
      brain, 
      user, 
      isCurriculumEnabled && activeDoc ? activeDoc.id : undefined 
    );

    let fullContent = '';
    for await (const chunk of stream) {
      if (chunk) {
        fullContent += chunk;
        setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: fullContent } : m));
        setCanvasContent(fullContent);
      }
    }

    await adaptiveService.captureGeneration(user.id, effectiveTool, fullContent, {
      tool: effectiveTool,
      document_id: activeDoc?.id,
      persona,
      isGlobalEnabled
    });

  } catch (err: any) {
    setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: `Synthesis Error: ${err.message}` } : m));
  } finally {
    setIsGenerating(false);
  }
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

  const handlePrint = () => {
    if (typeof window !== 'undefined') window.print();
  };

  const toolDefinitions = [
    { id: 'master_plan' as ToolType, name: 'Master Plan', icon: BookOpen, desc: 'Architecture of Instruction (5E, Madeline Hunter, UbD)', color: 'bg-indigo-600', iconColor: 'text-white' },
    { id: 'neural_quiz' as ToolType, name: 'Neural Quiz', icon: ClipboardCheck, desc: 'Standards-Aligned Assessment (MCQ, CRQ, Bloom Scaling)', color: 'bg-emerald-600', iconColor: 'text-white' },
    { id: 'fidelity_rubric' as ToolType, name: 'Fidelity Rubric', icon: Layers, desc: 'Criterion-Based Assessment (Observable, Measurable Descriptors)', color: 'bg-amber-600', iconColor: 'text-white' },
    { id: 'audit_tagger' as ToolType, name: 'Audit Tagger', icon: SearchCode, desc: 'SLO Logic Mapping (Curriculum Analysis, DOK, Gap ID)', color: 'bg-cyan-600', iconColor: 'text-white' },
  ];

  if (!activeTool) {
    return (
      <div className="max-w-5xl mx-auto w-full pt-8 pb-20 px-4 md:px-6 animate-in fade-in duration-500 relative z-10 text-left">
                                        {/* Vault Selector Slider */}
        <div className={`fixed inset-y-0 right-0 w-80 bg-white dark:bg-[#0d0d0d] shadow-2xl z-[200] transform transition-transform duration-500 border-l border-slate-100 dark:border-white/5 ${isSliderOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="p-8 flex flex-col h-full">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <Library size={20} className="text-indigo-600" />
                <h3 className="font-black text-xs uppercase tracking-widest text-slate-900 dark:text-white">Vault Selection</h3>
              </div>
              <button 
                onClick={() => setIsSliderOpen(false)} 
                className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-all"
              >
                <X size={20}/>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2">
              {localDocs.length === 0 ? (
                <p className="text-slate-400 text-center py-8">No documents in vault yet.<br />Upload curriculum PDFs first.</p>
              ) : (
                localDocs.map(doc => (
                  <button 
                    key={doc.id} 
                    onClick={() => toggleDocContext(doc.id)} 
                    disabled={isSwitchingContext}
                    className={`w-full text-left p-5 rounded-2xl border transition-all flex flex-col gap-1.5 ${doc.isSelected ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-slate-50 dark:bg-white/5 border-transparent text-slate-500 hover:border-slate-300'}`}
                  >
                    <span className={`text-[9px] font-black uppercase tracking-widest ${doc.isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>
                      Curriculum Node
                    </span>
                    <p className={`font-bold text-sm truncate ${doc.isSelected ? 'text-white' : 'text-slate-900 dark:text-slate-100'}`}>
                      {doc.name}
                    </p>
                    <p className={`text-[10px] font-medium uppercase tracking-tight ${doc.isSelected ? 'text-indigo-100' : 'text-slate-400'}`}>
                      {doc.subject || 'Detecting...'} • Grade {doc.gradeLevel || 'Auto'}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>       
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-12">
          <div className="flex items-center gap-6">
            <div className="p-4 bg-indigo-600 rounded-[2rem] text-white shadow-2xl shrink-0"><Zap size={32} /></div>
            <div>
              <h1 className="text-2xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">Synthesis Hub</h1>
              <div className="text-slate-500 font-medium text-xs md:text-lg mt-1 italic flex items-center gap-2">
                {isCurriculumEnabled && activeDoc ? (
                  <><ShieldCheck size={14} className="text-emerald-500" /> Brain v4.0 Linked: <span className="text-slate-900 dark:text-white font-bold truncate">{activeDoc.name}</span></>
                ) : (
                  <><Globe size={14} /> Autonomous Creative Intelligence Mode.</>
                )}
              </div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-[#111] p-2 rounded-[2.5rem] border border-slate-200 dark:border-white/5 shadow-2xl flex items-center gap-2 no-print">
            <button 
              onClick={() => setIsCurriculumEnabled(!isCurriculumEnabled)} 
              className={`flex items-center gap-3 px-6 py-3 rounded-full transition-all border ${isCurriculumEnabled ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg' : 'bg-slate-50 dark:bg-white/5 border-transparent text-slate-400'}`}
            >
              <BookMarked size={16} />
              <div className="text-left">
                <p className="text-[8px] font-black uppercase leading-none mb-0.5 tracking-widest">Vault</p>
                <p className="text-[10px] font-bold">Curriculum</p>
              </div>
            </button>
            <button 
              onClick={() => setIsSliderOpen(true)} 
              className={`p-3 rounded-full transition-all ml-1 shadow-inner ${isSliderOpen ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-600'}`}
            >
              <Library size={20} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 no-print">
          {toolDefinitions.map((tool) => (
            <button 
              key={tool.id} 
              onClick={() => setActiveTool(tool.id)} 
              className={`p-10 rounded-[3.5rem] border transition-all text-left flex flex-col gap-6 group bg-white dark:bg-[#111] border-slate-200 dark:border-white/5 hover:border-indigo-500 hover:shadow-2xl`}
            >
              <div className={`w-14 h-14 ${tool.color} rounded-2xl flex items-center justify-center ${tool.iconColor} shadow-lg`}>
                <tool.icon size={28} />
              </div>
              <div>
                <h3 className="font-black text-2xl text-slate-900 dark:text-white uppercase tracking-tight">{tool.name}</h3>
                <p className="text-slate-500 dark:text-slate-400 text-base mt-2 font-medium leading-relaxed">{tool.desc}</p>
              </div>
              <div className="flex items-center justify-between mt-auto">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-500 flex items-center gap-1">
                  <Sparkles size={10} /> Specialized Neural Tool
                </span>
                <ArrowRight size={24} className="text-indigo-600 transition-transform group-hover:translate-x-1" />
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ... (rest of the file remains the same - the artifact view, chat, etc.)
  // For brevity, I'm only showing the changed parts above. Keep the rest of your original Tools.tsx (the return for when activeTool is set) unchanged.

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] lg:h-[calc(100vh-64px)] bg-slate-50 dark:bg-[#080808] relative overflow-hidden print:h-auto print:overflow-visible">
      {/* Existing sidebar + artifact view code - unchanged */}
      {/* You can keep everything from your original file starting from "return (" here */}
      {/* Just make sure the handleGenerate call uses the updated personaPrompt with SELECTED_VAULT */}
    </div>
  );
};

export default Tools;
