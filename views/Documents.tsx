import React, { useState, useRef } from 'react';
import { 
  Upload, FileText, Plus, ChevronLeft, Target, 
  Loader2, AlertCircle, Trash2, Lock, 
  CheckCircle2, ShieldAlert, X, Zap, 
  FileCode, FileType, Check, RefreshCw
} from 'lucide-react';
import { Document, SLO, NeuralBrain, SubscriptionPlan } from '../types';
import { geminiService } from '../services/geminiService';
import { ROLE_LIMITS } from '../constants';
import { uploadFile } from '../lib/supabase';

interface DocumentsProps {
  documents: Document[];
  onAddDocument: (doc: Document) => void;
  onUpdateDocument: (id: string, updates: Partial<Document>) => void;
  onDeleteDocument: (id: string) => void;
  brain: NeuralBrain;
  onQuery: () => void;
  canQuery: boolean;
  userPlan: SubscriptionPlan;
}

type UploadStage = 'idle' | 'reading' | 'uploading' | 'analyzing' | 'finalizing';

const Documents: React.FC<DocumentsProps> = ({ 
  documents, 
  onAddDocument, 
  onUpdateDocument, 
  onDeleteDocument,
  brain, 
  onQuery, 
  canQuery,
  userPlan
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState<UploadStage>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedDoc = documents.find(d => d.id === selectedDocId);
  const isFree = userPlan === SubscriptionPlan.FREE;
  const docLimit = ROLE_LIMITS[userPlan].docs;
  const limitReached = documents.length >= docLimit;

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      setError("File is too large. Please upload a document smaller than 15MB.");
      return;
    }

    if (limitReached) {
      setShowLimitModal(true);
      return;
    }

    if (!canQuery) {
      setError("Daily AI query limit reached.");
      return;
    }

    setIsUploading(true);
    setUploadStage('reading');
    setUploadProgress(10);
    setError(null);

    const docId = crypto.randomUUID();

    try {
      const base64 = await fileToBase64(file);
      setUploadProgress(30);
      setUploadStage('uploading');

      // Attempt storage upload
      try {
        await uploadFile(file);
        setUploadProgress(50);
      } catch (sErr) {
        console.warn("Storage upload failed, relying on database base64.");
      }

      setUploadStage('analyzing');
      setUploadProgress(65);

      const newDoc: Document = {
        id: docId,
        userId: '', 
        name: file.name,
        base64Data: base64,
        mimeType: file.type || 'application/pdf',
        status: 'processing',
        subject: 'Analyzing...',
        gradeLevel: 'Auto-detecting',
        sloTags: [],
        createdAt: new Date().toISOString()
      };

      onAddDocument(newDoc);
      setSelectedDocId(docId);

      // AI Analysis
      const slos = await geminiService.generateSLOTagsFromBase64(base64, newDoc.mimeType, brain);
      
      setUploadStage('finalizing');
      setUploadProgress(90);

      onUpdateDocument(docId, { 
        sloTags: slos, 
        status: slos.length > 0 ? 'completed' : 'failed',
        subject: slos.length > 0 ? 'General Education' : 'Analysis Failed'
      });
      onQuery();

      setUploadProgress(100);
      setTimeout(() => {
        setIsUploading(false);
        setUploadStage('idle');
      }, 500);

    } catch (err) {
      console.error("Upload error:", err);
      setError("AI analysis timed out or failed. You can try re-uploading the file.");
      
      // Update the document to failed status if it was already added
      onUpdateDocument(docId, { status: 'failed' });
      
      setIsUploading(false);
      setUploadStage('idle');
    }
  };

  const getStageMessage = () => {
    switch(uploadStage) {
      case 'reading': return 'Reading file...';
      case 'uploading': return 'Saving to Library...';
      case 'analyzing': return 'Neural Engine extraction (this may take a minute)...';
      case 'finalizing': return 'Mapping pedagogical data...';
      default: return 'Processing...';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Limit Modal */}
      {showLimitModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center">
            <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <ShieldAlert className="w-8 h-8 text-amber-500" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">Document Limit Reached</h3>
            <p className="text-slate-500 text-sm mb-8">
              Free users can store up to 2 documents. Upgrade to Pro for unlimited storage and advanced features.
            </p>
            <div className="space-y-3">
              <button className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-200">Upgrade to Pro</button>
              <button onClick={() => setShowLimitModal(false)} className="w-full py-3 bg-slate-100 text-slate-600 rounded-xl font-bold">Maybe Later</button>
            </div>
          </div>
        </div>
      )}

      {/* Uploading Overlay */}
      {isUploading && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-indigo-950/40 backdrop-blur-md">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-indigo-100 text-center space-y-6 animate-in zoom-in duration-300">
            <div className="relative w-24 h-24 mx-auto">
              <div className="absolute inset-0 rounded-full border-4 border-indigo-50" />
              <div 
                className="absolute inset-0 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin" 
                style={{ animationDuration: '1s' }}
              />
              <div className="absolute inset-0 flex items-center justify-center text-indigo-600">
                <Upload size={32} />
              </div>
            </div>
            
            <div>
              <h3 className="text-xl font-bold text-slate-900">{getStageMessage()}</h3>
              <p className="text-slate-500 text-sm mt-1">Our AI is meticulously analyzing your content.</p>
            </div>

            <div className="space-y-2">
              <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
                <div 
                  className="h-full bg-indigo-600 transition-all duration-700 ease-out"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <span>Phase: {uploadStage}</span>
                <span>{uploadProgress}%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Curriculum Library</h1>
          <p className="text-slate-500 mt-1">
            {isFree ? `Using ${documents.length}/${docLimit} document slots.` : 'Unlimited Enterprise Storage Active.'}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
            accept=".pdf,.txt,.doc,.docx,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" 
          />
          <button 
            onClick={() => limitReached ? setShowLimitModal(true) : fileInputRef.current?.click()}
            disabled={isUploading}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold shadow-lg transition-all ${
              limitReached ? 'bg-amber-100 text-amber-700' : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95'
            }`}
          >
            {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : (limitReached ? <Lock size={18}/> : <Plus className="w-5 h-5" />)}
            {limitReached ? 'Unlock More' : 'Upload Syllabus'}
          </button>
        </div>
      </header>

      {error && (
        <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl flex items-center gap-3 text-rose-800 animate-in slide-in-from-top-2">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <p className="text-sm font-medium">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto p-1 hover:bg-rose-100 rounded-lg"><X size={16}/></button>
        </div>
      )}

      {selectedDoc ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-6">
            <button onClick={() => setSelectedDocId(null)} className="flex items-center gap-2 text-indigo-600 font-bold text-sm hover:translate-x-[-4px] transition-transform">
              <ChevronLeft size={18} /> Back to Library
            </button>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 shrink-0">
                  <FileText size={24} />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="font-bold text-slate-900 truncate">{selectedDoc.name}</h2>
                  <p className="text-xs text-slate-500 mt-0.5 capitalize">
                    {selectedDoc.status === 'failed' ? 'Analysis Failed' : selectedDoc.status} • {selectedDoc.subject}
                  </p>
                </div>
                
                <div className="relative group">
                  <button 
                    onClick={() => {
                      if (isFree) {
                        setShowLimitModal(true);
                      } else {
                        onDeleteDocument(selectedDoc.id);
                        setSelectedDocId(null);
                      }
                    }}
                    className={`p-2 rounded-lg transition-all ${isFree ? 'text-slate-200 cursor-not-allowed' : 'text-slate-300 hover:text-rose-500 hover:bg-rose-50'}`}
                  >
                    <Trash2 size={18} />
                  </button>
                  {isFree && (
                    <div className="absolute bottom-full right-0 mb-2 w-48 hidden group-hover:block bg-slate-900 text-white text-[10px] p-2 rounded-lg shadow-xl z-20">
                      Delete is disabled for Free users. Upgrade to manage your library.
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 space-y-4">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Bloom's Mapping</span>
                  <span className={`font-bold ${selectedDoc.status === 'failed' ? 'text-rose-500' : 'text-slate-900'}`}>
                    {selectedDoc.status === 'failed' ? 'Error' : `${selectedDoc.sloTags?.length || 0} Points`}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Tier Status</span>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${isFree ? 'bg-slate-100 text-slate-400' : 'bg-indigo-100 text-indigo-600'}`}>
                    {userPlan}
                  </span>
                </div>
              </div>
              
              {selectedDoc.status === 'failed' && (
                <button 
                  onClick={() => {
                    onDeleteDocument(selectedDoc.id);
                    setSelectedDocId(null);
                    fileInputRef.current?.click();
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-rose-50 text-rose-600 text-xs font-bold rounded-xl border border-rose-100 hover:bg-rose-100 transition-colors"
                >
                  <RefreshCw size={14} /> Retry Analysis
                </button>
              )}
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Target className="w-6 h-6 text-indigo-600" /> Learning Outcomes
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {selectedDoc.sloTags.map((slo) => (
                <div key={slo.id} className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-indigo-300 transition-all">
                  <span className="px-2 py-1 rounded-md bg-indigo-50 text-indigo-600 text-[10px] font-bold uppercase mb-3 inline-block">
                    {slo.bloomLevel}
                  </span>
                  <p className="text-slate-800 text-sm font-medium leading-relaxed">{slo.content}</p>
                </div>
              ))}
              {selectedDoc.sloTags.length === 0 && selectedDoc.status !== 'failed' && (
                <div className="col-span-full py-12 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                  <Loader2 className="w-8 h-8 animate-spin text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm font-medium">Extracting pedagogical metadata...</p>
                </div>
              )}
              {selectedDoc.status === 'failed' && (
                <div className="col-span-full py-12 text-center bg-rose-50 rounded-2xl border-2 border-dashed border-rose-200">
                  <AlertCircle className="w-8 h-8 text-rose-300 mx-auto mb-3" />
                  <p className="text-rose-600 text-sm font-bold uppercase tracking-tight">AI Extraction Failed</p>
                  <p className="text-rose-500 text-xs mt-1">This can happen with complex formats. Try a simpler PDF or text file.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {documents.map((doc) => (
            <div key={doc.id} onClick={() => setSelectedDocId(doc.id)} className={`bg-white rounded-2xl border p-6 transition-all cursor-pointer group shadow-sm hover:shadow-xl ${doc.status === 'failed' ? 'border-rose-100 hover:border-rose-300' : 'border-slate-200 hover:border-indigo-400'}`}>
              <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-xl transition-all ${doc.status === 'failed' ? 'bg-rose-50 text-rose-400' : 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white'}`}>
                  {doc.mimeType?.includes('pdf') ? <FileText size={24} /> : doc.mimeType?.includes('word') ? <FileType size={24} /> : <FileCode size={24} />}
                </div>
                <div className="flex items-center gap-2">
                  {isFree && <span className="text-slate-200" title="Management restricted"><Lock size={12}/></span>}
                  {doc.status === 'completed' && <Check size={16} className="text-emerald-500" />}
                  {doc.status === 'processing' && <Loader2 size={16} className="text-indigo-400 animate-spin" />}
                  {doc.status === 'failed' && <AlertCircle size={16} className="text-rose-500" />}
                </div>
              </div>
              <h3 className={`text-lg font-bold truncate ${doc.status === 'failed' ? 'text-rose-900' : 'text-slate-900 group-hover:text-indigo-600'}`}>{doc.name}</h3>
              <p className="text-xs text-slate-400 font-bold mt-1">
                {doc.status === 'failed' ? 'Failed' : doc.subject || 'General'} • {new Date(doc.createdAt).toLocaleDateString()}
              </p>
            </div>
          ))}
          {documents.length === 0 && (
            <div className="col-span-full py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-center px-4">
              <Upload className="w-12 h-12 text-slate-300 mb-4" />
              <h3 className="text-xl font-bold text-slate-900">Your Library is Empty</h3>
              <p className="text-slate-500 mb-6 max-w-xs">Upload your curriculum or syllabus to begin the AI pedagogical analysis.</p>
              <button onClick={() => fileInputRef.current?.click()} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:shadow-indigo-300 transition-all">Upload Now</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Documents;