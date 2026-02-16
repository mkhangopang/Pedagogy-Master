import React, { useState, useEffect } from 'react';
import { 
  RefreshCw, Zap, Check, Terminal, Cpu, Activity, Database, TrendingUp, Copy, Code2, FileCode, HardDrive,
  CheckCircle2, AlertTriangle, RefreshCcw, Layers, Fingerprint
} from 'lucide-react';
import { NeuralBrain } from '../types';
import { supabase } from '../lib/supabase';

const AUTHORITATIVE_SQL_BLUEPRINT = `-- ==========================================
-- EDUNEXUS AI: AUTHORITATIVE SCHEMA v7.5
-- FIX: Added IF NOT EXISTS to prevent migration collisions
-- ==========================================
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. IDENTITY GRID
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  name text,
  role text default 'teacher', -- teacher, enterprise_admin, app_admin
  plan text default 'free',
  queries_used int default 0,
  queries_limit int default 30,
  workspace_name text,
  stakeholder_role text, -- auditor_govt, observer_ngo, admin_inst
  generation_count int default 0,
  success_rate float default 0.0,
  created_at timestamp with time zone default now()
);

-- 2. ASSET VAULT
CREATE TABLE IF NOT EXISTS public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  name text not null,
  file_path text,
  status text default 'processing', -- draft, processing, indexing, ready, failed
  extracted_text text, -- Stores linearized Master Markdown
  subject text,
  grade_level text,
  authority text,
  rag_indexed boolean default false,
  is_selected boolean default false,
  is_approved boolean default false,
  version int default 1,
  created_at timestamp with time zone default now()
);

-- 3. NEURAL NODES (VECTOR STORE)
CREATE TABLE IF NOT EXISTS public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.documents(id) on delete cascade,
  chunk_text text not null,
  embedding vector(768),
  slo_codes text[], -- Array of normalized SLO tags
  semantic_fingerprint text unique,
  token_count int,
  chunk_index int,
  metadata jsonb
);

-- 4. SURGICAL SLO DATABASE
CREATE TABLE IF NOT EXISTS public.slo_database (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.documents(id) on delete cascade,
  slo_code text not null,
  slo_full_text text not null,
  bloom_level text,
  created_at timestamp with time zone default now()
);

-- 5. ORCHESTRATION TELEMETRY
CREATE TABLE IF NOT EXISTS public.ai_model_usage (
  id uuid primary key default gen_random_uuid(),
  model_name text not null,
  task_type text not null, -- pdf_parse, code_gen, rag_query, etc.
  tokens_used int not null,
  success boolean default true,
  error_message text,
  execution_time_ms int,
  timestamp timestamptz default now()
);

-- 6. INGESTION PIPELINE STATE
CREATE TABLE IF NOT EXISTS public.ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.documents(id) on delete cascade,
  step text, -- extract, linearize, embed, finalize
  status text, -- queued, processing, completed, failed
  retry_count int default 0,
  error_message text,
  payload jsonb,
  updated_at timestamp with time zone default now()
);

-- 7. NEURAL BRAIN (MASTER PROMPT AUTHORITY)
CREATE TABLE IF NOT EXISTS public.neural_brain (
  id text primary key,
  master_prompt text,
  is_active boolean default true,
  updated_at timestamp with time zone default now()
);`;

