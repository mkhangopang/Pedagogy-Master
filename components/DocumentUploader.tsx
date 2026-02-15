'use client';

import React, { useState, useEffect } from 'react';
import { BrainCircuit, UploadCloud, AlertCircle, ShieldCheck, Database, Zap, Loader2, Info } from 'lucide-react';
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
          if (!session) return;
          
          const res = await fetch(`/api/docs/status/${docId}`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
          });
          if (!res.ok) return;
          const data = await res.json();
          
          if (data.status === 'ready' || data.status === 'completed') {
            clearInterval(poller);
            setProgress(100);
            setStatus('Neural Alignment Complete!');
            setTimeout(() => onComplete(data), 1000);
          } else if (data.status === 'failed') {
            clearInterval(poller);
            setError(data.error || 'The neural processor encountered a logic fault.');
            setIsUploading(false);
          } else {
            let p = Math.max(progress, data.progress || 50);
            setProgress(p);
            setStatus(data.summary || 'Unrolling columns...');
          }
        } catch (e) {
          console.error("Polling error:", e);
        }
      }, 3000);
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
      console.warn("Local extraction node failed:", err);
      return "";
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      setError("File exceeds 50MB limit.");
      return;
    }

    setError(null);
    setIsUploading(true);
    setProgress(5);
    setStatus('Initializing nodes...');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Session expired. Please sign in.");

      // 1. Extraction Node
      setStatus('Pre-extracting curriculum text...');
      const extractedText = await extractTextLocally(file);
      
      // 2. Cloud Handshake
      setProgress(20);
      setStatus('Securing cloud handshake...');
      const contentType = file.type || 'application/pdf';
      
      const handshake = await fetch('/api/docs/upload', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          name: file.name, 
          contentType,
          extractedText: extractedText 
        })
      });

      if (!handshake.ok) {
        const errData = await handshake.json().catch(() => ({}));
        throw new Error(errData.error || "Handshake node refusal.");
      }
      
      const { uploadUrl, documentId } = await handshake.json();
      setDocId(documentId);
      
      // 3. Binary Bridge (CRITICAL: Header Sync)
      setProgress(30);
      setStatus('Streaming binary payload...');
      
      const uploadRes = await fetch(uploadUrl, { 
        method: 'PUT', 
        body: file, 
        headers: { 
          'Content-Type': contentType // MUST match handshake contentType exactly
        } 
      });
      
      if (!uploadRes.ok) {
        throw new Error(`Cloud storage refusal: ${uploadRes.statusText}`);
      }

      // 4. Activate Pipeline
      setProgress(40);
      setStatus('Neural unrolling initialized...');
      await fetch(`/api/docs/process/${documentId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

    } catch (err: any) {
      console.error("❌ Ingestion Node Fault:", err);
      setError(err.message || "Binary stream node failure.");
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-[#0d0d0d] rounded-[3.5rem] p-8 md:p-16 w-full max-w-2xl shadow-[0_32px_128px_-16px_rgba(0,0,0,0.5)] border-2 border-slate-100 dark:border-white/5 relative overflow-hidden text-left">
      <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-600 via-purple-600 to-emerald-600" />
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div className="w-16 h-16 bg-indigo-600 text-white rounded-[1.5rem] flex items-center justify-center shadow-2xl relative rotate-3 group-hover:rotate-0 transition-transform">
             {isUploading ? <BrainCircuit size={32} className="animate-pulse" /> : <UploadCloud size={32} />}
          </div>
          <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-100 dark:border-emerald-500/20 flex items-center gap-2">
             <ShieldCheck size={16} className="text-emerald-500" />
             <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Secure Protocol v130</span>
          </div>
        </div>

        <div>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Curriculum Ingestor</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-2">Sequential Grade Unrolling Active</p>
        </div>

        {error ? (
          <div className="p-8 bg-rose-50 dark:bg-rose-950/30 border-2 border-rose-100 dark:border-rose-900/30 rounded-[2.5rem] space-y-6 animate-in slide-in-from-top-2">
            <div className="flex items-start gap-4 text-rose-600">
               <AlertCircle size={24} className="shrink-0 mt-0.5" />
               <div className="space-y-1">
                 <p className="text-sm font-black uppercase tracking-tight">Handshake Fault</p>
                 <p className="text-xs font-bold opacity-80 leading-relaxed">{error}</p>
               </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => {setError(null); setIsUploading(false);}} className="flex-1 py-4 bg-rose-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all">Retry Link</button>
              <button onClick={onCancel} className="flex-1 py-4 bg-slate-100 dark:bg-white/5 text-slate-500 rounded-2xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all">Abort</button>
            </div>
          </div>
        ) : isUploading ? (
          <div className="space-y-6 py-4">
             <div className="h-4 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden shadow-inner p-1">
                <div className="h-full bg-indigo-600 rounded-full transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(79,70,229,0.5)]" style={{ width: `${progress}%` }} />
             </div>
             <div className="flex items-center gap-3">
               <Loader2 size={16} className="text-indigo-600 animate-spin" />
               <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600 animate-pulse">{status}</p>
             </div>
             <div className="p-5 bg-indigo-50 dark:bg-indigo-900/10 rounded-[2rem] border border-indigo-100 dark:border-indigo-800/30 flex gap-4">
                <Info size={20} className="text-indigo-600 shrink-0" />
                <p className="text-[10px] font-bold text-slate-500 leading-relaxed">Synthesis of multi-column Sindh Progression Grids requires vertical unrolling. This takes 2-5 minutes to ensure 100% RAG fidelity.</p>
             </div>
          </div>
        ) : (
          <label className="group relative cursor-pointer block">
            <input type="file" className="hidden" accept=".pdf" onChange={handleFileUpload} />
            <div className="py-20 md:py-28 border-3 border-dashed border-slate-200 dark:border-white/10 rounded-[3rem] group-hover:border-indigo-600 transition-all bg-slate-50/50 dark:bg-white/5 text-center group-hover:bg-indigo-50/50 dark:group-hover:bg-indigo-900/10">
              <UploadCloud size={64} className="text-slate-300 group-hover:text-indigo-600 transition-all mx-auto mb-6 group-hover:scale-110" />
              <p className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Drop Multi-Grade Ledger</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase mt-2 tracking-widest opacity-60">PDF Support • Standard Alignment Mode</p>
            </div>
          </label>
        )}
      </div>
    </div>
  );
}