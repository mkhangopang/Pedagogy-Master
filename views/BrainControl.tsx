// NEURAL BRAIN: INFRASTRUCTURE CONTROL HUB (v92.0)
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

  const repairSql = `-- REPAIR SCRIPT: Run this in Supabase SQL Editor to fix missing columns
ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS document_summary TEXT,
ADD COLUMN IF NOT EXISTS difficulty_level TEXT,
ADD COLUMN IF NOT EXISTS rag_indexed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS extracted_text TEXT,
ADD COLUMN IF NOT EXISTS is_selected BOOLEAN DEFAULT false;

-- Ensure Vector sync is possible
CREATE EXTENSION IF NOT EXISTS vector;
`;

  const corsConfig = `[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]`;

  const masterSchemaSql = `-- EDUNEXUS AI: MASTER SCHEMA v92.0
-- TARGET: Supabase + PGVector

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. NEURAL VAULT
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
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. VECTOR CLUSTERS
CREATE TABLE IF NOT EXISTS public.document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    chunk_text TEXT NOT NULL,
    embedding vector(768),
    slo_codes TEXT[],
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. INDICES
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON public.document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 5. HYBRID SEARCH FUNCTION
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
          <p className="text-slate-500 text-xs font-medium italic">V92.0 RAG Optimized</p>
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
                Your neural infrastructure requires specific columns for high-fidelity extraction. Use the <b>REPAIR</b> tab if you see "Column not found" or "Failed to fetch" errors in the ingestion flow.
             </p>
          </div>
        </div>
      )}

      {activeTab === 'repair' && (
        <div className="space-y-8">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
             {/* SQL FIX SECTION */}
             <div className="space-y-4">
                <div className="bg-rose-50 dark:bg-rose-950/20 p-6 rounded-3xl border border-rose-100 dark:border-rose-900/50 flex items-start gap-4">
                  <AlertTriangle className="text-rose-600 shrink-0" />
                  <div>
                    <h4 className="text-sm font-black uppercase text-rose-700 tracking-tight">Fix Schema Cache Errors</h4>
                    <p className="text-xs text-rose-600/80 mt-1 leading-relaxed">If the app reports missing columns like <b>document_summary</b>, copy this script and run it in your Supabase SQL Editor.</p>
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

             {/* CORS FIX SECTION */}
             <div className="space-y-4">
                <div className="bg-amber-50 dark:bg-amber-950/20 p-6 rounded-3xl border border-amber-100 dark:border-amber-900/50 flex items-start gap-4">
                  <Globe className="text-amber-600 shrink-0" />
                  <div>
                    <h4 className="text-sm font-black uppercase text-amber-700 tracking-tight">Fix "Failed to Fetch" Errors</h4>
                    <p className="text-xs text-amber-600/80 mt-1 leading-relaxed">If ingestion fails immediately, your Cloudflare R2 bucket needs a CORS policy to allow browser uploads.</p>
                  </div>
                </div>
                <div className="bg-slate-900 rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden">
                    <div className="p-6 border-b border-white/5 flex items-center justify-between">
                      {/* Fix: Added Box to lucide-react imports to resolve 'Cannot find name Box' error */}
                      <h3 className="text-white font-black uppercase tracking-tight flex items-center gap-2 text-[10px]"><Box size={14}/> R2 CORS JSON</h3>
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
           
           <div className="p-6 bg-slate-100 dark:bg-white/5 rounded-3xl text-center">
             <p className="text-xs text-slate-500 font-medium italic">Refer to Cloudflare Dashboard &gt; R2 &gt; [Bucket Name] &gt; Settings &gt; CORS Policy to apply the JSON snippet.</p>
           </div>
        </div>
      )}

      {activeTab === 'schema' && (
        <div className="space-y-6">
           <div className="bg-slate-900 rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden">
              <div className="p-8 border-b border-white/5 flex items-center justify-between">
                 <h3 className="text-white font-black uppercase tracking-tight">Master Schema v92.0</h3>
                 <button onClick={() => copyToClipboard(masterSchemaSql, 'schema')} className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-black uppercase text-white transition-all">
                    {copiedId === 'schema' ? <Check size={12}/> : <Copy size={12}/>} Copy Master SQL
                 </button>
              </div>
              <div className="p-8 bg-black/40">
                 <pre className="text-[10px] font-mono text-emerald-400 leading-relaxed overflow-x-auto">
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