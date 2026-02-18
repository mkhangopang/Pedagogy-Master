'use client';

import React, { useState, useEffect, useRef } from 'react';
import { BrainCircuit, UploadCloud, AlertCircle, ShieldCheck, Database, Zap, Loader2, RefreshCw, Clock } from 'lucide-react';
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
          
          if (!res.ok) {
            if (res.status === 404) throw new Error("Document Node Purged.");
            return;
          }

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
            
            // Clean extraction of human readable error from messy responses
            let rawErr = data.summary || data.error || 'Extraction Node Fault.';
            let cleanErr = rawErr;
            if (rawErr.includes('{"error"')) {
               try {
                 const match = rawErr.match(/\{.*\}/);
                 if (match) {
                   const json = JSON.parse(match[0]);
                   cleanErr = json.error?.message || cleanErr;
                 }
               } catch(e) {}
            }
            
            setError(cleanErr);
            setIsUploading(false);
          } else {
            setProgress(prev => Math.min(98, prev + (data.progress > prev ? (data.progress - prev) : 0.5)));
            setStatus(data.summary || 'Unrolling Curriculum Domains...');
          }
        } catch (e: any) {
          console.error("Poller Handshake Error:", e);
          if (e.message.includes("Node Purged")) {
             clearInterval(poller);
             setError("Institutional node lost. Please retry.");
             setIsUploading(false);
          }
        }
      }, 2000);

      return () => {
        clearInterval(poller);
        isPolling.current = false;
      };
    }
  }, [docId, isUploading, onComplete]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setIsUploading(true);
    setProgress(5);
    setStatus('Handshaking with Grid...');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Identity node unreachable.");

      const handshake = await handshakeWithGateway(file.name, file.type || 'application/pdf', "", session.access_token);
      const { uploadUrl, documentId } = handshake;
      setDocId(documentId);
      
      setProgress(20);
      setStatus('Streaming Binary Payload...');
      
      const uploadRes = await fetch(uploadUrl, { 
        method: 'PUT', 
        body: file, 
        headers: { 'Content-Type': file.type || 'application/pdf' } 
      });
      
      if (!uploadRes.ok) throw new Error("R2_GATEWAY_REJECTION: Link severed.");

      setProgress(40);
      setStatus('Initializing Neural Orchestrator...');
      
      fetch(`/api/docs/process/${documentId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      }).then(async (res) => {
        if (!res.ok) {
           const errData = await res.json();
           console.error("Orchestrator Trigger Fault:", errData);
        }
      }).catch(e => console.warn("Background trigger warning:", e));

    } catch (err: any) {
      setError(err.message || "Institutional Sync Failure.");
      setIsUploading(false);
    }
  };

  async function handshakeWithGateway(name: string, contentType: string, extractedText: string, token: string) {
    const res = await fetch('/api/docs/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, contentType, extractedText })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Gateway Handshake Refused.");
    }
    return await res.json();
  }

  const isQuotaError = error?.toLowerCase().includes('quota') || error?.toLowerCase().includes('429');

  return (
    <div className="bg-white dark:bg-[#080808] rounded-[3rem] p-6 md:p-12 w-full max-w-xl shadow-2xl border border-slate-100 dark:border-white/5 relative overflow-hidden text-left">
      <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-600 via-purple-500 to-emerald-500" />
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div className="w-14 h-14 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-2xl">
             {isUploading ? <BrainCircuit size={28} className="animate-pulse" /> : <UploadCloud size={28} />}
          </div>
          <div className="px-4 py-1.5 bg-emerald-50 dark:bg-emerald-950/30 rounded-full border border-emerald-100 dark:border-emerald-500/20 flex items-center gap-2">
             <Zap size={12} className="text-emerald-500" />
             <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Grid Sync v164.0</span>
          </div>
        </div>

        <div>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Ingest Asset</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Foundational Curriculum Orchestrator</p>
        </div>

        {error ? (
          <div className="p-8 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-[2rem] space-y-6 animate-in slide-in-from-top-2">
            <div className="flex items-start gap-4 text-rose-600">
               {isQuotaError ? <Clock size={24} className="shrink-0 mt-1" /> : <AlertCircle size={24} className="shrink-0 mt-1" />}
               <div className="space-y-1">
                 <p className="text-sm font-black uppercase tracking-tight">{isQuotaError ? 'Grid Saturated' : 'Sync Handshake Fault'}</p>
                 <p className="text-xs font-medium leading-relaxed opacity-90">{error}</p>
               </div>
            </div>
            <button 
              onClick={() => {setError(null); setIsUploading(false); setProgress(0); setDocId(null);}} 
              className={`w-full py-4 ${isQuotaError ? 'bg-indigo-600' : 'bg-rose-600'} text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2`}
            >
              <RefreshCw size={14}/> {isQuotaError ? 'Wait and Retry' : 'Re-Initialize Node'}
            </button>
          </div>
        ) : isUploading ? (
          <div className="space-y-6 py-4">
             <div className="h-3 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden shadow-inner">
                <div className="h-full bg-indigo-600 rounded-full transition-all duration-1000 ease-out" style={{ width: `${progress}%` }} />
             </div>
             <div className="flex items-center justify-between">
               <div className="flex items-center gap-3">
                 <Loader2 size={16} className="text-indigo-600 animate-spin" />
                 <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">{status}</p>
               </div>
               <span className="text-[10px] font-black text-slate-400">{Math.round(progress)}%</span>
             </div>
             <p className="text-[9px] text-slate-400 font-medium italic">Establishing neural context nodes. Do not sever the connection.</p>
          </div>
        ) : (
          <label className="group relative cursor-pointer block">
            <input type="file" className="hidden" accept=".pdf,.txt,.md" onChange={handleFileUpload} />
            <div className="py-20 md:py-24 border-2 border-dashed border-slate-200 dark:border-white/10 rounded-[3rem] group-hover:border-indigo-500 hover:bg-slate-50/50 dark:hover:bg-white/5 transition-all text-center">
              <UploadCloud size={64} className="text-slate-300 group-hover:text-indigo-600 transition-all mx-auto mb-6" />
              <p className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Select Curriculum</p>
              <p className="text-[9px] font-bold text-slate-400 uppercase mt-2 tracking-[0.2em] opacity-60">Linearized Institutional Assets Only</p>
            </div>
          </label>
        )}
      </div>
    </div>
  );
}
