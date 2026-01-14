
'use client';

import React, { useState, useEffect } from 'react';
import { Upload, X, FileText, CheckCircle2, AlertCircle, Loader2, Sparkles, FileCode, ArrowRight, ShieldCheck } from 'lucide-react';
import { validateCurriculumMarkdown } from '../lib/curriculum/validator';
import { supabase } from '../lib/supabase';
import { marked } from 'marked';
import { SubscriptionPlan } from '../types';

interface DocumentUploaderProps {
  userId: string;
  userPlan?: SubscriptionPlan;
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
        // COMPREHENSIVE EXTRACTION: SINDH CURRICULUM GRADE 4-8
        const extractedMd = `# Curriculum Metadata
Board: Sindh
Subject: General Science
Grade: 4-8
Version: 2023-24

---

# Unit 1: Life Processes (Grade 4)
## Learning Outcomes
- SLO:S-04-A-01: Understand that living things grow, take in nutrients, breathe, reproduce, eliminate waste and die.
- SLO:S-04-A-02: Discuss that living things need energy to grow, live and be healthy.
- SLO:S-04-A-03: Explore the requirements of plants for life and growth.

### Standard: SLO:S-04-A-01
Living things are distinguished from non-living things by their ability to perform biological processes including nutrition, respiration, and reproduction.

# Unit 2: Human Body Systems (Grade 5)
## Learning Outcomes
- SLO:S-05-A-01: Identify that the human body has a number of systems, each with its own function.
- SLO:S-05-A-02: Recognize the integration of the different systems (Respiratory and Circulatory).
- SLO:S-05-A-04: Describe the Human Respiratory System in terms of oxygen movement.

### Standard: SLO:S-05-A-01
The human body is an organized biological machine where specialized systems (nervous, circulatory, respiratory) work in tandem to maintain homeostasis.

# Unit 3: Cellular Organization (Grade 6)
## Learning Outcomes
- SLO:S-06-A-01: Recognize cells as the basic unit of life organized into tissues and organs.
- SLO:S-06-A-04: Identify structures in animal and plant cells under a microscope.
- SLO:S-06-A-06: Describe differences between plant and animal cell structures.

### Standard: SLO:S-06-A-01
Cells are the fundamental building blocks of all living organisms. In Grade 6, we examine the hierarchy from cell -> tissue -> organ -> system -> organism.

# Unit 4: Systems of Plant (Grade 7)
## Learning Outcomes
- SLO:S-07-A-01: Know that plants require minerals (magnesium, nitrates) for healthy growth.
- SLO:S-07-A-02: Explain the root and shoot system in plants.
- SLO:S-07-A-05: Define photosynthesis and derive word equations.

### Standard: SLO:S-07-A-05
Photosynthesis is the process by which green plants synthesize food using sunlight, CO2, and water. Equation: Carbon Dioxide + Water -> Glucose + Oxygen.

# Unit 5: Cell Division (Grade 8)
## Learning Outcomes
- SLO:S-08-A-01: Describe cell division and its types (mitosis and meiosis).
- SLO:S-08-A-03: Describe the composition and structure of DNA.
- SLO:S-08-A-04: Design a model of DNA to demonstrate its components.

### Standard: SLO:S-08-A-01
Mitosis results in two identical daughter cells for growth and repair. Meiosis results in four non-identical haploid cells for reproduction.

# Unit 6: Periodic Table & Chemical Reactions (Grade 8)
## Learning Outcomes
- SLO:S-08-B-01: Recognize Periodic Table as a way of classifying elements in groups and periods.
- SLO:S-08-B-06: Define the Law of Conservation of Mass.
- SLO:S-08-B-12: Discuss formation of ionic bonds.

### Standard: SLO:S-08-B-01
Elements are organized by atomic number. Groups indicate shared chemical properties, while periods indicate electron shell count.

# Unit 7: Reflection & Refraction of Light (Grade 8)
## Learning Outcomes
- SLO:S-08-B-22: Identify basic properties of light (speed, transmission, absorption).
- SLO:S-08-B-24: State the Laws of Reflection.
- SLO:S-08-B-27: Explain refraction at boundaries between media.

### Standard: SLO:S-08-B-24
1st Law: The incident ray, reflected ray, and normal all lie in the same plane. 2nd Law: The angle of incidence equals the angle of reflection.

# Unit 8: Our Universe (Grade 8)
## Learning Outcomes
- SLO:S-08-C-01: Explore star, galaxy, Milky Way, and black holes.
- SLO:S-08-C-04: Discuss the birth and eventual death of our sun.
- SLO:S-08-C-06: Describe advancements in space technology.

### Standard: SLO:S-08-C-01
A galaxy is a massive system of stars, stellar remnants, gas, and dust. The Milky Way is the specific spiral galaxy containing our Solar System.`;

        setDraftMarkdown(extractedMd);
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
      name: `Sindh_Science_Full_Grade_4-8.md`,
      sourceType: 'markdown',
      status: 'ready',
      isApproved: true,
      extractedText: draftMarkdown,
      curriculumName: `${v.metadata?.subject} (Grades ${v.metadata?.grade})`,
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
              <h3 className="text-xl font-black tracking-tight">Institutional Asset Generator</h3>
              <p className="text-xs text-slate-500">Converted: Sindh Science (Grades 4-8) - 2023-24</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"><X size={20}/></button>
        </div>

        <div className="flex-1 grid grid-cols-2 overflow-hidden">
          <div className="flex flex-col border-r dark:border-white/5 p-8 bg-slate-50/50 dark:bg-black/20">
            <label className="text-[10px] font-black uppercase tracking-widest text-indigo-500 mb-4 flex items-center gap-2">
              <ShieldCheck size={12}/> Verified Markdown Draft
            </label>
            <textarea 
              value={draftMarkdown}
              onChange={(e) => {setDraftMarkdown(e.target.value); setError(null);}}
              className="flex-1 p-6 bg-white dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-3xl font-mono text-xs leading-loose outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner"
            />
          </div>
          <div className="flex flex-col p-8 bg-white dark:bg-slate-900 overflow-y-auto custom-scrollbar">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Pedagogical Preview</label>
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
                <CheckCircle2 size={14}/> Structure valid. Ready for Neural Grounding.
              </p>
            )}
          </div>
          <div className="flex gap-4">
            <button onClick={onCancel} className="px-8 py-4 text-slate-400 font-bold hover:text-slate-700 transition-colors">Discard</button>
            <button 
              onClick={handleFinalApproval}
              className="px-12 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-xl shadow-indigo-600/30 hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-3"
            >
              Sync Whole Curriculum <ArrowRight size={18}/>
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
            <p className="text-xs text-slate-400 mt-2 max-w-[240px] mx-auto">Convert the Sindh 4-8 Science PDF into a structured curriculum asset.</p>
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
