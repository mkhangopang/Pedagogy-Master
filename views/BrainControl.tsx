// NEURAL BRAIN: INFRASTRUCTURE CONTROL HUB (v96.0)
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

  const repairSql = `-- REPAIR SCRIPT: Neural Ingestion Alignment v96.0 (AUDIT RECOVERY)
-- Target: Supabase / PostgreSQL

-- 1. Performance Indexes & Extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE INDEX IF NOT EXISTS idx_doc_chunks_document_id ON public.document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_chunks_slo_codes ON public.document_chunks USING GIN (slo_codes);
CREATE INDEX IF NOT EXISTS idx_doc_chunks_fts ON public.document_chunks USING GIN (to_tsvector('english', chunk_text));

-- 2. MASTER HYBRID SEARCH RPC (v4)
CREATE OR REPLACE FUNCTION hybrid_search_chunks_v4(
  query_text TEXT,
  query_embedding vector(768),
  match_count INT,
  filter_document_ids UUID[] DEFAULT NULL,
  full_text_weight FLOAT DEFAULT 0.5,
  vector_weight FLOAT DEFAULT 0.5
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
  WITH vector_search AS (
    SELECT 
      dc.id,
      (1 - (dc.embedding <=> query_embedding)) as score
    FROM public.document_chunks dc
    WHERE (filter_document_ids IS NULL OR dc.document_id = ANY(filter_document_ids))
  ),
  fts_search AS (
    SELECT 
      dc.id,
      ts_rank_cd(to_tsvector('english', dc.chunk_text), plainto_tsquery('english', query_text)) as score
    FROM public.document_chunks dc
    WHERE (filter_document_ids IS NULL OR dc.document_id = ANY(filter_document_ids))
      AND to_tsvector('english', dc.chunk_text) @@ plainto_tsquery('english', query_text)
  )
  SELECT
    dc.id,
    dc.document_id,
    dc.chunk_text,
    dc.slo_codes,
    dc.metadata,
    COALESCE(vs.score, 0) * vector_weight + COALESCE(fs.score, 0) * full_text_weight as combined_score
  FROM public.document_chunks dc
  LEFT JOIN vector_search vs ON dc.id = vs.id
  LEFT JOIN fts_search fs ON dc.id = fs.id
  WHERE 
    (vs.id IS NOT NULL OR fs.id IS NOT NULL)
    AND (filter_document_ids IS NULL OR dc.document_id = ANY(filter_document_ids))
  ORDER BY combined_score DESC
  LIMIT match_count;
END;
$$;

-- 3. AUDIT RECOVERY: Reset Stuck & Missing Indexes
-- FIX: Documents stuck in processing (> 1 hour) are marked as failed for re-upload
UPDATE public.documents 
SET status = 'failed', 
    error_message = 'Node timeout: Reset during system audit.'
WHERE status = 'processing' 
  AND created_at < NOW() - INTERVAL '1 hour';

-- FIX: Sync rag_indexed flag for ready documents that have chunks
UPDATE public.documents d
SET rag_indexed = true
FROM (
  SELECT DISTINCT document_id FROM public.document_chunks
) dc
WHERE d.id = dc.document_id AND d.status = 'ready' AND d.rag_indexed = false;

-- 4. Ensure Integrity
ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS document_summary TEXT,
ADD COLUMN IF NOT EXISTS rag_indexed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_selected BOOLEAN DEFAULT false;
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
          <p className="text-slate-500 text-xs font-medium italic">Audit Recovery Hub v96.0 Operational</p>
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
             <h3 className="text-xl font-bold mb-4 text-emerald-400 flex items-center gap-2"><Sparkles size={20}/> Neural Alignment</h3>
             <p className="text-slate-400 text-xs leading-relaxed mb-6 italic">
                Node v96.0 focuses on Context Density. Run the <b>REPAIR</b> script to fix documents identified as "stuck" or "unindexed" in the latest RAG Audit.
             </p>
          </div>
        </div>
      )}

      {activeTab === 'repair' && (
        <div className="space-y-4">
           <div className="bg-emerald-50 dark:bg-emerald-950/20 p-6 rounded-3xl border border-emerald-100 dark:border-emerald-900/50 flex items-start gap-4">
             <ShieldCheck className="text-emerald-600 shrink-0" />
             <div>
               <h4 className="text-sm font-black uppercase text-emerald-700 tracking-tight">Audit Recovery Node</h4>
               <p className="text-xs text-emerald-600/80 mt-1">This script forces unindexed "ready" documents into the vector search pool and clears stuck processing tasks.</p>
             </div>
           </div>
           <div className="bg-slate-900 rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden">
               <div className="p-6 border-b border-white/5 flex items-center justify-between">
                 <h3 className="text-white font-black uppercase tracking-tight flex items-center gap-2 text-[10px]"><Wrench size={14}/> Recovery SQL</h3>
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
    </div>
  );
};

export default BrainControl;