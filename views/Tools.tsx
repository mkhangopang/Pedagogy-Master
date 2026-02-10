'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, ClipboardCheck, BookOpen, Layers, Loader2, 
  FileText, Copy, ArrowRight, Printer, Share2, 
  MessageSquare, FileEdit, Zap, GraduationCap,
  ShieldCheck, Library,
  ChevronLeft, Crown, Mail, Check, X,
  PenTool, Compass, SearchCode, BookMarked, Globe2, Globe,
  Play, Rocket
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
  const [shareSuccess, setShareSuccess] = useState(false);
  
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
      setTimeout(() => setIsSliderOpen(false), 300);
    } catch (e) { 
      console.error(e); 
    } finally { 
      setIsSwitchingContext(false); 
    }
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

  const handleTransitionToPlan = () => {
    if (activeTool !== 'audit_tagger' || !canvasContent || isGenerating) return;

    const sloMatch = canvasContent.match(/[B-Z]-\d{2}-[A-Z]-\d{2,4}|[A-Z]\d{1,2}[a-z]\d{1,2}/gi);
    const detectedSLOs = sloMatch ? Array.from(new Set(sloMatch.map(s => s.toUpperCase()))) : [];

    const workflowPrompt = detectedSLOs.length > 0 
      ? `Based on my recent audit of these standards (${detectedSLOs.join(', ')}), synthesize a comprehensive 5E Master Plan that ensures vertical alignment and rigorous assessment.`
      : `Based on the pedagogical audit I just performed, develop a high-fidelity Master Plan for this unit.`;

    setActiveTool('master_plan');
    handleGenerate(workflowPrompt);
  };

  const handleRichCopy = async () => {
    if (!canvasContent) return;
    const cleanText = canvasContent.split('--- Synthesis Hub:')[0].trim();
    const renderedHtml = renderSTEM(cleanText);
    
    const styledHtml = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 800px; margin: 0 auto; padding: 20px;">
        ${renderedHtml}
      </div>
    `;

    try {
      const cleanPlainText = cleanText
        .replace(/\*\*/g, '')
        .replace(/###/g, '')
        .replace(/##/g, '')
        .replace(/#/g, '')
        .trim();

      const textBlob = new Blob([cleanPlainText], { type: 'text/plain' });
      const htmlBlob = new Blob([styledHtml], { type: 'text/html' });
      const clipboardItem = new ClipboardItem({ 'text/plain': textBlob, 'text/html': htmlBlob });
      await navigator.clipboard.write([clipboardItem]);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      await navigator.clipboard.writeText(cleanText);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const shareSnapshot = async () => {
    if (!canvasContent) return;
    
    const appBaseUrl = window.location.origin;
    const toolName = getToolDisplayName(activeTool || 'master_plan');
    
    // Resolve "Identifying..." placeholder for a professional share card
    const subjectLabel = (activeDoc?.subject && activeDoc.subject !== 'Identifying...') 
      ? activeDoc.subject 
      : (activeDoc?.name || 'Instructional Design');

    const summary = `🚀 **PEDAGOGY MASTER AI: SYNTHESIS COMPLETE**\n\n💎 **High-Fidelity Artifact Ready**\n🎯 **Tool:** ${toolName}\n🏛️ **Institution:** ${user.workspaceName || 'Independent Grid'}\n📖 **Context:** ${subjectLabel}\n✅ **Neural Status:** Standards Alignment Verified\n\n⚡ Join the elite pedagogical grid: ${appBaseUrl}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Pedagogy Master AI | ${toolName}`,
          text: summary,
          url: appBaseUrl
        });
        setShareSuccess(true);
        setTimeout(() => setShareSuccess(false), 2000);
      } catch (e) {
        await navigator.clipboard.writeText(summary);
        setShareSuccess(true);
        setTimeout(() => setShareSuccess(false), 2000);
      }
    } else {
      await navigator.clipboard.writeText(summary);
      setShareSuccess(true);
      setTimeout(() => setShareSuccess(false), 2000);
    }
  };

  const handleGDriveExport = () => {
    if (!isPro) { alert("Pro License Required for Google Drive Integration."); return; }
    const cleanText = canvasContent.split('--- Synthesis Hub:')[0].trim();
    if (!cleanText) return;
    const docTitle = `${getToolDisplayName(activeTool || 'master_plan')}_${new Date().toISOString().slice(0,10)}`;
    const htmlWrapper = `<html><head><meta charset="utf-8"><title>${docTitle}</title><style>body { font-family: 'Calibri', 'Arial', sans-serif; padding: 1in; color: #1a1a1a; } h1 { color: #1e1b4b; border-bottom: 2px solid #4f46e5; padding-bottom: 10px; } h2, h3 { color: #312e81; margin-top: 20px; } table { border-collapse: collapse; width: 100%; margin: 1.5em 0; } th, td { border: 1px solid #e2e8f0; padding: 12px; text-align: left; } th { background-color: #f8fafc; font-weight: bold; }</style></head><body><div style="text-align: right; font-size: 10px; color: #94a3b8; margin-bottom: 20px;">Synthesized via Pedagogy Master AI Institutional Hub</div>${renderSTEM(cleanText)}</body></html>`;
    const blob = new Blob([htmlWrapper], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${docTitle}.html`;
    a.click();
  };

  const handlePrint = () => {
    if (!canvasContent) return;
    window.print();
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
        <div className={`fixed inset-y-0 right-0 w-80 bg-white dark:bg-[#0d0d0d] shadow-2xl z-[200] transform transition-transform duration-500 border-l border-slate-100 dark:border-white/5 ${isSliderOpen ? 'translate-x-0' : 'translate-x-full'}`}>
           <div className="p-8 flex flex-col h-full">
              <div className="flex items-center justify-between mb-8">
                 <div className="flex items-center gap-3">
                    <Library size={20} className="text-indigo-600" />
                    <h3 className="font-black text-xs uppercase tracking-widest text-slate-900 dark:text-white">Curriculum Vault</h3>
                 </div>
                 <button onClick={() => setIsSliderOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-all"><X size={20}/></button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2">
                 {localDocs.length > 0 ? localDocs.map(doc => (
                   <button 
                    key={doc.id} 
                    onClick={() => toggleDocContext(doc.id)}
                    className={`w-full text-left p-5 rounded-2xl border transition-all flex flex-col gap-1.5 group relative overflow-hidden ${doc.isSelected ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-slate-50 dark:bg-white/5 border-transparent text-slate-500 hover:border-slate-300'}`}
                   >
                     <div className="flex items-center justify-between">
                       <span className={`text-[9px] font-black uppercase tracking-widest ${doc.isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>Node ID: {doc.id.slice(0,8)}</span>
                       {doc.isSelected && <Check size={12} className="text-white" />}
                     </div>
                     <p className={`font-bold text-sm truncate ${doc.isSelected ? 'text-white' : 'text-slate-900 dark:text-slate-100'}`}>{doc.name}</p>
                     <p className={`text-[10px] font-medium uppercase tracking-tight ${doc.isSelected ? 'text-indigo-100' : 'text-slate-400'}`}>{doc.authority} • {doc.subject}</p>
                   </button>
                 )) : (
                   <div className="py-20 text-center opacity-40">
                      <FileText size={32} className="mx-auto mb-4" />
                      <p className="text-[10px] font-black uppercase tracking-widest">No assets linked.</p>
                   </div>
                 )}
              </div>
              <div className="pt-6 border-t dark:border-white/5 mt-auto">
                 <p className="text-[9px] text-slate-400 font-bold uppercase leading-relaxed">Select a curriculum node to focus synthesis on specific standards.</p>
              </div>
           </div>
        </div>
        {isSliderOpen && <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[190]" onClick={() => setIsSliderOpen(false)} />}

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
          
          <div className="bg-white dark:bg-[#111] p-2 rounded-[2.5rem] border border-slate-200 dark:border-white/5 shadow-2xl flex flex-col sm:flex-row items-center gap-2 no-print">
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
              className={`p-3 rounded-full transition-all ml-1 shadow-inner ${isSliderOpen ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-600'}`}
            >
              <Library size={20} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4 md:gap-8 no-print">
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
    <div className="flex flex-col h-[calc(100vh-120px)] lg:h-[calc(100vh-64px)] bg-slate-50 dark:bg-[#080808] relative overflow-hidden print:h-auto print:overflow-visible">
      <div className="md:hidden flex p-1 bg-white dark:bg-slate-900 border-b dark:border-white/5 no-print">
        <button onClick={() => setMobileActiveTab('logs')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mobileActiveTab === 'logs' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400'}`}>
          <MessageSquare size={14} /> Logs
        </button>
        <button onClick={() => setMobileActiveTab('artifact')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mobileActiveTab === 'artifact' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400'}`}>
          <FileEdit size={14} /> Canvas
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden print:block print:overflow-visible">
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

        <div className={`flex-1 flex flex-col bg-white dark:bg-[#0a0a0a] transition-all duration-300 ${mobileActiveTab === 'logs' ? 'hidden md:flex' : 'flex'} overflow-hidden print:block print:overflow-visible`}>
           <div className="px-8 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between shrink-0 bg-white dark:bg-[#0a0a0a] z-10 no-print">
              <div className="flex items-center gap-3">
                <FileEdit size={18} className="text-indigo-600" />
                <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white">Expert Artifact</span>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                {activeTool === 'audit_tagger' && canvasContent && !isGenerating && (
                  <button 
                    onClick={handleTransitionToPlan}
                    className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-600/20 shrink-0"
                  >
                    <Rocket size={14}/> Plan Analysis
                  </button>
                )}

                <button 
                  onClick={shareSnapshot}
                  className={`px-4 py-2 ${shareSuccess ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-600 hover:bg-purple-100'} rounded-xl transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest border border-purple-200 shrink-0`}
                >
                  {shareSuccess ? <Check size={14}/> : <Share2 size={14}/>} {shareSuccess ? 'Link Shared' : 'Share Artifact'}
                </button>

                <div className="w-px h-4 bg-slate-200 dark:bg-white/10 mx-1 shrink-0" />

                <button onClick={handlePrint} className="px-4 py-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl text-slate-600 dark:text-slate-300 transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest border dark:border-white/5 shrink-0">
                  <Printer size={14}/> Print
                </button>
                <button 
                  onClick={handleRichCopy} 
                  className={`px-4 py-2 ${copySuccess ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 border dark:border-white/5'} rounded-xl transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest shrink-0`}
                >
                  {copySuccess ? <Check size={14}/> : <Copy size={14}/>} {copySuccess ? 'Copied' : 'Rich Copy'}
                </button>
              </div>
           </div>
           
           <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-12 lg:p-20 bg-slate-50/20 dark:bg-[#0a0a0a] artifact-wrapper print:p-0 print:bg-white print:overflow-visible">
              <div className="max-w-4xl mx-auto bg-white dark:bg-[#111] p-6 md:p-16 lg:p-20 rounded-[3rem] shadow-2xl border border-slate-100 dark:border-white/5 min-h-full overflow-x-hidden print-container print:shadow-none print:border-none print:p-0">
                
                {/* PDF Header - Visible only in Print */}
                <div className="hidden print-header space-y-6">
                   <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-4">
                         <div className="p-3 bg-indigo-600 rounded-xl text-white"><GraduationCap size={40} /></div>
                         <div>
                            <h1 className="text-3xl font-black uppercase tracking-tight m-0 text-slate-900">{user.workspaceName || 'Pedagogy Master AI Node'}</h1>
                            <p className="text-[11px] font-bold text-indigo-600 uppercase tracking-[0.3em] m-0">Institutional Intelligence Grid</p>
                         </div>
                      </div>
                      <div className="text-right">
                         <p className="text-[10px] font-black text-slate-400 uppercase m-0">Synthesis Origin</p>
                         <p className="text-sm font-black uppercase text-slate-900 m-0">{user.name}</p>
                         <p className="text-[9px] font-medium text-slate-500 m-0">{new Date().toLocaleDateString()}</p>
                      </div>
                   </div>
                   <div className="grid grid-cols-2 gap-8 py-5 border-t border-b border-slate-100 w-full">
                      <div>
                         <p className="text-[9px] font-black text-slate-400 uppercase m-0">Curriculum Source</p>
                         <p className="text-base font-bold text-slate-900 m-0">{activeDoc?.authority || 'Verified Standard'}</p>
                      </div>
                      <div className="text-right">
                         <p className="text-[9px] font-black text-slate-400 uppercase m-0">Subject Focus / Grade</p>
                         <p className="text-base font-bold text-slate-900 m-0">{activeDoc?.subject || 'General Curricula'} / {activeDoc?.gradeLevel || 'Multi-Grade'}</p>
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

                {/* PDF Footer - Visible only in Print */}
                <div className="hidden print-footer">
                   <p className="m-0">© {new Date().getFullYear()} {user.workspaceName || 'Pedagogy Master AI'} Institutional Workspace</p>
                   <p className="m-0 font-bold uppercase tracking-widest">High-Fidelity Deterministic Synthesis • Neural Verified Alignment</p>
                </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default Tools;