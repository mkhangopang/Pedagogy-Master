
import React, { useState, useEffect } from 'react';
import { 
  Sparkles, ClipboardCheck, BookOpen, Layers, ArrowRight, Loader2, 
  Copy, Check, Send, RefreshCw, FileDown, FileSpreadsheet, Trash2, Zap
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
  const [currentArtifactId, setCurrentArtifactId] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const selectedDoc = documents.find(d => d.id === selectedDocId);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const toolDefinitions = [
    { id: 'lesson-plan', name: 'Lesson Plan Generator', icon: BookOpen, desc: 'Create detailed pedagogically-sound lesson structures.', color: 'indigo' },
    { id: 'assessment', name: 'Assessment Maker', icon: ClipboardCheck, desc: 'Generate quizzes and tests aligned with curriculum context.', color: 'emerald' },
    { id: 'rubric', name: 'Rubric Creator', icon: Layers, desc: 'Design transparent grading criteria for any activity.', color: 'amber' },
  ];

  const handleGenerate = async (isRefinement = false) => {
    if (!activeTool || (isRefinement ? !refinementInput : !userInput) || isGenerating || !canQuery || cooldown > 0) return;
    setIsGenerating(true);
    if (!isRefinement) setResult('');
    
    try {
      const finalInput = isRefinement ? `Context: ${result}\n\nREFINEMENT REQUEST: ${refinementInput}` : userInput;
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

      const artifactId = await adaptiveService.captureGeneration(user.id, activeTool, fullContent, { tool: activeTool, docId: selectedDocId });
      setCurrentArtifactId(artifactId);
      setRefinementInput('');
      setCooldown(8);

    } catch (err) {
      setResult("Neural Cooldown Active: The free AI tier has hit a capacity limit. Please wait 15 seconds.");
    } finally {
      setIsGenerating(false);
    }
  };

  const exportToWord = () => {
    const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Pedagogical Artifact</title></head><body>";
    const footer = "</body></html>";
    const content = `<h1>${activeTool?.toUpperCase()}</h1><div style="font-family: Arial, sans-serif;">${result.replace(/\n/g, '<br>')}</div>`;
    const source = header + content + footer;
    
    const blob = new Blob(['\ufeff', source], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeTool}-${Date.now()}.doc`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportToExcel = () => {
    // Basic CSV parser for pedagogical lists
    const lines = result.split('\n');
    const csvContent = lines.map(line => `"${line.replace(/"/g, '""')}"`).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeTool}-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Pedagogical Synthesis</h1>
          <p className="text-slate-500 mt-1 font-medium">Core AI Generation • Adaptive Learning Nodes</p>
        </div>
        {cooldown > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-600 rounded-xl text-xs font-bold border border-amber-100 animate-pulse">
            <RefreshCw size={14} className="animate-spin" />
            Neural Cooldown: {cooldown}s
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
                className="flex flex-col items-start p-8 bg-white border border-slate-200 rounded-[2.5rem] transition-all group text-left hover:border-indigo-400 hover:shadow-2xl hover:-translate-y-1"
              >
                <div className={`p-4 rounded-2xl bg-${tool.color}-50 text-${tool.color}-600 group-hover:bg-${tool.color}-600 group-hover:text-white transition-all mb-6`}>
                  <Icon size={32} />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">{tool.name}</h3>
                <p className="text-slate-500 text-sm leading-relaxed mb-6 flex-1">{tool.desc}</p>
                <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs group-hover:gap-4 transition-all">
                  Initialize Synthesis <ArrowRight size={16} />
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col xl:flex-row gap-8">
          <div className="xl:w-80 space-y-6">
            <button 
              onClick={() => { setActiveTool(null); setResult(''); setUserInput(''); }}
              className="text-xs font-bold text-slate-500 flex items-center gap-2 bg-slate-100 px-4 py-2 rounded-full hover:bg-slate-200 transition-colors"
            >
              ← Back to Tools
            </button>
            
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Library Node</label>
                <select 
                  value={selectedDocId || ''} 
                  onChange={(e) => setSelectedDocId(e.target.value || null)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="">Global Brain</option>
                  {documents.map(doc => <option key={doc.id} value={doc.id}>{doc.name}</option>)}
                </select>
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Instructional Focus</label>
                <textarea 
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  placeholder="e.g. Year 10 Algebra recap focusing on quadratic equations..."
                  className="w-full h-32 p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none text-sm font-medium"
                />
              </div>

              <button 
                onClick={() => handleGenerate(false)}
                disabled={isGenerating || !userInput.trim() || !canQuery || cooldown > 0}
                className={`w-full py-4 rounded-2xl font-bold shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 ${cooldown > 0 ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
              >
                {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                {isGenerating ? 'Synthesizing...' : 'Generate Artifact'}
              </button>
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-[700px]">
            <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-sm flex-1 flex flex-col overflow-hidden relative">
              <div className="px-8 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-4">
                  <span className="text-[10px] font-black text-indigo-600 tracking-widest uppercase flex items-center gap-2">
                    <Zap size={14} /> Artifact v1
                  </span>
                </div>
                {result && (
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={exportToWord}
                      className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 hover:border-indigo-400 hover:text-indigo-600 transition-all"
                    >
                      <FileDown size={14} /> Word (.doc)
                    </button>
                    <button 
                      onClick={exportToExcel}
                      className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 hover:border-emerald-400 hover:text-emerald-600 transition-all"
                    >
                      <FileSpreadsheet size={14} /> Excel (.csv)
                    </button>
                    <button 
                      onClick={() => {navigator.clipboard.writeText(result); setCopied(true); setTimeout(()=>setCopied(false), 2000)}} 
                      className="p-2 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all text-slate-400"
                    >
                      {copied ? <Check size={18} className="text-emerald-500" /> : <Copy size={18} />}
                    </button>
                  </div>
                )}
              </div>

              <div className="flex-1 p-12 overflow-y-auto whitespace-pre-wrap font-serif text-slate-900 leading-[1.8] text-lg scroll-smooth bg-slate-50/30">
                {result ? (
                  <div className="max-w-3xl mx-auto bg-white p-12 shadow-2xl rounded-sm border border-slate-100 min-h-full">
                    {result}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
                    <Sparkles size={48} className="mb-4" />
                    <p className="text-sm font-bold uppercase tracking-widest">Instruction output will populate here</p>
                  </div>
                )}
              </div>

              {result && (
                <div className="p-4 bg-indigo-50/50 border-t border-indigo-100">
                  <div className="flex items-center gap-3 max-w-2xl mx-auto">
                    <div className="relative flex-1">
                      <input 
                        value={refinementInput}
                        onChange={(e) => setRefinementInput(e.target.value)}
                        placeholder="Iterate on this artifact (e.g. 'Add a rubric')..."
                        className="w-full pl-4 pr-12 py-3 bg-white border border-indigo-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm"
                        onKeyDown={e => e.key === 'Enter' && handleGenerate(true)}
                      />
                      <button 
                        onClick={() => handleGenerate(true)}
                        disabled={isGenerating || !refinementInput.trim() || cooldown > 0}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all disabled:opacity-50"
                      >
                        <Send size={16} />
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
