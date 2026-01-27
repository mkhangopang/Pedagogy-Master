'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, ClipboardCheck, BookOpen, Layers, ArrowLeft, Loader2, 
  Bot, FileText, Copy, ArrowRight,
  MessageSquare, FileEdit, Zap, X,
  ShieldCheck, Library, Image as ImageIcon,
  Tags, ChevronLeft, Download, Timer, Target, Globe
} from 'lucide-react';
import { geminiService } from '../services/geminiService';
import { adaptiveService } from '../services/adaptiveService';
import { NeuralBrain, Document, UserProfile } from '../types';
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
  const [mobileActiveTab, setMobileActiveTab] = useState<'logs' | 'artifact'>('logs');
  
  const [isSliderOpen, setIsSliderOpen] = useState(false);
  const [localDocs, setLocalDocs] = useState<Document[]>(documents);
  const [isSwitchingContext, setIsSwitchingContext] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeDoc = localDocs.find(d => d.isSelected);

  const isDev = user.role?.toLowerCase() === 'app_admin';
  const isPro = user.plan?.toLowerCase() === 'pro' || user.plan?.toLowerCase() === 'enterprise' || isDev;

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
    setCanvasImage(null);
    const aiMsgId = crypto.randomUUID();
    
    setMessages(prev => [...prev, 
      { id: crypto.randomUUID(), role: 'user', content: userInput, timestamp: new Date().toISOString() },
      { id: aiMsgId, role: 'assistant', content: '', timestamp: new Date().toISOString() }
    ]);

    try {
      onQuery();
      if (window.innerWidth < 768) setMobileActiveTab('artifact');

      // Detect if it's a visual task which returns non-streaming JSON
      if (effectiveTool === 'visual-aid') {
        const result = await geminiService.generateVisualAid(userInput, effectiveTool, brain, user, activeDoc?.id);
        setCanvasContent(result.content);
        setCanvasImage(result.imageUrl);
        setMessages(prev => prev.map(m => m.id === aiMsgId ? { 
          ...m, 
          content: result.content, 
          metadata: { imageUrl: result.imageUrl } 
        } : m));
      } else {
        const stream = geminiService.generatePedagogicalToolStream(effectiveTool, userInput, { base64: activeDoc?.base64Data, mimeType: activeDoc?.mimeType, filePath: activeDoc?.filePath, id: activeDoc?.id }, brain, user, activeDoc?.id );
        let fullContent = '';
        for await (const chunk of stream) {
          if (chunk) {
            fullContent += chunk;
            setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: fullContent } : m));
            setCanvasContent(fullContent); 
          }
        }
        await adaptiveService.captureGeneration(user.id, effectiveTool, fullContent, { tool: effectiveTool, document_id: activeDoc?.id });
      }
    } catch (err: any) {
      setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: `Synthesis Error: ${err.message}` } : m));
    } finally { setIsGenerating(false); }
  };

  const renderArtifact = () => {
    const mainContent = canvasContent.split('--- Synthesis Node:')[0].trim();
    return (
      <div className="artifact-canvas-container">
        {canvasImage && (
          <div className="mb-8 rounded-[2rem] overflow-hidden border border-slate-200 dark:border-white/10 shadow-xl group">
             <img src={canvasImage} alt="Synthesized Visual" className="w-full h-auto object-cover group-hover:scale-[1.02] transition-transform duration-700" />
             <div className="p-4 bg-slate-50 dark:bg-white/5 border-t dark:border-white/5 flex justify-between items-center">
                <span className="text-[10px] font-black uppercase text-indigo-600 tracking-widest flex items-center gap-2"><ImageIcon size={14}/> Neural Visual Node</span>
                <a href={canvasImage} download={`visual_${Date.now()}.png`} className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"><Download size={14}/></a>
             </div>
          </div>
        )}
        <div className="prose dark:prose-invert max-w-full text-sm md:text-base leading-relaxed md:leading-[1.8] animate-in fade-in duration-500 break-words" 
             dangerouslySetInnerHTML={{ __html: marked.parse(mainContent) }} />
      </div>
    );
  };

  const toolDefinitions = [
    { id: 'lesson-plan', name: 'Lesson Plan', icon: BookOpen, desc: '5E Instructional Flow', color: 'bg-indigo-600' },
    { id: 'assessment', name: 'Assessment', icon: ClipboardCheck, desc: 'Standards-aligned MCQ/CRQ', color: 'bg-emerald-600' },
    { id: 'rubric', name: 'Rubric', icon: Layers, desc: 'Bloom-scaled Criteria', color: 'bg-amber-600' },
    { id: 'visual-aid', name: 'Visual Hub', icon: Globe, desc: 'Neural Image Synthesis', color: 'bg-rose-600' },
    { id: 'slo-tagger', name: 'SLO Tagger', icon: Tags, desc: 'Bloom-scaled Metadata Extraction', color: 'bg-cyan-600' },
  ];

  if (!activeTool) {
    return (
      <div className="max-w-5xl mx-auto w-full pt-8 pb-20 px-4 md:px-6 animate-in fade-in duration-500 relative z-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div className="flex items-center gap-4 md:gap-6 text-left">
            <div className="p-3 md:p-4 bg-indigo-600 rounded-2xl md:rounded-[2rem] text-white shadow-2xl shrink-0"><Zap size={24} className="md:size-8" /></div>
            <div className="min-w-0">
              <h1 className="text-2xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tighter uppercase truncate">Synthesis Hub</h1>
              <div className="text-slate-500 font-medium text-xs md:text-lg mt-1 italic flex items-center gap-2 overflow-hidden">
                {activeDoc ? <><ShieldCheck size={14} className="text-emerald-500 shrink-0" /><span className="truncate">Anchored to: <span className="text-slate-900 dark:text-white font-bold">{activeDoc.name}</span></span></> : <><FileText size={14} className="shrink-0" /><span className="truncate">Ready for general pedagogical synthesis.</span></>}
              </div>
            </div>
          </div>
          
          <div className="hidden lg:flex items-center gap-4 px-6 py-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-800/30 rounded-3xl shadow-sm">
             <div className="p-2 bg-emerald-500 text-white rounded-xl"><Timer size={18} /></div>
             <div>
                <p className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 tracking-widest">Speed Metric</p>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">&lt; 30s Generation</p>
             </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {toolDefinitions.map((tool) => (
            <button key={tool.id} onClick={() => setActiveTool(tool.id)} className={`p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] border transition-all text-left flex flex-col gap-4 md:gap-6 group bg-white dark:bg-[#111] border-slate-200 dark:border-white/5 hover:border-indigo-500`}>
              <div className={`w-12 h-12 md:w-14 md:h-14 ${tool.color} rounded-xl md:rounded-2xl flex items-center justify-center text-white shadow-lg`}><tool.icon size={24} /></div>
              <div><h3 className="font-bold text-lg md:text-xl text-slate-900 dark:text-white uppercase tracking-tight">{tool.name}</h3><p className="text-slate-500 dark:text-slate-400 text-xs md:text-sm mt-1 font-medium leading-relaxed">{tool.desc}</p></div>
              <div className="flex items-center justify-between mt-auto">
                 <span className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-500 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Zap size={10} /> Instant Start
                 </span>
                 <ArrowRight size={20} className="text-indigo-600 transition-transform group-hover:translate-x-1" />
              </div>
            </button>
          ))}
        </div>

        <div className="mt-16 p-8 bg-slate-900 rounded-[2.5rem] md:rounded-[3rem] text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl relative overflow-hidden">
           <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500 opacity-10 rounded-full blur-[80px]" />
           <div className="flex items-center gap-6 relative z-10">
              <div className="p-4 bg-white/10 rounded-2xl"><Target size={32} className="text-indigo-400" /></div>
              <div className="text-left">
                 <h4 className="text-lg font-black uppercase tracking-tight">Aligned Accuracy</h4>
                 <p className="text-sm text-slate-400 font-medium italic">Validated against {documents.length} curriculum nodes.</p>
              </div>
           </div>
           <button onClick={() => setIsSliderOpen(true)} className="px-8 py-4 bg-white text-indigo-950 rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-105 transition-all active:scale-95 relative z-10">
              Switch Context
           </button>
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
               <button onClick={() => {setActiveTool(null); setMessages([]); setCanvasContent(''); setCanvasImage(null);}} className="p-2 -ml-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl text-slate-500 transition-all"><ChevronLeft size={22}/></button>
               <div className="flex items-center gap-2"><MessageSquare size={14} className="text-slate-400" /><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Logs</span></div>
             </div>
             <button onClick={() => setIsSliderOpen(true)} className="p-2 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg"><Library size={18} /></button>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar py-6 space-y-2">
            {messages.map((m) => (<MessageItem key={m.id} id={m.id} role={m.role} content={m.content} timestamp={m.timestamp} metadata={m.metadata} />))}
            {isGenerating && <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-indigo-500" /></div>}
          </div>
          <div className="p-6 border-t dark:border-white/5 bg-white dark:bg-[#0d0d0d]">
            <ChatInput onSend={handleGenerate} isLoading={isGenerating} placeholder={`Prompt the ${activeTool?.replace('-', ' ')} node...`} />
          </div>
        </div>

        <div className={`flex-1 flex flex-col bg-white dark:bg-[#0a0a0a] transition-all duration-300 ${mobileActiveTab === 'logs' ? 'hidden md:flex' : 'flex'} overflow-hidden`}>
           <div className="px-8 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3"><FileEdit size={18} className="text-indigo-600" /><span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white">Active Artifact</span></div>
              <div className="flex items-center gap-2">
                <button onClick={() => {
                  const cleanText = canvasContent.split('--- Synthesis by Node:')[0].trim();
                  navigator.clipboard.writeText(cleanText);
                }} className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg text-slate-400 transition-all"><Copy size={16}/></button>
              </div>
           </div>
           
           <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-12 lg:p-20 bg-slate-50/20 dark:bg-[#0a0a0a]">
              <div className="max-w-4xl mx-auto bg-white dark:bg-[#111] p-6 md:p-16 rounded-[2rem] md:rounded-[2.5rem] shadow-xl border border-slate-100 dark:border-white/5 min-h-full overflow-x-hidden">
                {canvasContent ? (
                  renderArtifact()
                ) : (
                  <div className="flex flex-col items-center justify-center h-full py-40 text-center opacity-30">
                    <FileText size={48} className="mb-6 text-slate-300" /><h2 className="text-lg font-bold text-slate-300 uppercase tracking-widest">Awaiting Synthesis</h2>
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