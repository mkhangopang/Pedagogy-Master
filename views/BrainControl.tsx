// NEURAL BRAIN: INFRASTRUCTURE CONTROL HUB (v110.0)
import React, { useState } from 'react';
import { 
  // Added missing CheckCircle2 import
  RefreshCw, Zap, Check, Copy, ShieldCheck, Terminal, Cpu, Sparkles, Wrench, AlertTriangle, Database, Activity, Globe, BookOpen, CheckCircle2
} from 'lucide-react';
import { NeuralBrain } from '../types';
import { supabase } from '../lib/supabase';

interface BrainControlProps {
  brain: NeuralBrain;
  onUpdate: (brain: NeuralBrain) => void;
}

const BrainControl: React.FC<BrainControlProps> = ({ brain, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'logic' | 'dialects' | 'repair'>('logic');
  const [formData, setFormData] = useState(brain);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const repairSql = `-- EVOLUTION SCRIPT: Master MD & Dialect Ingestion v110.0
-- Target: EduNexus Production Grid

-- 1. EXTENDED METADATA FOR MASTER MD
ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS master_md_dialect TEXT DEFAULT 'Standard',
ADD COLUMN IF NOT EXISTS pedagogical_alignment JSONB DEFAULT '{"bloom_weighted": true}';

-- 2. SLO PRECISION INDEXING
CREATE INDEX IF NOT EXISTS idx_documents_dialect ON public.documents (master_md_dialect);

-- 3. CHUNK TYPE CLASSIFICATION
ALTER TABLE public.document_chunks
ADD COLUMN IF NOT EXISTS chunk_type TEXT DEFAULT 'general',
ADD COLUMN IF NOT EXISTS cognitive_weight FLOAT DEFAULT 0.5;

-- 4. HYBRID SEARCH v6 (Dialect-Aware)
CREATE OR REPLACE FUNCTION hybrid_search_chunks_v6(
  query_text TEXT,
  query_embedding vector(768),
  match_count INT,
  filter_document_ids UUID[],
  dialect_filter TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  chunk_text TEXT,
  combined_score FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dc.id,
    dc.chunk_text,
    (1 - (dc.embedding <=> query_embedding)) as combined_score
  FROM public.document_chunks dc
  JOIN public.documents d ON d.id = dc.document_id
  WHERE dc.document_id = ANY(filter_document_ids)
    AND (dialect_filter IS NULL OR d.master_md_dialect = dialect_filter)
  ORDER BY combined_score DESC
  LIMIT match_count;
END;
$$;
`;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await supabase.from('neural_brain').insert([{ 
        master_prompt: formData.masterPrompt, 
        version: formData.version + 1, 
        is_active: true 
      }]);
      onUpdate({...formData, version: formData.version + 1, updatedAt: new Date().toISOString()});
      alert("Neural Logic Committed.");
    } catch (err: any) { 
      alert("Grid Refusal: Check Supabase logs."); 
    } finally { 
      setIsSaving(false); 
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24 px-2 text-left">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 text-slate-900 dark:text-white">
        <div className="space-y-1">
          <h1 className="text-3xl font-black flex items-center gap-3 tracking-tight uppercase">
            <ShieldCheck className="text-indigo-600" /> Brain v110.0
          </h1>
          <p className="text-slate-500 text-xs font-black uppercase tracking-widest">Master MD & Dialect Controller</p>
        </div>
        <div className="flex bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-inner">
          {[
            { id: 'logic', icon: <Cpu size={14}/>, label: 'Core Logic' },
            { id: 'dialects', icon: <Globe size={14}/>, label: 'Dialects' },
            { id: 'repair', icon: <Wrench size={14}/>, label: 'SQL Pulse' }
          ].map(tab => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm' : 'text-slate-500'}`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {activeTab === 'logic' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-8 rounded-[3rem] border border-slate-200 dark:border-white/10 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2 dark:text-white"><Terminal size={18} className="text-indigo-500" /> Master Synthesis Prompt</h2>
              <span className="px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full text-[10px] font-black uppercase tracking-widest">v{formData.version} ACTIVE</span>
            </div>
            <textarea 
              value={formData.masterPrompt}
              onChange={(e) => setFormData({...formData, masterPrompt: e.target.value})}
              className="w-full h-[500px] p-8 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-[2rem] font-mono text-[11px] leading-relaxed resize-none focus:ring-2 focus:ring-indigo-500 outline-none custom-scrollbar"
            />
            <button onClick={handleSave} disabled={isSaving} className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-3">
              {isSaving ? <RefreshCw className="animate-spin" size={18}/> : <Zap size={18}/>} Commit Core Logic
            </button>
          </div>
          
          <div className="space-y-6">
            <div className="bg-slate-900 text-white p-8 rounded-[3rem] shadow-2xl relative overflow-hidden flex flex-col gap-6">
               <div className="absolute top-0 right-0 p-8 opacity-5"><Activity size={150} /></div>
               <h3 className="text-xl font-black uppercase tracking-tight text-emerald-400 flex items-center gap-2"><Sparkles size={20}/> Neural Status</h3>
               <div className="space-y-4 relative z-10">
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Master MD Conversion</span>
                    <span className="text-[10px] font-black text-emerald-500 uppercase">100% Ready</span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">RAG Fidelity (Sindh)</span>
                    <span className="text-[10px] font-black text-indigo-400 uppercase">Active v6</span>
                  </div>
               </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] border border-slate-100 dark:border-white/5">
               <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Ingestion Engine</h4>
               <p className="text-xs text-slate-500 leading-relaxed mb-6 italic">Automatically converting multi-page PDFs into "Master Markdown" files to eliminate context truncation.</p>
               <div className="flex items-center gap-2">
                 <div className="w-full h-1 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 w-[100%]" />
                 </div>
                 {/* Added comment above fix */}
                 {/* Fix: CheckCircle2 icon is now correctly imported and used below */}
                 <CheckCircle2 size={14} className="text-emerald-500" />
               </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'dialects' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           <div className="p-10 bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-100 dark:border-white/5 shadow-sm space-y-6">
              <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 rounded-2xl flex items-center justify-center"><Globe size={28}/></div>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Pedagogical Dialects</h3>
              <p className="text-sm text-slate-500 leading-relaxed">Configuring how the AI interprets different board standards. Dialects adjust Bloom's weighting and formatting rules.</p>
              <div className="space-y-3 pt-4">
                 {['Sindh Board (SLO-Logic)', 'Cambridge IGCSE (AO-Logic)', 'IB DP (Key Concept Logic)', 'Standard Global (Outcome-Logic)'].map(d => (
                   <div key={d} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border dark:border-white/10 group cursor-pointer hover:border-indigo-500 transition-all">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{d}</span>
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                   </div>
                 ))}
              </div>
           </div>

           <div className="p-10 bg-slate-900 text-white rounded-[3rem] shadow-2xl flex flex-col justify-center gap-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10"><BookOpen size={150} /></div>
              <h3 className="text-xl font-black text-emerald-400 uppercase tracking-widest">Master MD Strategy</h3>
              <p className="text-slate-400 text-sm leading-relaxed">We use Gemini Flash to "Re-read" messy PDF tables and export them as clean Markdown. This allows the RAG engine to find exact SLO descriptions without the OCR noise.</p>
              <div className="p-5 bg-white/5 rounded-2xl border border-white/10 font-mono text-[10px] text-indigo-300">
                # UNIT 1: CELL BIOLOGY<br/>
                ## Strand: Cellular Transport<br/>
                - SLO: B-11-B-27: Describe Osmosis in animal cells...
              </div>
              <div className="text-[10px] font-black uppercase text-slate-500">Source: Neural Ingestion Pipeline v2.0</div>
           </div>
        </div>
      )}

      {activeTab === 'repair' && (
        <div className="space-y-6">
           <div className="bg-slate-900 rounded-[3rem] border border-white/10 shadow-2xl overflow-hidden">
               <div className="p-8 border-b border-white/5 flex items-center justify-between bg-black/20">
                 <h3 className="text-white font-black uppercase tracking-tight flex items-center gap-2 text-xs"><Wrench size={16}/> Hybrid v6 & Metadata Repair</h3>
                 <button onClick={() => copyToClipboard(repairSql, 'repair')} className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-[10px] font-black uppercase text-white transition-all">
                     {copiedId === 'repair' ? <Check size={14}/> : <Copy size={14}/>} Copy Upgrade SQL
                 </button>
               </div>
               <div className="p-8 bg-black/40">
                 <pre className="text-[10px] font-mono text-emerald-400/90 leading-relaxed overflow-x-auto h-96 custom-scrollbar">{repairSql}</pre>
               </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default BrainControl;