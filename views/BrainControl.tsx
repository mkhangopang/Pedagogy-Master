import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, AlertCircle, CheckCircle2, Copy, Zap, Check, Database, Terminal, ShieldCheck } from 'lucide-react';
import { NeuralBrain } from '../types';
import { supabase } from '../lib/supabase';

interface BrainControlProps {
  brain: NeuralBrain;
  onUpdate: (brain: NeuralBrain) => void;
}

const BrainControl: React.FC<BrainControlProps> = ({ brain, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'logic' | 'infra' | 'security'>('logic');
  const [formData, setFormData] = useState(brain);
  const [isSaving, setIsSaving] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [dbStatus, setDbStatus] = useState<{table: string, exists: boolean | null}[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  const checkHealth = async () => {
    setIsChecking(true);
    const tables = ['profiles', 'documents', 'neural_brain', 'output_artifacts'];
    const status = await Promise.all(tables.map(async (table) => {
      try {
        const { error } = await supabase.from(table).select('id').limit(1);
        const exists = !error || (error.code !== '42P01');
        return { table, exists };
      } catch (e) {
        return { table, exists: false };
      }
    }));
    setDbStatus(status);
    setIsChecking(false);
  };

  useEffect(() => {
    if (activeTab === 'infra') checkHealth();
  }, [activeTab]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase.from('neural_brain').insert([{
        master_prompt: formData.masterPrompt,
        bloom_rules: formData.bloomRules,
        version: formData.version + 1,
        isActive: true
      }]);
      if (error) throw error;
      onUpdate({...formData, version: formData.version + 1, updatedAt: new Date().toISOString()});
      setShowStatus(true);
      setTimeout(() => setShowStatus(false), 3000);
    } catch (err: any) {
      alert(`Deployment Error: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const sqlSchema = `-- Pedagogy Master - INFRASTRUCTURE PATCH v60 (R2 ULTIMATE)
-- ============================================
-- 1. PURGE LEGACY BUCKET METADATA
-- ============================================
-- Completely ignore 'storage.buckets' or 'storage.objects'
-- We handle our own lifecycle via Cloudflare R2

-- ============================================
-- 2. METADATA SCHEMA REINFORCEMENT
-- ============================================
ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'ready';

-- ============================================
-- 3. VERSIONLESS INDEXING (LINTER FIX)
-- ============================================
DROP INDEX IF EXISTS idx_pedagogy_docs_user_id;
DROP INDEX IF EXISTS idx_pedagogy_docs_date;
DROP INDEX IF EXISTS idx_r2_file_path;

CREATE INDEX IF NOT EXISTS idx_docs_v60_uid ON public.documents(user_id);
CREATE INDEX IF NOT EXISTS idx_docs_v60_date ON public.documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_docs_v60_path ON public.documents(file_path);

-- ============================================
-- 4. RLS SHIELD (SUBQUERY OPTIMIZED)
-- ============================================
DROP POLICY IF EXISTS "v59_documents_access" ON public.documents;
DROP POLICY IF EXISTS "v59_profiles_access" ON public.profiles;

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v60_documents_access" ON public.documents FOR ALL TO authenticated 
USING (user_id = (SELECT auth.uid())) 
WITH CHECK (user_id = (SELECT auth.uid()));

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v60_profiles_access" ON public.profiles FOR ALL TO authenticated 
USING (id = (SELECT auth.uid())) 
WITH CHECK (id = (SELECT auth.uid()));

-- ============================================
-- 5. FINAL ANALYZE
-- ============================================
ANALYZE public.documents;
ANALYZE public.profiles;
`;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Neural Brain Control</h1>
          <p className="text-slate-500 mt-1">SaaS Infrastructure Diagnostics, Patch v60.</p>
        </div>
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl shadow-inner border border-slate-200">
          <button onClick={() => setActiveTab('logic')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'logic' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Logic</button>
          <button onClick={() => setActiveTab('infra')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'infra' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Infrastructure</button>
        </div>
      </header>
      
      {activeTab === 'logic' && (
        <div className="space-y-8 animate-in slide-in-from-right duration-500">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-400 bg-white border border-slate-200 px-3 py-1 rounded-full shadow-sm">Active V{formData.version}.0</span>
              {showStatus && <div className="text-emerald-600 text-sm font-bold flex items-center gap-1"><CheckCircle2 size={14}/> Prompt Ready</div>}
            </div>
            <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all disabled:opacity-50 active:scale-95">
              {isSaving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Deploy Logic V{formData.version + 1}
            </button>
          </div>
          <textarea 
            value={formData.masterPrompt} 
            onChange={(e) => setFormData({...formData, masterPrompt: e.target.value})} 
            className="w-full h-[32rem] p-8 border border-slate-200 rounded-2xl focus:outline-none font-mono text-sm leading-loose text-slate-800 bg-slate-50/10 shadow-xl" 
            spellCheck={false} 
          />
        </div>
      )}

      {activeTab === 'infra' && (
        <div className="space-y-8 animate-in slide-in-from-right duration-500">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2"><Database size={16} className="text-indigo-500" /> Infrastructure Node Status</h3>
            <button onClick={checkHealth} disabled={isChecking} className="text-xs font-bold text-indigo-600 flex items-center gap-1.5 hover:bg-indigo-50 px-4 py-2 rounded-xl transition-all border border-indigo-100 shadow-sm">
              <RefreshCw size={14} className={isChecking ? 'animate-spin' : ''} />
              Scan Tables
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {dbStatus.map((s) => (
              <div key={s.table} className={`p-5 rounded-[1.5rem] border-2 flex items-center justify-between ${s.exists ? 'bg-white border-emerald-100' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${s.exists ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}><Database size={18} /></div>
                  <span className="text-sm font-black tracking-tight uppercase">{s.table}</span>
                </div>
                {s.exists ? <CheckCircle2 size={18} className="text-emerald-500" /> : <AlertCircle size={18} className="text-slate-300" />}
              </div>
            ))}
          </div>
          <div className="bg-slate-900 rounded-[2.5rem] overflow-hidden border border-slate-800 shadow-2xl relative">
            <div className="p-6 bg-slate-800/50 border-b border-slate-700 flex items-center justify-between backdrop-blur-md">
              <div className="flex items-center gap-3 text-slate-300"><Zap size={18} className="text-amber-400" /><span className="text-xs font-mono font-bold uppercase tracking-[0.2em]">R2 Infrastructure Patch (v60)</span></div>
              <button onClick={() => {navigator.clipboard.writeText(sqlSchema); setCopiedSql(true); setTimeout(() => setCopiedSql(false), 2000);}} className="text-xs font-black text-white bg-indigo-600 px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-indigo-500 transition-all">{copiedSql ? <Check size={14} /> : <Copy size={14} />}{copiedSql ? 'Copied' : 'Copy SQL'}</button>
            </div>
            <div className="p-8 overflow-x-auto bg-slate-950 max-h-96 overflow-y-auto custom-scrollbar"><pre className="text-indigo-300 font-mono text-[11px] leading-loose">{sqlSchema}</pre></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BrainControl;
