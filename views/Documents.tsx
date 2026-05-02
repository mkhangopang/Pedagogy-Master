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
  
  // FIX-08: Admin check now uses ONLY server-verified profile.role.
  // NEXT_PUBLIC_ADMIN_EMAILS was a security leak — any user could read all admin
  // email addresses from the client bundle in DevTools. The APP_ADMIN role is
  // set server-side via a Supabase RLS-protected DB column, not an env var.
  const isAdmin = userProfile.role === UserRole.APP_ADMIN;
  
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
    .filter(d => d.status === 'processing' || d.status === 'pending')
    .map(d => d.id);
    
  const [ingestionProgressMap, setIngestionProgressMap] = useState<Record<string, any>>({});

  useEffect(() => {
    // We only need to subscribe if we have processing documents
    // Actually, we can just keep the subscription active for any changes to our documents.
    // However, since we might want specific updates from ingestion_jobs:
    
    // 1. We keep the fallback polling to update the whole UI because Edge Functions might update the documents table silently, and we don't have realtime enabled on documents by default in this script snippet.
    const idsToTrack = processingIds;
    if (idsToTrack.length > 0 && !pollingRef.current) {
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
              const hasChanged = current && (
                updated.status !== current.status || 
                updated.document_summary !== current.documentSummary ||
                updated.error_message !== current.errorMessage
              );

              if (hasChanged) {
                onUpdateDocument(updated.id, { 
                  status: updated.status as any,
                  documentSummary: updated.document_summary,
                  difficultyLevel: updated.difficulty_level,
                  geminiProcessed: updated.rag_indexed,
                  extractedText: updated.extracted_text,
                  errorMessage: updated.error_message
                });
              }
            });
          }
        } catch (e) {
          console.error("Polling sync fault:", e);
        }
      };

      pollingRef.current = setInterval(pollStatus, 5000); // Slow down polling to 5s since we have realtime
    } else if (idsToTrack.length === 0 && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    // 2. Setup Supabase Realtime for granular progress bars
    // We listen to the `ingestion_jobs` table to get exact progress blocks.
    const channel = supabase.channel('realtime-ingestion-jobs')
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'ingestion_jobs'
        },
        (payload) => {
          const newRow = payload.new as any;
          if (newRow && newRow.document_id) {
            // Update realtime progress state
            setIngestionProgressMap(prev => ({
              ...prev,
              [newRow.document_id]: {
                step: newRow.step,
                progress: newRow.progress,
                message: newRow.message
              }
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [processingIds.join(','), documents, onUpdateDocument]);

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

  const handleReprocess = async (id: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      onUpdateDocument(id, { status: 'pending', documentSummary: 'Re-triggering ingestion...' });
      const response = await fetch(`/api/docs/process/${id}`, { 
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` }
      });
      if (!response.ok) throw new Error('Failed to start processing');
    } catch (err) {
      console.error("Reprocess failure:", err);
      alert("Neural Gateway Error: Unable to re-trigger ingestion.");
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
          const isProcessing = doc.status === 'processing' || doc.status === 'pending';
          const isReady = doc.status === 'ready';
          const isFailed = doc.status === 'failed';
          const showDelete = canDeleteNode(doc);

          return (
            <div key={doc.id} className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] border border-slate-100 dark:border-white/5 hover:border-indigo-400 transition-all shadow-sm hover:shadow-2xl relative overflow-hidden group">
               <div className="flex justify-between items-start mb-6">
                  <div className={`p-5 rounded-[2rem] transition-all ${
                    isProcessing ? 'bg-slate-100 animate-pulse text-slate-400' : 
                    isFailed ? 'bg-rose-50 text-rose-400' :
                    'bg-slate-50 dark:bg-slate-800 text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white'
                  }`}>
                    {isProcessing ? <BrainCircuit size={32} className="animate-spin" /> : isFailed ? <AlertTriangle size={32}/> : <FileText size={32}/>}
                  </div>
                  <div className="flex flex-col gap-3">
                    {isReady && <button onClick={() => setReadingDoc(doc)} className="p-2.5 bg-indigo-600 text-white rounded-full hover:scale-110 transition-transform shadow-lg"><BookOpen size={16} /></button>}
                    
                    {(isFailed || isAdmin) && !isProcessing && (
                      <button 
                        onClick={() => handleReprocess(doc.id)}
                        className="p-2.5 bg-amber-50 text-amber-600 rounded-full opacity-0 group-hover:opacity-100 hover:bg-amber-600 hover:text-white transition-all shadow-sm"
                        title="Re-trigger Neural Ingestion"
                      >
                        <RefreshCw size={16} />
                      </button>
                    )}

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
                    {isFailed && <span className="px-3 py-1 bg-rose-50 text-rose-600 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5"><AlertTriangle size={10}/> Extraction Fault</span>}
                  </div>

                 {/* Realtime Progress UI for processing documents */}
                 {isProcessing && ingestionProgressMap[doc.id] && (
                   <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/5">
                     <div className="flex justify-between items-center mb-2">
                       <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                         {ingestionProgressMap[doc.id].step || 'Processing'}
                       </span>
                       <span className="text-[10px] font-bold text-indigo-500">
                         {ingestionProgressMap[doc.id].progress}%
                       </span>
                     </div>
                     <div className="w-full h-1.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                       <div 
                         className="h-full bg-indigo-500 rounded-full transition-all duration-500 ease-out" 
                         style={{ width: `${ingestionProgressMap[doc.id].progress || 5}%` }}
                       />
                     </div>
                     <p className="text-[10px] text-slate-400 italic mt-2 line-clamp-1">
                       {ingestionProgressMap[doc.id].message || 'Waking neural node...'}
                     </p>
                   </div>
                 )}

                 {/* Default status message for non-processing docs, or processing docs without realtime data yet */}
                 {!(isProcessing && ingestionProgressMap[doc.id]) && (
                   <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-3 leading-relaxed italic mt-2">
                     {isFailed ? (doc.documentSummary || "Critical fault during extraction. Remove this item and try again.") : 
                      isProcessing ? (doc.documentSummary || "Master MD extraction in progress...") :
                      (doc.documentSummary || "Ready for Synthesis")}
                   </p>
                 )}

                 {isFailed && isAdmin && (
                   <p className="text-[9px] font-bold text-rose-500 bg-rose-50 p-2 rounded-xl border border-rose-100 mt-2 line-clamp-2">
                     <b>DIAGNOSTIC:</b> {doc.errorMessage || "Unknown Neural Bottleneck"}
                   </p>
                 )}
               </div>
            </div>
          );
        })}

        {documents.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-24 px-8 text-center border-2 border-dashed border-slate-200 dark:border-white/10 rounded-3xl bg-gradient-to-b from-transparent to-indigo-50/30 dark:to-indigo-950/10">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/40 dark:to-purple-900/40 flex items-center justify-center mb-6 shadow-inner">
              <FileText size={36} className="text-indigo-500 dark:text-indigo-400" />
            </div>
            <h3 className="text-2xl font-black tracking-tight text-slate-800 dark:text-white mb-2">
              Your Curriculum Library is Empty
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md mb-6 leading-relaxed">
              Upload any Sindh Board, Punjab Board, FBISE, or KPK curriculum PDF.
              Pedagogy Master will automatically extract all SLOs, build a searchable
              knowledge base, and make them available for lesson planning and assessment generation.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 mb-8">
              <button
                onClick={() => setShowUploader(true)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-indigo-500/20"
              >
                <Upload size={16} />
                Upload Curriculum PDF
              </button>
              <a
                href="https://docs.pedagogy-master.com/sample-curriculum"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 text-sm font-bold rounded-xl transition-all hover:border-indigo-300"
              >
                <BookOpen size={16} />
                Try a Sample Document
              </a>
            </div>
            <div className="flex gap-6 text-xs text-slate-400 dark:text-slate-500">
              <span>✓ PDF text extraction</span>
              <span>✓ AI SLO identification</span>
              <span>✓ Bloom's taxonomy tagging</span>
              <span>✓ Semantic search</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Documents;
