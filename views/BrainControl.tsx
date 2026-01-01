
import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, AlertCircle, CheckCircle2, Info, Database, Copy, Terminal, Activity, ShieldCheck, ShieldAlert, Trash2, Flame, Zap, Check } from 'lucide-react';
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
    const tables = [
      'profiles', 
      'documents', 
      'neural_brain', 
      'output_artifacts', 
      'feedback_events',
      'chat_messages',
      'usage_logs',
      'organizations',
      'master_prompt',
      'global_intelligence'
    ];
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
        is_active: true
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

  const sqlSchema = `-- Pedagogy Master - PERFORMANCE OPTIMIZATION v47
-- FOCUS: Resolving Auth RLS re-evaluation and purging duplicate indexes for high-scale performance.

-- 1. PURGE ALL LEGACY POLICIES (v37 - v46)
DO $$ 
DECLARE
    pol record;
BEGIN
    FOR pol IN (
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND (policyname ~ '^v[0-9]{2}_')
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
    END LOOP;
END $$;

-- 2. DUPLICATE INDEX PURGE (Linter 0009: Efficiency)
DROP INDEX IF EXISTS idx_chat_messages_doc_id_v45;
DROP INDEX IF EXISTS idx_messages_user_id;
DROP INDEX IF EXISTS idx_docs_user_id;
DROP INDEX IF EXISTS idx_documents_user_id;
DROP INDEX IF EXISTS idx_documents_user_id_v45;
DROP INDEX IF EXISTS idx_artifacts_user_id;
DROP INDEX IF EXISTS idx_usage_logs_user;

-- 3. ENSURE CLEAN UNIQUE INDEXES REMAIN
CREATE INDEX IF NOT EXISTS idx_v47_chat_messages_user_id ON public.chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_v47_chat_messages_doc_id ON public.chat_messages(document_id);
CREATE INDEX IF NOT EXISTS idx_v47_usage_logs_user_id ON public.usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_v47_curriculum_profiles_user_id ON public.curriculum_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_v47_output_artifacts_user_id ON public.output_artifacts(user_id);
CREATE INDEX IF NOT EXISTS idx_v47_documents_user_id ON public.documents(user_id);

-- 4. OPTIMIZED RLS POLICIES (Linter 0003: Auth Init Plan Optimization)
-- Using (SELECT auth.uid()) ensures the ID is cached during the query execution.

-- PROFILES
CREATE POLICY "v47_profiles_self" ON public.profiles 
FOR ALL TO authenticated 
USING (id = (SELECT auth.uid())) 
WITH CHECK (id = (SELECT auth.uid()));

-- DOCUMENTS
CREATE POLICY "v47_documents_self" ON public.documents 
FOR ALL TO authenticated 
USING (user_id = (SELECT auth.uid())) 
WITH CHECK (user_id = (SELECT auth.uid()));

-- CHAT MESSAGES
CREATE POLICY "v47_chat_messages_self" ON public.chat_messages 
FOR ALL TO authenticated 
USING (user_id = (SELECT auth.uid())) 
WITH CHECK (user_id = (SELECT auth.uid()));

-- USAGE LOGS
CREATE POLICY "v47_usage_logs_self" ON public.usage_logs 
FOR SELECT TO authenticated 
USING (user_id = (SELECT auth.uid()));

-- CURRICULUM PROFILES
CREATE POLICY "v47_curriculum_profiles_self" ON public.curriculum_profiles 
FOR ALL TO authenticated 
USING (user_id = (SELECT auth.uid())) 
WITH CHECK (user_id = (SELECT auth.uid()));

-- NEURAL BRAIN, MASTER PROMPT, GLOBAL INTEL (Static access)
CREATE POLICY "v47_neural_brain_read" ON public.neural_brain FOR SELECT TO authenticated USING (true);
CREATE POLICY "v47_master_prompt_read" ON public.master_prompt FOR SELECT TO authenticated USING (true);
CREATE POLICY "v47_global_intelligence_read" ON public.global_intelligence FOR SELECT TO authenticated USING (true);

-- 5. RPC ENGINE (Maintaining High-Speed registration)
CREATE OR REPLACE FUNCTION public.register_document(
  p_id uuid,
  p_user_id uuid,
  p_name text,
  p_file_path text,
  p_mime_type text,
  p_status text,
  p_subject text,
  p_grade_level text,
  p_slo_tags jsonb,
  p_created_at timestamp with time zone
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Optimized auth check
  IF (SELECT auth.uid()) <> p_user_id AND NOT (SELECT (auth.jwt() ->> 'email')::text IN ('mkgopang@gmail.com', 'admin@edunexus.ai', 'fasi.2001@live.com')) THEN
    RAISE EXCEPTION 'Unauthorized document registration.';
  END IF;

  INSERT INTO public.documents (
    id, user_id, name, file_path, mime_type, status, subject, grade_level, slo_tags, created_at
  ) VALUES (
    p_id, p_user_id, p_name, p_file_path, p_mime_type, p_status, p_subject, p_grade_level, p_slo_tags, p_created_at
  )
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    subject = EXCLUDED.subject,
    slo_tags = EXCLUDED.slo_tags;
END;
$$;

-- 6. PERMISSIONS REFRESH
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_document TO authenticated;
`;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Neural Brain Control</h1>
          <p className="text-slate-500 mt-1">Infrastructure diagnostics, RLS optimization, and index management.</p>
        </div>
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
          <button onClick={() => setActiveTab('logic')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'logic' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Logic</button>
          <button onClick={() => setActiveTab('infra')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'infra' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Infrastructure</button>
          <button onClick={() => setActiveTab('security')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'security' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Security</button>
        </div>
      </header>
      
      {activeTab === 'logic' && (
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-400 bg-white border border-slate-200 px-3 py-1 rounded-full">Active V{formData.version}.0</span>
              {showStatus && <div className="text-emerald-600 text-sm font-bold flex items-center gap-1"><CheckCircle2 size={14}/> Prompt Synchronized</div>}
            </div>
            <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all disabled:opacity-50">
              {isSaving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Save & Deploy V{formData.version + 1}
            </button>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center gap-2"><Info className="w-4 h-4 text-indigo-500" /><h3 className="text-sm font-bold text-slate-700">Adaptive Master Prompt Instructions</h3></div>
            <textarea 
              value={formData.masterPrompt} 
              onChange={(e) => setFormData({...formData, masterPrompt: e.target.value})} 
              className="w-full h-96 p-6 focus:outline-none font-mono text-sm leading-relaxed text-slate-800" 
              spellCheck={false} 
            />
          </div>
        </div>
      )}

      {activeTab === 'infra' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Database Table Health</h3>
            <button onClick={checkHealth} disabled={isChecking} className="text-xs font-bold text-indigo-600 flex items-center gap-1.5 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors">
              <RefreshCw size={14} className={isChecking ? 'animate-spin' : ''} />
              Check Status
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dbStatus.map((s) => (
              <div key={s.table} className={`p-4 rounded-xl border flex items-center justify-between ${s.exists ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <Database size={16} className={s.exists ? 'text-emerald-600' : 'text-slate-400'} />
                  <span className={`text-xs font-bold truncate ${s.exists ? 'text-slate-700' : 'text-slate-400'}`}>{s.table}</span>
                </div>
                {s.exists ? <CheckCircle2 size={14} className="text-emerald-500" /> : <AlertCircle size={14} className="text-slate-300" />}
              </div>
            ))}
          </div>

          <div className="bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl">
            <div className="p-4 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-300"><Terminal size={16} /><span className="text-xs font-mono font-bold uppercase">Performance Patch (v47)</span></div>
              <button onClick={() => {navigator.clipboard.writeText(sqlSchema); setCopiedSql(true); setTimeout(() => setCopiedSql(false), 2000);}} className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">{copiedSql ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} />}{copiedSql ? 'Copied' : 'Copy SQL'}</button>
            </div>
            <div className="p-6 overflow-x-auto bg-slate-950 max-h-80 overflow-y-auto custom-scrollbar"><pre className="text-indigo-300 font-mono text-[11px] leading-relaxed">{sqlSchema}</pre></div>
          </div>
        </div>
      )}

      {activeTab === 'security' && (
        <div className="space-y-6 max-w-4xl">
          <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
            <div className="flex items-center gap-3 text-indigo-600 mb-6">
              <ShieldCheck size={28} />
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">V47: Performance & Cleanup</h2>
            </div>
            <div className="p-6 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-start gap-4">
              <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl mt-1 shadow-sm"><Activity size={20}/></div>
              <div>
                <h3 className="font-bold text-indigo-900 tracking-tight">Optimizing RLS & Storage</h3>
                <p className="text-sm text-indigo-700 mt-1 mb-4 leading-relaxed">V47 resolves critical performance bottlenecks identified by the Supabase linter. By moving auth functions into subqueries, we prevent redundant computations for every row scanned.</p>
                <ul className="text-xs text-indigo-800 space-y-2 list-disc ml-4 font-medium">
                  <li><strong>Auth Subqueries:</strong> Replaced raw auth.uid() with (SELECT auth.uid()) in all active RLS policies.</li>
                  <li><strong>Duplicate Index Purge:</strong> Removed 7 identical indexes that were slowing down database write operations.</li>
                  <li><strong>Scale Readiness:</strong> Improved query initialization plans for profiles, documents, and chat messages.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BrainControl;
