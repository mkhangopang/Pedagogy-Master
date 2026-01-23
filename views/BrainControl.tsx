// Control Hub: Production Infrastructure
import React, { useState, useEffect } from 'react';
import { 
  RefreshCw, CheckCircle2, Copy, Zap, Check, 
  Database, ShieldCheck, Terminal, ShieldAlert, AlertTriangle, Activity, Server, Search, Code, AlertCircle, Cpu, Layers, Rocket, Download, History, Sparkles, HeartPulse, FileCode, FileSearch, Shield
} from 'lucide-react';
import { NeuralBrain } from '../types';
import { supabase } from '../lib/supabase';

interface BrainControlProps {
  brain: NeuralBrain;
  onUpdate: (brain: NeuralBrain) => void;
}

const BrainControl: React.FC<BrainControlProps> = ({ brain, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'logic' | 'infra' | 'rag' | 'performance' | 'schema' | 'audit'>('logic');
  const [formData, setFormData] = useState(brain);
  const [isSaving, setIsSaving] = useState(false);
  const [dbStatus, setDbStatus] = useState<{table: string, exists: boolean | null}[]>([]);
  const [ragHealth, setRagHealth] = useState<any>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexStatus, setIndexStatus] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // MIGRATED FROM supabase_schema.sql
  const masterSchemaSql = `-- EDUNEXUS AI: MASTER INFRASTRUCTURE v65.0
-- 1. PROFILES & IDENTITY
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    role TEXT NOT NULL DEFAULT 'teacher',
    plan TEXT NOT NULL DEFAULT 'free',
    queries_used INTEGER DEFAULT 0,
    queries_limit INTEGER DEFAULT 30,
    generation_count INTEGER DEFAULT 0,
    success_rate DOUBLE PRECISION DEFAULT 0.0,
    grade_level TEXT,
    subject_area TEXT,
    teaching_style TEXT,
    pedagogical_approach TEXT,
    edit_patterns JSONB DEFAULT '{"avgLengthChange": 0, "examplesCount": 0, "structureModifications": 0}'::JSONB,
    tenant_config JSONB DEFAULT '{"primary_color": "#4f46e5", "brand_name": "EduNexus AI"}'::JSONB,
    active_doc_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. ACCESS POLICIES (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only view their own profile." ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own non-sensitive profile fields." ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- 3. NEURAL RECOVERY TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role, plan, queries_limit)
  VALUES (NEW.id, NEW.email, split_part(NEW.email, '@', 1), 'teacher', 'free', 30)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RPC TOOLS
CREATE OR REPLACE FUNCTION public.get_extension_status(ext TEXT) RETURNS BOOLEAN AS $$
BEGIN RETURN EXISTS (SELECT 1 FROM pg_extension WHERE extname = ext); END;
$$ LANGUAGE plpgsql SECURITY DEFINER;`;

  // MIGRATED FROM audit_report.json
  const auditReport = {
    "summary": "Production Validated (v2.0 Infrastructure)",
    "integrity_score": 94,
    "findings": "Admin emails transitioned to ENV / DB-Role architecture.",
    "recommendations": [
      "Implement Cross-Encoder re-ranker for top 5 precision.",
      "Integrate Redis (Upstash) for global rate limiting.",
      "Finalize automated teacher mastery reporting."
    ],
    "rag_optimization": "text-embedding-004 (768 dims) active with HNSW indexing."
  };

  const performanceSql = `-- EDUNEXUS AI: MASTER REPAIR & OPTIMIZATION (v46.0)
-- REPAIR AUTH TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role, plan, queries_limit)
  VALUES (NEW.id, NEW.email, split_part(NEW.email, '@', 1), 'teacher', 'free', 30)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ACCELERATE RETRIEVAL
CREATE INDEX IF NOT EXISTS idx_chunks_vector_hnsw ON public.document_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_chunks_slo_codes_gin ON document_chunks USING GIN (slo_codes);`;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const checkHealth = async () => {
    setIsChecking(true);
    const tables = ['profiles', 'documents', 'document_chunks', 'neural_brain', 'output_artifacts', 'slo_database', 'teacher_progress'];
    const status = await Promise.all(tables.map(async (table) => {
      try {
        const { error } = await supabase.from(table).select('id').limit(1);
        return { table, exists: !error || error.code !== '42P01' };
      } catch (e) { return { table, exists: false }; }
    }));
    setDbStatus(status);
    setIsChecking(false);
  };

  const fetchRagHealth = async () => {
    setIsChecking(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/admin/rag-health', { headers: { 'Authorization': `Bearer ${session.access_token}` } });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setRagHealth(data);
    } catch (e) { setError("Diagnostic node timeout."); } finally { setIsChecking(false); }
  };

  const handleBulkIndex = async () => {
    if (!window.confirm("Initialize global neural synchronization?")) return;
    setIsIndexing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/admin/index-all-documents', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` } });
      const data = await response.json();
      setIndexStatus(response.ok ? `✅ Success: ${data.message}` : `❌ Failed: ${data.error}`);
    } catch (err: any) { setIndexStatus("❌ Error"); } finally { setIsIndexing(false); }
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
      alert("DEPLOYED: Global behavioral grid updated.");
    } catch (err: any) { alert("Deployment error."); } finally { setIsSaving(false); }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24 px-2">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 text-slate-900 dark:text-white">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-3 tracking-tight">
            <ShieldCheck className="text-indigo-600" /> Neural Brain
          </h1>
          <p className="text-slate-500 text-xs font-medium italic mt-1">Infrastructure Control Node</p>
        </div>
        <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-inner overflow-x-auto scrollbar-hide">
          {[
            { id: 'logic', label: 'Logic' },
            { id: 'schema', label: 'Master Schema' },
            { id: 'audit', label: 'Neural Audit' },
            { id: 'infra', label: 'Stack' },
            { id: 'rag', label: 'RAG' },
            { id: 'performance', label: 'Repair' }
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
            <h2 className="text-lg font-bold flex items-center gap-2 dark:text-white"><Terminal size={18} className="text-indigo-500" /> Logic (v{formData.version})</h2>
            <textarea 
              value={formData.masterPrompt}
              onChange={(e) => setFormData({...formData, masterPrompt: e.target.value})}
              className="w-full h-80 p-6 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-2xl font-mono text-[10px] leading-relaxed outline-none focus:ring-2 focus:ring-indigo-500 dark:text-indigo-300 shadow-inner resize-none"
            />
            <button onClick={handleSave} disabled={isSaving} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
              {isSaving ? <RefreshCw className="animate-spin" size={18}/> : <Zap size={18}/>} Deploy Instructions
            </button>
          </div>
          <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] flex flex-col justify-center shadow-2xl relative overflow-hidden">
             <div className="absolute top-0 right-0 p-8 opacity-5"><Cpu size={150} /></div>
             <h3 className="text-xl font-bold mb-4 text-emerald-400 flex items-center gap-2"><Sparkles size={20}/> Behavioral Persistence</h3>
             <p className="text-slate-400 text-xs leading-relaxed mb-6">Instructional logic is shared across all synthesis nodes. Updates are near-instantaneous.</p>
             <div className="grid grid-cols-2 gap-3 relative z-10">
                <div className="p-4 bg-white/5 rounded-xl border border-white/5"><p className="text-[8px] font-bold text-slate-500 uppercase">Model</p><p className="text-xs font-bold text-indigo-400">Gemini 3 Pro</p></div>
                <div className="p-4 bg-white/5 rounded-xl border border-white/5"><p className="text-[8px] font-bold text-slate-500 uppercase">Context</p><p className="text-xs font-bold text-indigo-400">Curriculum Grounded</p></div>
             </div>
          </div>
        </div>
      )}

      {activeTab === 'schema' && (
        <div className="space-y-6 animate-in slide-in-from-bottom-2">
           <div className="bg-slate-900 rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden">
              <div className="p-8 border-b border-white/5 flex items-center justify-between">
                 <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-600 rounded-xl text-white"><FileCode size={20} /></div>
                    <div><h3 className="text-white font-black uppercase tracking-tight">Master SQL Blueprint</h3><p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">v65.0 Production</p></div>
                 </div>
                 <button onClick={() => copyToClipboard(masterSchemaSql, 'schema')} className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-all">
                    {copiedId === 'schema' ? <Check size={12}/> : <Copy size={12}/>} Copy Blueprint
                 </button>
              </div>
              <div className="p-8 bg-black/40">
                 <pre className="text-[10px] font-mono text-indigo-300 leading-relaxed overflow-x-auto custom-scrollbar">
                    {masterSchemaSql}
                 </pre>
              </div>
           </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="space-y-6 animate-in slide-in-from-bottom-2">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-white/5 shadow-sm">
                 <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl"><Shield size={20} /></div>
                    <h3 className="font-black text-slate-900 dark:text-white uppercase tracking-tight">Integrity Audit</h3>
                 </div>
                 <div className="text-6xl font-black text-indigo-600 mb-4">{auditReport.integrity_score}%</div>
                 <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{auditReport.summary}</p>
                 <div className="mt-8 space-y-3">
                    {auditReport.recommendations.map((rec, i) => (
                      <div key={i} className="flex gap-3 text-[10px] font-medium text-slate-600 dark:text-slate-400">
                         <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1 shrink-0" />
                         {rec}
                      </div>
                    ))}
                 </div>
              </div>

              <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden flex flex-col justify-between">
                 <div className="absolute top-0 right-0 p-8 opacity-10 text-indigo-400"><FileSearch size={120} /></div>
                 <div>
                    <h3 className="text-white font-black uppercase tracking-tight mb-2">RAG Optimization</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-6">Neural Search Metrics</p>
                    <p className="text-sm text-indigo-300 font-medium leading-relaxed">{auditReport.rag_optimization}</p>
                 </div>
                 <button onClick={() => copyToClipboard(JSON.stringify(auditReport, null, 2), 'audit-json')} className="mt-8 flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-all">
                    <FileSearch size={12} /> View Raw Trace
                 </button>
              </div>
           </div>
        </div>
      )}

      {activeTab === 'infra' && (
        <div className="space-y-6 animate-in slide-in-from-bottom-2">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-200 dark:border-white/5 shadow-sm">
            <div className="flex items-center justify-between mb-8">
               <h2 className="text-lg font-bold flex items-center gap-3 dark:text-white"><Database size={20} className="text-indigo-600" /> Infrastructure</h2>
               <button onClick={checkHealth} className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl">{isChecking ? <RefreshCw className="animate-spin" size={18}/> : <RefreshCw size={18}/>}</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {dbStatus.map((item, idx) => (
                <div key={idx} className={`p-4 rounded-2xl border flex flex-col gap-2 transition-all ${item.exists ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900 text-emerald-700' : 'bg-rose-50 dark:bg-rose-950/20 border-rose-100 dark:border-rose-900 text-rose-700 animate-pulse'}`}>
                  <span className="text-[8px] font-black uppercase tracking-widest truncate">{item.table}</span>
                  {item.exists ? <CheckCircle2 size={18} /> : <ShieldAlert size={18} />}
                  <span className="font-bold text-[10px]">{item.exists ? 'SYNCED' : 'MISSING'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'rag' && (
        <div className="space-y-6 animate-in slide-in-from-bottom-2">
          <div className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-[2.5rem] border border-slate-200 dark:border-white/5 shadow-sm">
            <div className="flex items-center justify-between mb-6">
               <h2 className="text-lg font-bold flex items-center gap-3 dark:text-white"><Activity size={20} className="text-indigo-600" /> RAG Diagnostics</h2>
               <div className="flex gap-2">
                 <button onClick={handleBulkIndex} disabled={isIndexing} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-50 shadow-lg"><HeartPulse size={12} /> Sync Grid</button>
                 <button onClick={fetchRagHealth} disabled={isChecking} className="p-2 bg-slate-50 dark:bg-slate-800 rounded-xl hover:bg-slate-100">{isChecking ? <RefreshCw className="animate-spin" size={16}/> : <Search size={16}/>}</button>
               </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <HealthCard label="Healthy" value={ragHealth?.summary?.healthy} status="good" icon={<CheckCircle2 size={14} />} />
              <HealthCard label="Broken" value={ragHealth?.summary?.broken} status={ragHealth?.summary?.broken > 0 ? 'critical' : 'good'} icon={<ShieldAlert size={14} />} />
              <HealthCard label="Orphans" value={ragHealth?.summary?.orphanedChunks} status="warning" icon={<Layers size={14} />} />
              <div className={`p-4 rounded-2xl border flex flex-col gap-1 ${ragHealth?.extensionActive ? 'bg-indigo-50 border-indigo-100 text-indigo-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
                <span className="text-[8px] font-black uppercase tracking-widest opacity-60">Vector</span>
                <div className="text-sm font-black flex items-center gap-2"><Cpu size={14} /> {ragHealth?.actualDimensions || 768}D {ragHealth?.extensionActive ? 'ON' : 'OFF'}</div>
              </div>
            </div>

            <div className="mt-8 p-6 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-100 dark:border-white/5">
               <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Neural Recovery Logic</h4>
               <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-4 italic">Use "Sync Grid" to re-calculate vector chunks for all documents if similarity scores are low or data nodes feel disconnected.</p>
               {indexStatus && <p className="text-[10px] font-bold text-indigo-600 animate-pulse">{indexStatus}</p>}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'performance' && (
        <div className="animate-in slide-in-from-bottom-2">
           <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] border border-white/10 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-5"><Rocket size={200} /></div>
              <div className="flex items-center gap-4 mb-6">
                 <div className="p-2.5 bg-emerald-500 rounded-xl text-white"><Rocket size={20} /></div>
                 <div><h2 className="text-xl font-black tracking-tight">System Repair Node</h2><p className="text-slate-400 text-[10px] font-medium">Apply logic repairs directly in Supabase Editor.</p></div>
              </div>
              <div className="p-6 bg-black/40 rounded-2xl border border-white/5 space-y-4">
                 <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Auth & Search Optimization</h3>
                    <button onClick={() => copyToClipboard(performanceSql, 'repair')} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-[8px] font-black uppercase tracking-widest">{copiedId === 'repair' ? 'Copied' : 'Copy SQL'}</button>
                 </div>
                 <pre className="text-[9px] font-mono text-emerald-300/70 overflow-x-auto scrollbar-hide bg-slate-950 p-4 rounded-xl leading-relaxed">
                    {performanceSql}
                 </pre>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

const HealthCard = ({ label, value, status, icon }: any) => (
  <div className={`p-4 rounded-2xl border flex flex-col gap-1 ${
    status === 'good' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
    status === 'critical' ? 'bg-rose-50 border-rose-100 text-rose-700' :
    'bg-amber-50 border-amber-100 text-amber-700'
  }`}>
    <span className="text-[8px] font-black uppercase tracking-widest opacity-60 flex items-center gap-1.5">{icon} {label}</span>
    <div className="text-xl font-black">{value || 0}</div>
  </div>
);

export default BrainControl;