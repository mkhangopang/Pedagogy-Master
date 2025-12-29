
import React, { useState, useRef } from 'react';
import { 
  Upload, FileText, Plus, ChevronLeft, Target, 
  Loader2, AlertCircle, Trash2, Lock, 
  CheckCircle2, ShieldAlert, X, Zap, 
  FileCode, FileType, Check, RefreshCw, Sparkles
} from 'lucide-react';
import { Document, SLO, NeuralBrain, SubscriptionPlan } from '../types';
import { geminiService } from '../services/geminiService';
import { ROLE_LIMITS } from '../constants';
import { uploadFile } from '../lib/supabase';

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

type UploadStage = 'idle' | 'reading' | 'analyzing' | 'complete';

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
  const [uploadStage, setUploadStage] = useState<UploadStage>('idle');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLimitModal, setShowLimitModal] = useState(false);
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

    if (file.size > 15 * 1024 * 1024) {
      setError("File is too large for the Free Tier (Max 15MB).");
      return;
    }

    if (limitReached) {
      setShowLimitModal(true);
      return;
    }

    if (!canQuery) {
      setError("Daily processing quota limit reached.");
      return;
    }

    setIsUploading(true);
    setUploadStage('reading');
    setError(null);

    const docId = crypto.randomUUID();

    try {
      const base64 = await fileToBase64(file);
      
      const newDoc: Document = {
        id: docId,
        userId: '', 
        name: file.name,
        base64Data: base64,
        mimeType: file.type || 'application/pdf',
        status: 'processing',
        subject: 'Processing...',
        gradeLevel: 'Auto-detecting',
        sloTags: [],
        createdAt: new Date().toISOString()
      };

      onAddDocument(newDoc);
      setSelectedDocId(docId);
      
      // We still backup to storage if possible, but the primary task is AI Analysis
      setUploadStage('analyzing');
      
      // Parallel: Storing and Direct AI Extraction
      const [uploadResult, slos] = await Promise.all([
        uploadFile(file).catch(() => null),
        geminiService.generateSLOTagsFromBase64(base64, newDoc.mimeType, brain).catch(() => [] as SLO[])
      ]);

      const filePath = uploadResult?.path;

      onUpdateDocument(docId, { 
        filePath,
        sloTags: slos, 
        status: slos.length > 0 ? 'completed' : 'failed',
        subject: slos.length > 0 ? 'Analysis Complete' : 'Direct Read Failed'
      });
      
      onQuery();
      setUploadStage('complete');

      setTimeout(() => {
        setIsUploading(false);
        setUploadStage('idle');
      }, 1000);

    } catch (err) {
      console.error("Direct processing failure:", err);
      setError("Gemini was unable to read this file. Please ensure it's a standard document or image.");
      onUpdateDocument(docId, { status: 'failed' });
      setIsUploading(false);
      setUploadStage('idle');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Limit Modal */}
      {showLimitModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center border border-slate-100">
            <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <ShieldAlert className="w-8 h-8 text-amber-500" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">Workspace Full</h3>
            <p className="text-slate-500 text-sm mb-8">
              You've used your 2 free document slots. Upgrade to Pro for unlimited AI document processing.
            </p>
            <div className="space-y-3">
              <button className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg">Upgrade Now</button>
              <button onClick={() => setShowLimitModal(false)} className="w-full py-3 bg-slate-100 text-slate-600 rounded-xl font-bold">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Uploading Overlay */}
      {isUploading && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-slate-950/20 backdrop-blur-md">
          <div className="bg-white rounded-3xl p-10 max-w-sm w-full shadow-2xl border border-indigo-50 text-center space-y-6 animate-in zoom-in duration-300">
            <div className="relative w-20 h-20 mx-auto">
              <div className="absolute inset-0 rounded-full border-4 border-indigo-50" />
              <div className="absolute inset-0 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center text-indigo-600">
                <Sparkles size={32} className="animate-pulse" />
              </div>
            </div>
            
            <div>
              <h3 className="text-xl font-bold text-slate-900 capitalize">
                {uploadStage === 'reading' ? 'Initializing File' : 'Gemini 3 is Reading...'}
              </h3>
              <p className="text-slate-500 text-sm mt-1">Directly processing curriculum data.</p>
            </div>

            <div className="pt-2">
              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full bg-indigo-600 transition-all duration-1000 ${uploadStage === 'analyzing' ? 'w-3/4' : 'w-1/4'}`} />
              </div>
            </div>
          </div>
        </div>
      )}

      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Curriculum Library</h1>
          <p className="text-slate-500 mt-1">
            {isFree ? `Using ${documents.length}/${docLimit} document slots (Direct AI Read active).` : 'Enterprise Scale Active.'}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
            accept=".pdf,.txt,.doc,.docx,image/*" 
          />
          <button 
            onClick={() => limitReached ? setShowLimitModal(true) : fileInputRef.current?.click()}
            disabled={isUploading}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold shadow-lg transition-all ${
              limitReached ? 'bg-slate-100 text-slate-400' : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95'
            }`}
          >
            {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
            Analyze Document
          </button>
        </div>
      </header>

      {error && (
        <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex items-center gap-3 text-rose-800 animate-in slide-in-from-top-2">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <p className="text-sm font-medium">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto p-1 hover:bg-rose-100 rounded-lg"><X size={16}/></button>
        </div>
      )}

      {selectedDoc ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-6">
            <button onClick={() => setSelectedDocId(null)} className="flex items-center gap-2 text-indigo-600 font-bold text-sm hover:translate-x-[-4px] transition-transform">
              <ChevronLeft size={18} /> Library Grid
            </button>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8 space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shrink-0">
                  <FileText size={28} />
                </div>
                <div className="flex-1 min-w-0 pt-1">
                  <h2 className="font-bold text-slate-900 truncate text-lg">{selectedDoc.name}</h2>
                  <p className="text-xs text-slate-500 mt-0.5 uppercase font-bold tracking-widest">
                    {selectedDoc.status === 'failed' ? 'Read Error' : 'Analyzed'}
                  </p>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100 space-y-4">
                <div className="flex justify-between items-center text-sm font-medium">
                  <span className="text-slate-400">Extracted SLOs</span>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${selectedDoc.status === 'failed' ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
                    {selectedDoc.sloTags?.length || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm font-medium">
                  <span className="text-slate-400">Processing Engine</span>
                  <span className="text-slate-900">Gemini 3 Flash</span>
                </div>
              </div>
              
              <button 
                onClick={() => onDeleteDocument(selectedDoc.id)}
                className="w-full flex items-center justify-center gap-2 py-3 text-rose-500 text-xs font-bold rounded-xl border border-transparent hover:bg-rose-50 transition-colors mt-4"
              >
                <Trash2 size={16} /> Permanently Remove
              </button>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Target className="w-6 h-6 text-indigo-600" /> 
                Learning Outcomes
              </h2>
              <div className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-bold uppercase tracking-widest">
                Direct AI Read Active
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {selectedDoc.sloTags.map((slo) => (
                <div key={slo.id} className="bg-white border border-slate-200 rounded-3xl p-6 hover:border-indigo-300 transition-all shadow-sm hover:shadow-md">
                  <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase mb-4 inline-block">
                    {slo.bloomLevel}
                  </span>
                  <p className="text-slate-800 text-sm font-semibold leading-relaxed">{slo.content}</p>
                </div>
              ))}
              
              {selectedDoc.sloTags.length === 0 && selectedDoc.status !== 'failed' && (
                <div className="col-span-full py-16 text-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-300 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">Gemini is Processing...</p>
                </div>
              )}

              {selectedDoc.status === 'failed' && (
                <div className="col-span-full py-16 text-center bg-rose-50 rounded-3xl border border-rose-100">
                  <AlertCircle className="w-8 h-8 text-rose-300 mx-auto mb-3" />
                  <p className="text-rose-900 font-bold">Extraction Incomplete</p>
                  <p className="text-rose-500 text-xs mt-1">This document type may not be supported for direct reading.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {documents.map((doc) => (
            <div 
              key={doc.id} 
              onClick={() => setSelectedDocId(doc.id)} 
              className={`bg-white rounded-3xl border p-6 transition-all cursor-pointer group shadow-sm hover:shadow-xl hover:translate-y-[-4px] ${
                doc.status === 'failed' ? 'border-rose-100 hover:border-rose-300' : 'border-slate-100 hover:border-indigo-400'
              }`}
            >
              <div className="flex items-start justify-between mb-6">
                <div className={`p-4 rounded-2xl transition-all ${
                  doc.status === 'failed' ? 'bg-rose-50 text-rose-400' : 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white'
                }`}>
                  <FileText size={24} />
                </div>
                {doc.status === 'completed' && <CheckCircle2 size={20} className="text-emerald-500" />}
                {doc.status === 'processing' && <Loader2 size={20} className="text-indigo-400 animate-spin" />}
              </div>
              <h3 className="text-lg font-bold truncate text-slate-900 group-hover:text-indigo-600 transition-colors">{doc.name}</h3>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-2">
                {doc.status === 'failed' ? 'Sync Error' : doc.subject}
              </p>
            </div>
          ))}
          
          {documents.length === 0 && (
            <div className="col-span-full py-24 bg-white rounded-[3rem] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-center px-4">
              <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mb-6 text-slate-300">
                <Upload size={40} />
              </div>
              <h3 className="text-2xl font-bold text-slate-900">Upload Curriculum</h3>
              <p className="text-slate-500 mt-2 mb-8 max-w-sm">
                Drop your syllabus or lesson plans. Gemini 3 will directly analyze the pedagogical structure.
              </p>
              <button 
                onClick={() => fileInputRef.current?.click()} 
                className="px-8 py-3.5 bg-indigo-600 text-white rounded-2xl font-bold shadow-xl shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-95"
              >
                Select Files
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Documents;
