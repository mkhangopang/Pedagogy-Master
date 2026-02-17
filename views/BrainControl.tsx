import React, { useState, useEffect } from 'react';
import { 
  // Add comment above each fix
  // Fix: Added missing AlertTriangle import to resolve "Cannot find name 'AlertTriangle'" errors
  RefreshCw, Zap, Check, ShieldCheck, Terminal, Cpu, Activity, Database, AlertCircle, AlertTriangle, Server, Globe, BarChart3, Fingerprint, Layers, Rocket, ShieldAlert, TrendingUp, Copy, Code2, Lock, FileCode, Search, Trash2, Clock, CheckCircle2, XCircle
} from 'lucide-react';
import { NeuralBrain, JobStatus, IngestionStep } from '../types';
import { supabase } from '../lib/supabase';

/**
 * 👑 FOUNDER SECRETS: MASTER DATABASE BLUEPRINT (v6.1)
 */
const SUPABASE_SCHEMA_BLUEPRINT = `-- ==========================================
-- EDUNEXUS AI: INFRASTRUCTURE SCHEMA v6.1
-- ==========================================
-- 1. EXTENSIONS
create extension if not exists vector;

-- 2. TABLES
create table if not exists public.profiles (...);
create table if not exists public.documents (...);
create table if not exists public.document_chunks (...);

-- 3. NEURAL RPC: HYBRID SEARCH v6
create or replace function hybrid_search_chunks_v6(...);

-- 4. DIAGNOSTIC INTERFACE
create or replace function get_extension_status(...);

-- 5. MONITORING VIEW
drop view if exists rag_health_report;
create view rag_health_report as ...;`;

interface BrainControlProps {
  brain: NeuralBrain;
  onUpdate: (brain: NeuralBrain) => void;
}

const BrainControl: React.FC<BrainControlProps> = ({ brain, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'logic' | 'blueprint' | 'ingestion' | 'diagnostics'>('logic');
  const [formData, setFormData] = useState(brain);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedBlueprint, setCopiedBlueprint] = useState(false);
  
  // State for new implemented tabs
  const [jobs, setJobs] = useState<any[]>([]);
  const [healthReport, setHealthReport] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchStatus = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      if (activeTab === 'ingestion') {
        const { data } = await supabase.from('ingestion_jobs').select('*, documents(name)').order('updated_at', { ascending: false }).limit(20);
        setJobs(data || []);
      }

      if (activeTab === 'diagnostics') {
        const res = await fetch('/api/admin/rag-health', {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        const data = await res.json();
        setHealthReport(data);
      }
    } catch (e) {}
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

  const handleManualRealign = async () => {
    setIsRefreshing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch('/api/ai-reset', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` }
      });
      fetchStatus();
    } finally { setIsRefreshing(false); }
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
              className="w-full h-[550px] p-8 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-[2.5rem] font-mono text-[11px] leading-relaxed resize-none outline-none shadow-inner dark:text-indigo-100"
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
                <button onClick={handleManualRealign} disabled={isRefreshing} className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl text-[9px] font-black uppercase tracking-[0.2em] hover:bg-white/10 transition-all flex items-center justify-center gap-2">
                  <RefreshCw className={isRefreshing ? 'animate-spin' : ''} size={14}/> Re-align Multi-LLM Grid
                </button>
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

      {activeTab === 'ingestion' && (
        <div className="space-y-8 animate-in fade-in duration-500">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             <StatCardMini label="Jobs Active" value={jobs.filter(j => j.status === 'processing').length} icon={<RefreshCw className="text-indigo-500" size={18}/>} />
             <StatCardMini label="Faulted Nodes" value={jobs.filter(j => j.status === 'failed').length} icon={<AlertTriangle className="text-rose-500" size={18}/>} />
             <StatCardMini label="Lifetime Syncs" value={jobs.filter(j => j.status === 'completed').length} icon={<CheckCircle2 className="text-emerald-500" size={18}/>} />
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-200 dark:border-white/5 overflow-hidden shadow-xl">
             <div className="p-8 border-b dark:border-white/5 flex items-center justify-between">
                <h3 className="text-lg font-black uppercase tracking-tight dark:text-white">Pipeline Monitor</h3>
                <button onClick={fetchStatus} className="p-2 text-slate-400 hover:text-indigo-600"><RefreshCw size={16}/></button>
             </div>
             <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                   <thead className="bg-slate-50 dark:bg-slate-800 text-slate-400 font-black uppercase tracking-widest text-[9px]">
                      <tr>
                         <th className="p-6">Curriculum Asset</th>
                         <th className="p-6">Current Step</th>
                         <th className="p-6">Grid Status</th>
                         <th className="p-6">Latency / Retry</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                      {jobs.map((job) => (
                        <tr key={job.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                           <td className="p-6 font-bold dark:text-white truncate max-w-[200px]">{job.documents?.name || 'Unknown Node'}</td>
                           <td className="p-6 uppercase text-[9px] font-black tracking-widest text-indigo-500">{job.step}</td>
                           <td className="p-6">
                              <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                job.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 
                                job.status === 'failed' ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600 animate-pulse'
                              }`}>
                                {job.status}
                              </span>
                           </td>
                           <td className="p-6 text-slate-400 font-mono text-[10px]">
                              Attempt: {job.retry_count || 0}
                           </td>
                        </tr>
                      ))}
                   </tbody>
                </table>
             </div>
          </div>
        </div>
      )}

      {activeTab === 'diagnostics' && (
        <div className="space-y-8 animate-in fade-in duration-500">
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCardMini label="Vector Extension" value={healthReport?.extensionActive ? 'Active' : 'Missing'} icon={<Box className="text-emerald-500" size={18}/>} />
              <StatCardMini label="Healthy Segments" value={healthReport?.summary?.healthy || 0} icon={<ShieldCheck className="text-indigo-500" size={18}/>} />
              <StatCardMini label="Orphaned Chunks" value={healthReport?.summary?.orphanedChunks || 0} icon={<AlertTriangle className="text-amber-500" size={18}/>} />
              <StatCardMini label="Embedding Dim" value={healthReport?.actualDimensions || '---'} icon={<Layers className="text-purple-500" size={18}/>} />
           </div>

           <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-sm">
              <h3 className="text-lg font-black uppercase tracking-tight mb-8 dark:text-white flex items-center gap-3">
                <Activity size={20} className="text-indigo-600" /> RAG Health Ledger
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {healthReport?.report?.map((rep: any) => (
                   <div key={rep.document_id} className="p-6 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5 flex items-center justify-between">
                      <div className="min-w-0">
                         <p className="font-bold text-sm truncate dark:text-white">{rep.document_name}</p>
                         <p className="text-[9px] font-black uppercase text-slate-400 mt-1 tracking-widest">{rep.chunk_count} Chunks Indexed</p>
                      </div>
                      <span className={`px-2 py-1 rounded text-[8px] font-black uppercase ${rep.health_status === 'HEALTHY' ? 'text-emerald-500 bg-emerald-500/10' : 'text-rose-500 bg-rose-500/10'}`}>
                         {rep.health_status}
                      </span>
                   </div>
                 ))}
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

const StatCardMini = ({ label, value, icon }: any) => (
  <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-200 dark:border-white/5 shadow-sm flex items-center gap-4">
     <div className="p-3 bg-slate-50 dark:bg-white/5 rounded-xl">{icon}</div>
     <div>
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
        <p className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{value}</p>
     </div>
  </div>
);

const Box = ({ className, size }: any) => <div className={className}><Database size={size}/></div>;

export default BrainControl;