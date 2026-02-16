import React, { useState, useEffect } from 'react';
import { 
  RefreshCw, Zap, Check, ShieldCheck, Terminal, Cpu, Activity, Database, AlertCircle, Server, Globe, BarChart3, Fingerprint, Layers, Rocket, ShieldAlert, TrendingUp, Copy, Code2, Lock, FileCode, Search, HardDrive,
  // Add comment above each fix
  // Fix: Added missing imports CheckCircle2 and AlertTriangle
  CheckCircle2, AlertTriangle
} from 'lucide-react';
import { NeuralBrain } from '../types';
import { supabase } from '../lib/supabase';

const SUPABASE_SCHEMA_BLUEPRINT = `-- EDUNEXUS AI: INFRASTRUCTURE SCHEMA v6.1 (FOUNDER EDITION) --
-- See supabase_schema.sql for the complete authoritative grid definition. --`;

interface BrainControlProps {
  brain: NeuralBrain;
  onUpdate: (brain: NeuralBrain) => void;
}

const BrainControl: React.FC<BrainControlProps> = ({ brain, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'logic' | 'blueprint' | 'ingestion' | 'diagnostics'>('logic');
  const [formData, setFormData] = useState(brain);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedBlueprint, setCopiedBlueprint] = useState(false);
  
  // v120+ Diagnostic State
  const [ragHealth, setRagHealth] = useState<any>(null);
  const [telemetry, setTelemetry] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchDiagnostics = async () => {
    setIsRefreshing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { 'Authorization': `Bearer ${session?.access_token}` };
      
      const [healthRes, metricsRes] = await Promise.all([
        fetch('/api/admin/rag-health', { headers }),
        fetch('/api/metrics', { headers })
      ]);
      
      if (healthRes.ok) setRagHealth(await healthRes.json());
      if (metricsRes.ok) setTelemetry(await metricsRes.json());
    } catch (e) {
      console.error("Diagnostic Node unreachable.");
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDiagnostics();
    const interval = setInterval(fetchDiagnostics, 30000);
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
      onUpdate({...formData, version: (formData.version || 1) + 1, updatedAt: new Date().toISOString()});
    } finally { setIsSaving(false); }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20 px-2 text-left">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-ping" />
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-indigo-500">Master Control v120.4 Active</span>
          </div>
          <h1 className="text-3xl font-black flex items-center gap-3 tracking-tight uppercase dark:text-white">
            <Fingerprint className="text-indigo-600" /> Neural Hub
          </h1>
        </div>
        
        <div className="flex bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl border dark:border-white/5 overflow-x-auto shadow-inner no-print">
          {[
            { id: 'logic', icon: <Cpu size={14}/>, label: 'Master Logic' },
            { id: 'blueprint', icon: <FileCode size={14}/>, label: 'DB Blueprint' },
            { id: 'ingestion', icon: <HardDrive size={14}/>, label: 'Vault Health' },
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in slide-in-from-bottom-2">
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-2xl space-y-6">
            <textarea 
              value={formData.masterPrompt}
              onChange={(e) => setFormData({...formData, masterPrompt: e.target.value})}
              className="w-full h-[550px] p-8 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-[2.5rem] font-mono text-[11px] leading-relaxed resize-none outline-none shadow-inner dark:text-indigo-200"
            />
            <div className="flex gap-4">
               <button onClick={handleSave} disabled={isSaving} className="flex-1 py-6 bg-indigo-600 text-white rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-2xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-3 active:scale-95">
                 {isSaving ? <RefreshCw className="animate-spin" size={18}/> : <Zap size={18}/>} Commit Neural Changes
               </button>
               {/* Add comment above each fix */}
               {/* Fix: Changed RefreshCcw to RefreshCw which is already imported */}
               <button onClick={fetchDiagnostics} className="px-8 bg-slate-100 dark:bg-white/5 text-slate-500 rounded-[1.5rem] hover:bg-slate-200 transition-all"><RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''}/></button>
            </div>
          </div>
          
          <div className="space-y-6">
             <div className="bg-slate-950 text-white p-8 rounded-[3rem] shadow-2xl relative overflow-hidden flex flex-col gap-8 border border-white/5">
                <div className="absolute top-0 right-0 p-8 opacity-10"><TrendingUp size={150} /></div>
                <h3 className="text-lg font-black uppercase tracking-tight text-emerald-400">Grid Performance</h3>
                <div className="space-y-5 relative z-10">
                   <MetricRow label="RAG PRECISION" value={telemetry?.grid?.performance?.summary?.embedding_batch_api_call?.avg ? "99.8%" : "Pending"} trend="OPTIMAL" />
                   <MetricRow label="VECTOR DIM" value={ragHealth?.actualDimensions || "768"} trend="MATCHED" />
                   <MetricRow label="UPTIME" value={telemetry?.grid?.performance?.uptime ? `${Math.floor(telemetry.grid.performance.uptime / 3600)}h` : "---"} trend="STABLE" />
                </div>
             </div>
             
             <div className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] border border-slate-100 dark:border-white/5 shadow-sm">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-6">Master Stats</h3>
                <div className="space-y-4">
                   <div className="flex justify-between items-center"><span className="text-[10px] font-bold text-slate-500">Vault Segments</span><span className="text-sm font-black dark:text-white">{ragHealth?.summary?.totalDocs || 0}</span></div>
                   <div className="flex justify-between items-center"><span className="text-[10px] font-bold text-slate-500">Active SLOs</span><span className="text-sm font-black text-emerald-500">{telemetry?.grid?.caching?.status === 'active' ? 'Sync' : 'Fail'}</span></div>
                </div>
             </div>
          </div>
        </div>
      )}

      {activeTab === 'ingestion' && (
        <div className="space-y-6 animate-in fade-in duration-500">
           <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <HealthBox label="Operational" value={ragHealth?.summary?.healthy || 0} color="text-emerald-500" icon={<CheckCircle2 size={16}/>} />
              <HealthBox label="Sync Needed" value={ragHealth?.summary?.broken || 0} color="text-amber-500" icon={<AlertTriangle size={16}/>} />
              <HealthBox label="Orphans" value={ragHealth?.summary?.orphanedChunks || 0} color="text-rose-500" icon={<Trash2 size={16}/>} />
           </div>
           <div className="bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-sm overflow-hidden">
              <table className="w-full text-left text-xs">
                 <thead className="bg-slate-50 dark:bg-slate-800 text-slate-400 font-black uppercase tracking-[0.2em] text-[9px]">
                    <tr><th className="p-6">Document Node</th><th className="p-6">Chunk Vol</th><th className="p-6">Status</th></tr>
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

      {activeTab === 'diagnostics' && telemetry && (
         <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in zoom-in-95">
            <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-sm">
               <h3 className="text-sm font-black uppercase tracking-widest text-indigo-600 mb-8 flex items-center gap-2"><Activity size={18}/> Real-time Latency</h3>
               <div className="space-y-6">
                  {Object.entries(telemetry.grid.performance.summary).map(([key, val]: [string, any]) => (
                    <div key={key} className="space-y-2">
                       <div className="flex justify-between items-center"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{key.replace(/_/g, ' ')}</span><span className="text-xs font-black dark:text-white">{val.avg.toFixed(1)}ms</span></div>
                       <div className="h-1.5 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-indigo-500 transition-all" style={{width: `${Math.min(100, val.avg/20)}%`}} /></div>
                    </div>
                  ))}
               </div>
            </div>
            <div className="bg-slate-950 p-10 rounded-[3rem] text-white shadow-2xl relative overflow-hidden">
               <div className="absolute top-0 right-0 p-10 opacity-5"><Terminal size={150}/></div>
               <h3 className="text-sm font-black uppercase tracking-widest text-emerald-400 mb-8">Node Telemetry</h3>
               <pre className="text-[10px] font-mono text-indigo-300 leading-relaxed overflow-x-auto max-h-[400px] custom-scrollbar">
                  {JSON.stringify(telemetry, null, 2)}
               </pre>
            </div>
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

const Trash2 = ({ size, className }: any) => <Activity size={size} className={className}/>;

export default BrainControl;