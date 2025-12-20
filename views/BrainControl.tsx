
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
    const tables = ['profiles', 'documents', 'neural_brain'];
    const status = await Promise.all(tables.map(async (table) => {
      try {
        const { error } = await supabase.from(table).select('count', { count: 'exact', head: true }).limit(1);
        // Error code 42P01 means relation does not exist
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

      onUpdate({
        ...formData,
        version: formData.version + 1,
        updatedAt: new Date().toISOString()
      });
      setShowStatus(true);
      setTimeout(() => setShowStatus(false), 3000);
    } catch (err: any) {
      console.error("Failed to deploy brain updates:", err);
      alert(`Deployment Error: ${err.message || "Ensure 'neural_brain' table is initialized in Supabase."}`);
    } finally {
      setIsSaving(false);
    }
  };

  const sqlSchema = `-- Pedagogy Master - Supabase Schema Setup
-- Copy and Paste this into the Supabase SQL Editor

-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users NOT NULL PRIMARY KEY,
  email TEXT,
  name TEXT,
  role TEXT DEFAULT 'teacher',
  plan TEXT DEFAULT 'free',
  queries_used INT8 DEFAULT 0,
  queries_limit INT8 DEFAULT 30
);

-- 2. Documents Table
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

-- 3. Neural Brain Table
CREATE TABLE IF NOT EXISTS public.neural_brain (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_prompt TEXT NOT NULL,
  bloom_rules TEXT NOT NULL,
  version INT4 DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.neural_brain ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Profiles are viewable by owner" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Profiles are updatable by owner" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Docs are manageable by owner" ON public.documents FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Admins manage brain" ON public.neural_brain FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'app_admin')
);
CREATE POLICY "Public read active brain" ON public.neural_brain FOR SELECT USING (is_active = true);`;

  const copySql = () => {
    navigator.clipboard.writeText(sqlSchema);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Neural Brain Control</h1>
          <p className="text-slate-500 mt-1">Global logic orchestration for Pedagogy Master.</p>
        </div>
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
          <button 
            onClick={() => setActiveTab('logic')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'logic' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Logic
          </button>
          <button 
            onClick={() => setActiveTab('infra')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'infra' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Infrastructure
          </button>
        </div>
      </header>

      {activeTab === 'logic' ? (
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-400 bg-white border border-slate-200 px-3 py-1 rounded-full">
                V{formData.version}.0
              </span>
              {showStatus && <div className="text-emerald-600 text-sm font-bold flex items-center gap-1"><CheckCircle2 size={14}/> Synced</div>}
            </div>
            <button 
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all disabled:opacity-50"
            >
              {isSaving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Deploy Core
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                  <Info className="w-4 h-4 text-indigo-500" />
                  <h3 className="text-sm font-bold text-slate-700">System Instruction</h3>
                </div>
                <textarea 
                  value={formData.masterPrompt}
                  onChange={(e) => setFormData({...formData, masterPrompt: e.target.value})}
                  className="w-full h-80 p-6 focus:outline-none font-mono text-sm leading-relaxed text-slate-800"
                  spellCheck={false}
                />
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-500" />
                  <h3 className="text-sm font-bold text-slate-700">Taxonomy Rules</h3>
                </div>
                <textarea 
                  value={formData.bloomRules}
                  onChange={(e) => setFormData({...formData, bloomRules: e.target.value})}
                  className="w-full h-48 p-6 focus:outline-none font-mono text-sm leading-relaxed text-slate-800"
                  spellCheck={false}
                />
              </div>
            </div>

            <div className="bg-indigo-900 text-white p-6 rounded-2xl shadow-xl h-fit">
              <h3 className="font-bold mb-4">Pedagogical Guardrails</h3>
              <p className="text-xs text-indigo-200 leading-relaxed mb-6">
                Updating these values instantly affects all GenAI tools. Ensure you maintain strict adherence to Bloom's cognitive complexity levels to prevent instructional decay.
              </p>
              <div className="p-4 bg-indigo-800/50 rounded-xl border border-indigo-700">
                <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-300 mb-2">Model Target</div>
                <div className="font-mono text-sm">gemini-3-flash-preview</div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl">
              <div className="p-4 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-300">
                  <Terminal size={16} />
                  <span className="text-xs font-mono font-bold">SQL SCHEMA INITIALIZER</span>
                </div>
                <button onClick={copySql} className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
                  {copiedSql ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  {copiedSql ? 'Copied' : 'Copy SQL'}
                </button>
              </div>
              <div className="p-6 overflow-x-auto bg-slate-950">
                <pre className="text-indigo-300 font-mono text-[11px] leading-relaxed">
                  {sqlSchema}
                </pre>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <Activity size={18} className="text-indigo-600" />
                  Health Status
                </h3>
                <button onClick={checkHealth} className="p-2 text-slate-400 hover:text-indigo-600">
                  <RefreshCw size={16} className={isChecking ? 'animate-spin' : ''} />
                </button>
              </div>
              <div className="space-y-4">
                {dbStatus.map((s) => (
                  <div key={s.table} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-3">
                      <Database size={16} className="text-slate-400" />
                      <span className="text-sm font-bold text-slate-700">{s.table}</span>
                    </div>
                    {s.exists ? (
                      <CheckCircle2 size={18} className="text-emerald-500" />
                    ) : (
                      <XCircle size={18} className="text-rose-500" />
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-6 text-[10px] text-slate-400 font-medium uppercase leading-relaxed">
                If status is red, run the SQL script in your Supabase dashboard to enable data persistence.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BrainControl;
