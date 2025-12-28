import React, { useState, useRef } from 'react';
import { 
  Upload, FileText, Plus, ChevronLeft, Target, 
  BrainCircuit, Lightbulb, BookOpen, Loader2, 
  AlertCircle, Trash2, Lock, AlertTriangle, 
  CheckCircle2, Search, Filter, ShieldAlert
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
  const isFree = userPlan === SubscriptionPlan.FREE;
  const docLimit = ROLE_LIMITS[userPlan].docs;
  const limitReached = documents.length >= docLimit;

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
    if (!file) return;

    if (limitReached) {
      setError(`You have reached the limit of ${docLimit} documents for the ${userPlan} plan. Please upgrade to add more.`);
      return;
    }

    if (!canQuery) {
      setError("Daily AI query limit reached.");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const base64 = await fileToBase64(file);
      const mimeType = file.type || 'application/pdf';
      
      const newDoc: Document = {
        id: crypto.randomUUID(),
        userId: '', 
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

      const slos = await geminiService.generateSLOTagsFromBase64(base64, mimeType, brain);
      onUpdateDocument(newDoc.id, { sloTags: slos, status: 'completed' });
      onQuery();

    } catch (err) {
      setError("Failed to analyze document. Ensure it is a valid PDF or Word file.");
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
          <p className="text-slate-500 mt-1">
            {isFree ? `Using ${documents.length}/${docLimit} available slots.` : 'Unlimited storage active for Enterprise.'}
          </p>
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
            disabled={isUploading || limitReached}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold shadow-lg transition-all ${
              limitReached 
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                : 'bg-indigo-600 text-white shadow-indigo-200 hover:bg-indigo-700 active:scale-95'
            }`}
          >
            {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
            {limitReached ? 'Limit Reached' : 'Upload Curriculum'}
          </button>
        </div>
      </header>

      {limitReached && (
        <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl flex items-center justify-between text-indigo-900">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-indigo-600" />
            <p className="text-sm font-semibold">Your Free Library is full. Upgrade to unlock 100+ document slots.</p>
          </div>
          <button className="text-xs font-bold bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">View Plans</button>
        </div>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl flex items-center gap-3 text-rose-800">
          <AlertCircle className="w-5 h-5 text-rose-600" />
          <p className="text-sm font-medium">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-xs font-bold uppercase underline">Dismiss</button>
        </div>
      )}

      {selectedDoc ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-full">
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
                
                <div className="relative group">
                  <button 
                    onClick={() => !isFree && (onDeleteDocument(selectedDoc.id), setSelectedDocId(null))}
                    className={`p-2 rounded-lg transition-all ${isFree ? 'text-slate-200 cursor-not-allowed' : 'text-slate-300 hover:text-rose-500 hover:bg-rose-50'}`}
                  >
                    <Trash2 size={18} />
                  </button>
                  {isFree && (
                    <div className="absolute bottom-full right-0 mb-2 w-32 hidden group-hover:block bg-slate-900 text-white text-[10px] p-2 rounded-lg shadow-xl z-20">
                      Deletion is disabled on Free tier. Upgrade to Pro.
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Metadata</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Bloom's Coverage</span>
                    <span className="font-bold text-slate-900">{selectedDoc.sloTags?.length || 0} Points</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Status</span>
                    <span className="font-bold text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 size={12} /> Persisted
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Target className="w-6 h-6 text-indigo-600" />
                Learning Outcomes
              </h2>
            </div>

            {selectedDoc.sloTags.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedDoc.sloTags.map((slo) => (
                  <div key={slo.id} className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-indigo-300 hover:shadow-md transition-all group flex flex-col gap-4">
                    <div className="flex items-start justify-between gap-2">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase tracking-wider ${getBloomColor(slo.bloomLevel)}`}>
                        {slo.bloomLevel}
                      </span>
                    </div>
                    <p className="text-slate-800 text-sm font-medium leading-relaxed flex-1">
                      {slo.content}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center">
                <Target className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-slate-900">Analysis In Progress</h3>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {documents.map((doc) => (
            <div 
              key={doc.id}
              onClick={() => setSelectedDocId(doc.id)}
              className="bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-xl hover:border-indigo-400 transition-all cursor-pointer group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 rounded-xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                  <FileText size={24} />
                </div>
                {isFree && (
                  <span className="text-slate-200" title="Delete disabled">
                    <Lock size={12} />
                  </span>
                )}
              </div>
              <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 truncate">{doc.name}</h3>
              <p className="text-xs text-slate-400 font-bold mt-1">{doc.subject} • {new Date(doc.createdAt).toLocaleDateString()}</p>
            </div>
          ))}
          {documents.length === 0 && (
            <div className="col-span-full py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-center px-4">
              <Upload className="w-12 h-12 text-slate-300 mb-4" />
              <h3 className="text-xl font-bold text-slate-900">Library is empty</h3>
              <p className="text-slate-500 mb-6">Upload your first syllabus to get started.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Documents;