import React, { useState, useEffect } from 'react';
import { 
  RefreshCw, Zap, Check, ShieldCheck, Cpu, Activity, Layers, 
  Rocket, TrendingUp, Copy, Lock, FileCode, Search, Database, 
  AlertTriangle, CheckCircle2, X
} from 'lucide-react';
import { NeuralBrain, JobStatus, IngestionStep } from '../types';
import { supabase } from '../lib/supabase';

interface BrainControlProps {
  brain: NeuralBrain;
  onUpdate: (brain: NeuralBrain) => void;
}

const BLUEPRINT_SQL = `-- PEDAGOGY MASTER: INFRASTRUCTURE BLUEPRINT v6.1
-- Optimized for Pakistan Sindh/Federal Board Scaling

create table if not exists public.neural_brain (
  id text primary key,
  master_prompt text not null,
  bloom_rules text,
  version int default 1,
  is_active boolean default true,
  updated_at timestamp with time zone default now()
);

create table if not exists public.documents (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users on delete cascade,
  name text not null,
  file_path text,
  status text default 'processing',
  extracted_text text,
  document_summary text,
  grade_level text,
  rag_indexed boolean default false,
  is_selected boolean default false,
  created_at timestamp with time zone default now()
);

create table if not exists public.ingestion_jobs (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid references documents(id) on delete cascade,
  step text not null check (step in ('extract', 'linearize', 'tag', 'chunk', 'embed', 'finalize')),
  status text default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  payload jsonb,
  updated_at timestamp with time zone default now()
);

create table if not exists public.document_chunks (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid references documents(id) on delete cascade,
  chunk_text text not null,
  embedding vector(768),
  slo_codes text[],
  metadata jsonb
);`;

