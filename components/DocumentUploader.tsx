
import React, { useState, useRef } from 'react';
import { Upload, X, CheckCircle2, AlertCircle, Loader2, FileUp, RefreshCcw } from 'lucide-react';
import { uploadDocument } from '../lib/upload-handler';
import { supabase } from '../lib/supabase';
import { SubscriptionPlan } from '../types';

interface DocumentUploaderProps {
  userId: string;
  userPlan: SubscriptionPlan;
  onComplete: (doc: any) => void;
  onCancel: () => void;
}

export default function DocumentUploader({ userId, userPlan, onComplete, onCancel }: DocumentUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState(userPlan === SubscriptionPlan.FREE ? 'Free Limit: Max 5MB' : 'Select file (Max 10MB)');
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startUpload = async (file: File) => {
    setError(null);
    setIsUploading(true);

    // Enforce 5MB limit for FREE tier
    const maxSize = userPlan === SubscriptionPlan.FREE ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      setError(`Neural Overload: File exceeds the ${userPlan === SubscriptionPlan.FREE ? '5MB' : '10MB'} tier limit.`);
      setIsUploading(false);
      return;
    }

    setProgress(5);
    setStatus('Initializing...');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error("Authentication expired. Please sign in again.");
      }

      const result = await uploadDocument(file, userId, token, (p, s) => {
        setProgress(p);
        setStatus(s);
      });
      
      setTimeout(() => {
        onComplete(result);
      }, 1000);
    } catch (err: any) {
      console.error("Upload error:", err);
      setError(err.message || 'Connection issue. Please retry.');
      setIsUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      startUpload(file);
    }
  };

  const handleRetry = () => {
    if (selectedFile) startUpload(selectedFile);
  };

  const circumference = 2 * Math.PI * 45;

  return (
    <div className="bg-white rounded-[2rem] p-6 shadow-2xl border border-slate-100 w-full max-w-sm mx-auto animate-in fade-in zoom-in duration-300">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-slate-900">Upload Curriculum</h3>
        {!isUploading && (
          <button onClick={onCancel} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} className="text-slate-400" />
          </button>
        )}
      </div>

      <div className="relative flex flex-col items-center justify-center py-4">
        <svg className="w-32 h-32 -rotate-90">
          <circle cx="64" cy="64" r="45" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-slate-100" />
          <circle
            cx="64" cy="64" r="45"
            stroke="currentColor" strokeWidth="6" fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - (progress / 100) * circumference}
            strokeLinecap="round"
            className={`${error ? 'text-rose-500' : 'text-indigo-600'} transition-all duration-500 ease-out`}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
          {error ? (
            <AlertCircle size={32} className="text-rose-500" />
          ) : isUploading ? (
            <span className="text-2xl font-black text-indigo-600">
              {progress}%
            </span>
          ) : progress === 100 ? (
            <CheckCircle2 size={32} className="text-emerald-500" />
          ) : (
            <FileUp size={32} className="text-indigo-200" />
          )}
        </div>
      </div>

      <div className="text-center mt-4">
        <p className={`text-sm font-bold ${error ? 'text-rose-600' : 'text-slate-600'}`}>
          {error ? 'Upload Failed' : status}
        </p>
        {selectedFile && !error && (
          <p className="text-[10px] text-slate-400 mt-1 truncate max-w-[200px] mx-auto uppercase font-bold tracking-widest">
            {selectedFile.name}
          </p>
        )}
      </div>

      {error && (
        <div className="mt-4 p-3 bg-rose-50 border border-rose-100 rounded-xl">
          <p className="text-xs text-rose-800 font-medium leading-relaxed">{error}</p>
        </div>
      )}

      <div className="mt-6">
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
            className="w-full py-3 bg-rose-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-rose-700 active:scale-95 transition-all"
          >
            <RefreshCcw size={18} />
            Retry Upload
          </button>
        ) : !isUploading ? (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 active:scale-95 transition-all"
          >
            Choose File
          </button>
        ) : (
          <div className="w-full py-3 bg-slate-50 text-slate-400 rounded-xl font-bold text-center text-sm border-2 border-dashed border-slate-200">
            Uploading...
          </div>
        )}
      </div>
    </div>
  );
}
