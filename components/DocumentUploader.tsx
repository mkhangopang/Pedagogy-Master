
'use client';

import React, { useState, useEffect } from 'react';
import { X, FileText, CheckCircle2, AlertCircle, Loader2, FileCode, ArrowRight, ShieldCheck, Database, FileType, BrainCircuit, Sparkles } from 'lucide-react';
import { validateCurriculumMarkdown } from '../lib/curriculum/validator';
import { marked } from 'marked';
import { SubscriptionPlan } from '../types';
import { supabase } from '../lib/supabase';
import { GoogleGenAI } from '@google/genai';

// External Parser Interfaces
declare const pdfjsLib: any;
declare const mammoth: any;

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
    if (type === 'pdf') {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(' ');
          fullText += `[Page ${i}]\n${pageText}\n\n`;
        }
        return fullText;
      } catch (e) {
        throw new Error("PDF Parsing failed. Ensure file is not encrypted.");
      }
    } else {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        return result.value;
      } catch (e) {
        throw new Error("Word document conversion failed.");
      }
    }
  };

  const synthesizeMasterMarkdown = async (rawText: string, fileName: string) => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    
    const prompt = `
      You are the Official Curriculum Data Engineer for EduNexus AI. 
      Your task is to transform the following raw text from an institutional document (${fileName}) into a high-fidelity "Master Markdown" file.

      RULES FOR CONVERSION:
      1. CRITICAL: Identify Student Learning Objectives (SLOs). Use codes like S-04-A-01 (Grade-Domain-Sub-ID).
      2. Group content into '# Unit X' headers.
      3. For every SLO found, create a '### Standard: [CODE]' section with a detailed pedagogical explanation of that outcome.
      4. Maintain the specific Sindh Curriculum hierarchy if detected.
      5. Start with a '# Curriculum Metadata' section including Board, Subject, Grade, and Version.

      OUTPUT FORMAT:
      # Curriculum Metadata
      Board: [Detected or Sindh]
      Subject: [Detected]
      Grade: [Detected]
      Version: 2023-24
      ---
      # Unit 1: [Name]
      ## Learning Outcomes
      - SLO:[CODE]: [Description]
      ---
      ### Standard: [CODE]
      [Detailed pedagogical breakdown...]

      RAW TEXT:
      ${rawText.substring(0, 40000)}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1, // High precision for curriculum mapping
        systemInstruction: "You are an expert in curriculum standards mapping and institutional data conversion."
      }
    });

    return response.text || "";
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'md' | 'pdf' | 'docx') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setError(null);
    setProcStage('Initializing conversion node...');

    try {
      if (type === 'md') {
        const text = await file.text();
        const validation = validateCurriculumMarkdown(text);
        if (!validation.isValid) {
          setDraftMarkdown(text);
          setMode('transition');
          setError(`Structural Validation Error: ${validation.errors[0]}`);
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
        if (!response.ok) throw new Error(result.error || "Persistence failed.");
        onComplete({ id: result.id, name: file.name, status: 'ready' });
      } else {
        setMode('transition');
        setProcStage(`Extracting raw bytes from ${file.name}...`);
        const rawText = await extractRawText(file, type);
        
        setProcStage('Gemini 3 synthesizing curriculum structure...');
        const masterMd = await synthesizeMasterMarkdown(rawText, file.name);
        setDraftMarkdown(masterMd);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
      setProcStage('');
    }
  };

  const handleFinalApproval = async () => {
    const v = validateCurriculumMarkdown(draftMarkdown);
    if (!v.isValid) {
      setError(v.errors[0]);
      return;
    }

    setIsProcessing(true);
    setProcStage('Committing to Cloud R2 & Supabase Neural Grid...');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/docs/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          name: "Neural_Synthesis_" + Date.now() + ".md",
          sourceType: 'markdown',
          extractedText: draftMarkdown,
          ...v.metadata
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Neural Sync failed.");
      
      onComplete({ id: result.id, name: `Master Curriculum (Synthesized)`, status: 'ready' });
    } catch (err: any) {
      setError(`Persistence Error: ${err.message}`);
    } finally {
      setIsProcessing(false);
      setProcStage('');
    }
  };

  if (mode === 'transition') {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-[3rem] p-1 w-full max-w-6xl shadow-2xl border border-slate-100 dark:border-white/5 animate-in zoom-in-95 flex flex-col h-[85vh]">
        <div className="flex items-center justify-between p-8 border-b dark:border-white/5">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-xl shadow-indigo-600/20">
              {isProcessing ? <BrainCircuit size={24} className="animate-pulse" /> : <FileCode size={24}/>}
            </div>
            <div>
              <h3 className="text-xl font-black tracking-tight">Institutional Asset Synthesizer</h3>
              <p className="text-xs text-slate-500">{isProcessing ? procStage : 'Review synthesized standards before persistence.'}</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"><X size={20}/></button>
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 overflow-hidden">
          <div className="flex flex-col border-r dark:border-white/5 p-8 bg-slate-50/50 dark:bg-black/20">
            <label className="text-[10px] font-black uppercase tracking-widest text-indigo-500 mb-4 flex items-center gap-2">
              <ShieldCheck size={12}/> Neural Markdown Draft
            </label>
            <textarea 
              value={draftMarkdown}
              onChange={(e) => {setDraftMarkdown(e.target.value); setError(null);}}
              className="flex-1 p-6 bg-white dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-3xl font-mono text-xs leading-loose outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner"
              placeholder="Synthesizing curriculum nodes..."
            />
          </div>
          <div className="flex flex-col p-8 bg-white dark:bg-slate-900 overflow-y-auto custom-scrollbar">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
              <Sparkles size={12} className="text-amber-500" /> Pedagogical Preview
            </label>
            <div className="prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
        </div>

        <div className="p-8 border-t dark:border-white/5 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
          <div className="max-w-md">
            {error ? (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/30 rounded-xl border border-rose-100 dark:border-rose-900">
                <p className="text-xs text-rose-500 font-bold flex items-center gap-2 animate-pulse">
                  <AlertCircle size={14}/> {error}
                </p>
              </div>
            ) : (
              <p className="text-xs text-emerald-600 font-bold flex items-center gap-2">
                <CheckCircle2 size={14}/> {draftMarkdown ? 'Structure valid. Verified by Gemini 3 Node.' : 'Extracting data...'}
              </p>
            )}
          </div>
          <div className="flex gap-4">
            <button onClick={onCancel} className="px-8 py-4 text-slate-400 font-bold hover:text-slate-700 transition-colors">Discard</button>
            <button 
              onClick={handleFinalApproval}
              disabled={isProcessing || !draftMarkdown}
              className="px-12 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-xl shadow-indigo-600/30 hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Database size={18}/>}
              Finalize Global Sync <ArrowRight size={18}/>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-[3rem] p-12 w-full max-w-2xl shadow-2xl border border-slate-100 dark:border-white/5 animate-in zoom-in-95 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-600/5 rounded-full blur-3xl" />
      
      <div className="text-center mb-12 relative z-10">
        <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/20 rounded-[2rem] flex items-center justify-center mx-auto mb-6 text-indigo-600">
          <ShieldCheck size={40} />
        </div>
        <h3 className="text-3xl font-black tracking-tight">Curriculum Ingestion</h3>
        <p className="text-slate-500 mt-2 font-medium">Persist institutional standards to the cloud neural grid.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 relative z-10">
        <label className="relative group cursor-pointer">
          <input type="file" className="hidden" accept=".md" onChange={(e) => handleFileUpload(e, 'md')} />
          <div className="p-6 border-2 border-dashed border-slate-200 dark:border-white/10 rounded-3xl hover:border-indigo-500 hover:bg-indigo-50/30 transition-all flex items-center gap-4">
            <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-xl group-hover:scale-110 transition-transform">
              <FileCode size={24} />
            </div>
            <div className="text-left">
              <h4 className="font-bold text-sm">Direct Markdown Upload</h4>
              <p className="text-[10px] text-slate-400">Upload verified .md files for immediate indexing.</p>
            </div>
          </div>
        </label>

        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100 dark:border-white/5"></div></div>
          <div className="relative flex justify-center text-[10px] uppercase font-black tracking-widest"><span className="bg-white dark:bg-slate-900 px-4 text-slate-400">or structural conversion</span></div>
        </div>

        <label className="relative group cursor-pointer">
          <input type="file" className="hidden" accept=".pdf" onChange={(e) => handleFileUpload(e, 'pdf')} />
          <div className="p-6 border-2 border-dashed border-slate-200 dark:border-white/10 rounded-3xl hover:border-amber-500 hover:bg-amber-50/30 transition-all flex items-center gap-4">
            <div className="p-3 bg-amber-50 dark:bg-amber-900/30 text-amber-600 rounded-xl group-hover:scale-110 transition-transform">
              <FileText size={24} />
            </div>
            <div className="text-left">
              <h4 className="font-bold text-sm">PDF → Neural Synthesis</h4>
              <p className="text-[10px] text-slate-400">High-fidelity extraction of complex standards.</p>
            </div>
          </div>
        </label>

        <label className="relative group cursor-pointer">
          <input type="file" className="hidden" accept=".docx,.doc" onChange={(e) => handleFileUpload(e, 'docx')} />
          <div className="p-6 border-2 border-dashed border-slate-200 dark:border-white/10 rounded-3xl hover:border-emerald-500 hover:bg-emerald-50/30 transition-all flex items-center gap-4">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 rounded-xl group-hover:scale-110 transition-transform">
              <FileType size={24} />
            </div>
            <div className="text-left">
              <h4 className="font-bold text-sm">Word → Neural Synthesis</h4>
              <p className="text-[10px] text-slate-400">World-class conversion for unformatted text.</p>
            </div>
          </div>
        </label>
      </div>

      <button onClick={onCancel} className="mt-10 w-full py-4 text-slate-400 font-bold hover:text-slate-600 transition-colors uppercase tracking-widest text-[10px]">Close Ingestion Node</button>
      
      {isProcessing && (
        <div className="absolute inset-0 bg-white/95 dark:bg-slate-950/95 flex flex-col items-center justify-center rounded-[3rem] z-50 backdrop-blur-md">
          <Loader2 className="animate-spin text-indigo-600 mb-6" size={56} />
          <p className="text-lg font-black tracking-tight text-indigo-600">Processing Cloud Assets...</p>
          <p className="text-sm font-medium text-slate-400 mt-2">{procStage}</p>
        </div>
      )}
    </div>
  );
}
