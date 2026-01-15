
import React, { useState, useEffect } from 'react';
import { 
  Upload, FileText, Plus, Target, 
  Loader2, AlertCircle, CheckCircle2, X,
  Database, Check, Trash2, ExternalLink, Globe, Sparkles, BrainCircuit, RefreshCw, Layers, ListChecks
} from 'lucide-react';
import { Document, SubscriptionPlan, UserProfile, UserRole } from '../types';
import { ROLE_LIMITS } from '../constants';
import DocumentUploader from '../components/DocumentUploader';
import { getR2PublicUrl } from '../lib/r2';
import { supabase } from '../lib/supabase';

interface DocumentsProps {
  documents: Document[];
  userProfile: UserProfile;
  onAddDocument: (doc: Document) => Promise<void>;
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
  const [indexingId, setIndexingId] = useState<string | null>(null);
  
  const docLimit = ROLE_LIMITS[userProfile.plan].docs;
  const limitReached = documents.length >= docLimit;
  
  const canDelete = userProfile.role === UserRole.APP_ADMIN || userProfile.plan !== SubscriptionPlan.FREE;

  useEffect(() => {
    const processingDocs = documents.filter(d => d.status === 'processing');
    if (processingDocs.length === 0) return;

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('documents')
        .select('id, status, document_summary, difficulty_level, rag_indexed, generated_json')
        .in('id', processingDocs.map(d => d.id));

      if (data) {
        data.forEach(updated => {
          if (updated.status !== 'processing') {
            onUpdateDocument(updated.id, { 
              status: updated.status as any,
              documentSummary: updated.document_summary,
              difficultyLevel: updated.difficulty_level,
              geminiProcessed: updated.rag_indexed,
              generatedJson: updated.generated_json
            });
          }
        });
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [documents, onUpdateDocument]);

  const handleUploadComplete = async (doc: any) => {
    await onAddDocument({
      ...doc,
      userId: userProfile.id,
      subject: 'General',
      gradeLevel: 'Auto',
      sloTags: [],
      createdAt: new Date().toISOString()
    });
    setShowUploader(false);
  };

  const handleManualIndex = async (id: string) => {
    setIndexingId(id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/documents/index', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ documentId: id })
      });
      
      const data = await response.json();

      if (response.ok) {
        onUpdateDocument(id, { status: 'ready', geminiProcessed: true });
      } else {
        alert(`Neural Sync Failed: ${data.error || 'Connection Timeout'}`);
      }
    } catch (err) {
      console.error(err);
      alert("Neural sync failed. Please check your internet connection and try again.");
    } finally {
      setIndexingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!canDelete) return;
    if (window.confirm('Erase this curriculum asset permanently?')) {
      setDeletingId(id);
      try { await onDeleteDocument(id); } finally { setDeletingId(null); }
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-24">
      {showUploader && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xl">
          <DocumentUploader 
            userId={userProfile.id} 
            userPlan={userProfile.plan}
            onComplete={handleUploadComplete}
            onCancel={() => setShowUploader(false)}
          />
        </div>
      )}

      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">Curriculum Library</h1>
          <p className="text-slate-500 mt-2 flex items-center gap-3 font-medium">
            <Database size={18} className="text-indigo-500" />
            Storage Node: {isConnected ? 'Online' : 'Offline'}
          </p>
        </div>
        <button 
          onClick={() => setShowUploader(true)}
          disabled={limitReached || !isConnected}
          className={`flex items-center gap-4 px-12 py-5 rounded-[2.5rem] font-black shadow-2xl transition-all active:scale-95 ${
            limitReached ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-600/30'
          }`}
        >
          <Plus size={20} />
          {limitReached ? 'Quota Reached' : 'Ingest Document'}
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
        {documents.map(doc => {
          const publicUrl = doc.storageType === 'r2' && doc.filePath ? getR2PublicUrl(doc.filePath) : null;
          const isDeleting = deletingId === doc.id;
          const isIndexing = indexingId === doc.id;
          const isProcessing = doc.status === 'processing';
          const isReady = doc.status === 'ready' || doc.status === 'completed';
          const stats = doc.generatedJson || {};

          return (
            <div key={doc.id} className={`bg-white dark:bg-slate-900 p-8 rounded-[3rem] border border-slate-100 dark:border-white/5 hover:border-indigo-400 transition-all shadow-sm hover:shadow-2xl relative overflow-hidden group ${isDeleting ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
               <div className="flex justify-between items-start mb-6">
                  <div className={`p-5 rounded-[2rem] transition-all relative ${
                    isProcessing || isIndexing
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 animate-pulse' 
                      : 'bg-slate-50 dark:bg-slate-800 text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white'
                  }`}>
                    {isProcessing || isIndexing ? <BrainCircuit size={32} className="animate-spin duration-[3s]" /> : <FileText size={32}/>}
                  </div>
                  <div className="flex flex-col gap-3">
                    {publicUrl && (
                      <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="p-2.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full shadow-lg hover:bg-indigo-600 hover:text-white transition-all">
                        <ExternalLink size={16} />
                      </a>
                    )}
                    {canDelete && (
                      <button onClick={() => handleDelete(doc.id)} className="p-2.5 bg-rose-50 dark:bg-rose-900/30 text-rose-500 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
               </div>
               
               <div className="space-y-4">
                 <h3 className="font-bold text-slate-900 dark:text-white truncate text-lg">{doc.name}</h3>
                 
                 <div className="flex flex-wrap gap-2">
                    {isProcessing ? (
                      <span className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 rounded-full text-[10px] font-black uppercase">
                        <Loader2 size={10} className="animate-spin" /> Deep Audit...
                      </span>
                    ) : isIndexing ? (
                      <span className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-full text-[10px] font-black uppercase">
                        <RefreshCw size={10} className="animate-spin" /> Indexing...
                      </span>
                    ) : isReady ? (
                      <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-full text-[10px] font-black uppercase">
                        <Sparkles size={10} /> Neural Indexed
                      </span>
                    ) : (
                      <button 
                        onClick={() => handleManualIndex(doc.id)}
                        className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 text-white rounded-full text-[10px] font-black uppercase hover:bg-indigo-700 transition-all shadow-lg"
                      >
                        <BrainCircuit size={10} /> Sync Neural Nodes
                      </button>
                    )}
                    
                    {doc.difficultyLevel && (
                      <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full text-[9px] font-bold uppercase tracking-widest">
                        {doc.difficultyLevel}
                      </span>
                    )}
                 </div>

                 {isReady && stats.totalOutcomes > 0 && (
                   <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-50 dark:border-white/5">
                      <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 uppercase">
                        <ListChecks size={10} className="text-indigo-500" /> {stats.totalOutcomes} SLOs
                      </div>
                      <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 uppercase">
                        <Layers size={10} className="text-amber-500" /> {stats.units?.length || 0} Units
                      </div>
                   </div>
                 )}

                 {doc.documentSummary && (
                   <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed font-medium">
                     {doc.documentSummary}
                   </p>
                 )}
               </div>
               
               <div className="absolute bottom-0 left-0 w-full h-1 bg-indigo-500 transform translate-y-full group-hover:translate-y-0 transition-transform" />
            </div>
          );
        })}
        
        {documents.length === 0 && (
          <div className="col-span-full py-40 text-center bg-white/40 dark:bg-white/5 rounded-[4rem] border-4 border-dashed border-slate-100 dark:border-white/5 flex flex-col items-center justify-center">
            <Upload size={48} className="text-slate-200 mb-6" />
            <h3 className="text-2xl font-black text-slate-800 dark:text-slate-200">Library Empty</h3>
            <p className="text-slate-400 mt-2 max-w-xs mx-auto text-sm font-medium">Upload curriculum documents to enable localized AI grounding.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Documents;
