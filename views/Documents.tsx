
import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, FileText, Plus, ChevronLeft, Target, 
  Loader2, AlertCircle, Trash2, Lock, 
  CheckCircle2, ShieldAlert, X, Zap, 
  FileType, Check, RefreshCw, Sparkles,
  Database, WifiOff
} from 'lucide-react';
import { Document, NeuralBrain, SubscriptionPlan } from '../types';
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

type UploadStage = 'idle' | 'uploading' | 'persisting' | 'complete' | 'error';

interface DetailedError {
  type: 'format' | 'network' | 'ai' | 'auth' | 'quota' | 'generic' | 'storage' | 'policy';
  title: string;
  message: string;
  fix?: string;
}

const getErrorIcon = (type: DetailedError['type']) => {
  switch (type) {
    case 'format': return <FileType size={24} />;
    case 'network': return <WifiOff size={24} />;
    case 'ai': return <Sparkles size={24} />;
    case 'auth': return <Lock size={24} />;
    case 'quota': return <Zap size={24} />;
    case 'storage': return <Database size={24} />;
    case 'policy': return <ShieldAlert size={24} />;
    default: return <AlertCircle size={24} />;
  }
};

const Documents: React.FC<DocumentsProps> = ({ 
  documents, 
  onAddDocument, 
  onDeleteDocument,
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
  const docLimit = ROLE_LIMITS[userPlan].docs;
  const limitReached = documents.length >= docLimit;

  const MAX_FILE_SIZE_MB = 10;

  useEffect(() => {
    let interval: any;
    if (isUploading) {
      if (uploadStage === 'uploading') {
        interval = setInterval(() => {
          setProgress(prev => (prev < 90 ? prev + 0.5 : prev));
        }, 1000);
      } else if (uploadStage === 'persisting') {
        setProgress(93);
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setDetailedError(null);

    if (!isSupportedFileType(file.type)) {
      setDetailedError({
        type: 'format',
        title: 'Unsupported Format',
        message: `File type "${file.type}" is not supported.`,
        fix: 'Use PDF, DOCX, or plain text.'
      });
      return;
    }

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setDetailedError({
        type: 'generic',
        title: 'File Too Large',
        message: `Maximum allowed size is ${MAX_FILE_SIZE_MB}MB.`,
        fix: 'Compress the document or split it.'
      });
      return;
    }

    if (limitReached) {
      setShowLimitModal(true);
      return;
    }

    setIsUploading(true);
    setUploadStage('uploading');
    const docId = crypto.randomUUID();

    try {
      // Step 1: Storage Upload
      const uploadResult = await uploadFile(file);
      const filePath = uploadResult.path;

      // Step 2: DB Metadata Registration (The 90% hang point)
      setUploadStage('persisting');
      
      const newDoc: Document = {
        id: docId,
        userId: '', 
        name: file.name,
        filePath: filePath,
        mimeType: file.type || 'application/octet-stream',
        status: 'completed',
        subject: 'Cloud Sync Active',
        gradeLevel: 'Auto',
        sloTags: [],
        createdAt: new Date().toISOString()
      };

      await onAddDocument(newDoc);
      
      setSelectedDocId(docId);
      setUploadStage('complete');

      setTimeout(() => {
        setIsUploading(false);
        setUploadStage('idle');
      }, 1500);

    } catch (err: any) {
      console.error("Critical Upload Error:", err);
      setUploadStage('error');
      
      // Handle the "Multiple Permissive Policies" hang explicitly
      if (err.message?.includes('RLS') || err.message?.includes('policy') || !err.message) {
        setDetailedError({ 
          type: 'policy', 
          title: 'System Deadlock (v41 Required)', 
          message: 'The database hang at 90% is caused by lingering versioned policies (v37/v40) identified in your linter report.',
          fix: 'Apply SQL Patch v41 in Brain Control to purge legacy ghosts.'
        });
      } else {
        setDetailedError({ 
          type: 'network', 
          title: 'Upload Interrupted', 
          message: err.message || 'The database failed to record the document metadata.',
          fix: 'Check your internet connection and try again.'
        });
      }
      
      setTimeout(() => setIsUploading(false), 8000);
    } finally {
       if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const getStatusText = () => {
    switch (uploadStage) {
      case 'uploading': return 'Transmitting File';
      case 'persisting': return 'Syncing Metadata';
      case 'complete': return 'Material Online';
      case 'error': return 'Sync Failed';
      default: return 'Standby...';
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-24">
      {isUploading && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-white rounded-[3rem] p-12 max-w-md w-full shadow-2xl text-center space-y-8 animate-in zoom-in-95 duration-300">
            <div className="relative w-28 h-28 mx-auto">
              <svg className="w-full h-full -rotate-90">
                <circle cx="56" cy="56" r="50" stroke="#f1f5f9" strokeWidth="10" fill="transparent" />
                <circle
                  cx="56" cy="56" r="50" stroke="#4f46e5" strokeWidth="10" fill="transparent"
                  strokeDasharray={314}
                  strokeDashoffset={314 - (314 * progress) / 100}
                  strokeLinecap="round"
                  className="transition-all duration-300 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-indigo-600 font-black text-2xl">
                {Math.round(progress)}%
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-slate-900">{getStatusText()}</h3>
              <p className="text-slate-500 text-sm leading-relaxed">
                {uploadStage === 'uploading' 
                  ? 'Streaming high-fidelity curriculum data...' 
                  : 'Resolving database permissions (Stage 90%)...'}
              </p>
            </div>
          </div>
        </div>
      )}

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

      {detailedError && (
        <div className={`border-2 p-6 rounded-[2rem] flex items-start gap-5 animate-in slide-in-from-top-4 ${detailedError.type === 'policy' ? 'bg-indigo-50 border-indigo-200' : 'bg-rose-50 border-rose-100'}`}>
          <div className={`p-3 rounded-2xl shrink-0 ${detailedError.type === 'policy' ? 'bg-indigo-100 text-indigo-600' : 'bg-rose-100 text-rose-600'}`}>
            {getErrorIcon(detailedError.type)}
          </div>
          <div className="flex-1">
            <h4 className={`font-bold ${detailedError.type === 'policy' ? 'text-indigo-900' : 'text-rose-900'}`}>{detailedError.title}</h4>
            <p className={`text-sm mt-1 leading-relaxed ${detailedError.type === 'policy' ? 'text-indigo-700' : 'text-rose-700'}`}>{detailedError.message}</p>
            {detailedError.fix && (
              <p className={`text-xs font-black uppercase mt-3 tracking-widest flex items-center gap-1 ${detailedError.type === 'policy' ? 'text-indigo-500' : 'text-rose-400'}`}>
                <Check size={12}/> {detailedError.fix}
              </p>
            )}
          </div>
          <button onClick={() => setDetailedError(null)} className="p-2 hover:bg-black/5 rounded-xl text-slate-400"><X size={20}/></button>
        </div>
      )}

      {selectedDoc ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
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
                 <div className="flex justify-between text-sm"><span className="text-slate-400 font-medium">Status</span><span className="font-bold text-indigo-600">READY</span></div>
                 <div className="flex justify-between text-sm"><span className="text-slate-400 font-medium">Sync State</span><span className="font-bold">CLOUD</span></div>
               </div>
               <button onClick={() => onDeleteDocument(selectedDoc.id)} className="w-full py-4 text-rose-500 bg-rose-50 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-rose-100 transition-colors mt-4">
                 <Trash2 size={18}/> Delete Material
               </button>
            </div>
          </div>
          <div className="lg:col-span-2 space-y-6">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
              <Sparkles size={28} className="text-indigo-600" /> Direct AI Processing
            </h2>
            <div className="bg-slate-50 border-2 border-dashed border-slate-200 p-12 rounded-[2.5rem] text-center">
              <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mx-auto mb-6">
                <Zap className="text-indigo-600" size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-800">Ready for Neural Interaction</h3>
              <p className="text-slate-500 mt-2 max-w-sm mx-auto leading-relaxed">
                This document has been synchronized. You can now process it directly in the <strong>AI Tutor Chat</strong> or use <strong>Gen Tools</strong> to generate curriculum content.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {documents.map(doc => (
            <div key={doc.id} onClick={() => setSelectedDocId(doc.id)} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 hover:border-indigo-400 transition-all shadow-sm hover:shadow-xl cursor-pointer group relative overflow-hidden">
               <div className="flex justify-between items-start mb-6">
                  <div className="p-4 bg-slate-50 text-indigo-400 rounded-2xl group-hover:bg-indigo-600 group-hover:text-white transition-all"><FileText size={24}/></div>
                  <CheckCircle2 size={18} className="text-emerald-500" />
               </div>
               <h3 className="font-bold text-slate-900 truncate tracking-tight text-lg">{doc.name}</h3>
               <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-2">Active Context</p>
            </div>
          ))}

          {documents.length === 0 && (
            <div className="col-span-full py-24 text-center">
              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-300"><Upload size={40}/></div>
              <h3 className="text-2xl font-bold text-slate-800">Your Library is Empty</h3>
              <p className="text-slate-500 mt-2">Upload instructional materials to begin direct AI processing.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Documents;
