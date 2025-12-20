
import React, { useState, useRef } from 'react';
import { Upload, FileText, Plus, ChevronLeft, Target, BrainCircuit, Lightbulb, BookOpen, Loader2, AlertCircle, Trash2, Lock } from 'lucide-react';
import { Document, SLO, NeuralBrain, SubscriptionPlan } from '../types';
import { geminiService } from '../services/geminiService';
import { ROLE_LIMITS } from '../constants';

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
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedDoc = documents.find(d => d.id === selectedDocId);
  const maxDocs = ROLE_LIMITS[userPlan].docs;
  const isAtDocLimit = documents.length >= maxDocs;
  const isFreePlan = userPlan === SubscriptionPlan.FREE;

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !canQuery) return;
    
    setIsProcessing(true);
    setError(null);
    const newDocId = crypto.randomUUID();

    try {
      const base64 = await fileToBase64(file);
      const newDoc: Document = {
        id: newDocId,
        userId: '', 
        name: file.name,
        base64Data: base64,
        mimeType: file.type,
        status: 'processing',
        subject: 'Pending...',
        gradeLevel: 'K-12',
        sloTags: [],
        createdAt: new Date().toISOString()
      };

      onAddDocument(newDoc);
      onQuery();

      const slos = await geminiService.generateSLOTagsFromBase64(base64, file.type, brain);
      onUpdateDocument(newDocId, { 
        status: 'completed', 
        sloTags: slos,
        subject: slos.length > 0 ? slos[0].keywords[0] : 'General'
      });
      setIsUploading(false);
    } catch (err: any) {
      setError(`Failed: ${err.message || "Unknown error"}`);
      onUpdateDocument(newDocId, { status: 'failed' });
    } finally {
      setIsProcessing(false);
    }
  };

  if (selectedDoc) {
    return (
      <div className="space-y-6">
        <button onClick={() => setSelectedDocId(null)} className="flex items-center gap-2 text-indigo-600 font-bold text-sm">
          <ChevronLeft size={16} /> Back to Library
        </button>
        <div className="bg-white rounded-2xl border p-6 shadow-sm">
          <div className="flex justify-between items-start mb-6">
            <h1 className="text-2xl font-bold">{selectedDoc.name}</h1>
            {!isFreePlan && (
              <button onClick={() => { onDeleteDocument(selectedDoc.id); setSelectedDocId(null); }} className="text-rose-500 hover:bg-rose-50 p-2 rounded-lg transition-colors">
                <Trash2 size={20} />
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {selectedDoc.sloTags.map((slo) => (
              <div key={slo.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 block mb-2">{slo.bloomLevel}</span>
                <p className="text-sm text-slate-700 leading-relaxed">{slo.content}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Curriculum Library</h1>
          <p className="text-slate-500">Manage your pedagogical source documents.</p>
        </div>
        <button 
          onClick={() => setIsUploading(true)} 
          disabled={isAtDocLimit}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all ${isAtDocLimit ? 'bg-slate-200 text-slate-500' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200'}`}
        >
          {isAtDocLimit ? <Lock size={18} /> : <Plus size={18} />}
          {isAtDocLimit ? 'Library Full' : 'Upload File'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {documents.map(doc => (
          <div key={doc.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600">
                <FileText size={24} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setSelectedDocId(doc.id)} className="text-indigo-600 hover:bg-indigo-50 p-2 rounded-lg transition-colors"><ChevronLeft className="rotate-180" size={18} /></button>
                {!isFreePlan && <button onClick={() => onDeleteDocument(doc.id)} className="text-slate-400 hover:text-rose-500 p-2 rounded-lg transition-colors"><Trash2 size={18} /></button>}
              </div>
            </div>
            <h3 className="font-bold text-slate-900 truncate mb-1">{doc.name}</h3>
            <div className="mt-auto pt-4 flex items-center justify-between">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${doc.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {doc.status.toUpperCase()}
              </span>
              <span className="text-[10px] text-slate-400 font-bold">{new Date(doc.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>

      {isUploading && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-8 animate-in zoom-in-95 duration-200">
            <h2 className="text-xl font-bold mb-2">Analyze New Curriculum</h2>
            <p className="text-slate-500 text-sm mb-6">Select a pedagogical document to extract SLOs and align with Bloom's Taxonomy.</p>
            <div 
              onClick={() => !isProcessing && fileInputRef.current?.click()}
              className={`border-3 border-dashed border-slate-200 rounded-2xl p-12 text-center cursor-pointer hover:border-indigo-400 transition-colors bg-slate-50 ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}
            >
              {isProcessing ? <Loader2 className="animate-spin mx-auto w-10 h-10 text-indigo-500" /> : <Upload className="mx-auto w-10 h-10 text-indigo-400 mb-4" />}
              <p className="font-bold text-slate-700">{isProcessing ? 'Gemini is thinking...' : 'Click to Browse Files'}</p>
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
            </div>
            <button onClick={() => setIsUploading(false)} className="w-full mt-4 py-3 font-bold text-slate-400 hover:text-slate-600">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Documents;
