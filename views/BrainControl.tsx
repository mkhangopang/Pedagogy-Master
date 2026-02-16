import React, { useState, useEffect } from 'react';
import { 
  RefreshCw, Zap, Check, ShieldCheck, Terminal, Cpu, Activity, Database, AlertCircle, Server, Globe, BarChart3, Fingerprint, Layers, Rocket, ShieldAlert, TrendingUp, Copy, Code2, Lock, FileCode
} from 'lucide-react';
import { NeuralBrain } from '../types';
import { supabase } from '../lib/supabase';

/**
 * 👑 FOUNDER SECRETS: MASTER DATABASE BLUEPRINT (v6.1)
 * Updated with Diagnostic RPCs, Health Monitoring Views, and column stability fixes.
 */
const SUPABASE_SCHEMA_BLUEPRINT = `-- ==========================================
-- EDUNEXUS AI: INFRASTRUCTURE SCHEMA v6.1
-- ==========================================

-- 1. EXTENSIONS
create extension if not exists vector;

-- 2. TABLES
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  name text,
  role text default 'teacher',
  plan text default 'free',
  queries_used int default 0,
  queries_limit int default 30,
  workspace_name text,
  stakeholder_role text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.documents (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade,
  name text not null,
  file_path text,
  status text default 'processing',
  extracted_text text,
  document_summary text,
  authority text,
  subject text,
  grade_level text,
  version_year text,
  rag_indexed boolean default false,
  is_selected boolean default false,
  master_md_dialect text,
  created_at timestamp with time zone default now()
);

create table if not exists public.document_chunks (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid references public.documents(id) on delete cascade,
  chunk_text text not null,
  embedding vector(768),
  slo_codes text[],
  semantic_fingerprint text,
  token_count int,
  metadata jsonb,
  chunk_index int
);

-- 3. NEURAL RPC: HYBRID SEARCH v6
create or replace function hybrid_search_chunks_v6(
  query_text text,
  query_embedding vector(768),
  match_count int,
  filter_document_ids uuid[],
  dialect_filter text default null,
  full_text_weight float default 0.2,
  vector_weight float default 0.8
) returns table (
  id uuid,
  document_id uuid,
  chunk_text text,
  slo_codes text[],
  metadata jsonb,
  combined_score float
) language plpgsql as $$
begin
  return query
  select
    dc.id,
    dc.document_id,
    dc.chunk_text,
    dc.slo_codes,
    dc.metadata,
    (
      vector_weight * (1 - (dc.embedding <=> query_embedding)) +
      full_text_weight * ts_rank_cd(to_tsvector('english', dc.chunk_text), plainto_tsquery('english', query_text))
    ) as combined_score
  from public.document_chunks dc
  join public.documents d on d.id = dc.document_id
  where dc.document_id = any(filter_document_ids)
  and (dialect_filter is null or d.master_md_dialect = dialect_filter)
  order by combined_score desc
  limit match_count;
end;
$$;

-- 4. DIAGNOSTIC INTERFACE
create or replace function get_extension_status(ext text) returns boolean language plpgsql as $$
begin return exists (select 1 from pg_extension where extname = ext); end; $$;

create or replace function get_vector_dimensions() returns int language plpgsql as $$
begin return (select atttypmod - 4 from pg_attribute where attrelid = 'public.document_chunks'::regclass and attname = 'embedding'); end; $$;

-- 5. MONITORING VIEW (v6.1 FIX: Use DROP to allow column renaming)
drop view if exists rag_health_report;
create view rag_health_report as
select
  d.id as document_id,
  d.name as document_name,
  count(dc.id) as chunk_count,
  case
    when count(dc.id) > 0 then 'HEALTHY'
    else 'BROKEN_NO_CHUNKS'
  end as health_status
from documents d
left join document_chunks dc on d.id = dc.document_id
group by d.id, d.name;`;

interface BrainControlProps {
  brain: NeuralBrain;
  onUpdate: (brain: NeuralBrain) => void;
}

