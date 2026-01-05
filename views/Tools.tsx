
import React, { useState, useEffect } from 'react';
import { 
  Sparkles, ClipboardCheck, BookOpen, Layers, ArrowRight, Loader2, 
  Copy, Check, Send, RefreshCw, FileDown, FileSpreadsheet, Maximize2
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

  const toolDefinitions = [
    { id: 'lesson-plan', name: 'Lesson Plan', icon: BookOpen, desc: 'Structure standard-aligned instruction.', color: 'indigo' },
    { id: 'assessment', name: 'Assessment', icon: ClipboardCheck, desc: 'Create quizzes and tests.', color: 'emerald' },
    { id: 'rubric', name: 'Rubric', icon: Layers, desc: 'Design grading criteria.', color: 'amber' },
  ];

  const handleGenerate = async (isRefinement = false) => {
    if (!activeTool || (isRefinement ? !refinementInput : !userInput) || isGenerating || !canQuery || cooldown > 0) return;
    setIsGenerating(true);
    if (!isRefinement) setResult('');
    
    try {
      const finalInput = isRefinement ? `CONTEXT: ${result}\n\nUSER REQUEST: ${refinementInput}` : userInput;
      const stream = geminiService.generatePedagogicalToolStream(
        activeTool, 
        finalInput, 
        { base64: selectedDoc?.base64Data, mimeType: selectedDoc?.mimeType, filePath: selectedDoc?.filePath }, 
        brain,
        user
      );

      onQuery();
      let fullContent = isRefinement ? result + '\n\n---\n\n' : '';
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
      setResult("Neural Cooldown: AI node busy. Please wait a moment.");
    } finally {
      setIsGenerating(false);
    }
  };

  const exportToWord = () => {
    // Robust HTML structure for Word/Google Docs compatibility
    const header = `
      <html xmlns:v="urn:schemas-microsoft-com:vml"
            xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:w="urn:schemas-microsoft-com:office:word"
            xmlns:m="http://schemas.microsoft.com/office/2004/12/omml"
            xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
        <title>Pedagogical Export</title>
        <style>
          body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; padding: 20pt; }
          h1 { color: #1e3a8a; border-bottom: 1px solid #ddd; padding-bottom: 10px; }
          table { border-collapse: collapse; width: 100%; margin: 15pt 0; }
          th, td { border: 1px solid #999; padding: 8pt; text-align: left; vertical-align: top; font-size: 10pt; }
          th { background-color: #f3f4f6; font-weight: bold; }
          p { margin-bottom: 10pt; }
        </style>
      </head>
      <body>
    `;
    const footer = "</body></html>";
    
    // Simple markdown-to-html conversion for export
    let cleanContent = result
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\|/g, ' ') // Basic clean up of markdown table chars for simpler Word flow if not true HTML
      .replace(/\n/g, '<br>');

    const fullHtml = header + `<div>${cleanContent}</div>` + footer;
    const blob = new Blob(['\ufeff', fullHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeTool}-${Date.now()}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportToExcel = () => {
    const tableRegex = /\|(.+)\|/g;
    const tableLines = result.match(tableRegex);
    
    let csvContent = "\ufeff"; // BOM for Excel UTF-8 support
    if (tableLines) {
      csvContent += tableLines.map(line => {
        return line.split('|')
          .filter(cell => cell.trim() !== '')
          .map(cell => `"${cell.trim().replace(/"/g, '""')}"`)
          .join(',');
      }).join('\n');
    } else {
      csvContent += result.split('\n').map(line => `"${line.replace(/"/g, '""')}"`).join('\n');
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${activeTool}-${Date.now()}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-700 pb-12 h-full flex flex-col">
      <header className="flex items-center justify-between px-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Pedagogical Synthesis</h1>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{activeTool?.replace('-', ' ') || 'Awaiting Session'}</p>
        </div>
        {cooldown > 0 && (
          <div className="flex items-center gap-2 px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-[10px] font-bold border border-amber-100 animate-pulse">
            <RefreshCw size={12} className="animate-spin" />
            Syncing: {cooldown}s
          </div>
        )}
      </header>

      {!activeTool ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {toolDefinitions.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                onClick={() => setActiveTool(tool.id)}
                className="group flex flex-col items-start p-8 bg-white border border-slate-200 rounded-[2rem] transition-all hover:border-indigo-500 hover:shadow-2xl hover:-translate-y-1 text-left"
              >
                <div className={`p-4 rounded-xl bg-slate-50 text-${tool.color}-600 mb-6 group-hover:bg-indigo-600 group-hover:text-white transition-all`}>
                  <Icon size={28} />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">{tool.name}</h3>
                <p className="text-slate-500 text-xs leading-relaxed mb-6">{tool.desc}</p>
                <div className="mt-auto flex items-center gap-2 text-indigo-600 text-[10px] font-black uppercase tracking-widest">
                  Initialize <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex-1 flex flex-col xl:flex-row gap-6 h-full min-h-0">
          <div className="xl:w-72 flex-shrink-0 space-y-4">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 space-y-5 shadow-sm">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Context Node</label>
                <select 
                  value={selectedDocId || ''} 
                  onChange={(e) => setSelectedDocId(e.target.value || null)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="">Global Brain</option>
                  {documents.map(doc => <option key={doc.id} value={doc.id}>{doc.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Objective</label>
                <textarea 
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  placeholder="e.g. Design a quiz for unit 3..."
                  className="w-full h-32 p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium resize-none"
                />
              </div>
              <button 
                onClick={() => handleGenerate(false)}
                disabled={isGenerating || !userInput.trim() || cooldown > 0}
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-xl"
              >
                {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                Generate
              </button>
              <button onClick={() => setActiveTool(null)} className="w-full text-center text-[10px] font-black text-slate-400 hover:text-rose-500 transition-colors uppercase tracking-widest">
                Exit Session
              </button>
            </div>
          </div>

          <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm relative">
            <div className="flex-1 overflow-y-auto p-12 md:p-16 custom-scrollbar bg-white">
              <div className="w-full mx-auto text-slate-900 leading-relaxed font-sans text-lg whitespace-pre-wrap">
                {result || (isGenerating ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-6 py-20">
                    <Loader2 size={48} className="animate-spin text-indigo-200" />
                    <p className="text-xs font-black uppercase tracking-[0.3em]">Processing Neural Node...</p>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-20 py-32">
                    <Maximize2 size={64} className="mb-4" />
                    <p className="text-sm font-black uppercase tracking-widest">Awaiting synthesis parameters</p>
                  </div>
                ))}
              </div>
              
              {/* EXPORT ACTION BAR AT THE END OF THE RESPONSE */}
              {result && !isGenerating && (
                <div className="mt-20 pt-10 border-t border-slate-100 flex flex-wrap items-center justify-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-1000">
                  <button onClick={exportToWord} className="flex items-center gap-3 px-6 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:border-indigo-400 hover:text-indigo-600 hover:shadow-lg transition-all">
                    <FileDown size={18} /> Download Word (.doc)
                  </button>
                  <button onClick={exportToExcel} className="flex items-center gap-3 px-6 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:border-emerald-400 hover:text-emerald-600 hover:shadow-lg transition-all">
                    <FileSpreadsheet size={18} /> Download Excel (.csv)
                  </button>
                  <button 
                    onClick={() => {navigator.clipboard.writeText(result); setCopied(true); setTimeout(()=>setCopied(false), 2000)}} 
                    className="flex items-center gap-3 px-6 py-3 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-bold hover:bg-indigo-600 hover:text-white hover:shadow-lg transition-all"
                  >
                    {copied ? <Check size={18} /> : <Copy size={18} />}
                    {copied ? 'Copied to Clipboard' : 'Copy Full Text'}
                  </button>
                </div>
              )}
            </div>

            {result && (
              <div className="p-6 bg-slate-50 border-t border-slate-100">
                <div className="max-w-4xl mx-auto flex items-center gap-3">
                  <div className="relative flex-1">
                    <input 
                      value={refinementInput}
                      onChange={(e) => setRefinementInput(e.target.value)}
                      placeholder="Follow up or request changes..."
                      className="w-full pl-6 pr-14 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm"
                      onKeyDown={e => e.key === 'Enter' && handleGenerate(true)}
                    />
                    <button 
                      onClick={() => handleGenerate(true)}
                      disabled={isGenerating || !refinementInput.trim()}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50"
                    >
                      <Send size={18} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Tools;
