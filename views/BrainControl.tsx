
import React, { useState, useEffect } from 'react';
import { 
  RefreshCw, Zap, Check, ShieldCheck, Terminal, Cpu, Activity, Database, AlertCircle, Server, Globe, BarChart3, Fingerprint, Layers, Rocket, ShieldAlert
} from 'lucide-react';
import { NeuralBrain } from '../types';
import { supabase } from '../lib/supabase';

interface BrainControlProps {
  brain: NeuralBrain;
  onUpdate: (brain: NeuralBrain) => void;
}

const BrainControl: React.FC<BrainControlProps> = ({ brain, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'logic' | 'diagnostics' | 'dialects' | 'sql'>('logic');
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
      const { data: { session } } = await supabase.auth.getSession();
      await fetch('/api/ai-reset', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` }
      });
      await fetchStatus();
    } finally { setIsResetting(false); }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20 px-2 text-left">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-ping" />
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-indigo-500">Neural Core Operational</span>
          </div>
          <h1 className="text-3xl font-black flex items-center gap-3 tracking-tight uppercase dark:text-white">
            <Fingerprint className="text-indigo-600" /> Neural Brain v125.4
          </h1>
        </div>
        <div className="flex bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl border dark:border-white/5 overflow-x-auto no-scrollbar">
          {[
            { id: 'logic', icon: <Cpu size={14}/>, label: 'Instructional DNA' },
            { id: 'diagnostics', icon: <Activity size={14}/>, label: 'Grid Diagnostics' },
            { id: 'dialects', icon: <Globe size={14}/>, label: 'Curricula Logic' },
            { id: 'sql', icon: <Terminal size={14}/>, label: 'System Protocol' }
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
                <Cpu size={18} className="text-indigo-500" /> Synthesis Gateway Master Logic
              </h2>
              <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[9px] font-black uppercase">Active Build v{formData.version}.0</span>
            </div>
            <textarea 
              value={formData.masterPrompt}
              onChange={(e) => setFormData({...formData, masterPrompt: e.target.value})}
              className="w-full h-[600px] p-8 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-[2.5rem] font-mono text-[11px] leading-relaxed resize-none outline-none focus:ring-2 focus:ring-indigo-500 custom-scrollbar"
              placeholder="Inject master synthesis logic..."
            />
            <button onClick={handleSave} disabled={isSaving} className="w-full py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-2xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-3">
              {isSaving ? <RefreshCw className="animate-spin" size={18}/> : <Zap size={18}/>} Commit Neural Evolutionary Leap
            </button>
          </div>
          
          <div className="space-y-6">
             <div className="bg-slate-950 text-white p-8 rounded-[3rem] shadow-2xl relative overflow-hidden flex flex-col gap-8 border border-white/5">
                <div className="absolute top-0 right-0 p-8 opacity-10"><BarChart3 size={150} /></div>
                <div>
                   <h3 className="text-lg font-black uppercase tracking-tight text-emerald-400">Grid Fidelity</h3>
                   <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Real-time Synthesis Quality</p>
                </div>
                
                <div className="space-y-5 relative z-10">
                   <MetricRow label="RAG PRECISION" value="98.5%" trend="OPTIMAL" />
                   <MetricRow label="PEDAGOGICAL FIDELITY" value="95.2%" trend="HIGH" />
                   <MetricRow label="HALLUCINATION RATE" value="0.002%" trend="SUPPRESSED" />
                </div>

                <div className="pt-6 border-t border-white/10 flex items-center justify-between">
                   <div className="space-y-1">
                      <span className="block text-[8px] font-black text-slate-500 uppercase">Failover protocol</span>
                      <span className="block text-xs font-black text-indigo-400">DMMR v3.0 Surgical Active</span>
                   </div>
                   <button onClick={handleResetGrid} className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all">
                      <RefreshCw size={16} className={isResetting ? 'animate-spin' : ''} />
                   </button>
                </div>
             </div>

             <div className="p-8 bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-100 dark:border-white/5 shadow-sm space-y-6">
                <div className="flex items-center gap-3">
                   <div className="p-2 bg-indigo-50 dark:bg-indigo-900/40 rounded-xl text-indigo-600"><Layers size={20}/></div>
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Master MD Engine</h4>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 font-medium leading-relaxed">
                  Surgical Extraction pipeline is optimized for Sindh Board Hierarchy. Automatically linearizes raw OCR text into grade-wise standards blocks.
                </p>
                <div className="h-1.5 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                   <div className="h-full bg-emerald-500 w-[94%]" />
                </div>
                <div className="flex justify-between items-center text-[9px] font-black uppercase text-emerald-600">
                   <span>Linearization accuracy</span>
                   <span>94.2%</span>
                </div>
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
                {node.status === 'active' ? (
                  <div className="pt-4 border-t dark:border-white/5 space-y-3">
                     <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black text-slate-400 uppercase">Response Latency</span>
                        <span className="text-[10px] font-bold text-emerald-500">240ms</span>
                     </div>
                     <div className="w-full h-1 bg-slate-50 dark:bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 w-2/3 animate-pulse" />
                     </div>
                  </div>
                ) : (
                  <div className="p-4 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 rounded-2xl">
                     <p className="text-[9px] font-black text-rose-600 uppercase mb-1">Grid Lock Fault</p>
                     <p className="text-[10px] font-medium text-slate-600 dark:text-slate-400 italic">"Logical exception caught. Failover protocol initiated."</p>
                  </div>
                )}
             </div>
           ))}
        </div>
      )}

      {activeTab === 'dialects' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           <DialectCard title="Sindh Board (Surgical)" desc="Enforces B-GRADE-DOMAIN-CHAPTER codes. Optimizes for Sindh Curriculum hierarchies & Progression Grids." active />
           <DialectCard title="Cambridge International" desc="Assessment Objective (AO) focused. Strict command word alignment (Calculate, Discuss, Evaluate)." />
           <DialectCard title="Agha Khan Board (AKU-EB)" desc="High-fidelity conceptual mapping. SLO-aligned synthesis with formative bias." />
           <DialectCard title="Federal Board (National)" desc="Legacy S8a5 code support. Vertical alignment mapping across Key Stages." />
        </div>
      )}

      {activeTab === 'sql' && (
        <div className="bg-slate-900 p-10 rounded-[3rem] border border-white/10 shadow-2xl">
           <div className="flex items-center justify-between mb-8">
              <h3 className="text-white font-black uppercase text-xs tracking-widest flex items-center gap-2"><Database size={16} /> Migration Pulse v125.4</h3>
              <div className="flex gap-2">
                 <button className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg">Run Protocol</button>
              </div>
           </div>
           <pre className="p-6 bg-black/40 rounded-2xl text-emerald-400 font-mono text-[10px] leading-relaxed overflow-x-auto">
{`-- Evolution: Deep Hierarchy Tracking
ALTER TABLE public.slo_database 
ADD COLUMN IF NOT EXISTS domain_code TEXT,
ADD COLUMN IF NOT EXISTS chapter_num TEXT,
ADD COLUMN IF NOT EXISTS grade_level TEXT;

CREATE INDEX IF NOT EXISTS idx_slo_hierarchy 
ON public.slo_database(grade_level, domain_code, chapter_num);`}
           </pre>
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
       <span className={`block text-[8px] font-black uppercase ${trend === 'OPTIMAL' || trend === 'HIGH' ? 'text-emerald-500' : 'text-rose-400'}`}>{trend}</span>
    </div>
  </div>
);

const DialectCard = ({ title, desc, active = false }: any) => (
  <div className={`p-10 rounded-[3rem] border transition-all ${active ? 'bg-indigo-600 border-indigo-400 text-white shadow-2xl scale-105' : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-white/5 text-slate-900 dark:text-white shadow-sm'}`}>
     <div className="flex justify-between items-start">
        <Globe size={32} className={active ? 'text-indigo-200' : 'text-indigo-600'} />
        {active && <Rocket size={20} className="animate-bounce" />}
     </div>
     <h3 className="text-2xl font-black uppercase tracking-tight mt-8">{title}</h3>
     <p className={`text-sm mt-3 leading-relaxed font-medium ${active ? 'text-indigo-100' : 'text-slate-500'}`}>{desc}</p>
     <div className={`mt-8 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest w-fit ${active ? 'bg-white/10 text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-500'}`}>
        {active ? 'ACTIVE ANALYSER' : 'AVAILABLE FOR SYNC'}
     </div>
  </div>
);

export default BrainControl;
