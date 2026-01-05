
import React, { useState, useEffect } from 'react';
import { 
  Sparkles, ClipboardCheck, BookOpen, Layers, ArrowRight, Loader2, 
  Copy, Check, Send, RefreshCw, FileDown, FileSpreadsheet, Trash2, Zap, Maximize2
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
      const finalInput = isRefinement ? `PREVIOUS ARTIFACT: ${result}\n\nREFINEMENT REQUEST: ${refinementInput}` : userInput;
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
      setCooldown(6);

    } catch (err) {
      setResult("Neural Cooldown: Node saturated. Please wait 15 seconds.");
    } finally {
      setIsGenerating(false);
    }
  };

  const exportToWord = () => {
    const header = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><style>body{font-family: Arial, sans-serif; line-height: 1.5; padding: 1in;} h1{color: #1e1b4b;} table{border-collapse: collapse; width: 100%;} th, td{border: 1px solid #ddd; padding: 8px; text-align: left;}</style></head><body>`;
    const footer = "</body></html>";
    // Convert markdown tables to basic HTML tables for better Word compatibility
    let formattedResult = result.replace(/\n/g, '<br>');
    const content = `<h1>${activeTool?.toUpperCase().replace('-', ' ')}</h1><div>${formattedResult}</div>`;
    const blob = new Blob(['\ufeff', header + content + footer], { type: 'application/msword' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${activeTool}-${Date.now()}.doc`;
    link.click();
  };

  const exportToExcel = () => {
    // Look for markdown tables specifically
    const tableRegex = /\|(.+)\|/g;
    const tableLines = result.match(tableRegex);
    
    let csvContent = "";
    if (tableLines) {
      csvContent = tableLines.map(line => {
        return line.split('|')
          .filter(cell => cell.trim() !== '')
          .map(cell => `"${cell.trim().replace(/"/g, '""')}"`)
          .join(',');
      }).join('\n');
    } else {
      // Fallback: entire text to single column CSV
      csvContent = result.split('\n').map(line => `"${line.replace(/"/g, '""')}"`).join('\n');
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
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Pedagogical Workspace</h1>
          <p className="text-slate-500 text-xs font-medium">Drafting Artifact: {activeTool || 'None'}</p>
        </div>
        {cooldown > 0 && (
          <div className="flex items-center gap-2 px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-[10px] font-bold border border-amber-100">
            <RefreshCw size={12} className="animate-spin" />
            Cooldown: {cooldown}s
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
                className="group flex flex-col items-start p-8 bg-white border border-slate-200 rounded-[2rem] transition-all hover:border-indigo-500 hover:shadow-xl hover:-translate-y-0.5 text-left"
              >
                <div className={`p-4 rounded-xl bg-slate-50 text-${tool.color}-600 mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-all`}>
                  <Icon size={24} />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">{tool.name}</h3>
                <p className="text-slate-500 text-xs leading-relaxed mb-4">{tool.desc}</p>
                <ArrowRight size={16} className="text-indigo-400 group-hover:translate-x-1 transition-transform" />
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex-1 flex flex-col xl:flex-row gap-6 h-full min-h-0">
          <div className="xl:w-72 flex-shrink-0 space-y-4">
            <div className="bg-white p-5 rounded-3xl border border-slate-200 space-y-4 shadow-sm">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Node</label>
                <select 
                  value={selectedDocId || ''} 
                  onChange={(e) => setSelectedDocId(e.target.value || null)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none"
                >
                  <option value="">Global Brain</option>
                  {documents.map(doc => <option key={doc.id} value={doc.id}>{doc.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Synthesis Instruction</label>
                <textarea 
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  placeholder="e.g. 5 MCQ quiz on Photosynthesis..."
                  className="w-full h-32 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-indigo-500 outline-none text-sm font-medium resize-none"
                />
              </div>
              <button 
                onClick={() => handleGenerate(false)}
                disabled={isGenerating || !userInput.trim() || cooldown > 0}
                className="w-full py-3.5 bg-indigo-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg"
              >
                {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                Generate
              </button>
              <button onClick={() => setActiveTool(null)} className="w-full py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors">
                Cancel Session
              </button>
            </div>
          </div>

          <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-[2rem] overflow-hidden shadow-sm relative">
            <div className="px-6 py-3 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
              <div className="flex items-center gap-4">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Synthesis Output</span>
              </div>
              {result && (
                <div className="flex items-center gap-1.5">
                  <button onClick={exportToWord} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-all">
                    <FileDown size={14} /> DOCX
                  </button>
                  <button onClick={exportToExcel} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 hover:bg-emerald-50 hover:text-emerald-600 transition-all">
                    <FileSpreadsheet size={14} /> EXCEL
                  </button>
                  <div className="w-px h-4 bg-slate-200 mx-1" />
                  <button onClick={() => {navigator.clipboard.writeText(result); setCopied(true); setTimeout(()=>setCopied(false), 2000)}} className="p-2 text-slate-400 hover:text-indigo-600">
                    {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-8 md:p-12 custom-scrollbar bg-white">
              <div className="w-full mx-auto text-slate-800 leading-relaxed font-sans text-base whitespace-pre-wrap">
                {result || (isGenerating ? (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-400 space-y-4">
                    <Loader2 size={32} className="animate-spin text-indigo-200" />
                    <p className="text-xs font-bold uppercase tracking-widest">Synthesizing Pedagogical Node...</p>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-20 py-20">
                    <Maximize2 size={64} className="mb-4" />
                    <p className="text-sm font-bold uppercase tracking-widest">Waiting for instructional input</p>
                  </div>
                ))}
              </div>
            </div>

            {result && (
              <div className="p-4 bg-slate-50/80 border-t border-slate-100 backdrop-blur-sm">
                <div className="max-w-4xl mx-auto flex items-center gap-3">
                  <div className="relative flex-1">
                    <input 
                      value={refinementInput}
                      onChange={(e) => setRefinementInput(e.target.value)}
                      placeholder="Ask for changes or add a table..."
                      className="w-full pl-4 pr-12 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-1 focus:ring-indigo-500 outline-none shadow-sm"
                      onKeyDown={e => e.key === 'Enter' && handleGenerate(true)}
                    />
                    <button 
                      onClick={() => handleGenerate(true)}
                      disabled={isGenerating || !refinementInput.trim()}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all disabled:opacity-50"
                    >
                      {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
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
