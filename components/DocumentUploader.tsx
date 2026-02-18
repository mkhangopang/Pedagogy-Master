'use client';

import React, { useState, useEffect, useRef } from 'react';
import { BrainCircuit, UploadCloud, AlertCircle, ShieldCheck, Database, Zap, Loader2, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import * as pdfjs from 'pdfjs-dist';

if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs`;
}

export default function DocumentUploader({ userId, onComplete, onCancel }: any) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  
  const isPolling = useRef(false);

  useEffect(() => {
    if (docId && isUploading && !isPolling.current) {
      isPolling.current = true;
      const poller = setInterval(async () => {
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
            isPolling.current = false;
            setProgress(100);
            setStatus('Neural Alignment Verified!');
            setTimeout(() => onComplete(data), 1000);
          } else if (data.status === 'failed') {
            clearInterval(poller);
            isPolling.current = false;
            setError(data.error || 'Extraction Fault Detected.');
            setIsUploading(false);
          } else {
            setProgress(prev => Math.max(prev, data.progress || 50));
            setStatus(data.summary || 'Unrolling Curriculum Domains...');
          }
        } catch (e) {
          console.error("Poller Error:", e);
        }
      }, 2500); // More aggressive polling for high-end feel

      return () => {
        clearInterval(poller);
        isPolling.current = false;
      };
    }
  }, [docId, isUploading, onComplete]);

  const extractTextLocally = async (file: File): Promise<string> => {
    try {
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
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
      }
      return await file.text();
    } catch (err) { return ""; }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 100 * 1024 * 1024) {
      setError("File exceeds institutional limit (100MB).");
      return;
    }

    setError(null);
    setIsUploading(true);
    setProgress(5);
    setStatus('Handshaking with Grid...');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Auth Node Offline.");

      setStatus('Pre-extracting Curriculum...');
      const extractedText = await extractTextLocally(file);
      
      setProgress(20);
      setStatus('Securing Cloud Storage...');
      const handshake = await handshakeWithGateway(file.name, file.type || 'application/pdf', extractedText, session.access_token);
      const { uploadUrl, documentId } = handshake;
      setDocId(documentId);
      
      setProgress(30);
      setStatus('Streaming Binary Payload...');
      
      const uploadRes = await fetch(uploadUrl, { 
        method: 'PUT', 
        body: file, 
        headers: { 'Content-Type': file.type || 'application/pdf' } 
      });
      
      if (!uploadRes.ok) throw new Error("R2 Gateway Refusal.");

      setProgress(40);
      setStatus('Initializing Extraction Engine...');
      
      // CRITICAL: Explicitly trigger background processing to prevent binary payload hang
      await fetch(`/api/docs/process/${documentId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

    } catch (err: any) {
      setError(err.message || "Neural Gateway Failure.");
      setIsUploading(false);
    }
  };

  async function handshakeWithGateway(name: string, contentType: string, extractedText: string, token: string) {
    const handshake = await fetch('/api/docs/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, contentType, extractedText })
    });
    if (!handshake.ok) throw new Error("Gateway Refusal.");
    return await handshake.json();
  }

  return (
    <div className="bg-white dark:bg-[#0d0d0d] rounded-[3rem] p-6 md:p-12 w-full max-w-xl shadow-2xl border border-slate-100 dark:border-white/5 relative overflow-hidden text-left">
      <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500" />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-xl">
             {isUploading ? <Loader2 size={24} className="animate-spin" /> : <UploadCloud size={24} />}
          </div>
          <div className="px-3 py-1 bg-emerald-50 dark:bg-emerald-950/30 rounded-full border border-emerald-100 dark:border-emerald-500/20 flex items-center gap-1.5">
             <Zap size={12} className="text-emerald-500" />
             <span className="text-[8px] font-bold uppercase tracking-widest text-emerald-600">Secure Sync v160</span>
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white uppercase tracking-tight">Curriculum Ingestor</h2>
          <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest mt-1">Institutional Standards Alignment</p>
        </div>

        {error ? (
          <div className="p-6 bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/30 rounded-2xl space-y-4 animate-in slide-in-from-top-2">
            <div className="flex items-start gap-3 text-rose-600">
               <AlertCircle size={20} className="shrink-0 mt-0.5" />
               <div className="space-y-1">
                 <p className="text-xs font-bold uppercase tracking-tight">Sync Fault</p>
                 <p className="text-[10px] font-medium leading-relaxed opacity-90">{error}</p>
               </div>
            </div>
            <button onClick={() => {setError(null); setIsUploading(false); setProgress(0); setDocId(null);}} className="w-full py-3 bg-rose-600 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-lg active:scale-95 transition-all">Re-Sync Node</button>
          </div>
        ) : isUploading ? (
          <div className="space-y-4 py-2">
             <div className="h-2.5 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden shadow-inner">
                <div className="h-full bg-indigo-600 rounded-full transition-all duration-700 ease-out" style={{ width: `${progress}%` }} />
             </div>
             <div className="flex items-center gap-2">
               <Loader2 size={12} className="text-indigo-600 animate-spin" />
               <p className="text-[9px] font-black uppercase tracking-widest text-indigo-600">{status}</p>
             </div>
          </div>
        ) : (
          <label className="group relative cursor-pointer block">
            <input type="file" className="hidden" accept=".pdf,.txt,.md" onChange={handleFileUpload} />
            <div className="py-16 md:py-20 border-2 border-dashed border-slate-200 dark:border-white/10 rounded-[2.5rem] group-hover:border-indigo-500 transition-all bg-slate-50/30 dark:bg-white/5 text-center">
              <UploadCloud size={48} className="text-slate-300 group-hover:text-indigo-600 transition-all mx-auto mb-4" />
              <p className="text-lg font-bold text-slate-900 dark:text-white uppercase tracking-tight">Ingest Asset</p>
              <p className="text-[8px] font-semibold text-slate-400 uppercase mt-1 tracking-widest opacity-60">High-Fidelity PDF/MD Processor</p>
            </div>
          </label>
        )}
      </div>
    </div>
  );
}