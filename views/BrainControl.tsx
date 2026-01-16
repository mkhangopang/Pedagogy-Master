// Control Hub: Production Infrastructure
import React, { useState, useEffect } from 'react';
import { 
  RefreshCw, CheckCircle2, Copy, Zap, Check, 
  Database, ShieldCheck, Terminal, ShieldAlert, Lock, EyeOff, Scale
} from 'lucide-react';
import { NeuralBrain } from '../types';
import { supabase } from '../lib/supabase';

interface BrainControlProps {
  brain: NeuralBrain;
  onUpdate: (brain: NeuralBrain) => void;
}

const BrainControl: React.FC<BrainControlProps> = ({ brain, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'logic' | 'infra' | 'audit'>('logic');
  const [formData, setFormData] = useState(brain);
  const [isSaving, setIsSaving] = useState(false);
  const [dbStatus, setDbStatus] = useState<{table: string, exists: boolean | null}[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexStatus, setIndexStatus] = useState<string | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);

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

  const handleBulkIndex = async () => {
    if (!window.confirm("Initialize global neural synchronization?")) return;
    setIsIndexing(true);
    setIndexStatus("Syncing neural nodes...");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/admin/index-all-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` }
      });
      const data = await response.json();
      setIndexStatus(`✅ Success: ${data.message}`);
    } catch (err: any) { setIndexStatus(`❌ Error: ${err.message}`); } finally { setIsIndexing(false); }
  };

  useEffect(() => { if (activeTab === 'infra') checkHealth(); }, [activeTab]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('neural_brain').insert([{
        master_prompt: formData.masterPrompt,
        version: formData.version + 1,
        is_active: true
      }]);
      if (error) throw error;
      onUpdate({...formData, version: formData.version + 1, updatedAt: new Date().toISOString()});
      alert("Deployed.");
    } catch (err: any) { alert(`Error: ${err.message}`); } finally { setIsSaving(false); }
  };

  const sqlSchema = `-- EDUNEXUS AI: MASTER INFRASTRUCTURE SCHEMA v21.0
-- TARGET: Auth Resilience & High-Precision RAG

-- 1. ENABLE NEURAL VECTOR ENGINE
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. TABLES
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    name TEXT,
    email TEXT,
    role TEXT DEFAULT 'teacher',
    plan TEXT DEFAULT 'free',
    queries_used INTEGER DEFAULT 0,
    queries_limit INTEGER DEFAULT 30,
    generation_count INTEGER DEFAULT 0,
    success_rate DOUBLE PRECISION DEFAULT 0,
    active_doc_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'processing',
    extracted_text TEXT,
    file_path TEXT,
    storage_type TEXT DEFAULT 'r2',
    is_selected BOOLEAN DEFAULT FALSE,
    rag_indexed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES public.documents ON DELETE CASCADE,
    chunk_text TEXT NOT NULL,
    embedding vector(768),
    slo_codes TEXT[] DEFAULT '{}',
    chunk_index INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. THE NEURAL ENGINE: HYBRID SEARCH RPC v2 (ULTIMATE)
CREATE OR REPLACE FUNCTION hybrid_search_chunks_v2(
  query_embedding vector(768),
  match_count INT,
  filter_document_ids UUID[],
  priority_document_id UUID DEFAULT NULL,
  boost_tags TEXT[] DEFAULT '{}'
)
RETURNS TABLE (
  chunk_id UUID,
  chunk_text TEXT,
  slo_codes TEXT[],
  page_number INT,
  section_title TEXT,
  combined_score FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id AS chunk_id,
    dc.chunk_text,
    dc.slo_codes,
    (dc.metadata->>'page_number')::INT AS page_number,
    (dc.metadata->>'section_title') AS section_title,
    (
      (1 - (dc.embedding <=> query_embedding)) +
      CASE WHEN dc.slo_codes && boost_tags THEN 5.0 ELSE 0 END +
      CASE WHEN dc.document_id = priority_document_id THEN 0.5 ELSE 0 END
    ) AS combined_score
  FROM document_chunks dc
  WHERE dc.document_id = ANY(filter_document_ids)
  ORDER BY combined_score DESC
  LIMIT match_count;
END;
$$;

-- 4. RLS POLICIES
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own profile" ON profiles FOR ALL USING (auth.uid() = id);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own documents" ON documents FOR ALL USING (auth.uid() = user_id);

ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view chunks" ON document_chunks FOR SELECT 
USING (EXISTS (SELECT 1 FROM documents WHERE id = document_id AND user_id = auth.uid()));
`;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24 px-4">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 text-slate-900 dark:text-white">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3 tracking-tight">
            <ShieldCheck className="text-indigo-600" /> Control Hub
          </h1>
          <p className="text-slate-500 mt-1 font-medium italic">Neural Network Monitoring.</p>
        </div>
        <div className="flex bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-inner">
          {['logic', 'infra'].map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500'}`}
            >
              {tab === 'infra' ? 'Stack' : tab}
            </button>
          ))}
        </div>
      </header>

      {activeTab === 'logic' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] border border-slate-200 dark:border-white/10 shadow-sm space-y-6">
            <h2 className="text-xl font-bold flex items-center gap-2 dark:text-white">
              <Terminal size={20} className="text-indigo-500" /> Neural Logic (v{formData.version})
            </h2>
            <textarea 
              value={formData.masterPrompt}
              onChange={(e) => setFormData({...formData, masterPrompt: e.target.value})}
              className="w-full h-96 p-8 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-3xl font-mono text-xs leading-loose outline-none focus:ring-2 focus:ring-indigo-500 dark:text-indigo-300"
            />
            <button onClick={handleSave} disabled={isSaving} className="w-full py-5 bg-indigo-600 text-white rounded-[1.5rem] font-bold shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
              {isSaving ? <RefreshCw className="animate-spin" size={20}/> : <Zap size={20}/>} Deploy Core Logic
            </button>
          </div>
          <div className="bg-slate-900 text-white p-12 rounded-[3rem] flex flex-col justify-center shadow-2xl">
             <h3 className="text-2xl font-bold mb-4 tracking-tight text-emerald-400">RAG High Precision Active</h3>
             <p className="text-slate-400 text-sm leading-relaxed mb-8 font-medium">Authoritative Vault system is forcing AI synthesis over summarization.</p>
             <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                   <p className="text-[10px] font-bold text-slate-500 uppercase">Embedding Node</p>
                   <p className="text-sm font-bold">text-embedding-004</p>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                   <p className="text-[10px] font-bold text-slate-500 uppercase">Vector Dims</p>
                   <p className="text-sm font-bold">768</p>
                </div>
             </div>
          </div>
        </div>
      )}

      {activeTab === 'infra' && (
        <div className="space-y-8 animate-in slide-in-from-bottom-2">
          <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-sm">
            <div className="flex items-center justify-between mb-10">
               <h2 className="text-2xl font-bold flex items-center gap-3 dark:text-white"><Database size={24} className="text-indigo-600" /> Infrastructure</h2>
               <button onClick={checkHealth} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-all">{isChecking ? <RefreshCw className="animate-spin" /> : <RefreshCw />}</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {dbStatus.map((item, idx) => (
                <div key={idx} className={`p-6 rounded-2xl border flex flex-col gap-3 transition-all ${item.exists ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900 text-emerald-700 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-950/30 border-rose-100 dark:border-rose-900 text-rose-700 dark:text-rose-400 animate-pulse'}`}>
                  <span className="text-[10px] font-black uppercase tracking-widest">{item.table}</span>
                  {item.exists ? <CheckCircle2 size={24} /> : <ShieldAlert size={24} />}
                  <span className="font-bold text-sm">{item.exists ? 'SYNCED' : 'ERR_404'}</span>
                </div>
              ))}
            </div>
            <div className="mt-12 pt-10 border-t border-slate-100 dark:border-white/5 flex gap-4">
               <button onClick={handleBulkIndex} disabled={isIndexing} className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all flex items-center gap-3 shadow-xl">
                 {isIndexing ? <RefreshCw className="animate-spin" size={18} /> : <Database size={18} />} Sync Curriculum Nodes
               </button>
               {indexStatus && <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border text-xs font-medium text-slate-500 animate-in slide-in-from-left-4">{indexStatus}</div>}
            </div>
          </div>
          <div className="bg-slate-900 text-white p-10 rounded-[3rem] border border-slate-800 shadow-2xl space-y-8">
            <div className="flex justify-between items-center">
               <h3 className="text-xl font-bold tracking-tight">Supabase Neural Patch v21.0</h3>
               <button onClick={() => {navigator.clipboard.writeText(sqlSchema); setCopiedSql(true); setTimeout(()=>setCopiedSql(false), 2000)}} className="px-6 py-3 bg-slate-800 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-slate-700">
                 {copiedSql ? <Check size={16}/> : <Copy size={16}/>} {copiedSql ? 'Copied' : 'Copy SQL'}
               </button>
            </div>
            <pre className="bg-slate-950 p-8 rounded-2xl text-[12px] font-mono text-indigo-300 overflow-auto max-h-[500px] leading-relaxed scrollbar-hide">{sqlSchema}</pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default BrainControl;