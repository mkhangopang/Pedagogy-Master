import React, { useState, useRef, useEffect } from 'react';
import { Bot, Sparkles, AlertCircle, Layout, ChevronRight, ChevronLeft, X, ShieldCheck, Database } from 'lucide-react';
import { ChatMessage, Document, NeuralBrain, UserProfile } from '../types';
import { geminiService } from '../services/geminiService';
import { adaptiveService } from '../services/adaptiveService';
import { MessageItem } from '../components/chat/MessageItem';
import { ChatInput } from '../components/chat/ChatInput';
import { SuggestedPrompts } from '../components/chat/SuggestedPrompts';
import { PedagogyToolbar } from '../components/pedagogy/PedagogyToolbar';
import { ValidationPanel } from '../components/pedagogy/ValidationPanel';
import { DifferentiationPanel } from '../components/pedagogy/DifferentiationPanel';
import { AssessmentGenerator } from '../components/pedagogy/AssessmentGenerator';
import { validateLessonStructure, LessonValidation } from '../lib/pedagogy/pedagogy-engine';
import { buildDifferentiationPrompt, parseDifferentiatedResponse, DifferentiatedLesson } from '../lib/pedagogy/differentiation';
import { buildAssessmentPrompt, AssessmentOptions, Assessment } from '../lib/pedagogy/assessment-generator';
import { DocumentSelector } from '../components/chat/DocumentSelector';
import { supabase } from '../lib/supabase';

interface ChatProps {
  brain: NeuralBrain;
  documents: Document[];
  onQuery: () => void;
  canQuery: boolean;
  user: UserProfile;
}

