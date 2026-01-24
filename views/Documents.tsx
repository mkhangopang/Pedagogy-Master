import React, { useState, useEffect } from 'react';
import { 
  Upload, FileText, Plus, 
  Loader2, CheckCircle2,
  Database, Trash2, ExternalLink, Sparkles, BrainCircuit, RefreshCw, Layers, ListChecks, BookOpen, Lock
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
  const [readingDoc, setReadingDoc] = useState<Document | null>(null);
  
  const limits = ROLE_LIMITS[userProfile.plan] || ROLE_LIMITS[SubscriptionPlan.FREE];
  const limitReached = documents.length >= limits.docs;
  
  // Strict Deletion Policy
  const canDelete = userProfile.role === UserRole.APP_ADMIN || limits.canDelete;

  useEffect(() => {
    const processingDocs = documents.filter(d => d.status === 'processing');
    if (processingDocs.length === 0) return;

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('documents')
        .select('id, status, document_summary, difficulty_level, rag_indexed, generated_json, extracted_text')
        .in('id', processingDocs.map(d => d.id));

      if (data) {
        data.forEach(updated => {
          if (updated.status !== 'processing') {
            onUpdateDocument(updated.id, { 
              status: updated.status as any,
              documentSummary: updated.document_summary,
              difficultyLevel: updated.difficulty_level,
              geminiProcessed: updated.rag_indexed,
              generatedJson: updated.generated_json,
              extractedText: updated.extracted_text
            });
          }
        });
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [documents, onUpdateDocument]);

  const handleDelete = async (id: string) => {
    if (!canDelete) {
      alert(`PERMANENT VAULT: Your tier does not permit document erasure to ensure pedagogical consistency.`);
      return;
    }
    if (window.confirm('Erase this curriculum asset permanently?')) {
      setDeletingId(id);
      try { await onDeleteDocument(id); } finally { setDeletingId(null); }
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-24 px-4">
      {showUploader && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xl">
          <DocumentUploader 
            userId={userProfile.id} 
            userPlan={userProfile.plan}
            docCount={documents.length}
            onComplete={async (result) => {
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
          <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight uppercase">Library</h1>
          <p className="text-slate-500 mt-2 flex items-center gap-3 font-medium italic">
            <Database size={18} className="text-indigo-500" />
            Node Usage: {documents.length} / {limits.docs} Assets
          </p>
        </div>
        <button 
          onClick={() => setShowUploader(true)}
          disabled={limitReached || !isConnected}
          className={`flex items-center gap-4 px-12 py-5 rounded-[2.5rem] font-black shadow-2xl transition-all active:scale-95 ${
            limitReached ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'
          }`}
        >
          <Plus size={20} />
          {limitReached ? 'Quota Reached' : 'Ingest Asset'}
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {documents.map(doc => {
          const publicUrl = doc.storageType === 'r2' && doc.filePath ? getR2PublicUrl(doc.filePath) : null;
          const isProcessing = doc.status === 'processing';
          const isReady = doc.status === 'ready' || doc.status === 'completed';

          return (
            <div key={doc.id} className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] border border-slate-100 dark:border-white/5 hover:border-indigo-400 transition-all shadow-sm hover:shadow-2xl relative overflow-hidden group">
               <div className="flex justify-between items-start mb-6">
                  <div className={`p-5 rounded-[2rem] transition-all ${isProcessing ? 'bg-slate-100 animate-pulse text-slate-400' : 'bg-slate-50 dark:bg-slate-800 text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white'}`}>
                    {isProcessing ? <BrainCircuit size={32} className="animate-spin" /> : <FileText size={32}/>}
                  </div>
                  <div className="flex flex-col gap-3">
                    {isReady && <button onClick={() => setReadingDoc(doc)} className="p-2.5 bg-indigo-600 text-white rounded-full"><BookOpen size={16} /></button>}
                    {canDelete ? (
                      <button onClick={() => handleDelete(doc.id)} className="p-2.5 bg-rose-50 text-rose-500 rounded-full opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={16} /></button>
                    ) : (
                      <div className="p-2.5 bg-slate-50 text-slate-400 rounded-full cursor-not-allowed" title="Permanent Vault"><Lock size={16} /></div>
                    )}
                  </div>
               </div>
               
               <div className="space-y-4">
                 <h3 className="font-bold text-slate-900 dark:text-white truncate text-lg uppercase tracking-tight">{doc.name}</h3>
                 <div className="flex flex-wrap gap-2">
                    {isReady ? <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5"><Sparkles size={10}/> Neural Anchored</span> : <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5"><RefreshCw size={10} className="animate-spin"/> Syncing...</span>}
                    <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full text-[9px] font-bold uppercase">{doc.gradeLevel}</span>
                 </div>
                 <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed italic">{doc.documentSummary || "Intelligence extraction in progress..."}</p>
               </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Documents;