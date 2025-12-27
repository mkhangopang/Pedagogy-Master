
import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, AlertCircle, CheckCircle2, Info, Database, Copy, Terminal, Activity, XCircle } from 'lucide-react';
import { NeuralBrain } from '../types';
import { supabase } from '../lib/supabase';

interface BrainControlProps {
  brain: NeuralBrain;
  onUpdate: (brain: NeuralBrain) => void;
}

const BrainControl: React.FC<BrainControlProps> = ({ brain, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'logic' | 'infra'>('logic');
  const [formData, setFormData] = useState(brain);
  const [isSaving, setIsSaving] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [dbStatus, setDbStatus] = useState<{table: string, exists: boolean | null}[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  const checkHealth = async () => {
    setIsChecking(true);
    const tables = ['profiles', 'documents', 'neural_brain', 'output_artifacts', 'feedback_events', 'curriculum_profiles', 'global_intelligence'];
    const status = await Promise.all(tables.map(async (table) => {
      try {
        const { error } = await supabase.from(table).select('count', { count: 'exact', head: true }).limit(1);
        return { table, exists: !error || error.code !== '42P01' };
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

  const sqlSchema = `-- Pedagogy Master - COMPREHENSIVE ADAPTIVE SCHEMA v4
-- ============================================
-- 1. Profiles Table (Layer 1 & Layer 3)
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users NOT NULL PRIMARY KEY,
  email TEXT,
  name TEXT,
  role TEXT DEFAULT 'teacher',
  plan TEXT DEFAULT 'free',
  queries_used INT8 DEFAULT 0,
  queries_limit INT8 DEFAULT 30,
  -- Adaptive Metadata
  grade_level TEXT,
  subject_area TEXT,
  curriculum_board TEXT DEFAULT 'Standard',
  teaching_style TEXT DEFAULT 'balanced',
  pedagogical_approach TEXT DEFAULT 'direct-instruction',
  -- Behavioral Stats
  generation_count INT4 DEFAULT 0,
  success_rate NUMERIC DEFAULT 0,
  edit_patterns JSONB DEFAULT '{"avgLengthChange": 0, "examplesCount": 0, "structureModifications": 0}'::jsonb,
  preferred_formats JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 2. Curriculum Profiles (Layer 2 Intelligence)
-- ============================================
CREATE TABLE IF NOT EXISTS public.curriculum_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  structure JSONB,
  hot_units TEXT[] DEFAULT '{}',
  slo_patterns JSONB DEFAULT '{}',
  usage_stats JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 3. Output Artifacts (The survival tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS public.output_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  content_type TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  prompt_version TEXT,
  status TEXT DEFAULT 'generated', -- generated, accepted, edited, exported, abandoned
  edit_depth NUMERIC DEFAULT 0,
  time_to_action INT4, -- in seconds
  reuse_count INT4 DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 4. Feedback Events (Layer 3 & 4 Training Data)
-- ============================================
CREATE TABLE IF NOT EXISTS public.feedback_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  artifact_id UUID REFERENCES public.output_artifacts(id),
  event_type TEXT NOT NULL, -- regenerate, export, edit, accept, abandon, reuse
  event_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 5. Global Intelligence (Layer 4 Aggregate)
-- ============================================
CREATE TABLE IF NOT EXISTS public.global_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type TEXT NOT NULL,
  pattern_data JSONB NOT NULL,
  success_rate NUMERIC,
  sample_size INT4,
  confidence_score NUMERIC,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 6. Core Infrastructure (Neural Brain & Docs)
-- ============================================
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  base64_data TEXT,
  mime_type TEXT,
  status TEXT DEFAULT 'processing',
  subject TEXT,
  grade_level TEXT,
  slo_tags JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.neural_brain (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_prompt TEXT NOT NULL,
  bloom_rules TEXT NOT NULL,
  version INT4 DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- RLS & Security Policies
-- ============================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curriculum_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.output_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.neural_brain ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own Profile Access" ON public.profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "Own Curriculum Access" ON public.curriculum_profiles FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Own Artifacts Access" ON public.output_artifacts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Own Events Access" ON public.feedback_events FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Own Docs Access" ON public.documents FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Global Intelligence Read" ON public.global_intelligence FOR SELECT USING (true);
CREATE POLICY "Public Read Active Brain" ON public.neural_brain FOR SELECT USING (is_active = true);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_artifacts_user ON public.output_artifacts(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON public.feedback_events(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_artifact ON public.feedback_events(artifact_id);
CREATE INDEX IF NOT EXISTS idx_global_pattern ON public.global_intelligence(pattern_type);`;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Neural Brain Control</h1>
          <p className="text-slate-500 mt-1">Adaptive Logic Orchestration.</p>
        </div>
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
          <button onClick={() => setActiveTab('logic')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'logic' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Logic</button>
          <button onClick={() => setActiveTab('infra')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'infra' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Infrastructure</button>
        </div>
      </header>
      
      {activeTab === 'logic' ? (
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-400 bg-white border border-slate-200 px-3 py-1 rounded-full">V{formData.version}.0</span>
              {showStatus && <div className="text-emerald-600 text-sm font-bold flex items-center gap-1"><CheckCircle2 size={14}/> Synced</div>}
            </div>
            <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all disabled:opacity-50">
              {isSaving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Deploy Core
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center gap-2"><Info className="w-4 h-4 text-indigo-500" /><h3 className="text-sm font-bold text-slate-700">Adaptive Master Prompt</h3></div>
                <textarea value={formData.masterPrompt} onChange={(e) => setFormData({...formData, masterPrompt: e.target.value})} className="w-full h-80 p-6 focus:outline-none font-mono text-sm leading-relaxed text-slate-800" spellCheck={false} />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {dbStatus.map((s) => (
              <div key={s.table} className={`p-4 rounded-xl border flex items-center justify-between ${s.exists ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                <div className="flex items-center gap-2">
                  <Database size={16} className={s.exists ? 'text-emerald-600' : 'text-rose-600'} />
                  <span className="text-xs font-bold text-slate-700">{s.table}</span>
                </div>
                {s.exists ? <CheckCircle2 size={14} className="text-emerald-500" /> : <XCircle size={14} className="text-rose-500" />}
              </div>
            ))}
          </div>

          <div className="bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl">
            <div className="p-4 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-300"><Terminal size={16} /><span className="text-xs font-mono font-bold">SQL SCHEMA INITIALIZER (v4)</span></div>
              <button onClick={() => {navigator.clipboard.writeText(sqlSchema); setCopiedSql(true); setTimeout(() => setCopiedSql(false), 2000);}} className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">{copiedSql ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} />}{copiedSql ? 'Copied' : 'Copy SQL'}</button>
            </div>
            <div className="p-6 overflow-x-auto bg-slate-950"><pre className="text-indigo-300 font-mono text-[11px] leading-relaxed">{sqlSchema}</pre></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BrainControl;
