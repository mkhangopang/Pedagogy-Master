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

  const sqlSchema = `-- Pedagogy Master - COMPREHENSIVE SCHEMA & SECURITY PATCH v25
-- RESOLVES: "column user_id does not exist", rls_disabled_in_public, and auth_init_performance

-- 1. ENSURE SCHEMA INTEGRITY & RECOVERY
-- We use a DO block to add missing columns to existing tables, preventing the "column does not exist" error.

DO $$ 
BEGIN
    -- profiles uses 'id' as primary key (references auth.users)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='id') THEN
        CREATE TABLE IF NOT EXISTS public.profiles (id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY);
    END IF;
    
    -- Add metadata/role columns if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='role') THEN
        ALTER TABLE public.profiles ADD COLUMN role text DEFAULT 'teacher';
    END IF;

    -- Ensure 'user_id' exists on all relevant tables
    -- Table: documents
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='user_id') THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='documents') THEN
            ALTER TABLE public.documents ADD COLUMN user_id uuid REFERENCES auth.users ON DELETE CASCADE;
        ELSE
            CREATE TABLE public.documents (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL);
        END IF;
    END IF;

    -- Table: chat_messages
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='chat_messages' AND column_name='user_id') THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='chat_messages') THEN
            ALTER TABLE public.chat_messages ADD COLUMN user_id uuid REFERENCES auth.users ON DELETE CASCADE;
        ELSE
            CREATE TABLE public.chat_messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL);
        END IF;
    END IF;

    -- Table: output_artifacts
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='output_artifacts' AND column_name='user_id') THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='output_artifacts') THEN
            ALTER TABLE public.output_artifacts ADD COLUMN user_id uuid REFERENCES auth.users ON DELETE CASCADE;
        ELSE
            CREATE TABLE public.output_artifacts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL);
        END IF;
    END IF;

    -- Table: feedback_events
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='feedback_events' AND column_name='user_id') THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='feedback_events') THEN
            ALTER TABLE public.feedback_events ADD COLUMN user_id uuid REFERENCES auth.users ON DELETE CASCADE;
        ELSE
            CREATE TABLE public.feedback_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL, artifact_id uuid NOT NULL, event_type text NOT NULL);
        END IF;
    END IF;

    -- Table: organizations
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='organizations' AND column_name='user_id') THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='organizations') THEN
            ALTER TABLE public.organizations ADD COLUMN user_id uuid REFERENCES auth.users ON DELETE CASCADE;
        ELSE
            CREATE TABLE public.organizations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL);
        END IF;
    END IF;

    -- Table: usage_logs
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='usage_logs' AND column_name='user_id') THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='usage_logs') THEN
            ALTER TABLE public.usage_logs ADD COLUMN user_id uuid REFERENCES auth.users ON DELETE CASCADE;
        ELSE
            CREATE TABLE public.usage_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL);
        END IF;
    END IF;

    -- Table: curriculum_profiles
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='curriculum_profiles' AND column_name='user_id') THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='curriculum_profiles') THEN
            ALTER TABLE public.curriculum_profiles ADD COLUMN user_id uuid REFERENCES auth.users ON DELETE CASCADE;
        ELSE
            CREATE TABLE public.curriculum_profiles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL);
        END IF;
    END IF;
END $$;

-- 2. FORCE ENABLE ROW LEVEL SECURITY
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.neural_brain ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.master_prompt ENABLE ROW LEVEL SECURITY; 
ALTER TABLE IF EXISTS public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.output_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.feedback_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.curriculum_profiles ENABLE ROW LEVEL SECURITY;

-- 3. RESET POLICIES (CLEAN SLATE)
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

-- 4. APPLY CONSOLIDATED UNIFIED POLICIES
-- We use subqueries for (SELECT auth.uid()) to prevent initialization plan warnings.

-- PROFILES (Users own their row; Admins see all)
CREATE POLICY "Unified Profile Management" ON public.profiles 
FOR ALL TO authenticated 
USING (id = (SELECT auth.uid()) OR (SELECT role FROM public.profiles WHERE id = (SELECT auth.uid())) = 'app_admin')
WITH CHECK (id = (SELECT auth.uid()) OR (SELECT role FROM public.profiles WHERE id = (SELECT auth.uid())) = 'app_admin');

-- DOCUMENTS
CREATE POLICY "Unified Document Access" ON public.documents 
FOR ALL TO authenticated 
USING (user_id = (SELECT auth.uid()) OR (SELECT role FROM public.profiles WHERE id = (SELECT auth.uid())) = 'app_admin')
WITH CHECK (user_id = (SELECT auth.uid()) OR (SELECT role FROM public.profiles WHERE id = (SELECT auth.uid())) = 'app_admin');

-- MESSAGES
CREATE POLICY "Unified Message Access" ON public.chat_messages 
FOR ALL TO authenticated 
USING (user_id = (SELECT auth.uid()) OR (SELECT role FROM public.profiles WHERE id = (SELECT auth.uid())) = 'app_admin')
WITH CHECK (user_id = (SELECT auth.uid()) OR (SELECT role FROM public.profiles WHERE id = (SELECT auth.uid())) = 'app_admin');

-- ARTIFACTS
CREATE POLICY "Unified Artifact Access" ON public.output_artifacts 
FOR ALL TO authenticated 
USING (user_id = (SELECT auth.uid()) OR (SELECT role FROM public.profiles WHERE id = (SELECT auth.uid())) = 'app_admin')
WITH CHECK (user_id = (SELECT auth.uid()) OR (SELECT role FROM public.profiles WHERE id = (SELECT auth.uid())) = 'app_admin');

-- FEEDBACK EVENTS
CREATE POLICY "Unified Event Access" ON public.feedback_events 
FOR ALL TO authenticated 
USING (user_id = (SELECT auth.uid()) OR (SELECT role FROM public.profiles WHERE id = (SELECT auth.uid())) = 'app_admin')
WITH CHECK (user_id = (SELECT auth.uid()) OR (SELECT role FROM public.profiles WHERE id = (SELECT auth.uid())) = 'app_admin');

-- INSTITUTIONAL TABLES
CREATE POLICY "Unified Org Access" ON public.organizations 
FOR ALL TO authenticated 
USING (user_id = (SELECT auth.uid()) OR (SELECT role FROM public.profiles WHERE id = (SELECT auth.uid())) = 'app_admin');

CREATE POLICY "Unified Usage Access" ON public.usage_logs 
FOR ALL TO authenticated 
USING (user_id = (SELECT auth.uid()) OR (SELECT role FROM public.profiles WHERE id = (SELECT auth.uid())) = 'app_admin');

CREATE POLICY "Unified Curriculum Profile Access" ON public.curriculum_profiles 
FOR ALL TO authenticated 
USING (user_id = (SELECT auth.uid()) OR (SELECT role FROM public.profiles WHERE id = (SELECT auth.uid())) = 'app_admin');

-- 5. READ-ONLY ENGINE LOGIC
CREATE POLICY "Unified Brain Visibility" ON public.neural_brain 
FOR SELECT TO authenticated 
USING (is_active = true);

CREATE POLICY "Unified Prompt Visibility" ON public.master_prompt 
FOR SELECT TO authenticated 
USING (true);

-- 6. SECURITY HARDENING
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT ON public.neural_brain TO authenticated;
GRANT SELECT ON public.master_prompt TO authenticated;

-- 7. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON public.documents(user_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_user_id ON public.output_artifacts(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON public.chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
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
              <div className="flex items-center gap-2 text-slate-300"><Terminal size={16} /><span className="text-xs font-mono font-bold uppercase">Consolidated SQL Patch (v25)</span></div>
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
              <h2 className="text-xl font-bold">Consolidated RLS Strategy (v25)</h2>
            </div>
            <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-start gap-4">
              <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl mt-1 shadow-sm"><ShieldAlert size={20}/></div>
              <div>
                <h3 className="font-bold text-emerald-900 tracking-tight">Definitive Column Mapping Resolution</h3>
                <p className="text-sm text-emerald-700 mt-1 mb-4 leading-relaxed">Patch v25 includes a "DO" block for robust schema self-healing. It automatically detects and adds the <code>user_id</code> column to existing tables if it was missed during initial creation. This specifically solves the <code>ERROR: 42703: column "user_id" does not exist</code> error.</p>
                <ul className="text-xs text-emerald-800 space-y-2 list-disc ml-4 font-medium">
                  <li><strong>Self-Healing Schema:</strong> Verifies column existence before applying RLS policies.</li>
                  <li><strong>Explicit Mapping:</strong> Correctly identifies <code>id</code> for Profiles and <code>user_id</code> for all other data points.</li>
                  <li><strong>Initialization Fix:</strong> Maintains the <code>(SELECT auth.uid())</code> pattern to resolve linter warnings.</li>
                  <li><strong>Zero-Conflict Deployment:</strong> Cleanly drops and recreates all policies to avoid legacy overlaps.</li>
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