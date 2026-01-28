'use client';

import React, { useState, useEffect } from 'react';
import { X, FileText, CheckCircle2, AlertCircle, Loader2, FileCode, ArrowRight, ShieldCheck, Database, BrainCircuit, Sparkles, ArrowLeft, AlertTriangle, Lock, UploadCloud } from 'lucide-react';
import { validateCurriculumMarkdown } from '../lib/curriculum/validator';
import { marked } from 'marked';
import { SubscriptionPlan } from '../types';
import { ROLE_LIMITS } from '../constants';
import { supabase } from '../lib/supabase';

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side pre-flight check for Vercel 4.5MB limit
    if (file.size > 4.5 * 1024 * 1024) {
      setError(`FILE TOO LARGE: The neural node has a 4.5MB intake limit. Your file is ${(file.size / (1024 * 1024)).toFixed(1)}MB. Please split the curriculum into units or compress the PDF.`);
      return;
    }

    setError(null);
    setIsProcessing(true);
    setProcStage(`Streaming asset to Neural Node...`);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const formData = new FormData();
      formData.append('file', file);
      
      setProcStage('Engaging Neural Vision: This may take a minute for complex curriculum grids...');
      
      const response = await fetch('/api/docs/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
        body: formData
      });
      
      // Robust response handling to prevent "Unexpected token 'R'" errors
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        if (response.status === 413) {
          throw new Error("Payload Too Large: The document exceeds the neural intake limit after processing. Try a smaller segment.");
        }
        if (response.status === 504) {
          throw new Error("Gateway Timeout: The neural mapping took too long. This usually happens with 100+ page documents.");
        }
        const text = await response.text();
        console.error("Non-JSON Error Response:", text);
        throw new Error(`Cloud Node Error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The neural node rejected the asset.');
      
      setDraftMarkdown(result.markdown);
      setMode('transition');
    } catch (err: any) {
      setError(err.message === 'Failed to fetch' 
        ? "Network Error: Could not reach the synthesis node. Check your internet connection." 
        : err.message);
    } finally {
      setIsProcessing(false);
      setProcStage('');
    }
  };

  const handleFinalApproval = async () => {
    setIsProcessing(true);
    setProcStage('Anchoring intelligence to vault...');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const v = validateCurriculumMarkdown(draftMarkdown);
      
      const response = await fetch('/api/docs/upload', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${session?.access_token}` 
        },
        body: JSON.stringify({ 
          name: "Curriculum_Asset_" + Date.now(), 
          sourceType: 'markdown', 
          extractedText: draftMarkdown, 
          ...v.metadata 
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Sync failed.' }));
        throw new Error(errorData.error);
      }
      
      const result = await response.json();
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
        <div className="flex items-center justify-between p-4 md:p-6 border-b dark:border-white/5 shrink-0">
          <div className="flex items-center gap-3 md:gap-4 min-w-0">
            <button onClick={() => setMode('selection')} className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl hover:bg-indigo-50 transition-all shadow-sm shrink-0"><ArrowLeft size={20}/></button>
            <div className="min-w-0">
              <h3 className="text-sm md:text-2xl font-black dark:text-white uppercase tracking-tight truncate">Neural Mapping Successful</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Review Structured Standards</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-3 text-slate-400 hover:text-rose-500 transition-colors shrink-0"><X size={28}/></button>
        </div>
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 overflow-hidden h-full">
          <div className="flex flex-col border-b md:border-b-0 md:border-r dark:border-white/5 overflow-hidden">
            <div className="p-4 bg-indigo-50 dark:bg-indigo-950/40 flex items-center gap-3 border-b dark:border-white/5">
              <Lock size={12} className="text-indigo-600" />
              <span className="text-[10px] font-black uppercase text-indigo-600 tracking-widest">Source Standard Node</span>
            </div>
            <textarea value={draftMarkdown} onChange={(e) => setDraftMarkdown(e.target.value)} className="flex-1 p-8 md:p-12 bg-slate-50/50 dark:bg-black/20 font-mono text-[11px] md:text-[13px] outline-none resize-none custom-scrollbar leading-relaxed" placeholder="Neural buffer empty..." />
          </div>
          <div className="flex flex-col overflow-hidden h-full">
             <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 flex items-center gap-3 border-b dark:border-white/5 shrink-0">
                <Sparkles size={12} className="text-emerald-600" />
                <span className="text-[10px] font-black uppercase text-emerald-600 tracking-widest">Rendered Preview</span>
             </div>
             <div className="p-8 md:p-16 overflow-y-auto custom-scrollbar prose dark:prose-invert h-full max-w-none" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
        </div>
        <div className="p-6 md:p-10 bg-slate-50 dark:bg-slate-900/50 flex flex-col md:flex-row items-center justify-between gap-6 md:gap-0 shrink-0 border-t dark:border-white/5">
           <div className="max-w-2xl w-full">
             {error ? <p className="text-xs font-black text-rose-600 flex gap-2 uppercase tracking-wide"><AlertCircle size={14}/> {error}</p> : (
               <div className="flex items-center gap-4 text-amber-600">
                 <AlertTriangle size={20} className="shrink-0" />
                 <p className="text-[10px] md:text-xs font-black uppercase tracking-[0.1em] font-sans leading-relaxed">
                    Review the mapping above. Once committed, this asset becomes a permanent context node in the curriculum grid.
                 </p>
               </div>
             )}
           </div>
           <button onClick={handleFinalApproval} disabled={isProcessing || !draftMarkdown} className="w-full md:w-auto px-12 py-5 bg-indigo-600 text-white rounded-[2rem] font-black shadow-2xl flex items-center justify-center gap-3 hover:bg-indigo-700 active:scale-95 disabled:opacity-50 transition-all uppercase text-xs tracking-widest">
             {isProcessing ? <Loader2 className="animate-spin" size={20}/> : <Database size={20}/>} Sync to Vault
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
          <span className="text-[10px] font-black uppercase tracking-tight">Return</span>
        </button>
        <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-xl shadow-inner"><ShieldCheck size={20}/></div>
      </div>

      <div className="p-8 md:p-12 pt-4 text-center overflow-y-auto custom-scrollbar flex-1">
        <div className="w-20 h-20 bg-indigo-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6 text-white shadow-2xl">
          <UploadCloud size={40} />
        </div>
        <h3 className="text-2xl md:text-3xl font-black dark:text-white uppercase tracking-tight leading-none mb-2">Vault Ingestion</h3>
        <p className="text-slate-500 mb-8 font-medium text-xs md:text-sm">Upload curriculum PDFs/DOCX for deep structural extraction.</p>
        
        {error && (
          <div className="mb-6 p-4 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-2xl text-rose-600 text-xs font-bold text-left flex gap-2 items-center leading-relaxed">
            <AlertCircle size={16} className="shrink-0" /> {error}
          </div>
        )}

        <div className="grid gap-3 md:gap-4">
          <input type="file" id="asset-up" className="hidden" accept=".pdf,.docx,.txt,.md" onChange={handleFileUpload} />
          <label htmlFor="asset-up" className="p-8 md:p-10 border-2 border-dashed rounded-[2.5rem] md:rounded-[3rem] border-slate-200 dark:border-white/10 hover:border-indigo-500 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 cursor-pointer transition-all flex flex-col items-center gap-6 group">
             <div className="p-4 bg-white dark:bg-slate-800 border dark:border-white/5 rounded-2xl text-slate-400 group-hover:text-indigo-600 group-hover:scale-110 transition-all shadow-sm"><FileText size={32}/></div>
             <div className="text-center">
                <p className="font-black dark:text-white text-lg uppercase tracking-tight">Select Document</p>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">PDF • DOCX • MARKDOWN</p>
             </div>
          </label>
        </div>
        
        <p className="mt-10 text-[9px] text-slate-400 font-black uppercase tracking-[0.2em]">
           Maximum Intake Limit: 4.5MB
        </p>
      </div>
      
      {isProcessing && (
        <div className="absolute inset-0 bg-white/95 dark:bg-slate-950/95 flex flex-col items-center justify-center z-50 animate-in fade-in p-10 text-center">
          <div className="relative mb-8">
            <Loader2 className="animate-spin text-indigo-600 w-16 h-16" />
            <BrainCircuit size={24} className="absolute inset-0 m-auto text-indigo-400" />
          </div>
          <p className="text-xl md:text-2xl font-black text-indigo-600 uppercase tracking-tighter leading-none mb-4">Neural Handshake In Progress</p>
          <div className="max-w-xs mx-auto">
            <p className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
              {procStage}
              <br />
              <span className="opacity-40 italic mt-2 block">Do not refresh during deep mapping.</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}