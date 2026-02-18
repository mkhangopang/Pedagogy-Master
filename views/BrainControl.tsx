import React, { useState, useEffect, useCallback } from 'react';
import { 
  RefreshCw, Zap, Check, ShieldCheck, Cpu, Activity, Layers, 
  Rocket, TrendingUp, Copy, Lock, FileCode, Search, Database, 
  AlertTriangle, CheckCircle2, X, Loader2, DatabaseZap, Terminal,
  ShieldAlert, Settings2
} from 'lucide-react';
import { NeuralBrain, JobStatus, IngestionStep } from '../types';
import { supabase } from '../lib/supabase';
import { DEFAULT_MASTER_PROMPT } from '../constants';

interface BrainControlProps {
  brain: NeuralBrain;
  onUpdate: (brain: NeuralBrain) => void;
}

const BrainControl: React.FC<BrainControlProps> = ({ brain, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'prompt' | 'blueprint' | 'ingestion' | 'telemetry'>('prompt');
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
    if (activeTab === 'telemetry' && isInitial) setIsTelemetryLoading(true);
    
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

      if (activeTab === 'telemetry') {
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
        body: JSON.stringify({ 
          master_prompt: formData.masterPrompt,
          blueprint_sql: formData.blueprintSql
        })
      });
      if (res.ok) {
        const data = await res.json();
        onUpdate({
          ...formData, 
          version: data.brain.version, 
          updatedAt: data.brain.updated_at
        });
        alert("Institutional IP Committed to Database.");
      }
    } finally { setIsSaving(false); }
  };

  const handleCopyBlueprint = () => {
    if (!formData.blueprintSql) return;
    navigator.clipboard.writeText(formData.blueprintSql);
    setCopiedBlueprint(true);
    setTimeout(() => setCopiedBlueprint(false), 2000);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20 px-2 text-left">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldAlert size={14} className="text-indigo-500" />
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-indigo-500">System Founder Vault</span>
          </div>
          <h1 className="text-3xl font-bold flex items-center gap-3 tracking-tight uppercase dark:text-white">Brain Control</h1>
        </div>
        
        <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-2xl border dark:border-white/5 shadow-inner overflow-x-auto no-scrollbar">
          {[
            { id: 'prompt', icon: <Cpu size={14}/>, label: 'Master Recipe' },
            { id: 'blueprint', icon: <Terminal size={14}/>, label: 'Blueprint' },
            { id: 'ingestion', icon: <Layers size={14}/>, label: 'Ingestion' },
            { id: 'telemetry', icon: <Activity size={14}/>, label: 'Telemetry' },
          ].map(tab => (
            <button 
              key={tab.id} 
              onClick={() => setActiveTab(tab.id as any)} 
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-indigo-600'}`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </header>

      {activeTab === 'prompt' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-8 rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
               <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Institutional Super Prompt (IP)</h3>
               <div className="flex items-center gap-2">
                 <span className="text-[9px] font-bold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 px-3 py-1 rounded-full text-center">v{formData.version}.0</span>
               </div>
            </div>
            <p className="text-[10px] text-slate-400 font-medium italic">Paste your protected world-class instructional framework below. This content is stored exclusively in your private database and is never committed to GitHub.</p>
            <textarea 
              value={formData.masterPrompt}
              onChange={(e) => setFormData({...formData, masterPrompt: e.target.value})}
              className="w-full h-[550px] p-8 bg-slate-900 dark:bg-black text-indigo-100 border border-slate-700 dark:border-white/5 rounded-[2.5rem] font-mono text-[11px] leading-relaxed resize-none outline-none shadow-inner"
              placeholder="Inject v4.0 Super Prompt Here..."
            />
            <button onClick={handleSave} disabled={isSaving} className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-3">
              {isSaving ? <RefreshCw className="animate-spin" size={18}/> : <Zap size={18}/>} Commit Logic to Grid
            </button>
          </div>
          <div className="space-y-6">
             <div className="bg-slate-950 text-white p-10 rounded-[3rem] shadow-2xl relative overflow-hidden flex flex-col gap-6 border border-white/5">
                <div className="absolute top-0 right-0 p-8 opacity-5"><ShieldAlert size={120} /></div>
                <h3 className="text-lg font-bold uppercase tracking-tight text-emerald-400">IP Protection</h3>
                <div className="space-y-5 relative z-10">
                   <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">SENSITIVE LOGIC</span>
                      <span className="text-xs font-black text-emerald-400">DATABASE_ONLY</span>
                   </div>
                   <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">ENCRYPTION</span>
                      <span className="text-xs font-black text-indigo-400">AES_256_SYNC</span>
                   </div>
                </div>
                <p className="text-[9px] text-slate-500 font-medium italic leading-relaxed">By moving the Super Prompt to the database, you prevent it from appearing in public GitHub repositories or Vercel build logs.</p>
             </div>
             
             <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-white/5 shadow-sm">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4 flex items-center gap-2"><Lock size={12}/> Security Protocol</h4>
                <div className="space-y-3">
                   <div className="flex items-center gap-3 text-xs font-bold text-slate-600 dark:text-slate-300">
                      <ShieldCheck size={14} className="text-emerald-500" /> Git-Invisible Logic
                   </div>
                   <div className="flex items-center gap-3 text-xs font-bold text-slate-600 dark:text-slate-300">
                      <Database size={14} className="text-indigo-500" /> Remote Handshake Only
                   </div>
                </div>
             </div>
          </div>
        </div>
      )}

      {activeTab === 'blueprint' && (
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-sm space-y-6 animate-in fade-in">
           <div className="flex items-center justify-between">
              <div>
                 <h3 className="text-lg font-bold uppercase tracking-tight dark:text-white">Infrastructure Blueprint (v7.0)</h3>
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Remote SQL Configuration Storage</p>
              </div>
              <div className="flex gap-2">
                <button onClick={handleCopyBlueprint} className="flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-all">
                   {copiedBlueprint ? <Check size={14}/> : <Copy size={14}/>} {copiedBlueprint ? 'Copied' : 'Copy SQL'}
                </button>
                <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2 px-6 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all">
                   {isSaving ? <RefreshCw className="animate-spin" size={14}/> : <DatabaseZap size={14}/>} Save Blueprint
                </button>
              </div>
           </div>
           <p className="text-[10px] text-slate-400 font-medium italic">The v7.0 SQL schema is stored here to keep your underlying database architecture secret from contributors and public forks.</p>
           <textarea 
              value={formData.blueprintSql || ''}
              onChange={(e) => setFormData({...formData, blueprintSql: e.target.value})}
              className="w-full h-[550px] p-8 bg-slate-900 dark:bg-black text-emerald-400 border border-slate-700 rounded-2xl font-mono text-[10px] leading-relaxed resize-none outline-none shadow-inner custom-scrollbar"
              placeholder="-- Paste your secret SQL infrastructure blueprint (v7.0) here..."
            />
        </div>
      )}

      {activeTab === 'ingestion' && (
        <div className="bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-sm overflow-hidden animate-in fade-in">
           <div className="p-8 border-b dark:border-white/5 flex justify-between items-center">
              <h3 className="text-lg font-bold uppercase tracking-tight dark:text-white flex items-center gap-3"><Layers size={20}/> Pipeline Telemetry</h3>
              <button onClick={() => fetchStatus(true)} className="p-2 text-slate-400 hover:text-indigo-600 transition-all"><RefreshCw size={14} /></button>
           </div>
           <div className="overflow-x-auto">
              <table className="w-full text-left text-[10px]">
                 <thead className="bg-slate-50 dark:bg-slate-800 text-slate-400 font-bold uppercase tracking-widest text-[8px]">
                    <tr>
                       <th className="p-5">Asset Identity</th>
                       <th className="p-5">Process Stage</th>
                       <th className="p-5">Neural Status</th>
                       <th className="p-5">Trace Log</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                    {jobs.map(job => (
                       <tr key={job.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-5 font-bold text-slate-700 dark:text-slate-200">{job.documents?.name}</td>
                          <td className="p-5"><span className="px-2 py-1 bg-slate-100 dark:bg-white/5 rounded uppercase font-black text-[7px]">{job.step}</span></td>
                          <td className="p-5">
                             <span className={`flex items-center gap-1.5 font-bold uppercase ${job.status === 'completed' ? 'text-emerald-500' : job.status === 'failed' ? 'text-rose-500' : 'text-amber-500'}`}>
                                {job.status === 'processing' && <Loader2 size={10} className="animate-spin" />}
                                {job.status}
                             </span>
                          </td>
                          <td className="p-5 text-slate-400 font-mono italic max-w-xs truncate">{job.error_message || JSON.stringify(job.payload || {})}</td>
                       </tr>
                    ))}
                    {jobs.length === 0 && (
                      <tr><td colSpan={4} className="p-20 text-center text-slate-400 font-bold uppercase tracking-widest opacity-40 text-[9px]">No active ingestion threads.</td></tr>
                    )}
                 </tbody>
              </table>
           </div>
        </div>
      )}

      {activeTab === 'telemetry' && (
        <div className="space-y-6 animate-in fade-in">
           {isTelemetryLoading ? (
             <div className="flex flex-col items-center justify-center py-40">
                <Loader2 size={40} className="animate-spin text-indigo-600 mb-4" />
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Syncing System Nodes...</p>
             </div>
           ) : healthReport ? (
             <>
               <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <StatCardMini label="Verified Chunks" value={healthReport.summary?.healthy ?? 0} icon={<ShieldCheck className="text-emerald-500" size={18}/>} />
                  <StatCardMini label="Orphaned Logic" value={healthReport.summary?.orphanedChunks ?? 0} icon={<AlertTriangle className="text-amber-500" size={18}/>} />
                  <StatCardMini label="Vector Dim" value={healthReport.actualDimensions ?? 768} icon={<Layers className="text-purple-500" size={18}/>} />
                  <StatCardMini label="RAG Gateway" value={healthReport.extensionActive ? 'Active' : 'Offline'} icon={<Database className="text-indigo-500" size={18}/>} />
               </div>
               <div className="bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-200 dark:border-white/5 overflow-hidden shadow-sm">
                 <div className="p-8 border-b dark:border-white/5 flex justify-between items-center">
                    <h3 className="text-lg font-bold uppercase tracking-tight dark:text-white flex items-center gap-3"><Activity size={18} className="text-indigo-600" /> Neural Health Registry</h3>
                    <button onClick={() => fetchStatus(true)} className="p-2 text-slate-400 hover:text-indigo-600 transition-all"><RefreshCw size={14} /></button>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-8">
                    {healthReport.report?.map((r: any) => (
                      <div key={r.document_id} className="p-6 bg-slate-50 dark:bg-white/5 rounded-3xl border border-slate-100 dark:border-white/5 flex items-center justify-between hover:border-indigo-400 transition-all group">
                         <div>
                            <p className="font-bold text-sm dark:text-white truncate max-w-[200px]">{r.document_name}</p>
                            <p className="text-[10px] font-medium text-slate-400 mt-1 uppercase tracking-widest">{r.chunk_count} Deterministic Nodes</p>
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
                <p className="text-sm font-bold uppercase tracking-widest uppercase">Grid Telemetry Idle</p>
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