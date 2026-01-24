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

  const masterSchemaSql = `-- EDUNEXUS AI: MASTER SECURITY & INFRASTRUCTURE v72.0
-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. PROFILES & IDENTITY SYNC
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
    tenant_config JSONB DEFAULT '{"primary_color": "#4f46e5", "brand_name": "EduNexus AI"}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. CURRICULUM ASSETS
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing',
    source_type TEXT NOT NULL,
    is_approved BOOLEAN DEFAULT true,
    is_selected BOOLEAN DEFAULT false,
    rag_indexed BOOLEAN DEFAULT false,
    extracted_text TEXT,
    file_path TEXT,
    storage_type TEXT DEFAULT 'r2',
    curriculum_name TEXT,
    authority TEXT,
    subject TEXT,
    grade_level TEXT,
    version_year TEXT,
    generated_json JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. RLS POLICIES (MANDATORY)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Profile Policies
CREATE POLICY "Users can only see own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can only edit own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Document Policies
CREATE POLICY "Users can only see own assets" ON public.documents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can only insert own assets" ON public.documents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can only delete own assets" ON public.documents FOR DELETE USING (auth.uid() = user_id);

-- 5. AUTO-SYNC TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role, plan, queries_limit)
  VALUES (NEW.id, NEW.email, split_part(NEW.email, '@', 1), 'teacher', 'free', 30)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: After Auth Signup
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();`;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const checkHealth = async () => {
    setIsChecking(true);
    const tables = ['profiles', 'documents', 'document_chunks', 'neural_brain', 'output_artifacts'];
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
            { id: 'schema', label: 'Security SQL' },
            { id: 'audit', label: 'Neural Audit' },
            { id: 'infra', label: 'Stack' },
            { id: 'rag', label: 'RAG' }
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
                    <div><h3 className="text-white font-black uppercase tracking-tight">Security SQL Script</h3><p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Run in Supabase Editor</p></div>
                 </div>
                 <button onClick={() => copyToClipboard(masterSchemaSql, 'schema')} className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-all">
                    {copiedId === 'schema' ? <Check size={12}/> : <Copy size={12}/>} Copy SQL
                 </button>
              </div>
              <div className="p-8 bg-black/40">
                 <pre className="text-[10px] font-mono text-emerald-400 leading-relaxed overflow-x-auto custom-scrollbar">
                    {masterSchemaSql}
                 </pre>
              </div>
           </div>
           <div className="p-6 bg-amber-50 dark:bg-amber-950/20 rounded-2xl border border-amber-100 dark:border-amber-900/30 flex items-center gap-4">
              <AlertCircle className="text-amber-500" size={24} />
              <p className="text-xs text-amber-800 dark:text-amber-400 font-medium"><b>Pro-Tip:</b> Always ensure RLS is enabled for any table storing user curriculum files to prevent cross-account leaks.</p>
           </div>
        </div>
      )}

      {activeTab === 'infra' && (
        <div className="space-y-6 animate-in slide-in-from-bottom-2">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-200 dark:border-white/5 shadow-sm">
            <div className="flex items-center justify-between mb-8">
               <h2 className="text-lg font-bold flex items-center gap-3 dark:text-white"><Database size={20} className="text-indigo-600" /> Stack Verification</h2>
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
        <div className="space-y-6 animate-in slide-in-from-bottom-2">
          <div className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-[2.5rem] border border-slate-200 dark:border-white/5 shadow-sm">
            <div className="flex items-center justify-between mb-6">
               <h2 className="text-lg font-bold flex items-center gap-3 dark:text-white"><Activity size={20} className="text-indigo-600" /> Semantic Health</h2>
               <div className="flex gap-2">
                 <button onClick={handleBulkIndex} disabled={isIndexing} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-50 shadow-lg"><HeartPulse size={12} /> Global Sync</button>
                 <button onClick={fetchRagHealth} disabled={isChecking} className="p-2 bg-slate-50 dark:bg-slate-800 rounded-xl hover:bg-slate-100">{isChecking ? <RefreshCw className="animate-spin" size={16}/> : <Search size={16}/>}</button>
               </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <HealthCard label="Verified" value={ragHealth?.summary?.healthy} status="good" icon={<CheckCircle2 size={14} />} />
              <HealthCard label="Faulty" value={ragHealth?.summary?.broken} status={ragHealth?.summary?.broken > 0 ? 'critical' : 'good'} icon={<ShieldAlert size={14} />} />
              <HealthCard label="Orphans" value={ragHealth?.summary?.orphanedChunks} status="warning" icon={<Layers size={14} />} />
              <div className={`p-4 rounded-2xl border flex flex-col gap-1 ${ragHealth?.extensionActive ? 'bg-indigo-50 border-indigo-100 text-indigo-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
                <span className="text-[8px] font-black uppercase tracking-widest opacity-60">Dimensions</span>
                <div className="text-sm font-black flex items-center gap-2"><Cpu size={14} /> {ragHealth?.actualDimensions || 768}D</div>
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
    status === 'good' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
    status === 'critical' ? 'bg-rose-50 border-rose-100 text-rose-700' :
    'bg-amber-50 border-amber-100 text-amber-700'
  }`}>
    <span className="text-[8px] font-black uppercase tracking-widest opacity-60 flex items-center gap-1.5">{icon} {label}</span>
    <div className="text-xl font-black">{value || 0}</div>
  </div>
);

export default BrainControl;