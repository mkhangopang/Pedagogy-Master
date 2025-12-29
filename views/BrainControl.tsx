
import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, AlertCircle, CheckCircle2, Info, Database, Copy, Terminal, Activity, XCircle, ShieldCheck, Lock, ShieldAlert } from 'lucide-react';
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
    // Explicitly check for tables mentioned in RLS errors
    const tables = [
      'profiles', 
      'documents', 
      'neural_brain', 
      'output_artifacts', 
      'feedback_events',
      'master_prompt',
      'organizations',
      'usage_logs'
    ];
    const status = await Promise.all(tables.map(async (table) => {
      try {
        const { error } = await supabase.from(table).select('count', { count: 'exact', head: true }).limit(1);
        // Table exists if no error OR if error is just about RLS/Permissions (code 42P01 is "missing table")
        const exists = !error || (error.code !== '42P01' && error.code !== 'PGRST204');
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

  const sqlSchema = `-- Pedagogy Master - ULTIMATE SECURITY PATCH v7
-- Fixes: Search Path, Leaked Passwords (SQL part), and RLS Errors

-- 1. SECURE FUNCTION SEARCH PATH (Fixes function_search_path_mutable)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_new_user') THEN
    ALTER FUNCTION public.handle_new_user() SET search_path = public;
  END IF;
END $$;

-- 2. ENABLE RLS & SECURE LEGACY TABLES (Fixes rls_disabled_in_public)
-- This secures master_prompt, organizations, and usage_logs if they exist
DO $$ 
DECLARE
    t text;
BEGIN
    FOR t IN SELECT unnest(ARRAY['master_prompt', 'organizations', 'usage_logs', 'profiles', 'documents', 'neural_brain', 'output_artifacts', 'feedback_events'])
    LOOP
        IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = t) THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
            -- Standard "Deny All" policy for legacy tables to satisfy linter
            IF t IN ('master_prompt', 'organizations', 'usage_logs') THEN
                EXECUTE format('DROP POLICY IF EXISTS "Linter Security Policy" ON public.%I', t);
                EXECUTE format('CREATE POLICY "Linter Security Policy" ON public.%I FOR ALL USING (false)', t);
            END IF;
        END IF;
    END LOOP;
END $$;

-- 3. CORE APP POLICIES (Ensure access for logged-in users)
DO $$ 
BEGIN
    -- Profiles
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users access own profile') THEN
        CREATE POLICY "Users access own profile" ON public.profiles FOR ALL USING (auth.uid() = id);
    END IF;
    
    -- Documents
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'documents' AND policyname = 'Users access own docs') THEN
        CREATE POLICY "Users access own docs" ON public.documents FOR ALL USING (auth.uid() = user_id);
    END IF;

    -- Neural Brain
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'neural_brain' AND policyname = 'Public read active brain') THEN
        CREATE POLICY "Public read active brain" ON public.neural_brain FOR SELECT USING (is_active = true);
    END IF;
END $$;`;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Neural Brain Control</h1>
          <p className="text-slate-500 mt-1">Logic versioning and infrastructure security audits.</p>
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
              Check Sync Status
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
              <div className="flex items-center gap-2 text-slate-300"><Terminal size={16} /><span className="text-xs font-mono font-bold uppercase">Security & RLS Patch SQL</span></div>
              <button onClick={() => {navigator.clipboard.writeText(sqlSchema); setCopiedSql(true); setTimeout(() => setCopiedSql(false), 2000);}} className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">{copiedSql ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} />}{copiedSql ? 'Copied' : 'Copy SQL'}</button>
            </div>
            <div className="p-6 overflow-x-auto bg-slate-950 max-h-80 overflow-y-auto custom-scrollbar"><pre className="text-indigo-300 font-mono text-[11px] leading-relaxed">{sqlSchema}</pre></div>
          </div>
        </div>
      )}

      {activeTab === 'security' && (
        <div className="space-y-6 max-w-4xl">
          <div className="bg-white rounded-2xl border border-slate-200 p-8 space-y-6 shadow-sm">
            <div className="flex items-center gap-3 text-indigo-600">
              <ShieldCheck size={28} />
              <h2 className="text-xl font-bold">Linter Remediation Guide</h2>
            </div>
            
            <div className="grid gap-6">
              <div className="p-6 bg-amber-50 rounded-2xl border border-amber-100 flex items-start gap-4">
                <div className="p-2 bg-amber-100 text-amber-600 rounded-xl mt-1 shadow-sm"><Lock size={20}/></div>
                <div>
                  <h3 className="font-bold text-amber-900">1. Enable Leaked Password Protection</h3>
                  <p className="text-sm text-amber-700 mt-1 mb-4 leading-relaxed">Fixes <code className="bg-amber-200 px-1 rounded">auth_leaked_password_protection</code> warning in Supabase dashboard.</p>
                  <ol className="text-xs text-amber-800 space-y-2 list-decimal ml-4 font-medium">
                    <li>Open your <strong>Supabase Project Dashboard</strong>.</li>
                    <li>Navigate to <strong>Authentication &gt; Providers</strong>.</li>
                    <li>Expand the <strong>Email</strong> provider configuration.</li>
                    <li>Locate <strong>"Prevent use of leaked passwords"</strong> and toggle it <strong>ON</strong>.</li>
                    <li>Click <strong>Save</strong>.</li>
                  </ol>
                </div>
              </div>

              <div className="p-6 bg-rose-50 rounded-2xl border border-rose-100 flex items-start gap-4">
                <div className="p-2 bg-rose-100 text-rose-600 rounded-xl mt-1 shadow-sm"><ShieldAlert size={20}/></div>
                <div>
                  <h3 className="font-bold text-rose-900">2. Fix Role Mutable Search Path</h3>
                  <p className="text-sm text-rose-700 mt-1 mb-4 leading-relaxed">Fixes <code className="bg-rose-200 px-1 rounded">function_search_path_mutable</code> warning for <code className="bg-rose-200 px-1 rounded">handle_new_user</code>.</p>
                  <p className="text-xs text-rose-800 mb-3 font-medium">Run this exact SQL in your Supabase SQL Editor:</p>
                  <pre className="bg-rose-950 text-rose-200 p-3 rounded-lg text-[10px] font-mono shadow-inner">ALTER FUNCTION public.handle_new_user() SET search_path = public;</pre>
                </div>
              </div>

              <div className="p-6 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-start gap-4">
                <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl mt-1 shadow-sm"><Database size={20}/></div>
                <div>
                  <h3 className="font-bold text-indigo-900">3. Finalize Row Level Security (RLS)</h3>
                  <p className="text-sm text-indigo-700 mt-1 mb-4 leading-relaxed">Fixes <code className="bg-indigo-200 px-1 rounded">rls_disabled_in_public</code> errors for flagged tables.</p>
                  <p className="text-xs text-indigo-800 mb-3 font-medium">Copy the full SQL from the <strong>Infrastructure</strong> tab and run it. It covers:</p>
                  <ul className="text-xs text-indigo-800 space-y-1 list-disc ml-4">
                    <li>master_prompt</li>
                    <li>organizations</li>
                    <li>usage_logs</li>
                    <li>All core application tables</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BrainControl;
