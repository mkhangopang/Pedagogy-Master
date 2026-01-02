
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
import { supabase } from '../lib/supabase';
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

const Documents: React.FC<DocumentsProps> = ({ 
  documents, 
  onAddDocument, 
  onDeleteDocument,
  userPlan,
  isConnected
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [detailedError, setDetailedError] = useState<{type:string, title:string, message:string} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedDoc = documents.find(d => d.id === selectedDocId);
  const docLimit = ROLE_LIMITS[userPlan].docs;
  const limitReached = documents.length >= docLimit;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isSupportedFileType(file.type)) {
      setDetailedError({ type: 'format', title: 'Format Error', message: 'Unsupported file type.' });
      return;
    }

    if (limitReached) {
      setDetailedError({ type: 'quota', title: 'Library Full', message: 'Quota reached.' });
      return;
    }

    setIsUploading(true);
    setProgress(10);
    setStatusText('Requesting R2 Signed Access...');
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Auth session expired.");

      // 1. Prepare R2 Upload
      const prepRes = await fetch('/api/uploads/prepare', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ 
          filename: file.name, 
          contentType: file.type,
          fileSize: file.size 
        })
      });

      if (!prepRes.ok) {
        const err = await prepRes.json();
        throw new Error(err.error || 'R2 Preparation Failed');
      }

      const { uploadUrl, key } = await prepRes.json();
      setProgress(40);
      setStatusText('Streaming to R2 Bucket...');

      // 2. Direct PUT to R2
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type }
      });

      if (!uploadRes.ok) throw new Error('Cloudflare R2 Handshake Error');
      
      setProgress(80);
      setStatusText('Updating Metadata...');

      // 3. Register Document in Supabase
      const docId = crypto.randomUUID();
      const newDoc: Document = {
        id: docId,
        userId: session.user.id, 
        name: file.name,
        filePath: key,
        mimeType: file.type,
        status: 'completed',
        subject: 'Cloud Curriculum',
        gradeLevel: 'Auto',
        sloTags: [],
        createdAt: new Date().toISOString()
      };

      const regRes = await fetch('/api/docs/register', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ doc: newDoc })
      });

      if (!regRes.ok) throw new Error('Metadata Bridge Failed');

      await onAddDocument(newDoc);
      setProgress(100);
      setStatusText('Ingestion Complete!');
      setTimeout(() => setIsUploading(false), 1000);

    } catch (err: any) {
      console.error("Ingestion Error:", err);
      setIsUploading(false);
      setDetailedError({ type: 'storage', title: 'R2 Transfer Failed', message: err.message });
    } finally {
       if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-24">
      {isUploading && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-2xl">
          <div className="bg-white rounded-[4rem] p-12 max-w-md w-full shadow-2xl text-center space-y-10 border border-indigo-100">
            <div className="relative w-40 h-40 mx-auto">
              <svg className="w-full h-full -rotate-90">
                <circle cx="80" cy="80" r="74" stroke="#f1f5f9" strokeWidth="6" fill="transparent" />
                <circle
                  cx="80" cy="80" r="74" stroke="#4f46e5" strokeWidth="12" fill="transparent"
                  strokeDasharray={464}
                  strokeDashoffset={464 - (464 * progress) / 100}
                  strokeLinecap="round"
                  className="transition-all duration-500 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-indigo-600 font-black text-5xl tracking-tighter">{Math.round(progress)}%</span>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">R2 Upload</span>
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-slate-900">{statusText}</h3>
              <p className="text-slate-500 text-sm">Secure direct-to-bucket encryption active.</p>
            </div>
          </div>
        </div>
      )}

      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">R2 Cloud Library</h1>
          <p className="text-slate-500 mt-2 flex items-center gap-3 font-medium">
            <Database size={18} className="text-indigo-500" />
            Storage Node: Cloudflare R2 Active
          </p>
        </div>
        <div className="flex items-center gap-4">
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".pdf,.txt,.doc,.docx" />
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || limitReached}
            className={`flex items-center gap-4 px-12 py-5 rounded-[2rem] font-black shadow-2xl transition-all ${
              limitReached ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-600/30'
            }`}
          >
            {isUploading ? <Loader2 className="animate-spin" size={20} /> : <Plus size={20} />}
            Upload to R2
          </button>
        </div>
      </header>

      {detailedError && (
        <div className="bg-rose-50 border-2 border-rose-100 p-10 rounded-[4rem] flex items-start gap-8 shadow-2xl animate-in">
          <div className="p-6 bg-white text-rose-600 rounded-3xl shadow-lg"><AlertCircle size={28}/></div>
          <div className="flex-1">
            <h4 className="text-2xl font-black text-rose-900">{detailedError.title}</h4>
            <p className="text-lg mt-3 text-rose-700 opacity-80">{detailedError.message}</p>
          </div>
          <button onClick={() => setDetailedError(null)} className="p-4 text-slate-300"><X size={28}/></button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
        {documents.map(doc => (
          <div key={doc.id} onClick={() => setSelectedDocId(doc.id)} className="bg-white p-12 rounded-[4rem] border border-slate-100 hover:border-indigo-400 transition-all shadow-sm hover:shadow-2xl cursor-pointer group relative">
             <div className="flex justify-between items-start mb-10">
                <div className="p-6 bg-slate-50 text-indigo-400 rounded-[2rem] group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-inner"><FileText size={36}/></div>
                <div className="p-3 bg-emerald-50 text-emerald-500 rounded-full shadow-lg"><Check size={20} /></div>
             </div>
             <h3 className="font-black text-slate-900 truncate tracking-tight text-2xl">{doc.name}</h3>
             <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mt-5 flex items-center gap-3">
               <Database size={16} className="text-indigo-500"/> R2 Node
             </p>
          </div>
        ))}
        {documents.length === 0 && (
          <div className="col-span-full py-52 text-center bg-white/40 rounded-[6rem] border-8 border-dashed border-slate-100">
            <div className="w-32 h-32 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-10 text-slate-300 shadow-inner"><Upload size={64}/></div>
            <h3 className="text-4xl font-black text-slate-800 tracking-tight">Cloud Node Standby</h3>
          </div>
        )}
      </div>
    </div>
  );
};

export default Documents;
