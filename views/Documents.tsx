import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, FileText, Plus, ChevronLeft, Target, 
  Loader2, AlertCircle, Trash2, Lock, 
  CheckCircle2, ShieldAlert, X, Zap, 
  FileCode, FileType, Check, RefreshCw, Sparkles,
  Database, WifiOff, FileWarning, Fingerprint
} from 'lucide-react';
import { Document, SLO, NeuralBrain, SubscriptionPlan } from '../types';
import { geminiService } from '../services/geminiService';
import { ROLE_LIMITS } from '../constants';
import { uploadFile } from '../lib/supabase';
import { isSupportedFileType } from '../lib/gemini-file';

interface DocumentsProps {
  documents: Document[];
  onAddDocument: (doc: Document) => Promise<void>;
  onUpdateDocument: (id: string, updates: Partial<Document>) => Promise<void>;
  onDeleteDocument: (id: string) => Promise<void>;
  brain: NeuralBrain;
  onQuery: () => void;
  canQuery: boolean;
  userPlan: SubscriptionPlan;
}

type UploadStage = 'idle' | 'reading' | 'uploading' | 'persisting' | 'analyzing' | 'complete' | 'error';

interface DetailedError {
  type: 'format' | 'network' | 'ai' | 'auth' | 'quota' | 'generic' | 'storage';
  title: string;
  message: string;
  fix?: string;
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
  const [uploadStage, setUploadStage] = useState<UploadStage>('idle');
  const [progress, setProgress] = useState(0);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [detailedError, setDetailedError] = useState<DetailedError | null>(null);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedDoc = documents.find(d => d.id === selectedDocId);
  const isFree = userPlan === SubscriptionPlan.FREE;
  const docLimit = ROLE_LIMITS[userPlan].docs;
  const limitReached = documents.length >= docLimit;

  const MAX_FILE_SIZE_MB = 10;

  useEffect(() => {
    let interval: any;
    if (isUploading) {
      if (uploadStage === 'reading') {
        setProgress(10);
      } else if (uploadStage === 'uploading') {
        // Increment visually up to 40% while waiting for storage
        interval = setInterval(() => {
          setProgress(prev => (prev < 40 ? prev + 2 : prev));
        }, 300);
      } else if (uploadStage === 'persisting') {
        setProgress(50);
      } else if (uploadStage === 'analyzing') {
        // Increment visually up to 90% while waiting for AI
        interval = setInterval(() => {
          setProgress(prev => (prev < 90 ? prev + 1 : prev));
        }, 500);
      } else if (uploadStage === 'complete') {
        setProgress(100);
      } else if (uploadStage === 'error') {
        setProgress(0);
      }
    } else {
      setProgress(0);
    }
    return () => clearInterval(interval);
  }, [isUploading, uploadStage]);

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

    setDetailedError(null);

