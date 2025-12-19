
import React, { useState, useRef } from 'react';
import { Upload, FileText, Plus, ChevronLeft, Target, BrainCircuit, Lightbulb, BookOpen, Loader2, AlertCircle } from 'lucide-react';
import { Document, SLO, NeuralBrain } from '../types';
import { geminiService } from '../services/geminiService';

interface DocumentsProps {
  documents: Document[];
  onAddDocument: (doc: Document) => void;
  onUpdateDocument: (id: string, updates: Partial<Document>) => void;
  brain: NeuralBrain;
  onQuery: () => void;
  canQuery: boolean;
}

const Documents: React.FC<DocumentsProps> = ({ documents, onAddDocument, onUpdateDocument, brain, onQuery, canQuery }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedDoc = documents.find(d => d.id === selectedDocId);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!canQuery) {
      setError("Usage limit reached. Please upgrade to upload more documents.");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const base64 = await fileToBase64(file);
      
      const newDocId = crypto.randomUUID();
      const newDoc: Document = {
        id: newDocId,
        userId: 'temp-user', 
        name: file.name,
        base64Data: base64,
        mimeType: file.type,
        status: 'processing',
        subject: 'Pending Analysis',
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
        subject: slos.length > 0 ? slos[0].keywords[0] || 'General' : 'General'
      });
      
      setIsUploading(false);
    } catch (err: any) {
      console.error(err);
      setError(`Processing failed: ${err.message || "Unknown error"}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const getBloomColor = (level: string) => {
    const l = level.toLowerCase();
    if (l.includes('remember')) return 'bg-slate-100 text-slate-700 border-slate-200';
    if (l.includes('understand')) return 'bg-blue-100 text-blue-700 border-blue-200';
    if (l.includes('apply')) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (l.includes('analyze')) return 'bg-amber-100 text-amber-700 border-amber-200';
    if (l.includes('evaluate')) return 'bg-rose-100 text-rose-700 border-rose-200';
    if (l.includes('create')) return 'bg-purple-100 text-purple-700 border-purple-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  if (selectedDoc) {
    return (
      <div className="space-y-6 animate-in slide-in-from-right duration-300">
        <header className="flex items-center gap-4">
          <button onClick={() => setSelectedDocId(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{selectedDoc.name}</h1>
            <p className="text-slate-500 text-sm">Pedagogical Analysis • Status: {selectedDoc.status.toUpperCase()}</p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BrainCircuit className="w-5 h-5 text-indigo-600" />
                  <h2 className="font-bold text-slate-800">Learning Outcome Matrix</h2>
                </div>
                {selectedDoc.status === 'processing' && <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />}
              </div>
              
              <div className="divide-y divide-slate-100">
                {selectedDoc.status === 'processing' ? (
                  <div className="p-20 text-center space-y-4">
                    <Loader2 className="w-10 h-10 animate-spin text-indigo-500 mx-auto" />
                    <p className="text-slate-500 font-medium">Gemini is analyzing the curriculum using multimodal vision...</p>
                  </div>
                ) : selectedDoc.sloTags.length > 0 ? (
                  selectedDoc.sloTags.map((slo) => (
                    <div key={slo.id} className="p-6 hover:bg-slate-50 transition-colors">
                      <div className="flex items-start justify-between mb-3">
                        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${getBloomColor(slo.bloomLevel)}`}>
                          {slo.bloomLevel}
                        </span>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5, 6].map((step) => (
                            <div key={step} className={`w-4 h-1.5 rounded-full ${step <= slo.cognitiveComplexity ? 'bg-indigo-500' : 'bg-slate-200'}`} />
                          ))}
                        </div>
                      </div>
                      <p className="text-slate-800 font-medium leading-relaxed mb-4">{slo.content}</p>
                      <div className="flex flex-wrap gap-4 text-xs">
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <Target className="w-3.5 h-3.5" />
                          <span>Focus: {slo.keywords.join(', ')}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-indigo-600 font-bold">
                          <Lightbulb className="w-3.5 h-3.5" />
                          <span>Assessment: {slo.suggestedAssessment}</span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-12 text-center text-slate-400">
                    <AlertCircle className="w-10 h-10 mx-auto mb-2 opacity-20" />
                    <p>No outcomes detected in the processed file.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h3 className="font-bold mb-4 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-500" />
                Actions
              </h3>
              <div className="space-y-3">
                <button className="w-full text-left p-3 rounded-xl bg-slate-50 hover:bg-indigo-50 hover:text-indigo-600 transition-all font-medium text-sm">
                  Contextual Chat
                </button>
                <button className="w-full text-left p-3 rounded-xl bg-slate-50 hover:bg-indigo-50 hover:text-indigo-600 transition-all font-medium text-sm">
                  Create Quiz
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Curriculum Library</h1>
          <p className="text-slate-500">Upload PDF/DOCX files directly for intelligent multimodal analysis.</p>
        </div>
        <button 
          onClick={() => setIsUploading(true)} 
          disabled={!canQuery}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold shadow-lg transition-all ${canQuery ? 'bg-indigo-600 text-white shadow-indigo-600/20 hover:bg-indigo-700' : 'bg-slate-200 text-slate-500 cursor-not-allowed'}`}
        >
          <Plus className="w-5 h-5" />
          Add Curriculum
        </button>
      </header>

      {error && (
        <div className="bg-rose-50 border border-rose-100 text-rose-700 p-4 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {documents.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-20 text-center space-y-4">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
            <Upload className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-700">Empty Library</h2>
          <p className="text-slate-500 max-w-sm mx-auto">Multimodal Gemini AI analyzes your pedagogical documents instantly.</p>
          <button onClick={() => setIsUploading(true)} disabled={!canQuery} className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold disabled:opacity-50">Upload Now</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {documents.map((doc) => (
            <div key={doc.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden hover:shadow-md transition-all group flex flex-col">
              <div className="p-6 flex-1">
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-3 rounded-xl transition-colors ${doc.status === 'processing' ? 'bg-slate-100' : 'bg-indigo-50 group-hover:bg-indigo-600'}`}>
                    {doc.status === 'processing' ? <Loader2 className="w-6 h-6 animate-spin text-slate-400" /> : <FileText className="w-6 h-6 text-indigo-600 group-hover:text-white" />}
                  </div>
                </div>
                <h3 className="text-lg font-bold text-slate-900 truncate">{doc.name}</h3>
                <p className="text-sm text-slate-500 mt-1">{doc.subject} • {doc.status}</p>
              </div>
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-400">{new Date(doc.createdAt).toLocaleDateString()}</span>
                <button onClick={() => setSelectedDocId(doc.id)} className="text-sm font-bold text-indigo-600">Open Analysis</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {isUploading && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl p-8 animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">Process Document</h2>
              <button onClick={() => setIsUploading(false)} className="text-3xl leading-none hover:text-rose-500">×</button>
            </div>
            <div 
              onClick={() => !isProcessing && fileInputRef.current?.click()}
              className={`border-2 border-dashed border-slate-200 rounded-2xl p-12 flex flex-col items-center gap-4 transition-colors cursor-pointer bg-slate-50 group ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'hover:border-indigo-400'}`}
            >
              <div className="p-4 bg-white rounded-full shadow-sm group-hover:scale-110 transition-transform">
                {isProcessing ? <Loader2 className="w-8 h-8 animate-spin text-indigo-500" /> : <Upload className="w-8 h-8 text-indigo-500" />}
              </div>
              <div className="text-center">
                <p className="font-semibold text-slate-900">{isProcessing ? 'Gemini is processing file...' : 'Upload for AI Analysis'}</p>
                <p className="text-sm text-slate-500 mt-1">PDF, DOCX, or Text (Max 20MB)</p>
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={handleFileUpload}
                disabled={isProcessing}
                accept=".txt,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" 
              />
            </div>
            {isProcessing && (
              <div className="mt-4 p-3 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-medium animate-pulse">
                Pedagogy Master is uploading and analyzing your document. Do not refresh.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Documents;