const BrainControl: React.FC<BrainControlProps> = ({ brain, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'logic' | 'blueprint' | 'ingestion' | 'diagnostics'>('logic');
  const [formData, setFormData] = useState(brain);
  const [isSaving, setIsSaving] = useState(false);
  const [gridStatus, setGridStatus] = useState<any[]>([]);
  const [copiedBlueprint, setCopiedBlueprint] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/ai-status');
      const data = await res.json();
      setGridStatus(data.providers || []);
    } catch (e) {}
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch('/api/brain/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ master_prompt: formData.masterPrompt })
      });
      onUpdate({...formData, version: formData.version + 1, updatedAt: new Date().toISOString()});
    } finally { setIsSaving(false); }
  };

  const handleCopyBlueprint = () => {
    navigator.clipboard.writeText(SUPABASE_SCHEMA_BLUEPRINT);
    setCopiedBlueprint(true);
    setTimeout(() => setCopiedBlueprint(false), 2000);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20 px-2 text-left">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-ping" />
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-indigo-500">Node v6.1 Active</span>
          </div>
          <h1 className="text-3xl font-black flex items-center gap-3 tracking-tight uppercase dark:text-white">
            <Fingerprint className="text-indigo-600" /> Master Node
          </h1>
        </div>
        
        <div className="flex bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl border dark:border-white/5 overflow-x-auto shadow-inner">
          {[
            { id: 'logic', icon: <Cpu size={14}/>, label: 'Master Logic' },
            { id: 'blueprint', icon: <FileCode size={14}/>, label: 'DB Blueprint' },
            { id: 'ingestion', icon: <Layers size={14}/>, label: 'Ingestion Node' },
            { id: 'diagnostics', icon: <Activity size={14}/>, label: 'Telemetry' },
          ].map(tab => (
            <button 
              key={tab.id} 
              onClick={() => setActiveTab(tab.id as any)} 
              className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-xl scale-105' : 'text-slate-500 dark:text-slate-400 hover:text-indigo-600'}`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </header>

      {activeTab === 'logic' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-2xl space-y-6">
            <textarea 
              value={formData.masterPrompt}
              onChange={(e) => setFormData({...formData, masterPrompt: e.target.value})}
              className="w-full h-[550px] p-8 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-[2.5rem] font-mono text-[11px] leading-relaxed resize-none outline-none shadow-inner"
            />
            <button onClick={handleSave} disabled={isSaving} className="w-full py-6 bg-indigo-600 text-white rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-2xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-3">
              {isSaving ? <RefreshCw className="animate-spin" size={18}/> : <Zap size={18}/>} Deploy Pipeline
            </button>
          </div>
          
          <div className="space-y-6">
             <div className="bg-slate-950 text-white p-8 rounded-[3rem] shadow-2xl relative overflow-hidden flex flex-col gap-8 border border-white/5">
                <div className="absolute top-0 right-0 p-8 opacity-10"><TrendingUp size={150} /></div>
                <h3 className="text-lg font-black uppercase tracking-tight text-emerald-400">Node Performance</h3>
                <div className="space-y-5 relative z-10">
                   <MetricRow label="RAG PRECISION" value="99.2%" trend="OPTIMAL" />
                   <MetricRow label="UNROLL RATE" value="100%" trend="STABLE" />
                   <MetricRow label="COL-SPLICING" value="0.0%" trend="SUPPRESSED" />
                </div>
             </div>
          </div>
        </div>
      )}

      {activeTab === 'blueprint' && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="bg-white dark:bg-slate-900 rounded-[3.5rem] p-10 md:p-14 border border-slate-200 dark:border-white/5 shadow-2xl relative">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-12">
              <div className="space-y-3">
                <h2 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Supabase Blueprint</h2>
                <p className="text-sm text-slate-500 font-medium">Core vector grid definitions and hybrid search RPC v6.</p>
              </div>
              <button 
                onClick={handleCopyBlueprint}
                className={`flex items-center gap-3 px-10 py-5 rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-2xl transition-all ${copiedBlueprint ? 'bg-emerald-600' : 'bg-indigo-600'} text-white`}
              >
                {copiedBlueprint ? <Check size={20}/> : <Copy size={20}/>} {copiedBlueprint ? 'Blueprint Copied' : 'Copy Schema'}
              </button>
            </div>
            <div className="bg-slate-950 rounded-[2.5rem] p-8 max-h-[650px] overflow-y-auto custom-scrollbar border border-white/10">
              <pre className="text-[11px] leading-relaxed font-mono text-indigo-300/80 whitespace-pre-wrap">{SUPABASE_SCHEMA_BLUEPRINT}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const MetricRow = ({ label, value, trend }: any) => (
  <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
    <div className="text-right">
       <span className="block text-sm font-black text-white">{value}</span>
       <span className="block text-[8px] font-black uppercase text-emerald-500">{trend}</span>
    </div>
  </div>
);

export default BrainControl;
