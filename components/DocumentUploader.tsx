
'use client';

import React, { useState, useEffect } from 'react';
import { BrainCircuit, RefreshCw, UploadCloud, AlertCircle, ShieldCheck, Database, Search, Zap, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import * as pdfjs from 'pdfjs-dist';

if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;
}

export default function DocumentUploader({ userId, onComplete, onCancel }: any) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [docId, setDocId] = useState<string | null>(null);

  useEffect(() => {
    let poller: any;
    if (docId && isUploading && progress >= 40) {
      poller = setInterval(async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const res = await fetch(`/api/docs/status/${docId}`, {
            headers: { 'Authorization': `Bearer ${session?.access_token}` }
          });
          if (!res.ok) return;
          const data = await res.json();
          
          if (data.status === 'ready' || data.status === 'completed') {
            clearInterval(poller);
            setProgress(100);
            setStatus('Neural Alignment Complete!');
            setTimeout(() => onComplete(data), 1500);
          } else if (data.status === 'failed') {
            clearInterval(poller);
            setError(data.error || 'A critical processing node encountered a fault.');
            setIsUploading(false);
          } else {
            // Adaptive progress visualization
            let p = 50;
            if (data.summary?.includes('Linearizing')) p = 65;
            if (data.status === 'indexing') p = 85;
            
            setProgress(Math.max(progress, p));
            setStatus(data.summary || 'Processing...');
          }
        } catch (e) {
          console.error("Polling sync error:", e);
        }
      }, 2000);
    }
    return () => clearInterval(poller);
  }, [docId, isUploading, progress, onComplete]);

  const extractTextLocally = async (file: File): Promise<string> => {
    try {
      if (file.type !== 'application/pdf') return "";
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map((item: any) => item.str || "").join(" ") + "\n";
      }
      return fullText;
    } catch (err) {
      return "";
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      setError("File exceeds 50MB institutional limit.");
      return;
    }

    setError(null);
    setIsUploading(true);
    setProgress(5);
    setStatus('Local Extracting...');

    try {
      const extractedText = await extractTextLocally(file);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Authentication offline.");
      
      const detectedType = file.type || 'application/pdf';

      setProgress(15);
      setStatus('Neural Handshake...');
      const handshake = await fetch('/api/docs/upload', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          name: file.name.replace(/\.[^/.]+$/, ""), 
          contentType: detectedType,
          extractedText: extractedText 
        })
      });

      if (!handshake.ok) throw new Error("Grid handshake refused.");
      const { uploadUrl, documentId } = await handshake.json();
      setDocId(documentId);
      
      setProgress(25);
      setStatus('Streaming Binary Vault...');
      const uploadRes = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': detectedType } });
      if (!uploadRes.ok) throw new Error("Vault upload failed.");

      setProgress(40);
      setStatus('Initializing Universal Pipeline...');
      await fetch(`/api/docs/process/${documentId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` }
      });

    } catch (err: any) {
      setError(err.message || "Ingestion fault.");
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-[3rem] p-10 md:p-16 w-full max-w-2xl shadow-2xl border dark:border-white/5 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500" />
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div className="w-16 h-16 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-xl relative">
             {isUploading ? <BrainCircuit size={32} className="animate-pulse" /> : <UploadCloud size={32} />}
          </div>
          <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-100 flex items-center gap-2">
             <ShieldCheck size={16} className="text-emerald-500" />
             <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Enterprise Ingestion</span>
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase">Curriculum Engine</h2>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mt-2">Universal Extraction v25.0</p>
        </div>

        {error ? (
          <div className="p-6 bg-rose-50 dark:bg-rose-950/30 border border-rose-100 rounded-2xl space-y-4">
            <div className="flex items-start gap-3 text-rose-600">
               <AlertCircle size={20} className="shrink-0 mt-0.5" />
               <p className="text-xs font-bold">{error}</p>
            </div>
            <button onClick={() => {setError(null); setIsUploading(false);}} className="text-[10px] font-black uppercase tracking-widest text-rose-600 underline">Try Again</button>
          </div>
        ) : isUploading ? (
          <div className="space-y-4 py-4">
             <div className="h-2 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-600 transition-all duration-700" style={{ width: `${progress}%` }} />
             </div>
             <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 animate-pulse">{status}</p>
          </div>
        ) : (
          <label className="group relative cursor-pointer block">
            <input type="file" className="hidden" accept=".pdf" onChange={handleFileUpload} />
            <div className="py-20 border-2 border-dashed border-slate-200 dark:border-white/10 rounded-[2.5rem] group-hover:border-indigo-500 transition-all bg-slate-50/50 dark:bg-white/5 text-center">
              <UploadCloud size={48} className="text-slate-300 group-hover:text-indigo-500 transition-all mx-auto mb-4" />
              <p className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">Drop Curriculum PDF</p>
              <p className="text-[9px] font-bold text-slate-400 uppercase mt-2">Max 50MB per identity node</p>
            </div>
          </label>
        )}
      </div>
    </div>
  );
}
