
import React, { useState } from 'react';
import { Sparkles, ClipboardCheck, BookOpen, Layers, ArrowRight, Loader2, Copy, Check, AlertCircle } from 'lucide-react';
import { geminiService } from '../services/geminiService';
import { NeuralBrain, Document } from '../types';

interface ToolsProps {
  brain: NeuralBrain;
  documents: Document[];
  onQuery: () => void;
  canQuery: boolean;
}

const Tools: React.FC<ToolsProps> = ({ brain, documents, onQuery, canQuery }) => {
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [userInput, setUserInput] = useState('');
  const [result, setResult] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  const selectedDoc = documents.find(d => d.id === selectedDocId);

  const toolDefinitions = [
    { id: 'lesson-plan', name: 'Lesson Plan Generator', icon: BookOpen, desc: 'Create detailed pedagogically-sound lesson structures.', color: 'indigo' },
    { id: 'assessment', name: 'Assessment Maker', icon: ClipboardCheck, desc: 'Generate quizzes and tests aligned with specific SLOs.', color: 'emerald' },
    { id: 'rubric', name: 'Rubric Creator', icon: Layers, desc: 'Design transparent grading criteria for any activity.', color: 'amber' },
    { id: 'slo-tagger', name: 'SLO Auto-Tagger', icon: Sparkles, desc: 'Extract learning outcomes based on Bloom\'s Taxonomy.', color: 'purple' },
  ];

  const handleGenerate = async () => {
    if (!activeTool || !userInput || isGenerating || !canQuery) return;
    setIsGenerating(true);
    setResult('');
    
    try {
      const stream = geminiService.generatePedagogicalToolStream(
        activeTool, 
        userInput, 
        {
          fileUri: selectedDoc?.geminiFileUri,
          mimeType: selectedDoc?.mimeType
        }, 
        brain
      );

      onQuery();
      let fullContent = '';
      for await (const chunk of stream) {
        if (chunk) {
          fullContent += chunk;
          setResult(fullContent);
        }
      }
    } catch (err) {
      console.error(err);
      setResult("Error generating content. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">GenAI Pedagogical Tools</h1>
        <p className="text-slate-500 mt-1">Accelerate teaching workflow with direct Gemini File API integration.</p>
      </header>

      {!canQuery && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between text-rose-800">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600" />
            <p className="font-bold">Subscription Limit Reached.</p>
          </div>
        </div>
      )}

      {!activeTool ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {toolDefinitions.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                onClick={() => setActiveTool(tool.id)}
                disabled={!canQuery}
                className={`flex items-start gap-5 p-6 bg-white border border-slate-200 rounded-2xl transition-all group text-left ${!canQuery ? 'opacity-50 cursor-not-allowed' : 'hover:border-indigo-400 hover:shadow-lg'}`}
              >
                <div className={`p-4 rounded-xl bg-${tool.color}-50 text-${tool.color}-600 group-hover:bg-${tool.color}-600 group-hover:text-white transition-all`}>
                  <Icon className="w-8 h-8" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-slate-900 mb-1 group-hover:text-indigo-600 transition-colors">{tool.name}</h3>
                  <p className="text-slate-500 text-sm leading-relaxed">{tool.desc}</p>
                </div>
                <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-600 transition-colors mt-1" />
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-8">
          <div className="lg:w-1/3 space-y-6">
            <button 
              onClick={() => { setActiveTool(null); setResult(''); setUserInput(''); setSelectedDocId(null); }}
              className="text-sm font-semibold text-indigo-600 flex items-center gap-2 hover:underline"
            >
              ← Back to Tools
            </button>
            
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600">
                  {React.createElement(toolDefinitions.find(t => t.id === activeTool)?.icon || Sparkles, { size: 18 })}
                </div>
                <h3 className="font-bold">{toolDefinitions.find(t => t.id === activeTool)?.name}</h3>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-600">Reference Document</label>
                <select 
                  value={selectedDocId || ''} 
                  onChange={(e) => setSelectedDocId(e.target.value || null)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none"
                >
                  <option value="">No context (General)</option>
                  {documents.map(doc => (
                    <option key={doc.id} value={doc.id}>{doc.name}</option>
                  ))}
                </select>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-600">Specific Requirements</label>
                <textarea 
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  placeholder="Describe your goals..."
                  className="w-full h-40 p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all resize-none text-sm"
                />
              </div>

              <button 
                onClick={handleGenerate}
                disabled={isGenerating || !userInput.trim() || !canQuery}
                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                {isGenerating ? 'Analyzing File...' : 'Generate Content'}
              </button>
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-[600px]">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex-1 flex flex-col overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <span className="text-sm font-bold text-slate-400 tracking-widest">PEDAGOGICAL OUTPUT</span>
                {result && (
                  <button onClick={copyToClipboard} className="text-xs font-bold text-indigo-600 flex items-center gap-2">
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                )}
              </div>
              <div className="flex-1 p-8 overflow-y-auto whitespace-pre-wrap font-serif text-slate-800 leading-loose text-lg">
                {result || (isGenerating ? 'Watch as Gemini analyzes the curriculum URI...' : 'Results will appear here.')}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Tools;