const BrainControl: React.FC<{ brain: NeuralBrain; onUpdate: (b: NeuralBrain) => void }> = ({ brain, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'logic' | 'blueprint' | 'vault' | 'telemetry'>('logic');
  const [formData, setFormData] = useState(brain);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedBlueprint, setCopiedBlueprint] = useState(false);
  const [modelStats, setModelStats] = useState<any[]>([]);
  const [ragHealth, setRagHealth] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchStats = async () => {
    setIsRefreshing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { 'Authorization': `Bearer ${session?.access_token}` };
      
      const [statsRes, healthRes] = await Promise.all([
        fetch('/api/admin/model-stats', { headers }),
        fetch('/api/admin/rag-health', { headers })
      ]);
      
      if (statsRes.ok) setModelStats(await statsRes.json());
      if (healthRes.ok) setRagHealth(await healthRes.json());
    } finally { setIsRefreshing(false); }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/brain/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ master_prompt: formData.masterPrompt })
      });
      if (res.ok) onUpdate({...formData, version: (formData.version || 0) + 1, updatedAt: new Date().toISOString()});
    } finally { setIsSaving(false); }
  };

  const copyBlueprint = () => {
    navigator.clipboard.writeText(AUTHORITATIVE_SQL_BLUEPRINT);
    setCopiedBlueprint(true);
    setTimeout(() => setCopiedBlueprint(false), 2000);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20 px-2 text-left">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-ping" />
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-indigo-500">Infrastructure Authority v7.5</span>
          </div>
          <h1 className="text-3xl font-black flex items-center gap-3 tracking-tight uppercase dark:text-white">
            <Fingerprint className="text-indigo-600" /> Neural Hub
          </h1>
        </div>
        
        <div className="flex bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl border dark:border-white/5 overflow-x-auto shadow-inner no-print">
          {[
            { id: 'logic', icon: <Cpu size={14}/>, label: 'Master Logic' },
            { id: 'blueprint', icon: <FileCode size={14}/>, label: 'DB Blueprint' },
            { id: 'vault', icon: <HardDrive size={14}/>, label: 'Vault Health' },
            { id: 'telemetry', icon: <Activity size={14}/>, label: 'Telemetry' },
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
            <div className="flex items-center justify-between">
               <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white flex items-center gap-2"><Zap size={18} className="text-indigo-600"/> Master System Prompt</h3>
               <span className="text-[9px] font-bold text-slate-400 uppercase">Version {formData.version || 1}.0</span>
            </div>
            <textarea 
              value={formData.masterPrompt}
              onChange={(e) => setFormData({...formData, masterPrompt: e.target.value})}
              className="w-full h-[500px] p-8 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-[2.5rem] font-mono text-[11px] leading-relaxed resize-none outline-none shadow-inner dark:text-indigo-200"
            />
            <button onClick={handleSave} disabled={isSaving} className="w-full py-6 bg-indigo-600 text-white rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-2xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-3">
              {isSaving ? <RefreshCw className="animate-spin" size={18}/> : <Zap size={18}/>} Commit Neural Changes
            </button>
          </div>
          
          <div className="space-y-6">
             <div className="bg-slate-950 text-white p-8 rounded-[3rem] shadow-2xl relative overflow-hidden flex flex-col gap-8 border border-white/5">
                <div className="absolute top-0 right-0 p-8 opacity-10"><TrendingUp size={150} /></div>
                <h3 className="text-lg font-black uppercase tracking-tight text-emerald-400">Model Orchestration</h3>
                <div className="space-y-5 relative z-10">
                   <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Active Multi-Model Grid</p>
                      <div className="flex flex-wrap gap-2">
                        {['Gemini 3', 'Grok', 'DeepSeek', 'Cerebras', 'SambaNova'].map(m => (
                          <span key={m} className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded text-[8px] font-black uppercase">{m}</span>
                        ))}
                      </div>
                   </div>
                   <MetricRow label="VECTOR DIM" value={ragHealth?.actualDimensions || "768"} trend="STABLE" />
                   <MetricRow label="HEALTHY NODES" value={ragHealth?.summary?.healthy || 0} trend="OPTIMAL" />
                </div>
             </div>
          </div>
        </div>
      )}

      {activeTab === 'blueprint' && (
        <div className="animate-in slide-in-from-bottom-2 space-y-6">
          <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-2xl">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-50 dark:bg-white/5 text-indigo-600 rounded-2xl"><Code2 size={24}/></div>
                <div>
                  <h2 className="text-xl font-black dark:text-white uppercase tracking-tight">Supabase Data Grid</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Authoritative SQL Blueprint v7.5</p>
                </div>
              </div>
              <button 
                onClick={copyBlueprint}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${copiedBlueprint ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-500 hover:text-indigo-600'}`}
              >
                {copiedBlueprint ? <Check size={14}/> : <Copy size={14}/>} {copiedBlueprint ? 'Copied to Buffer' : 'Copy SQL Schema'}
              </button>
            </div>
            <div className="relative group">
              <pre className="p-8 bg-slate-950 text-indigo-300 font-mono text-[10px] leading-relaxed rounded-[2rem] overflow-x-auto max-h-[600px] custom-scrollbar border border-white/5">
                {AUTHORITATIVE_SQL_BLUEPRINT}
              </pre>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'vault' && (
        <div className="space-y-6 animate-in fade-in duration-500">
           <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <HealthBox label="Ready" value={ragHealth?.summary?.healthy || 0} color="text-emerald-500" icon={<CheckCircle2 size={16}/>} />
              <HealthBox label="Sync Needed" value={ragHealth?.summary?.broken || 0} color="text-amber-500" icon={<AlertTriangle size={16}/>} />
              <HealthBox label="Orphans" value={ragHealth?.summary?.orphanedChunks || 0} color="text-rose-500" icon={<Database size={16}/>} />
           </div>
           <div className="bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-sm overflow-hidden">
              <table className="w-full text-left text-xs">
                 <thead className="bg-slate-50 dark:bg-slate-800 text-slate-400 font-black uppercase tracking-widest text-[9px]">
                    <tr><th className="p-6">Document Node</th><th className="p-6">Vectors</th><th className="p-6">Health</th></tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {ragHealth?.report?.map((r: any) => (
                      <tr key={r.document_id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                        <td className="p-6 font-bold dark:text-white uppercase tracking-tight">{r.document_name}</td>
                        <td className="p-6 font-mono text-indigo-500">{r.chunk_count}</td>
                        <td className="p-6"><span className={`px-2 py-1 rounded text-[9px] font-black uppercase ${r.health_status === 'HEALTHY' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{r.health_status}</span></td>
                      </tr>
                    ))}
                 </tbody>
              </table>
           </div>
        </div>
      )}

      {activeTab === 'telemetry' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in zoom-in-95">
          {modelStats.map((m: any) => {
            const usagePercent = Math.min(100, (m.total_tokens / 50000) * 100);
            return (
              <div key={m.model_name} className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-white/5 shadow-sm space-y-6">
                <div className="flex justify-between items-start">
                  <div className="p-3 bg-indigo-50 dark:bg-white/5 text-indigo-600 rounded-xl"><Layers size={20}/></div>
                  <span className={`text-[8px] font-black uppercase px-2 py-1 rounded ${usagePercent > 80 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                    {usagePercent > 80 ? 'Threshold Alert' : 'Healthy Node'}
                  </span>
                </div>
                <div>
                   <h4 className="text-xl font-black dark:text-white uppercase tracking-tight">{m.model_name}</h4>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Provider Telemetry</p>
                </div>
                <div className="space-y-2">
                   <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase">
                      <span>Daily Load</span>
                      <span>{Math.round(usagePercent)}%</span>
                   </div>
                   <div className="h-2 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                      <div className={`h-full transition-all duration-1000 ${usagePercent > 80 ? 'bg-rose-500' : usagePercent > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${usagePercent}%` }} />
                   </div>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-50 dark:border-white/5">
                   <div><p className="text-[8px] font-black text-slate-400 uppercase">Avg Latency</p><p className="text-sm font-black dark:text-white">{Math.round(m.avg_execution_time)}ms</p></div>
                   <div><p className="text-[8px] font-black text-slate-400 uppercase">Success Rate</p><p className="text-sm font-black text-emerald-500">{m.success_rate}%</p></div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const HealthBox = ({ label, value, color, icon }: any) => (
  <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-100 dark:border-white/5 flex items-center justify-between shadow-sm">
     <div><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p><p className={`text-2xl font-black ${color}`}>{value}</p></div>
     <div className={`p-3 bg-slate-50 dark:bg-white/5 rounded-xl ${color}`}>{icon}</div>
  </div>
);

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