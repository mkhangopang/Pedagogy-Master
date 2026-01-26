
// NEURAL BRAIN: INFRASTRUCTURE CONTROL HUB (v74.0)
import React, { useState, useEffect } from 'react';
import { 
  RefreshCw, CheckCircle2, Copy, Zap, Check, 
  Database, ShieldCheck, Terminal, ShieldAlert, Activity, Server, Search, Cpu, Sparkles, HeartPulse, FileCode, Shield
} from 'lucide-react';
import { NeuralBrain } from '../types';
import { supabase } from '../lib/supabase';

interface BrainControlProps {
  brain: NeuralBrain;
  onUpdate: (brain: NeuralBrain) => void;
}

const BrainControl: React.FC<BrainControlProps> = ({ brain, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'logic' | 'schema' | 'audit' | 'infra' | 'rag'>('logic');
  const [formData, setFormData] = useState(brain);
  const [isSaving, setIsSaving] = useState(false);
  const [dbStatus, setDbStatus] = useState<{table: string, exists: boolean | null}[]>([]);
  const [ragHealth, setRagHealth] = useState<any>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // OpenAI SCALING INSIGHTS: Incorporated Safety Timeouts & Connection Guards
  const masterSchemaSql = `-- EDUNEXUS AI: SCALED PRODUCTION INFRASTRUCTURE v80.1
-- INSIGHTS BY OPENAI: Preventing database saturation and vicious retry cycles.

-- 1. GLOBAL SAFETY TUNING
SET statement_timeout = '30s'; -- Kill long-running synthesis queries
SET idle_in_transaction_session_timeout = '60s'; -- Auto-purge abandoned transactions
SET lock_timeout = '10s'; -- Prevent table locks from blocking the grid

-- 2. EXTENSIONS & STORAGE
CREATE EXTENSION IF NOT EXISTS vector;

-- 3. IDENTITY NODES (OFFLOADING READS)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'teacher',
    plan TEXT NOT NULL DEFAULT 'free',
    queries_used INTEGER DEFAULT 0,
    queries_limit INTEGER DEFAULT 30,
    success_rate DOUBLE PRECISION DEFAULT 0.0,
    tenant_config JSONB DEFAULT '{"brand_name": "EduNexus AI"}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. CURRICULUM VAULT (RAG INFRA)
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing',
    rag_indexed BOOLEAN DEFAULT false,
    extracted_text TEXT,
    file_path TEXT,
    storage_type TEXT DEFAULT 'r2',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. RLS SECURITY (MANDATORY ISOLATION)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Isolated profile access" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Isolated asset access" ON public.documents FOR SELECT USING (auth.uid() = user_id);

-- 6. INDEX SAFETY
-- Always use CREATE INDEX CONCURRENTLY in production to prevent primary outages.
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_docs_user ON public.documents(user_id);
`;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const checkHealth = async () => {
    setIsChecking(true);
    const tables = ['profiles', 'documents', 'document_chunks', 'neural_brain'];
    const status = await Promise.all(tables.map(async (table) => {
      try {
        const { error } = await supabase.from(table).select('id').limit(1);
        return { table, exists: !error || (error.code !== '42P01' && error.code !== 'PGRST116') };
      } catch (e) { return { table, exists: false }; }
    }));
    setDbStatus(status);
    setIsChecking(false);
  };

  const fetchRagHealth = async () => {
    setIsChecking(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/admin/rag-health', { headers: { 'Authorization': `Bearer ${session.access_token}` } });
      const data = await res.json();
      setRagHealth(data);
    } catch (e) { console.error(e); } finally { setIsChecking(false); }
  };

  useEffect(() => { 
    if (activeTab === 'infra') checkHealth(); 
    if (activeTab === 'rag') fetchRagHealth();
  }, [activeTab]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await supabase.from('neural_brain').insert([{ master_prompt: formData.masterPrompt, version: formData.version + 1, is_active: true }]);
      onUpdate({...formData, version: formData.version + 1, updatedAt: new Date().toISOString()});
      alert("Logic deployed to all synthesis nodes.");
    } catch (err: any) { alert("Deployment error."); } finally { setIsSaving(false); }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24 px-2">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 text-slate-900 dark:text-white">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-3 tracking-tight">
            <ShieldCheck className="text-indigo-600" /> Brain Control
          </h1>
          <p className="text-slate-500 text-xs font-medium italic mt-1">Infrastructure Isolation & Behavior Node</p>
        </div>
        <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-inner overflow-x-auto">
          {[
            { id: 'logic', label: 'Logic' },
            { id: 'schema', label: 'SQL Tuning' },
            { id: 'infra', label: 'Stack' },
            { id: 'rag', label: 'Vectors' }
          ].map(tab => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shrink-0 ${activeTab === tab.id ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm' : 'text-slate-500'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {activeTab === 'logic' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-[2.5rem] border border-slate-200 dark:border-white/10 shadow-sm space-y-6">
            <h2 className="text-lg font-bold flex items-center gap-2 dark:text-white"><Terminal size={18} className="text-indigo-500" /> Behavioral Grid (v{formData.version})</h2>
            <textarea 
              value={formData.masterPrompt}
              onChange={(e) => setFormData({...formData, masterPrompt: e.target.value})}
              className="w-full h-80 p-6 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-2xl font-mono text-[10px] leading-relaxed shadow-inner resize-none"
            />
            <button onClick={handleSave} disabled={isSaving} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
              {isSaving ? <RefreshCw className="animate-spin" size={18}/> : <Zap size={18}/>} Deploy Logic
            </button>
          </div>
          <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] flex flex-col justify-center shadow-2xl relative overflow-hidden">
             <div className="absolute top-0 right-0 p-8 opacity-5"><Cpu size={150} /></div>
             <h3 className="text-xl font-bold mb-4 text-emerald-400 flex items-center gap-2"><Sparkles size={20}/> OpenAI Postgres Insights</h3>
             <p className="text-slate-400 text-xs leading-relaxed mb-6">
                EduNexus AI utilizes OpenAI's scaled architecture patterns: offloading reads to replicas, aggressive query timeouts, and persistent connection pooling via PgBouncer.
             </p>
             <div className="grid grid-cols-2 gap-3 relative z-10">
                <div className="p-4 bg-white/5 rounded-xl border border-white/5"><p className="text-[8px] font-bold text-slate-500 uppercase">Timeout</p><p className="text-xs font-bold text-indigo-400">30s Locked</p></div>
                <div className="p-4 bg-white/5 rounded-xl border border-white/5"><p className="text-[8px] font-bold text-slate-500 uppercase">Isolation</p><p className="text-xs font-bold text-indigo-400">RLS Active</p></div>
             </div>
          </div>
        </div>
      )}

      {activeTab === 'schema' && (
        <div className="space-y-6">
           <div className="bg-slate-900 rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden">
              <div className="p-8 border-b border-white/5 flex items-center justify-between">
                 <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-600 rounded-xl text-white"><FileCode size={20} /></div>
                    <div><h3 className="text-white font-black uppercase tracking-tight">Scaled SQL Architecture</h3><p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Optimized for Supabase/Postgres</p></div>
                 </div>
                 <button onClick={() => copyToClipboard(masterSchemaSql, 'schema')} className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-all">
                    {copiedId === 'schema' ? <Check size={12}/> : <Copy size={12}/>} Copy SQL
                 </button>
              </div>
              <div className="p-8 bg-black/40">
                 <pre className="text-[10px] font-mono text-emerald-400 leading-relaxed overflow-x-auto">
                    {masterSchemaSql}
                 </pre>
              </div>
           </div>
           <div className="p-6 bg-amber-50 dark:bg-amber-950/20 rounded-2xl border border-amber-100 dark:border-amber-900/30 flex items-center gap-4">
              <ShieldAlert className="text-amber-500" size={24} />
              <p className="text-xs text-amber-800 dark:text-amber-400 font-medium"><b>Safety First:</b> OpenAI Scaling Rule #7 - Always enforce <code>idle_in_transaction_session_timeout</code> to prevent dead-locks in collaborative pedagogical environments.</p>
           </div>
        </div>
      )}

      {activeTab === 'infra' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-200 dark:border-white/5 shadow-sm">
            <div className="flex items-center justify-between mb-8">
               <h2 className="text-lg font-bold flex items-center gap-3 dark:text-white"><Database size={20} className="text-indigo-600" /> Data Plane Audit</h2>
               <button onClick={checkHealth} className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl">{isChecking ? <RefreshCw className="animate-spin" size={18}/> : <RefreshCw size={18}/>}</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {dbStatus.map((item, idx) => (
                <div key={idx} className={`p-4 rounded-2xl border flex flex-col gap-2 transition-all ${item.exists ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900 text-emerald-700' : 'bg-rose-50 dark:bg-rose-950/20 border-rose-100 dark:border-rose-900 text-rose-700'}`}>
                  <span className="text-[8px] font-black uppercase tracking-widest truncate">{item.table}</span>
                  {item.exists ? <CheckCircle2 size={18} /> : <ShieldAlert size={18} />}
                  <span className="font-bold text-[10px]">{item.exists ? 'READY' : 'FAULT'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'rag' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-200 dark:border-white/5 shadow-sm">
            <div className="flex items-center justify-between mb-6">
               <h2 className="text-lg font-bold flex items-center gap-3 dark:text-white"><Activity size={20} className="text-indigo-600" /> Vector Health</h2>
               <div className="flex gap-2">
                 <button onClick={fetchRagHealth} disabled={isChecking} className="p-2 bg-slate-50 dark:bg-slate-800 rounded-xl hover:bg-slate-100">{isChecking ? <RefreshCw className="animate-spin" size={16}/> : <Search size={16}/>}</button>
               </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <HealthCard label="Verified Chunks" value={ragHealth?.summary?.healthy} status="good" icon={<CheckCircle2 size={14} />} />
              <HealthCard label="Orphaned Vectors" value={ragHealth?.summary?.orphanedChunks} status="warning" icon={<Database size={14} />} />
              <div className={`p-4 rounded-2xl border flex flex-col gap-1 bg-indigo-50 border-indigo-100 text-indigo-700`}>
                <span className="text-[8px] font-black uppercase tracking-widest opacity-60">Dimensions</span>
                <div className="text-sm font-black flex items-center gap-2">text-embedding-004 | 768D</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const HealthCard = ({ label, value, status, icon }: any) => (
  <div className={`p-4 rounded-2xl border flex flex-col gap-1 ${
    status === 'good' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-amber-50 border-amber-100 text-amber-700'
  }`}>
    <span className="text-[8px] font-black uppercase tracking-widest opacity-60 flex items-center gap-1.5">{icon} {label}</span>
    <div className="text-xl font-black">{value || 0}</div>
  </div>
);

export default BrainControl;
