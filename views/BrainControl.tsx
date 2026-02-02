// NEURAL BRAIN: INFRASTRUCTURE CONTROL HUB (v105.0)
import React, { useState } from 'react';
import { 
  RefreshCw, Zap, Check, Copy, ShieldCheck, Terminal, Cpu, Sparkles, Wrench, AlertTriangle, Database, Activity
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

  const repairSql = `-- REPAIR SCRIPT: Neural Ingestion Alignment v105.0 (SCALABLE ARCHITECTURE)
-- Target: Supabase / PostgreSQL

-- 1. SCHEMA INTEGRITY: Adaptive Memory Columns
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS teaching_style TEXT,
ADD COLUMN IF NOT EXISTS pedagogical_approach TEXT DEFAULT '5E Inquiry-Based',
ADD COLUMN IF NOT EXISTS edit_patterns JSONB DEFAULT '{"avgLengthChange": 0, "examplesCount": 0}',
ADD COLUMN IF NOT EXISTS success_rate FLOAT DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS generation_count INTEGER DEFAULT 0;

-- 2. DOCUMENT DNA METADATA
ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS curriculum_dna TEXT,
ADD COLUMN IF NOT EXISTS authority TEXT,
ADD COLUMN IF NOT EXISTS version_year TEXT DEFAULT '2024';

-- 3. PERFORMANCE INDEXES (Atomic SLO Optimization)
CREATE INDEX IF NOT EXISTS idx_doc_chunks_slo_gin ON public.document_chunks USING GIN (slo_codes);
CREATE INDEX IF NOT EXISTS idx_docs_user_selected ON public.documents (user_id, is_selected);

-- 4. MASTER HYBRID SEARCH RPC (v5 - Context-Aware)
-- Optimized for structural chunks and metadata filtering
CREATE OR REPLACE FUNCTION hybrid_search_chunks_v5(
  query_text TEXT,
  query_embedding vector(768),
  match_count INT,
  filter_document_ids UUID[] DEFAULT NULL,
  full_text_weight FLOAT DEFAULT 0.4,
  vector_weight FLOAT DEFAULT 0.6
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
    (COALESCE(vs.score, 0) * vector_weight + COALESCE(fs.score, 0) * full_text_weight) as combined_score
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
`;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await supabase.from('neural_brain').insert([{ 
        master_prompt: formData.masterPrompt, 
        version: formData.version + 1, 
        is_active: true 
      }]);
      onUpdate({...formData, version: formData.version + 1, updatedAt: new Date().toISOString()});
      alert("Neural logic committed to grid.");
    } catch (err: any) { 
      alert("Error updating logic."); 
    } finally { 
      setIsSaving(false); 
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24 px-2 text-left">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 text-slate-900 dark:text-white">
        <div className="space-y-1">
          <h1 className="text-3xl font-black flex items-center gap-3 tracking-tight uppercase">
            <ShieldCheck className="text-indigo-600" /> Brain Control
          </h1>
          <p className="text-slate-500 text-xs font-medium italic">Adaptive Synthesis Management • v105.0</p>
        </div>
        <div className="flex bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-inner">
          {[
            { id: 'logic', icon: <Cpu size={14}/>, label: 'Neural Logic' },
            { id: 'schema', icon: <Database size={14}/>, label: 'Data Plane' },
            { id: 'repair', icon: <Wrench size={14}/>, label: 'Grid Repair' }
          ].map(tab => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm' : 'text-slate-500'}`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {activeTab === 'logic' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-8 rounded-[3rem] border border-slate-200 dark:border-white/10 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2 dark:text-white"><Terminal size={18} className="text-indigo-500" /> Master Synthesis Logic</h2>
              <span className="px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full text-[10px] font-black uppercase tracking-widest">Active v{formData.version}</span>
            </div>
            <textarea 
              value={formData.masterPrompt}
              onChange={(e) => setFormData({...formData, masterPrompt: e.target.value})}
              className="w-full h-[500px] p-8 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-[2rem] font-mono text-[11px] leading-relaxed resize-none focus:ring-2 focus:ring-indigo-500 outline-none custom-scrollbar"
              placeholder="Inject core pedagogical rules here..."
            />
            <button 
              onClick={handleSave} 
              disabled={isSaving} 
              className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {isSaving ? <RefreshCw className="animate-spin" size={18}/> : <Zap size={18}/>} Commit Logic to Neural Grid
            </button>
          </div>
          
          <div className="space-y-6">
            <div className="bg-slate-900 text-white p-8 rounded-[3rem] shadow-2xl relative overflow-hidden flex flex-col gap-6">
               <div className="absolute top-0 right-0 p-8 opacity-5"><Activity size={150} /></div>
               <h3 className="text-xl font-black uppercase tracking-tight text-emerald-400 flex items-center gap-2"><Sparkles size={20}/> Adaptive Intelligence</h3>
               <p className="text-slate-400 text-xs leading-relaxed italic relative z-10">
                  The grid is currently using <b>Recursive Contextualization</b>. It automatically detects curriculum DNA (Sindh, Cambridge, etc.) and adapts terminology.
               </p>
               <div className="space-y-4 relative z-10">
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Context Caching</span>
                    <span className="text-[10px] font-black text-emerald-500 uppercase">Enabled</span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">DNA Adaptation</span>
                    <span className="text-[10px] font-black text-indigo-400 uppercase">Active</span>
                  </div>
               </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] border border-slate-100 dark:border-white/5 shadow-sm">
               <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Structural Chunking</h4>
               <p className="text-xs text-slate-500 leading-relaxed mb-6">Chunks are broken at logical curriculum boundaries (SLO anchors) rather than character counts, preserving 100% pedagogical integrity.</p>
               <div className="h-2 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 w-[94%]" />
               </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'repair' && (
        <div className="space-y-6">
           <div className="bg-emerald-50 dark:bg-emerald-950/20 p-8 rounded-[2.5rem] border border-emerald-100 dark:border-emerald-900/50 flex items-start gap-6">
             <ShieldCheck className="text-emerald-600 shrink-0" size={32} />
             <div>
               <h4 className="text-lg font-black uppercase text-emerald-700 tracking-tight">Scalable Data Plane Bootstrap</h4>
               <p className="text-sm text-emerald-600/80 mt-1 font-medium leading-relaxed">
                 Run this script to initialize adaptive memory columns, hybrid search v5, and curriculum DNA tracking. This is required for million-user scaling.
               </p>
             </div>
           </div>
           
           <div className="bg-slate-900 rounded-[3rem] border border-white/10 shadow-2xl overflow-hidden">
               <div className="p-8 border-b border-white/5 flex items-center justify-between bg-black/20">
                 <h3 className="text-white font-black uppercase tracking-tight flex items-center gap-2 text-xs"><Wrench size={16}/> Recovery & Evolution SQL</h3>
                 <button onClick={() => copyToClipboard(repairSql, 'repair')} className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-[10px] font-black uppercase text-white transition-all shadow-lg active:scale-95">
                     {copiedId === 'repair' ? <Check size={14}/> : <Copy size={14}/>} Copy Evolution SQL
                 </button>
               </div>
               <div className="p-8 bg-black/40">
                 <pre className="text-[10px] font-mono text-emerald-400/90 leading-relaxed overflow-x-auto h-96 custom-scrollbar">{repairSql}</pre>
               </div>
           </div>
        </div>
      )}

      {activeTab === 'schema' && (
        <div className="bg-white dark:bg-slate-900 p-20 rounded-[4rem] text-center border border-slate-100 dark:border-white/5 opacity-40">
           <Database size={64} className="mx-auto mb-6 text-slate-300" />
           <p className="text-xl font-black uppercase tracking-[0.2em] text-slate-400">Schema Explorer Offline</p>
           <p className="text-xs font-bold text-slate-500 mt-2">Connect to the Production Data Plane to view real-time node relationships.</p>
        </div>
      )}
    </div>
  );
};

export default BrainControl;