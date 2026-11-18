'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Sparkles, ClipboardCheck, BookOpen, Layers, Loader2, 
  FileText, Copy, ArrowRight, PenTool, Compass, SearchCode, 
  Zap, ChevronLeft, Library, Globe, Check, X,
  BookMarked, ArrowRightCircle, ShieldCheck, Printer,
  BrainCircuit, Languages, FileDown, Download, Lock, AlertCircle
} from 'lucide-react';
import { BlinkingRobot } from '../components/BlinkingRobot';
import { geminiService } from '../services/geminiService';
import { adaptiveService } from '../services/adaptiveService';
import { NeuralBrain, Document, UserProfile, SubscriptionPlan } from '../types';
import { ChatInput } from '../components/chat/ChatInput';
import { MessageItem } from '../components/chat/MessageItem';
import { supabase } from '../lib/supabase';
import { ToolType, getToolDisplayName } from '../lib/ai/tool-router';
import { markdownToHtml } from '../lib/markdown-renderer';
import { PRINT_STYLES } from '../lib/tools-constants';
import { logActivity } from '../lib/activity-logger';
import { isAdminUser } from '../lib/auth/user-role';
import {
  TranslationQuotaError,
  TranslationQuotaStatus,
  fetchTranslationQuota,
  translateContentStream,
} from '../lib/translate/client-translate';
import {
  ArtifactLanguage,
  exportArtifactAsDocx,
  exportArtifactAsPdf,
} from '../lib/export/artifact-exporter';
import { MicroFeedbackBar } from '../components/MicroFeedbackBar';
import { trackProductEvent } from '../lib/analytics';

interface ToolsProps {
  brain: NeuralBrain;
  documents: Document[];
  onQuery: () => void;
  canQuery: boolean;
  user: UserProfile;
  onViewChange?: (view: string) => void;
}

type PersonaMode = 'architect' | 'creative' | 'auditor';

