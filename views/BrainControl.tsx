import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, AlertCircle, CheckCircle2, Info, Database, Copy, Terminal, Activity, ShieldCheck, ShieldAlert } from 'lucide-react';
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
      'master_prompt',
      'output_artifacts', 
      'feedback_events',
      'organizations',
      'chat_messages',
      'usage_logs',
      'curriculum_profiles'
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

  const sqlSchema = `-- Pedagogy Master - ENTERPRISE OPTIMIZED SECURITY PATCH v31
-- FOCUS: RLS Plan Optimization, Document Policy Consolidation, and Multi-Role Cleanup.

-- 1. HIGH-PERFORMANCE SECURITY HELPER
-- Implements SECURITY DEFINER with fixed search_path to resolve linter warnings.
-- Utilizes subquery patterns for Postgres query planner stability.
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS boolean 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_user_id uuid;
    user_email text;
BEGIN
  -- Performance: Resolve auth.uid() once
  current_user_id := (SELECT auth.uid());
  user_email := auth.jwt() ->> 'email';
  
  -- PRIMARY ADMIN FAIL-SAFE (Hardcoded Persistence)
  IF user_email = 'mkgopang@gmail.com' THEN
    RETURN true;
  END IF;

  -- DATABASE ROLE CHECK
  RETURN EXISTS (
    SELECT 1 
    FROM public.profiles 
    WHERE id = current_user_id 
    AND role = 'app_admin'
  );
END;
$$;

-- 2. SCHEMA CONFORMITY
-- Ensures every table has the necessary columns for RLS and ownership tracking.
DO $$ 
BEGIN
    -- profiles
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='role') THEN
        ALTER TABLE public.profiles ADD COLUMN role text DEFAULT 'teacher';
    END IF;

    -- documents
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='user_id') THEN
        ALTER TABLE public.documents ADD COLUMN user_id uuid REFERENCES auth.users ON DELETE CASCADE;
    END IF;

    -- chat_messages
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='chat_messages' AND column_name='user_id') THEN
        ALTER TABLE public.chat_messages ADD COLUMN user_id uuid REFERENCES auth.users ON DELETE CASCADE;
    END IF;

    -- usage_logs
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='usage_logs' AND column_name='user_id') THEN
        ALTER TABLE public.usage_logs ADD COLUMN user_id uuid REFERENCES auth.users ON DELETE CASCADE;
    END IF;
END $$;

-- 3. GLOBAL RLS RESET
-- Clears all fragmented/recursive policies before applying consolidated v31 logic.
DO $$ 
DECLARE
    policynames RECORD;
BEGIN
    FOR policynames IN (
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE schemaname = 'public'
    ) LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(policynames.policyname) || ' ON ' || quote_ident(policynames.tablename);
    END LOOP;
END $$;

-- 4. ENABLE RLS (STRICT ENFORCEMENT)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.output_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curriculum_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.neural_brain ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_prompt ENABLE ROW LEVEL SECURITY;

-- 5. CONSOLIDATED ATOMIC POLICIES (v31 OPTIMIZED)
-- Pattern: Targets 'authenticated' role explicitly. Block 'anon' entirely.
-- Uses (SELECT auth.uid()) for optimal "Auth RLS Initialization Plan" performance.

-- DOCUMENTS: One policy to rule them all (SELECT, INSERT, UPDATE, DELETE)
-- Replaces multiple permissive policies for anon/dashboard_user with one secure entry point.
CREATE POLICY "v31_documents_atomic_access" ON public.documents 
FOR ALL TO authenticated 
USING (user_id = (SELECT auth.uid()) OR check_is_admin())
WITH CHECK (user_id = (SELECT auth.uid()) OR check_is_admin());

-- PROFILES: Self-management or admin oversight
CREATE POLICY "v31_profiles_atomic_access" ON public.profiles 
FOR ALL TO authenticated 
USING (id = (SELECT auth.uid()) OR check_is_admin())
WITH CHECK (id = (SELECT auth.uid()) OR check_is_admin());

-- OPERATIONAL DATA (Messages, Artifacts, Feedback, Orgs, Logs)
CREATE POLICY "v31_messages_access" ON public.chat_messages FOR ALL TO authenticated USING (user_id = (SELECT auth.uid()) OR check_is_admin()) WITH CHECK (user_id = (SELECT auth.uid()) OR check_is_admin());
CREATE POLICY "v31_artifacts_access" ON public.output_artifacts FOR ALL TO authenticated USING (user_id = (SELECT auth.uid()) OR check_is_admin()) WITH CHECK (user_id = (SELECT auth.uid()) OR check_is_admin());
CREATE POLICY "v31_feedback_access" ON public.feedback_events FOR ALL TO authenticated USING (user_id = (SELECT auth.uid()) OR check_is_admin()) WITH CHECK (user_id = (SELECT auth.uid()) OR check_is_admin());
CREATE POLICY "v31_org_access" ON public.organizations FOR ALL TO authenticated USING (user_id = (SELECT auth.uid()) OR check_is_admin()) WITH CHECK (user_id = (SELECT auth.uid()) OR check_is_admin());
CREATE POLICY "v31_usage_access" ON public.usage_logs FOR ALL TO authenticated USING (user_id = (SELECT auth.uid()) OR check_is_admin()) WITH CHECK (user_id = (SELECT auth.uid()) OR check_is_admin());
CREATE POLICY "v31_curriculum_access" ON public.curriculum_profiles FOR ALL TO authenticated USING (user_id = (SELECT auth.uid()) OR check_is_admin()) WITH CHECK (user_id = (SELECT auth.uid()) OR check_is_admin());

-- SYSTEM CONFIG (Read-Only for Users)
CREATE POLICY "v31_brain_read" ON public.neural_brain FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY "v31_prompt_read" ON public.master_prompt FOR SELECT TO authenticated USING (true);

-- 6. STRICT PERMISSION HARDENING
-- Block all 'anon' and public role access to the database engine.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Explicitly permit authenticated users access through the RLS layer.
GRANT SELECT ON public.neural_brain TO authenticated;
GRANT SELECT ON public.master_prompt TO authenticated;
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.documents TO authenticated;
GRANT ALL ON public.chat_messages TO authenticated;
GRANT ALL ON public.output_artifacts TO authenticated;
GRANT ALL ON public.feedback_events TO authenticated;
GRANT ALL ON public.organizations TO authenticated;
GRANT ALL ON public.usage_logs TO authenticated;

-- 7. PERFORMANCE INDEXING (RECURSION-SAFE)
CREATE INDEX IF NOT EXISTS idx_v31_docs_uid ON public.documents(user_id);
CREATE INDEX IF NOT EXISTS idx_v31_profiles_uid_role ON public.profiles(id, role);
CREATE INDEX IF NOT EXISTS idx_v31_messages_uid ON public.chat_messages(user_id);
`;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Neural Brain Control</h1>
          <p className="text-slate-500 mt-1">Infrastructure diagnostics, RLS patches, and neural logic.</p>
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
              <div className="flex items-center gap-2 text-slate-300"><Terminal size={16} /><span className="text-xs font-mono font-bold uppercase">Consolidated SQL Patch (v31)</span></div>
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
              <h2 className="text-xl font-bold">Consolidated RLS Strategy (v31)</h2>
            </div>
            <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-start gap-4">
              <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl mt-1 shadow-sm"><ShieldAlert size={20}/></div>
              <div>
                <h3 className="font-bold text-emerald-900 tracking-tight">Enterprise Hardening v31</h3>
                <p className="text-sm text-emerald-700 mt-1 mb-4 leading-relaxed">Patch v31 introduces high-efficiency Row Level Security specifically optimized for the Supabase Auth engine. By consolidating permissive role-based policies into single 'FOR ALL' declarations and utilizing the <code>(SELECT auth.uid())</code> subquery pattern, we eliminate query plan initialization overhead and prevent infinite recursion.</p>
                <ul className="text-xs text-emerald-800 space-y-2 list-disc ml-4 font-medium">
                  <li><strong>Consolidated Docs:</strong> Unified policy for SELECT, INSERT, UPDATE, DELETE for authenticated users.</li>
                  <li><strong>Linter Compliance:</strong> Fixed <code>search_path</code> in security functions.</li>
                  <li><strong>Initialization Fix:</strong> Strictly uses <code>(SELECT auth.uid())</code> to satisfy Postgres planning rules.</li>
                  <li><strong>Granular Control:</strong> Only authenticated sessions can interact with the RLS layer; anonymous access is explicitly revoked.</li>
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