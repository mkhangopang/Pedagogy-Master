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

// getErrorIcon maps error types to Lucide icons for UI feedback
const getErrorIcon = (type: DetailedError['type']) => {
  switch (type) {
    case 'format': return <FileType size={24} />;
    case 'network': return <WifiOff size={24} />;
    case 'ai': return <Sparkles size={24} />;
    case 'auth': return <Lock size={24} />;
    case 'quota': return <Zap size={24} />;
    case 'storage': return <Database size={24} />;
    default: return <AlertCircle size={24} />;
  }
};

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
        // Slow visual climb while waiting for storage
        interval = setInterval(() => {
          setProgress(prev => (prev < 40 ? prev + 1 : prev));
        }, 800);
      } else if (uploadStage === 'persisting') {
        setProgress(55);
      } else if (uploadStage === 'analyzing') {
        // Slow visual climb while waiting for AI
        interval = setInterval(() => {
          setProgress(prev => (prev < 90 ? prev + 1 : prev));
        }, 1200);
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

    // 1. Pre-validation
    if (!isSupportedFileType(file.type)) {
      setDetailedError({
        type: 'format',
        title: 'Unsupported Format',
        message: `File type "${file.type}" cannot be parsed by the pedagogical engine.`,
        fix: 'Upload PDF, Word, or plain text.'
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setDetailedError({
        type: 'generic',
        title: 'File Too Large',
        message: `Current limit is ${MAX_FILE_SIZE_MB}MB per document.`,
        fix: 'Compress the file or upload a partial version.'
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
      
      // Stage 2: Cloud Storage Upload with 30s Watchdog
      setUploadStage('uploading');
      
      const uploadPromise = uploadFile(file);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Cloud Storage Timeout: The upload request took too long. Check if the "documents" bucket is public or has correct RLS policies.')), 30000)
      );

      const uploadResult = await Promise.race([uploadPromise, timeoutPromise]) as { path: string };
      const filePath = uploadResult.path;

      // Stage 3: Database Persistence
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
          title: 'Analysis Error', 
          message: err.message || 'Gemini engine failed to extract pedagogical structure.',
          fix: 'Verify the document has readable text.'
        };
      });

      // Stage 5: Final Update
      await onUpdateDocument(docId, { 
        sloTags: slos, 
        status: slos.length > 0 ? 'completed' : 'failed',
        subject: slos.length > 0 ? 'Analyzed' : 'Incomplete'
      });
      
      onQuery();
      setUploadStage('complete');

      setTimeout(() => {
        setIsUploading(false);
        setUploadStage('idle');
      }, 1000);

    } catch (err: any) {
      console.error("Upload Pipeline Error:", err);
      setUploadStage('error');
      
      const formattedError: DetailedError = err.type ? err : { 
        type: 'storage', 
        title: 'Upload Interrupted', 
        message: err.message || 'The connection to cloud storage was lost.',
        fix: 'Check Supabase Storage settings and ensure "documents" bucket is active.'
      };
      
      setDetailedError(formattedError);
      
      if (uploadStage !== 'reading' && uploadStage !== 'uploading') {
        onUpdateDocument(docId, { status: 'failed', subject: 'Sync Error' });
      }
      
      setTimeout(() => {
        setIsUploading(false);
      }, 3000);
    } finally {
       if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const getStatusText = () => {
    switch (uploadStage) {
      case 'reading': return 'Reading...';
      case 'uploading': return 'Uploading...';
      case 'persisting': return 'Saving...';
      case 'analyzing': return 'Thinking...';
      case 'complete': return 'Done!';
      case 'error': return 'Failed';
      default: return 'Wait...';
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-24">
      {/* Modals & Overlays */}
      {isUploading && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md">
          <div className="bg-white rounded-[3rem] p-12 max-w-md w-full shadow-2xl text-center space-y-8">
            <div className="relative w-28 h-28 mx-auto">
              <svg className="w-full h-full -rotate-90">
                <circle cx="56" cy="56" r="50" stroke="#f1f5f9" strokeWidth="10" fill="transparent" />
                <circle
                  cx="56" cy="56" r="50" stroke="#4f46e5" strokeWidth="10" fill="transparent"
                  strokeDasharray={314}
                  strokeDashoffset={314 - (314 * progress) / 100}
                  strokeLinecap="round"
                  className="transition-all duration-700 ease-in-out"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-indigo-600 font-black text-2xl">
                {Math.round(progress)}%
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-slate-900">{getStatusText()}</h3>
              <p className="text-slate-500 text-sm leading-relaxed">
                {uploadStage === 'uploading' ? 'Connecting to cloud storage...' : 'Gemini is processing your pedagogical data.'}
              </p>
            </div>
            {uploadStage === 'error' && (
              <button onClick={() => setIsUploading(false)} className="w-full py-3 bg-rose-500 text-white rounded-2xl font-bold shadow-lg shadow-rose-200">
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {/* Standard Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">Curriculum Library</h1>
          <p className="text-slate-500 mt-2 flex items-center gap-2 font-medium">
            <Database size={16} className="text-indigo-500" />
            Workspace Storage: {documents.length} / {docLimit} Documents
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".pdf,.txt,.doc,.docx" />
          <button 
            onClick={() => limitReached ? setShowLimitModal(true) : fileInputRef.current?.click()}
            disabled={isUploading}
            className={`flex items-center gap-3 px-8 py-4 rounded-[1.5rem] font-bold shadow-xl transition-all ${
              limitReached ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 shadow-indigo-600/20'
            }`}
          >
            {isUploading ? <Loader2 className="animate-spin" size={20} /> : <Plus size={20} />}
            Upload Material
          </button>
        </div>
      </header>

      {/* Error Alert */}
      {detailedError && (
        <div className="bg-rose-50 border-2 border-rose-100 p-6 rounded-[2rem] flex items-start gap-5 animate-in slide-in-from-top-4">
          <div className="p-3 bg-rose-100 text-rose-600 rounded-2xl shrink-0">
            {getErrorIcon(detailedError.type)}
          </div>
          <div className="flex-1">
            <h4 className="font-bold text-rose-900">{detailedError.title}</h4>
            <p className="text-sm text-rose-700 mt-1 leading-relaxed">{detailedError.message}</p>
            {detailedError.fix && <p className="text-xs font-black uppercase text-rose-400 mt-3 tracking-widest flex items-center gap-1"><Check size={12}/> {detailedError.fix}</p>}
          </div>
          <button onClick={() => setDetailedError(null)} className="p-2 hover:bg-rose-200/50 rounded-xl text-rose-400"><X size={20}/></button>
        </div>
      )}

      {/* Main Content Area */}
      {selectedDoc ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Detailed View logic same as before but ensured robust state handling */}
          <div className="lg:col-span-1 space-y-6">
            <button onClick={() => setSelectedDocId(null)} className="flex items-center gap-2 text-indigo-600 font-bold text-sm hover:translate-x-[-4px] transition-transform">
              <ChevronLeft size={18} /> Return to Library
            </button>
            <div className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm space-y-6">
               <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600"><FileText size={32} /></div>
               <div>
                 <h2 className="text-xl font-bold text-slate-900 truncate">{selectedDoc.name}</h2>
                 <p className="text-xs text-slate-400 mt-1 uppercase font-black tracking-widest">{selectedDoc.mimeType}</p>
               </div>
               <div className="pt-4 border-t border-slate-50 space-y-3">
                 <div className="flex justify-between text-sm"><span className="text-slate-400 font-medium">Status</span><span className="font-bold text-indigo-600">{selectedDoc.status.toUpperCase()}</span></div>
                 <div className="flex justify-between text-sm"><span className="text-slate-400 font-medium">Extracted Items</span><span className="font-bold">{selectedDoc.sloTags.length}</span></div>
               </div>
               <button onClick={() => onDeleteDocument(selectedDoc.id)} className="w-full py-4 text-rose-500 bg-rose-50 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-rose-100 transition-colors mt-4">
                 <Trash2 size={18}/> Delete Material
               </button>
            </div>
          </div>
          <div className="lg:col-span-2 space-y-6">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
              <Target size={28} className="text-indigo-600" /> Instructional Objectives
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {selectedDoc.sloTags.map(slo => (
                 <div key={slo.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:border-indigo-200 transition-all">
                   <span className="text-[10px] font-black uppercase tracking-tighter text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg mb-4 inline-block">{slo.bloomLevel}</span>
                   <p className="font-bold text-slate-800 leading-relaxed">{slo.content}</p>
                   <div className="mt-4 flex flex-wrap gap-2">
                     {slo.keywords.map(k => <span key={k} className="text-[9px] text-slate-400 font-bold uppercase tracking-widest bg-slate-50 px-2 py-0.5 rounded">#{k}</span>)}
                   </div>
                 </div>
               ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {documents.map(doc => (
            <div key={doc.id} onClick={() => setSelectedDocId(doc.id)} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 hover:border-indigo-400 transition-all shadow-sm hover:shadow-xl cursor-pointer group relative overflow-hidden">
               <div className="flex justify-between items-start mb-6">
                  <div className="p-4 bg-slate-50 text-indigo-400 rounded-2xl group-hover:bg-indigo-600 group-hover:text-white transition-all"><FileText size={24}/></div>
                  {doc.status === 'completed' && <CheckCircle2 size={18} className="text-emerald-500" />}
                  {doc.status === 'processing' && <Loader2 size={18} className="text-indigo-400 animate-spin" />}
               </div>
               <h3 className="font-bold text-slate-900 truncate tracking-tight text-lg">{doc.name}</h3>
               <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-2">{doc.subject || 'Processing...'}</p>
            </div>
          ))}

          {documents.length === 0 && (
            <div className="col-span-full py-24 text-center">
              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-300"><Upload size={40}/></div>
              <h3 className="text-2xl font-bold text-slate-800">Your Library is Empty</h3>
              <p className="text-slate-500 mt-2">Upload instructional materials to begin neural analysis.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Documents;