
'use client';

import React, { useState, useEffect } from 'react';
import { Upload, X, FileText, CheckCircle2, AlertCircle, Loader2, Sparkles, FileCode, ArrowRight, ShieldCheck } from 'lucide-react';
import { validateCurriculumMarkdown } from '../lib/curriculum/validator';
import { supabase } from '../lib/supabase';
import { marked } from 'marked';
import { SubscriptionPlan } from '../types';

interface DocumentUploaderProps {
  userId: string;
  userPlan?: SubscriptionPlan; // Added userPlan to match views/Documents.tsx usage
  onComplete: (doc: any) => void;
  onCancel: () => void;
}

export default function DocumentUploader({ userId, onComplete, onCancel }: DocumentUploaderProps) {
  const [mode, setMode] = useState<'selection' | 'transition'>('selection');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftMarkdown, setDraftMarkdown] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');

  useEffect(() => {
    if (draftMarkdown) {
      setPreviewHtml(marked.parse(draftMarkdown) as string);
    }
  }, [draftMarkdown]);
  
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'md' | 'pdf') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setError(null);

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

        onComplete({
          name: file.name,
          sourceType: 'markdown',
          status: 'ready',
          isApproved: true,
          extractedText: text,
          curriculumName: `${validation.metadata?.subject} (Grade ${validation.metadata?.grade})`,
          ...validation.metadata
        });
      } else {
        setMode('transition');
        // AI OCR Mock for PDF -> Markdown conversion
        const mockMd = `# Curriculum Metadata\nBoard: Sindh\nSubject: Science\nGrade: 8\nVersion: 2024\n\n# Unit 1: Energy Transformation\n## Learning Outcomes\n- SLO 1.1: Identify various forms of energy.\n\n### Standard: SLO 1.1\nEnergy can neither be created nor destroyed, only transformed. Examples include chemical to heat energy in combustion.`;
        setDraftMarkdown(mockMd);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFinalApproval = () => {
    const v = validateCurriculumMarkdown(draftMarkdown);
    if (!v.isValid) {
      setError(v.errors[0]);
      return;
    }
    
    onComplete({
      name: `Curriculum_${v.metadata?.subject}_${v.metadata?.grade}.md`,
      sourceType: 'markdown',
      status: 'ready',
      isApproved: true,
      extractedText: draftMarkdown,
      curriculumName: `${v.metadata?.subject} (Grade ${v.metadata?.grade})`,
      ...v.metadata
    });
  };

  if (mode === 'transition') {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-[3rem] p-1 w-full max-w-6xl shadow-2xl border border-slate-100 dark:border-white/5 animate-in zoom-in-95 flex flex-col h-[85vh]">
        <div className="flex items-center justify-between p-8 border-b dark:border-white/5">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-xl shadow-indigo-600/20"><FileCode size={24}/></div>
            <div>
              <h3 className="text-xl font-black tracking-tight">Curriculum Editor</h3>
              <p className="text-xs text-slate-500">Ensure strict template alignment before institutional indexing.</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"><X size={20}/></button>
        </div>

        <div className="flex-1 grid grid-cols-2 overflow-hidden">
          <div className="flex flex-col border-r dark:border-white/5 p-8 bg-slate-50/50 dark:bg-black/20">
            <label className="text-[10px] font-black uppercase tracking-widest text-indigo-500 mb-4 flex items-center gap-2">
              <ShieldCheck size={12}/> Authoritative Markdown
            </label>
            <textarea 
              value={draftMarkdown}
              onChange={(e) => {setDraftMarkdown(e.target.value); setError(null);}}
              className="flex-1 p-6 bg-white dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-3xl font-mono text-xs leading-loose outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner"
              placeholder="# Curriculum Metadata..."
            />
          </div>
          <div className="flex flex-col p-8 bg-white dark:bg-slate-900 overflow-y-auto custom-scrollbar">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Structure Preview</label>
            <div className="prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
        </div>

        <div className="p-8 border-t dark:border-white/5 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
          <div className="max-w-md">
            {error ? (
              <p className="text-xs text-rose-500 font-bold flex items-center gap-2 animate-pulse">
                <AlertCircle size={14}/> {error}
              </p>
            ) : (
              <p className="text-xs text-emerald-600 font-bold flex items-center gap-2">
                <CheckCircle2 size={14}/> Structure valid. Ready for RAG embedding.
              </p>
            )}
          </div>
          <div className="flex gap-4">
            <button onClick={onCancel} className="px-8 py-4 text-slate-400 font-bold hover:text-slate-600 transition-colors">Discard Draft</button>
            <button 
              onClick={handleFinalApproval}
              className="px-12 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-xl shadow-indigo-600/30 hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-3"
            >
              Approve Curriculum <ArrowRight size={18}/>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-[3rem] p-12 w-full max-w-2xl shadow-2xl border border-slate-100 dark:border-white/5 animate-in zoom-in-95">
      <div className="text-center mb-12">
        <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/20 rounded-[2rem] flex items-center justify-center mx-auto mb-6 text-indigo-600">
          <ShieldCheck size={40} />
        </div>
        <h3 className="text-3xl font-black tracking-tight">Ingest Standards</h3>
        <p className="text-slate-500 mt-2 font-medium">Authoritative curricula must be Markdown-first for precise RAG alignment.</p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <label className="relative group cursor-pointer">
          <input type="file" className="hidden" accept=".md" onChange={(e) => handleFileUpload(e, 'md')} />
          <div className="p-10 border-2 border-dashed border-slate-200 dark:border-white/10 rounded-[2.5rem] hover:border-indigo-500 hover:bg-indigo-50/30 transition-all text-center">
            <FileCode className="mx-auto mb-4 text-indigo-500" size={48} />
            <h4 className="font-bold text-lg">Direct Markdown Upload</h4>
            <p className="text-xs text-slate-400 mt-2 max-w-[240px] mx-auto">Upload .md files following the institutional template.</p>
          </div>
        </label>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100 dark:border-white/5"></div></div>
          <div className="relative flex justify-center text-xs uppercase"><span className="bg-white dark:bg-slate-900 px-4 text-slate-400 font-bold tracking-widest">or assisted path</span></div>
        </div>

        <label className="relative group cursor-pointer">
          <input type="file" className="hidden" accept=".pdf" onChange={(e) => handleFileUpload(e, 'pdf')} />
          <div className="p-10 border-2 border-dashed border-slate-200 dark:border-white/10 rounded-[2.5rem] hover:border-amber-500 hover:bg-amber-50/30 transition-all text-center">
            <FileText className="mx-auto mb-4 text-amber-500" size={48} />
            <h4 className="font-bold text-lg">PDF → Markdown Assistant</h4>
            <p className="text-xs text-slate-400 mt-2 max-w-[240px] mx-auto">Convert curriculum PDFs into structured Markdown drafts.</p>
          </div>
        </label>
      </div>

      <button onClick={onCancel} className="mt-10 w-full py-4 text-slate-400 font-bold hover:text-slate-600 transition-colors uppercase tracking-widest text-[10px]">Close Ingestion Node</button>
      
      {isProcessing && (
        <div className="absolute inset-0 bg-white/90 dark:bg-slate-950/90 flex flex-col items-center justify-center rounded-[3rem] z-50 backdrop-blur-sm">
          <Loader2 className="animate-spin text-indigo-600 mb-6" size={56} />
          <p className="text-lg font-black tracking-tight text-indigo-600">Neural Syncing Curriculum...</p>
        </div>
      )}
    </div>
  );
}