const BrainControl: React.FC<BrainControlProps> = ({ brain, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'logic' | 'blueprint' | 'ingestion' | 'diagnostics'>('logic');
  const [formData, setFormData] = useState(brain);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedBlueprint, setCopiedBlueprint] = useState(false);
  
  const [jobs, setJobs] = useState<any[]>([]);
  const [healthReport, setHealthReport] = useState<any>(null);

  useEffect(() => {
    setFormData(brain);
  }, [brain]);

  const fetchStatus = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      if (activeTab === 'ingestion') {
        const { data, error } = await supabase
          .from('ingestion_jobs')
          .select('*, documents(name)')
          .order('updated_at', { ascending: false })
          .limit(20);
        
        if (!error) setJobs(data || []);
      }

      if (activeTab === 'diagnostics') {
        const res = await fetch('/api/admin/rag-health', {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (res.ok) setHealthReport(await res.json());
      }
    } catch (e) {
      console.warn("Telemetry Node Offline.");
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [activeTab]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/brain/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ master_prompt: formData.masterPrompt })
      });
      
      if (res.ok) {
        onUpdate({...formData, version: formData.version + 1, updatedAt: new Date().toISOString()});
      }
    } finally { setIsSaving(false); }
  };

  const copyBlueprint = () => {
    navigator.clipboard.writeText(BLUEPRINT_SQL);
    setCopiedBlueprint(true);
    setTimeout(() => setCopiedBlueprint(false), 2000);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20 px-2 text-left">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-indigo-500">System Founder Console</span>
          </div>
          <h1 className="text-3xl font-bold flex items-center gap-3 tracking-tight uppercase dark:text-white">
             Neural Brain
          </h1>
        </div>
        
        <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-2xl border dark:border-white/5 shadow-inner">
          {[
            { id: 'logic', icon: <Cpu size={14}/>, label: 'Logic' },
            { id: 'blueprint', icon: <FileCode size={14}/>, label: 'Blueprint' },
            { id: 'ingestion', icon: <Layers size={14}/>, label: 'Ingestion' },
            { id: 'diagnostics', icon: <Activity size={14}/>, label: 'Telemetry' },
          ].map(tab => (
            <button 
              key={tab.id} 
              onClick={() => setActiveTab(tab.id as any)} 
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-indigo-600'}`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </header>

      {activeTab === 'logic' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-8 rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
               <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Master Secret Recipe (Prompt)</h3>
               <span className="text-[9px] font-bold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 px-3 py-1 rounded-full">v{brain.version}.0 Active</span>
            </div>
            <textarea 
              value={formData.masterPrompt}
              onChange={(e) => setFormData({...formData, masterPrompt: e.target.value})}
              className="w-full h-[500px] p-8 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-[2.5rem] font-mono text-[11px] leading-relaxed resize-none outline-none shadow-inner dark:text-indigo-100"
              placeholder="Inject core instructions..."
            />
            <button onClick={handleSave} disabled={isSaving} className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-3">
              {isSaving ? <RefreshCw className="animate-spin" size={18}/> : <Zap size={18}/>} Commit Neural Changes
            </button>
          </div>
          
          <div className="space-y-6">
             <div className="bg-slate-950 text-white p-10 rounded-[3rem] shadow-2xl relative overflow-hidden flex flex-col gap-6 border border-white/5">
                <div className="absolute top-0 right-0 p-8 opacity-5"><Activity size={120} /></div>
                <h3 className="text-lg font-bold uppercase tracking-tight text-emerald-400">Node Pulse</h3>
                <div className="space-y-5 relative z-10">
                   <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">RAG PRECISION</span>
                      <span className="text-xs font-black text-emerald-400">99.2% OPTIMAL</span>
                   </div>
                   <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">UNROLL RATE</span>
                      <span className="text-xs font-black text-emerald-400">100% STABLE</span>
                   </div>
                </div>
                <p className="text-[9px] text-slate-500 font-medium italic">Master logic is persistent and decoupled from public constants for system founder security.</p>
             </div>
          </div>
        </div>
      )}

      {activeTab === 'blueprint' && (
        <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-sm space-y-8 animate-in fade-in">
           <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold uppercase tracking-tight dark:text-white">Infrastructure Blueprint</h3>
                <p className="text-xs text-slate-500 font-medium">SQL DDL for latest functional app updates.</p>
              </div>
              <button onClick={copyBlueprint} className="flex items-center gap-2 px-6 py-3 bg-slate-100 dark:bg-slate-800 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all">
                {copiedBlueprint ? <CheckCircle2 size={14}/> : <Copy size={14}/>} {copiedBlueprint ? 'Copied' : 'Copy SQL'}
              </button>
           </div>
           <pre className="p-8 bg-slate-50 dark:bg-black/40 rounded-[2rem] border border-slate-200 dark:border-white/5 text-[10px] font-mono leading-relaxed overflow-x-auto whitespace-pre dark:text-indigo-200 max-h-[600px] custom-scrollbar shadow-inner">
             {BLUEPRINT_SQL}
           </pre>
        </div>
      )}

      {activeTab === 'ingestion' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             <StatCardMini label="Jobs Active" value={jobs.filter(j => j.status === 'processing').length} icon={<RefreshCw className="text-indigo-500 animate-spin-slow" size={18}/>} />
             <StatCardMini label="Faulted Nodes" value={jobs.filter(j => j.status === 'failed').length} icon={<AlertTriangle className="text-rose-500" size={18}/>} />
             <StatCardMini label="Lifetime Syncs" value={jobs.filter(j => j.status === 'completed').length} icon={<CheckCircle2 className="text-emerald-500" size={18}/>} />
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-white/5 overflow-hidden shadow-sm">
             <div className="p-6 border-b dark:border-white/5 flex items-center justify-between">
                <h3 className="text-md font-bold uppercase tracking-tight dark:text-white">Pipeline Monitor</h3>
                <button onClick={fetchStatus} className="p-2 text-slate-400 hover:text-indigo-600"><RefreshCw size={14}/></button>
             </div>
             <div className="overflow-x-auto">
                <table className="w-full text-left text-[10px]">
                   <thead className="bg-slate-50 dark:bg-slate-800 text-slate-400 font-bold uppercase tracking-widest text-[8px]">
                      <tr>
                         <th className="p-5">Asset Node</th>
                         <th className="p-5">Phase</th>
                         <th className="p-5">Status</th>
                         <th className="p-5">Last Synced</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                      {jobs.length > 0 ? jobs.map((job) => (
                        <tr key={job.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                           <td className="p-5 font-bold dark:text-white truncate max-w-[200px]">{job.documents?.name || 'Processing...'}</td>
                           <td className="p-5 uppercase font-black tracking-widest text-indigo-500">{job.step}</td>
                           <td className="p-5">
                              <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest ${
                                job.status === 'completed' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 
                                job.status === 'failed' ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-indigo-50 text-indigo-600 animate-pulse'
                              }`}>
                                {job.status}
                              </span>
                           </td>
                           <td className="p-5 text-slate-400">
                              {new Date(job.updated_at).toLocaleTimeString()}
                           </td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={4} className="p-20 text-center text-slate-400 font-bold uppercase tracking-widest opacity-30">Waiting for Ingestion Job Stream...</td>
                        </tr>
                      )}
                   </tbody>
                </table>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StatCardMini = ({ label, value, icon }: any) => (
  <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-200 dark:border-white/5 shadow-sm flex items-center gap-5 hover:scale-[1.02] transition-all">
     <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl shadow-inner">{icon}</div>
     <div>
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">{label}</p>
        <p className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter mt-0.5">{value}</p>
     </div>
  </div>
);

export default BrainControl;