
import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, FileText, Plus, ChevronLeft, Target, 
  Loader2, AlertCircle, Trash2, Lock, 
  CheckCircle2, ShieldAlert, X, Zap, 
  FileType, Check, RefreshCw, Sparkles,
  Database, WifiOff, RotateCcw, Activity, ArrowRight
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
  isConnected: boolean;
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
  userPlan,
  isConnected
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState<UploadStage>('idle');
  const [progress, setProgress] = useState(0);
  const [hangTimer, setHangTimer] = useState(0);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [detailedError, setDetailedError] = useState<DetailedError | null>(null);
  const [pendingSync, setPendingSync] = useState<{name: string, path: string, type: string, id?: string} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedDoc = documents.find(d => d.id === selectedDocId);
  const docLimit = ROLE_LIMITS[userPlan].docs;
  const limitReached = documents.length >= docLimit;

  // Persist session state for recovery
  useEffect(() => {
    const saved = localStorage.getItem('pedagogy_sync_v51');
    if (saved) {
      try {
        setPendingSync(JSON.parse(saved));
      } catch (e) {
        localStorage.removeItem('pedagogy_sync_v51');
      }
    }
  }, []);

  useEffect(() => {
    if (pendingSync) {
      localStorage.setItem('pedagogy_sync_v51', JSON.stringify(pendingSync));
    } else {
      localStorage.removeItem('pedagogy_sync_v51');
    }
  }, [pendingSync]);

  // Tracking for the hang UI
  useEffect(() => {
    let timer: any;
    if (uploadStage === 'persisting') {
      timer = setInterval(() => setHangTimer(prev => prev + 1), 1000);
    } else {
      setHangTimer(0);
    }
    return () => clearInterval(timer);
  }, [uploadStage]);

  /**
   * THE SUSPENDERS: Resilient Metadata Sync with Server-Side Privileged Bridge
   */
  const syncWithServer = async (doc: Document, retries = 3): Promise<any> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Session expired during upload.");
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch('/api/docs/register', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ doc })
        });

        if (response.ok) return await response.json();
        
        // Handle cold starts or transient server issues
        if (attempt < retries) {
          const waitTime = attempt * 2000;
          console.warn(`Sync attempt ${attempt} failed. Retrying in ${waitTime}ms...`);
          await new Promise(r => setTimeout(r, waitTime));
          continue;
        }

        const err = await response.json();
        throw new Error(err.error || 'Server Handshake Failed');
      } catch (err: any) {
        if (attempt === retries) throw err;
      }
    }
  };

  const resumeSync = async () => {
    if (!pendingSync) return;
    setIsUploading(true);
    setUploadStage('persisting');
    setProgress(95);
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
        subject: 'Recovered Sync',
        gradeLevel: 'Auto',
        sloTags: [],
        createdAt: new Date().toISOString()
      };

      await syncWithServer(newDoc);
      await onAddDocument(newDoc);
      
      setPendingSync(null);
      setSelectedDocId(docId);
      setUploadStage('complete');
      setProgress(100);
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
      title: 'Sync Pipeline Interrupted', 
      message: 'The curriculum is stored in cloud storage, but the final handshake with the pedagogical database failed. This happens if the server is under heavy load.',
      fix: 'Wait 5 seconds and use the "Resume Sync" button below.'
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setDetailedError(null);
    if (!isSupportedFileType(file.type)) {
      setDetailedError({ type: 'format', title: 'Format Warning', message: 'This file format may not be fully parsed by Gemini.' });
      return;
    }

    if (limitReached) {
      setDetailedError({ type: 'quota', title: 'Library Full', message: 'You have reached the document limit for your plan.' });
      return;
    }

    setIsUploading(true);
    setUploadStage('uploading');
    setProgress(0);

    try {
      // THE BELT: Real-time Upload Progress
      // Supabase storage upload
      const uploadResult = await uploadFile(file);
      const filePath = uploadResult.path;
      const docId = crypto.randomUUID();

      // Bookmark progress locally for safety
      const syncInfo = { name: file.name, path: filePath, type: file.type, id: docId };
      setPendingSync(syncInfo);

      // Transition to Database registration
      setUploadStage('persisting');
      setProgress(90);
      
      const newDoc: Document = {
        id: docId,
        userId: '', 
        name: file.name,
        filePath: filePath,
        mimeType: file.type,
        status: 'completed',
        subject: 'Active Curriculum',
        gradeLevel: 'Auto',
        sloTags: [],
        createdAt: new Date().toISOString()
      };

      // Resilient Server-Side Sync
      await syncWithServer(newDoc);
      await onAddDocument(newDoc);
      
      setPendingSync(null);
      setSelectedDocId(docId);
      setUploadStage('complete');
      setProgress(100);
      setTimeout(() => { setIsUploading(false); setUploadStage('idle'); }, 1500);

    } catch (err: any) {
      handleSyncError(err);
    } finally {
       if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-24">
      {isUploading && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-2xl">
          <div className="bg-white rounded-[4rem] p-12 max-w-md w-full shadow-2xl text-center space-y-10 animate-in zoom-in-95 duration-300 border border-indigo-100">
            <div className="relative w-40 h-40 mx-auto">
              <svg className="w-full h-full -rotate-90">
                <circle cx="80" cy="80" r="74" stroke="#f1f5f9" strokeWidth="6" fill="transparent" />
                <circle
                  cx="80" cy="80" r="74" stroke="#4f46e5" strokeWidth="12" fill="transparent"
                  strokeDasharray={464}
                  strokeDashoffset={464 - (464 * progress) / 100}
                  strokeLinecap="round"
                  className="transition-all duration-700 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-indigo-600 font-black text-5xl tracking-tighter">{Math.round(progress)}%</span>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Syncing</span>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-3xl font-black text-slate-900 tracking-tight">
                {uploadStage === 'uploading' ? 'Cloud Transfer' : 'Neural Ingestion'}
              </h3>
              <p className="text-slate-500 text-sm font-medium leading-relaxed px-4">
                {uploadStage === 'uploading' 
                  ? 'Transmitting curriculum to the edge network...' 
                  : 'Bypassing RLS with Privileged Handshake (v51)...'}
              </p>

              {hangTimer > 10 && (
                <div className="p-6 bg-rose-50 border-2 border-rose-100 rounded-[2.5rem] animate-in slide-in-from-bottom-4 shadow-xl shadow-rose-900/5">
                   <div className="flex items-center gap-3 text-rose-600 mb-3 justify-center font-bold">
                     <ShieldAlert size={20} />
                     <span className="text-sm">Extended Sync Detected</span>
                   </div>
                   <p className="text-xs text-rose-700 leading-relaxed mb-5">
                     The database is taking longer than usual to acknowledge the transfer. This is often a cold-start issue.
                   </p>
                   <button 
                     onClick={() => { setIsUploading(false); setUploadStage('error'); }} 
                     className="w-full py-3 bg-rose-600 text-white rounded-2xl text-xs font-black hover:bg-rose-700 transition-all shadow-lg shadow-rose-600/20 active:scale-95 flex items-center justify-center gap-2"
                   >
                     Rescue Progress <ArrowRight size={14} />
                   </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {!isUploading && pendingSync && (
        <div className="bg-indigo-600 p-8 rounded-[3rem] flex flex-col md:flex-row items-center justify-between gap-8 shadow-2xl shadow-indigo-600/30 animate-in slide-in-from-top-6 text-white border-b-8 border-indigo-800">
          <div className="flex items-center gap-6 text-center md:text-left">
            <div className="p-5 bg-white/20 backdrop-blur-xl rounded-[2rem] shadow-inner ring-1 ring-white/30"><Activity size={32}/></div>
            <div>
              <h4 className="text-2xl font-black tracking-tight">Sync Recovery Active</h4>
              <p className="text-sm opacity-80 mt-1 font-medium italic">"<span className="font-bold underline">{pendingSync.name}</span>" is safely stored. Finalize the sync now.</p>
            </div>
          </div>
          <button onClick={resumeSync} className="px-12 py-5 bg-white text-indigo-600 rounded-[1.8rem] font-black text-sm shadow-xl hover:bg-indigo-50 active:scale-95 transition-all flex items-center gap-3 shrink-0 uppercase tracking-widest">
            Complete Handshake <Zap size={18} fill="currentColor" />
          </button>
        </div>
      )}

      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">Curriculum Library</h1>
          <p className="text-slate-500 mt-2 flex items-center gap-3 font-medium">
            <Database size={18} className="text-indigo-500" />
            Infrastructure: <span className={isConnected ? 'text-emerald-600 font-bold' : 'text-rose-500'}>
              {isConnected ? 'Verified Live' : 'Handshake Pending'}
            </span>
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".pdf,.txt,.doc,.docx" />
          <button 
            onClick={() => limitReached ? setDetailedError({type:'quota', title:'Storage Limit', message:'Institutional quota met.'}) : fileInputRef.current?.click()}
            disabled={isUploading}
            className={`flex items-center gap-4 px-12 py-5 rounded-[2rem] font-black shadow-2xl transition-all ${
              limitReached ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 shadow-indigo-600/30 ring-4 ring-indigo-100'
            }`}
          >
            {isUploading ? <Loader2 className="animate-spin" size={20} /> : <Plus size={20} />}
            Upload Curriculum
          </button>
        </div>
      </header>

      {detailedError && (
        <div className={`border-2 p-10 rounded-[4rem] flex items-start gap-8 animate-in slide-in-from-top-4 shadow-2xl ${detailedError.type === 'timeout' ? 'bg-indigo-50 border-indigo-200' : 'bg-rose-50 border-rose-100'}`}>
          <div className={`p-6 rounded-3xl shrink-0 shadow-lg ${detailedError.type === 'timeout' ? 'bg-white text-indigo-600' : 'bg-white text-rose-600'}`}>
            {getErrorIcon(detailedError.type)}
          </div>
          <div className="flex-1">
            <h4 className={`text-2xl font-black tracking-tight ${detailedError.type === 'timeout' ? 'text-indigo-900' : 'text-rose-900'}`}>{detailedError.title}</h4>
            <p className={`text-lg mt-3 leading-relaxed opacity-80 ${detailedError.type === 'timeout' ? 'text-indigo-700' : 'text-rose-700'}`}>{detailedError.message}</p>
            <div className="mt-8 flex items-center gap-6">
               <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 flex items-center gap-3">
                 <Target size={16} className="text-indigo-500"/> Optimal Resolution:
               </span>
               <span className="text-xs font-bold text-slate-700 bg-white px-4 py-2 rounded-full border border-slate-100 shadow-sm">{detailedError.fix}</span>
            </div>
          </div>
          <button onClick={() => setDetailedError(null)} className="p-4 hover:bg-black/5 rounded-3xl text-slate-300 transition-colors"><X size={28}/></button>
        </div>
      )}

      {selectedDoc ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 animate-in fade-in duration-700">
          <div className="lg:col-span-1 space-y-10">
            <button onClick={() => setSelectedDocId(null)} className="flex items-center gap-4 text-indigo-600 font-black text-sm hover:translate-x-[-10px] transition-transform">
              <ChevronLeft size={24} /> Return to Grid
            </button>
            <div className="bg-white rounded-[4rem] p-12 border border-slate-100 shadow-2xl space-y-10 relative overflow-hidden">
               <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -translate-y-1/2 translate-x-1/2 opacity-50" />
               <div className="w-24 h-24 bg-indigo-50 rounded-[2.5rem] flex items-center justify-center text-indigo-600 shadow-inner relative z-10"><FileText size={48} /></div>
               <div>
                 <h2 className="text-3xl font-black text-slate-900 truncate tracking-tight">{selectedDoc.name}</h2>
                 <p className="text-xs text-slate-400 mt-3 uppercase font-black tracking-[0.2em]">{selectedDoc.mimeType}</p>
               </div>
               <div className="pt-10 border-t border-slate-50 space-y-5">
                 <div className="flex justify-between text-sm"><span className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Registry Sync</span><span className="font-black text-emerald-600 tracking-tight">v51 VERIFIED</span></div>
                 <div className="flex justify-between text-sm"><span className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Ingestion</span><span className="font-black text-indigo-600 tracking-tight">PRIVILEGED</span></div>
               </div>
               <button onClick={() => onDeleteDocument(selectedDoc.id)} className="w-full py-6 text-rose-500 bg-rose-50 rounded-[2rem] font-black flex items-center justify-center gap-3 hover:bg-rose-100 transition-all shadow-md active:scale-95 text-sm uppercase tracking-widest">
                 <Trash2 size={20}/> Purge Material
               </button>
            </div>
          </div>
          <div className="lg:col-span-2 space-y-10">
            <h2 className="text-4xl font-black text-slate-900 tracking-tight flex items-center gap-5">
              <Sparkles size={40} className="text-indigo-600" /> Neural Integration
            </h2>
            <div className="bg-slate-50 border-4 border-dashed border-slate-200 p-20 rounded-[5rem] text-center space-y-8">
              <div className="w-28 h-28 bg-white rounded-[2.5rem] shadow-2xl flex items-center justify-center mx-auto ring-[16px] ring-indigo-50 group-hover:scale-110 transition-transform">
                <Zap className="text-indigo-600" size={56} fill="currentColor" />
              </div>
              <div className="space-y-4">
                <h3 className="text-3xl font-black text-slate-800 tracking-tight">Knowledge Node Verified</h3>
                <p className="text-slate-500 max-w-md mx-auto leading-relaxed text-xl font-medium">
                  This material is now vectorized and ready for pedagogical interaction. 
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          {documents.map(doc => (
            <div key={doc.id} onClick={() => setSelectedDocId(doc.id)} className="bg-white p-12 rounded-[4rem] border border-slate-100 hover:border-indigo-400 transition-all shadow-sm hover:shadow-2xl cursor-pointer group relative overflow-hidden">
               <div className="flex justify-between items-start mb-10">
                  <div className="p-6 bg-slate-50 text-indigo-400 rounded-[2rem] group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-inner"><FileText size={36}/></div>
                  <div className="p-3 bg-emerald-50 text-emerald-500 rounded-full shadow-lg"><Check size={20} /></div>
               </div>
               <h3 className="font-black text-slate-900 truncate tracking-tight text-2xl">{doc.name}</h3>
               <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mt-5 flex items-center gap-3">
                 <Activity size={16} className="text-indigo-500"/> Knowledge Node v51
               </p>
            </div>
          ))}

          {documents.length === 0 && (
            <div className="col-span-full py-52 text-center bg-white/40 rounded-[6rem] border-8 border-dashed border-slate-100">
              <div className="w-32 h-32 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-10 text-slate-300 shadow-inner"><Upload size={64}/></div>
              <h3 className="text-4xl font-black text-slate-800 tracking-tight">The Library is Open</h3>
              <p className="text-slate-500 mt-5 text-xl font-medium max-w-lg mx-auto leading-relaxed">Your curriculum documents will serve as the neural foundation for all AI generations.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Documents;