    // Basic Validation
    if (!isSupportedFileType(file.type)) {
      setDetailedError({
        type: 'format',
        title: 'Unsupported Format',
        message: `The file type "${file.type || 'unknown'}" is not supported.`,
        fix: 'Please upload PDF, Word, or Text files.'
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setDetailedError({
        type: 'generic',
        title: 'File Too Large',
        message: `Maximum allowed size is ${MAX_FILE_SIZE_MB}MB.`,
        fix: 'Split the document or compress images.'
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (limitReached) {
      setShowLimitModal(true);
      return;
    }

    setIsUploading(true);
    const docId = crypto.randomUUID();

    try {
      // Stage 1: Local Reading
      setUploadStage('reading');
      const base64 = await fileToBase64(file);
      
      // Stage 2: Cloud Storage Upload (Upload First strategy)
      setUploadStage('uploading');
      const uploadResult = await uploadFile(file).catch((err: Error) => {
        throw { 
          type: 'storage', 
          title: 'Cloud Storage Error', 
          message: err.message, 
          fix: 'Ensure the "documents" bucket exists and RLS is configured.' 
        };
      });

      const filePath = uploadResult.path;

      // Stage 3: Database Persistence (Register as Processing)
      setUploadStage('persisting');
      const newDoc: Document = {
        id: docId,
        userId: '', 
        name: file.name,
        base64Data: base64, 
        filePath: filePath,
        mimeType: file.type || 'application/octet-stream',
        status: 'processing',
        subject: 'Uploading...',
        gradeLevel: 'Initializing...',
        sloTags: [],
        createdAt: new Date().toISOString()
      };

      await onAddDocument(newDoc);
      setSelectedDocId(docId);
      
      // Stage 4: AI Analysis
      setUploadStage('analyzing');
      const slos = await geminiService.generateSLOTagsFromBase64(base64, newDoc.mimeType, brain).catch((err: any) => {
        throw { 
          type: 'ai', 
          title: 'Neural Analysis Failed', 
          message: err.message || 'The AI engine could not process the contents.', 
          fix: 'Retry analysis later.' 
        };
      });

      // Stage 5: Final Update
      await onUpdateDocument(docId, { 
        sloTags: slos, 
        status: slos.length > 0 ? 'completed' : 'failed',
        subject: slos.length > 0 ? 'Pedagogically Analyzed' : 'Analysis Incomplete'
      });
      
      onQuery();
      setUploadStage('complete');

      setTimeout(() => {
        setIsUploading(false);
        setUploadStage('idle');
      }, 1000);

    } catch (err: any) {
      console.error("Critical Upload Error:", err);
      setUploadStage('error');
      
      const formattedError: DetailedError = err.type ? err : { 
        type: 'generic', 
        title: 'Unexpected Failure', 
        message: err.message || 'A system-level error occurred during processing.' 
      };
      
      setDetailedError(formattedError);
      
      // If persisted in DB, mark as failed
      if (uploadStage !== 'reading' && uploadStage !== 'uploading') {
        onUpdateDocument(docId, { status: 'failed', subject: 'Error' });
      }
      
      // Safety reset after error
      setTimeout(() => {
        setIsUploading(false);
      }, 500);
    } finally {
       if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const getStatusText = () => {
    switch (uploadStage) {
      case 'reading': return 'Reading Bytes...';
      case 'uploading': return 'Cloud Handshake...';
      case 'persisting': return 'Syncing Workspace...';
      case 'analyzing': return 'Gemini Thinking...';
      case 'complete': return 'Success!';
      case 'error': return 'Interrupted';
      default: return 'Initializing...';
    }
  };

  const getErrorIcon = (type: string) => {
    switch (type) {
      case 'network': return <WifiOff className="w-5 h-5" />;
      case 'format': return <FileWarning className="w-5 h-5" />;
      case 'auth': return <Fingerprint className="w-5 h-5" />;
      case 'ai': return <Sparkles className="w-5 h-5" />;
      default: return <AlertCircle className="w-5 h-5" />;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Limit Modal */}
      {showLimitModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center border border-slate-100 animate-in zoom-in duration-200">
            <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <ShieldAlert className="w-8 h-8 text-amber-500" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">Slot Limit Reached</h3>
            <p className="text-slate-500 text-sm mb-8 leading-relaxed">
              Upgrade to expand your curriculum library and unlock more document analysis slots.
            </p>
            <div className="space-y-3">
              <button className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all">View Pro Plans</button>
              <button onClick={() => setShowLimitModal(false)} className="w-full py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors">Dismiss</button>
            </div>
          </div>
        </div>
      )}

      {/* Progress Overlay */}
      {isUploading && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-md">
          <div className="bg-white rounded-[2.5rem] p-10 max-w-md w-full shadow-2xl border border-white/20 text-center space-y-8 animate-in zoom-in duration-300">
            <div className="relative w-24 h-24 mx-auto">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="48" cy="48" r="44" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-100" />
                <circle
                  cx="48" cy="48" r="44" stroke="currentColor" strokeWidth="8" fill="transparent"
                  strokeDasharray={276.46}
                  strokeDashoffset={276.46 - (276.46 * progress) / 100}
                  strokeLinecap="round"
                  className="text-indigo-600 transition-all duration-500 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-indigo-600">
                <span className="text-xl font-black">{Math.round(progress)}%</span>
              </div>
            </div>
            
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                {getStatusText()}
              </h3>
              <p className="text-slate-500 text-sm leading-relaxed max-w-[240px] mx-auto">
                {uploadStage === 'uploading' 
                  ? 'Establishing connection to Supabase storage buckets...' 
                  : uploadStage === 'analyzing'
                  ? 'Gemini is extracting learning patterns and BLOOM levels.'
                  : 'Preparing pedagogical assets.'}
              </p>
            </div>

            {uploadStage === 'error' && (
              <button 
                onClick={() => setIsUploading(false)}
                className="px-6 py-2 bg-rose-500 text-white rounded-xl text-sm font-bold shadow-lg"
              >
                Close Diagnosis
              </button>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Curriculum Library</h1>
          <p className="text-slate-500 mt-1 flex items-center gap-2">
            <Database size={14} className="text-indigo-400" />
            {isFree ? `Using ${documents.length}/${docLimit} document slots.` : 'Enterprise Scale Active.'}
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
            className={`flex items-center gap-2 px-6 py-3.5 rounded-2xl font-bold shadow-lg transition-all ${
              limitReached ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none' : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 shadow-indigo-600/20'
            }`}
          >
            {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
            Analyze New Material
          </button>
        </div>
      </header>

      {/* Error Banner */}
      {detailedError && (
        <div className="bg-rose-50 border-2 border-rose-100 p-6 rounded-[2rem] flex items-start gap-5 text-rose-800 animate-in slide-in-from-top-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5">
            {getErrorIcon(detailedError.type)}
          </div>
          <div className={`p-3 rounded-2xl shrink-0 ${detailedError.type === 'auth' ? 'bg-indigo-100 text-indigo-600' : 'bg-rose-100 text-rose-600'}`}>
            {getErrorIcon(detailedError.type)}
          </div>
          <div className="flex-1">
            <h4 className="font-black text-base tracking-tight">{detailedError.title}</h4>
            <p className="text-sm font-medium opacity-80 mt-1 leading-relaxed">{detailedError.message}</p>
            {detailedError.fix && (
              <div className="mt-3 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-rose-600/60">
                <Check size={14} /> {detailedError.fix}
              </div>
            )}
          </div>
          <button onClick={() => setDetailedError(null)} className="p-2 hover:bg-rose-100 rounded-xl transition-colors"><X size={20}/></button>
        </div>
      )}

      {/* Content Rendering (Grid or Detail) */}
      {selectedDoc ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-6">
            <button onClick={() => setSelectedDocId(null)} className="flex items-center gap-2 text-indigo-600 font-bold text-sm hover:translate-x-[-4px] transition-transform group">
              <ChevronLeft size={18} className="group-hover:translate-x-[-2px] transition-transform" /> Back to Grid
            </button>

            <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 p-8 space-y-8 group">
              <div className="flex items-start justify-between gap-4">
                <div className="w-16 h-16 bg-indigo-50 rounded-[1.25rem] flex items-center justify-center text-indigo-600 shrink-0 group-hover:scale-105 transition-transform duration-500">
                  <FileText size={32} />
                </div>
                <div className="flex-1 min-w-0 pt-1">
                  <h2 className="font-bold text-slate-900 truncate text-xl tracking-tight">{selectedDoc.name}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest ${selectedDoc.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                      {selectedDoc.status === 'completed' ? 'Fully Analyzed' : selectedDoc.status === 'processing' ? 'Processing' : 'Incomplete'}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">• {selectedDoc.mimeType.split('/').pop()?.toUpperCase()}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-2">
                <div className="flex justify-between items-center p-3.5 bg-slate-50 rounded-2xl">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Engine</span>
                  <span className="text-sm font-black text-indigo-600">Gemini 3 Flash</span>
                </div>
                <div className="flex justify-between items-center p-3.5 bg-slate-50 rounded-2xl">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Taxonomy Points</span>
                  <span className="text-sm font-black text-slate-900">{selectedDoc.sloTags?.length || 0}</span>
                </div>
              </div>
              
              <button 
                onClick={() => onDeleteDocument(selectedDoc.id)}
                className="w-full flex items-center justify-center gap-2 py-4 text-rose-500 text-sm font-bold rounded-2xl border-2 border-transparent hover:bg-rose-50 hover:border-rose-100 transition-all mt-4"
              >
                <Trash2 size={18} /> Delete Material
              </button>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                <Target className="w-7 h-7 text-indigo-600" /> 
                Extracted SLOs
              </h2>
              <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-indigo-100">
                <Sparkles size={12} />
                Neural Verification
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {selectedDoc.sloTags.map((slo) => (
                <div key={slo.id} className="bg-white border border-slate-200 rounded-[2rem] p-7 hover:border-indigo-400 transition-all shadow-sm hover:shadow-xl hover:-translate-y-1 group">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="px-3 py-1 rounded-lg bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase tracking-tighter">
                      {slo.bloomLevel}
                    </span>
                    <div className="h-px flex-1 bg-slate-100" />
                  </div>
                  <p className="text-slate-800 text-base font-semibold leading-relaxed group-hover:text-indigo-950 transition-colors">{slo.content}</p>
                  
                  <div className="mt-6 flex flex-wrap gap-2">
                    {slo.keywords.slice(0, 3).map(kw => (
                      <span key={kw} className="px-2.5 py-1 bg-slate-50 text-slate-400 text-[9px] font-bold rounded-md uppercase tracking-widest">#{kw}</span>
                    ))}
                  </div>
                </div>
              ))}
              
              {(selectedDoc.sloTags.length === 0 && selectedDoc.status === 'processing') && (
                <div className="col-span-full py-24 text-center bg-white rounded-[3rem] border-2 border-dashed border-slate-200 shadow-inner">
                  <Loader2 className="w-10 h-10 animate-spin text-indigo-200 mx-auto mb-4" />
                  <h4 className="text-slate-900 font-bold text-lg">Synthesizing Pedagogical Data...</h4>
                  <p className="text-slate-400 text-sm max-w-xs mx-auto mt-2">The Google Generative AI engine is currently mapping your material to Bloom's Taxonomy levels.</p>
                </div>
              )}

              {selectedDoc.status === 'failed' && (
                <div className="col-span-full py-24 text-center bg-rose-50 rounded-[3rem] border border-rose-100">
                  <AlertCircle className="w-12 h-12 text-rose-200 mx-auto mb-4" />
                  <h3 className="text-rose-900 font-bold text-xl">Analysis Interrupted</h3>
                  <p className="text-rose-600 text-sm mt-2 max-w-sm mx-auto font-medium">This document could not be analyzed. Check the file content and try again.</p>
                  <button onClick={() => onDeleteDocument(selectedDoc.id)} className="mt-8 px-8 py-3 bg-white text-rose-600 font-bold rounded-2xl shadow-sm border border-rose-200 hover:bg-rose-50 transition-all">Remove Entry</button>
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
              className={`bg-white rounded-[2.5rem] border p-7 transition-all cursor-pointer group shadow-sm hover:shadow-2xl hover:translate-y-[-6px] relative overflow-hidden ${
                doc.status === 'failed' ? 'border-rose-100 hover:border-rose-300' : 'border-slate-100 hover:border-indigo-500'
              }`}
            >
              <div className="flex items-start justify-between mb-8">
                <div className={`p-4 rounded-2xl transition-all duration-500 ${
                  doc.status === 'failed' ? 'bg-rose-50 text-rose-400' : 'bg-slate-50 text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white group-hover:rotate-6'
                }`}>
                  <FileText size={28} />
                </div>
                {doc.status === 'completed' && <div className="bg-emerald-50 p-2 rounded-full"><CheckCircle2 size={18} className="text-emerald-500" /></div>}
                {doc.status === 'processing' && <Loader2 size={20} className="text-indigo-400 animate-spin" />}
                {doc.status === 'failed' && <AlertCircle size={20} className="text-rose-400" />}
              </div>
              <h3 className="text-xl font-bold truncate text-slate-900 group-hover:text-indigo-600 transition-colors tracking-tight">{doc.name}</h3>
              <div className="flex items-center gap-3 mt-3">
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                  {doc.status === 'failed' ? 'Error' : doc.status === 'processing' ? 'Processing' : doc.subject}
                </p>
                <div className="w-1 h-1 bg-slate-200 rounded-full" />
                <p className="text-[10px] text-indigo-400 font-black uppercase tracking-widest">
                  {doc.sloTags?.length || 0} SLOs
                </p>
              </div>
            </div>
          ))}
          
          {documents.length === 0 && (
            <div className="col-span-full py-32 bg-white rounded-[4rem] border-4 border-dashed border-slate-100 flex flex-col items-center justify-center text-center px-8 shadow-inner relative overflow-hidden">
              <div className="w-24 h-24 bg-slate-50 rounded-[2rem] flex items-center justify-center mb-8 text-indigo-200">
                <Upload size={48} className="animate-pulse" />
              </div>
              <h3 className="text-3xl font-black text-slate-900 tracking-tight">Your Library is Empty</h3>
              <p className="text-slate-500 mt-3 mb-10 max-w-md text-lg font-medium leading-relaxed">
                Upload your syllabus or lesson plans. Gemini AI will automatically extract pedagogical data.
              </p>
              <button 
                onClick={() => fileInputRef.current?.click()} 
                className="px-10 py-5 bg-indigo-600 text-white rounded-[1.5rem] font-bold shadow-2xl shadow-indigo-600/30 hover:bg-indigo-700 hover:scale-105 active:scale-95 transition-all text-lg"
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