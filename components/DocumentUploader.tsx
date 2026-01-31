'use client';

import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertCircle, Loader2, BrainCircuit, RefreshCw, UploadCloud, Zap, Database, Search, FileText } from 'lucide-react';
import { SubscriptionPlan } from '../types';
import { supabase } from '../lib/supabase';

export default function DocumentUploader({ userId, onComplete, onCancel }: any) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [docId, setDocId] = useState<string | null>(null);

  // Status Poller
  useEffect(() => {
    let poller: any;
    if (docId && isUploading) {
      poller = setInterval(async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const res = await fetch(`/api/docs/status/${docId}`, {
            headers: { 'Authorization': `Bearer ${session?.access_token}` }
          });
          
          if (!res.ok) return; // Keep polling if transient error

          const data = await res.json();
          
          if (data.status === 'ready' || data.status === 'completed') {
            clearInterval(poller);
            setProgress(100);
            setStatus('Neural Sync Complete!');
            setTimeout(() => onComplete(data), 1500);
          } else if (data.status === 'failed') {
            clearInterval(poller);
            setError(data.error || 'Neural Extraction Fault.');
            setIsUploading(false);
          } else {
            // Simulated progress steps based on backend flags
            const p = data.metadata?.indexed ? 85 : 45;
            setProgress(p);
            setStatus(`Processing: ${data.summary || 'Extracting intelligence...'}`);
          }
        } catch (e) {
          console.error("Polling Error:", e);
        }
      }, 3000);
    }
    return () => clearInterval(poller);
  }, [docId, isUploading, onComplete]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side guard for Gateway limits
    if (file.size > 4.5 * 1024 * 1024) {
      setError("File exceeds 4.5MB gateway limit. Please use a smaller PDF or a optimized version for synthesis.");
      return;
    }

    setError(null);
    setIsUploading(true);
    setProgress(10);
    setStatus('Archiving PDF to Cloud Vault...');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', file.name.replace(/\.[^/.]+$/, ""));

      const response = await fetch('/api/docs/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
        body: formData
      });

      // SAFE JSON PARSING
      const contentType = response.headers.get("content-type");
      if (!response.ok) {
        if (contentType && contentType.includes("application/json")) {
          const errData = await response.json();
          throw new Error(errData.error || 'Upload rejected.');
        } else {
          const rawText = await response.text();
          if (response.status === 413 || rawText.includes("Too Large")) {
            throw new Error("Payload too large: Vercel limits request bodies to 4.5MB.");
          }
          throw new Error(`Cloud Node Error (${response.status})`);
        }
      }

      const data = await response.json();
      setDocId(data.documentId);
      setProgress(25);
      setStatus('Triggering Neural Indexer...');

      // Initiate Processing Node (Fire and forget - we poll status)
      fetch(`/api/docs/process/${data.documentId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` }
      }).catch(err => console.warn("Background process trigger warning:", err));

    } catch (err: any) {
      setError(err.message || "An unexpected neural handshake error occurred.");
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-[3rem] p-10 md:p-16 w-full max-w-2xl shadow-2xl border dark:border-white/5 text-center relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500" />
      
      <div className="space-y-8 text-left">
        <div className="w-20 h-20 bg-indigo-600 text-white rounded-[2.5rem] flex items-center justify-center shadow-2xl relative">
           {isUploading ? <BrainCircuit size={40} className="animate-pulse" /> : <UploadCloud size={40} />}
           {isUploading && <div className="absolute inset-0 border-4 border-white/20 border-t-white rounded-[2.5rem] animate-spin" />}
        </div>

        <div>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight uppercase">Neural Ingestion</h2>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mt-2">Async Cloud Architecture Node</p>
        </div>

        {error ? (
          <div className="p-6 bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/50 rounded-3xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-start gap-3 text-rose-600">
               <AlertCircle size={20} className="shrink-0 mt-0.5" />
               <p className="text-xs font-bold leading-relaxed">{error}</p>
            </div>
            <button 
              onClick={() => {setError(null); setIsUploading(false); setProgress(0);}} 
              className="px-6 py-2.5 bg-rose-100 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all active:scale-95"
            >
              <RefreshCw size={12}/> Retry Ingestion
            </button>
          </div>
        ) : isUploading ? (
          <div className="space-y-6 py-4">
             <div className="h-3 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden shadow-inner">
                <div className="h-full bg-indigo-600 transition-all duration-1000 rounded-full shadow-[0_0_10px_rgba(79,70,229,0.5)]" style={{ width: `${progress}%` }} />
             </div>
             <div className="flex flex-col gap-1">
               <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-600 animate-pulse">{status}</p>
               <p className="text-[9px] font-bold text-slate-400">Handshake Active • Vercel Edge Node Linked</p>
             </div>
          </div>
        ) : (
          <label className="group relative cursor-pointer block">
            <input type="file" className="hidden" accept=".pdf" onChange={handleFileUpload} />
            <div className="p-16 border-4 border-dashed border-slate-100 dark:border-white/5 rounded-[3.5rem] group-hover:border-indigo-500/50 transition-all bg-slate-50/50 dark:bg-white/5 hover:bg-white dark:hover:bg-slate-800/50">
              <UploadCloud size={64} className="text-slate-300 group-hover:text-indigo-500 transition-all mx-auto mb-6" />
              <p className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight text-center">Select Curriculum PDF</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2 text-center">Max 4.5MB • Standards-Aligned Indexing</p>
            </div>
          </label>
        )}
      </div>

      <div className="mt-10 pt-10 border-t dark:border-white/5 grid grid-cols-3 gap-4">
         <div className="space-y-1">
            <Database size={16} className="mx-auto text-slate-300" />
            <p className="text-[8px] font-black text-slate-400 uppercase">R2 Vault</p>
         </div>
         <div className="space-y-1">
            <Search size={16} className="mx-auto text-slate-300" />
            <p className="text-[8px] font-black text-slate-400 uppercase">SLO Audit</p>
         </div>
         <div className="space-y-1">
            <Zap size={16} className="mx-auto text-slate-300" />
            <p className="text-[8px] font-black text-slate-400 uppercase">Vector Grid</p>
         </div>
      </div>
    </div>
  );
}