// NEURAL BRAIN: INFRASTRUCTURE CONTROL HUB (v92.3)
import React, { useState, useEffect } from 'react';
import { 
  RefreshCw, CheckCircle2, Copy, Zap, Check, 
  Database, ShieldCheck, Terminal, Activity, Cpu, Sparkles, HeartPulse, FileCode, Wrench, AlertTriangle, Globe, Box
} from 'lucide-react';
import { NeuralBrain } from '../types';
import { supabase } from '../lib/supabase';

interface BrainControlProps {
  brain: NeuralBrain;
  onUpdate: (brain: NeuralBrain) => void;
}

const BrainControl: React.FC<BrainControlProps> = ({ brain, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'logic' | 'schema' | 'repair' | 'rag'>('logic');
  const [formData, setFormData] = useState(brain);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const repairSql = `-- REPAIR SCRIPT: Fix existing installations
ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS document_summary TEXT,
ADD COLUMN IF NOT EXISTS difficulty_level TEXT,
ADD COLUMN IF NOT EXISTS rag_indexed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS extracted_text TEXT,
ADD COLUMN IF NOT EXISTS is_selected BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS gemini_metadata JSONB,
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Profiles enhancement
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS grade_level TEXT,
ADD COLUMN IF NOT EXISTS subject_area TEXT,
ADD COLUMN IF NOT EXISTS teaching_style TEXT,
ADD COLUMN IF NOT EXISTS pedagogical_approach TEXT,
ADD COLUMN IF NOT EXISTS success_rate FLOAT DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS generation_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS edit_patterns JSONB DEFAULT '{"avgLengthChange": 0, "examplesCount": 0, "structureModifications": 0}'::jsonb;

CREATE EXTENSION IF NOT EXISTS vector;

-- Reset Diagnostic View to prevent Column Name collision (Error 42P16)
DROP VIEW IF EXISTS public.rag_health_report;
CREATE VIEW public.rag_health_report AS
SELECT 
    d.id as document_id,
    d.name as document_name,
    count(dc.id) as chunk_count,
    CASE 
        WHEN d.status = 'ready' AND count(dc.id) > 0 THEN 'HEALTHY'
        WHEN d.status = 'ready' AND count(dc.id) = 0 THEN 'BROKEN_INDEX'
        ELSE 'PROCESSING'
    END as health_status
FROM public.documents d
LEFT JOIN public.document_chunks dc ON d.id = dc.document_id
GROUP BY d.id, d.name, d.status;
`;

  const corsConfig = `[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Content-Type", "Content-Length"],
    "MaxAgeSeconds": 3000
  }
]`;

  const masterSchemaSql = `-- EDUNEXUS AI: COMPLETE INFRASTRUCTURE SCHEMA v92.3
-- TARGET: Supabase + PGVector High-Fidelity Cluster

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. USER PROFILES & ADAPTIVE IDENTITY
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

-- 3. NEURAL BRAIN (MASTER PROMPT VAULT)
CREATE TABLE IF NOT EXISTS public.neural_brain (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_prompt TEXT NOT NULL,
    bloom_rules TEXT,
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. CURRICULUM VAULT (DOCUMENTS)
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
    is_selected BOOLEAN DEFAULT false,
    gemini_metadata JSONB,
    error_message TEXT,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. VECTOR GRID (CHUNK STORAGE)
CREATE TABLE IF NOT EXISTS public.document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    chunk_text TEXT NOT NULL,
    embedding vector(768),
    slo_codes TEXT[],
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. SLO INTELLIGENCE DATABASE
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

-- 7. PEDAGOGICAL TRACKER
CREATE TABLE IF NOT EXISTS public.teacher_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    slo_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'planning',
    taught_date DATE,
    student_mastery_percentage INTEGER,
    notes TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. OUTPUT ARTIFACTS & FEEDBACK
CREATE TABLE IF NOT EXISTS public.output_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB,
    status TEXT DEFAULT 'generated',
    edit_depth INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.feedback_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    artifact_id UUID REFERENCES public.output_artifacts(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    event_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. INTELLIGENT GLOBAL CACHE
CREATE TABLE IF NOT EXISTS public.ai_generated_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slo_code TEXT NOT NULL,
    content_type TEXT NOT NULL,
    content TEXT NOT NULL,
    generated_by TEXT,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. INDICES
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON public.document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_slo_code ON public.slo_database (slo_code);
CREATE INDEX IF NOT EXISTS idx_progress_user ON public.teacher_progress (user_id);

-- 11. DIAGNOSTIC VIEWS
-- Fixed: Drop before create to handle column name changes
DROP VIEW IF EXISTS public.rag_health_report;
CREATE VIEW public.rag_health_report AS
SELECT 
    d.id as document_id,
    d.name as document_name,
    count(dc.id) as chunk_count,
    CASE 
        WHEN d.status = 'ready' AND count(dc.id) > 0 THEN 'HEALTHY'
        WHEN d.status = 'ready' AND count(dc.id) = 0 THEN 'BROKEN_INDEX'
        ELSE 'PROCESSING'
    END as health_status
FROM public.documents d
LEFT JOIN public.document_chunks dc ON d.id = dc.document_id
GROUP BY d.id, d.name, d.status;

-- 12. RPC FUNCTIONS
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

CREATE OR REPLACE FUNCTION get_extension_status(ext TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM pg_extension WHERE extname = ext);
END;
$$;

CREATE OR REPLACE FUNCTION get_vector_dimensions()
RETURNS INTEGER LANGUAGE plpgsql AS $$
BEGIN
    RETURN (SELECT atttypmod - 4 FROM pg_attribute WHERE attrelid = 'public.document_chunks'::regclass AND attname = 'embedding');
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
      alert("Logic deployed.");
    } catch (err: any) { alert("Error updating logic."); } finally { setIsSaving(false); }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24 px-2 text-left">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 text-slate-900 dark:text-white">
        <div className="space-y-1">
          <h1 className="text-2xl font-black flex items-center gap-3 tracking-tight uppercase">
            <ShieldCheck className="text-indigo-600" /> Infrastructure Node
          </h1>
          <p className="text-slate-500 text-xs font-medium italic">V92.3 RAG Optimized Cluster</p>
        </div>
        <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-inner">
          {['logic', 'schema', 'repair', 'rag'].map(tab => (
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
              {isSaving ? <RefreshCw className="animate-spin" size={18}/> : <Zap size={18}/>} Commit Logic v{formData.version + 1}
            </button>
          </div>
          <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] flex flex-col justify-center shadow-2xl relative overflow-hidden">
             <div className="absolute top-0 right-0 p-8 opacity-5"><Cpu size={150} /></div>
             <h3 className="text-xl font-bold mb-4 text-emerald-400 flex items-center gap-2"><Sparkles size={20}/> World-Class RAG</h3>
             <p className="text-slate-400 text-xs leading-relaxed mb-6 italic">
                Your neural infrastructure requires specific columns and tables for high-fidelity extraction and adaptive learning. Use the <b>REPAIR</b> tab to patch existing instances or <b>SCHEMA</b> for fresh clusters.
             </p>
          </div>
        </div>
      )}

      {activeTab === 'repair' && (
        <div className="space-y-8">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
             <div className="space-y-4">
                <div className="bg-rose-50 dark:bg-rose-950/20 p-6 rounded-3xl border border-rose-100 dark:border-rose-900/50 flex items-start gap-4">
                  <AlertTriangle className="text-rose-600 shrink-0" />
                  <div>
                    <h4 className="text-sm font-black uppercase text-rose-700 tracking-tight">Fix Schema Cache Errors</h4>
                    <p className="text-xs text-rose-600/80 mt-1 leading-relaxed">If the app reports missing columns or tables, copy this script and run it in your Supabase SQL Editor. This script now includes a <b>DROP VIEW</b> fix to handle column rename conflicts.</p>
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
                      <pre className="text-[9px] font-mono text-emerald-400 leading-relaxed overflow-x-auto h-40 custom-scrollbar">
                          {repairSql}
                      </pre>
                    </div>
                </div>
             </div>

             <div className="space-y-4">
                <div className="bg-amber-50 dark:bg-amber-950/20 p-6 rounded-3xl border border-amber-100 dark:border-amber-900/50 flex items-start gap-4">
                  <Globe className="text-amber-600 shrink-0" />
                  <div>
                    <h4 className="text-sm font-black uppercase text-amber-700 tracking-tight">Fix "Failed to Fetch" (CORS)</h4>
                    <p className="text-xs text-amber-600/80 mt-1 leading-relaxed">If ingestion fails with "NETWORK_BLOCK", apply this <b>Debug Mode</b> snippet to your R2 storage node settings.</p>
                  </div>
                </div>
                <div className="bg-slate-900 rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden">
                    <div className="p-6 border-b border-white/5 flex items-center justify-between">
                      <h3 className="text-white font-black uppercase tracking-tight flex items-center gap-2 text-[10px]"><Box size={14}/> DEBUG CORS JSON</h3>
                      <button onClick={() => copyToClipboard(corsConfig, 'cors')} className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-[9px] font-black uppercase text-white transition-all">
                          {copiedId === 'cors' ? <Check size={12}/> : <Copy size={12}/>} Copy JSON
                      </button>
                    </div>
                    <div className="p-6 bg-black/40">
                      <pre className="text-[9px] font-mono text-amber-400 leading-relaxed overflow-x-auto h-40 custom-scrollbar">
                          {corsConfig}
                      </pre>
                    </div>
                </div>
             </div>
           </div>
        </div>
      )}

      {activeTab === 'schema' && (
        <div className="space-y-6">
           <div className="bg-slate-900 rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden">
              <div className="p-8 border-b border-white/5 flex items-center justify-between">
                 <h3 className="text-white font-black uppercase tracking-tight">Full Master Schema v92.3</h3>
                 <button onClick={() => copyToClipboard(masterSchemaSql, 'schema')} className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-black uppercase text-white transition-all">
                    {copiedId === 'schema' ? <Check size={12}/> : <Copy size={12}/>} Copy Master SQL
                 </button>
              </div>
              <div className="p-8 bg-black/40">
                 <pre className="text-[10px] font-mono text-emerald-400 leading-relaxed overflow-x-auto h-[500px] custom-scrollbar">
                    {masterSchemaSql}
                 </pre>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default BrainControl;