
import React, { useState, useEffect } from 'react';
import { 
  Sparkles, ClipboardCheck, BookOpen, Layers, ArrowRight, Loader2, 
  Copy, Check, AlertCircle, Volume2, Globe, Send, RefreshCw, Bookmark, Zap
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
  const [sources, setSources] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [useSearch, setUseSearch] = useState(true);
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

  const processStreamChunk = (chunk: string) => {
    if (chunk.includes('SOURCES_METADATA:')) {
      const parts = chunk.split('SOURCES_METADATA:');
      try {
        const meta = JSON.parse(parts[1]);
        setSources(prev => [...prev, ...meta]);
      } catch (e) {}
      return parts[0];
    }
    return chunk;
  };

  const handleGenerate = async (isRefinement = false) => {
    if (!activeTool || (isRefinement ? !refinementInput : !userInput) || isGenerating || !canQuery || cooldown > 0) return;
    setIsGenerating(true);
    if (!isRefinement) {
      setResult('');
      setSources([]);
    }
    
    try {
      const finalInput = isRefinement ? `Context: ${result}\n\nREFINEMENT REQUEST: ${refinementInput}` : userInput;
      const stream = geminiService.generatePedagogicalToolStream(
        activeTool, 
        finalInput, 
        { base64: selectedDoc?.base64Data, mimeType: selectedDoc?.mimeType, filePath: selectedDoc?.filePath }, 
        brain,
        user,
        useSearch
      );

      onQuery();
      let fullContent = isRefinement ? result + '\n\n---\n\n' : '';
      for await (const chunk of stream) {
        if (chunk) {
          const text = processStreamChunk(chunk);
          fullContent += text;
          setResult(fullContent);
        }
      }

      const artifactId = await adaptiveService.captureGeneration(user.id, activeTool, fullContent, { tool: activeTool, docId: selectedDocId });
      setCurrentArtifactId(artifactId);
      setRefinementInput('');
      setCooldown(8); // Set a cooldown to prevent 429s

    } catch (err) {
      setResult("Neural Cooldown Active: The free AI tier has hit a capacity limit. Please wait 15 seconds.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSpeak = async () => {
    if (isSpeaking || !result) return;
    setIsSpeaking(true);
    try {
      await geminiService.speak(result.replace(/#/g, '').substring(0, 1000));
    } finally {
      setIsSpeaking(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">GenAI Pedagogical Tools</h1>
          <p className="text-slate-500 mt-1">Accelerate teaching workflow with Adaptive Search Grounding.</p>
        </div>
        <div className="flex items-center gap-3">
          {cooldown > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-600 rounded-xl text-xs font-bold border border-amber-100 animate-pulse">
              <RefreshCw size={14} className="animate-spin" />
              Neural Cooldown: {cooldown}s
            </div>
          )}
          <button 
            onClick={() => setUseSearch(!useSearch)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${useSearch ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-600/20' : 'bg-white text-slate-500 border-slate-200'}`}
          >
            <Globe size={14} />
            Web Grounding: {useSearch ? 'ON' : 'OFF'}
          </button>
        </div>
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
                  Initialize Node <ArrowRight size={16} />
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col xl:flex-row gap-8">
          <div className="xl:w-80 space-y-6">
            <button 
              onClick={() => { setActiveTool(null); setResult(''); setUserInput(''); setSources([]); }}
              className="text-xs font-bold text-indigo-600 flex items-center gap-2 bg-indigo-50 px-4 py-2 rounded-full hover:bg-indigo-100 transition-colors"
            >
              ← System Menu
            </button>
            
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Library Node</label>
                <select 
                  value={selectedDocId || ''} 
                  onChange={(e) => setSelectedDocId(e.target.value || null)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="">Pure Neural Synthesis</option>
                  {documents.map(doc => <option key={doc.id} value={doc.id}>{doc.name}</option>)}
                </select>
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Instructional Logic</label>
                <textarea 
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  placeholder="Example: Year 9 Biology lesson on cell mitosis..."
                  className="w-full h-32 p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none text-sm font-medium"
                />
              </div>

              <button 
                onClick={() => handleGenerate(false)}
                disabled={isGenerating || !userInput.trim() || !canQuery || cooldown > 0}
                className={`w-full py-4 rounded-2xl font-bold shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 ${cooldown > 0 ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
              >
                {isGenerating ? <Loader2 size={18} className="animate-spin" /> : (cooldown > 0 ? <Zap size={18} /> : <Sparkles size={18} />)}
                {cooldown > 0 ? `Neural Sync in ${cooldown}s` : (isGenerating ? 'Synthesizing...' : 'Synthesize Tool')}
              </button>
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-[700px]">
            <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-sm flex-1 flex flex-col overflow-hidden relative">
              <div className="px-8 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-4">
                  <span className="text-[10px] font-black text-slate-400 tracking-widest uppercase">Neural Artifact</span>
                  {result && (
                    <button 
                      onClick={handleSpeak}
                      className={`flex items-center gap-2 text-indigo-600 text-[10px] font-bold uppercase ${isSpeaking ? 'animate-pulse' : ''}`}
                    >
                      <Volume2 size={14} />
                      {isSpeaking ? 'Synthesizing Audio...' : 'Read Aloud'}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => {navigator.clipboard.writeText(result); setCopied(true); setTimeout(()=>setCopied(false), 2000)}} className="p-2 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all text-slate-400 hover:text-indigo-600">
                    {copied ? <Check size={18} className="text-emerald-500" /> : <Copy size={18} />}
                  </button>
                </div>
              </div>

              <div className="flex-1 p-10 overflow-y-auto whitespace-pre-wrap font-serif text-slate-800 leading-relaxed text-lg scroll-smooth">
                {result || (isGenerating ? 'Engaging Search Grounding nodes. Analyzing direct document context...' : 'Instruction output will populate here.')}
                
                {sources.length > 0 && (
                  <div className="mt-12 pt-8 border-t border-slate-100">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <Bookmark size={12} /> Verification Sources
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {sources.map((src, i) => src.web && (
                        <a key={i} href={src.web.uri} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg text-xs font-bold transition-colors truncate max-w-[200px]">
                          {src.web.title || new URL(src.web.uri).hostname}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {result && (
                <div className="p-4 bg-slate-50 border-t border-slate-100">
                  <div className="flex items-center gap-3 max-w-2xl mx-auto">
                    <div className="relative flex-1">
                      <input 
                        value={refinementInput}
                        onChange={(e) => setRefinementInput(e.target.value)}
                        placeholder="Refine this artifact..."
                        className="w-full pl-4 pr-12 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm"
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
