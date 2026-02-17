import React, { useState, useEffect, useCallback } from 'react';
import { 
  RefreshCw, Zap, Check, ShieldCheck, Cpu, Activity, Layers, 
  Rocket, TrendingUp, Copy, Lock, FileCode, Search, Database, 
  AlertTriangle, CheckCircle2, X, Loader2
} from 'lucide-react';
import { NeuralBrain, JobStatus, IngestionStep } from '../types';
import { supabase } from '../lib/supabase';

interface BrainControlProps {
  brain: NeuralBrain;
  onUpdate: (brain: NeuralBrain) => void;
}

const BLUEPRINT_SQL = `-- PEDAGOGY MASTER: INFRASTRUCTURE BLUEPRINT v6.8 (v4.0 Final)
-- Hardened for Pakistan Sindh/Federal Board Protocol

create table if not exists public.neural_brain (
  id text primary key,
  master_prompt text not null,
  version int default 1,
  is_active boolean default true,
  updated_at timestamp with time zone default now()
);

create table if not exists public.slo_database (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid references public.documents(id) on delete cascade,
  slo_code text not null,
  slo_full_text text not null,
  bloom_level text,
  created_at timestamp with time zone default now()
);`;

const BrainControl: React.FC<BrainControlProps> = ({ brain, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'logic' | 'blueprint' | 'ingestion' | 'diagnostics'>('logic');
  const [formData, setFormData] = useState(brain);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [copiedBlueprint, setCopiedBlueprint] = useState(false);
  
  const [jobs, setJobs] = useState<any[]>([]);
  const [healthReport, setHealthReport] = useState<any>(null);
  const [isTelemetryLoading, setIsTelemetryLoading] = useState(false);

  useEffect(() => {
    setFormData(brain);
  }, [brain]);

  const fetchStatus = useCallback(async (isInitial = false) => {
    if (activeTab === 'diagnostics' && isInitial) setIsTelemetryLoading(true);
    
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
        if (res.ok) {
          const data = await res.json();
          setHealthReport(data);
        }
      }
    } catch (e) {
      console.warn("Telemetry Node Offline.");
    } finally {
      if (isInitial) setIsTelemetryLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchStatus(true);
    const interval = setInterval(() => fetchStatus(false), 10000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

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

  const handleGridReset = async () => {
    if (!window.confirm("CRITICAL: Re-align all synthesis nodes and purge fail-state cache?")) return;
    setIsResetting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/ai-reset', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` }
      });
      if (res.ok) alert("Neural grid re-aligned.");
    } finally { setIsResetting(false); }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20 px-2 text-left">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-indigo-500">System Founder Console</span>
          </div>
          <h1 className="text-3xl font-bold flex items-center gap-3 tracking-tight uppercase dark:text-white">Neural Brain</h1>
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
            <div className="grid grid-cols-2 gap-4">
              <button onClick={handleSave} disabled={isSaving} className="py-5 bg-indigo-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-3">
                {isSaving ? <RefreshCw className="animate-spin" size={18}/> : <Zap size={18}/>} Commit Logic
              </button>
              {/* 
                // Add comment above each fix
                // Fix: Changed RefreshCcw to RefreshCw to resolve "Cannot find name 'RefreshCcw'" error
              */}
              <button onClick={handleGridReset} disabled={isResetting} className="py-5 bg-slate-900 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-xl hover:bg-black transition-all flex items-center justify-center gap-3">
                {isResetting ? <RefreshCw className="animate-spin" size={18}/> : <RefreshCw size={18}/>} Re-align Grid
              </button>
            </div>
          </div>
          <div className="space-y-6">
             <div className="bg-slate-950 text-white p-10 rounded-[3rem] shadow-2xl relative overflow-hidden flex flex-col gap-6 border border-white/5">
                <div className="absolute top-0 right-0 p-8 opacity-5"><Activity size={120} /></div>
                <h3 className="text-lg font-bold uppercase tracking-tight text-emerald-400">Node Pulse</h3>
                <div className="space-y-5 relative z-10">
                   <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">TOOL ROUTING</span>
                      <span className="text-xs font-black text-emerald-400">V4.0 ACTIVE</span>
                   </div>
                </div>
                <p className="text-[9px] text-slate-500 font-medium italic">Master logic is persistent and decoupled from public constants for system founder security.</p>
             </div>
          </div>
        </div>
      )}

      {activeTab === 'diagnostics' && (
        <div className="space-y-6 animate-in fade-in">
           {isTelemetryLoading ? (
             <div className="flex flex-col items-center justify-center py-40">
                <Loader2 size={40} className="animate-spin text-indigo-600 mb-4" />
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Syncing Telemetry Nodes...</p>
             </div>
           ) : healthReport ? (
             <>
               <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <StatCardMini label="Healthy Segments" value={healthReport.summary?.healthy ?? 0} icon={<ShieldCheck className="text-emerald-500" size={18}/>} />
                  <StatCardMini label="Orphaned Chunks" value={healthReport.summary?.orphanedChunks ?? 0} icon={<AlertTriangle className="text-amber-500" size={18}/>} />
                  <StatCardMini label="Embedding Dim" value={healthReport.actualDimensions ?? 768} icon={<Layers className="text-purple-500" size={18}/>} />
                  <StatCardMini label="Vector Extension" value={healthReport.extensionActive ? 'Active' : 'Offline'} icon={<Database className="text-indigo-500" size={18}/>} />
               </div>
               <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-white/5 overflow-hidden shadow-sm">
                 <div className="p-8 border-b dark:border-white/5 flex justify-between items-center">
                    <h3 className="text-lg font-bold uppercase tracking-tight dark:text-white flex items-center gap-3"><Activity size={18} className="text-indigo-600" /> RAG Health Ledger</h3>
                    <button onClick={() => fetchStatus(true)} className="p-2 text-slate-400 hover:text-indigo-600 transition-all"><RefreshCw size={14} /></button>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-8">
                    {healthReport.report?.map((r: any) => (
                      <div key={r.document_id} className="p-6 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5 flex items-center justify-between hover:border-indigo-400 transition-all group">
                         <div>
                            <p className="font-bold text-sm dark:text-white truncate max-w-[200px]">{r.document_name}</p>
                            <p className="text-[10px] font-medium text-slate-400 mt-1 uppercase tracking-widest">{r.chunk_count} Chunks Indexed</p>
                         </div>
                         <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase ${r.health_status === 'HEALTHY' ? 'text-emerald-500 border border-emerald-100' : 'text-rose-500 border border-rose-100'}`}>{r.health_status}</span>
                      </div>
                    ))}
                 </div>
               </div>
             </>
           ) : (
             <div className="flex flex-col items-center justify-center py-40 opacity-30 text-center">
                <Activity size={48} className="text-slate-400 mb-4 mx-auto" />
                <p className="text-sm font-bold uppercase tracking-widest">Telemetry Grid Idle</p>
                <button onClick={() => fetchStatus(true)} className="mt-4 text-[10px] font-black uppercase text-indigo-600 hover:underline">Force Handshake</button>
             </div>
           )}
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