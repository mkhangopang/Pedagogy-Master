'use client';

import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertCircle, Loader2, BrainCircuit, ArrowLeft, Database, RefreshCw, UploadCloud, Zap } from 'lucide-react';
import { marked } from 'marked';
import { SubscriptionPlan } from '../types';
import { supabase } from '../lib/supabase';
import * as pdfjsLib from 'pdfjs-dist';

if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  const version = '4.4.168';
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
}

interface DocumentUploaderProps {
  userId: string;
  userPlan: SubscriptionPlan;
  docCount: number;
  onComplete: (result: any) => void;
  onCancel: () => void;
}

export default function DocumentUploader({ userId, userPlan, docCount, onComplete, onCancel }: DocumentUploaderProps) {
  const [mode, setMode] = useState<'selection' | 'transition'>('selection');
  const [isProcessing, setIsProcessing] = useState(false);
  const [procStage, setProcStage] = useState<string>('');
  const [progressValue, setProgressValue] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [draftMarkdown, setDraftMarkdown] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');

  useEffect(() => {
    if (draftMarkdown) {
      try { setPreviewHtml(marked.parse(draftMarkdown) as string); } catch (e) { console.error(e); }
    }
  }, [draftMarkdown]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setIsProcessing(true);
    setProgressValue(5);
    setProcStage(`Reading PDF...`);

    try {
      const arrayBuffer = await file.arrayBuffer();
      let rawText = "";
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
      const pdf = await loadingTask.promise;
      
      // Browser-side extraction (Offloading CPU from Vercel)
      for (let i = 1; i <= Math.min(pdf.numPages, 185); i++) {
        setProcStage(`Extracting: Pg ${i}/${pdf.numPages}`);
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        rawText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
        setProgressValue(5 + (i / pdf.numPages) * 15);
      }

      // STATEFUL RECURSIVE PULSE LOGIC
      // Split raw text into small batches of ~2500 characters to stay under Vercel 10s limit
      const chunkSize = 2500;
      const chunks = [];
      for (let i = 0; i < rawText.length; i += chunkSize) {
        chunks.push(rawText.substring(i, i + chunkSize));
      }

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      let finalMd = "# Curriculum Processed Results\n\n";

      // Limit pulses to prevent massive token burn on free tier
      const maxPulses = Math.min(chunks.length, 40); 
      
      for (let p = 0; p < maxPulses; p++) {
        setProcStage(`Neural Clean: Chunk ${p + 1}/${maxPulses}...`);
        
        const res = await fetch('/api/docs/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ 
            sourceType: 'raw_text', 
            extractedText: chunks[p], 
            previewOnly: true 
          })
        });

        if (!res.ok) throw new Error(`Chunk ${p+1} timed out. Splitting too much data.`);
        const data = await res.json();
        finalMd += (data.markdown || "") + "\n\n";
        
        // Dynamic progress based on current chunk
        setProgressValue(20 + ((p + 1) / maxPulses) * 80);
      }

      setDraftMarkdown(finalMd);
      setMode('transition');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFinalApproval = async () => {
    setIsProcessing(true);
    setProcStage('Vaulting Intelligence...');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/docs/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ 
          name: "Curriculum Master", 
          sourceType: 'markdown', 
          extractedText: draftMarkdown,
          metadata: { subject: 'Automated', grade: 'Mixed', board: 'Sindh' }
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      onComplete(data);
    } catch (err: any) { setError(err.message); } finally { setIsProcessing(false); }
  };

  if (mode === 'transition') {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-0 w-full max-w-[95vw] shadow-2xl border dark:border-white/5 flex flex-col h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b dark:border-white/5 shrink-0 bg-slate-50 dark:bg-slate-900">
          <div className="flex items-center gap-4">
            <button onClick={() => setMode('selection')} className="p-3 bg-white dark:bg-slate-800 rounded-2xl shadow-sm"><ArrowLeft size={20}/></button>
            <h3 className="text-xl font-black dark:text-white uppercase tracking-tight">Vault Preview</h3>
          </div>
          <button onClick={onCancel} className="p-3 text-slate-400 hover:text-rose-500"><X size={28}/></button>
        </div>
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 overflow-hidden bg-slate-50 dark:bg-black/20">
          <textarea value={draftMarkdown} onChange={(e) => setDraftMarkdown(e.target.value)} className="p-8 font-mono text-[10px] bg-white dark:bg-slate-900 outline-none resize-none custom-scrollbar border-r dark:border-white/5" />
          <div className="overflow-y-auto custom-scrollbar p-8 prose dark:prose-invert max-w-none bg-white dark:bg-slate-900" dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </div>
        <div className="p-6 border-t dark:border-white/5 flex items-center justify-between bg-white dark:bg-slate-900">
           <p className="text-[10px] font-black uppercase text-emerald-500 flex items-center gap-2"><Zap size={14}/> Pulse Verification Active</p>
           <button onClick={handleFinalApproval} className="px-10 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-3 shadow-xl">
             {isProcessing ? <Loader2 className="animate-spin" size={18}/> : <Database size={18}/>} Ingest to Vault
           </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-[3rem] p-10 md:p-16 w-full max-w-2xl shadow-2xl border dark:border-white/5 text-center relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500" />
      <div className="space-y-8">
        <div className="w-24 h-24 bg-indigo-600 text-white rounded-[2.5rem] flex items-center justify-center mx-auto shadow-2xl relative">
           <BrainCircuit size={48} className={isProcessing ? 'animate-pulse' : ''} />
           {isProcessing && <div className="absolute inset-0 border-4 border-white/20 border-t-white rounded-[2.5rem] animate-spin" />}
        </div>
        <div>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight uppercase">Vercel Pulse Node</h2>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mt-2">Segmented Ingestion Protocol Active</p>
        </div>
        {error && (
          <div className="p-6 bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/50 rounded-3xl flex flex-col items-center gap-4 text-left">
            <div className="flex items-center gap-3"><AlertCircle className="text-rose-500" size={20} /><p className="text-xs font-bold text-rose-600 dark:text-rose-400">{error}</p></div>
            <button onClick={() => {setError(null); setIsProcessing(false);}} className="px-6 py-2 bg-rose-100 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2"><RefreshCw size={12}/> Restart Sync</button>
          </div>
        )}
        {isProcessing ? (
          <div className="space-y-6 py-4">
             <div className="h-3 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-600 transition-all duration-700 rounded-full" style={{ width: `${progressValue}%` }} />
             </div>
             <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-600 animate-pulse">{procStage}</p>
          </div>
        ) : (
          <label className="group relative cursor-pointer block">
            <input type="file" className="hidden" accept=".pdf" onChange={handleFileUpload} />
            <div className="p-16 border-4 border-dashed border-slate-100 dark:border-white/5 rounded-[3.5rem] group-hover:border-indigo-500/50 transition-all bg-slate-50/50 dark:bg-white/5">
              <UploadCloud size={64} className="text-slate-300 group-hover:text-indigo-500 transition-all mx-auto mb-6" />
              <p className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Select Curriculum PDF</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Maximum 185 Pages • Recursive Ingestion</p>
            </div>
          </label>
        )}
      </div>
    </div>
  );
}