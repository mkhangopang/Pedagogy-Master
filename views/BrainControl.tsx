import React, { useState, useEffect } from 'react';
import { 
  RefreshCw, Zap, Check, Copy, ShieldCheck, Terminal, Cpu, Sparkles, Wrench, Globe, BookOpen, CheckCircle2, Activity, Database, AlertCircle, Server, AlertTriangle
} from 'lucide-react';
import { NeuralBrain } from '../types';
import { supabase } from '../lib/supabase';

interface BrainControlProps {
  brain: NeuralBrain;
  onUpdate: (brain: NeuralBrain) => void;
}

const BrainControl: React.FC<BrainControlProps> = ({ brain, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'logic' | 'dialects' | 'pulse' | 'sql'>('logic');
  const [formData, setFormData] = useState(brain);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [gridStatus, setGridStatus] = useState<any[]>([]);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/ai-status');
      const data = await res.json();
      setGridStatus(data.providers || []);
    } catch (e) {}
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
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
      const { data: { session } } = await supabase.auth.getSession();
      await fetch('/api/ai-reset', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` }
      });
      await fetchStatus();
    } finally { setIsResetting(false); }
  };

  const migrationSql = `-- EVOLUTION v118: Master MD Hybrid & Diagnostic Pulse
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS last_grounding_method TEXT;
CREATE INDEX IF NOT EXISTS idx_docs_rag_method ON public.documents(last_grounding_method);`;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20 px-2 text-left">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-black flex items-center gap-3 tracking-tight uppercase dark:text-white">
            <ShieldCheck className="text-indigo-600" /> Brain v120.0
          </h1>
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Master MD & Grid Diagnostic Hub</p>
        </div>
        <div className="flex bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl border dark:border-white/5 overflow-x-auto no-scrollbar">
          {[
            { id: 'logic', icon: <Cpu size={14}/>, label: 'Logic' },
            { id: 'pulse', icon: <Activity size={14}/>, label: 'Grid Pulse' },
            { id: 'dialects', icon: <Globe size={14}/>, label: 'Dialects' },
            { id: 'sql', icon: <Terminal size={14}/>, label: 'SQL' }
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm' : 'text-slate-50'}`}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </header>

      {activeTab === 'logic' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-sm space-y-6">
            <h2 className="text-lg font-bold dark:text-white flex items-center gap-2"><Cpu size={18} className="text-indigo-500" /> Master Synthesis Logic</h2>
            <textarea 
              value={formData.masterPrompt}
              onChange={(e) => setFormData({...formData, masterPrompt: e.target.value})}
              className="w-full h-[500px] p-8 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-[2.5rem] font-mono text-[11px] leading-relaxed resize-none outline-none focus:ring-2 focus:ring-indigo-500 custom-scrollbar"
            />
            <button onClick={handleSave} disabled={isSaving} className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-3">
              {isSaving ? <RefreshCw className="animate-spin" size={18}/> : <Zap size={18}/>} Commit Logic
            </button>
          </div>
          
          <div className="space-y-6">
             <div className="bg-slate-900 text-white p-8 rounded-[3rem] shadow-2xl relative overflow-hidden flex flex-col gap-6">
                <div className="absolute top-0 right-0 p-8 opacity-5"><Activity size={150} /></div>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-black uppercase tracking-tight text-emerald-400">Neural Status</h3>
                  <button 
                    onClick={handleResetGrid} 
                    disabled={isResetting}
                    className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-emerald-400 transition-all"
                    title="Realignment Node"
                  >
                    {isResetting ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
                  </button>
                </div>
                <div className="space-y-4 relative z-10">
                   <StatusRow label="Direct MD Scan" status="Active" color="text-indigo-400" />
                   <StatusRow label="Failover Protocol" status="5s Cool" color="text-amber-400" />
                   <StatusRow label="Auto-Realignment" status="Enabled" color="text-emerald-400" />
                </div>
             </div>

             <div className="p-8 bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-100 dark:border-white/5">
                <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-4">Ingestion Engine</h4>
                <p className="text-xs text-slate-500 italic leading-relaxed">Direct Master MD Reading (DMMR) v1.0 prioritized. Skips vector noise for literal standard matches.</p>
                <div className="mt-6 flex items-center gap-2">
                   <div className="flex-1 h-1 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 w-full" />
                   </div>
                   <CheckCircle2 size={14} className="text-emerald-500" />
                </div>
             </div>
          </div>
        </div>
      )}

      {activeTab === 'pulse' && (
        <div className="space-y-6">
          <div className="flex justify-end px-4">
             <button onClick={handleResetGrid} disabled={isResetting} className="px-6 py-3 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-emerald-700 transition-all flex items-center gap-2">
               {isResetting ? <RefreshCw size={12} className="animate-spin" /> : <Zap size={12} />} Re-align Neural Grid
             </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {gridStatus.map(node => (
               <div key={node.id} className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-white/5 shadow-sm space-y-6">
                  <div className="flex justify-between items-start">
                     <div className={`p-3 rounded-xl ${node.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                        <Server size={20} />
                     </div>
                     <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${node.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        {node.status}
                     </span>
                  </div>
                  <div>
                     <h3 className="text-sm font-black uppercase dark:text-white">{node.name}</h3>
                     <p className="text-[10px] text-slate-400 uppercase font-bold mt-1">Tier {node.tier} Architecture</p>
                  </div>
                  {node.lastError && (
                    <div className="p-4 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 rounded-2xl">
                       <p className="text-[9px] font-black text-rose-600 uppercase mb-1 flex items-center gap-1"><AlertTriangle size={10}/> Grid Logic Exception</p>
                       <p className="text-[10px] font-medium text-slate-600 dark:text-slate-400 line-clamp-2">{node.lastError}</p>
                    </div>
                  )}
                  {!node.lastError && node.status === 'active' && (
                    <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-2xl flex items-center gap-3">
                       <Zap size={14} className="text-emerald-500 animate-pulse" />
                       <span className="text-[10px] font-black text-emerald-600 uppercase">Segment Synced</span>
                    </div>
                  )}
               </div>
             ))}
          </div>
        </div>
      )}

      {activeTab === 'dialects' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           <DialectCard title="Sindh Board (SLO Logic)" desc="Optimized for B-XX-X-XX codes. Forces direct instruction and 5E alignment." active />
           <DialectCard title="Cambridge IGCSE (AO Logic)" desc="Focuses on Assessment Objectives (AO) and specific Strand criteria." />
           <DialectCard title="IB DP (Concept Logic)" desc="Maps to Key Concepts, Related Concepts, and Global Contexts." />
           <DialectCard title="Standard Global" desc="Generic Bloom-based outcomes for independent institutions." />
        </div>
      )}

      {activeTab === 'sql' && (
        <div className="bg-slate-900 p-10 rounded-[3rem] border border-white/10 shadow-2xl">
           <div className="flex items-center justify-between mb-8">
              <h3 className="text-white font-black uppercase text-xs tracking-widest flex items-center gap-2"><Database size={16} /> Migration Pulse</h3>
              <button onClick={() => navigator.clipboard.writeText(migrationSql)} className="px-6 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">Copy Migration</button>
           </div>
           <pre className="p-6 bg-black/40 rounded-2xl text-emerald-400 font-mono text-[10px] leading-relaxed overflow-x-auto">{migrationSql}</pre>
        </div>
      )}
    </div>
  );
};

const StatusRow = ({ label, status, color = "text-emerald-500" }: any) => (
  <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl">
    <span className="text-[10px] font-bold text-slate-400 uppercase">{label}</span>
    <span className={`text-[10px] font-black uppercase ${color}`}>{status}</span>
  </div>
);

const DialectCard = ({ title, desc, active = false }: any) => (
  <div className={`p-10 rounded-[3rem] border transition-all ${active ? 'bg-indigo-600 border-indigo-400 text-white shadow-2xl scale-105' : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-white/5 text-slate-900 dark:text-white shadow-sm'}`}>
     <Globe size={28} className={active ? 'text-indigo-200' : 'text-indigo-600'} />
     <h3 className="text-2xl font-black uppercase tracking-tight mt-6">{title}</h3>
     <p className={`text-sm mt-2 leading-relaxed ${active ? 'text-indigo-100' : 'text-slate-500'}`}>{desc}</p>
     <div className={`mt-6 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest w-fit ${active ? 'bg-white/10 text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-500'}`}>
        {active ? 'SYSTEM DEFAULT' : 'AVAILABLE'}
     </div>
  </div>
);

export default BrainControl;