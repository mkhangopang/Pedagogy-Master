'use client';

import React, { useState, useEffect } from 'react';
import { X, FileText, CheckCircle2, AlertCircle, Loader2, BrainCircuit, Sparkles, ArrowLeft, ArrowRight, ShieldCheck, Database, Zap, RefreshCw, UploadCloud } from 'lucide-react';
import { marked } from 'marked';
import { SubscriptionPlan } from '../types';
import { supabase } from '../lib/supabase';

import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  const version = '4.4.168';
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
}

interface DocumentUploaderProps {
  userId: string;
  userPlan: SubscriptionPlan;
  docCount: number;
  onComplete: (doc: any) => void;
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
  const [extractedMeta, setExtractedMeta] = useState<any>(null);

  useEffect(() => {
    if (draftMarkdown) {
      try {
        setPreviewHtml(marked.parse(draftMarkdown) as string);
      } catch (e) { console.error(e); }
    }
  }, [draftMarkdown]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setIsProcessing(true);
    setProgressValue(5);
    setProcStage(`Neural Skim: Ingesting ${file.name}...`);

    try {
      // 1. LOCAL EXTRACTION
      const arrayBuffer = await file.arrayBuffer();
      let rawText = "";
      
      if (file.name.toLowerCase().endsWith('.pdf')) {
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
        const pdf = await loadingTask.promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          setProcStage(`Local Scan: Pg ${i}/${pdf.numPages}`);
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          rawText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
        }
      } else {
        rawText = new TextDecoder().decode(arrayBuffer);
      }

      // 2. PRECISION ELASTIC SKIMMER
      setProcStage(`Grid Extraction: Identifying Anchors...`);
      const cleanRaw = rawText.replace(/[\[\]]/g, ' ');
      const gridRegex = /(?:[B-Z]\s*-?\s*(?:0?9|9|10|11|12)\s*-?\s*[A-Z]\s*-?\s*\d{1,2})[\s\S]{1,1200}/gi;
      const relevantBlocks = cleanRaw.match(gridRegex) || [];
      
      if (relevantBlocks.length === 0) {
        throw new Error("Grid Check Failed: No curriculum anchors (B-09 to B-12) detected. Please ensure the PDF contains standard Student Learning Objectives.");
      }

      // REDUCED PAYLOAD: 40 blocks is safer for Vercel timeouts/memory with large curriculum strings
      const skimmedText = relevantBlocks.slice(0, 40).join('\n\n---\n\n'); 

      // 3. ONE-PASS SYNTHESIS
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      setProcStage(`Final Handshake: Stitching Master Vault...`);
      setProgressValue(60);

      const res = await fetch('/api/docs/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          sourceType: 'raw_text',
          extractedText: skimmedText,
          previewOnly: true,
          isReduce: true
        })
      });

      // ROBUST RESPONSE HANDLING
      const contentType = res.headers.get("content-type");
      let data;
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const textError = await res.text();
        throw new Error(`Cloud Fault: ${textError.substring(0, 100)}... (The neural grid timed out processing this block)`);
      }

      if (!res.ok) throw new Error(data.error || "Neural synthesis failed.");

      setDraftMarkdown(data.markdown || "");
      setExtractedMeta({ subject: 'Biology', grade: '9-12', board: 'Sindh' });
      setMode('transition');
      setProgressValue(100);

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
          name: "Sindh Biology Master (IX-XII)", 
          sourceType: 'markdown', 
          extractedText: draftMarkdown,
          metadata: extractedMeta
        })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      onComplete(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false); 
    }
  };

  if (mode === 'transition') {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-0 w-full max-w-[95vw] shadow-2xl border dark:border-white/5 flex flex-col h-[92vh] overflow-hidden text-left">
        <div className="flex items-center justify-between p-6 border-b dark:border-white/5 shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => setMode('selection')} className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl hover:bg-indigo-50 shadow-sm transition-all"><ArrowLeft size={20}/></button>
            <h3 className="text-xl font-black dark:text-white uppercase tracking-tight">Verified Ingestion</h3>
          </div>
          <button onClick={onCancel} className="p-3 text-slate-400 hover:text-rose-500 transition-colors"><X size={28}/></button>
        </div>

        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 overflow-hidden h-full">
          <div className="flex flex-col border-r dark:border-white/5">
            <textarea value={draftMarkdown} onChange={(e) => setDraftMarkdown(e.target.value)} className="flex-1 p-8 bg-slate-50/50 dark:bg-black/20 font-mono text-[11px] outline-none resize-none custom-scrollbar leading-relaxed" />
          </div>
          <div className="flex flex-col overflow-y-auto custom-scrollbar p-8 md:p-16 prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </div>
        
        <div className="p-6 border-t dark:border-white/5 flex items-center justify-between bg-slate-50 dark:bg-slate-900 shrink-0">
           <div className="flex items-center gap-3 text-[10px] font-black uppercase text-slate-400"><ShieldCheck size={14} className="text-emerald-500" /> Grade 9-12 Precision Active</div>
           <button onClick={handleFinalApproval} className="px-10 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center gap-3 hover:bg-indigo-700 active:scale-95 transition-all">
             {isProcessing ? <Loader2 className="animate-spin" size={18}/> : <Database size={18}/>} Ingest to Vault
           </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-[3rem] p-10 md:p-16 w-full max-w-2xl shadow-2xl border dark:border-white/5 animate-in zoom-in-95 text-center relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500" />
      
      <div className="space-y-8">
        <div className="w-24 h-24 bg-indigo-600 text-white rounded-[2rem] flex items-center justify-center mx-auto shadow-2xl relative">
           <BrainCircuit size={48} className={isProcessing ? 'animate-pulse' : ''} />
           {isProcessing && <div className="absolute inset-0 border-4 border-white/20 border-t-white rounded-[2rem] animate-spin" />}
        </div>
        
        <div>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight uppercase mb-2">Vault Skimmer</h2>
          <p className="text-slate-500 font-medium">Neural Grid v11.0 (High-Speed Ingestion)</p>
        </div>

        {error && (
          <div className="p-5 bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/50 rounded-2xl flex flex-col items-center gap-4 animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="text-rose-500" size={18} />
              <p className="text-xs font-bold text-rose-600 dark:text-rose-400 leading-relaxed">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="px-6 py-2 bg-rose-100 dark:bg-rose-900/40 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-200 transition-all flex items-center gap-2"><RefreshCw size={12}/> Reset Sync</button>
          </div>
        )}

        {isProcessing ? (
          <div className="space-y-6 py-4">
             <div className="h-3 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-600 transition-all duration-1000 rounded-full" style={{ width: `${progressValue}%` }} />
             </div>
             <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-600 animate-pulse">{procStage}</p>
          </div>
        ) : (
          <label className="group relative cursor-pointer block">
            <input type="file" className="hidden" accept=".pdf,.docx,.txt" onChange={handleFileUpload} />
            <div className="p-12 border-4 border-dashed border-slate-100 dark:border-white/5 rounded-[3rem] group-hover:border-indigo-500/50 transition-all flex flex-col items-center gap-6 bg-slate-50/50 dark:bg-white/5">
              <UploadCloud size={48} className="text-slate-300 group-hover:text-indigo-500 transition-all" />
              <div>
                <p className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Select Curriculum PDF</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Automatic B9-B12 Extraction</p>
              </div>
            </div>
          </label>
        )}
      </div>
    </div>
  );
}