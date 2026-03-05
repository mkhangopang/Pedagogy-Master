'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles, ClipboardCheck, BookOpen, Layers, Loader2,
  FileText, Copy, ArrowRight, PenTool, Compass, SearchCode,
  Zap, ChevronLeft, Library, Check, X,
  FileEdit, BookMarked, ArrowRightCircle, ShieldCheck,
  Download, Share2, Printer, Link2, Mail, Globe,
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

const TOOL_DEFS = [
  { id: 'master_plan'    as ToolType, name: 'Master Plan',     icon: BookOpen,     desc: 'Architecture of Instruction (5E, Madeline Hunter, UbD)',                  color: 'bg-indigo-600', iconColor: 'text-white' },
  { id: 'neural_quiz'    as ToolType, name: 'Neural Quiz',     icon: ClipboardCheck, desc: 'Standards-Aligned Assessment (MCQ, CRQ, Bloom Scaling)',               color: 'bg-emerald-600', iconColor: 'text-white' },
  { id: 'fidelity_rubric'as ToolType, name: 'Fidelity Rubric', icon: Layers,       desc: 'Criterion-Based Assessment (Observable, Measurable Descriptors)',        color: 'bg-amber-600',  iconColor: 'text-white' },
  { id: 'audit_tagger'   as ToolType, name: 'Audit Tagger',    icon: SearchCode,   desc: 'SLO Logic Mapping (Curriculum Analysis, DOK, Gap ID)',                   color: 'bg-cyan-600',   iconColor: 'text-white' },
];

