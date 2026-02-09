
import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, FileText, Plus, 
  Loader2, CheckCircle2,
  Database, Trash2, ExternalLink, Sparkles, BrainCircuit, RefreshCw, Layers, ListChecks, BookOpen, Lock, AlertTriangle
} from 'lucide-react';
import { Document, SubscriptionPlan, UserProfile, UserRole } from '../types';
import { ROLE_LIMITS } from '../constants';
import DocumentUploader from '../components/DocumentUploader';
import { DocumentReader } from '../components/DocumentReader';
import { getR2PublicUrl } from '../lib/r2';
import { supabase } from '../lib/supabase';

interface DocumentsProps {
  documents: Document[];
  userProfile: UserProfile;
  onAddDocument: (doc: any) => Promise<void>;
  onUpdateDocument: (id: string, updates: Partial<Document>) => Promise<void>;
  onDeleteDocument: (id: string) => Promise<void>;
  isConnected: boolean;
}

const Documents: React.FC<DocumentsProps> = ({ 
  documents, 
  userProfile,
  onAddDocument,
  onUpdateDocument,
  onDeleteDocument,
  isConnected
}) => {
  const [showUploader, setShowUploader] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [readingDoc, setReadingDoc] = useState<Document | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // FOUNDER/ADMIN CHECK (Direct link to Vercel Env)
  const adminString = process.env.NEXT_PUBLIC_ADMIN_EMAILS || '';
  const adminEmails = adminString.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const isAdmin = userProfile.role === UserRole.APP_ADMIN || (userProfile.email && adminEmails.includes(userProfile.email.toLowerCase()));
  
  const limits = ROLE_LIMITS[userProfile.plan] || ROLE_LIMITS[SubscriptionPlan.FREE];
  
  // FOUNDER EXCEPTION: Admins have effectively infinite slots (999,999)
  const limitReached = isAdmin ? false : documents.length >= limits.docs;
  
  // FOUNDER PRIVILEGE: Admins can delete ANY record. Users can only delete failed ones.
  const canDeleteNode = (doc: Document) => {
    if (isAdmin) return true; 
    if (doc.status === 'failed') return true; 
    return false; 
  };

  const processingIds = documents
    .filter(d => d.status === 'processing' || d.status === 'indexing' || d.status === 'draft')
    .map(d => d.id)
    .join(',');

  useEffect(() => {
    const idsToTrack = processingIds.split(',').filter(Boolean);
    if (idsToTrack.length === 0) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    const pollStatus = async () => {
      try {
        const { data, error } = await supabase
          .from('documents')
          .select('id, status, document_summary, difficulty_level, rag_indexed, error_message, extracted_text')
          .in('id', idsToTrack);

        if (error) throw error;
        if (data) {
          data.forEach(updated => {
            const current = documents.find(d => d.id === updated.id);
            if (current && (updated.status !== current.status || updated.document_summary !== current.documentSummary)) {
              onUpdateDocument(updated.id, { 
                status: updated.status as any,
                documentSummary: updated.document_summary,
                difficultyLevel: updated.difficulty_level,
                geminiProcessed: updated.rag_indexed,
                extractedText: updated.extracted_text
              });
            }
          });
        }
      } catch (e) {
        console.error("Polling sync fault:", e);
      }
    };

    pollStatus();
    
    if (!pollingRef.current) {
      pollingRef.current = setInterval(pollStatus, 3000);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [processingIds, documents, onUpdateDocument]);

  const handleDelete = async (id: string) => {
    if (window.confirm('PURGE RECORD: Are you sure you want to permanently remove this asset from the library?')) {
      setDeletingId(id);
      try { 
        const { data: { session } } = await supabase.auth.getSession();
        
        const response = await fetch('/api/docs/delete', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
          body: JSON.stringify({ id })
        });
        
        if (response.ok) {
          // Document was successfully deleted in DB, now update UI
          await onDeleteDocument(id);
        } else {
          const err = await response.json();
          alert(`Policy Restriction: ${err.error || 'The neural grid rejected the purge command.'}`);
          // Force a reload to synchronize state if something went wrong
          window.location.reload();
        }
      } catch (err) {
        console.error("Purge failure:", err);
        alert("Connectivity Fault: Unable to reach the purge gateway.");
        window.location.reload();
      } finally { 
        setDeletingId(null); 
      }
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-24 px-4 text-left">
      {showUploader && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xl">
          <DocumentUploader 
            userId={userProfile.id} 
            userPlan={userProfile.plan}
            docCount={documents.length}
            onComplete={async (result: any) => {
              await onAddDocument(result);
              setShowUploader(false);
            }}
            onCancel={() => setShowUploader(false)}
          />
        </div>
      )}

      {readingDoc && <DocumentReader document={readingDoc} onClose={() => setReadingDoc(null)} />}

      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight uppercase flex items-center gap-4">
            Library
            {isAdmin && <span className="px-3 py-1 bg-rose-600 text-white rounded-full text-[10px] uppercase font-black tracking-widest shadow-lg">System Founder</span>}
          </h1>
          <p className="text-slate-500 mt-2 flex items-center gap-3 font-medium italic text-sm">
            <Database size={18} className="text-indigo-500" />
            Curriculum Quota: {documents.length} / {isAdmin ? '∞' : limits.docs} Active Segments
          </p>
        </div>
        <button 
          onClick={() => setShowUploader(true)}
          disabled={!isAdmin && (limitReached || !isConnected)}
          className={`flex items-center gap-4 px-12 py-5 rounded-[2.5rem] font-black shadow-2xl transition-all active:scale-95 ${
            (!isAdmin && limitReached) ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'
          }`}
        >
          <Plus size={20} />
          {(!isAdmin && limitReached) ? 'Vault Saturated' : 'Ingest Document'}
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {documents.map(doc => {
          const isProcessing = doc.status === 'processing' || doc.status === 'draft';
          const isIndexing = doc.status === 'indexing';
          const isReady = doc.status === 'ready' || doc.status === 'completed';
          const isFailed = doc.status === 'failed';
          const showDelete = canDeleteNode(doc);

          return (
            <div key={doc.id} className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] border border-slate-100 dark:border-white/5 hover:border-indigo-400 transition-all shadow-sm hover:shadow-2xl relative overflow-hidden group">
               <div className="flex justify-between items-start mb-6">
                  <div className={`p-5 rounded-[2rem] transition-all ${
                    (isProcessing || isIndexing) ? 'bg-slate-100 animate-pulse text-slate-400' : 
                    isFailed ? 'bg-rose-50 text-rose-400' :
                    'bg-slate-50 dark:bg-slate-800 text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white'
                  }`}>
                    {(isProcessing || isIndexing) ? <BrainCircuit size={32} className="animate-spin" /> : isFailed ? <AlertTriangle size={32}/> : <FileText size={32}/>}
                  </div>
                  <div className="flex flex-col gap-3">
                    {isReady && <button onClick={() => setReadingDoc(doc)} className="p-2.5 bg-indigo-600 text-white rounded-full hover:scale-110 transition-transform shadow-lg"><BookOpen size={16} /></button>}
                    
                    {showDelete && (
                      <button 
                        onClick={() => handleDelete(doc.id)} 
                        disabled={deletingId === doc.id}
                        className="p-2.5 bg-rose-50 text-rose-500 rounded-full opacity-0 group-hover:opacity-100 hover:bg-rose-500 hover:text-white transition-all disabled:opacity-50 shadow-sm"
                        title={isAdmin ? "FOUNDER OVERRIDE: Purge Record" : "Remove failed document"}
                      >
                        {deletingId === doc.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      </button>
                    )}

                    {!showDelete && isReady && (
                      <div className="p-2.5 bg-slate-50 text-slate-300 rounded-full cursor-not-allowed opacity-0 group-hover:opacity-100 transition-all" title="Verified records are permanent to protect curriculum integrity.">
                        <Lock size={16} />
                      </div>
                    )}
                  </div>
               </div>
               
               <div className="space-y-4">
                 <h3 className="font-bold text-slate-900 dark:text-white truncate text-lg uppercase tracking-tight">{doc.name}</h3>
                 <div className="flex flex-wrap gap-2">
                    {isReady && <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5"><Sparkles size={10}/> Standard Anchored</span>}
                    {isProcessing && <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5"><RefreshCw size={10} className="animate-spin"/> Syncing...</span>}
                    {isIndexing && <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5"><Database size={10} className="animate-pulse"/> Indexing...</span>}
                    {isFailed && <span className="px-3 py-1 bg-rose-50 text-rose-600 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5"><AlertTriangle size={10}/> Extraction Fault</span>}
                 </div>
                 <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-3 leading-relaxed italic">
                   {isFailed ? (doc.documentSummary || "Critical fault during extraction. Remove this item and try again.") : (doc.documentSummary || "Master MD extraction in progress...")}
                 </p>
                 {isFailed && isAdmin && (
                   <p className="text-[9px] font-bold text-rose-500 bg-rose-50 p-2 rounded-xl border border-rose-100 mt-2">
                     <b>DIAGNOSTIC:</b> {doc.errorMessage || "Unknown Neural Bottleneck"}
                   </p>
                 )}
               </div>
            </div>
          );
        })}

        {documents.length === 0 && (
          <div className="col-span-full py-40 text-center border-2 border-dashed border-slate-100 dark:border-white/5 rounded-[4rem] opacity-30">
            <FileText size={64} className="mx-auto mb-6 text-slate-300" />
            <p className="text-xl font-black uppercase tracking-widest text-slate-400">Library Empty</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Documents;
