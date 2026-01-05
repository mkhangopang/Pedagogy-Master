
import React, { useState, useEffect } from 'react';
import { 
  Sparkles, ClipboardCheck, BookOpen, Layers, ArrowLeft, ArrowRight, Loader2, 
  Copy, Check, Send, RefreshCw, FileDown, FileSpreadsheet, Maximize2, Bot
} from 'lucide-react';
import { geminiService } from '../services/geminiService';
import { adaptiveService } from '../services/adaptiveService';
import { NeuralBrain, Document, UserProfile } from '../types';

interface ToolsProps {
  brain: NeuralBrain;
  documents: Document[];
  onQuery: () => void;
  canQuery: boolean;
  user: UserProfile;
}

const Tools: React.FC<ToolsProps> = ({ brain, documents, onQuery, canQuery, user }) => {
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [userInput, setUserInput] = useState('');
  const [refinementInput, setRefinementInput] = useState('');
  const [result, setResult] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const selectedDoc = documents.find(d => d.id === selectedDocId);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const parseContent = (content: string) => {
    if (!content.includes('[SUGGESTIONS]')) return { text: content, suggestions: [] };
    const [text, suggestionStr] = content.split('[SUGGESTIONS]');
    const suggestions = suggestionStr
      .split('|')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    return { text: text.trim(), suggestions };
  };

  const toolDefinitions = [
    { id: 'lesson-plan', name: 'Lesson Plan', icon: BookOpen, desc: 'Structure standard-aligned instruction.', color: 'indigo' },
    { id: 'assessment', name: 'Assessment', icon: ClipboardCheck, desc: 'Create quizzes and tests.', color: 'emerald' },
    { id: 'rubric', name: 'Rubric', icon: Layers, desc: 'Design grading criteria.', color: 'amber' },
  ];

  const handleGenerate = async (isRefinement = false, suggestionText?: string) => {
    const finalRefinementText = suggestionText || refinementInput;
    if (!activeTool || (isRefinement ? !finalRefinementText : !userInput) || isGenerating || !canQuery || cooldown > 0) return;
    setIsGenerating(true);
    if (!isRefinement) setResult('');
    
    try {
      const { text: currentText } = parseContent(result);
      const finalInput = isRefinement ? `CONTEXT: ${currentText}\n\nUSER REQUEST: ${finalRefinementText}` : userInput;
      const stream = geminiService.generatePedagogicalToolStream(
        activeTool, 
        finalInput, 
        { base64: selectedDoc?.base64Data, mimeType: selectedDoc?.mimeType, filePath: selectedDoc?.filePath }, 
        brain,
        user
      );

      onQuery();
      let fullContent = isRefinement ? currentText + '\n\n---\n\n' : '';
      for await (const chunk of stream) {
        if (chunk) {
          fullContent += chunk;
          setResult(fullContent);
        }
      }

      await adaptiveService.captureGeneration(user.id, activeTool, fullContent, { tool: activeTool, docId: selectedDocId });
      setRefinementInput('');
      setCooldown(5);

    } catch (err) {
      setResult("Neural Cooldown: AI node busy.");
    } finally {
      setIsGenerating(false);
    }
  };

  const { text: cleanResult, suggestions } = parseContent(result);

  const exportToWord = () => {
    const header = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>Pedagogical Artifact</title><style>body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; padding: 2cm; } h1 { color: #1e3a8a; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; } table { border-collapse: collapse; width: 100%; margin: 20px 0; border: 1px solid #999; } th, td { border: 1px solid #999; padding: 12px; text-align: left; }</style></head><body>`;
    const footer = "</body></html>";
    let htmlContent = cleanResult.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');
    const blob = new Blob([header + `<div>${htmlContent}</div>` + footer], { type: 'application/vnd.ms-word' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${activeTool}-${Date.now()}.doc`;
    link.click();
  };

  const exportToExcel = () => {
    const blob = new Blob(["\ufeff" + cleanResult], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${activeTool}-${Date.now()}.csv`;
    link.click();
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000 pb-20 h-full flex flex-col max-w-[1800px] mx-auto">
      {!activeTool ? (
        <>
          <header className="px-4">
            <h1 className="text-4xl font-black text-slate-900 tracking-tight">Pedagogical Engines</h1>
            <p className="text-slate-500 font-medium text-lg mt-2">Select a framework to begin synthesizing structured educational artifacts.</p>
          </header>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 px-4">
            {toolDefinitions.map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.id}
                  onClick={() => setActiveTool(tool.id)}
                  className="group flex flex-col items-start p-12 bg-white border border-slate-200 rounded-[3rem] transition-all hover:border-indigo-500 hover:shadow-2xl hover:-translate-y-2 text-left"
                >
                  <div className={`p-6 rounded-[1.5rem] bg-slate-50 text-${tool.color}-600 mb-8 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-inner`}>
                    <Icon size={36} />
                  </div>
                  <h3 className="text-2xl font-black text-slate-900 mb-4 tracking-tight">{tool.name}</h3>
                  <p className="text-slate-500 font-medium leading-relaxed mb-8">{tool.desc}</p>
                  <div className="mt-auto flex items-center gap-3 text-indigo-600 text-[10px] font-black uppercase tracking-[0.2em]">
                    Initialize Engine <ArrowRight size={18} className="group-hover:translate-x-2 transition-transform" />
                  </div>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-8 h-full min-h-0 px-4">
          <header className="flex items-center justify-between">
            <button 
              onClick={() => { setActiveTool(null); setResult(''); setUserInput(''); }}
              className="group flex items-center gap-3 px-6 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold text-slate-600 hover:border-indigo-400 hover:text-indigo-600 transition-all shadow-sm"
            >
              <ArrowLeft size={18} className="group-hover:-translate-x-2 transition-transform" />
              Selector Hub
            </button>
            {cooldown > 0 && (
              <div className="flex items-center gap-3 px-5 py-2 bg-amber-50 text-amber-600 rounded-full text-xs font-bold border border-amber-100 animate-pulse">
                <RefreshCw size={14} className="animate-spin" />
                Neural Syncing: {cooldown}s
              </div>
            )}
          </header>

          <div className="flex-1 flex flex-col xl:flex-row gap-10 min-h-0">
            {/* Control Panel */}
            <div className="xl:w-96 flex-shrink-0 space-y-6">
              <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200 space-y-8 shadow-sm">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Module</label>
                  <div className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-800 capitalize shadow-inner">
                    {activeTool.replace('-', ' ')} Engine
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Knowledge Source</label>
                  <select 
                    value={selectedDocId || ''} 
                    onChange={(e) => setSelectedDocId(e.target.value || null)}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold focus:ring-4 focus:ring-indigo-500/10 outline-none cursor-pointer"
                  >
                    <option value="">Neural Global Brain</option>
                    {documents.map(doc => <option key={doc.id} value={doc.id}>{doc.name}</option>)}
                  </select>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Primary Directive</label>
                  <textarea 
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    placeholder="E.g., Grade 9 Biology lesson on Mitosis emphasizing active inquiry..."
                    className="w-full h-56 p-6 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 outline-none text-base font-medium resize-none leading-relaxed"
                  />
                </div>
                <button 
                  onClick={() => handleGenerate(false)}
                  disabled={isGenerating || !userInput.trim() || cooldown > 0}
                  className="w-full py-5 bg-indigo-600 text-white rounded-[1.5rem] font-bold flex items-center justify-center gap-3 hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-2xl shadow-indigo-600/20 active:scale-95"
                >
                  {isGenerating ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}
                  Begin Synthesis
                </button>
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-[3rem] overflow-hidden shadow-sm relative group">
              <div className="flex-1 overflow-y-auto p-12 md:p-20 lg:p-32 custom-scrollbar bg-white">
                <div className="max-w-7xl mx-auto">
                  <div className="text-slate-800 leading-[1.6] font-mono text-sm whitespace-pre-wrap bg-slate-50/50 p-10 rounded-[2rem] border border-slate-100 shadow-inner">
                    {cleanResult || (isGenerating ? (
                      <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-10 py-40">
                        <div className="relative">
                          <div className="w-24 h-24 border-8 border-indigo-50 border-t-indigo-600 rounded-full animate-spin"></div>
                          <Bot size={32} className="absolute inset-0 m-auto text-indigo-200" />
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-[0.5em]">Synthesizing Pedagogical Logic</p>
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center opacity-10 py-60">
                        <Maximize2 size={120} className="mb-8" />
                        <p className="text-xl font-black uppercase tracking-[0.3em]">Standby for Ingestion</p>
                      </div>
                    ))}
                  </div>
                </div>
                
                {cleanResult && !isGenerating && (
                  <div className="max-w-7xl mx-auto mt-20 space-y-16">
                    {suggestions.length > 0 && (
                      <div className="flex flex-wrap gap-3 animate-in fade-in slide-in-from-bottom-6 duration-1000">
                        {suggestions.map((suggestion, sIdx) => (
                          <button
                            key={sIdx}
                            onClick={() => handleGenerate(true, suggestion)}
                            className="flex items-center gap-3 px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all shadow-sm"
                          >
                            <Sparkles size={16} className="text-indigo-400" />
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="pt-12 border-t border-slate-100/50 flex flex-wrap items-center justify-start gap-6">
                      <button onClick={exportToWord} className="flex items-center gap-3 px-8 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 hover:border-indigo-400 hover:shadow-xl transition-all">
                        <FileDown size={22} /> Word (.doc)
                      </button>
                      <button onClick={exportToExcel} className="flex items-center gap-3 px-8 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 hover:border-emerald-400 hover:shadow-xl transition-all">
                        <FileSpreadsheet size={22} /> Excel (.csv)
                      </button>
                      <button 
                        onClick={() => {navigator.clipboard.writeText(cleanResult); setCopied(true); setTimeout(()=>setCopied(false), 2000)}} 
                        className="flex items-center gap-3 px-10 py-4 bg-indigo-50 text-indigo-700 rounded-2xl text-sm font-bold hover:bg-indigo-600 hover:text-white hover:shadow-2xl transition-all"
                      >
                        {copied ? <Check size={22} /> : <Copy size={22} />}
                        {copied ? 'Copied' : 'Copy Artifact'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Refinement Bar - Floating Style */}
              {cleanResult && (
                <div className="p-10 bg-slate-50/50 border-t border-slate-100 backdrop-blur-md">
                  <div className="max-w-7xl mx-auto">
                    <div className="relative group shadow-2xl rounded-[2rem] bg-white">
                      <input 
                        value={refinementInput}
                        onChange={(e) => setRefinementInput(e.target.value)}
                        placeholder="Request iteration or add suggestion..."
                        className="w-full pl-8 pr-20 py-8 bg-transparent border-none rounded-[2rem] text-lg font-medium focus:ring-0 outline-none transition-all"
                        onKeyDown={e => e.key === 'Enter' && handleGenerate(true)}
                      />
                      <button 
                        onClick={() => handleGenerate(true)}
                        disabled={isGenerating || !refinementInput.trim()}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-5 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all disabled:opacity-50 active:scale-90 shadow-lg"
                      >
                        <Send size={24} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Tools;
