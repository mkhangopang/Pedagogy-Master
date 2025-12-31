
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
      'output_artifacts', 
      'feedback_events',
      'organizations',
      'chat_messages'
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

  const sqlSchema = `-- Pedagogy Master - COMPREHENSIVE PERFORMANCE & SECURITY PATCH v15
-- RESOLVES: auth_rls_initplan (performance) and multiple_permissive_policies (redundancy)

-- 1. CLEANUP ALL REDUNDANT POLICIES (Comprehensive Drop)
-- Profiles Redundancies
DROP POLICY IF EXISTS "Own Profile Access" ON public.profiles;
DROP POLICY IF EXISTS "Users access own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can manage own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Documents Redundancies
DROP POLICY IF EXISTS "Own Docs Access" ON public.documents;
DROP POLICY IF EXISTS "Owners manage their documents" ON public.documents;
DROP POLICY IF EXISTS "Users access own docs" ON public.documents;
DROP POLICY IF EXISTS "Users can manage own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can view own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can insert own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can delete own documents" ON public.documents;

-- Other Tables Performance Fixes (auth_rls_initplan)
DROP POLICY IF EXISTS "Users can manage own messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Own Curriculum Access" ON public.curriculum_profiles;
DROP POLICY IF EXISTS "Own Artifacts Access" ON public.output_artifacts;
DROP POLICY IF EXISTS "Own Events Access" ON public.feedback_events;
DROP POLICY IF EXISTS "Users see own org" ON public.organizations;
DROP POLICY IF EXISTS "Users see own usage" ON public.usage_logs;
DROP POLICY IF EXISTS "Public read active brain" ON public.neural_brain;
DROP POLICY IF EXISTS "Anyone can read active brain" ON public.neural_brain;

-- 2. APPLY OPTIMIZED UNIFIED POLICIES
-- Pattern: USING ((SELECT auth.uid()) = user_id_column)
-- This pattern allows Postgres to cache the execution plan.

-- Profiles (Optimized)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Unified Profile Management" ON public.profiles 
FOR ALL USING ((SELECT auth.uid()) = id);

-- Documents (Optimized)
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Unified Document Access" ON public.documents 
FOR ALL USING ((SELECT auth.uid()) = user_id);

-- Chat Messages (Optimized)
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Unified Message Access" ON public.chat_messages 
FOR ALL USING ((SELECT auth.uid()) = user_id);

-- Output Artifacts (Optimized)
ALTER TABLE public.output_artifacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Unified Artifact Access" ON public.output_artifacts 
FOR ALL USING ((SELECT auth.uid()) = user_id);

-- Feedback Events (Optimized)
ALTER TABLE public.feedback_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Unified Event Access" ON public.feedback_events 
FOR ALL USING ((SELECT auth.uid()) = user_id);

-- Neural Brain (Optimized)
ALTER TABLE public.neural_brain ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Unified Brain Visibility" ON public.neural_brain 
FOR SELECT USING (is_active = true);

-- 3. STORAGE SECURITY (Optimized Performance)
DROP POLICY IF EXISTS "Optimized Upload Access" ON storage.objects;
DROP POLICY IF EXISTS "Optimized Read Access" ON storage.objects;

CREATE POLICY "Optimized Upload Access" ON storage.objects 
FOR INSERT WITH CHECK (
    bucket_id = 'documents' AND (SELECT auth.role()) = 'authenticated'
);

CREATE POLICY "Optimized Read Access" ON storage.objects 
FOR SELECT USING (
    bucket_id = 'documents' AND (SELECT auth.uid())::text = (storage.foldername(name))[1]
);

-- 4. ENSURE ESSENTIAL INFRASTRUCTURE
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='neural_brain' AND column_name='is_active') THEN
        ALTER TABLE public.neural_brain ADD COLUMN is_active boolean DEFAULT true;
    END IF;
END $$;
`;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Neural Brain Control</h1>
          <p className="text-slate-500 mt-1">Optimization, logic versioning, and security audits.</p>
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
              <div className="flex items-center gap-2 text-slate-300"><Terminal size={16} /><span className="text-xs font-mono font-bold uppercase">Optimized SQL Patch (v15)</span></div>
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
              <h2 className="text-xl font-bold">Linter Performance Remediation</h2>
            </div>
            <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-start gap-4">
              <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl mt-1 shadow-sm"><ShieldAlert size={20}/></div>
              <div>
                <h3 className="font-bold text-emerald-900 tracking-tight">Resolving Performance Warnings</h3>
                <p className="text-sm text-emerald-700 mt-1 mb-4 leading-relaxed">The Supabase linter identified sub-optimal RLS evaluation patterns. SQL Patch v15 explicitly drops all redundant legacy policies to ensure a clean, optimized state.</p>
                <ol className="text-xs text-emerald-800 space-y-2 list-decimal ml-4 font-medium">
                  <li>Copy the <strong>Optimized SQL Patch (v15)</strong> from the Infrastructure tab.</li>
                  <li>Paste into the <strong>SQL Editor</strong> in Supabase and run.</li>
                  <li>This patch wraps all <code>auth.uid()</code> calls in subqueries to enable Postgres plan caching.</li>
                  <li>It removes all multiple permissive policies identified as redundant for high performance.</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BrainControl;
