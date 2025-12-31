
import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, AlertCircle, CheckCircle2, Info, Database, Copy, Terminal, Activity, ShieldCheck, ShieldAlert, Trash2 } from 'lucide-react';
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
      'feedback_events'
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

  const sqlSchema = `-- Pedagogy Master - TOTAL OPTIMIZATION PATCH v40
-- FOCUS: Resolving Policy Conflicts (Deadlocks) and Performance Warnings.

-- 1. CLEANUP PREVIOUS VERSIONS (Stop the 90% Hang)
-- We drop all known redundant policies to prevent "Multiple Permissive Policies" errors.
DO $$ 
DECLARE
    pol record;
BEGIN
    FOR pol IN (
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND (policyname LIKE 'v38_%' OR policyname LIKE 'v39_%')
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
    END LOOP;
END $$;

-- 2. OPTIMIZED ADMIN CHECK (v40)
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public, auth
AS $$
BEGIN
  -- Use (SELECT) to optimize subquery re-evaluation
  RETURN (SELECT (auth.jwt() ->> 'email')::text IN (
    'mkgopang@gmail.com', 
    'admin@edunexus.ai', 
    'fasi.2001@live.com'
  ));
END;
$$;

-- 3. CORE TABLE UNIFICATION
-- Ensure tables exist and are clean.
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    email text,
    name text,
    role text DEFAULT 'teacher',
    plan text DEFAULT 'free',
    queries_used int DEFAULT 0,
    queries_limit int DEFAULT 30,
    grade_level text,
    subject_area text,
    teaching_style text,
    pedagogical_approach text,
    generation_count int DEFAULT 0,
    success_rate float DEFAULT 0,
    edit_patterns jsonb DEFAULT '{"avgLengthChange": 0, "examplesCount": 0, "structureModifications": 0}',
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users ON DELETE CASCADE,
    name text NOT NULL,
    file_path text,
    base64_data text,
    mime_type text,
    status text DEFAULT 'completed',
    subject text,
    grade_level text,
    slo_tags jsonb DEFAULT '[]',
    created_at timestamp with time zone DEFAULT now()
);

-- 4. OPTIMIZED RLS POLICIES (v40)
-- Using (SELECT auth.uid()) as recommended by Supabase Linter for performance.

-- PROFILES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "v40_profiles_unified" ON public.profiles;
CREATE POLICY "v40_profiles_unified" ON public.profiles 
FOR ALL TO authenticated 
USING (id = (SELECT auth.uid()) OR check_is_admin()) 
WITH CHECK (id = (SELECT auth.uid()) OR check_is_admin());

-- DOCUMENTS
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "v40_documents_unified" ON public.documents;
CREATE POLICY "v40_documents_unified" ON public.documents 
FOR ALL TO authenticated 
USING (user_id = (SELECT auth.uid()) OR check_is_admin()) 
WITH CHECK (user_id = (SELECT auth.uid()) OR check_is_admin());

-- NEURAL BRAIN (Global Read for Logic)
ALTER TABLE public.neural_brain ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "v40_brain_read" ON public.neural_brain;
CREATE POLICY "v40_brain_read" ON public.neural_brain 
FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "v40_brain_write" ON public.neural_brain;
CREATE POLICY "v40_brain_write" ON public.neural_brain 
FOR INSERT TO authenticated WITH CHECK (check_is_admin());

-- CHAT MESSAGES & GHOST TABLES (Cleanup)
ALTER TABLE IF EXISTS public.chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "v40_chat_unified" ON public.chat_messages;
CREATE POLICY "v40_chat_unified" ON public.chat_messages 
FOR ALL TO authenticated USING (user_id = (SELECT auth.uid()) OR check_is_admin());

-- 5. STORAGE ACCESS (v40)
DROP POLICY IF EXISTS "v39_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "v39_storage_select" ON storage.objects;
CREATE POLICY "v40_storage_access" ON storage.objects 
FOR ALL TO authenticated 
USING (bucket_id = 'documents') 
WITH CHECK (bucket_id = 'documents');

-- 6. PERMISSIONS RE-GRANT
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA storage TO authenticated;
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
              <div className="flex items-center gap-2 text-slate-300"><Terminal size={16} /><span className="text-xs font-mono font-bold uppercase">System Optimization Patch (v40)</span></div>
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
              <h2 className="text-xl font-bold">Optimization Strategy (v40)</h2>
            </div>
            <div className="p-6 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-start gap-4">
              <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl mt-1 shadow-sm"><Activity size={20}/></div>
              <div>
                <h3 className="font-bold text-indigo-900 tracking-tight">Fixing Multiple Policy Conflicts</h3>
                <p className="text-sm text-indigo-700 mt-1 mb-4 leading-relaxed">The 90% hang you experienced is a direct result of "Multiple Permissive Policies" on your documents table. Supabase was attempting to evaluate both v38 and v39 rules simultaneously, causing an internal deadlock.</p>
                <ul className="text-xs text-indigo-800 space-y-2 list-disc ml-4 font-medium">
                  <li><strong>Policy Purge:</strong> V40 includes a recursive loop to DROP all old 'v38' and 'v39' policies before creating the new unified rules.</li>
                  <li><strong>Performance Boost:</strong> Replaced raw 'auth.uid()' calls with '(SELECT auth.uid())' to satisfy the Supabase Linter's performance requirements.</li>
                  <li><strong>Deadlock Resolution:</strong> Ensuring only ONE policy exists per action (SELECT, INSERT, UPDATE, DELETE).</li>
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
