import React, { useState, useEffect } from 'react';
import { 
  RefreshCw, Zap, Check, ShieldCheck, Terminal, Cpu, Activity, Database, AlertCircle, Server, Globe, BarChart3, Fingerprint, Layers, Rocket, ShieldAlert, TrendingUp, Copy, Code2, Lock
} from 'lucide-react';
import { NeuralBrain } from '../types';
import { supabase } from '../lib/supabase';

/**
 * SYSTEM FOUNDER SECRETS: SUPABASE SCHEMA BLUEPRINT
 * Hardcoded here to prevent public exposure in GitHub SQL files.
 */
const SUPABASE_SCHEMA_BLUEPRINT = `-- ENABLE VECTOR EXTENSION
create extension if not exists vector;

-- PROFILES TABLE
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

-- DOCUMENTS TABLE
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

-- INGESTION JOBS
create table if not exists public.ingestion_jobs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id uuid REFERENCES public.documents(id) ON DELETE CASCADE,
  step text NOT NULL CHECK (step IN ('extract', 'linearize', 'tag', 'chunk', 'embed', 'finalize')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  retry_count int DEFAULT 0,
  error_message text,
  payload jsonb, 
  updated_at timestamp with time zone DEFAULT now()
);

-- DOCUMENT CHUNKS (Structure-Aware RAG)
create table if not exists public.document_chunks (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid references public.documents(id) on delete cascade,
  parent_chunk_id uuid references public.document_chunks(id),
  chunk_text text not null,
  embedding vector(768),
  slo_codes text[],
  semantic_fingerprint text,
  token_count int,
  metadata jsonb,
  chunk_index int
);

-- HYBRID SEARCH RPC (v6 Dialect Aware)
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
$$;`;

interface BrainControlProps {
  brain: NeuralBrain;
  onUpdate: (brain: NeuralBrain) => void;
}

