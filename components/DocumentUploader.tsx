'use client';

import React, { useState, useEffect } from 'react';
import { X, FileText, CheckCircle2, AlertCircle, Loader2, FileCode, ArrowRight, ShieldCheck, Database, BrainCircuit, Sparkles, ArrowLeft, AlertTriangle, Lock, UploadCloud } from 'lucide-react';
import { marked } from 'marked';
import { SubscriptionPlan } from '../types';
import { ROLE_LIMITS } from '../constants';
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
  const [error, setError] = useState<string | null>(null);
  const [draftMarkdown, setDraftMarkdown] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [extractedMeta, setExtractedMeta] = useState<any>(null);
  const [extractedSLOs, setExtractedSLOs] = useState<string[]>([]);

  useEffect(() => {
    if (draftMarkdown) {
      try {
        setPreviewHtml(marked.parse(draftMarkdown) as string);
      } catch (e) { console.error(e); }
    }
  }, [draftMarkdown]);

  const extractLocalText = async (file: File): Promise<string> => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    const arrayBuffer = await file.arrayBuffer();

    if (extension === 'pdf') {
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
      const pdf = await loadingTask.promise;
      let fullText = '';
      for (let i = 1; i <= Math.min(pdf.numPages, 50); i++) {
        setProcStage(`Extracting Page ${i} of ${pdf.numPages}...`);
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map((item: any) => (item as any).str).join(' ') + '\n';
      }
      return fullText;
    } else if (extension === 'docx') {
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value;
    } else {
      return new TextDecoder().decode(arrayBuffer);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setIsProcessing(true);
    setProcStage(`Initializing Local Extraction...`);

    try {
      const rawText = await extractLocalText(file);
      if (!rawText || rawText.trim().length < 50) throw new Error("Extraction failed: Document is empty or image-only.");

      setProcStage(`Neural Mapping: Analyzing structure...`);
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch('/api/docs/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ name: file.name, sourceType: 'raw_text', extractedText: rawText, previewOnly: true })
      });
      
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Mapping failed.');
      
      setDraftMarkdown(result.markdown);
      setExtractedMeta(result.metadata);
      setExtractedSLOs(result.slos || []);
      setMode('transition');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
      setProcStage('');
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
          name: extractedMeta?.board || "Curriculum Asset", 
          sourceType: 'markdown', 
          extractedText: draftMarkdown,
          metadata: extractedMeta,
          slos: extractedSLOs
        })
      });
      if (!response.ok) throw new Error('Vault sync failed.');
      onComplete(await response.json());
    } catch (err: any) {
      setError(err.message);
    } finally { setIsProcessing(false); }
  };

  if (mode === 'transition') {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-0 w-full max-w-[95vw] shadow-2xl border dark:border-white/5 animate-in zoom-in-95 flex flex-col h-[92vh] overflow-hidden text-left">
        <div className="flex items-center justify-between p-4 md:p-6 border-b dark:border-white/5 shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => setMode('selection')} className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl hover:bg-indigo-50 shadow-sm"><ArrowLeft size={20}/></button>
            <div>
              <h3 className="text-sm md:text-2xl font-black dark:text-white uppercase tracking-tight">Structured Preview</h3>
              <div className="flex gap-2 mt-1">
                 <span className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 rounded text-[8px] font-black uppercase">{extractedMeta?.board}</span>
                 <span className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 rounded text-[8px] font-black uppercase">Grade {extractedMeta?.grade}</span>
              </div>
            </div>
          </div>
          <button onClick={onCancel} className="p-3 text-slate-400 hover:text-rose-500 transition-colors"><X size={28}/></button>
        </div>
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 overflow-hidden h-full">
          <div className="flex flex-col border-r dark:border-white/5 overflow-hidden">
            <div className="p-4 bg-indigo-50 dark:bg-indigo-950/40 flex items-center gap-3 border-b dark:border-white/5">
              <span className="text-[10px] font-black uppercase text-indigo-600 tracking-widest">Source Node</span>
            </div>
            <textarea value={draftMarkdown} onChange={(e) => setDraftMarkdown(e.target.value)} className="flex-1 p-8 bg-slate-50/50 dark:bg-black/20 font-mono text-[11px] outline-none resize-none custom-scrollbar leading-relaxed" />
          </div>
          <div className="flex flex-col overflow-hidden h-full">
             <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 flex items-center gap-3 border-b dark:border-white/5">
                <span className="text-[10px] font-black uppercase text-emerald-600 tracking-widest">Pedagogical Rendering</span>
             </div>
             <div className="p-8 md:p-16 overflow-y-auto custom-scrollbar prose dark:prose-invert h-full max-w-none" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
        </div>
        <div className="p-6 bg-slate-50 dark:bg-slate-900/50 flex flex-col md:flex-row items-center justify-between gap-6 shrink-0 border-t dark:border-white/5">
           <div className="max-w-2xl w-full">
             <div className="flex items-center gap-4 text-amber-600">
               <AlertTriangle size={20} className="shrink-0" />
               <p className="text-[10px] md:text-xs font-black uppercase tracking-[0.1em] leading-relaxed">
                  Zero-AI Atomic Indexing Active. Confirmation will anchor this node permanently.
               </p>
             </div>
           </div>
           <button onClick={handleFinalApproval} disabled={isProcessing || !draftMarkdown} className="w-full md:w-auto px-12 py-5 bg-indigo-600 text-white rounded-[2rem] font-black shadow-2xl flex items-center justify-center gap-3 hover:bg-indigo-700 transition-all uppercase text-xs tracking-widest">
             {isProcessing ? <Loader2 className="animate-spin" size={20}/> : <Database size={20}/>} Sync to Vault
           </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-0 w-full max-w-xl shadow-2xl border dark:border-white/5 animate-in zoom-in-95 overflow-hidden h-fit flex flex-col text-left">
      <div className="h-1 bg-gradient-to-r from-indigo-500 via-amber-500 to-indigo-500 shrink-0" />
      <div className="p-12 text-center">
        <div className="w-20 h-20 bg-indigo-600 rounded-[2rem] flex items-center justify-center mx-auto mb-8 text-white shadow-2xl"><UploadCloud size={40} /></div>
        <h3 className="text-3xl font-black dark:text-white uppercase tracking-tight mb-2">Vault Ingestion</h3>
        <p className="text-slate-500 mb-10 font-medium">Deep structural mapping for curriculum standards.</p>
        {error && <div className="mb-6 p-4 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 rounded-2xl text-rose-600 text-xs font-bold text-left flex gap-2 items-center"><AlertCircle size={16} /> {error}</div>}
        <div className="grid gap-3">
          <input type="file" id="asset-up" className="hidden" accept=".pdf,.docx,.md" onChange={handleFileUpload} />
          <label htmlFor="asset-up" className="p-10 border-2 border-dashed rounded-[3rem] border-slate-200 dark:border-white/10 hover:border-indigo-500 hover:bg-indigo-50/30 cursor-pointer transition-all flex flex-col items-center gap-6 group">
             <div className="p-4 bg-white dark:bg-slate-800 rounded-2xl text-slate-400 group-hover:text-indigo-600 transition-all shadow-sm"><FileText size={32}/></div>
             <div className="text-center"><p className="font-black dark:text-white text-lg uppercase tracking-tight">Select Document</p><p className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">PDF • DOCX • MARKDOWN</p></div>
          </label>
        </div>
      </div>
      {isProcessing && <div className="absolute inset-0 bg-white/95 dark:bg-slate-950/95 flex flex-col items-center justify-center z-50 p-10 text-center animate-in fade-in"><Loader2 className="animate-spin text-indigo-600 w-16 h-16 mb-8" /><p className="text-2xl font-black text-indigo-600 uppercase tracking-tighter mb-4">Neural Handshake In Progress</p><p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{procStage}</p></div>}
    </div>
  );
}