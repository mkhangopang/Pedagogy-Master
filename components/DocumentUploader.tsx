'use client';

import React, { useState, useEffect } from 'react';
import { X, FileText, CheckCircle2, AlertCircle, Loader2, FileCode, ArrowRight, ShieldCheck, Database, BrainCircuit, Sparkles, ArrowLeft, AlertTriangle, Lock, UploadCloud, Zap, RefreshCw, Layers, ShieldQuestion } from 'lucide-react';
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
  const [progressValue, setProgressValue] = useState(0);
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
      const pageLimit = Math.min(pdf.numPages, 500); 
      
      for (let i = 1; i <= pageLimit; i++) {
        setProcStage(`Local Extraction: Page ${i}/${pdf.numPages}`);
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map((item: any) => (item as any).str).join(' ') + '\n';
        if (i % 10 === 0) await new Promise(r => setTimeout(r, 0)); 
      }
      return fullText;
    } else if (extension === 'docx') {
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value;
    } else {
      return new TextDecoder().decode(arrayBuffer);
    }
  };

  const processWithRetry = async (url: string, body: any, token: string, maxRetries = 2): Promise<any> => {
    let lastErr;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(body)
        });
        if (res.ok) return await res.json();
        
        const errData = await res.json().catch(() => ({ error: 'Grid Node Busy' }));
        
        // AUTO-FAILOVER LOGIC
        if (res.status === 429 || res.status === 410 || res.status === 503) {
          setProcStage(`Node Failure (${res.status}): Mesh Re-routing...`);
          await new Promise(r => setTimeout(r, 5500 * (i + 1))); 
        }
        
        lastErr = new Error(errData.error || `Grid Fail (${res.status})`);
      } catch (e: any) {
        lastErr = e;
      }
    }
    throw lastErr;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setIsProcessing(true);
    setProgressValue(2);
    setProcStage(`Initializing Ingestion Pipeline...`);

    try {
      const rawText = await extractLocalText(file);
      if (!rawText || rawText.trim().length < 50) throw new Error("Extraction failed: Document is empty.");

      // Resolution optimization: 12k chunks for 185-page coverage
      const chunkSize = 12000; 
      const overlapSize = 3000; 
      const fragments: string[] = [];
      for (let i = 0; i < rawText.length; i += (chunkSize - overlapSize)) {
        fragments.push(rawText.substring(i, i + chunkSize));
        if (fragments.length > 120) break; 
      }

      setProcStage(`Neural Mesh: Ingesting ${fragments.length} Nodes...`);
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      // PHASE 1: MAP (Linear progress to stay within free-tier RPM)
      const mapResults: string[] = [];
      const MAP_BATCH_SIZE = 1; 
      
      for (let i = 0; i < fragments.length; i += MAP_BATCH_SIZE) {
        const batch = fragments.slice(i, i + MAP_BATCH_SIZE);
        setProcStage(`Mapping Curriculum (Segment ${i + 1}/${fragments.length})...`);
        
        const batchResults = await Promise.all(batch.map(async (frag, batchIdx) => {
          const absoluteIdx = i + batchIdx;
          const data = await processWithRetry('/api/docs/upload', {
            name: `${file.name}_p${absoluteIdx + 1}`,
            sourceType: 'raw_text',
            extractedText: frag,
            previewOnly: true,
            isFragment: true
          }, token);
          return data.markdown || "";
        }));
        
        mapResults.push(...batchResults);
        setProgressValue(prev => Math.min(65, prev + (60 / fragments.length)));
        
        if (i + MAP_BATCH_SIZE < fragments.length) {
          await new Promise(r => setTimeout(r, 4500)); 
        }
      }

      // PHASE 2: RECURSIVE REDUCTION (Cluster groups of 5)
      setProcStage(`Neural Synthesis: Reducing Hierarchy...`);
      const intermediateHierarchies: string[] = [];
      const REDUCE_BATCH_SIZE = 5;

      for (let i = 0; i < mapResults.length; i += REDUCE_BATCH_SIZE) {
        const tierBatch = mapResults.slice(i, i + REDUCE_BATCH_SIZE);
        setProcStage(`Merging Standard Cluster ${Math.floor(i/REDUCE_BATCH_SIZE) + 1}...`);
        
        const tierRes = await processWithRetry('/api/docs/upload', {
          name: `Sync_Tier_${i}`,
          sourceType: 'raw_text',
          extractedText: tierBatch.join('\n\n---\n\n'),
          previewOnly: true,
          isReduce: true,
          isIntermediate: true
        }, token);
        
        intermediateHierarchies.push(tierRes.markdown || "");
        setProgressValue(prev => Math.min(94, prev + 5));
        await new Promise(r => setTimeout(r, 3000));
      }

      // PHASE 3: MASTER VAULT SYNC (Locked to Gemini)
      setProcStage(`Finalizing Master Vault Sync...`);
      const finalResult = await processWithRetry('/api/docs/upload', {
        name: file.name,
        sourceType: 'raw_text',
        extractedText: intermediateHierarchies.join('\n\n---\n\n'),
        previewOnly: true,
        isReduce: true,
        isIntermediate: false
      }, token);

      // CRITICAL FIX: If the model Hallucinated a "Ready" message instead of data, show alert
      if (finalResult.markdown?.includes("I am ready") && finalResult.markdown?.length < 300) {
        throw new Error("Recursive sync resulted in a placeholder response. Please ensure the document contains clear Student Learning Outcomes and retry.");
      }

      setDraftMarkdown(finalResult.markdown || "");
      setExtractedMeta(finalResult.metadata);
      setExtractedSLOs(finalResult.slos || []);
      setMode('transition');
      setProgressValue(100);
    } catch (err: any) {
      console.error("Ingestion Fault:", err);
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFinalApproval = async () => {
    setIsProcessing(true);
    setProcStage('Vaulting Intelligence...');
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/docs/upload', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${session?.access_token}` 
        },
        body: JSON.stringify({ 
          name: extractedMeta?.board || "Sindh Curriculum Master", 
          sourceType: 'markdown', 
          extractedText: draftMarkdown,
          metadata: extractedMeta,
          slos: extractedSLOs
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Vault lock failed. Verification node rejected the manifest.');
      }
      
      onComplete(data);
    } catch (err: any) {
      console.error("Approval Fault:", err);
      setError(`VAULT_FAULT: ${err.message}`);
    } finally { 
      setIsProcessing(false); 
    }
  };

  if (mode === 'transition') {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-0 w-full max-w-[95vw] shadow-2xl border dark:border-white/5 animate-in zoom-in-95 flex flex-col h-[92vh] overflow-hidden text-left">
        <div className="flex items-center justify-between p-4 md:p-6 border-b dark:border-white/5 shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => setMode('selection')} className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl hover:bg-indigo-50 shadow-sm transition-all"><ArrowLeft size={20}/></button>
            <div>
              <h3 className="text-sm md:text-2xl font-black dark:text-white uppercase tracking-tight">Validated Standards</h3>
              <div className="flex gap-2 mt-1">
                 <span className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 rounded text-[8px] font-black uppercase">{extractedMeta?.board || 'Sindh'}</span>
                 <span className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 rounded text-[8px] font-black uppercase">Recursive Node Verified</span>
              </div>
            </div>
          </div>
          <button onClick={onCancel} className="p-3 text-slate-400 hover:text-rose-500 transition-colors"><X size={28}/></button>
        </div>

        {error && (
          <div className="m-6 p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/50 rounded-2xl flex items-center gap-4 animate-in slide-in-from-top-2">
            <AlertTriangle className="text-rose-500" size={18} />
            <p className="text-xs font-bold text-rose-600 dark:text-rose-400">{error}</p>
          </div>
        )}

        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 overflow-hidden h-full">
          <div className="flex flex-col border-r dark:border-white/5 overflow-hidden">
            <div className="p-4 bg-indigo-50 dark:bg-indigo-950/40 flex items-center gap-3 border-b dark:border-white/5">
              <span className="text-[10px] font-black uppercase text-indigo-600 tracking-widest">Master Hierarchy Editor</span>
            </div>
            <textarea value={draftMarkdown} onChange={(e) => setDraftMarkdown(e.target.value)} className="flex-1 p-8 bg-slate-50/50 dark:bg-black/20 font-mono text-[11px] outline-none resize-none custom-scrollbar leading-relaxed" />
          </div>
          <div className="flex flex-col overflow-hidden h-full">
             <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 flex items-center gap-3 border-b dark:border-white/5">
                <span className="text-[10px] font-black uppercase text-emerald-600 tracking-widest">Rendered Preview</span>
             </div>
             <div className="p-8 md:p-16 overflow-y-auto custom-scrollbar prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
        </div>
        <div className="p-6 border-t dark:border-white/5 flex items-center justify-between bg-slate-50 dark:bg-slate-900 shrink-0">
           <div className="flex items-center gap-3 text-[10px] font-black uppercase text-slate-400">
              <ShieldCheck size={14} className="text-emerald-500" /> Neural Mesh v8.0 Active
           </div>
           <button 
             onClick={handleFinalApproval}
             disabled={isProcessing || draftMarkdown.length < 50}
             className="px-10 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center gap-3 hover:bg-indigo-700 active:scale-95 disabled:opacity-50 transition-all"
           >
             {isProcessing ? <Loader2 className="animate-spin" size={18}/> : <Database size={18}/>}
             Initialize Vault Lock
           </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-[3rem] p-10 md:p-16 w-full max-w-2xl shadow-2xl border dark:border-white/5 animate-in zoom-in-95 text-center relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500" />
      <button onClick={onCancel} className="absolute top-8 right-8 p-2 text-slate-400 hover:text-slate-900 transition-all"><X size={24}/></button>
      
      <div className="space-y-8">
        <div className="w-24 h-24 bg-indigo-600 text-white rounded-[2rem] flex items-center justify-center mx-auto shadow-2xl relative">
           <BrainCircuit size={48} className={isProcessing ? 'animate-pulse' : ''} />
           {isProcessing && <div className="absolute inset-0 border-4 border-white/20 border-t-white rounded-[2rem] animate-spin" />}
        </div>
        
        <div>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight uppercase mb-2">Vault Ingestion</h2>
          <p className="text-slate-500 font-medium">Neural Mesh Grid v8.0 (Self-Healing Mode)</p>
        </div>

        {error && (
          <div className="p-5 bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/50 rounded-2xl flex items-start gap-4 text-left animate-in slide-in-from-top-2">
            <AlertTriangle className="text-rose-500 shrink-0" size={20} />
            <div className="space-y-2">
              <p className="text-xs font-bold text-rose-600 dark:text-rose-400 leading-relaxed">{error}</p>
              <div className="flex gap-4">
                <button onClick={() => { setError(null); }} className="text-[9px] font-black uppercase tracking-widest text-rose-400 hover:text-rose-600 flex items-center gap-1 transition-all"><RefreshCw size={10} /> Restart Sync</button>
                <button onClick={onCancel} className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-all"><X size={10} /> Cancel Ingestion</button>
              </div>
            </div>
          </div>
        )}

        {isProcessing ? (
          <div className="space-y-6 py-4">
             <div className="h-3 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-indigo-600 transition-all duration-1000 rounded-full" 
                  style={{ width: `${progressValue}%` }}
                />
             </div>
             <div className="flex items-center justify-center gap-3">
                <Zap size={14} className="text-indigo-500 animate-pulse" />
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-600">{procStage}</p>
             </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            <label className="group relative cursor-pointer">
              <input type="file" className="hidden" accept=".pdf,.docx,.txt" onChange={handleFileUpload} />
              <div className="p-12 border-4 border-dashed border-slate-100 dark:border-white/5 rounded-[3rem] group-hover:border-indigo-500/50 transition-all flex flex-col items-center gap-6 bg-slate-50/50 dark:bg-white/5">
                <div className="p-6 bg-white dark:bg-slate-800 rounded-[2rem] shadow-sm text-slate-400 group-hover:text-indigo-600 transition-colors">
                  <UploadCloud size={40} />
                </div>
                <div>
                  <p className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Select Sindh Document</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Linear Progress • Failover Enabled</p>
                </div>
              </div>
            </label>
            
            <div className="flex items-center justify-center gap-6 pt-4">
               <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <Layers size={12} /> Linear Sync
               </div>
               <div className="w-px h-3 bg-slate-200 dark:bg-white/10" />
               <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <ShieldQuestion size={12} className="text-indigo-400" /> Auto-Failover
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