const Tools: React.FC<ToolsProps> = ({ brain, documents, onQuery, canQuery, user, onViewChange }) => {
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
  const [selectedLang, setSelectedLang] = useState<ArtifactLanguage>('en');
  const [translatingLang, setTranslatingLang] = useState<'ur' | 'sd' | null>(null);
  const [translations, setTranslations] = useState<Partial<Record<'ur' | 'sd', string>>>({});
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [translationQuota, setTranslationQuota] = useState<TranslationQuotaStatus | null>(null);
  const [quotaUpgradePrompt, setQuotaUpgradePrompt] = useState(false);
  const [isExporting, setIsExporting] = useState<'docx' | 'pdf' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showUpgradeHint, setShowUpgradeHint] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeDoc = localDocs.find(d => d.isSelected);
  const isDev = isAdminUser(user);
  const isPro = user.plan !== SubscriptionPlan.FREE || isDev;

  // -- Inject print styles ----------------------------------------------------
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
    let active = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || !active) return;
      const q = await fetchTranslationQuota(session.access_token);
      if (q && active) setTranslationQuota(q);
    })();
    return () => {
      active = false;
    };
  }, [user.id, user.plan]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: isGenerating ? 'auto' : 'smooth',
      });
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

    const startTime = performance.now();
    const effectiveTool = activeTool || 'master_plan';
    setIsGenerating(true);
    setWorkflowRecommendation(null);
    setTranslations({});
    setTranslationError(null);
    setExportError(null);
    setShowUpgradeHint(false);
    const aiMsgId = crypto.randomUUID();

    setMessages(prev => [...prev,
      { id: crypto.randomUUID(), role: 'user', content: userInput, timestamp: new Date().toISOString() },
      { id: aiMsgId, role: 'assistant', content: '', timestamp: new Date().toISOString() }
    ]);

    try {
      onQuery();
      if (window.innerWidth < 768) setMobileActiveTab('artifact');

      // FIX BUG 4: Build persona/mode context as adaptiveContextOverride.
      // This goes into the system prompt on the server — NOT into the user query.
      // Keeping userInput clean ensures the RAG embedding query is accurate.
      const adaptiveContextOverride = [
        `CURRICULUM_MODE: ${isCurriculumEnabled ? 'ACTIVE' : 'INACTIVE'}`,
        `GLOBAL_RESOURCES_MODE: ${isGlobalEnabled ? 'ACTIVE' : 'INACTIVE'}`,
        `EXPERT_MODULE: ${getToolDisplayName(effectiveTool)}`,
        persona === 'creative' ? 'PERSONA: Use highly engaging, active learning strategies.' : '',
        persona === 'auditor' ? 'PERSONA: Focus on standards rigor and alignment accuracy.' : '',
        handoffContext ? `WORKFLOW_CONTEXT: Use the following previous synthesis as a base:\n${handoffContext}` : '',
      ].filter(Boolean).join('\n');

      const stream = geminiService.generatePedagogicalToolStream(
        effectiveTool,
        userInput,              // FIX: clean query only — no wrapping
        // FIX BUG 9: No base64 — server uses RAG via priorityDocumentId
        { id: activeDoc?.id },
        brain,
        user,
        isCurriculumEnabled ? activeDoc?.id : undefined,
        adaptiveContextOverride // FIX: persona context goes here, not in userInput
      );

      let fullContent = '';
      let rafId: number | null = null;
      const flushArtifact = () => {
        rafId = null;
        const snapshot = fullContent;
        setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: snapshot } : m));
        setCanvasContent(snapshot);
      };

      for await (const chunk of stream) {
        if (chunk) {
          fullContent += chunk;
          if (typeof window !== 'undefined' && rafId === null) {
            rafId = window.requestAnimationFrame(flushArtifact);
          }
        }
      }

      if (rafId !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(rafId);
      }
      setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: fullContent } : m));
      setCanvasContent(fullContent);

      void adaptiveService.captureGeneration(
        user.id, effectiveTool, fullContent,
        { tool: effectiveTool, document_id: activeDoc?.id, persona, isGlobalEnabled }
      );

      logActivity({
        category: 'query_completion',
        action: `${getToolDisplayName(effectiveTool)} Completed`,
        summary: `Synthesized pedagogical plan for: "${userInput.slice(0, 60)}${userInput.length > 60 ? '...' : ''}"`,
        status: 'success',
        durationMs: Math.round(performance.now() - startTime),
        metadata: {
          toolName: effectiveTool,
          promptPreview: userInput.slice(0, 250),
          persona,
          documentId: activeDoc?.id,
          documentName: activeDoc?.name,
          artifactLength: fullContent.length
        }
      });
      trackProductEvent({
        action: 'tool_synthesis_completed',
        category: 'synthesis',
        label: effectiveTool,
        value: fullContent.length,
        toolType: effectiveTool,
        metadata: { persona, grounded: Boolean(isCurriculumEnabled && activeDoc) },
      });

    } catch (err: any) {
      setMessages(prev => prev.map(m =>
        m.id === aiMsgId ? { ...m, content: `Synthesis Error: ${err.message}` } : m
      ));
      logActivity({
        category: 'query_completion',
        action: `${getToolDisplayName(effectiveTool)} Failed`,
        summary: `Synthesis error: ${err?.message || 'Error occurred'}`,
        status: 'failed',
        durationMs: Math.round(performance.now() - startTime),
        metadata: {
          toolName: effectiveTool,
          promptPreview: userInput.slice(0, 250),
          errorMessage: err?.message
        }
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleWorkflowTransition = () => {
    if (!workflowRecommendation || isGenerating) return;
    const rawArtifact = canvasContent.split('--- Workflow Recommendation')[0].trim();
    const MAX_HANDOFF_CHARS = 8000; // safe limit of ~2000 tokens
    const previousArtifact = rawArtifact.length > MAX_HANDOFF_CHARS
      ? rawArtifact.slice(0, MAX_HANDOFF_CHARS) + '\n\n[...truncated for context efficiency...]'
      : rawArtifact;
    const toolName = getToolDisplayName(workflowRecommendation.tool);
    setActiveTool(workflowRecommendation.tool);
    handleGenerate(`Based on the previous ${getToolDisplayName(activeTool)}, synthesize a ${toolName}.`, previousArtifact);
  };

  const cleanEnglishContent = canvasContent
    ? canvasContent.split('--- Workflow Recommendation')[0].trim()
    : '';
  const displayedContent =
    selectedLang === 'en'
      ? cleanEnglishContent
      : translations[selectedLang] || cleanEnglishContent;
  const isRtl = selectedLang !== 'en' && Boolean(translations[selectedLang]);
  const rtlFontClass =
    isRtl && selectedLang === 'ur'
      ? 'font-urdu artifact-rtl'
      : isRtl && selectedLang === 'sd'
        ? 'font-sindhi artifact-rtl'
        : '';

  const translateArtifactTo = useCallback(async (sourceText: string, lang: 'ur' | 'sd') => {
    setIsTranslating(true);
    setTranslatingLang(lang);
    setTranslationError(null);
    setQuotaUpgradePrompt(false);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        throw new Error('Authentication session required to translate.');
      }

      const result = await translateContentStream({
        token,
        text: sourceText,
        targetLanguage: lang,
        onDraft: (draftText) => {
          setTranslations((prev) => ({
            ...prev,
            [lang]: draftText,
          }));
          setSelectedLang(lang);
        },
      });

      setTranslations((prev) => ({
        ...prev,
        [lang]: result.translatedText,
      }));
      if (result.quota) {
        setTranslationQuota(result.quota);
      }
      setSelectedLang(lang);
      trackProductEvent({
        action: 'artifact_translated',
        category: 'translation',
        label: lang,
        toolType: activeTool || 'master_plan',
      });
    } catch (err: any) {
      if (err instanceof TranslationQuotaError) {
        if (err.quota) setTranslationQuota(err.quota);
        setQuotaUpgradePrompt(err.quota?.period === 'month' || user.plan === SubscriptionPlan.FREE);
      }
      setTranslationError(err?.message || 'Translation failed. Please retry.');
    } finally {
      setIsTranslating(false);
      setTranslatingLang(null);
    }
  }, [user.plan]);

  useEffect(() => {
    if (
      !isGenerating &&
      cleanEnglishContent &&
      selectedLang !== 'en' &&
      !translations[selectedLang] &&
      !isTranslating &&
      !translationError
    ) {
      translateArtifactTo(cleanEnglishContent, selectedLang);
    }
  }, [
    isGenerating,
    cleanEnglishContent,
    selectedLang,
    translations,
    isTranslating,
    translationError,
    translateArtifactTo,
  ]);

  const handleSelectLanguage = async (lang: ArtifactLanguage) => {
    if (isGenerating || isTranslating) return;
    setTranslationError(null);

    if (lang === 'en') {
      setSelectedLang('en');
      return;
    }

    if (!cleanEnglishContent) {
      setSelectedLang(lang);
      return;
    }

    if (translations[lang]) {
      setSelectedLang(lang);
      return;
    }

    if (
      translationQuota &&
      !translationQuota.isDeveloper &&
      translationQuota.remaining !== null &&
      translationQuota.remaining <= 0
    ) {
      setQuotaUpgradePrompt(translationQuota.period === 'month');
      setTranslationError(
        translationQuota.period === 'day'
          ? `Daily translation limit reached (${translationQuota.used}/${translationQuota.limit} Urdu & Sindhi translations used today). Resets tomorrow (UTC).`
          : `Free plan translation limit reached (${translationQuota.used}/${translationQuota.limit} Urdu & Sindhi translations used this month). Upgrade for 5 translations/day.`
      );
      return;
    }

    await translateArtifactTo(cleanEnglishContent, lang);
  };

  const handleRichCopy = async () => {
    if (!displayedContent) return;
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        const htmlContent = `<div dir="${isRtl ? 'rtl' : 'ltr'}">${markdownToHtml(displayedContent, isRtl ? 'rtl' : 'ltr')}</div>`;
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': new Blob([displayedContent], { type: 'text/plain' }),
            'text/html': new Blob([htmlContent], { type: 'text/html' }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(displayedContent);
      }
    } catch {
      await navigator.clipboard.writeText(displayedContent);
    }
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
    trackProductEvent({
      action: 'artifact_copied',
      category: 'export',
      label: selectedLang,
      toolType: activeTool || 'master_plan',
    });
  };

  const handleDownload = async (format: 'docx' | 'pdf') => {
    if (!displayedContent || isGenerating || isTranslating || isExporting) return;
    setExportError(null);

    if (!isPro) {
      setShowUpgradeHint(true);
      return;
    }

    setIsExporting(format);
    try {
      const payload = {
        markdown: displayedContent,
        toolName: getToolDisplayName(activeTool || 'master_plan'),
        documentName: activeDoc?.name,
        userName: user.name,
        language: selectedLang,
      };
      if (format === 'docx') {
        await exportArtifactAsDocx(payload);
      } else {
        await exportArtifactAsPdf(payload);
      }
    } catch (err: any) {
      setExportError(err?.message || `Failed to export ${format.toUpperCase()} file.`);
    } finally {
      setIsExporting(null);
    }
  };

  const handlePrint = () => {
    if (!isPro) {
      setShowUpgradeHint(true);
      return;
    }
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const toolDefinitions: { id: ToolType | 'chat', name: string, icon: any, desc: string, color: string, iconColor: string }[] = [
    { id: 'master_plan', name: 'Master Plan', icon: BookOpen, desc: 'Architecture of Instruction (5E, Madeline Hunter, UbD)', color: 'bg-indigo-600', iconColor: 'text-white' },
    { id: 'neural_quiz', name: 'Neural Quiz', icon: ClipboardCheck, desc: 'Standards-Aligned Assessment (MCQ, CRQ, Bloom Scaling)', color: 'bg-emerald-600', iconColor: 'text-white' },
    { id: 'fidelity_rubric', name: 'Fidelity Rubric', icon: Layers, desc: 'Criterion-Based Assessment (Observable, Measurable Descriptors)', color: 'bg-amber-600', iconColor: 'text-white' },
    { id: 'audit_tagger', name: 'Audit Tagger', icon: SearchCode, desc: 'SLO Logic Mapping (Curriculum Analysis, DOK, Gap ID)', color: 'bg-cyan-600', iconColor: 'text-white' },
    { id: 'chat', name: 'Neural Chat', icon: BrainCircuit, desc: 'Conversational Pedagogical Assistant (General Q&A, Brainstorming)', color: 'bg-rose-600', iconColor: 'text-white' },
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
                {isCurriculumEnabled && activeDoc ? <><ShieldCheck size={14} className="text-emerald-500" /><span className="truncate">Brain v4.0 Linked: <span className="text-slate-900 dark:text-white font-bold">{activeDoc.name}</span></span></> : <><Globe size={14} /><span className="truncate">Autonomous Creative Intelligence Mode &bull; English, اردو (Urdu) &amp; سنڌي (Sindhi) Output</span></>}
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
            <button key={tool.id} onClick={() => {
              if (tool.id === 'chat') {
                onViewChange?.('chat');
              } else {
                setActiveTool(tool.id as ToolType);
                setMessages([]);
                setCanvasContent('');
                setWorkflowRecommendation(null);
                setSelectedLang('en');
                setTranslations({});
                setTranslationError(null);
                setExportError(null);
                setShowUpgradeHint(false);
              }
            }} className={`p-10 rounded-[3.5rem] border transition-all text-left flex flex-col gap-6 group bg-white dark:bg-[#111] border-slate-200 dark:border-white/5 hover:border-indigo-500 hover:shadow-2xl`}>
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
      <div className="flex md:hidden border-b border-slate-200 dark:border-white/5 bg-white dark:bg-[#0d0d0d] px-4 py-2 gap-2 no-print">
        <button
          type="button"
          onClick={() => setMobileActiveTab('logs')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
            mobileActiveTab === 'logs'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300'
          }`}
        >
          Prompt &amp; Logs
        </button>
        <button
          type="button"
          onClick={() => setMobileActiveTab('artifact')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
            mobileActiveTab === 'artifact'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300'
          }`}
        >
          Artifact &amp; Translate
        </button>
      </div>
      <div className="flex-1 flex overflow-hidden print:block print:overflow-visible">
        <div className={`flex flex-col border-r border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-[#0d0d0d] transition-all duration-300 no-print ${mobileActiveTab === 'artifact' ? 'hidden md:flex' : 'flex'} w-full md:w-[380px] shrink-0`}>
          <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between bg-white dark:bg-[#0d0d0d]">
             <div className="flex items-center gap-3">
               <button onClick={() => {setActiveTool(null); setMessages([]); setCanvasContent(''); setSelectedLang('en'); setTranslations({}); setTranslationError(null); setExportError(null); setShowUpgradeHint(false);}} className="p-2 -ml-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl text-slate-500 transition-all"><ChevronLeft size={22}/></button>
               <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{getToolDisplayName(activeTool)}</span>
             </div>
             <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/5 p-1 rounded-xl">
                <button onClick={() => setPersona('architect')} title="Instructional Architect" className={`p-1.5 rounded-lg ${persona === 'architect' ? 'bg-white dark:bg-white/10 text-indigo-600 shadow-sm' : 'text-slate-400'}`}><PenTool size={14}/></button>
                <button onClick={() => setPersona('creative')} title="Creative Designer" className={`p-1.5 rounded-lg ${persona === 'creative' ? 'bg-white dark:bg-white/10 text-rose-600 shadow-sm' : 'text-slate-400'}`}><Compass size={14}/></button>
                <button onClick={() => setPersona('auditor')} title="Curriculum Auditor" className={`p-1.5 rounded-lg ${persona === 'auditor' ? 'bg-white dark:bg-white/10 text-emerald-600 shadow-sm' : 'text-slate-400'}`}><SearchCode size={14}/></button>
             </div>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar py-6 space-y-2">
            {messages.map((m, idx) => (
              <MessageItem
                key={m.id}
                id={m.id}
                role={m.role}
                content={m.content}
                timestamp={m.timestamp}
                metadata={m.metadata}
                isStreaming={isGenerating && idx === messages.length - 1}
              />
            ))}
          </div>
          <div className="p-6 border-t dark:border-white/5 bg-white dark:bg-[#0d0d0d] space-y-2">
            {!canQuery && (
              <div className="px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 text-amber-800 dark:text-amber-200 text-[11px] font-semibold flex items-center justify-between gap-2">
                <span>Daily free synthesis limit reached ({user.queriesUsed}/{user.queriesLimit}). Resets tomorrow (UTC).</span>
                <button
                  type="button"
                  onClick={() => onViewChange?.('pricing')}
                  className="text-indigo-600 dark:text-indigo-400 font-bold underline whitespace-nowrap"
                >
                  Upcoming Plans
                </button>
              </div>
            )}
            <ChatInput onSend={handleGenerate} isLoading={isGenerating} disabled={!canQuery} placeholder={`Refine ${getToolDisplayName(activeTool)}...`} />
          </div>
        </div>

        <div className={`flex-1 min-w-0 flex flex-col bg-white dark:bg-[#0a0a0a] transition-all duration-300 ${mobileActiveTab === 'logs' ? 'hidden md:flex' : 'flex'} overflow-hidden print:block print:overflow-visible`}>
           <div className="px-4 md:px-8 py-3.5 border-b border-slate-100 dark:border-white/5 flex flex-wrap items-center justify-between gap-3 shrink-0 bg-white dark:bg-[#0a0a0a] z-10 no-print">
              <div className="flex items-center gap-3 min-w-0">
                <BlinkingRobot size="sm" isThinking={isGenerating} />
                <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white whitespace-nowrap">Neural Artifact Node</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div
                  role="group"
                  aria-label="Output language"
                  className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 shrink-0"
                >
                  <span className="px-2 text-slate-400 inline-flex items-center gap-1" title="Google Translate (Urdu & Sindhi)">
                    {isTranslating ? <Loader2 size={13} className="animate-spin text-indigo-600" /> : <Languages size={13} />}
                    <span className="text-[10px] font-bold uppercase tracking-wider hidden xl:inline">Translate</span>
                  </span>
                  {(
                    [
                      { id: 'en', label: 'English' },
                      { id: 'ur', label: 'اردو (Urdu)' },
                      { id: 'sd', label: 'سنڌي (Sindhi)' },
                    ] as const
                  ).map((langOpt) => {
                    const active = selectedLang === langOpt.id;
                    return (
                      <button
                        key={langOpt.id}
                        type="button"
                        disabled={isGenerating || isTranslating}
                        onClick={() => handleSelectLanguage(langOpt.id)}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap shrink-0 disabled:opacity-50 ${
                          active
                            ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                            : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {langOpt.label}
                      </button>
                    );
                  })}
                </div>

                {translationQuota && (
                  <span
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wide whitespace-nowrap shrink-0 border ${
                      translationQuota.isDeveloper
                        ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-700/40 text-amber-700 dark:text-amber-300'
                        : (translationQuota.remaining ?? 0) <= 0
                          ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/40 text-rose-600 dark:text-rose-400'
                          : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {translationQuota.isDeveloper
                      ? 'Dev Unlimited'
                      : `${translationQuota.remaining}/${translationQuota.limit} left ${translationQuota.period === 'day' ? 'today' : 'this month'}`}
                  </span>
                )}

                {workflowRecommendation && !isGenerating && (
                  <button onClick={handleWorkflowTransition} className="px-3.5 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl transition-all flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest shadow-sm whitespace-nowrap shrink-0">
                    <ArrowRightCircle size={14}/> Next: {getToolDisplayName(workflowRecommendation.tool)}
                  </button>
                )}

                <button
                  type="button"
                  disabled={!displayedContent}
                  onClick={handleRichCopy}
                  className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest whitespace-nowrap shrink-0 border disabled:opacity-40 ${
                    copySuccess
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400'
                      : 'border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {copySuccess ? <Check size={14}/> : <Copy size={14}/>}
                  {copySuccess ? 'Copied' : selectedLang === 'en' ? 'Copy Text' : selectedLang === 'ur' ? 'Copy Urdu' : 'Copy Sindhi'}
                </button>

                <button
                  type="button"
                  disabled={!displayedContent || isGenerating || isTranslating || isExporting !== null}
                  onClick={() => handleDownload('docx')}
                  title={isPro ? 'Download as Word (.docx)' : 'Paid feature: Upgrade to download DOCX'}
                  className={`px-3 py-2 rounded-xl transition-all flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest whitespace-nowrap shrink-0 border disabled:opacity-40 ${
                    isPro
                      ? 'border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/70 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40'
                      : 'border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-amber-300 dark:hover:border-amber-500/40'
                  }`}
                >
                  {isExporting === 'docx' ? <Loader2 size={14} className="animate-spin" /> : isPro ? <FileDown size={14} /> : <Lock size={13} className="text-amber-500" />}
                  DOCX
                </button>

                <button
                  type="button"
                  disabled={!displayedContent || isGenerating || isTranslating || isExporting !== null}
                  onClick={() => handleDownload('pdf')}
                  title={isPro ? 'Download as PDF (.pdf)' : 'Paid feature: Upgrade to download PDF'}
                  className={`px-3 py-2 rounded-xl transition-all flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest whitespace-nowrap shrink-0 border disabled:opacity-40 ${
                    isPro
                      ? 'border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
                      : 'border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-amber-300 dark:hover:border-amber-500/40'
                  }`}
                >
                  {isExporting === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : isPro ? <Download size={14} /> : <Lock size={13} className="text-amber-500" />}
                  PDF
                </button>

                {isPro && (
                  <button
                    type="button"
                    disabled={!displayedContent || isGenerating || isTranslating}
                    onClick={handlePrint}
                    className="px-3 py-2 border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 rounded-xl transition-all flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest whitespace-nowrap shrink-0 disabled:opacity-40"
                  >
                    <Printer size={14}/> Print
                  </button>
                )}
              </div>
           </div>

           {(translationError || exportError || showUpgradeHint) && (
             <div className="px-4 md:px-8 py-2.5 border-b border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-[#111] flex flex-wrap items-center justify-between gap-3 text-xs no-print">
               {showUpgradeHint ? (
                   <>
                     <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-medium">
                       <Lock size={14} className="text-amber-500 shrink-0" />
                       <span>Free users can copy &amp; paste translated Urdu/Sindhi content anytime. Paid plans (~$9/mo USD) with DOCX &amp; PDF downloads will be available soon.</span>
                     </div>
                     <div className="flex items-center gap-2 shrink-0">
                       <button
                         type="button"
                         onClick={() => onViewChange?.('pricing')}
                         className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap"
                       >
                         View Upcoming Plans
                       </button>
                       <button
                         type="button"
                         onClick={() => setShowUpgradeHint(false)}
                         className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                         aria-label="Dismiss upgrade message"
                       >
                         <X size={14} />
                       </button>
                     </div>
                   </>
                 ) : (
                   <>
                     <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-medium">
                       <AlertCircle size={14} className="shrink-0" />
                       <span>{translationError || exportError}</span>
                     </div>
                     <div className="flex items-center gap-2 shrink-0">
                       {quotaUpgradePrompt && onViewChange && (
                         <button
                           type="button"
                           onClick={() => onViewChange('pricing')}
                           className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap"
                         >
                           Upcoming Plans
                         </button>
                       )}
                     <button
                       type="button"
                       onClick={() => { setTranslationError(null); setExportError(null); setQuotaUpgradePrompt(false); }}
                       className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                       aria-label="Dismiss error"
                     >
                       <X size={14} />
                     </button>
                   </div>
                 </>
               )}
             </div>
           )}
           
           <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-12 lg:p-20 bg-slate-50/20 dark:bg-[#0a0a0a] print:p-0 print:overflow-visible">
              {/* Print zone - hidden on screen, visible only when printing */}
              <div id="pm-print-zone" dir={isRtl ? 'rtl' : 'ltr'} className={`hidden ${rtlFontClass}`}>
                <table className="pm-print-container">
                  <thead>
                    <tr>
                      <td>
                        <div className="pm-print-header" dir="ltr">
                          <div>
                            <div style={{ fontSize: '18pt', fontWeight: 900, textTransform: 'uppercase', color: '#1e3a5f' }}>Pedagogy Master AI</div>
                            <div style={{ fontSize: '10pt', color: '#64748b', marginTop: '2pt' }}>{getToolDisplayName(activeTool || 'master_plan')} &bull; {activeDoc ? activeDoc.name : 'General Mode'}</div>
                          </div>
                          <div style={{ textAlign: 'right', fontSize: '9pt', color: '#94a3b8' }}>
                            <div style={{ fontWeight: 700, color: '#475569' }}>{user.name}</div>
                            <div>pedagogy-master.vercel.app</div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <div dangerouslySetInnerHTML={{ __html: markdownToHtml(displayedContent, isRtl ? 'rtl' : 'ltr') }} />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="max-w-4xl mx-auto bg-white dark:bg-[#111] p-6 md:p-16 lg:p-20 rounded-[3rem] shadow-2xl border border-slate-100 dark:border-white/5 min-h-full print:shadow-none print:border-none print:rounded-none print:p-0 relative">
                {isTranslating && (
                  <div className="mb-6 px-4 py-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-800/40 flex items-center gap-3 text-xs font-semibold text-indigo-700 dark:text-indigo-300 no-print">
                    <Loader2 size={16} className="animate-spin shrink-0" />
                    <span>
                      {translatingLang === 'sd'
                        ? 'Translating & verifying Sindhi academic accuracy with contextual QA...'
                        : 'Translating artifact with Google Translate...'}
                    </span>
                  </div>
                )}
                {displayedContent ? (
                  <>
                    <div
                      dir={isRtl ? 'rtl' : 'ltr'}
                      className={`prose dark:prose-invert max-w-full text-sm md:text-base leading-relaxed animate-in fade-in duration-500 ${rtlFontClass}`}
                      dangerouslySetInnerHTML={{ __html: markdownToHtml(displayedContent, isRtl ? 'rtl' : 'ltr') }}
                    />
                    {!isGenerating && (
                      <MicroFeedbackBar
                        key={`${activeTool}-${cleanEnglishContent.length}`}
                        toolType={activeTool || 'master_plan'}
                        language={selectedLang}
                        targetType="artifact"
                        preview={cleanEnglishContent.slice(0, 120)}
                      />
                    )}
                  </>
                ) : isGenerating ? (
                  <div className="flex flex-col items-center justify-center h-full py-32 text-center no-print space-y-5 animate-in fade-in">
                    <BlinkingRobot size="lg" isThinking />
                    <div className="space-y-1.5">
                      <h2 className="text-sm font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Synthesizing Artifact</h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Streaming high-speed pedagogical structure...</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full py-32 text-center no-print">
                    <div className="mb-6"><BlinkingRobot size="lg" /></div>
                    <h2 className="text-base font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Ready to Synthesize</h2>
                    <p className="mt-3 max-w-md text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      Enter a prompt on the left. Use the language bar above to switch output between <span className="font-semibold text-slate-700 dark:text-slate-200">English</span>, <span className="font-semibold text-slate-700 dark:text-slate-200">اردو (Urdu)</span>, and <span className="font-semibold text-slate-700 dark:text-slate-200">سنڌي (Sindhi)</span>.
                    </p>
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
