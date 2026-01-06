
import React, { useState, useEffect } from 'react';
import { 
  Sparkles, ClipboardCheck, BookOpen, Layers, ArrowLeft, Send, Loader2, 
  Copy, Check, FileDown, Bot, Target
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
      setCooldown(4);
    } catch (err) {
      setResult("Cooldown active.");
    } finally {
      setIsGenerating(false);
    }
  };

  const toolDefinitions = [
    { id: 'lesson-plan', name: 'Lesson Plan', icon: BookOpen, desc: 'Timed activities & objectives' },
    { id: 'assessment', name: 'Assessment', icon: ClipboardCheck, desc: 'Balanced question sets' },
    { id: 'rubric', name: 'Rubric', icon: Layers, desc: 'Criteria-based evaluation' },
    { id: 'slo-tagger', name: 'SLO Tagger', icon: Target, desc: 'Extract learning outcomes' },
  ];

  const { text: cleanResult, suggestions } = parseContent(result);

  const exportToWord = () => {
    const header = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>Artifact</title><style>body { font-family: 'Segoe UI', sans-serif; padding: 2cm; } h1 { color: #1e3a8a; } table { border-collapse: collapse; width: 100%; border: 1px solid #ddd; } th, td { border: 1px solid #ddd; padding: 8px; }</style></head><body>`;
    const footer = "</body></html>";
    let htmlContent = cleanResult.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');
    const blob = new Blob([header + `<div>${htmlContent}</div>` + footer], { type: 'application/vnd.ms-word' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${activeTool}-${Date.now()}.doc`;
    link.click();
  };

  return (
    <div className="max-w-4xl mx-auto w-full pb-24 px-4">
      {!activeTool ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
          {toolDefinitions.map((tool) => (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              className="p-8 bg-white border border-slate-100 rounded-[2rem] hover:border-slate-900 transition-all text-left flex items-center gap-6 group shadow-sm"
            >
              <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-slate-900 group-hover:text-white transition-all shrink-0">
                <tool.icon size={28} />
              </div>
              <div>
                <h3 className="font-bold text-lg text-slate-900">{tool.name}</h3>
                <p className="text-slate-500 text-xs mt-1">{tool.desc}</p>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          <header className="flex items-center justify-between bg-white sticky top-0 py-4 z-10 border-b border-slate-50">
            <button 
              onClick={() => setActiveTool(null)}
              className="text-slate-400 hover:text-slate-900 flex items-center gap-2 text-sm font-bold"
            >
              <ArrowLeft size={16} /> Back
            </button>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide">
               {documents.map(doc => (
                 <button 
                   key={doc.id}
                   onClick={() => setSelectedDocId(selectedDocId === doc.id ? null : doc.id)}
                   className={`px-3 py-1.5 rounded-full text-[10px] font-bold border transition-all shrink-0 ${selectedDocId === doc.id ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'}`}
                 >
                   {doc.name}
                 </button>
               ))}
            </div>
          </header>

          {!result && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <textarea 
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder={`What should the ${activeTool.replace('-', ' ')} focus on?`}
                className="w-full h-48 p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] focus:ring-2 focus:ring-slate-900 outline-none resize-none text-lg text-slate-700"
              />
              <button 
                onClick={() => handleGenerate()}
                disabled={isGenerating || !userInput.trim() || cooldown > 0}
                className="w-full py-5 bg-slate-900 text-white rounded-[1.5rem] font-bold flex items-center justify-center gap-3 disabled:opacity-50 shadow-xl shadow-slate-900/10 active:scale-[0.98] transition-all"
              >
                {isGenerating ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}
                Generate Artifact
              </button>
            </div>
          )}

          {result && (
            <div className="space-y-8 animate-in fade-in">
              <div className="prose prose-slate max-w-none bg-white p-8 md:p-14 border border-slate-100 rounded-[3rem] shadow-sm leading-relaxed text-slate-800">
                {cleanResult || <div className="flex gap-1.5 py-10 justify-center"><div className="w-2 h-2 bg-slate-200 rounded-full animate-bounce" /><div className="w-2 h-2 bg-slate-200 rounded-full animate-bounce [animation-delay:0.2s]" /><div className="w-2 h-2 bg-slate-200 rounded-full animate-bounce [animation-delay:0.4s]" /></div>}
              </div>

              <div className="flex flex-wrap gap-4 items-center justify-center pt-8">
                <button onClick={exportToWord} className="flex items-center gap-2 px-8 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-bold hover:bg-slate-50 transition-all">
                  <FileDown size={18} /> DOCX
                </button>
                <button onClick={() => {navigator.clipboard.writeText(cleanResult); setCopied(true); setTimeout(()=>setCopied(false), 2000)}} className="flex items-center gap-2 px-8 py-4 bg-slate-900 text-white rounded-2xl text-sm font-bold shadow-xl shadow-slate-900/10 transition-all">
                  {copied ? <Check size={18} /> : <Copy size={18} />} {copied ? 'Copied' : 'Copy Text'}
                </button>
              </div>

              <div className="max-w-2xl mx-auto pt-10">
                <div className="relative group">
                  <input 
                    value={refinementInput}
                    onChange={(e) => setRefinementInput(e.target.value)}
                    placeholder="Refine this artifact..."
                    className="w-full p-5 pr-14 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-slate-900 outline-none transition-all group-hover:border-slate-300"
                    onKeyDown={e => e.key === 'Enter' && handleGenerate(true)}
                  />
                  <button onClick={() => handleGenerate(true)} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-slate-900 hover:text-indigo-600">
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
