
'use client';

import React, { useState, useEffect } from 'react';
import { X, FileText, CheckCircle2, AlertCircle, Loader2, FileCode, ArrowRight, ShieldCheck, Database, FileType, BrainCircuit, Sparkles } from 'lucide-react';
import { validateCurriculumMarkdown } from '../lib/curriculum/validator';
import { marked } from 'marked';
import { SubscriptionPlan } from '../types';
import { supabase } from '../lib/supabase';
import { GoogleGenAI } from '@google/genai';

// Institutional extraction nodes
import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

// Global Worker configuration for high-fidelity PDF parsing
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  const version = '4.4.168';
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.mjs`;
}

interface DocumentUploaderProps {
  userId: string;
  userPlan?: SubscriptionPlan;
  onComplete: (doc: any) => void;
  onCancel: () => void;
}

export default function DocumentUploader({ userId, onComplete, onCancel }: DocumentUploaderProps) {
  const [mode, setMode] = useState<'selection' | 'transition'>('selection');
  const [isProcessing, setIsProcessing] = useState(false);
  const [procStage, setProcStage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [draftMarkdown, setDraftMarkdown] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');

  useEffect(() => {
    if (draftMarkdown) {
      setPreviewHtml(marked.parse(draftMarkdown) as string);
    }
  }, [draftMarkdown]);

  const extractRawText = async (file: File, type: 'pdf' | 'docx'): Promise<string> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      
      if (type === 'pdf') {
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
        const pdf = await loadingTask.promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(' ');
          fullText += `[Page ${i}]\n${pageText}\n\n`;
        }
        return fullText;
      } else {
        // Modern DOCX extraction via Mammoth
        const options = { arrayBuffer: arrayBuffer };
        const result = await mammoth.extractRawText(options);
        
        if (result.messages.length > 0) {
          console.warn('Mammoth extraction messages:', result.messages);
        }
        
        if (!result.value || result.value.trim().length === 0) {
          throw new Error("Word file content extraction returned an empty buffer.");
        }
        
        return result.value;
      }
    } catch (e: any) {
      console.error(`Extraction failure [${type}]:`, e);
      throw new Error(`Cloud Node Error: ${e.message || 'The document format is incompatible with high-fidelity extraction.'}`);
    }
  };

  const synthesizeMasterMarkdown = async (rawText: string, fileName: string) => {
    // Resolve API Key from the handshake-populated process.env or global scope
    const apiKey = process.env.API_KEY || (window as any).API_KEY;
    if (!apiKey) throw new Error("Neural Node Offline: API_KEY is missing from environment. Ensure GEMINI_API_KEY is set in Vercel.");
    
    const ai = new GoogleGenAI({ apiKey });
    
    const prompt = `
      You are the Official Curriculum Data Engineer for EduNexus AI. 
      Transform the following raw text into a production-ready "Master Markdown" file.

      STRICT OUTPUT SCHEMA:
      # Curriculum Metadata
      Board: [Detected]
      Subject: [Detected]
      Grade: [Detected]
      Version: 2023-24
      ---
      # Unit X: [Unit Name]
      ## Learning Outcomes
      - SLO:[CODE]: [Pedagogical Outcome]
      ---
      ### Standard: [CODE]
      [Deep pedagogical breakdown for institutional archiving...]

      RAW DATA FROM ${fileName}:
      ${rawText.substring(0, 35000)}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1, // High fidelity requirement
        systemInstruction: "You are an institutional curriculum architect specializing in SLO mapping."
      }
    });

    return response.text || "";
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'md' | 'pdf' | 'docx') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setError(null);
    setProcStage(`Mounting ${file.name} to extraction node...`);

    try {
      if (type === 'md') {
        const text = await file.text();
        const validation = validateCurriculumMarkdown(text);
        if (!validation.isValid) {
          setDraftMarkdown(text);
          setMode('transition');
          setError(`Structural Validation Fail: ${validation.errors[0]}`);
          setIsProcessing(false);
          return;
        }
        const { data: { session } } = await supabase.auth.getSession();
        const response = await fetch('/api/docs/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
          body: JSON.stringify({
            name: file.name,
            sourceType: 'markdown',
            extractedText: text,
            ...validation.metadata
          })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Persistence node failed.");
        onComplete({ id: result.id, name: file.name, status: 'ready' });
      } else {
        setMode('transition');
        const rawText = await extractRawText(file, type);
        setProcStage('Neural grid synthesizing curriculum nodes...');
        const masterMd = await synthesizeMasterMarkdown(rawText, file.name);
        setDraftMarkdown(masterMd);
      }
    } catch (err: any) {
      setError(err.message);
      console.error("Uploader Critical Path:", err);
    } finally {
      setIsProcessing(false);
      setProcStage('');
    }
  };

  const handleFinalApproval = async () => {
    const v = validateCurriculumMarkdown(draftMarkdown);
    if (!v.isValid) {
      setError(`Verification Error: ${v.errors[0]}`);
      return;
    }

    setIsProcessing(true);
    setProcStage('Committing assets to global cloud R2 grid...');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/docs/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          name: "Synthesis_Node_" + Date.now() + ".md",
          sourceType: 'markdown',
          extractedText: draftMarkdown,
          ...v.metadata
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Global sync interrupted.");
      
      onComplete({ id: result.id, name: `Master Curriculum (Neural Generated)`, status: 'ready' });
    } catch (err: any) {
      setError(`Neural Persistence Failure: ${err.message}`);
    } finally {
      setIsProcessing(false);
      setProcStage('');
    }
  };

  if (mode === 'transition') {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-3xl lg:rounded-[3rem] p-1 w-full max-w-6xl shadow-2xl border border-slate-100 dark:border-white/5 animate-in zoom-in-95 flex flex-col h-[90vh] lg:h-[85vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 lg:p-8 border-b dark:border-white/5">
          <div className="flex items-center gap-4">
            <div className="p-2 lg:p-3 bg-indigo-600 rounded-xl lg:rounded-2xl text-white shadow-xl shadow-indigo-600/20">
              {isProcessing ? <BrainCircuit size={20} className="animate-pulse lg:w-6 lg:h-6" /> : <FileCode size={20} className="lg:w-6 lg:h-6" />}
            </div>
            <div className="min-w-0">
              <h3 className="text-lg lg:text-xl font-black tracking-tight truncate">Institutional Asset Review</h3>
              <p className="text-[10px] lg:text-xs text-slate-500 truncate">{isProcessing ? procStage : 'Audit the neural synthesis before persistence.'}</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"><X size={20}/></button>
        </div>

        <div className="flex-1 flex flex-col lg:grid lg:grid-cols-2 overflow-hidden">
          <div className="flex flex-col border-b lg:border-b-0 lg:border-r dark:border-white/5 p-4 lg:p-8 bg-slate-50/50 dark:bg-black/20 h-1/2 lg:h-full">
            <label className="text-[10px] font-black uppercase tracking-widest text-indigo-500 mb-3 flex items-center gap-2">
              <ShieldCheck size={12}/> AI Synthesized Source
            </label>
            <textarea 
              value={draftMarkdown}
              onChange={(e) => {setDraftMarkdown(e.target.value); setError(null);}}
              className="flex-1 p-4 lg:p-6 bg-white dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-2xl lg:rounded-3xl font-mono text-[11px] lg:text-xs leading-loose outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner resize-none"
              placeholder={isProcessing ? "Synthesizing curriculum standards..." : "Wait for synthesis..."}
              readOnly={isProcessing}
            />
          </div>
          <div className="flex flex-col p-4 lg:p-8 bg-white dark:bg-slate-900 overflow-y-auto custom-scrollbar h-1/2 lg:h-full">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
              <Sparkles size={12} className="text-amber-500" /> Standardized Preview
            </label>
            <div className="prose dark:prose-invert max-w-none text-xs lg:text-sm" dangerouslySetInnerHTML={{ __html: previewHtml || '<div class="flex flex-col gap-4 py-10 items-center justify-center opacity-40"><Loader2 className="animate-spin" /> <p>Generating high-fidelity preview...</p></div>' }} />
          </div>
        </div>

        <div className="p-4 lg:p-8 border-t dark:border-white/5 bg-slate-50 dark:bg-slate-900/50 flex flex-col lg:flex-row items-center justify-between gap-4">
          <div className="w-full lg:max-w-md">
            {error ? (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-900 shadow-sm">
                <p className="text-xs text-rose-600 font-bold flex items-center gap-2">
                  <AlertCircle size={14}/> {error}
                </p>
              </div>
            ) : (
              <p className="text-[10px] lg:text-xs text-emerald-600 font-bold flex items-center gap-2">
                <CheckCircle2 size={14}/> {draftMarkdown ? 'Curriculum Structure Verified.' : procStage || 'Synthesis Pending.'}
              </p>
            )}
          </div>
          <div className="flex w-full lg:w-auto gap-3">
            <button onClick={onCancel} className="flex-1 lg:flex-none px-6 py-3 text-slate-400 font-bold hover:text-slate-700 transition-colors text-sm">Discard</button>
            <button 
              onClick={handleFinalApproval}
              disabled={isProcessing || !draftMarkdown}
              className="flex-1 lg:flex-none px-8 lg:px-12 py-3 bg-indigo-600 text-white rounded-xl lg:rounded-2xl font-black shadow-xl shadow-indigo-600/30 hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
            >
              {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Database size={18}/>}
              <span className="hidden sm:inline">Finalize Ingestion</span>
              <span className="sm:hidden">Finalize</span>
              <ArrowRight size={18} className="hidden sm:block"/>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-[2rem] lg:rounded-[3rem] p-6 lg:p-12 w-full max-w-2xl shadow-2xl border border-slate-100 dark:border-white/5 animate-in zoom-in-95 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-600/5 rounded-full blur-3xl" />
      
      <div className="text-center mb-8 lg:mb-12 relative z-10">
        <div className="w-16 h-16 lg:w-20 lg:h-20 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl lg:rounded-[2rem] flex items-center justify-center mx-auto mb-4 lg:mb-6 text-indigo-600">
          <ShieldCheck className="w-8 h-8 lg:w-10 lg:h-10" />
        </div>
        <h3 className="text-2xl lg:text-3xl font-black tracking-tight">Institutional Ingestion</h3>
        <p className="text-sm lg:text-base text-slate-500 mt-2 font-medium">Map local institutional assets to the global standards grid.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:gap-4 relative z-10">
        <label className="relative group cursor-pointer">
          <input type="file" className="hidden" accept=".md" onChange={(e) => handleFileUpload(e, 'md')} />
          <div className="p-4 lg:p-6 border-2 border-dashed border-slate-200 dark:border-white/10 rounded-2xl lg:rounded-3xl hover:border-indigo-500 hover:bg-indigo-50/30 transition-all flex items-center gap-4">
            <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-xl group-hover:scale-110 transition-transform">
              <FileCode size={20} className="lg:w-6 lg:h-6" />
            </div>
            <div className="text-left">
              <h4 className="font-bold text-xs lg:text-sm">Validated Markdown (.md)</h4>
              <p className="text-[10px] text-slate-400">Direct sync for pre-formatted curricula.</p>
            </div>
          </div>
        </label>

        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100 dark:border-white/5"></div></div>
          <div className="relative flex justify-center text-[9px] lg:text-[10px] uppercase font-black tracking-widest"><span className="bg-white dark:bg-slate-900 px-4 text-slate-400">Neural Conversion Node</span></div>
        </div>

        <label className="relative group cursor-pointer">
          <input type="file" className="hidden" accept=".pdf" onChange={(e) => handleFileUpload(e, 'pdf')} />
          <div className="p-4 lg:p-6 border-2 border-dashed border-slate-200 dark:border-white/10 rounded-2xl lg:rounded-3xl hover:border-amber-500 hover:bg-amber-50/30 transition-all flex items-center gap-4">
            <div className="p-3 bg-amber-50 dark:bg-amber-900/30 text-amber-600 rounded-xl group-hover:scale-110 transition-transform">
              <FileText size={20} className="lg:w-6 lg:h-6" />
            </div>
            <div className="text-left">
              <h4 className="font-bold text-xs lg:text-sm">High-Density PDF → Neural</h4>
              <p className="text-[10px] text-slate-400">Institutional extraction of complex standards.</p>
            </div>
          </div>
        </label>

        <label className="relative group cursor-pointer">
          <input type="file" className="hidden" accept=".docx,.doc" onChange={(e) => handleFileUpload(e, 'docx')} />
          <div className="p-4 lg:p-6 border-2 border-dashed border-slate-200 dark:border-white/10 rounded-2xl lg:rounded-3xl hover:border-emerald-500 hover:bg-emerald-50/30 transition-all flex items-center gap-4">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 rounded-xl group-hover:scale-110 transition-transform">
              <FileType size={20} className="lg:w-6 lg:h-6" />
            </div>
            <div className="text-left">
              <h4 className="font-bold text-xs lg:text-sm">Word Document → Neural</h4>
              <p className="text-[10px] text-slate-400">World-class conversion for unformatted assets.</p>
            </div>
          </div>
        </label>
      </div>

      <button onClick={onCancel} className="mt-8 lg:mt-10 w-full py-4 text-slate-400 font-bold hover:text-slate-600 transition-colors uppercase tracking-widest text-[10px]">Disconnect Ingestion Node</button>
      
      {isProcessing && (
        <div className="absolute inset-0 bg-white/95 dark:bg-slate-950/95 flex flex-col items-center justify-center rounded-3xl lg:rounded-[3rem] z-50 backdrop-blur-md">
          <Loader2 className="animate-spin text-indigo-600 mb-4 lg:mb-6 w-10 h-10 lg:w-14 lg:h-14" />
          <p className="text-base lg:text-lg font-black tracking-tight text-indigo-600">Mounting Institutional Assets...</p>
          <p className="text-[10px] lg:text-sm font-medium text-slate-400 mt-2 px-6 text-center">{procStage}</p>
        </div>
      )}
    </div>
  );
}
