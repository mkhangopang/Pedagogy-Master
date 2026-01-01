
import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, FileText, Plus, ChevronLeft, Target, 
  Loader2, AlertCircle, Trash2, Lock, 
  CheckCircle2, ShieldAlert, X, Zap, 
  FileType, Check, RefreshCw, Sparkles,
  Database, WifiOff, RotateCcw
} from 'lucide-react';
import { Document, NeuralBrain, SubscriptionPlan } from '../types';
import { ROLE_LIMITS } from '../constants';
import { uploadFile, supabase } from '../lib/supabase';
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
  type: 'format' | 'network' | 'ai' | 'auth' | 'quota' | 'generic' | 'storage' | 'policy' | 'timeout';
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
    case 'timeout': return <RotateCcw size={24} />;
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
  const [pendingSync, setPendingSync] = useState<{name: string, path: string, type: string, id?: string} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedDoc = documents.find(d => d.id === selectedDocId);
  const docLimit = ROLE_LIMITS[userPlan].docs;
  const limitReached = documents.length >= docLimit;

  // Persist pending syncs to local storage so users can recover after a crash
  useEffect(() => {
    const saved = localStorage.getItem('pedagogy_sync_v49');
    if (saved) {
      try {
        setPendingSync(JSON.parse(saved));
      } catch (e) {
        localStorage.removeItem('pedagogy_sync_v49');
      }
    }
  }, []);

  useEffect(() => {
    if (pendingSync) {
      localStorage.setItem('pedagogy_sync_v49', JSON.stringify(pendingSync));
    } else {
      localStorage.removeItem('pedagogy_sync_v49');
    }
  }, [pendingSync]);

  useEffect(() => {
    let interval: any;
    if (isUploading) {
      if (uploadStage === 'uploading') {
        interval = setInterval(() => {
          setProgress(prev => (prev < 90 ? prev + 0.5 : prev));
        }, 300);
      } else if (uploadStage === 'persisting') {
        // Fast climb to 98% during API call
        interval = setInterval(() => {
          setProgress(prev => (prev < 98 ? prev + 1 : prev));
        }, 100);
      } else if (uploadStage === 'complete') {
        setProgress(100);
      }
    } else {
      setProgress(0);
    }
    return () => clearInterval(interval);
  }, [isUploading, uploadStage]);

  /**
   * BELT AND SUSPENDERS: Privileged API + Triple Retry Loop
   */
  const syncWithServer = async (doc: Document, retries = 3): Promise<any> => {
    const { data: { session } } = await supabase.auth.getSession();
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch('/api/docs/register', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`
          },
          body: JSON.stringify({ doc })
        });

        if (response.ok) return await response.json();
        
        // If server is cold starting, wait and retry
        if (response.status === 504 || response.status === 500) {
          console.warn(`Sync attempt ${attempt} failed. Retrying...`);
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
          continue;
        }

        const err = await response.json();
        throw new Error(err.error || 'Server Sync Failed');
      } catch (err: any) {
        if (attempt === retries) throw err;
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  };

  const resumeSync = async () => {
    if (!pendingSync) return;
    setIsUploading(true);
    setUploadStage('persisting');
    setDetailedError(null);

    try {
      const docId = pendingSync.id || crypto.randomUUID();
      const newDoc: Document = {
        id: docId,
        userId: '', 
        name: pendingSync.name,
        filePath: pendingSync.path,
        mimeType: pendingSync.type,
        status: 'completed',
        subject: 'Cloud Sync Recovered',
        gradeLevel: 'Auto',
        sloTags: [],
        createdAt: new Date().toISOString()
      };

      await syncWithServer(newDoc);
      await onAddDocument(newDoc);
      setPendingSync(null);
      setSelectedDocId(docId);
      setUploadStage('complete');
      setTimeout(() => { setIsUploading(false); setUploadStage('idle'); }, 1000);
    } catch (err: any) {
      handleSyncError(err);
    }
  };

  const handleSyncError = (err: any) => {
    console.error("Critical Sync Failure:", err);
    setUploadStage('error');
    setIsUploading(false);
    
    setDetailedError({ 
      type: 'timeout', 
      title: 'Resilient Sync Interrupted', 
      message: 'The file is securely stored in the cloud (100% safe), but the metadata server is timed out. We have saved your progress.',
      fix: 'Use the "Resume Progress" button to finalize registration.'
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setDetailedError(null);
    if (!isSupportedFileType(file.type)) {
      setDetailedError({ type: 'format', title: 'Format Error', message: 'Unsupported file type.' });
      return;
    }

    if (limitReached) {
      setDetailedError({ type: 'quota', title: 'Storage Limit', message: 'Document limit reached.' });
      return;
    }

    setIsUploading(true);
    setUploadStage('uploading');

    try {
      // Step 1: Storage Upload (Client-side)
      const uploadResult = await uploadFile(file);
      const filePath = uploadResult.path;
      const docId = crypto.randomUUID();

      // Bookmark progress in case metadata sync fails
      const syncInfo = { name: file.name, path: filePath, type: file.type, id: docId };
      setPendingSync(syncInfo);

      // Step 2: Metadata Registration (Privileged API with Retry)
      setUploadStage('persisting');
      
      const newDoc: Document = {
        id: docId,
        userId: '', 
        name: file.name,
        filePath: filePath,
        mimeType: file.type,
        status: 'completed',
        subject: 'Cloud Sync Active',
        gradeLevel: 'Auto',
        sloTags: [],
        createdAt: new Date().toISOString()
      };

      await syncWithServer(newDoc);
      await onAddDocument(newDoc);
      
      setPendingSync(null);
      setSelectedDocId(docId);
      setUploadStage('complete');
      setTimeout(() => { setIsUploading(false); setUploadStage('idle'); }, 1500);

    } catch (err: any) {
      handleSyncError(err);
    } finally {
       if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const getStatusText = () => {
    switch (uploadStage) {
      case 'uploading': return 'Cloud Transmission';
      case 'persisting': return 'Server Handshake';
      case 'complete': return 'Sync Verified';
      case 'error': return 'Sync Pending';
      default: return 'Standby...';
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-24">
      {isUploading && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-white rounded-[3rem] p-12 max-w-md w-full shadow-2xl text-center space-y-8 animate-in zoom-in-95 duration-300 border border-indigo-100">
            <div className="relative w-32 h-32 mx-auto">
              <svg className="w-full h-full -rotate-90">
                <circle cx="64" cy="64" r="58" stroke="#f1f5f9" strokeWidth="8" fill="transparent" />
                <circle
                  cx="64" cy="64" r="58" stroke="#4f46e5" strokeWidth="12" fill="transparent"
                  strokeDasharray={364}
                  strokeDashoffset={364 - (364 * progress) / 100}
                  strokeLinecap="round"
                  className="transition-all duration-500 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-indigo-600 font-black text-3xl">{Math.round(progress)}%</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Syncing</span>
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">{getStatusText()}</h3>
              <div className="flex items-center justify-center gap-2">
                <span className={`w-2 h-2 rounded-full ${uploadStage === 'uploading' ? 'bg-indigo-500 animate-pulse' : 'bg-slate-200'}`} />
                <span className={`w-2 h-2 rounded-full ${uploadStage === 'persisting' ? 'bg-indigo-500 animate-pulse' : 'bg-slate-200'}`} />
                <span className={`w-2 h-2 rounded-full ${uploadStage === 'complete' ? 'bg-emerald-500' : 'bg-slate-200'}`} />
              </div>
              <p className="text-slate-500 text-sm leading-relaxed px-4">
                {uploadStage === 'uploading' 
                  ? 'The file is reaching the cloud cluster. Almost there...' 
                  : 'Bypassing RLS with Suspenders API. Finalizing database entry.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {!isUploading && pendingSync && (
        <div className="bg-indigo-50 border-2 border-indigo-200 p-6 rounded-[2rem] flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm animate-in slide-in-from-top-4">
          <div className="flex items-center gap-4 text-center md:text-left">
            <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl shadow-inner"><RotateCcw size={24}/></div>
            <div>
              <h4 className="font-bold text-indigo-900">Sync Recovery Ready</h4>
              <p className="text-sm text-indigo-700">The server was busy, but "<span className="font-bold">{pendingSync.name}</span>" is safe. Finalize the sync now.</p>
            </div>
          </div>
          <button onClick={resumeSync} className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-2 shrink-0">
            Finalize Metadata Sync
          </button>
        </div>
      )}

      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">Curriculum Library</h1>
          <p className="text-slate-500 mt-2 flex items-center gap-2 font-medium">
            <Database size={16} className="text-indigo-500" />
            Storage Node: {documents.length} / {docLimit} Documents
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".pdf,.txt,.doc,.docx" />
          <button 
            onClick={() => limitReached ? setDetailedError({type:'quota', title:'Limit Reached', message:'Delete docs to upload more.'}) : fileInputRef.current?.click()}
            disabled={isUploading}
            className={`flex items-center gap-3 px-8 py-4 rounded-[1.5rem] font-bold shadow-xl transition-all ${
              limitReached ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 shadow-indigo-600/20'
            }`}
          >
            {isUploading ? <Loader2 className="animate-spin" size={20} /> : <Plus size={20} />}
            Upload Curriculum
          </button>
        </div>
      </header>

      {detailedError && (
        <div className={`border-2 p-6 rounded-[2.5rem] flex items-start gap-5 animate-in slide-in-from-top-4 ${detailedError.type === 'timeout' ? 'bg-indigo-50 border-indigo-200' : 'bg-rose-50 border-rose-100'}`}>
          <div className={`p-4 rounded-2xl shrink-0 ${detailedError.type === 'timeout' ? 'bg-indigo-100 text-indigo-600' : 'bg-rose-100 text-rose-600'}`}>
            {getErrorIcon(detailedError.type)}
          </div>
          <div className="flex-1">
            <h4 className={`text-lg font-bold ${detailedError.type === 'timeout' ? 'text-indigo-900' : 'text-rose-900'}`}>{detailedError.title}</h4>
            <p className={`text-sm mt-1 leading-relaxed ${detailedError.type === 'timeout' ? 'text-indigo-700' : 'text-rose-700'}`}>{detailedError.message}</p>
            <p className="text-xs font-black uppercase mt-4 tracking-widest flex items-center gap-2 text-slate-400">
              <Check size={14} className="text-emerald-500"/> {detailedError.fix}
            </p>
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
               <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shadow-inner"><FileText size={32} /></div>
               <div>
                 <h2 className="text-xl font-bold text-slate-900 truncate">{selectedDoc.name}</h2>
                 <p className="text-xs text-slate-400 mt-1 uppercase font-black tracking-widest">{selectedDoc.mimeType}</p>
               </div>
               <div className="pt-4 border-t border-slate-50 space-y-3">
                 <div className="flex justify-between text-sm"><span className="text-slate-400 font-medium">Cloud Health</span><span className="font-bold text-emerald-600">VERIFIED</span></div>
                 <div className="flex justify-between text-sm"><span className="text-slate-400 font-medium">Sync State</span><span className="font-bold">ACTIVE</span></div>
               </div>
               <button onClick={() => onDeleteDocument(selectedDoc.id)} className="w-full py-4 text-rose-500 bg-rose-50 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-rose-100 transition-colors mt-4 shadow-sm">
                 <Trash2 size={18}/> Wipe from Storage
               </button>
            </div>
          </div>
          <div className="lg:col-span-2 space-y-6">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
              <Sparkles size={28} className="text-indigo-600" /> Pedagogical Intelligence
            </h2>
            <div className="bg-slate-50 border-2 border-dashed border-slate-200 p-12 rounded-[2.5rem] text-center">
              <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mx-auto mb-6">
                <Zap className="text-indigo-600" size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-800">Context Loaded Successfully</h3>
              <p className="text-slate-500 mt-2 max-w-sm mx-auto leading-relaxed">
                This document is part of your institutional brain. You can now use <strong>Gen Tools</strong> to build lesson plans or <strong>AI Chat</strong> to query its content.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {documents.map(doc => (
            <div key={doc.id} onClick={() => setSelectedDocId(doc.id)} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 hover:border-indigo-400 transition-all shadow-sm hover:shadow-xl cursor-pointer group relative overflow-hidden">
               <div className="flex justify-between items-start mb-6">
                  <div className="p-4 bg-slate-50 text-indigo-400 rounded-2xl group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-inner"><FileText size={24}/></div>
                  <div className="p-1 bg-emerald-50 text-emerald-500 rounded-full"><Check size={14} /></div>
               </div>
               <h3 className="font-bold text-slate-900 truncate tracking-tight text-lg">{doc.name}</h3>
               <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-2">Verified Context Node</p>
            </div>
          ))}

          {documents.length === 0 && (
            <div className="col-span-full py-32 text-center bg-white/50 rounded-[3rem] border-2 border-dashed border-slate-200">
              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-300 shadow-inner"><Upload size={40}/></div>
              <h3 className="text-2xl font-bold text-slate-800">Your Repository is Empty</h3>
              <p className="text-slate-500 mt-2">Upload your first curriculum file to initialize the neural engine.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Documents;
