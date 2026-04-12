'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles, ClipboardCheck, BookOpen, Layers, Loader2,
  FileText, Copy, ArrowRight, PenTool, Compass, SearchCode,
  Zap, ChevronLeft, Library, Crown, Globe2, Globe, Check, X,
  FileEdit, Search, BookMarked, ArrowRightCircle, ShieldCheck, Printer, Download
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

  const scrollRef = useRef<HTMLDivElement>(null);
  const activeDoc = localDocs.find(d => d.isSelected);

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

  const toggleDocContext = async (docId: string) => {
    const updated = localDocs.map(d => ({
      ...d,
      isSelected: d.id === docId ? !d.isSelected : false
    }));
    setLocalDocs(updated);
    setIsSwitchingContext(true);

    try {
      await supabase.from('documents').update({ is_selected: false }).eq('user_id', user.id);
      if (updated.find(d => d.id === docId && d.isSelected)) {
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
    const aiMsgId = crypto.randomUUID();

    setMessages(prev => [...prev,
      { id: crypto.randomUUID(), role: 'user', content: userInput, timestamp: new Date().toISOString() },
      { id: aiMsgId, role: 'assistant', content: '', timestamp: new Date().toISOString() }
    ]);

    try {
      onQuery();
      if (window.innerWidth < 768) setMobileActiveTab('artifact');

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

[REAL SLOs FROM VAULT]
${sloContext || 'No specific SLOs selected.'}

[TOOL ACTIVATED]
Active Tool: ${getToolDisplayName(effectiveTool)}
Persona: ${persona}
User Request: ${userInput}
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
      console.error("Generation error:", err);
      setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: `Error: ${err.message}` } : m));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveMarkdown = () => {
    if (!canvasContent) return;
    const cleanContent = canvasContent.split('--- Workflow Recommendation')[0].trim();
    const filename = `${activeTool || 'output'}_${new Date().toISOString().slice(0,10)}.md`;

    const blob = new Blob([cleanContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => window.print();

  const toolDefinitions = [
    { id: 'master_plan' as ToolType, name: 'Master Plan', icon: BookOpen, desc: 'Architecture of Instruction', color: 'bg-indigo-600' },
    { id: 'neural_quiz' as ToolType, name: 'Neural Quiz', icon: ClipboardCheck, desc: 'Standards-Aligned Assessment', color: 'bg-emerald-600' },
    { id: 'fidelity_rubric' as ToolType, name: 'Fidelity Rubric', icon: Layers, desc: 'Criterion-Based Assessment', color: 'bg-amber-600' },
    { id: 'audit_tagger' as ToolType, name: 'Audit Tagger', icon: SearchCode, desc: 'SLO Logic Mapping', color: 'bg-cyan-600' },
  ];

  // Main Tools Grid (when no tool is active)
  if (!activeTool) {
    return (
      <div className="max-w-5xl mx-auto w-full pt-8 pb-20 px-4 md:px-6 animate-in fade-in duration-500">
        {/* Vault Selector */}
        <div className={`fixed inset-y-0 right-0 w-80 bg-white dark:bg-[#0d0d0d] shadow-2xl z-[200] transform transition-transform duration-500 border-l border-slate-100 dark:border-white/5 ${isSliderOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="p-8 flex flex-col h-full">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <Library size={20} className="text-indigo-600" />
                <h3 className="font-black text-xs uppercase tracking-widest">Vault Selection</h3>
              </div>
              <button onClick={() => setIsSliderOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3">
              {localDocs.length === 0 ? (
                <p className="text-slate-400 text-center py-12">No documents yet.<br />Upload curriculum PDFs first.</p>
              ) : (
                localDocs.map(doc => (
                  <button
                    key={doc.id}
                    onClick={() => toggleDocContext(doc.id)}
                    className={`w-full text-left p-5 rounded-2xl border transition-all ${doc.isSelected ? 'bg-indigo-600 text-white' : 'hover:border-indigo-300'}`}
                  >
                    <p className="font-bold">{doc.name}</p>
                    <p className="text-sm opacity-75">{doc.subject} • Grade {doc.gradeLevel || '?'}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-4xl font-black tracking-tight">Synthesis Hub</h1>
            <p className="text-slate-500 mt-1">Choose a specialized neural tool</p>
          </div>
          <button
            onClick={() => setIsSliderOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-2xl hover:border-indigo-400"
          >
            <Library size={18} /> Open Vault
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {toolDefinitions.map((tool) => (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              className={`p-8 rounded-3xl border hover:border-indigo-500 transition-all group bg-white dark:bg-slate-900`}
            >
              <div className={`w-12 h-12 ${tool.color} rounded-2xl flex items-center justify-center mb-6`}>
                <tool.icon size={28} className="text-white" />
              </div>
              <h3 className="text-2xl font-bold mb-2">{tool.name}</h3>
              <p className="text-slate-600 dark:text-slate-400">{tool.desc}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // When a tool is active - show artifact view with save options
  return (
    <div className="flex flex-col h-[calc(100vh-120px)] bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="border-b p-4 flex justify-between items-center bg-white dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <button onClick={() => setActiveTool(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl">
            ← Back
          </button>
          <h2 className="font-bold text-lg">{getToolDisplayName(activeTool!)}</h2>
        </div>

        <div className="flex gap-2">
          <button onClick={handleRichCopy} className="px-4 py-2 text-sm font-medium rounded-xl border hover:bg-slate-100">Copy</button>
          <button onClick={handleSaveMarkdown} className="px-4 py-2 text-sm font-medium rounded-xl border hover:bg-slate-100 flex items-center gap-1">
            <Download size={16} /> Save MD
          </button>
          <button onClick={handlePrint} className="px-4 py-2 text-sm font-medium rounded-xl border hover:bg-slate-100 flex items-center gap-1">
            <Printer size={16} /> PDF
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-4xl mx-auto bg-white dark:bg-slate-900 rounded-3xl p-10 shadow">
          {canvasContent ? (
            <div dangerouslySetInnerHTML={{ __html: markdownToHtml(canvasContent) }} className="prose dark:prose-invert max-w-none" />
          ) : (
            <div className="text-center py-20 text-slate-400">
              Generating content...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Tools;
