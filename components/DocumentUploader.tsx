
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
      // Increased page limit to 500 to support heavy 185-page documents
      const pageLimit = Math.min(pdf.numPages, 500); 
      
      for (let i = 1; i <= pageLimit; i++) {
        setProcStage(`Extracting Page ${i} of ${pdf.numPages}...`);
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map((item: any) => (item as any).str).join(' ') + '\n';
        
        // Slight delay every 10 pages to prevent UI freezing on huge files
        if (i % 10 === 0) {
          await new Promise(r => setTimeout(r, 0)); 
        }
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

      setProcStage(`Collaborative Synthesis: Mapping ${file.name}...`);
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch('/api/docs/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ name: file.name, sourceType: 'raw_text', extractedText: rawText, previewOnly: true })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Grid Timeout' }));
        throw new Error(errorData.error || 'The neural grid timed out processing this large asset.');
      }

      const result = await response.json();
      
      setDraftMarkdown(result.markdown || "");
      setExtractedMeta(result.metadata);
      setExtractedSLOs(result.slos || []);
      setMode('transition');
    } catch (err: any) {
      console.error("Ingestion Node Fault:", err);
      setError(err.message || "Synthesis node unreachable.");
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
             <div className="p-8 md:p-16 overflow-y-auto custom-scrollbar prose dark:prose-invert