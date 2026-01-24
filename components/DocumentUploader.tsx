
'use client';

import React, { useState, useEffect } from 'react';
import { X, FileText, CheckCircle2, AlertCircle, Loader2, FileCode, ArrowRight, ShieldCheck, Database, BrainCircuit, Sparkles, ArrowLeft } from 'lucide-react';
import { validateCurriculumMarkdown } from '../lib/curriculum/validator';
import { marked } from 'marked';
import { SubscriptionPlan } from '../types';
import { ROLE_LIMITS } from '../constants';
import { supabase } from '../lib/supabase';
import { GoogleGenAI } from '@google/genai';

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

        // TIER VALIDATION FOR PDF
        // Add comment above each fix
        // Fix: Resolve TypeScript property missing errors by checking userPlan and using appropriate limit fields
        let allowedPages = 0;
        if (userPlan === SubscriptionPlan.ENTERPRISE) {
          const entLimits = limits as { maxPagesSME_1: number; maxPagesSME_2: number };
          allowedPages = docCount < 100 ? entLimits.maxPagesSME_1 : entLimits.maxPagesSME_2;
        } else {
          allowedPages = (limits as { maxPages: number }).maxPages;
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
        // Approximation for Docx pages (standard 500 words/page)
        pageCount = Math.ceil(fullText.split(/\s+/).length / 500);
        
        // Add comment above each fix
        // Fix: Resolve TypeScript property missing errors by checking userPlan and using appropriate limit fields for Docx
        let allowedPages = 0;
        if (userPlan === SubscriptionPlan.ENTERPRISE) {
          const entLimits = limits as { maxPagesSME_1: number; maxPagesSME_2: number };
          allowedPages = docCount < 100 ? entLimits.maxPagesSME_1 : entLimits.maxPagesSME_2;
        } else {
          allowedPages = (limits as { maxPages: number }).maxPages;
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

  const synthesizeMasterMarkdown = async (rawText: string, fileName: string) => {
    try {
      // Add comment above each fix
      // Fix: Follow initialization and usage guidelines for GoogleGenAI. Using gemini-3-flash-preview for basic text task.
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Convert this raw curriculum text into high-fidelity markdown with sections for Metadata, Units, and SLOs. FILE: ${fileName}\n\nTEXT: ${rawText.substring(0, 150000)}`;
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });
      return response.text || "";
    } catch (e: any) {
      throw new Error(`AI Mapping Failed: ${e.message}`);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'md' | 'pdf' | 'docx') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setIsProcessing(true);
    setProcStage(`Analyzing Metadata...`);

    try {
      if (type === 'md') {
        const text = await file.text();
        const pages = Math.ceil(text.split(/\s+/).length / 500);
        
        // Add comment above each fix
        // Fix: Resolve TypeScript property missing errors by checking userPlan and using appropriate limit fields for Markdown
        let allowedPages = 0;
        if (userPlan === SubscriptionPlan.ENTERPRISE) {
          const entLimits = limits as { maxPagesSME_1: number; maxPagesSME_2: number };
          allowedPages = docCount < 100 ? entLimits.maxPagesSME_1 : entLimits.maxPagesSME_2;
        } else {
          allowedPages = (limits as { maxPages: number }).maxPages;
        }

        if (pages > allowedPages) throw new Error(`Markdown length exceeds ${allowedPages} page equivalent.`);

        setDraftMarkdown(text);
        setMode('transition');
      } else {
        setMode('transition');
        const { text, pages } = await extractRawTextAndPageCount(file, type);
        setProcStage('Neural Ingestion: Standardizing curriculum grid...');
        const masterMd = await synthesizeMasterMarkdown(text, file.name);
        setDraftMarkdown(masterMd);
      }
    } catch (err: any) {
      setError(err.message);
      setMode('selection');
    } finally {
      setIsProcessing(false);
      setProcStage('');
    }
  };

  const handleFinalApproval = async () => {
    setIsProcessing(true);
    setProcStage('Committing to Cloud Vault...');
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
    } finally { setIsProcessing(false); }
  };

  if (mode === 'transition') {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-[3rem] p-1 w-full max-w-5xl shadow-2xl border dark:border-white/5 animate-in zoom-in-95 flex flex-col h-[85vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b dark:border-white/5">
          <div className="flex items-center gap-4">
            <button onClick={() => setMode('selection')} className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl"><ArrowLeft size={20}/></button>
            <div><h3 className="text-xl font-black dark:text-white uppercase tracking-tight">Vault Preview</h3><p className="text-xs text-slate-500">Tier: {userPlan.toUpperCase()} Node</p></div>
          </div>
          <button onClick={onCancel} className="p-2 text-slate-400"><X size={24}/></button>
        </div>
        <div className="flex-1 grid grid-cols-2 overflow-hidden">
          <textarea value={draftMarkdown} onChange={(e) => setDraftMarkdown(e.target.value)} className="p-8 bg-slate-50/50 dark:bg-black/20 border-r dark:border-white/5 font-mono text-[11px] outline-none resize-none custom-scrollbar" placeholder="Neural buffer empty..." />
          <div className="p-8 overflow-y-auto custom-scrollbar prose dark:prose-invert" dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </div>
        <div className="p-8 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
           <div className="max-w-md">{error && <p className="text-xs font-bold text-rose-600 flex gap-2"><AlertCircle size={14}/> {error}</p>}</div>
           <button onClick={handleFinalApproval} disabled={isProcessing || !draftMarkdown} className="px-10 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-xl flex items-center gap-2 hover:bg-indigo-700 active:scale-95 disabled:opacity-50">
             {isProcessing ? <Loader2 className="animate-spin" size={20}/> : <Database size={20}/>} Commit to Vault
           </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-[3rem] p-12 w-full max-w-xl shadow-2xl border dark:border-white/5 animate-in zoom-in-95 text-center">
      <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/20 rounded-[2rem] flex items-center justify-center mx-auto mb-6 text-indigo-600 shadow-xl"><ShieldCheck size={40}/></div>
      <h3 className="text-3xl font-black dark:text-white uppercase tracking-tight">Vault Ingestion</h3>
      <p className="text-slate-500 mt-2 mb-10 font-medium">Add to your permanent curriculum library.</p>
      
      <div className="grid gap-4">
        <input type="file" id="pdf-up" className="hidden" accept=".pdf" onChange={(e) => handleFileUpload(e, 'pdf')} />
        <label htmlFor="pdf-up" className="p-6 border-2 border-dashed rounded-3xl border-slate-200 dark:border-white/10 hover:border-indigo-500 cursor-pointer transition-all flex items-center gap-4">
           <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-xl"><FileText size={24}/></div>
           <div className="text-left"><p className="font-bold dark:text-white">PDF Document</p><p className="text-[10px] text-slate-400">Enforced {
             // Add comment above each fix
             // Fix: Resolve TypeScript property missing errors by safely accessing maxPages or maxPagesSME_1 as fallback
             (limits as any).maxPages || (limits as any).maxPagesSME_1
           } page limit</p></div>
        </label>
        
        <input type="file" id="docx-up" className="hidden" accept=".docx" onChange={(e) => handleFileUpload(e, 'docx')} />
        <label htmlFor="docx-up" className="p-6 border-2 border-dashed rounded-3xl border-slate-200 dark:border-white/10 hover:border-emerald-500 cursor-pointer transition-all flex items-center gap-4">
           <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 rounded-xl"><FileCode size={24}/></div>
           <div className="text-left"><p className="font-bold dark:text-white">Word / Markdown</p><p className="text-[10px] text-slate-400">Strict structural audit active</p></div>
        </label>
      </div>

      <button onClick={onCancel} className="mt-8 text-[10px] font-black uppercase text-slate-400 tracking-widest hover:text-rose-600 transition-colors">Disconnect Ingestion Hub</button>
      
      {isProcessing && (
        <div className="absolute inset-0 bg-white/95 dark:bg-slate-950/95 flex flex-col items-center justify-center rounded-[3rem] z-50 animate-in fade-in">
          <Loader2 className="animate-spin text-indigo-600 mb-4 w-12 h-12" />
          <p className="text-lg font-black text-indigo-600 uppercase tracking-widest">Neural Mapping...</p>
          <p className="text-xs font-bold text-slate-400 mt-2">{procStage}</p>
        </div>
      )}
    </div>
  );
}