const Chat: React.FC<ChatProps> = ({ brain, documents, onQuery, canQuery, user }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [localDocs, setLocalDocs] = useState<Document[]>(documents);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [currentValidation, setCurrentValidation] = useState<LessonValidation | null>(null);
  const [focusedDocId, setFocusedDocId] = useState<string | null>(null); 
  
  const [diffResults, setDiffResults] = useState<Record<string, DifferentiatedLesson | null>>({ below: null, at: null, above: null });
  const [diffLoading, setDiffLoading] = useState(false);
  const [assessmentResult, setAssessmentResult] = useState<Assessment | null>(null);
  const [assessmentLoading, setAssessmentLoading] = useState(false);

  const [showSidebar, setShowSidebar] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectedDocsCount = localDocs.filter(d => d.isSelected).length;

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
      setShowSidebar(true);
    }
  }, []);

  useEffect(() => {
    setLocalDocs(documents);
    const selected = documents.find(d => d.isSelected);
    if (selected) setFocusedDocId(selected.id);
  }, [documents]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isLoading, currentValidation]);

  const toggleDocContext = async (docId: string) => {
    // EXCLUSIVE SELECTION MODE: Only one document allowed for maximum RAG precision
    const updated = localDocs.map(d => ({ 
      ...d, 
      isSelected: d.id === docId ? !d.isSelected : false 
    }));
    setLocalDocs(updated);
    
    const targetDoc = updated.find(d => d.id === docId);
    const newFocusId = targetDoc?.isSelected ? docId : null;
    setFocusedDocId(newFocusId);

    // Atomic persistence update
    try {
      await supabase.from('documents').update({ is_selected: false }).eq('user_id', user.id);
      if (newFocusId) {
        await supabase.from('documents').update({ is_selected: true }).eq('id', docId);
      }
    } catch (e) {
      console.error("Context sync error:", e);
    }
  };

  const handleToolSelect = (tool: string) => {
    if (activeTool === tool) {
      setActiveTool(null);
      return;
    }
    setActiveTool(tool);
    
    if (tool === 'validate') {
      const lastAiMsg = [...messages].reverse().find(m => m.role === 'assistant');
      if (lastAiMsg?.content) {
        setCurrentValidation(validateLessonStructure(lastAiMsg.content));
      }
    }
  };

  const handleDifferentiate = async (level: 'below' | 'at' | 'above') => {
    const lastAiMsg = [...messages].reverse().find(m => m.role === 'assistant');
    if (!lastAiMsg) return;

    setDiffLoading(true);
    try {
      const prompt = buildDifferentiationPrompt(lastAiMsg.content, level);
      let fullResponse = "";
      const stream = geminiService.chatWithDocumentStream(prompt, {}, [], brain, user, focusedDocId || undefined);
      for await (const chunk of stream) {
        fullResponse += chunk;
      }
      const parsed = parseDifferentiatedResponse(fullResponse, level);
      setDiffResults(prev => ({ ...prev, [level]: parsed }));
    } catch (e) {
      console.error("Diff failed", e);
    } finally {
      setDiffLoading(false);
    }
  };

  const handleAssessment = async (options: AssessmentOptions) => {
    const lastAiMsg = [...messages].reverse().find(m => m.role === 'assistant');
    if (!lastAiMsg) return;

    setAssessmentLoading(true);
    try {
      const prompt = buildAssessmentPrompt(lastAiMsg.content, options);
      let fullResponse = "";
      const stream = geminiService.chatWithDocumentStream(prompt, {}, [], brain, user, focusedDocId || undefined);
      for await (const chunk of stream) {
        fullResponse += chunk;
      }
      const cleaned = fullResponse.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      setAssessmentResult(parsed);
    } catch (e) {
      console.error("Assessment failed", e);
    } finally {
      setAssessmentLoading(false);
    }
  };

  const handleSend = async (msgContent: string) => {
    if (!msgContent.trim() || isLoading || !canQuery) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: msgContent,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setCurrentValidation(null);
    setDiffResults({ below: null, at: null, above: null });
    setAssessmentResult(null);

    const aiMessageId = crypto.randomUUID();
    setMessages(prev => [...prev, {
      id: aiMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString()
    }]);

    try {
      onQuery();
      let fullContent = '';
      
      const history = messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ 
          role: m.role as 'user' | 'assistant', 
          content: m.content 
        }));

      const stream = geminiService.chatWithDocumentStream(
        msgContent,
        {},
        history,
        brain,
        user,
        focusedDocId || undefined
      );

      for await (const chunk of stream) {
        if (chunk) {
          fullContent += chunk;
          setMessages(prev => prev.map(m => m.id === aiMessageId ? { ...m, content: fullContent } : m));
        }
      }
      
      if (activeTool === 'validate') {
        setCurrentValidation(validateLessonStructure(fullContent));
      }
      await adaptiveService.captureGeneration(user.id, 'chat', fullContent, { query: msgContent });
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === aiMessageId ? { ...m, content: "Synthesis gate timed out. The neural grid is currently under high load." } : m));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-100px)] lg:h-[calc(100vh-40px)] bg-slate-50 dark:bg-[#0a0a0a] relative overflow-hidden">
      {showSidebar && (
        <div 
          className="fixed inset-0 z-[40] bg-black/20 backdrop-blur-sm md:hidden" 
          onClick={() => setShowSidebar(false)}
        />
      )}

      <div className={`
        fixed md:relative inset-y-0 left-0 z-[50] md:z-10
        transition-all duration-300 border-r border-slate-200 dark:border-white/5 
        bg-white dark:bg-[#0d0d0d] md:bg-white/40 md:dark:bg-white/5 md:backdrop-blur-md
        ${showSidebar ? 'w-72 md:w-64 translate-x-0 opacity-100' : '-translate-x-full md:translate-x-0 md:w-0 md:opacity-0 overflow-hidden'}
      `}>
        <div className="p-4 space-y-6">
          <div className="flex items-center justify-between">
             <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Curriculum Assets</h3>
             <div className="flex items-center gap-2">
               <Sparkles size={14} className="text-indigo-400" />
               <button onClick={() => setShowSidebar(false)} className="md:hidden p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg">
                 <X size={16} />
               </button>
             </div>
          </div>
          <DocumentSelector documents={localDocs} onToggle={toggleDocContext} />
          
          <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl">
            <p className="text-[10px] text-indigo-400 font-bold leading-relaxed">
              <b>PRO TIP:</b> Grounding is locked to one document for maximum SLO precision. Switch assets to change context.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 relative">
        <button 
          onClick={() => setShowSidebar(!showSidebar)}
          className={`
            absolute left-0 top-1/2 -translate-y-1/2 z-30 
            p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 
            rounded-r-xl shadow-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all
            ${showSidebar ? 'opacity-0 md:opacity-100' : 'opacity-100'}
          `}
        >
          {showSidebar ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>

        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 dark:border-white/5 shrink-0 bg-white/80 dark:bg-[#0a0a0a]/80 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Layout size={16} className="text-slate-400" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Synthesis Hub</span>
            </div>
            {selectedDocsCount > 0 && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                <ShieldCheck size={12} className="text-emerald-500" />
                <span className="text-[9px] font-black uppercase tracking-wider text-emerald-600">Strict Grounding Active</span>
              </div>
            )}
          </div>
          <PedagogyToolbar onToolSelect={handleToolSelect} activeTool={activeTool} />
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar px-4 pt-10 pb-4">
          <div className="max-w-3xl mx-auto">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-8 animate-in fade-in duration-700">
                <div className="relative">
                  <div className="w-20 h-20 bg-indigo-600 text-white rounded-[24px] flex items-center justify-center shadow-2xl relative z-10">
                    <Bot size={40} />
                  </div>
                  <div className="absolute inset-0 bg-indigo-600 rounded-[24px] blur-2xl opacity-20 -z-10 animate-pulse" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight text-center">Pedagogy Master Neural</h2>
                  <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto text-sm font-medium">
                    {focusedDocId 
                      ? `Neural sync active for your curriculum. Ask for a lesson plan or quiz on a specific SLO.`
                      : 'Select a curriculum asset from the sidebar to enable precision standards-aligned synthesis.'}
                  </p>
                </div>
                <SuggestedPrompts onSelect={handleSend} />
              </div>
            ) : (
              <div className="space-y-2 pb-20">
                {messages
                  .filter(m => m.role !== 'system')
                  .map((m, idx) => (
                  <MessageItem 
                    key={m.id} 
                    id={m.id} 
                    role={m.role as 'user' | 'assistant'} 
                    content={m.content} 
                    timestamp={m.timestamp} 
                    isLatest={idx === messages.length - 1} 
                  />
                ))}
                
                {activeTool === 'validate' && currentValidation && (
                  <div className="max-w-3xl mx-auto mt-6 px-4 md:px-12 animate-in slide-in-from-bottom-4">
                     <ValidationPanel validation={currentValidation} />
                  </div>
                )}

                {activeTool === 'differentiate' && (
                  <div className="max-w-3xl mx-auto mt-6 px-4 md:px-12 animate-in slide-in-from-bottom-4">
                     <DifferentiationPanel onGenerate={handleDifferentiate} isLoading={diffLoading} results={diffResults} />
                  </div>
                )}

                {activeTool === 'assessment' && (
                  <div className="max-w-3xl mx-auto mt-6 px-4 md:px-12 animate-in slide-in-from-bottom-4">
                     <AssessmentGenerator onGenerate={handleAssessment} isLoading={assessmentLoading} result={assessmentResult} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 bg-gradient-to-t from-slate-50 dark:from-[#0a0a0a] via-slate-50 dark:via-[#0a0a0a] to-transparent">
          {!canQuery && (
            <div className="max-w-2xl mx-auto mb-2 px-4 py-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/50 rounded-2xl flex items-center gap-3 text-rose-800 dark:text-rose-400 text-xs font-bold animate-in slide-in-from-bottom-2">
              <AlertCircle size={16} />
              Neural limit reached. Upgrade for unlimited synthesis.
            </div>
          )}
          <ChatInput onSend={handleSend} isLoading={isLoading} disabled={!canQuery} />
        </div>
      </div>
    </div>
  );
};

export default Chat;
