import React, { useState, useEffect } from 'react';
import { 
  Sparkles, ClipboardCheck, BookOpen, Layers, ArrowLeft, Send, Loader2, 
  Copy, Check, FileDown, Bot, Target, Share2
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
      await adaptiveService.captureGeneration(user.id, activeTool, fullContent, { tool: activeTool });
      setRefinementInput('');
      setCooldown(3);
    } catch (err) {
      setResult("Neural sync paused.");
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
    const header = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><style>body { font-family: sans-serif; padding: 40px; line-height: 1.6; } table { border-collapse: collapse; width: 100%; border: 1px solid #ddd; } th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }</style></head><body>`;
    const footer = "</body></html>";
    const htmlBody = cleanResult.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');
    const blob = new Blob([header + `<div>${htmlBody}</div>` + footer], { type: 'application/msword' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `pedagogy-artifact-${activeTool}.doc`;
    link.click();
  };

  return (
    <div className="max-w-4xl mx-auto w-full pb-32 px-4">
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
          <header className="flex items-center justify-between py-6 bg-white/50 dark:bg-slate-950/50 backdrop-blur-md sticky top-0 z-20">
            <button onClick={() => {setActiveTool(null); setResult('');}} className="text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-2 text-sm font-black uppercase tracking-widest transition-all"><ArrowLeft size={16} /> Dashboard</button>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800">
               {documents.map(doc => (
                 <button key={doc.id} onClick={() => setSelectedDocId(selectedDocId === doc.id ? null : doc.id)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0 ${selectedDocId === doc.id ? 'bg-white dark:bg-indigo-600 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}>
                   {doc.name}
                 </button>
               ))}
            </div>
          </header>

          {!result && (
            <div className="space-y-8 animate-in slide-in-from-bottom-8">
              <div className="bg-white dark:bg-slate-900 p-2 rounded-[3.5rem] border border-slate-100 dark:border-slate-800 shadow-2xl">
                <textarea 
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  placeholder={`Input context for your ${activeTool.replace('-', ' ')}...`}
                  className="w-full h-72 p-10 bg-transparent outline-none resize-none text-xl text-slate-800 dark:text-slate-200 placeholder:text-slate-200 dark:placeholder:text-slate-700 leading-relaxed"
                />
              </div>
              <button 
                onClick={() => handleGenerate()}
                disabled={isGenerating || !userInput.trim() || cooldown > 0}
                className="w-full py-6 bg-slate-900 dark:bg-indigo-600 text-white rounded-[2rem] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-4 disabled:opacity-50 shadow-2xl active:scale-[0.98] transition-all"
              >
                {isGenerating ? <Loader2 size={24} className="animate-spin" /> : <Sparkles size={24} />}
                Synthesize Artifact
              </button>
            </div>
          )}

          {result && (
            <div className="space-y-10 animate-in fade-in duration-700">
              <div className="bg-white dark:bg-slate-900 p-10 md:p-16 border border-slate-100 dark:border-slate-800 rounded-[3.5rem] shadow-2xl leading-loose text-slate-800 dark:text-slate-200 text-lg relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity"><Bot size={120} /></div>
                <div className="prose prose-slate dark:prose-invert max-w-none whitespace-pre-wrap relative z-10">
                  {cleanResult || <div className="flex gap-3 justify-center py-20"><div className="w-3 h-3 bg-indigo-200 rounded-full animate-bounce" /><div className="w-3 h-3 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]" /><div className="w-3 h-3 bg-indigo-600 rounded-full animate-bounce [animation-delay:0.4s]" /></div>}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-4 py-10">
                <button onClick={exportToWord} className="flex items-center gap-3 px-10 py-5 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-200 dark:hover:border-slate-600 transition-all shadow-sm">
                  <FileDown size={20} /> Download DOC
                </button>
                <button onClick={() => handleShare(result)} className="flex items-center gap-3 px-10 py-5 bg-indigo-50 dark:bg-indigo-900/30 border-2 border-indigo-100 dark:border-indigo-900/50 rounded-2xl text-sm font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-all shadow-sm">
                  <Share2 size={20} /> Share Artifact
                </button>
                <button onClick={() => handleCopy(result)} className="flex items-center gap-3 px-10 py-5 bg-slate-900 dark:bg-indigo-600 text-white rounded-2xl text-sm font-black uppercase tracking-widest shadow-2xl active:scale-95 transition-all">
                  {copied ? <Check size={20} className="text-emerald-400" /> : <Copy size={20} />} {copied ? 'Copied' : 'Copy Text'}
                </button>
              </div>

              {suggestions.length > 0 && (
                <div className="flex flex-wrap justify-center gap-3">
                  {suggestions.map((s, i) => (
                    <button key={i} onClick={() => handleGenerate(true, s)} className="px-6 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-xs font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-900 dark:hover:bg-indigo-600 hover:text-white hover:border-slate-900 dark:hover:border-indigo-600 transition-all shadow-sm">{s}</button>
                  ))}
                </div>
              )}

              <div className="max-w-2xl mx-auto pt-10 border-t border-slate-100 dark:border-slate-800">
                <div className="relative">
                  <input 
                    value={refinementInput}
                    onChange={(e) => setRefinementInput(e.target.value)}
                    placeholder="Refine this generation..."
                    className="w-full p-6 pr-16 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[1.5rem] focus:ring-4 focus:ring-indigo-600/5 focus:border-indigo-600 outline-none transition-all text-base font-medium text-slate-800 dark:text-slate-200"
                    onKeyDown={e => e.key === 'Enter' && handleGenerate(true)}
                  />
                  <button onClick={() => handleGenerate(true)} className="absolute right-4 top-1/2 -translate-y-1/2 p-3 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 rounded-xl transition-all">
                    <Send size={20} />
                  </button>
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