const Tools: React.FC<ToolsProps> = ({ brain, documents, onQuery, canQuery, user }) => {
  const [activeTool, setActiveTool]           = useState<ToolType | null>(null);
  const [persona, setPersona]                 = useState<PersonaMode>('architect');
  const [messages, setMessages]               = useState<any[]>([]);
  const [isGenerating, setIsGenerating]       = useState(false);
  const [canvasContent, setCanvasContent]     = useState('');
  const [mobileTab, setMobileTab]             = useState<'logs' | 'artifact'>('logs');
  const [curriculumOn, setCurriculumOn]       = useState(true);
  const [globalOn, setGlobalOn]               = useState(false);
  const [sliderOpen, setSliderOpen]           = useState(false);
  const [localDocs, setLocalDocs]             = useState<Document[]>(documents);
  const [switching, setSwitching]             = useState(false);
  const [copied, setCopied]                   = useState(false);
  const [shareMenu, setShareMenu]             = useState(false);
  const [shareMsg, setShareMsg]               = useState('');
  const [workflow, setWorkflow]               = useState<{ tool: ToolType; reason: string } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const activeDoc = localDocs.find(d => d.isSelected);

  // -- Inject print styles ----------------------------------------------------
  useEffect(() => {
    if (document.getElementById('pm-print-styles')) return;
    const el = document.createElement('style');
    el.id = 'pm-print-styles';
    el.innerHTML = PRINT_STYLES;
    document.head.appendChild(el);
  }, []);

  useEffect(() => { setLocalDocs(documents); }, [documents]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isGenerating]);

  useEffect(() => {
    if (!canvasContent || isGenerating) return;
    const m = canvasContent.match(/--- Workflow Recommendation:\s*(\w+)\s*\|\s*([^---]+)\s*---/i);
    setWorkflow(m ? { tool: m[1].toLowerCase() as ToolType, reason: m[2].trim() } : null);
  }, [canvasContent, isGenerating]);

  // -- Helpers ----------------------------------------------------------------
  const cleanContent = () => canvasContent.split('--- Workflow Recommendation')[0].trim();

  const buildPrompt = (userInput: string, handoff?: string) => {
    const lines = [
      '[CONTEXT_MODES]',
      'CURRICULUM_MODE: ' + (curriculumOn ? 'ACTIVE' : 'INACTIVE'),
      'GLOBAL_MODE: ' + (globalOn ? 'ACTIVE' : 'INACTIVE'),
      'EXPERT_MODULE: ' + getToolDisplayName(activeTool || 'master_plan'),
      '[PERSONA_OVERLAY]',
    ];
    if (persona === 'creative') lines.push('[CREATIVE_MODE: ON] Use highly engaging, active learning strategies.');
    if (persona === 'auditor')  lines.push('[AUDIT_MODE: ON] Focus on standards rigor and alignment.');
    if (handoff) { lines.push('[WORKFLOW_CONTEXT]'); lines.push(handoff); }
    lines.push('USER_QUERY: ' + userInput);
    return lines.join('\n');
  };

  // -- Toggle doc context -----------------------------------------------------
  const toggleDoc = async (docId: string) => {
    const updated = localDocs.map(d => ({ ...d, isSelected: d.id === docId ? !d.isSelected : false }));
    setLocalDocs(updated);
    setSwitching(true);
    try {
      await supabase.from('documents').update({ is_selected: false }).eq('user_id', user.id);
      if (updated.find(d => d.id === docId)?.isSelected) {
        await supabase.from('documents').update({ is_selected: true }).eq('id', docId);
      }
      setTimeout(() => setSliderOpen(false), 300);
    } catch (e) { console.error(e); }
    finally { setSwitching(false); }
  };

  // -- Generate ---------------------------------------------------------------
  const handleGenerate = async (userInput: string, handoff?: string) => {
    if (!userInput.trim() || isGenerating || !canQuery) return;
    const tool = activeTool || 'master_plan';
    setIsGenerating(true);
    setWorkflow(null);
    const aiId = crypto.randomUUID();
    setMessages(prev => [
      ...prev,
      { id: crypto.randomUUID(), role: 'user',      content: userInput, timestamp: new Date().toISOString() },
      { id: aiId,               role: 'assistant',  content: '',        timestamp: new Date().toISOString() },
    ]);
    try {
      onQuery();
      if (window.innerWidth < 768) setMobileTab('artifact');
      const prompt = buildPrompt(userInput, handoff);
      const stream = geminiService.generatePedagogicalToolStream(
        tool, prompt,
        { base64: activeDoc?.base64Data, mimeType: activeDoc?.mimeType, filePath: activeDoc?.filePath, id: activeDoc?.id },
        brain, user, curriculumOn ? activeDoc?.id : undefined
      );
      let full = '';
      // Consume async generator without for-await (SWC JSX compat)
      let iter = stream[Symbol.asyncIterator]();
      let next = await iter.next();
      while (!next.done) {
        const chunk = next.value;
        if (chunk) {
          full += chunk;
          const captured = full;
          setMessages(prev => prev.map(m => m.id === aiId ? { ...m, content: captured } : m));
          setCanvasContent(captured);
        }
        next = await iter.next();
      }
      await adaptiveService.captureGeneration(user.id, tool, full, { tool, document_id: activeDoc?.id, persona, isGlobalEnabled: globalOn });
    } catch (err: any) {
      setMessages(prev => prev.map(m => m.id === aiId ? { ...m, content: 'Synthesis Error: ' + err.message } : m));
    } finally { setIsGenerating(false); }
  };

  const handleWorkflow = () => {
    if (!workflow || isGenerating) return;
    const prev = canvasContent.split('--- Workflow Recommendation')[0].trim();
    setActiveTool(workflow.tool);
    handleGenerate('Based on the previous ' + getToolDisplayName(activeTool) + ', synthesize a ' + getToolDisplayName(workflow.tool) + '.', prev);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(cleanContent());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => window.print();

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setShareMsg('Link copied!');
    setTimeout(() => { setShareMsg(''); setShareMenu(false); }, 2000);
  };

  const handleEmail = () => {
    const subj = encodeURIComponent(getToolDisplayName(activeTool || 'master_plan') + ' - Pedagogy Master AI');
    const body = encodeURIComponent(
      'Created with Pedagogy Master AI\n\n' + cleanContent().substring(0, 1500) + '...\n\nhttps://pedagogy-master.vercel.app'
    );
    window.open('mailto:?subject=' + subj + '&body=' + body);
    setShareMenu(false);
  };

  const handleTwitter = () => {
    const t = encodeURIComponent('Created a ' + getToolDisplayName(activeTool || 'master_plan') + ' with AI in seconds! #EdTech\nhttps://pedagogy-master.vercel.app');
    window.open('https://twitter.com/intent/tweet?text=' + t, '_blank');
    setShareMenu(false);
  };

  const handleWhatsApp = () => {
    const t = encodeURIComponent('Check out Pedagogy Master AI - free AI curriculum tools for teachers:\nhttps://pedagogy-master.vercel.app');
    window.open('https://wa.me/?text=' + t, '_blank');
    setShareMenu(false);
  };

  // -- Tool picker screen -----------------------------------------------------
  if (!activeTool) {
    return (
      <div className="max-w-5xl mx-auto w-full pt-8 pb-20 px-4 md:px-6 animate-in fade-in duration-500 relative z-10 text-left">

        {/* Doc slider */}
        <div className={`fixed inset-y-0 right-0 w-80 bg-white dark:bg-[#0d0d0d] shadow-2xl z-[200] transform transition-transform duration-500 border-l border-slate-100 dark:border-white/5 ${sliderOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="p-8 flex flex-col h-full">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <Library size={20} className="text-indigo-600" />
                <h3 className="font-black text-xs uppercase tracking-widest text-slate-900 dark:text-white">Vault Selection</h3>
              </div>
              <button onClick={() => setSliderOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-all"><X size={20}/></button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 pr-2">
              {localDocs.map(doc => (
                <button key={doc.id} onClick={() => toggleDoc(doc.id)} className={`w-full text-left p-5 rounded-2xl border transition-all flex flex-col gap-1.5 ${doc.isSelected ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-slate-50 dark:bg-white/5 border-transparent text-slate-500 hover:border-slate-300'}`}>
                  <span className={`text-[9px] font-black uppercase tracking-widest ${doc.isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>Standard Node</span>
                  <p className={`font-bold text-sm truncate ${doc.isSelected ? 'text-white' : 'text-slate-900 dark:text-slate-100'}`}>{doc.name}</p>
                  <p className={`text-[10px] font-medium uppercase tracking-tight ${doc.isSelected ? 'text-indigo-100' : 'text-slate-400'}`}>{doc.authority} &middot; {doc.subject}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-12">
          <div className="flex items-center gap-6">
            <div className="p-4 bg-indigo-600 rounded-[2rem] text-white shadow-2xl shrink-0"><Zap size={32} /></div>
            <div>
              <h1 className="text-2xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">Synthesis Hub</h1>
              <div className="text-slate-500 font-medium text-xs md:text-lg mt-1 italic flex items-center gap-2">
                {curriculumOn && activeDoc
                  ? <><ShieldCheck size={14} className="text-emerald-500" /><span className="truncate">Brain v4.1 Linked: <span className="text-slate-900 dark:text-white font-bold">{activeDoc.name}</span></span></>
                  : <><Globe size={14} /><span>Autonomous Creative Intelligence Mode.</span></>
                }
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-[#111] p-2 rounded-[2.5rem] border border-slate-200 dark:border-white/5 shadow-2xl flex items-center gap-2 no-print">
            <button
              onClick={() => setCurriculumOn(v => !v)}
              className={`flex items-center gap-3 px-6 py-3 rounded-full transition-all border ${curriculumOn ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg' : 'bg-slate-50 dark:bg-white/5 border-transparent text-slate-400'}`}
            >
              <BookMarked size={16} />
              <div className="text-left">
                <p className="text-[8px] font-black uppercase leading-none mb-0.5 tracking-widest">Vault</p>
                <p className="text-[10px] font-bold">Curriculum</p>
              </div>
            </button>
            <button
              onClick={() => setSliderOpen(true)}
              className={`p-3 rounded-full transition-all ml-1 shadow-inner ${sliderOpen ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-600'}`}
            >
              <Library size={20} />
            </button>
          </div>
        </div>

        {/* Tool cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 no-print">
          {TOOL_DEFS.map(tool => (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              className="p-10 rounded-[3.5rem] border transition-all text-left flex flex-col gap-6 group bg-white dark:bg-[#111] border-slate-200 dark:border-white/5 hover:border-indigo-500 hover:shadow-2xl"
            >
              <div className={`w-14 h-14 ${tool.color} rounded-2xl flex items-center justify-center ${tool.iconColor} shadow-lg`}>
                <tool.icon size={28} />
              </div>
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

  // -- Active tool view -------------------------------------------------------
  const html = markdownToHtml(cleanContent());
  const dateStr = new Date().toDateString();

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] lg:h-[calc(100vh-64px)] bg-slate-50 dark:bg-[#080808] relative overflow-hidden print:h-auto print:overflow-visible">

      {/* Print zone - hidden on screen, visible only when printing */}
      <div id="pm-print-zone" className="hidden">
        <div className="pm-print-header" style={{ display: 'none', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', paddingBottom: '16px', borderBottom: '2px solid #4f46e5' }}>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 900, textTransform: 'uppercase', color: '#1e3a5f' }}>Pedagogy Master AI</div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>{getToolDisplayName(activeTool)} &bull; {activeDoc ? activeDoc.name : 'General Mode'} &bull; {dateStr}</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: '11px', color: '#94a3b8' }}>
            <div style={{ fontWeight: 700, color: '#475569' }}>{user.name}</div>
            <div>pedagogy-master.vercel.app</div>
            <div style={{ color: '#4f46e5', fontWeight: 700 }}>AI-Powered Curriculum Tool</div>
          </div>
        </div>
        <div dangerouslySetInnerHTML={{ __html: html }} />
        <div style={{ marginTop: '48px', paddingTop: '16px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8' }}>
          <span>Generated by Pedagogy Master AI</span>
          <span style={{ color: '#4f46e5', fontWeight: 700 }}>pedagogy-master.vercel.app</span>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden print:block print:overflow-visible">

        {/* Left panel - chat */}
        <div className={`flex flex-col border-r border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-[#0d0d0d] transition-all duration-300 no-print ${mobileTab === 'artifact' ? 'hidden md:flex' : 'flex'} w-full md:w-[380px] shrink-0`}>
          <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between bg-white dark:bg-[#0d0d0d]">
            <div className="flex items-center gap-3">
              <button onClick={() => { setActiveTool(null); setMessages([]); setCanvasContent(''); }} className="p-2 -ml-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl text-slate-500 transition-all">
                <ChevronLeft size={22}/>
              </button>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{getToolDisplayName(activeTool)}</span>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/5 p-1 rounded-xl">
              <button onClick={() => setPersona('architect')} title="Instructional Architect" className={`p-1.5 rounded-lg ${persona === 'architect' ? 'bg-white dark:bg-white/10 text-indigo-600 shadow-sm' : 'text-slate-400'}`}><PenTool size={14}/></button>
              <button onClick={() => setPersona('creative')}  title="Creative Designer"       className={`p-1.5 rounded-lg ${persona === 'creative'  ? 'bg-white dark:bg-white/10 text-rose-600 shadow-sm'   : 'text-slate-400'}`}><Compass size={14}/></button>
              <button onClick={() => setPersona('auditor')}   title="Curriculum Auditor"      className={`p-1.5 rounded-lg ${persona === 'auditor'   ? 'bg-white dark:bg-white/10 text-emerald-600 shadow-sm': 'text-slate-400'}`}><SearchCode size={14}/></button>
            </div>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar py-6 space-y-2">
            {messages.map(m => <MessageItem key={m.id} id={m.id} role={m.role} content={m.content} timestamp={m.timestamp} metadata={m.metadata} />)}
            {isGenerating && <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-indigo-500" /></div>}
          </div>
          <div className="p-6 border-t dark:border-white/5 bg-white dark:bg-[#0d0d0d]">
            <ChatInput onSend={handleGenerate} isLoading={isGenerating} placeholder={'Refine ' + getToolDisplayName(activeTool) + '...'} />
          </div>
        </div>

        {/* Right panel - artifact */}
        <div className={`flex-1 flex flex-col bg-white dark:bg-[#0a0a0a] transition-all duration-300 ${mobileTab === 'logs' ? 'hidden md:flex' : 'flex'} overflow-hidden print:block print:overflow-visible`}>

          {/* Toolbar */}
          <div className="px-8 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between shrink-0 bg-white dark:bg-[#0a0a0a] z-10 no-print">
            <div className="flex items-center gap-3">
              <FileEdit size={18} className="text-indigo-600" />
              <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white">Neural Artifact Node</span>
            </div>
            <div className="flex items-center gap-2">
              {workflow && !isGenerating && (
                <button onClick={handleWorkflow} className="px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest shadow-lg animate-in slide-in-from-right-2">
                  <ArrowRightCircle size={14}/> Next: {getToolDisplayName(workflow.tool)}
                </button>
              )}
              <button onClick={handleCopy} disabled={!canvasContent} className={`px-3 py-2 ${copied ? 'bg-emerald-50 text-emerald-600' : 'hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300'} rounded-xl transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest shrink-0 disabled:opacity-30`}>
                {copied ? <Check size={14}/> : <Copy size={14}/>}
                <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
              </button>
              <button onClick={handlePrint} disabled={!canvasContent} className="px-3 py-2 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 rounded-xl transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest shrink-0 disabled:opacity-30">
                <Download size={14}/>
                <span className="hidden sm:inline">PDF</span>
              </button>

              {/* Share */}
              <div className="relative">
                <button onClick={() => setShareMenu(v => !v)} disabled={!canvasContent} className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest shrink-0 disabled:opacity-30 shadow-lg">
                  <Share2 size={14}/>
                  <span className="hidden sm:inline">Share</span>
                </button>
                {shareMenu && (
                  <>
                    <div className="fixed inset-0 z-[300]" onClick={() => setShareMenu(false)} />
                    <div className="absolute right-0 top-12 z-[400] w-64 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-white/10 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="px-4 py-3 bg-indigo-600 text-white">
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Share This</p>
                        <p className="text-sm font-bold truncate">{getToolDisplayName(activeTool)}</p>
                      </div>
                      {shareMsg && (
                        <div className="px-4 py-2 bg-green-50 text-green-700 text-xs font-bold flex items-center gap-2">
                          <Check size={12}/> {shareMsg}
                        </div>
                      )}
                      <div className="p-2">
                        <button onClick={handleCopyLink} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-all text-left">
                          <div className="w-8 h-8 bg-slate-100 dark:bg-white/10 rounded-lg flex items-center justify-center shrink-0"><Link2 size={14} className="text-slate-600 dark:text-slate-300"/></div>
                          <div><p className="text-sm font-bold text-slate-800 dark:text-white">Copy App Link</p><p className="text-[10px] text-slate-400">Share Pedagogy Master</p></div>
                        </button>
                        <button onClick={handleWhatsApp} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-green-50 dark:hover:bg-white/5 transition-all text-left">
                          <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center shrink-0"><span className="text-sm"></span></div>
                          <div><p className="text-sm font-bold text-slate-800 dark:text-white">WhatsApp</p><p className="text-[10px] text-slate-400">Share with teacher groups</p></div>
                        </button>
                        <button onClick={handleTwitter} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-all text-left">
                          <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center shrink-0"><span className="text-white font-black text-xs">X</span></div>
                          <div><p className="text-sm font-bold text-slate-800 dark:text-white">Post on X / Twitter</p><p className="text-[10px] text-slate-400">Spread the word #EdTech</p></div>
                        </button>
                        <button onClick={handleEmail} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-blue-50 dark:hover:bg-white/5 transition-all text-left">
                          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center shrink-0"><Mail size={14} className="text-blue-600"/></div>
                          <div><p className="text-sm font-bold text-slate-800 dark:text-white">Email to Colleague</p><p className="text-[10px] text-slate-400">Send full content + link</p></div>
                        </button>
                        <button onClick={() => { handlePrint(); setShareMenu(false); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-orange-50 dark:hover:bg-white/5 transition-all text-left">
                          <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center shrink-0"><Printer size={14} className="text-orange-600"/></div>
                          <div><p className="text-sm font-bold text-slate-800 dark:text-white">Print / Save PDF</p><p className="text-[10px] text-slate-400">Professional A4 layout</p></div>
                        </button>
                      </div>
                      <div className="px-4 py-3 bg-slate-50 dark:bg-white/5 border-t border-slate-100 dark:border-white/5">
                        <p className="text-[9px] text-slate-400 text-center font-medium">Pedagogy Master AI - Free for every educator</p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Mobile tabs */}
          <div className="flex md:hidden border-b border-slate-100 dark:border-white/5 no-print">
            <button onClick={() => setMobileTab('logs')}     className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest ${mobileTab === 'logs'     ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400'}`}>Chat Logs</button>
            <button onClick={() => setMobileTab('artifact')} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest ${mobileTab === 'artifact' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400'}`}>Artifact</button>
          </div>

          {/* Canvas */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-12 lg:p-20 bg-slate-50/20 dark:bg-[#0a0a0a] print:p-0">
            <div className="max-w-4xl mx-auto bg-white dark:bg-[#111] p-6 md:p-16 lg:p-20 rounded-[3rem] shadow-2xl border border-slate-100 dark:border-white/5 min-h-full print:shadow-none print:border-none print:rounded-none print:p-0">
              {canvasContent ? (
                <div
                  className="prose dark:prose-invert max-w-full text-sm md:text-base leading-relaxed animate-in fade-in duration-500"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
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
    </div>
    </div>
  );
};

export default Tools;
