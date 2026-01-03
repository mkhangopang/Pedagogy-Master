import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, AlertCircle, CheckCircle2, Copy, Zap, Check, Database, Globe, ShieldCheck, ExternalLink, Terminal } from 'lucide-react';
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

  const sqlSchema = `-- PEDAGOGY MASTER: INFRASTRUCTURE CORE V2
-- ========================================================================================

-- 1. PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email text,
  name text,
  role text DEFAULT 'teacher',
  plan text DEFAULT 'free',
  queries_used integer DEFAULT 0,
  queries_limit integer DEFAULT 30,
  grade_level text,
  subject_area text,
  teaching_style text,
  pedagogical_approach text,
  generation_count integer DEFAULT 0,
  success_rate float DEFAULT 0,
  edit_patterns jsonb DEFAULT '{"avgLengthChange": 0, "examplesCount": 0, "structureModifications": 0}'::jsonb,
  updated_at timestamp with time zone DEFAULT now()
);

-- 2. DOCUMENTS (UPGRADED FOR R2)
CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  name text NOT NULL,
  file_path text NOT NULL,
  mime_type text,
  status text DEFAULT 'ready',
  storage_type text DEFAULT 'supabase',
  is_public boolean DEFAULT false,
  subject text DEFAULT 'General',
  grade_level text DEFAULT 'Auto',
  slo_tags jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- 3. NEURAL BRAIN
CREATE TABLE IF NOT EXISTS public.neural_brain (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_prompt text NOT NULL,
  bloom_rules text NOT NULL,
  version integer DEFAULT 1,
  is_active boolean DEFAULT true,
  updated_at timestamp with time zone DEFAULT now()
);

-- 4. OUTPUT ARTIFACTS
CREATE TABLE IF NOT EXISTS public.output_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  content_type text,
  content text,
  metadata jsonb,
  status text DEFAULT 'generated',
  edit_depth integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

-- 5. RLS POLICIES (IDEMPOTENT)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage their own profile') THEN
        ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Users can manage their own profile" ON public.profiles FOR ALL USING (auth.uid() = id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage their own documents') THEN
        ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Users can manage their own documents" ON public.documents FOR ALL USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage their own artifacts') THEN
        ALTER TABLE public.output_artifacts ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Users can manage their own artifacts" ON public.output_artifacts FOR ALL USING (auth.uid() = user_id);
    END IF;
END $$;
`;

  const allTablesOk = dbStatus.length > 0 && dbStatus.every(s => s.exists);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Neural Brain Control</h1>
          <p className="text-slate-500 mt-1">SaaS Infrastructure Diagnostics & Logic Console.</p>
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
              <span className="text-xs font-bold text-slate-400 bg-white border border-slate-200 px-3 py-1 rounded-full shadow-sm">Logic Node V{formData.version}.0</span>
              {showStatus && <div className="text-emerald-600 text-sm font-bold flex items-center gap-1"><CheckCircle2 size={14}/> Prompt Synchronized</div>}
            </div>
            <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all disabled:opacity-50 active:scale-95">
              {isSaving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Deploy Version {formData.version + 1}
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
          {!allTablesOk && (
            <div className="p-6 bg-amber-50 border-2 border-dashed border-amber-200 rounded-[2rem] text-amber-900 flex flex-col md:flex-row gap-6 items-center">
              <div className="bg-amber-100 p-4 rounded-full text-amber-600"><AlertCircle size={32}/></div>
              <div className="flex-1 text-center md:text-left">
                <h3 className="text-lg font-black uppercase tracking-tight">Manual Action Required</h3>
                <p className="text-sm opacity-80 mt-1">Your Supabase schema is not fully synchronized. Copy the SQL below and run it in your <strong>Supabase SQL Editor</strong> to enable persistence.</p>
              </div>
              <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="bg-amber-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-amber-700 transition-all shadow-lg active:scale-95">
                Supabase Dashboard <ExternalLink size={18}/>
              </a>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className={`p-6 border rounded-3xl transition-all ${process.env.NEXT_PUBLIC_R2_PUBLIC_URL ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
              <h3 className="font-bold flex items-center gap-2 mb-2"><Globe size={18}/> R2 Public Availability</h3>
              <p className="text-sm opacity-90">
                {process.env.NEXT_PUBLIC_R2_PUBLIC_URL 
                  ? `Active Traffic Node: ${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}`
                  : "Inactive. Traffic is proxied via secure server nodes."}
              </p>
            </div>
            <div className="p-6 bg-indigo-50 border border-indigo-100 rounded-3xl text-indigo-800">
              <h3 className="font-bold flex items-center gap-2 mb-2"><Database size={18}/> Supabase State</h3>
              <p className="text-sm opacity-90">Persistence interface is active and monitoring all profile events.</p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">DB Table Health</h3>
            <button onClick={checkHealth} disabled={isChecking} className="text-xs font-bold text-indigo-600 flex items-center gap-1.5 hover:bg-indigo-50 px-4 py-2 rounded-xl transition-all border border-indigo-100 shadow-sm">
              <RefreshCw size={14} className={isChecking ? 'animate-spin' : ''} />
              Verify Schema
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
              <div className="flex items-center gap-3 text-slate-300"><Terminal size={18} className="text-amber-400" /><span className="text-xs font-mono font-bold uppercase tracking-[0.2em]">INITIALIZATION_CORE.SQL</span></div>
              <button onClick={() => {navigator.clipboard.writeText(sqlSchema); setCopiedSql(true); setTimeout(() => setCopiedSql(false), 2000);}} className="text-xs font-black text-white bg-indigo-600 px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-indigo-500 transition-all">
                {copiedSql ? <Check size={14} /> : <Copy size={14} />}
                {copiedSql ? 'Ready for Dashboard' : 'Copy Script'}
              </button>
            </div>
            <div className="p-8 overflow-x-auto bg-slate-950 max-h-96 overflow-y-auto custom-scrollbar"><pre className="text-indigo-300 font-mono text-[11px] leading-loose">{sqlSchema}</pre></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BrainControl;