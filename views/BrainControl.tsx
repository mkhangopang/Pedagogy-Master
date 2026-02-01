// NEURAL BRAIN: INFRASTRUCTURE CONTROL HUB (v94.5)
import React, { useState } from 'react';
import { 
  RefreshCw, Zap, Check, Copy, ShieldCheck, Terminal, Cpu, Sparkles, Wrench, AlertTriangle
} from 'lucide-react';
import { NeuralBrain } from '../types';
import { supabase } from '../lib/supabase';

interface BrainControlProps {
  brain: NeuralBrain;
  onUpdate: (brain: NeuralBrain) => void;
}

const BrainControl: React.FC<BrainControlProps> = ({ brain, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'logic' | 'schema' | 'repair'>('logic');
  const [formData, setFormData] = useState(brain);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const repairSql = `-- REPAIR SCRIPT: Fix existing installations for Neural Ingestion v94.5
-- Target: Supabase / PostgreSQL

ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS document_summary TEXT,
ADD COLUMN IF NOT EXISTS difficulty_level TEXT,
ADD COLUMN IF NOT EXISTS rag_indexed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS extracted_text TEXT,
ADD COLUMN IF NOT EXISTS is_selected BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS gemini_metadata JSONB,
ADD COLUMN IF NOT EXISTS error_message TEXT,
ADD COLUMN IF NOT EXISTS subject TEXT,
ADD COLUMN IF NOT EXISTS grade_level TEXT;

-- Profiles enhancement for Adaptive Learning
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS grade_level TEXT,
ADD COLUMN IF NOT EXISTS subject_area TEXT,
ADD COLUMN IF NOT EXISTS teaching_style TEXT,
ADD COLUMN IF NOT EXISTS pedagogical_approach TEXT,
ADD COLUMN IF NOT EXISTS success_rate FLOAT DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS generation_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS edit_patterns JSONB DEFAULT '{"avgLengthChange": 0, "examplesCount": 0, "structureModifications": 0}'::jsonb;

-- Ensure Vector Extension is Active
CREATE EXTENSION IF NOT EXISTS vector;

-- Reset Diagnostic View to prevent Column Name collision
DROP VIEW IF EXISTS public.rag_health_report;
CREATE VIEW public.rag_health_report AS
SELECT 
    d.id as document_id,
    d.name as document_name,
    count(dc.id) as chunk_count,
    CASE 
        WHEN d.status = 'ready' AND count(dc.id) > 0 THEN 'HEALTHY'
        WHEN d.status = 'ready' AND count(dc.id) = 0 THEN 'BROKEN_INDEX'
        WHEN d.status = 'failed' THEN 'FAULTY_ASSET'
        ELSE 'PROCESSING'
    END as health_status
FROM public.documents d
LEFT JOIN public.document_chunks dc ON d.id = dc.document_id
GROUP BY d.id, d.name, d.status;
`;

  const masterSchemaSql = `-- EDUNEXUS AI: MASTER INFRASTRUCTURE SCHEMA v94.5
-- TARGET: Supabase + PGVector High-Fidelity Cluster

CREATE EXTENSION IF NOT EXISTS vector;

-- 1. USER PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    name TEXT,
    role TEXT DEFAULT 'teacher',
    plan TEXT DEFAULT 'free',
    queries_used INTEGER DEFAULT 0,
    queries_limit INTEGER DEFAULT 30,
    grade_level TEXT,
    subject_area TEXT,
    teaching_style TEXT,
    pedagogical_approach TEXT,
    generation_count INTEGER DEFAULT 0,
    success_rate FLOAT DEFAULT 0.0,
    edit_patterns JSONB DEFAULT '{"avgLengthChange": 0, "examplesCount": 0, "structureModifications": 0}'::jsonb,
    tenant_config JSONB DEFAULT '{"primary_color": "#4f46e5", "brand_name": "EduNexus AI"}'::jsonb,
    active_doc_id UUID,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. NEURAL BRAIN (Logic Storage)
CREATE TABLE IF NOT EXISTS public.neural_brain (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_prompt TEXT NOT NULL,
    bloom_rules TEXT,
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. CURRICULUM VAULT (Document Registry)
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing',
    rag_indexed BOOLEAN DEFAULT false,
    extracted_text TEXT,
    document_summary TEXT,
    difficulty_level TEXT,
    subject TEXT,
    grade_level TEXT,
    file_path TEXT,
    mime_type TEXT,
    storage_type TEXT DEFAULT 'r2',
    is_selected BOOLEAN DEFAULT false,
    gemini_metadata JSONB,
    error_message TEXT,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. VECTOR GRID (Embedding Storage)
CREATE TABLE IF NOT EXISTS public.document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    chunk_text TEXT NOT NULL,
    embedding vector(768),
    slo_codes TEXT[],
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. SLO INTELLIGENCE DATABASE
CREATE TABLE IF NOT EXISTS public.slo_database (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
    slo_code TEXT NOT NULL,
    slo_full_text TEXT NOT NULL,
    subject TEXT,
    grade_level TEXT,
    bloom_level TEXT,
    cognitive_complexity TEXT,
    teaching_strategies TEXT[],
    assessment_ideas TEXT[],
    prerequisite_concepts TEXT[],
    common_misconceptions TEXT[],
    keywords TEXT[],
    page_number INTEGER,
    extraction_confidence FLOAT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(document_id, slo_code)
);

-- 6. SEARCH RPC
CREATE OR REPLACE FUNCTION hybrid_search_chunks_v3(
  query_text TEXT,
  query_embedding vector(768),
  match_count INT,
  filter_document_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  chunk_text TEXT,
  slo_codes TEXT[],
  metadata JSONB,
  combined_score FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.chunk_text,
    dc.slo_codes,
    dc.metadata,
    (1 - (dc.embedding <=> query_embedding)) as combined_score
  FROM public.document_chunks dc
  WHERE
    (filter_document_ids IS NULL OR dc.document_id = ANY(filter_document_ids))
  ORDER BY combined_score DESC
  LIMIT match_count;
END;
$$;
`;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await supabase.from('neural_brain').insert([{ master_prompt: formData.masterPrompt, version: formData.version + 1, is_active: true }]);
      onUpdate({...formData, version: formData.version + 1, updatedAt: new Date().toISOString()});
      alert("Neural logic committed to grid.");
    } catch (err: any) { alert("Error updating logic."); } finally { setIsSaving(false); }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24 px-2 text-left">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 text-slate-900 dark:text-white">
        <div className="space-y-1">
          <h1 className="text-2xl font-black flex items-center gap-3 tracking-tight uppercase">
            <ShieldCheck className="text-indigo-600" /> Neural Architecture
          </h1>
          <p className="text-slate-500 text-xs font-medium italic">RAG Optimized Node Hub v94.5</p>
        </div>
        <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-inner">
          {['logic', 'schema', 'repair'].map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm' : 'text-slate-500'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </header>

      {activeTab === 'logic' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-[2.5rem] border border-slate-200 dark:border-white/10 shadow-sm space-y-6">
            <h2 className="text-lg font-bold flex items-center gap-2 dark:text-white"><Terminal size={18} className="text-indigo-500" /> Master Prompt</h2>
            <textarea 
              value={formData.masterPrompt}
              onChange={(e) => setFormData({...formData, masterPrompt: e.target.value})}
              className="w-full h-80 p-6 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-2xl font-mono text-[10px] leading-relaxed resize-none focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <button onClick={handleSave} disabled={isSaving} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
              {isSaving ? <RefreshCw className="animate-spin" size={18}/> : <Zap size={18}/>} Commit Version {formData.version + 1}
            </button>
          </div>
          <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] flex flex-col justify-center shadow-2xl relative overflow-hidden">
             <div className="absolute top-0 right-0 p-8 opacity-5"><Cpu size={150} /></div>
             <h3 className="text-xl font-bold mb-4 text-emerald-400 flex items-center gap-2"><Sparkles size={20}/> World-Class Extraction</h3>
             <p className="text-slate-400 text-xs leading-relaxed mb-6 italic">
                Node v94.5 enforces strict curriculum mapping. Use the <b>REPAIR</b> script to align your database columns if document ingestion is failing due to 'Missing Column' faults.
             </p>
          </div>
        </div>
      )}

      {activeTab === 'repair' && (
        <div className="space-y-4">
           <div className="bg-rose-50 dark:bg-rose-950/20 p-6 rounded-3xl border border-rose-100 dark:border-rose-900/50 flex items-start gap-4">
             <AlertTriangle className="text-rose-600 shrink-0" />
             <div>
               <h4 className="text-sm font-black uppercase text-rose-700 tracking-tight">Sync & Field Repair</h4>
               <p className="text-xs text-rose-600/80 mt-1">Run this SQL in your Supabase Editor to fix "Missing Column" errors during ingestion.</p>
             </div>
           </div>
           <div className="bg-slate-900 rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden">
               <div className="p-6 border-b border-white/5 flex items-center justify-between">
                 <h3 className="text-white font-black uppercase tracking-tight flex items-center gap-2 text-[10px]"><Wrench size={14}/> Repair SQL</h3>
                 <button onClick={() => copyToClipboard(repairSql, 'repair')} className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-[9px] font-black uppercase text-white transition-all">
                     {copiedId === 'repair' ? <Check size={12}/> : <Copy size={12}/>} Copy SQL
                 </button>
               </div>
               <div className="p-6 bg-black/40">
                 <pre className="text-[9px] font-mono text-emerald-400 leading-relaxed overflow-x-auto h-60 custom-scrollbar">{repairSql}</pre>
               </div>
           </div>
        </div>
      )}

      {activeTab === 'schema' && (
        <div className="bg-slate-900 rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden">
           <div className="p-8 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-white font-black uppercase tracking-tight">Infrastructure Schema v94.5</h3>
              <button onClick={() => copyToClipboard(masterSchemaSql, 'schema')} className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-black uppercase text-white transition-all">
                 {copiedId === 'schema' ? <Check size={12}/> : <Copy size={12}/>} Copy Full Schema
              </button>
           </div>
           <div className="p-8 bg-black/40">
              <pre className="text-[10px] font-mono text-emerald-400 leading-relaxed overflow-x-auto h-[500px] custom-scrollbar">{masterSchemaSql}</pre>
           </div>
        </div>
      )}
    </div>
  );
};

export default BrainControl;