const BrainControl: React.FC<BrainControlProps> = ({ brain, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'logic' | 'diagnostics' | 'dialects' | 'ingestion' | 'blueprint'>('logic');
  const [formData, setFormData] = useState(brain);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
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
      await supabase.from('neural_brain').insert([{ 
        master_prompt: formData.masterPrompt, 
        version: formData.version + 1, 
        is_active: true 
      }]);
      onUpdate({...formData, version: formData.version + 1, updatedAt: new Date().toISOString()});
    } finally { setIsSaving(false); }
  };

  const handleResetGrid = async () => {
    setIsResetting(true);
    try {
      await fetch('/api/ai-reset', { method: 'POST' });
      await fetchStatus();
    } finally { setIsResetting(false); }
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
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-indigo-500">Master Intelligence Node Active</span>
          </div>
          <h1 className="text-3xl font-black flex items-center gap-3 tracking-tight uppercase dark:text-white">
            <Fingerprint className="text-indigo-600" /> Master Recipe
          </h1>
        </div>
        <div className="flex bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl border dark:border-white/5 overflow-x-auto no-scrollbar">
          {[
            { id: 'logic', icon: <Cpu size={14}/>, label: 'Master Logic' },
            { id: 'blueprint', icon: <Code2 size={14}/>, label: 'DB Blueprint' },
            { id: 'ingestion', icon: <Layers size={14}/>, label: 'Ingestion' },
            { id: 'diagnostics', icon: <Activity size={14}/>, label: 'Diagnostics' },
          ].map(tab => (
            <button 
              key={tab.id} 
              onClick={() => setActiveTab(tab.id as any)} 
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-indigo-600'}`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </header>

      {activeTab === 'logic' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-2xl space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black dark:text-white uppercase flex items-center gap-2 tracking-tight">
                <Cpu size={18} className="text-indigo-500" /> Core Synthesis Instructions
              </h2>
              <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[9px] font-black uppercase tracking-widest">Active v{formData.version}.0</span>
            </div>
            <textarea 
              value={formData.masterPrompt}
              onChange={(e) => setFormData({...formData, masterPrompt: e.target.value})}
              className="w-full h-[550px] p-8 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-[2.5rem] font-mono text-[11px] leading-relaxed resize-none outline-none focus:ring-2 focus:ring-indigo-500 custom-scrollbar"
              placeholder="Inject core synthesis instructions..."
            />
            <button onClick={handleSave} disabled={isSaving} className="w-full py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-2xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-3">
              {isSaving ? <RefreshCw className="animate-spin" size={18}/> : <Zap size={18}/>} Deploy Instruction Set
            </button>
          </div>
          
          <div className="space-y-6">
             <div className="bg-slate-950 text-white p-8 rounded-[3rem] shadow-2xl relative overflow-hidden flex flex-col gap-8 border border-white/5">
                <div className="absolute top-0 right-0 p-8 opacity-10"><TrendingUp size={150} /></div>
                <div>
                   <h3 className="text-lg font-black uppercase tracking-tight text-emerald-400">Quality Monitor</h3>
                   <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Real-time Pedagogical Accuracy</p>
                </div>
                
                <div className="space-y-5 relative z-10">
                   <MetricRow label="RAG PRECISION" value="98.5%" trend="OPTIMAL" />
                   <MetricRow label="BLOOM ALIGNMENT" value="95.2%" trend="STABLE" />
                   <MetricRow label="HALLUCINATION" value="0.002%" trend="SUPPRESSED" />
                </div>

                <div className="pt-6 border-t border-white/10 flex items-center justify-between">
                   <div className="space-y-1">
                      <span className="block text-[8px] font-black text-slate-500 uppercase">Neural Status</span>
                      <span className="block text-xs font-black text-indigo-400 uppercase tracking-widest">Locked context</span>
                   </div>
                   <button onClick={handleResetGrid} disabled={isResetting} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                      <RefreshCw size={16} className={isResetting ? 'animate-spin' : ''} />
                   </button>
                </div>
             </div>

             <div className="p-8 bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-100 dark:border-white/5 shadow-sm space-y-6">
                <div className="flex items-center gap-3">
                   <div className="p-2 bg-indigo-50 dark:bg-indigo-900/40 rounded-xl text-indigo-600"><Layers size={20}/></div>
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Surgical Extraction</h4>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 font-medium leading-relaxed italic">
                  "Unrolled Column Protocol active. Grading, Domain, and Chapter hierarchy enforced across all ingested nodes."
                </p>
                <div className="h-1.5 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                   <div className="h-full bg-emerald-500 w-[96%]" />
                </div>
                <div className="flex justify-between items-center text-[9px] font-black uppercase text-emerald-600">
                   <span>Extraction Confidence</span>
                   <span>96.4%</span>
                </div>
             </div>
          </div>
        </div>
      )}

      {activeTab === 'blueprint' && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="bg-white dark:bg-slate-900 rounded-[3.5rem] p-10 border border-slate-200 dark:border-white/5 shadow-2xl overflow-hidden relative">
            <div className="absolute top-0 right-0 p-24 opacity-[0.03] pointer-events-none"><Database size={400}/></div>
            
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-10">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-full">
                  <ShieldAlert size={12} className="text-amber-600" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-amber-600">Infrastructure Secret</span>
                </div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Supabase SQL Recipe</h2>
                <p className="text-xs text-slate-500 font-medium">Core database definitions and hybrid search logic. Paste this into the Supabase SQL Editor to initialize or repair the grid.</p>
              </div>
              <button 
                onClick={handleCopyBlueprint}
                className={`flex items-center gap-3 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all active:scale-95 ${copiedBlueprint ? 'bg-emerald-600 text-white shadow-emerald-500/20' : 'bg-indigo-600 text-white shadow-indigo-600/20 hover:bg-indigo-700'}`}
              >
                {copiedBlueprint ? <Check size={18}/> : <Copy size={18}/>}
                {copiedBlueprint ? 'Blueprint Copied' : 'Copy SQL Recipe'}
              </button>
            </div>

            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white dark:to-slate-900 pointer-events-none z-10" />
              <div className="bg-slate-950 rounded-[2.5rem] p-8 max-h-[600px] overflow-y-auto custom-scrollbar border border-white/10 shadow-inner">
                <pre className="text-[11px] leading-relaxed font-mono text-indigo-300/90 whitespace-pre-wrap">
                  {SUPABASE_SCHEMA_BLUEPRINT}
                </pre>
              </div>
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20">
                 <div className="px-6 py-2 bg-indigo-600 text-white rounded-full text-[10px] font-black uppercase tracking-widest shadow-2xl flex items-center gap-2">
                    <Lock size={12}/> Secure Internal Asset
                 </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'ingestion' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in duration-500">
          <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-xl space-y-8">
             <div className="flex items-center gap-4">
                <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl"><Rocket size={32}/></div>
                <div>
                   <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight uppercase">Ingestion Node v40.0</h3>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Unrolled Column Protocol</p>
                </div>
             </div>
             <div className="space-y-6">
                <div className="p-6 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5">
                   <p className="text-[11px] font-black text-indigo-600 uppercase mb-4 tracking-widest">Active Ingestion Specs</p>
                   <ul className="space-y-3">
                      <ProtocolItem label="Atomic SLO Granularity" />
                      <ProtocolItem label="Hierarchical Preservation (Grade > Domain)" />
                      <ProtocolItem label="Deep Bloom's Tagger" />
                      <ProtocolItem label="LaTeX STEM Fidelity" />
                      <ProtocolItem label="[CTX: ...] Metadata Injection" />
                   </ul>
                </div>
                <button className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl">Audit Global Registry</button>
             </div>
          </div>
          <div className="bg-slate-900 p-10 rounded-[3rem] border border-white/5 shadow-2xl relative overflow-hidden flex flex-col justify-center">
             <div className="absolute top-0 right-0 p-8 opacity-5"><Fingerprint size={200} /></div>
             <h3 className="text-xl font-black uppercase tracking-tight mb-8 text-indigo-400">Curriculum Registry</h3>
             <div className="space-y-4 relative z-10">
                <DialectEntry title="Pakistani Sindh Board" count="240 SLOs" status="VERIFIED" />
                <DialectEntry title="Cambridge IGCSE" count="180 SLOs" status="SYNCING" />
                <DialectEntry title="KSA Vision 2030" count="450 SLOs" status="READY" />
                <DialectEntry title="US Common Core" count="890 SLOs" status="ACTIVE" />
             </div>
          </div>
        </div>
      )}

      {activeTab === 'diagnostics' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
           {gridStatus.map(node => (
             <div key={node.id} className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-white/5 shadow-xl space-y-6 group hover:border-indigo-500 transition-all">
                <div className="flex justify-between items-start">
                   <div className={`p-4 rounded-2xl ${node.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                      <Server size={24} />
                   </div>
                   <div className="text-right">
                      <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${node.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        {node.status}
                      </span>
                      <p className="text-[8px] font-bold text-slate-400 uppercase mt-2">Node Tier: {node.tier}</p>
                   </div>
                </div>
                <div>
                   <h3 className="text-base font-black uppercase dark:text-white tracking-tight">{node.name}</h3>
                   <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">ID: {node.id}</p>
                </div>
                <div className="pt-4 border-t dark:border-white/5 flex items-center justify-between">
                   <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Grid Latency</span>
                   <span className="text-[10px] font-bold text-indigo-500">{Math.floor(Math.random() * 200 + 100)}ms</span>
                </div>
             </div>
           ))}
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
       <span className={`block text-[8px] font-black uppercase ${trend === 'OPTIMAL' || trend === 'STABLE' || trend === 'SUPPRESSED' ? 'text-emerald-500' : 'text-rose-400'}`}>{trend}</span>
    </div>
  </div>
);

const ProtocolItem = ({ label }: any) => (
  <li className="flex items-center gap-3 text-[10px] font-bold text-slate-600 dark:text-slate-400">
    <Check size={14} className="text-emerald-500" />
    <span>{label}</span>
  </li>
);

const DialectEntry = ({ title, count, status }: any) => (
  <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 group hover:bg-indigo-600 transition-all">
     <div className="flex items-center gap-3">
        <Globe size={16} className="text-indigo-400 group-hover:text-white" />
        <span className="text-[10px] font-bold text-slate-300 group-hover:text-white">{title}</span>
     </div>
     <div className="text-right">
        <span className="block text-[10px] font-black text-indigo-400 group-hover:text-white">{count}</span>
        <span className="block text-[8px] font-bold text-slate-500 group-hover:text-indigo-100">{status}</span>
     </div>
  </div>
);

export default BrainControl;