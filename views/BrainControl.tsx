import React, { useState } from 'react';
import { 
  RefreshCw, Zap, Check, Copy, ShieldCheck, Terminal, Cpu, Sparkles, Wrench, Globe, BookOpen, CheckCircle2, Activity, Database
} from 'lucide-react';
import { NeuralBrain } from '../types';
import { supabase } from '../lib/supabase';

interface BrainControlProps {
  brain: NeuralBrain;
  onUpdate: (brain: NeuralBrain) => void;
}

const BrainControl: React.FC<BrainControlProps> = ({ brain, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'logic' | 'dialects' | 'sql'>('logic');
  const [formData, setFormData] = useState(brain);
  const [isSaving, setIsSaving] = useState(false);

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

  const migrationSql = `-- EVOLUTION v115: Master MD & Hard-Lock Integration
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS master_md_dialect TEXT DEFAULT 'Standard';
ALTER TABLE public.document_chunks ADD COLUMN IF NOT EXISTS cognitive_tier TEXT;
CREATE INDEX IF NOT EXISTS idx_docs_dialect ON public.documents(master_md_dialect);`;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20 px-2 text-left">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-black flex items-center gap-3 tracking-tight uppercase dark:text-white">
            <ShieldCheck className="text-indigo-600" /> Brain v115.0
          </h1>
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Master MD Control Grid</p>
        </div>
        <div className="flex bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl border dark:border-white/5">
          {[
            { id: 'logic', icon: <Cpu size={14}/>, label: 'Logic' },
            { id: 'dialects', icon: <Globe size={14}/>, label: 'Dialects' },
            { id: 'sql', icon: <Terminal size={14}/>, label: 'SQL Pulse' }
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm' : 'text-slate-500'}`}>
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
                <h3 className="text-lg font-black uppercase tracking-tight text-emerald-400">Neural Status</h3>
                <div className="space-y-4 relative z-10">
                   <StatusRow label="Master MD Converter" status="Operational" />
                   <StatusRow label="Hard-Lock RAG" status="Active" color="text-indigo-400" />
                   <StatusRow label="Dialect Ingestion" status="Ready" />
                </div>
             </div>

             <div className="p-8 bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-100 dark:border-white/5">
                <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-4">Ingestion Engine</h4>
                <p className="text-xs text-slate-500 italic leading-relaxed">System now automatically transforms garbled PDF extractions into Structured Master MD nodes before indexing.</p>
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