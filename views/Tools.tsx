'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles, ClipboardCheck, BookOpen, Layers, Loader2,
  FileText, Copy, ArrowRight, PenTool, Compass, SearchCode,
  Zap, ChevronLeft, Library, Crown, Globe2, Globe, Check, X,
  FileEdit, Search, BookMarked, ArrowRightCircle, ShieldCheck, Printer,
  Download
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
  const [isSliderOpen, setIsSliderOpen] = useState(false);
  const [localDocs, setLocalDocs] = useState<Document[]>(documents);
  const [isSwitchingContext, setIsSwitchingContext] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

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

  // Local Save as Markdown
  const handleSaveMarkdown = async () => {
    if (!canvasContent) return;
    
    const cleanContent = canvasContent.split('--- Workflow Recommendation')[0].trim();
    const toolName = activeTool ? getToolDisplayName(activeTool) : 'Output';
    const filename = `${toolName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.md`;

    const blob = new Blob([cleanContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  // Local Save as PDF (via Print)
  const handleSavePDF = () => {
    window.print();
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

      // Real SLO Context Injection
      let sloContext = '';
      if (isCurriculumEnabled && activeDoc?.id) {
        const { data: slos } = await supabase
          .from('slo_database')
          .select('slo_code, slo_full_text, bloom_level, domain, grade_level')
          .eq('document_id', activeDoc.id)
          .limit(60);

        if (slos && slos.length > 0) {
          sloContext = slos.map(s => 
            `SLO: ${s.slo_code} | Grade: ${s.grade_level} | Domain: ${s.domain || 'N/A'} | Bloom: ${s.bloom_level || 'Remember'}\n${s.slo_full_text}`
          ).join('\n\n');
        }
      }

      const personaPrompt = `
[VAULT ANCHORED CONTEXT]
Selected Document: ${activeDoc ? activeDoc.name : 'None'}
Board: ${activeDoc?.authority || 'General Pakistan Curriculum'}
Subject: ${activeDoc?.subject || 'General'}
Grade Level: ${activeDoc?.gradeLevel || 'Auto-detected'}

[REAL SLOs FROM SELECTED VAULT]
${sloContext || 'No specific SLOs selected. Use general best practices.'}

[TOOL ACTIVATED]
Active Tool: ${getToolDisplayName(effectiveTool)}
Persona: ${persona}
Current User Request: ${userInput}

${handoffContext ? `\n[PREVIOUS OUTPUT FOR CONTINUITY]\n${handoffContext}` : ''}

Instructions:
- Always reference specific SLO codes when relevant.
- Use real SLO text from the vault above.
- Maintain strict Bloom's Taxonomy alignment.
- Output using the full professional template for the active tool.
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

    } catch (err: any) {
      setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: `Synthesis Error: ${err.message}` } : m));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRichCopy = async () => {
    if (!canvasContent) return;
    const cleanText = canvasContent.split('--- Workflow Recommendation')[0].trim();
    await navigator.clipboard.writeText(cleanText);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const toolDefinitions = [
    { id: 'master_plan' as ToolType, name: 'Master Plan', icon: BookOpen, desc: 'Architecture of Instruction', color: 'bg-indigo-600', iconColor: 'text-white' },
    { id: 'neural_quiz' as ToolType, name: 'Neural Quiz', icon: ClipboardCheck, desc: 'Standards-Aligned Assessment', color: 'bg-emerald-600', iconColor: 'text-white' },
    { id: 'fidelity_rubric' as ToolType, name: 'Fidelity Rubric', icon: Layers, desc: 'Criterion-Based Assessment', color: 'bg-amber-600', iconColor: 'text-white' },
    { id: 'audit_tagger' as ToolType, name: 'Audit Tagger', icon: SearchCode, desc: 'SLO Logic Mapping', color: 'bg-cyan-600', iconColor: 'text-white' },
  ];

  // Vault Selector Screen
  if (!activeTool) {
    return (
      <div className="max-w-5xl mx-auto w-full pt-8 pb-20 px-4 md:px-6 animate-in fade-in duration-500 relative z-10 text-left">
        {/* Vault Selector */}
        <div className={`fixed inset-y-0 right-0 w-80 bg-white dark:bg-[#0d0d0d] shadow-2xl z-[200] transform transition-transform duration-500 border-l border-slate-100 dark:border-white/5 ${isSliderOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          {/* ... your existing vault selector code ... */}
        </div>

        {/* Main Tools Grid - unchanged */}
        {/* ... your existing grid ... */}
      </div>
    );
  }

  // Artifact View with Local Save Options
  return (
    <div className="flex flex-col h-[calc(100vh-120px)] lg:h-[calc(100vh-64px)] bg-slate-50 dark:bg-[#080808] relative overflow-hidden print:h-auto print:overflow-visible">
      {/* Header with Save Buttons */}
      <div className="px-8 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between shrink-0 bg-white dark:bg-[#0a0a0a] z-10 no-print">
        <div className="flex items-center gap-3">
          <FileEdit size={18} className="text-indigo-600" />
          <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white">
            {activeTool ? getToolDisplayName(activeTool) : 'Neural Artifact'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={handleRichCopy}
            className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest ${copySuccess ? 'bg-emerald-50 text-emerald-600' : 'hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600'}`}
          >
            {copySuccess ? <Check size={14}/> : <Copy size={14}/>} Copy
          </button>

          <button 
            onClick={handleSaveMarkdown}
            className="px-4 py-2 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 rounded-xl transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"
          >
            <Download size={14}/> Save MD
          </button>

          <button 
            onClick={handleSavePDF}
            className="px-4 py-2 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 rounded-xl transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"
          >
            <Printer size={14}/> Save PDF
          </button>
        </div>
      </div>

      {/* Artifact Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-12 lg:p-20 bg-slate-50/20 dark:bg-[#0a0a0a] print:p-0">
        <div className="max-w-4xl mx-auto bg-white dark:bg-[#111] p-6 md:p-16 lg:p-20 rounded-[3rem] shadow-2xl border border-slate-100 dark:border-white/5 min-h-full print:shadow-none print:border-none print:rounded-none print:p-0">
          {canvasContent ? (
            <div 
              className="prose dark:prose-invert max-w-full text-sm md:text-base leading-relaxed animate-in fade-in duration-500" 
              dangerouslySetInnerHTML={{ __html: markdownToHtml(canvasContent.split('--- Workflow Recommendation')[0].trim()) }} 
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-40 text-center opacity-30 no-print">
              <div className="w-20 h-20 bg-slate-100 dark:bg-white/5 rounded-[2rem] flex items-center justify-center mb-8">
                <FileText size={48} className="text-slate-300" />
              </div>
              <h2 className="text-lg font-black text-slate-300 uppercase tracking-widest">Select a tool to begin synthesis</h2>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Tools;
