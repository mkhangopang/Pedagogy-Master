import React, { useState, useRef } from 'react';
import { Upload, X, CheckCircle2, AlertCircle, Loader2, FileUp, RefreshCcw } from 'lucide-react';
import { uploadDocument } from '../lib/upload-handler';

interface DocumentUploaderProps {
  userId: string;
  onComplete: (doc: any) => void;
  onCancel: () => void;
}

export default function DocumentUploader({ userId, onComplete, onCancel }: DocumentUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Select curriculum file');
  const [error, setError] = useState<string | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startUpload = async (file: File) => {
    setIsUploading(true);
    setError(null);
    setProgress(5);
    setStatus('Initializing handshake...');

    try {
      const result = await uploadDocument(file, userId, (p, s) => {
        setProgress(p);
        setStatus(s);
      });
      
      // Delay slightly for success animation
      setTimeout(() => {
        onComplete(result);
      }, 1000);
    } catch (err: any) {
      console.error("Upload process failure:", err);
      setError(err.message || 'Connection interrupted. Please try again.');
      setIsUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCurrentFile(file);
      startUpload(file);
    }
  };

  const handleRetry = () => {
    if (currentFile) startUpload(currentFile);
  };

  const circumference = 2 * Math.PI * 45;

  return (
    <div className="bg-white rounded-[2.5rem] p-8 shadow-2xl border border-slate-100 w-full max-w-sm mx-auto animate-in fade-in zoom-in duration-300">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h3 className="text-xl font-bold text-slate-900 tracking-tight">Cloud Ingest</h3>
          {currentFile && <p className="text-[10px] text-slate-400 truncate max-w-[150px] font-bold uppercase">{currentFile.name}</p>}
        </div>
        {!isUploading && (
          <button 
            onClick={onCancel} 
            className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
          >
            <X size={20} />
          </button>
        )}
      </div>

      <div className="relative flex flex-col items-center justify-center py-4">
        <svg className="w-40 h-40 -rotate-90">
          <circle
            cx="80" cy="80" r="45"
            stroke="currentColor"
            strokeWidth="8"
            fill="transparent"
            className="text-slate-100"
          />
          <circle
            cx="80" cy="80" r="45"
            stroke="currentColor"
            strokeWidth="8"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - (progress / 100) * circumference}
            strokeLinecap="round"
            className={`${error ? 'text-rose-500' : 'text-indigo-600'} transition-all duration-500 ease-out`}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
          {error ? (
            <AlertCircle size={40} className="text-rose-500 animate-in bounce-in" />
          ) : isUploading ? (
            <span className="text-3xl font-black text-indigo-600 tabular-nums">
              {progress}<span className="text-sm opacity-50">%</span>
            </span>
          ) : progress === 100 ? (
            <CheckCircle2 size={40} className="text-emerald-500 animate-in zoom-in" />
          ) : (
            <FileUp size={40} className="text-indigo-200" />
          )}
        </div>
      </div>

      <div className="text-center mt-6 min-h-[3.5rem]">
        <p className={`text-sm font-bold tracking-tight ${error ? 'text-rose-500' : 'text-slate-600'}`}>
          {error ? 'Handshake Failed' : status}
        </p>
        {isUploading && (
          <div className="flex items-center justify-center gap-2 text-indigo-400 mt-2">
            <Loader2 size={12} className="animate-spin" />
            <span className="text-[10px] uppercase font-black tracking-widest">Secure Handshake Active</span>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-start gap-3 animate-in slide-in-from-top-2">
          <AlertCircle size={16} className="text-rose-500 shrink-0 mt-0.5" />
          <p className="text-[10px] text-rose-800 font-bold leading-relaxed">{error}</p>
        </div>
      )}

      <div className="mt-8">
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          className="hidden" 
          accept=".pdf,.doc,.docx,.txt,.jpg,.png"
          disabled={isUploading}
        />
        
        {error ? (
          <button
            onClick={handleRetry}
            className="w-full py-4 bg-rose-600 text-white rounded-2xl font-black shadow-xl shadow-rose-200 hover:bg-rose-700 transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <RefreshCcw size={18} />
            Retry Connection
          </button>
        ) : !isUploading ? (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-xl shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-95"
          >
            Select Node
          </button>
        ) : (
          <div className="w-full py-4 bg-slate-50 text-slate-400 rounded-2xl font-black text-center text-sm border-2 border-dashed border-slate-200">
            Node Locked
          </div>
        )}
      </div>
      
      <p className="mt-6 text-[9px] text-center text-slate-400 font-bold uppercase tracking-[0.2em] opacity-60">
        AES-256 Encrypted Cloud Channel
      </p>
    </div>
  );
}