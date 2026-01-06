
import React, { useState, useEffect } from 'react';
import { 
  Sparkles, ClipboardCheck, BookOpen, Layers, ArrowLeft, ArrowRight, Loader2, 
  Copy, Check, Send, RefreshCw, FileDown, FileSpreadsheet, Maximize2, Bot, FileText
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
    { id: 'lesson-plan', name: 'Lesson Plan', icon: BookOpen, color: 'indigo' },
    { id: 'assessment', name: 'Assessment', icon: ClipboardCheck, color: 'emerald' },
    { id: 'rubric', name: 'Rubric', icon: Layers, color: 'amber' },
  ];

  const { text: cleanResult, suggestions } = parseContent(result);

  const exportToWord = () => {
    const header = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>Pedagogical Artifact</title><style>body { font-family: 'Segoe UI', sans-serif; padding: 2cm; } h1 { color: #1e3a8a; } table { border-collapse: collapse; width: 100%; border: 1px solid #ddd; } th, td { border: 1px solid #ddd; padding: 8px; }</style></head><body>`;
    const footer = "</body></html>";
    let htmlContent = cleanResult.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');
    const blob = new Blob([header + `<div>${htmlContent}</div>` + footer], { type: 'application/vnd.ms-word' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${activeTool}-${Date.now()}.doc`;
    link.click();
  };

  return (
    <div className="max-w-4xl mx-auto w-full pb-24">
      {!activeTool ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-4">
          {toolDefinitions.map((tool) => (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              className="p-8 bg-white border border-slate-200 rounded-3xl hover:border-slate-900 transition-all text-center space-y-4"
            >
              <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto text-slate-900">
                <tool.icon size={24} />
              </div>
              <h3 className="font-bold text-lg">{tool.name}</h3>
              <p className="text-slate-500 text-xs">Standardized pedagogical engine</p>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-8 p-4">
          <header className="flex items-center justify-between bg-white sticky top-0 py-4 z-10 border-b border-slate-100">
            <button 
              onClick={() => setActiveTool(null)}
              className="text-slate-500 hover:text-slate-900 flex items-center gap-2 text-sm font-bold"
            >
              <ArrowLeft size={16} /> Dashboard
            </button>
            <div className="flex gap-2">
               {documents.map(doc => (
                 <button 
                   key={doc.id}
                   onClick={() => setSelectedDocId(selectedDocId === doc.id ? null : doc.id)}
                   className={`px-3 py-1.5 rounded-full text-[10px] font-bold border ${selectedDocId === doc.id ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-500'}`}
                 >
                   {doc.name}
                 </button>
               ))}
            </div>
          </header>

          {!result && (
            <div className="space-y-6">
              <textarea 
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder={`Describe the ${activeTool.replace('-', ' ')} requirements...`}
                className="w-full h-40 p-6 bg-slate-50 border border-slate-200 rounded-3xl focus:ring-2 focus:ring-slate-900 outline-none resize-none text-lg"
              />
              <button 
                onClick={() => handleGenerate()}
                disabled={isGenerating || !userInput.trim() || cooldown > 0}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {isGenerating ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}
                Synthesize Artifact
              </button>
            </div>
          )}

          {result && (
            <div className="space-y-8 animate-in fade-in">
              <div className="prose prose-slate max-w-none bg-white p-8 md:p-12 border border-slate-100 rounded-3xl shadow-sm leading-relaxed">
                {cleanResult || <Loader2 size={32} className="animate-spin mx-auto text-slate-200" />}
              </div>

              <div className="flex flex-wrap gap-4 items-center justify-center pt-8 border-t border-slate-100">
                <button onClick={exportToWord} className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold hover:bg-slate-50">
                  <FileDown size={18} /> DOCX
                </button>
                <button onClick={() => {navigator.clipboard.writeText(cleanResult); setCopied(true); setTimeout(()=>setCopied(false), 2000)}} className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl text-sm font-bold">
                  {copied ? <Check size={18} /> : <Copy size={18} />} {copied ? 'Copied' : 'Copy'}
                </button>
              </div>

              <div className="max-w-2xl mx-auto pt-10">
                <div className="relative">
                  <input 
                    value={refinementInput}
                    onChange={(e) => setRefinementInput(e.target.value)}
                    placeholder="Request adjustments..."
                    className="w-full p-4 pr-12 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-slate-900 outline-none"
                    onKeyDown={e => e.key === 'Enter' && handleGenerate(true)}
                  />
                  <button onClick={() => handleGenerate(true)} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-900 hover:text-indigo-600">
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
