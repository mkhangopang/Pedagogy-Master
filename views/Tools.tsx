
import React, { useState, useEffect } from 'react';
import { 
  Sparkles, ClipboardCheck, BookOpen, Layers, ArrowLeft, Send, Loader2, 
  Copy, Check, FileDown, Bot, Target, Share2, Download, FileText, User
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
    const suggestions = suggestionStr.split('|').map(s => s.trim()).filter(s => s.length > 0);
    return { text: text.trim(), suggestions };
  };

  const handleCopy = async (text: string) => {
    const cleanText = text.split('[SUGGESTIONS]')[0].trim();
    await navigator.clipboard.writeText(cleanText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async (text: string) => {
    const cleanText = text.split('[SUGGESTIONS]')[0].trim();
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Pedagogy Master: ${activeTool}`,
          text: cleanText,
        });
      } catch (err) {
        handleCopy(text);
      }
    } else {
      handleCopy(text);
    }
  };

  const handleGenerate = async (isRefinement = false, suggestionText?: string) => {
    const finalRefinementText = suggestionText || refinementInput;
    const finalUserInput = isRefinement ? refinementInput : userInput;
    
    if (!activeTool || (!isRefinement && !userInput.trim()) || (isRefinement && !finalRefinementText.trim()) || isGenerating || !canQuery || cooldown > 0) return;
    
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
      await adaptiveService.captureGeneration(user.id, activeTool, fullContent, { tool: activeTool });
      setRefinementInput('');
      setCooldown(3);
    } catch (err) {
      setResult("Neural sync paused. Check your connection.");
    } finally {
      setIsGenerating(false);
    }
  };

  const toolDefinitions = [
    { id: 'lesson-plan', name: 'Lesson Plan', icon: BookOpen, desc: 'Detailed pedagogical flow' },
    { id: 'assessment', name: 'Assessment', icon: ClipboardCheck, desc: 'Balanced query sets' },
    { id: 'rubric', name: 'Rubric', icon: Layers, desc: 'Criteria & Leveling' },
    { id: 'slo-tagger', name: 'SLO Tagger', icon: Target, desc: 'Extract & Map Outcomes' },
  ];

  const { text: cleanResult, suggestions } = parseContent(result);

  const exportToWord = () => {
    const header = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><style>body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; line-height: 1.6; color: #334155; } h1, h2, h3 { color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; } table { border-collapse: collapse; width: 100%; border: 1px solid #e2e8f0; margin: 20px 0; } th, td { border: 1px solid #e2e8f0; padding: 12px; text-align: left; } th { background-color: #f8fafc; font-weight: bold; }</style></head><body>`;
    const footer = "</body></html>";
    const htmlBody = cleanResult.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');
    const blob = new Blob([header + `<div>${htmlBody}</div>` + footer], { type: 'application/msword' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `pedagogy-master-${activeTool}.doc`;
    link.click();
  };

  return (
    <div className="max-w-4xl mx-auto w-full pb-40 px-4">
      {!activeTool ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
          {toolDefinitions.map((tool) => (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              className="p-10 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[3rem] hover:border-indigo-600 dark:hover:border-indigo-500 transition-all text-left flex items-center gap-8 group shadow-sm hover:shadow-2xl active:scale-[0.98]"
            >
              <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-[1.5rem] flex items-center justify-center text-slate-400 dark:text-slate-500 group-hover:bg-indigo-600 dark:group-hover:bg-indigo-500 group-hover:text-white transition-all shrink-0 shadow-inner">
                <tool.icon size={28} />
              </div>
              <div>
                <h3 className="font-bold text-xl text-slate-900 dark:text-white">{tool.name}</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{tool.desc}</p>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-10 animate-in fade-in">
          <header className="flex items-center justify-between py-6 bg-slate-50/50 dark:bg-slate-950/50 backdrop-blur-md sticky top-0 z-20">
            <button onClick={() => {setActiveTool(null); setResult('');}} className="text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all">
              <ArrowLeft size={16} /> Dashboard
            </button>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide bg-white dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
               {documents.map(doc => (
                 <button key={doc.id} onClick={() => setSelectedDocId(selectedDocId === doc.id ? null : doc.id)} className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0 flex items-center gap-2 ${selectedDocId === doc.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}>
                   <FileText size={12} />
                   {doc.name}
                 </button>
               ))}
            </div>
          </header>

          {!result && (
            <div className="space-y-8 animate-in slide-in-from-bottom-8">
              <div className="bg-white dark:bg-slate-900 p-2 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-2xl">
                <textarea 
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  placeholder={`Describe your requirements for this ${activeTool.replace('-', ' ')}...`}
                  className="w-full h-80 p-10 bg-transparent outline-none resize-none text-xl text-slate-800 dark:text-slate-200 placeholder:text-slate-200 dark:placeholder:text-slate-700 leading-relaxed font-medium"
                />
              </div>
              <button 
                onClick={() => handleGenerate()}
                disabled={isGenerating || !userInput.trim() || cooldown > 0}
                className="w-full py-6 bg-slate-900 dark:bg-indigo-600 text-white rounded-[2.5rem] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-4 disabled:opacity-50 shadow-2xl active:scale-[0.98] transition-all"
              >
                {isGenerating ? <Loader2 size={24} className="animate-spin" /> : <Sparkles size={24} />}
                Synthesize Artifact
              </button>
            </div>
          )}

          {result && (
            <div className="space-y-12 animate-in fade-in duration-700">
              {/* Tool User Prompt (Compact) */}
              <div className="flex justify-end pr-4">
                <div className="max-w-[80%] bg-indigo-600 text-white p-5 rounded-[2rem] rounded-tr-none shadow-lg text-sm font-medium">
                  {userInput}
                </div>
              </div>

              {/* Tool AI Artifact Result */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[3.5rem] shadow-2xl overflow-hidden group">
                {/* Header Actions */}
                <div className="flex items-center justify-between px-10 py-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
                   <div className="flex items-center gap-3">
                     <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-lg"><Bot size={20} /></div>
                     <div>
                       <span className="font-black text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400">{activeTool.replace('-', ' ')} generated</span>
                       <p className="text-xs font-bold text-slate-900 dark:text-white">Neural Synthesis Complete</p>
                     </div>
                   </div>
                   <div className="flex items-center gap-2">
                     <button onClick={() => handleCopy(result)} className="p-2.5 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-all text-slate-400 hover:text-indigo-600 border border-transparent hover:border-slate-200 dark:hover:border-slate-700" title="Copy">
                       {copied ? <Check size={18} className="text-emerald-500" /> : <Copy size={18} />}
                     </button>
                     <button onClick={exportToWord} className="p-2.5 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-all text-slate-400 hover:text-indigo-600 border border-transparent hover:border-slate-200 dark:hover:border-slate-700" title="Download">
                       <Download size={18} />
                     </button>
                     <button onClick={() => handleShare(result)} className="p-2.5 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-all text-slate-400 hover:text-indigo-600 border border-transparent hover:border-slate-200 dark:hover:border-slate-700" title="Share">
                       <Share2 size={18} />
                     </button>
                   </div>
                </div>

                {/* Content Area */}
                <div className="p-10 md:p-16 leading-loose text-slate-800 dark:text-slate-200 text-lg">
                  <div className="prose prose-slate dark:prose-invert max-w-none whitespace-pre-wrap">
                    {cleanResult || <div className="flex gap-3 justify-center py-20"><div className="w-3 h-3 bg-indigo-200 rounded-full animate-bounce" /><div className="w-3 h-3 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]" /><div className="w-3 h-3 bg-indigo-600 rounded-full animate-bounce [animation-delay:0.4s]" /></div>}
                  </div>
                </div>

                {/* Suggestions / Follow-ups */}
                {suggestions.length > 0 && (
                  <div className="px-10 pb-10 flex flex-wrap gap-2">
                    {suggestions.map((s, i) => (
                      <button key={i} onClick={() => handleGenerate(true, s)} className="px-5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all shadow-sm">
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Refinement Dock (Sticky matching Chat) */}
              <div className="fixed bottom-0 left-0 right-0 p-6 md:p-10 bg-gradient-to-t from-slate-50 dark:from-slate-950 via-slate-50/95 dark:via-slate-950/95 to-transparent z-10 pointer-events-none">
                <div className="max-w-3xl mx-auto relative group pointer-events-auto">
                  <textarea 
                    value={refinementInput}
                    onChange={(e) => setRefinementInput(e.target.value)}
                    placeholder="Request a refinement or change..."
                    rows={1}
                    className="w-full pl-8 pr-16 py-5 md:py-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2.5rem] shadow-2xl focus:ring-4 focus:ring-indigo-600/5 focus:border-indigo-600 outline-none resize-none text-base transition-all dark:text-white"
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleGenerate(true))}
                  />
                  <button 
                    onClick={() => handleGenerate(true)} 
                    disabled={isGenerating || !refinementInput.trim()}
                    className={`absolute right-4 bottom-4 p-3.5 rounded-2xl transition-all shadow-xl ${
                      refinementInput.trim() && !isGenerating ? 'bg-indigo-600 text-white scale-100 active:scale-95 hover:bg-indigo-700' : 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600'
                    }`}
                  >
                    {isGenerating ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                  </button>
                </div>
                <div className="flex justify-center mt-4">
                   <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-600">
                     {cooldown > 0 ? `Neural Cooldown: ${cooldown}s` : 'Neural Refinement Node Ready'}
                   </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Tools;
