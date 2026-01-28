'use client';

import React, { useState, useEffect } from 'react';
import { X, FileText, CheckCircle2, AlertCircle, Loader2, FileCode, ArrowRight, ShieldCheck, Database, BrainCircuit, Sparkles, ArrowLeft, AlertTriangle, Lock } from 'lucide-react';
import { validateCurriculumMarkdown } from '../lib/curriculum/validator';
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

  const limits = ROLE_LIMITS[userPlan] || ROLE_LIMITS[SubscriptionPlan.FREE];

  useEffect(() => {
    if (draftMarkdown) {
      try {
        setPreviewHtml(marked.parse(draftMarkdown) as string);
      } catch (e) { console.error(e); }
    }
  }, [draftMarkdown]);

  const extractRawTextAndPageCount = async (file: File, type: 'pdf' | 'docx'): Promise<{ text: string, pages: number }> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      let pageCount = 0;
      let fullText = '';
      
      if (type === 'pdf') {
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
        const pdf = await loadingTask.promise;
        pageCount = pdf.numPages;

        let allowedPages = (limits as any).maxPages || 20;
        if (userPlan === SubscriptionPlan.ENTERPRISE) {
          const entLimits = limits as { maxPagesSME_1: number; maxPagesSME_2: number };
          allowedPages = docCount < 100 ? entLimits.maxPagesSME_1 : entLimits.maxPagesSME_2;
        }

        if (pageCount > allowedPages) {
          throw new Error(`TIER EXCEEDED: Your ${userPlan} node allows max ${allowedPages} pages. This file has ${pageCount} pages.`);
        }
        
        for (let i = 1; i <= pdf.numPages; i++) {
          setProcStage(`Extracting Intelligence: Page ${i} of ${pdf.numPages}...`);
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
        }
      } else {
        const result = await mammoth.extractRawText({ arrayBuffer });
        fullText = result.value;
        pageCount = Math.ceil(fullText.split(/\s+/).length / 500);
        
        let allowedPages = (limits as any).maxPages || 20;
        if (userPlan === SubscriptionPlan.ENTERPRISE) {
          const entLimits = limits as { maxPagesSME_1: number; maxPagesSME_2: number };
          allowedPages = docCount < 100 ? entLimits.maxPagesSME_1 : entLimits.maxPagesSME_2;
        }

        if (pageCount > allowedPages) {
          throw new Error(`WORD COUNT LIMIT: Estimated ${pageCount} pages exceeds your ${userPlan} limit of ${allowedPages}.`);
        }
      }
      
      return { text: fullText, pages: pageCount };
    } catch (e: any) {
      throw e;
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'md' | 'pdf' | 'docx') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setIsProcessing(true);
    setProcStage(`Connecting to extraction grid...`);

    try {
      if (type === 'md') {
        const text = await file.text();
        setDraftMarkdown(text);
        setMode('transition');
      } else {
        const { text } = await extractRawTextAndPageCount(file, type);
        setProcStage('Neural Synthesis: Structuring raw data into high-fidelity markdown...');
        
        const { data: { session } } = await supabase.auth.getSession();
        const response = await fetch('/api/docs/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
          body: JSON.stringify({ 
            name: file.name, 
            sourceType: 'raw_text', 
            extractedText: text,
            previewOnly: true
          })
        });
        
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        
        setDraftMarkdown(result.markdown);
        setMode('transition');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
      setProcStage('');
    }
  };

  const handleFinalApproval = async () => {
    setIsProcessing(true);
    setProcStage('Committing validated nodes to permanent vault...');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const v = validateCurriculumMarkdown(draftMarkdown);
      const response = await fetch('/api/docs/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ name: "Curriculum_Asset_" + Date.now(), sourceType: 'markdown', extractedText: draftMarkdown, ...v.metadata })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      onComplete(result);
    } catch (err: any) {
      setError(err.message);
    } finally { 
      setIsProcessing(false); 
    }
  };

  if (mode === 'transition') {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-3xl md:rounded-[3rem] p-0 w-full max-w-[95vw] shadow-2xl border dark:border-white/5 animate-in zoom-in-95 flex flex-col h-[92vh] overflow-hidden text-left">
        <div className="flex items-center justify-between p-4 md:p-6 border-b dark:border-white/5">
          <div className="flex items-center gap-3 md:gap-4">
            <button onClick={() => setMode('selection')} className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl hover:bg-indigo-50 transition-all shadow-sm"><ArrowLeft size={20}/></button>
            <div className="min-w-0"><h3 className="text-sm md:text-2xl font-black dark:text-white uppercase tracking-tight truncate">Institutional Vault Preview</h3><p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Tier: {userPlan.toUpperCase()} Node</p></div>
          </div>
          <button onClick={onCancel} className="p-3 text-slate-400 hover:text-rose-500 transition-colors"><X size={28}/></button>
        </div>
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 overflow-hidden h-full">
          <div className="flex flex-col border-b md:border-b-0 md:border-r dark:border-white/5 overflow-hidden">
            <div className="p-4 bg-indigo-50 dark:bg-indigo-950/40 flex items-center gap-3 border-b dark:border-white/5">
              <Lock size={12} className="text-indigo-600" />
              <span className="text-[10px] font-black uppercase text-indigo-600 tracking-widest">Editable Source Node</span>
            </div>
            <textarea value={draftMarkdown} onChange={(e) => setDraftMarkdown(e.target.value)} className="flex-1 p-8 md:p-12 bg-slate-50/50 dark:bg-black/20 font-mono text-[11px] md:text-[13px] outline-none resize-none custom-scrollbar leading-relaxed" placeholder="Neural buffer empty..." />
          </div>
          <div className="flex flex-col overflow-hidden h-full">
             <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 flex items-center gap-3 border-b dark:border-white/5 shrink-0">
                <Sparkles size={12} className="text-emerald-600" />
                <span className="text-[10px] font-black uppercase text-emerald-600 tracking-widest">Neural Cleanup Result</span>
             </div>
             <div className="p-8 md:p-16 overflow-y-auto custom-scrollbar prose dark:prose-invert h-full max-w-none" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
        </div>
        <div className="p-6 md:p-10 bg-slate-50 dark:bg-slate-900/50 flex flex-col md:flex-row items-center justify-between gap-6 md:gap-0 shrink-0 border-t dark:border-white/5">
           <div className="max-w-2xl w-full">
             {error ? <p className="text-xs font-black text-rose-600 flex gap-2 uppercase tracking-wide"><AlertCircle size={14}/> {error}</p> : (
               <div className="flex items-center gap-4 text-amber-600">
                 <AlertTriangle size={20} className="shrink-0" />
                 <p className="text-[10px] md:text-xs font-black uppercase tracking-[0.1em] leading-relaxed">
                    By committing to the vault, this cleaned intelligence will be permanently indexed into the vector grid. 
                    <br />Deletion is restricted for successful standard-aligned nodes.
                 </p>
               </div>
             )}
           </div>
           <button onClick={handleFinalApproval} disabled={isProcessing || !draftMarkdown} className="w-full md:w-auto px-12 py-5 bg-indigo-600 text-white rounded-[2rem] font-black shadow-2xl flex items-center justify-center gap-3 hover:bg-indigo-700 active:scale-95 disabled:opacity-50 transition-all uppercase text-xs tracking-widest">
             {isProcessing ? <Loader2 className="animate-spin" size={20}/> : <Database size={20}/>} Sync Cleaned Asset
           </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl md:rounded-[3rem] p-0 w-full max-w-xl shadow-2xl border dark:border-white/5 animate-in zoom-in-95 overflow-hidden h-fit max-h-[92vh] flex flex-col text-left">
      <div className="h-1 bg-gradient-to-r from-indigo-500 via-amber-500 to-indigo-500 shrink-0" />
      
      <div className="flex items-center justify-between p-6 pb-2 shrink-0">
        <button 
          onClick={onCancel}
          className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all shadow-sm flex items-center gap-2"
        >
          <ArrowLeft size={20} />
          <span className="text-[10px] font-black uppercase">Cancel</span>
        </button>
        <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-xl"><ShieldCheck size={20}/></div>
      </div>

      <div className="p-8 md:p-12 pt-4 text-center overflow-y-auto custom-scrollbar flex-1">
        <h3 className="text-2xl md:text-3xl font-black dark:text-white uppercase tracking-tight leading-none mb-2">Vault Ingestion</h3>
        <p className="text-slate-500 mb-8 font-medium text-xs md:text-sm">Store curriculum blobs in R2 and metadata in Supabase.</p>
        
        {error && (
          <div className="mb-6 p-4 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-2xl text-rose-600 text-xs font-bold text-left flex gap-2 items-center">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <div className="grid gap-3 md:gap-4">
          <input type="file" id="pdf-up" className="hidden" accept=".pdf" onChange={(e) => handleFileUpload(e, 'pdf')} />
          <label htmlFor="pdf-up" className="p-4 md:p-6 border-2 border-dashed rounded-2xl md:rounded-3xl border-slate-200 dark:border-white/10 hover:border-indigo-500 cursor-pointer transition-all flex items-center gap-4">
             <div className="p-2 md:p-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-xl"><FileText size={20}/></div>
             <div className="text-left min-w-0"><p className="font-bold dark:text-white text-sm md:text-base">PDF Document</p><p className="text-[9px] md:text-[10px] text-slate-400 truncate">Multimodal Neural Mapping</p></div>
          </label>
          
          <input type="file" id="docx-up" className="hidden" accept=".docx" onChange={(e) => handleFileUpload(e, 'docx')} />
          <label htmlFor="docx-up" className="p-4 md:p-6 border-2 border-dashed rounded-2xl md:rounded-3xl border-slate-200 dark:border-white/10 hover:border-emerald-500 cursor-pointer transition-all flex items-center gap-4">
             <div className="p-2 md:p-3 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 rounded-xl"><FileCode size={20}/></div>
             <div className="text-left min-w-0"><p className="font-bold dark:text-white text-sm md:text-base">Word Document</p><p className="text-[9px] md:text-[10px] text-slate-400 truncate">Deep Structural Extraction</p></div>
          </label>
        </div>
      </div>
      
      {isProcessing && (
        <div className="absolute inset-0 bg-white/95 dark:bg-slate-950/95 flex flex-col items-center justify-center z-50 animate-in fade-in p-6">
          <Loader2 className="animate-spin text-indigo-600 mb-4 w-10 h-10 md:w-12 md:h-12" />
          <p className="text-base md:text-lg font-black text-indigo-600 uppercase tracking-widest">Brain Handshake...</p>
          <p className="text-[10px] md:text-xs font-bold text-slate-400 mt-2 text-center">{procStage}</p>
        </div>
      )}
    </div>
  );
}