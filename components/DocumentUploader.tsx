'use client';

import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertCircle, Loader2, BrainCircuit, RefreshCw, UploadCloud, Zap, Database, Search, FileText, ShieldCheck, Copy, Check, Globe } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function DocumentUploader({ userId, onComplete, onCancel }: any) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const REPAIR_SQL = `ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS document_summary TEXT, ADD COLUMN IF NOT EXISTS difficulty_level TEXT, ADD COLUMN IF NOT EXISTS rag_indexed BOOLEAN DEFAULT false, ADD COLUMN IF NOT EXISTS extracted_text TEXT, ADD COLUMN IF NOT EXISTS is_selected BOOLEAN DEFAULT false;`;

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
          
          // Neural Sync complete or failed transitions
          if (data.status === 'ready' || data.status === 'completed') {
            clearInterval(poller);
            setProgress(100);
            setStatus('Neural Sync Complete!');
            setTimeout(() => onComplete(data), 1000);
          } else if (data.status === 'failed') {
            clearInterval(poller);
            setError(data.error || 'Neural Extraction Fault.');
            setIsUploading(false);
          } else {
            // Update UI with latest summary from backend
            let p = 55;
            if (data.status === 'indexing') p = 75;
            if (data.metadata?.indexed) p = 90;
            
            setProgress(p);
            // Prioritize backend summary for granular progress visibility
            setStatus(data.summary || 'Processing curriculum schema...');
          }
        } catch (e) {
          console.error("Polling Error:", e);
        }
      }, 2500);
    }
    return () => clearInterval(poller);
  }, [docId, isUploading, progress, onComplete]);

  const copyFix = () => {
    navigator.clipboard.writeText(REPAIR_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
    setStatus('Initializing Neural Handshake...');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Authentication node offline. Please log in.");
      
      const detectedType = file.type || 'application/pdf';

      // 1. Handshake with API to get Signed URL
      const handshakeResponse = await fetch('/api/docs/upload', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: file.name.replace(/\.[^/.]+$/, ""),
          contentType: detectedType,
          fileSize: file.size
        })
      });

      if (!handshakeResponse.ok) {
        const errData = await handshakeResponse.json().catch(() => ({ error: 'Handshake node timeout.' }));
        throw new Error(errData.error || `Node connection refused (${handshakeResponse.status})`);
      }

      const { uploadUrl, documentId, contentType: signedType } = await handshakeResponse.json();
      setDocId(documentId);
      setProgress(20);
      setStatus('Streaming Binary Bits to Vault...');

      // 2. Direct PUT to Cloudflare R2
      try {
        const uploadResponse = await fetch(uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': signedType || detectedType }
        });

        if (!uploadResponse.ok) {
          throw new Error(`The Cloud node rejected the stream (Status: ${uploadResponse.status}).`);
        }
      } catch (putErr: any) {
        // Specifically detect CORS/Network issues during the heavy PUT phase
        if (putErr.message?.includes('Failed to fetch')) {
          throw new Error('NETWORK_BLOCK: Browser refused the cloud stream. Ensure R2 CORS settings allow this domain.');
        }
        throw putErr;
      }

      setProgress(40);
      setStatus('Binary Anchored. Awakening Processing Node...');

      // 3. Trigger Server-side Neural Processing
      const triggerResponse = await fetch(`/api/docs/process/${documentId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` }
      });

      if (!triggerResponse.ok) {
        const triggerData = await triggerResponse.json().catch(() => ({}));
        throw new Error(`Neural node trigger failed: ${triggerData.error || 'Gateway Timeout'}`);
      }

    } catch (err: any) {
      setError(err.message || "An unexpected neural handshake error occurred.");
      setIsUploading(false);
    }
  };

  const isSchemaError = error?.includes('SCHEMA_MISMATCH');
  const isCorsError = error?.includes('NETWORK_BLOCK') || error?.includes('CORS');

  return (
    <div className="bg-white dark:bg-slate-900 rounded-[3rem] p-10 md:p-16 w-full max-w-2xl shadow-2xl border dark:border-white/5 text-center relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500" />
      
      <div className="space-y-8 text-left">
        <div className="flex items-center justify-between">
          <div className="w-20 h-20 bg-indigo-600 text-white rounded-[2.5rem] flex items-center justify-center shadow-2xl relative">
             {isUploading ? <BrainCircuit size={40} className="animate-pulse" /> : <UploadCloud size={40} />}
             {isUploading && <div className="absolute inset-0 border-4 border-white/20 border-t-white rounded-[2.5rem] animate-spin" />}
          </div>
          <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl border border-emerald-100 dark:border-emerald-900/50 flex items-center gap-2">
             <ShieldCheck size={16} className="text-emerald-500" />
             <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Secure Ingestion</span>
          </div>
        </div>

        <div>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight uppercase leading-none">Curriculum Ingestion</h2>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mt-2">Neural Vector Indexing Architecture</p>
        </div>

        {error ? (
          <div className="p-8 bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/50 rounded-3xl space-y-6 animate-in fade-in zoom-in-95">
            <div className="flex items-start gap-3 text-rose-600">
               <AlertCircle size={24} className="shrink-0 mt-0.5" />
               <div className="space-y-1">
                 <p className="text-xs font-black uppercase tracking-widest">Ingestion Interrupted</p>
                 <p className="text-[11px] font-bold leading-relaxed">{error}</p>
               </div>
            </div>
            
            <div className="flex flex-wrap gap-3">
              <button 
                onClick={() => {setError(null); setIsUploading(false); setProgress(0);}} 
                className="px-6 py-3 bg-rose-100 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all active:scale-95 shadow-sm"
              >
                <RefreshCw size={12}/> Retry Ingestion
              </button>
              
              {isSchemaError && (
                <button 
                  onClick={copyFix}
                  className="px-6 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all active:scale-95"
                >
                  {copied ? <Check size={12} className="text-emerald-400"/> : <Copy size={12}/>} 
                  {copied ? 'SQL Copied!' : 'Copy SQL Fix'}
                </button>
              )}
            </div>

            {isCorsError && (
              <div className="mt-4 p-4 bg-white/40 dark:bg-black/20 rounded-2xl border border-rose-200 dark:border-rose-900/30">
                <p className="text-[10px] text-rose-700 dark:text-rose-300 font-bold mb-2 flex items-center gap-2">
                  <Globe size={12}/> Browser Security Alert:
                </p>
                <p className="text-[9px] text-slate-500 leading-relaxed italic">
                  The binary stream was blocked. Check <b>Brain Control &gt; Repair</b> to verify CORS configuration on your R2 storage node.
                </p>
              </div>
            )}
          </div>
        ) : isUploading ? (
          <div className="space-y-6 py-4">
             <div className="h-3 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden shadow-inner">
                <div className="h-full bg-indigo-600 transition-all duration-1000 rounded-full shadow-[0_0_10px_rgba(79,70,229,0.5)]" style={{ width: `${progress}%` }} />
             </div>
             <div className="flex flex-col gap-1">
               <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-600 animate-pulse">{status}</p>
               <p className="text-[9px] font-bold text-slate-400">Deep extraction node active • Gateway bypass enabled</p>
             </div>
          </div>
        ) : (
          <label className="group relative cursor-pointer block">
            <input type="file" className="hidden" accept=".pdf" onChange={handleFileUpload} />
            <div className="p-16 border-4 border-dashed border-slate-100 dark:border-white/5 rounded-[3.5rem] group-hover:border-indigo-500/50 transition-all bg-slate-50/50 dark:bg-white/5 hover:bg-white dark:hover:bg-slate-800/50">
              <UploadCloud size={64} className="text-slate-300 group-hover:text-indigo-500 transition-all mx-auto mb-6" />
              <p className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight text-center">Select Curriculum PDF</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2 text-center">Cloud Archival System • Max 50MB</p>
            </div>
          </label>
        )}
      </div>

      <div className="mt-10 pt-10 border-t dark:border-white/5 grid grid-cols-3 gap-4">
         <div className="space-y-1">
            <Database size={16} className="mx-auto text-slate-300" />
            <p className="text-[8px] font-black text-slate-400 uppercase">Binary Vault</p>
         </div>
         <div className="space-y-1">
            <Search size={16} className="mx-auto text-slate-300" />
            <p className="text-[8px] font-black text-slate-400 uppercase">SLO Mapping</p>
         </div>
         <div className="space-y-1">
            <Zap size={16} className="mx-auto text-slate-300" />
            <p className="text-[8px] font-black text-slate-400 uppercase">Vector Sync</p>
         </div>
      </div>
    </div>
  );
}