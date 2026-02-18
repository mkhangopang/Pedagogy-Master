import React, { useState, useEffect, useCallback } from 'react';
import { 
  RefreshCw, Zap, Check, ShieldCheck, Cpu, Activity, Layers, 
  Rocket, TrendingUp, Copy, Lock, FileCode, Search, Database, 
  AlertTriangle, CheckCircle2, X, Loader2, DatabaseZap, Terminal,
  ShieldAlert, Settings2, Save
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
        alert("Institutional IP (Recipe & SQL) Synchronized to Vault.");
      }
    } catch (e: any) {
      alert("Grid Commitment Failed: " + e.message);
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
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-indigo-500">Founder Command Node</span>
          </div>
          <h1 className="text-3xl font-black flex items-center gap-3 tracking-tight uppercase dark:text-white">Brain Control</h1>
        </div>
        
        <div className="flex bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl border dark:border-white/5 shadow-inner overflow-x-auto no-scrollbar">
          {[
            { id: 'prompt', icon: <Cpu size={14}/>, label: 'Master Recipe' },
            { id: 'blueprint', icon: <Terminal size={14}/>, label: 'SQL Blueprint' },
            { id: 'ingestion', icon: <Layers size={14}/>, label: 'Telemetry' },
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
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-10 rounded-[3.5rem] border border-slate-200 dark:border-white/5 shadow-sm space-y-8">
            <div className="flex items-center justify-between">
               <div>
                 <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Institutional Master Prompt</h3>
                 <p className="text-[10px] text-indigo-600 font-bold mt-1 uppercase tracking-widest">Version {formData.version}.0 Active</p>
               </div>
               <button onClick={handleSave} disabled={isSaving} className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-3">
                 {isSaving ? <RefreshCw className="animate-spin" size={16}/> : <Save size={16}/>} Commit IP
               </button>
            </div>
            <textarea 
              value={formData.masterPrompt}
              onChange={(e) => setFormData({...formData, masterPrompt: e.target.value})}
              className="w-full h-[600px] p-8 bg-slate-900 dark:bg-black text-indigo-100 border border-slate-700 dark:border-white/5 rounded-[2.5rem] font-mono text-[11px] leading-relaxed resize-none outline-none shadow-inner custom-scrollbar"
              placeholder="Inject Universal Ingestion logic here..."
            />
          </div>
          <div className="space-y-6">
             <div className="bg-slate-950 text-white p-10 rounded-[3.5rem] shadow-2xl relative overflow-hidden flex flex-col gap-6 border border-white/5">
                <div className="absolute top-0 right-0 p-8 opacity-10"><ShieldAlert size={150} /></div>
                <h3 className="text-xl font-black uppercase tracking-tight text-emerald-400">Intellectual Property Protection</h3>
                <p className="text-xs text-slate-400 font-medium leading-relaxed italic">By storing the Master Recipe in the database, your proprietary pedagogical logic is shielded from Git repositories and build-time exposures.</p>
                <div className="space-y-3 relative z-10 pt-4">
                   <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Status</span>
                      <span className="text-[10px] font-black text-emerald-400">REMOTE_VAULT_ONLY</span>
                   </div>
                </div>
             </div>
          </div>
        </div>
      )}

      {activeTab === 'blueprint' && (
        <div className="bg-white dark:bg-slate-900 p-10 rounded-[3.5rem] border border-slate-200 dark:border-white/5 shadow-sm space-y-8 animate-in fade-in">
           <div className="flex items-center justify-between">
              <div>
                 <h3 className="text-xl font-black uppercase tracking-tight dark:text-white">Infrastructure Blueprint SQL</h3>
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Centralized SQL Provisioning for v7.0 Standards</p>
              </div>
              <div className="flex gap-3">
                <button onClick={handleCopyBlueprint} className="flex items-center gap-3 px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">
                   {copiedBlueprint ? <Check size={14} className="text-emerald-500"/> : <Copy size={14}/>} {copiedBlueprint ? 'Blueprint Copied' : 'Copy SQL'}
                </button>
                <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-3 px-8 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg">
                   {isSaving ? <RefreshCw className="animate-spin" size={14}/> : <DatabaseZap size={14}/>} Save Changes
                </button>
              </div>
           </div>
           <p className="text-xs text-slate-500 font-medium leading-relaxed">Modify the standard v7.0 SQL below to update your backend architecture. Copy and provide this manually to Supabase SQL Editor if needed.</p>
           <textarea 
              value={formData.blueprintSql || ''}
              onChange={(e) => setFormData({...formData, blueprintSql: e.target.value})}
              className="w-full h-[600px] p-8 bg-slate-900 dark:bg-black text-emerald-400 border border-slate-700 rounded-[2.5rem] font-mono text-[11px] leading-relaxed resize-none outline-none shadow-inner custom-scrollbar"
              placeholder="-- Paste Master Infrastructure SQL v7.0 here..."
            />
        </div>
      )}

      {activeTab === 'ingestion' && (
        <div className="bg-white dark:bg-slate-900 rounded-[3.5rem] border border-slate-200 dark:border-white/5 shadow-sm overflow-hidden animate-in fade-in">
           <div className="p-10 border-b dark:border-white/5 flex justify-between items-center">
              <h3 className="text-xl font-black uppercase tracking-tight dark:text-white flex items-center gap-3"><Layers size={24}/> Process Telemetry</h3>
              <button onClick={() => fetchStatus(true)} className="p-3 bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-indigo-600 rounded-full transition-all"><RefreshCw size={16} /></button>
           </div>
           <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-[10px]">
                 <thead className="bg-slate-50 dark:bg-slate-800 text-slate-400 font-black uppercase tracking-widest text-[9px]">
                    <tr>
                       <th className="p-6">Curriculum Asset</th>
                       <th className="p-6">Neural Step</th>
                       <th className="p-6">Status</th>
                       <th className="p-6">Trace Log</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                    {jobs.map(job => (
                       <tr key={job.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-6 font-bold text-slate-700 dark:text-slate-200 uppercase tracking-tighter">{job.documents?.name}</td>
                          <td className="p-6"><span className="px-3 py-1 bg-slate-100 dark:bg-white/5 rounded-lg uppercase font-black text-[8px] tracking-widest">{job.step}</span></td>
                          <td className="p-6">
                             <span className={`flex items-center gap-2 font-black uppercase tracking-widest ${job.status === 'completed' ? 'text-emerald-500' : job.status === 'failed' ? 'text-rose-500' : 'text-amber-500'}`}>
                                {job.status === 'processing' && <Loader2 size={10} className="animate-spin" />}
                                {job.status}
                             </span>
                          </td>
                          <td className="p-6 text-slate-400 font-mono italic max-w-xs truncate">{job.error_message || "Handshake complete."}</td>
                       </tr>
                    ))}
                    {jobs.length === 0 && (
                      <tr><td colSpan={4} className="p-24 text-center text-slate-400 font-black uppercase tracking-[0.3em] opacity-30 text-[10px]">Pipeline currently silent.</td></tr>
                    )}
                 </tbody>
              </table>
           </div>
        </div>
      )}
    </div>
  );
};

export default BrainControl;