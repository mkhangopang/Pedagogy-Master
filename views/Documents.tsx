
import React, { useState } from 'react';
import { 
  Upload, FileText, Plus, Target, 
  Loader2, AlertCircle, CheckCircle2, X,
  Database, Check, Trash2, ExternalLink, Globe
} from 'lucide-react';
import { Document, SubscriptionPlan, UserProfile, UserRole } from '../types';
import { ROLE_LIMITS } from '../constants';
import DocumentUploader from '../components/DocumentUploader';
import { getR2PublicUrl } from '../lib/r2';

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
  onDeleteDocument,
  isConnected
}) => {
  const [showUploader, setShowUploader] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const docLimit = ROLE_LIMITS[userProfile.plan].docs;
  const limitReached = documents.length >= docLimit;
  
  // Free tier cannot delete curriculum assets once uploaded
  const canDelete = userProfile.role === UserRole.APP_ADMIN || userProfile.plan !== SubscriptionPlan.FREE;

  const handleUploadComplete = async (doc: any) => {
    await onAddDocument({
      ...doc,
      userId: userProfile.id,
      status: 'ready',
      subject: 'General',
      gradeLevel: 'Auto',
      sloTags: [],
      createdAt: new Date().toISOString()
    });
    setShowUploader(false);
  };

  const handleDelete = async (id: string) => {
    if (!canDelete) return;
    
    if (window.confirm('This will permanently erase the physical file from the cloud node. Continue?')) {
      setDeletingId(id);
      try {
        await onDeleteDocument(id);
      } finally {
        setDeletingId(null);
      }
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
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">Curriculum Library</h1>
          <p className="text-slate-500 mt-2 flex items-center gap-3 font-medium">
            <Database size={18} className="text-indigo-500" />
            Direct Node Processing: {isConnected ? 'Active' : 'Read-Only'}
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
          {limitReached ? 'Quota Reached' : 'Upload Node'}
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
        {documents.map(doc => {
          const publicUrl = doc.storageType === 'r2' && doc.filePath ? getR2PublicUrl(doc.filePath) : null;
          const isDeleting = deletingId === doc.id;

          return (
            <div key={doc.id} className={`bg-white p-10 rounded-[4rem] border border-slate-100 hover:border-indigo-400 transition-all shadow-sm hover:shadow-2xl relative overflow-hidden group ${isDeleting ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
               <div className="flex justify-between items-start mb-10">
                  <div className="p-6 bg-slate-50 text-indigo-400 rounded-[2rem] group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-inner relative">
                    <FileText size={42}/>
                    {doc.storageType === 'r2' && (
                      <div className="absolute -top-2 -right-2 p-1.5 bg-emerald-500 text-white rounded-full border-2 border-white shadow-sm" title="Stored on R2">
                        <Globe size={12} />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-3">
                    {publicUrl && (
                      <a 
                        href={publicUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="p-3 bg-indigo-50 text-indigo-600 rounded-full shadow-lg hover:bg-indigo-600 hover:text-white transition-all"
                        title="View Public File"
                      >
                        <ExternalLink size={20} />
                      </a>
                    )}
                    {canDelete && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDelete(doc.id); }}
                        className="p-3 bg-rose-50 text-rose-500 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all transform hover:scale-110"
                        title="Erase Forever"
                      >
                        {isDeleting ? <Loader2 size={20} className="animate-spin" /> : <Trash2 size={20} />}
                      </button>
                    )}
                  </div>
               </div>
               
               <div className="space-y-4">
                 <h3 className="font-black text-slate-900 truncate tracking-tight text-xl">{doc.name}</h3>
                 <div className="flex items-center gap-3">
                   <div className={`w-2 h-2 rounded-full ${doc.status === 'ready' ? 'bg-emerald-400' : 'bg-amber-400'} shadow-sm`} />
                   <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
                     {doc.storageType === 'r2' ? 'Direct R2 Node' : 'Native Storage'}
                   </span>
                 </div>
               </div>
               
               <div className="absolute bottom-0 left-0 w-full h-2 bg-indigo-50 transform translate-y-full group-hover:translate-y-0 transition-transform" />
            </div>
          );
        })}
        
        {documents.length === 0 && !showUploader && (
          <div className="col-span-full py-52 text-center bg-white/40 rounded-[6rem] border-8 border-dashed border-slate-100 flex flex-col items-center justify-center">
            <div className="w-32 h-32 bg-slate-50 rounded-full flex items-center justify-center mb-10 text-slate-300 shadow-inner group-hover:scale-110 transition-transform">
              <Upload size={64}/>
            </div>
            <h3 className="text-4xl font-black text-slate-800 tracking-tight">Library Nodes Missing</h3>
            <p className="text-slate-400 font-bold mt-4 text-lg max-w-sm">
              Your pedagogical library is currently empty. Ingest curriculum nodes to begin direct AI processing.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Documents;
