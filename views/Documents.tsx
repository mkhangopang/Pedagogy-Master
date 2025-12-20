import React, { useState, useRef } from 'react';
import { 
  Upload, FileText, Plus, ChevronLeft, Target, 
  BrainCircuit, Lightbulb, BookOpen, Loader2, 
  AlertCircle, Trash2, Lock, AlertTriangle, 
  CheckCircle2, Search, Filter 
} from 'lucide-react';
import { Document, SLO, NeuralBrain, SubscriptionPlan } from '../types';
import { geminiService } from '../services/geminiService';
import { ROLE_LIMITS, BLOOM_LEVELS } from '../constants';

interface DocumentsProps {
  documents: Document[];
  onAddDocument: (doc: Document) => void;
  onUpdateDocument: (id: string, updates: Partial<Document>) => void;
  onDeleteDocument: (id: string) => void;
  brain: NeuralBrain;
  onQuery: () => void;
  canQuery: boolean;
  userPlan: SubscriptionPlan;
}

const Documents: React.FC<DocumentsProps> = ({ 
  documents, 
  onAddDocument, 
  onUpdateDocument, 
  onDeleteDocument,
  brain, 
  onQuery, 
  canQuery,
  userPlan
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedDoc = documents.find(d => d.id === selectedDocId);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !canQuery) return;

    setIsUploading(true);
    setError(null);

    try {
      const base64 = await fileToBase64(file);
      const mimeType = file.type || 'application/pdf';
      
      const newDoc: Document = {
        id: crypto.randomUUID(),
        userId: '', // Set by parent
        name: file.name,
        base64Data: base64,
        mimeType: mimeType,
        status: 'processing',
        subject: 'General Education',
        gradeLevel: 'K-12',
        sloTags: [],
        createdAt: new Date().toISOString()
      };

      onAddDocument(newDoc);
      setSelectedDocId(newDoc.id);
      setIsProcessing(true);

      // Trigger Gemini Analysis
      const slos = await geminiService.generateSLOTagsFromBase64(base64, mimeType, brain);
      onUpdateDocument(newDoc.id, { sloTags: slos, status: 'completed' });
      onQuery();

    } catch (err) {
      console.error("Upload failed:", err);
      setError("Failed to analyze document. Please ensure it's a valid PDF or text file.");
    } finally {
      setIsUploading(false);
      setIsProcessing(false);
    }
  };

  const getBloomColor = (level: string) => {
    const l = level.toLowerCase();
    if (l.includes('remember')) return 'bg-slate-100 text-slate-700 border-slate-200';
    if (l.includes('understand')) return 'bg-blue-50 text-blue-700 border-blue-200';
    if (l.includes('apply')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (l.includes('analyze')) return 'bg-amber-50 text-amber-700 border-amber-200';
    if (l.includes('evaluate')) return 'bg-rose-50 text-rose-700 border-rose-200';
    if (l.includes('create')) return 'bg-purple-50 text-purple-700 border-purple-200';
    return 'bg-slate-50 text-slate-600 border-slate-100';
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Curriculum Library</h1>
          <p className="text-slate-500 mt-1">Manage your pedagogical assets and AI-tagged objectives.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
            accept=".pdf,.txt,.doc,.docx"
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || !canQuery}
            className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all disabled:opacity-50"
          >
            {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
            Upload Curriculum
          </button>
        </div>
      </header>

      {!canQuery && (
        <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl flex items-center gap-3 text-rose-800">
          <AlertTriangle className="w-5 h-5 text-rose-600" />
          <p className="text-sm font-semibold">Usage limit reached. Upgrade your plan to analyze more documents.</p>
        </div>
      )}

      {error && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center gap-3 text-amber-800">
          <AlertCircle className="w-5 h-5 text-amber-600" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {selectedDoc ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-full">
          {/* Document Content & Action Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            <button 
              onClick={() => setSelectedDocId(null)}
              className="group flex items-center gap-2 text-indigo-600 font-bold text-sm hover:translate-x-[-4px] transition-transform"
            >
              <ChevronLeft size={18} />
              Back to Library
            </button>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 shrink-0">
                  <FileText size={24} />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="font-bold text-slate-900 truncate" title={selectedDoc.name}>{selectedDoc.name}</h2>
                  <p className="text-xs text-slate-500 mt-0.5 capitalize">{selectedDoc.status} • {selectedDoc.subject}</p>
                </div>
                {userPlan !== SubscriptionPlan.FREE && (
                  <button 
                    onClick={() => { onDeleteDocument(selectedDoc.id); setSelectedDocId(null); }}
                    className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>

              <div className="pt-4 border-t border-slate-100">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Metadata</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Bloom's Coverage</span>
                    <span className="font-bold text-slate-900">{selectedDoc.sloTags?.length || 0} Points</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Last Analyzed</span>
                    <span className="font-bold text-slate-900">{new Date(selectedDoc.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Quick Actions</h3>
                <div className="grid grid-cols-2 gap-2">
                  <button className="flex flex-col items-center justify-center p-3 bg-slate-50 rounded-xl hover:bg-indigo-50 hover:text-indigo-600 transition-colors gap-2 text-[10px] font-bold">
                    <BookOpen size={16} /> Export PDF
                  </button>
                  <button className="flex flex-col items-center justify-center p-3 bg-slate-50 rounded-xl hover:bg-indigo-50 hover:text-indigo-600 transition-colors gap-2 text-[10px] font-bold">
                    <Lightbulb size={16} /> Lesson Ideas
                  </button>
                </div>
              </div>
            </div>

            {selectedDoc.status === 'processing' && (
              <div className="bg-indigo-600 rounded-2xl p-6 text-white text-center space-y-3 shadow-xl">
                <Loader2 className="w-8 h-8 animate-spin mx-auto opacity-80" />
                <h3 className="font-bold">Gemini is Thinking...</h3>
                <p className="text-xs text-indigo-100">Deconstructing your curriculum into pedagogical objectives based on Bloom's Taxonomy.</p>
              </div>
            )}
          </div>

          {/* SLO Insight Grid */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Target className="w-6 h-6 text-indigo-600" />
                Learning Outcomes
              </h2>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                <Filter size={14} />
                <span>Filter by Bloom's</span>
              </div>
            </div>

            {selectedDoc.sloTags.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedDoc.sloTags.map((slo) => (
                  <div key={slo.id} className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-indigo-300 hover:shadow-md transition-all group flex flex-col gap-4">
                    <div className="flex items-start justify-between gap-2">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase tracking-wider ${getBloomColor(slo.bloomLevel)}`}>
                        {slo.bloomLevel}
                      </span>
                      <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-100">
                        <BrainCircuit size={10} />
                        LVL {slo.cognitiveComplexity}
                      </div>
                    </div>
                    
                    <p className="text-slate-800 text-sm font-medium leading-relaxed flex-1">
                      {slo.content}
                    </p>

                    <div className="pt-4 border-t border-slate-50">
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2">Pedagogical Recommendation</h4>
                      <p className="text-[11px] text-slate-600 italic">
                        {slo.suggestedAssessment}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-1 mt-2">
                      {slo.keywords.map((kw, i) => (
                        <span key={i} className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md font-medium">#{kw}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center flex flex-col items-center justify-center">
                {selectedDoc.status === 'processing' ? (
                  <>
                    <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
                      <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">Extracting Insights...</h3>
                    <p className="text-slate-500 text-sm max-w-xs mx-auto mt-2">Gemini is mapping this curriculum to the master brain's neural logic.</p>
                  </>
                ) : (
                  <>
                    <Target className="w-12 h-12 text-slate-300 mb-4" />
                    <h3 className="text-lg font-bold text-slate-900">No SLOs Detected</h3>
                    <p className="text-slate-500 text-sm max-w-xs mx-auto mt-2">We couldn't find clear learning outcomes. Try uploading a more structured syllabus.</p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {documents.length > 0 ? (
              documents.map((doc) => (
                <div 
                  key={doc.id}
                  onClick={() => setSelectedDocId(doc.id)}
                  className="bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-xl hover:border-indigo-400 transition-all cursor-pointer group relative overflow-hidden"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-3 rounded-xl ${doc.status === 'completed' ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'} group-hover:bg-indigo-600 group-hover:text-white transition-all`}>
                      <FileText size={24} />
                    </div>
                    <div className="flex flex-col items-end">
                      <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest mb-1 ${
                        doc.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700 animate-pulse'
                      }`}>
                        {doc.status}
                      </span>
                      <p className="text-[10px] text-slate-400 font-bold">{new Date(doc.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  
                  <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition-colors truncate mb-1">
                    {doc.name}
                  </h3>
                  <div className="flex items-center gap-2 text-slate-500 text-sm">
                    <Target size={14} className="text-indigo-400" />
                    <span>{doc.sloTags?.length || 0} Objectives Mapped</span>
                  </div>

                  {userPlan === SubscriptionPlan.FREE && (
                    <div className="absolute top-2 right-2 p-1.5 text-slate-200" title="Deletion locked on Free plan">
                      <Lock size={12} />
                    </div>
                  )}
                  
                  <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-400">{doc.subject}</span>
                    <button className="text-xs font-bold text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">
                      View Insights →
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-center px-4">
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                  <Upload className="w-10 h-10 text-slate-300" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-2">No documents in library</h3>
                <p className="text-slate-500 max-w-sm mb-8">Upload your syllabus or curriculum guidelines to begin AI-powered Bloom's analysis.</p>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-bold shadow-xl shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  First Upload
                </button>
              </div>
            )}
          </div>

          {documents.length > 0 && (
            <div className="bg-indigo-950 rounded-3xl p-8 text-white relative overflow-hidden shadow-2xl">
              <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-indigo-500/20 rounded-2xl flex items-center justify-center backdrop-blur-md border border-indigo-400/20">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">Standardized Alignment</h3>
                    <p className="text-indigo-300 text-sm mt-1">Every document in your library is cross-referenced with your master Neural Brain logic.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-indigo-900/50 px-6 py-3 rounded-2xl border border-indigo-800">
                  <span className="text-xs font-bold uppercase tracking-widest text-indigo-400">Total Brain Power</span>
                  <span className="text-2xl font-mono font-bold">{documents.length * 12}k+ Nodes</span>
                </div>
              </div>
              <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-indigo-500 rounded-full blur-[100px] opacity-20" />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Documents;