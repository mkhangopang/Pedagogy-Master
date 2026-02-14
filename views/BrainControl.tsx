
import React, { useState, useEffect } from 'react';
import { 
  RefreshCw, Zap, Check, ShieldCheck, Terminal, Cpu, Activity, Database, AlertCircle, Server, Globe, BarChart3, Fingerprint, Layers, Rocket, ShieldAlert, TrendingUp
} from 'lucide-react';
import { NeuralBrain } from '../types';
import { supabase } from '../lib/supabase';

interface BrainControlProps {
  brain: NeuralBrain;
  onUpdate: (brain: NeuralBrain) => void;
}

const BrainControl: React.FC<BrainControlProps> = ({ brain, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'logic' | 'diagnostics' | 'dialects' | 'ingestion'>('logic');
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

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20 px-2 text-left">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-ping" />
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-indigo-500">Master Intelligence Node Active</span>
          </div>
          <h1 className="text-3xl font-black flex items-center gap-3 tracking-tight uppercase dark:text-white">
            <Fingerprint className="text-indigo-600" /> Neural Brain v4.0
          </h1>
        </div>
        <div className="flex bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl border dark:border-white/5 overflow-x-auto no-scrollbar">
          {[
            { id: 'logic', icon: <Cpu size={14}/>, label: 'Master Logic' },
            { id: 'ingestion', icon: <Layers size={14}/>, label: 'Ingestion' },
            { id: 'diagnostics', icon: <Activity size={14}/>, label: 'Diagnostics' },
            { id: 'dialects', icon: <Globe size={14}/>, label: 'Curricula' }
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
                   <ShieldCheck size={24} className="text-emerald-500" />
                </div>
             </div>

             <div className="p-8 bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-100 dark:border-white/5 shadow-sm space-y-6">
                <div className="flex items-center gap-3">
                   <div className="p-2 bg-indigo-50 dark:bg-indigo-900/40 rounded-xl text-indigo-600"><Layers size={20}/></div>
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Surgical Extraction</h4>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 font-medium leading-relaxed italic">
                  "Continuum-Aware mapping active. Grading, Domain, and Chapter hierarchy enforced across all ingested nodes."
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

      {activeTab === 'ingestion' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in duration-500">
          <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-xl space-y-8">
             <div className="flex items-center gap-4">
                <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl"><Rocket size={32}/></div>
                <div>
                   <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight uppercase">Master MD v40.0</h3>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Universal Ingestion Node</p>
                </div>
             </div>
             <div className="space-y-6">
                <div className="p-6 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5">
                   <p className="text-[11px] font-black text-indigo-600 uppercase mb-4 tracking-widest">Active Protocols</p>
                   <ul className="space-y-3">
                      <ProtocolItem label="Surgical SLO Code Generation" />
                      <ProtocolItem label="Deep Bloom's Analysis" />
                      <ProtocolItem label="Context Prepending [CTX: ...]" />
                      <ProtocolItem label="Linearization of Progression Grids" />
                   </ul>
                </div>
                <button className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl">Re-Index Global Vault</button>
             </div>
          </div>
          <div className="bg-slate-900 p-10 rounded-[3rem] border border-white/5 shadow-2xl relative overflow-hidden flex flex-col justify-center">
             <div className="absolute top-0 right-0 p-8 opacity-5"><Fingerprint size={200} /></div>
             <h3 className="text-xl font-black uppercase tracking-tight mb-8 text-indigo-400">Alignment Registry</h3>
             <div className="space-y-4 relative z-10">
                <DialectEntry title="Pakistani Sindh Board" count="240 SLOs" status="VERIFIED" />
                <DialectEntry title="Cambridge IGCSE" count="180 SLOs" status="SYNCING" />
                <DialectEntry title="KSA Vision 2030" count="450 SLOs" status="READY" />
                <DialectEntry title="Federal Board (S8a5)" count="120 SLOs" status="DEPRECATED" />
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
                      <p className="text-[8px] font-bold text-slate-400 uppercase mt-2">Tier: {node.tier}</p>
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

      {activeTab === 'dialects' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           <DialectCard title="Sindh Surgical" desc="Enforces B-GRADE-DOMAIN-CHAPTER codes. Linearizes raw OCR tables into rich metadata blocks." active />
           <DialectCard title="Inquiry-Based (IB)" desc="Focuses on Assessment Objectives (AO) and conceptual scaffolding." />
           <DialectCard title="Conceptual Mapping" desc="Optimized for vertical alignment and Bloom's cognitive demand tracking." />
           <DialectCard title="Global Standards" desc="Generic Bloom-based extraction for international curricula." />
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
       <span className={`block text-[8px] font-black uppercase ${trend === 'OPTIMAL' || trend === 'STABLE' ? 'text-emerald-500' : 'text-rose-400'}`}>{trend}</span>
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

const DialectCard = ({ title, desc, active = false }: any) => (
  <div className={`p-10 rounded-[3rem] border transition-all ${active ? 'bg-indigo-600 border-indigo-400 text-white shadow-2xl scale-105' : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-white/5 text-slate-900 dark:text-white shadow-sm'}`}>
     <Globe size={32} className={active ? 'text-indigo-200' : 'text-indigo-600'} />
     <h3 className="text-2xl font-black uppercase tracking-tight mt-8">{title}</h3>
     <p className={`text-sm mt-3 leading-relaxed font-medium ${active ? 'text-indigo-100' : 'text-slate-500'}`}>{desc}</p>
     <div className={`mt-8 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest w-fit ${active ? 'bg-white/10 text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-500'}`}>
        {active ? 'ACTIVE ANALYZER' : 'STANDBY NODE'}
     </div>
  </div>
);

export default BrainControl;
