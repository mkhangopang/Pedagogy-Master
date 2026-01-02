import React, { useState, useRef } from 'react';
import { 
  Upload, FileText, Plus, Target, 
  Loader2, AlertCircle, CheckCircle2, X,
  Database, Check
} from 'lucide-react';
import { Document, SubscriptionPlan } from '../types';
import { ROLE_LIMITS } from '../constants';
import { supabase } from '../lib/supabase';
import { isSupportedFileType } from '../lib/gemini-file';
import { UploadPhase } from '../models/file';

interface DocumentsProps {
  documents: Document[];
  onAddDocument: (doc: Document) => Promise<void>;
  onUpdateDocument: (id: string, updates: Partial<Document>) => Promise<void>;
  onDeleteDocument: (id: string) => Promise<void>;
  userPlan: SubscriptionPlan;
  isConnected: boolean;
}

const Documents: React.FC<DocumentsProps> = ({ 
  documents, 
  onAddDocument, 
  userPlan
}) => {
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [detailedError, setDetailedError] = useState<{title:string, message:string} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const docLimit = ROLE_LIMITS[userPlan].docs;
  const limitReached = documents.length >= docLimit;

  /**
   * REFACTORED 3-PHASE UPLOAD LIFECYCLE
   */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isSupportedFileType(file.type)) {
      setDetailedError({ title: 'Format Unsupported', message: 'PDF, Word, or TXT required.' });
      return;
    }

    if (limitReached) {
      setDetailedError({ title: 'Quota Reached', message: 'Upgrade to Pro for more storage.' });
      return;
    }

    setUploadPhase('preparing');
    setProgress(5);
    setStatusText('Handshaking with Cloudflare R2...');
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please re-authenticate.");

      // PHASE 1: PREPARE (Verify & Signed URL)
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
        const errData = await prepRes.json();
        throw new Error(errData.error || 'Preparation failed.');
      }

      const { uploadUrl, key, docId } = await prepRes.json();
      
      setUploadPhase('uploading');
      setProgress(10);
      setStatusText('Directly streaming to R2...');

      // PHASE 2: DIRECT UPLOAD (Browser -> R2)
      const uploadInterval = setInterval(() => {
        setProgress(prev => (prev < 85 ? prev + 2 : prev));
      }, 300);

      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type }
      });

      clearInterval(uploadInterval);

      if (!uploadRes.ok) throw new Error('Cloudflare R2 transmission failed.');
      
      setUploadPhase('completing');
      setProgress(90);
      setStatusText('Finalizing metadata...');

      // PHASE 3: COMPLETE (Mark Ready)
      const completeRes = await fetch('/api/uploads/complete', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ docId })
      });

      if (!completeRes.ok) throw new Error('Completion handshake failed.');

      const { doc: dbDoc } = await completeRes.json();

      // Update Local State with consistent status
      await onAddDocument({
        id: dbDoc.id,
        userId: dbDoc.user_id,
        name: dbDoc.name,
        filePath: dbDoc.file_path,
        mimeType: dbDoc.mime_type,
        status: 'ready', // Align with DB status
        subject: dbDoc.subject,
        gradeLevel: dbDoc.grade_level,
        sloTags: dbDoc.slo_tags,
        createdAt: dbDoc.created_at
      });

      setProgress(100);
      setStatusText('Ready for AI Analysis');
      setTimeout(() => setUploadPhase('idle'), 1500);

    } catch (err: any) {
      console.error("Ingestion Hub Error:", err);
      setUploadPhase('error');
      setDetailedError({ title: 'Storage Failure', message: err.message });
    } finally {
       if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-24">
      {uploadPhase !== 'idle' && uploadPhase !== 'error' && (
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
                  className="transition-all duration-300 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-indigo-600 font-black text-5xl tracking-tighter">{Math.round(progress)}%</span>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">S3/R2 Node</span>
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-slate-900">{statusText}</h3>
              <p className="text-slate-500 text-sm">Direct encryption via Cloudflare R2 active.</p>
            </div>
          </div>
        </div>
      )}

      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">R2 Curriculum Library</h1>
          <p className="text-slate-500 mt-2 flex items-center gap-3 font-medium">
            <Database size={18} className="text-indigo-500" />
            Vercel Serverless + Cloudflare R2 Ingestion
          </p>
        </div>
        <div className="flex items-center gap-4">
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".pdf,.txt,.doc,.docx" />
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadPhase !== 'idle' || limitReached}
            className={`flex items-center gap-4 px-12 py-5 rounded-[2rem] font-black shadow-2xl transition-all ${
              limitReached ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-600/30'
            }`}
          >
            {uploadPhase !== 'idle' ? <Loader2 className="animate-spin" size={20} /> : <Plus size={20} />}
            Cloud Ingestion
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
          <button onClick={() => { setDetailedError(null); setUploadPhase('idle'); }} className="p-4 text-slate-300"><X size={28}/></button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
        {documents.map(doc => (
          <div key={doc.id} className="bg-white p-12 rounded-[4rem] border border-slate-100 hover:border-indigo-400 transition-all shadow-sm hover:shadow-2xl cursor-pointer group relative">
             <div className="flex justify-between items-start mb-10">
                <div className="p-6 bg-slate-50 text-indigo-400 rounded-[2rem] group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-inner"><FileText size={36}/></div>
                <div className="p-3 bg-emerald-50 text-emerald-500 rounded-full shadow-lg"><Check size={20} /></div>
             </div>
             <h3 className="font-black text-slate-900 truncate tracking-tight text-2xl">{doc.name}</h3>
             <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mt-5 flex items-center gap-3">
               <Database size={16} className="text-indigo-500"/> R2 Object Ref
             </p>
          </div>
        ))}
        {documents.length === 0 && (
          <div className="col-span-full py-52 text-center bg-white/40 rounded-[6rem] border-8 border-dashed border-slate-100">
            <div className="w-32 h-32 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-10 text-slate-300 shadow-inner"><Upload size={64}/></div>
            <h3 className="text-4xl font-black text-slate-800 tracking-tight">Library Empty</h3>
            <p className="text-slate-400 font-bold mt-4">Ingest curriculum to begin analysis.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Documents;
