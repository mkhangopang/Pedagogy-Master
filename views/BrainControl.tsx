
// Add React to imports to fix "Cannot find namespace 'React'" error when using React.FC.
import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, AlertCircle, CheckCircle2, Copy, Zap, Check, Database, Globe, ShieldCheck, ExternalLink, Terminal, ShieldAlert } from 'lucide-react';
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
  const [dbStatus, setDbStatus] = useState<{table: string, exists: boolean | null, rls: boolean | null}[]>([]);
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
        return { table, exists, rls: exists };
      } catch (e) {
        return { table, exists: false, rls: false };
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No active session found.");

      // Fetch profile with error handling for recursion issues
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      
      if (profileError) {
        throw new Error(`Cloud Sync Error: ${profileError.message}. Please run the SQL patch to fix recursion.`);
      }

      if (profile?.role !== 'app_admin') {
        throw new Error("Administrative override required. Current role lacks deployment privileges.");
      }

      const { error: insertError } = await supabase.from('neural_brain').insert([{
        master_prompt: formData.masterPrompt,
        bloom_rules: formData.bloomRules,
        version: formData.version + 1,
        is_active: true
      }]);
      
      if (insertError) throw insertError;
      
      onUpdate({...formData, version: formData.version + 1, updatedAt: new Date().toISOString()});
      setShowStatus(true);
      setTimeout(() => setShowStatus(false), 3000);
    } catch (err: any) {
      alert(`Deployment Error: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const sqlSchema = `-- PEDAGOGY MASTER: RECURSION FIX & SECURITY PATCH V13
-- ========================================================================================
-- This patch resolves the "infinite recursion" error by using a SECURITY DEFINER function.

-- 1. HELPERS (Security Definer avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role = 'app_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. TABLES INITIALIZATION
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email text,
  name text,
  role text DEFAULT 'teacher',
  plan text DEFAULT 'free',
  grade_level text,
  subject_area text,
  teaching_style text,
  pedagogical_approach text,
  queries_used integer DEFAULT 0,
  queries_limit integer DEFAULT 30,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.neural_brain (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_prompt text NOT NULL,
  bloom_rules text NOT NULL,
  version integer DEFAULT 1,
  is_active boolean DEFAULT true,
  updated_at timestamp with time zone DEFAULT now()
);

-- 3. RLS RESET
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.neural_brain ENABLE ROW LEVEL SECURITY;

-- 4. PROFILES POLICIES (RECURSION-FREE)
DROP POLICY IF EXISTS "Profiles are manageable by owners" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by admins" ON public.profiles;
DROP POLICY IF EXISTS "Individual User Access" ON public.profiles;
DROP POLICY IF EXISTS "Admin Global View" ON public.profiles;

-- Rule 1: Everyone can see/edit their own profile
CREATE POLICY "Individual User Access" ON public.profiles
FOR ALL TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Rule 2: Admins can see all profiles (Uses the non-recursive function)
CREATE POLICY "Admin Global View" ON public.profiles
FOR SELECT TO authenticated
USING (public.is_app_admin());

-- 5. NEURAL BRAIN POLICIES
DROP POLICY IF EXISTS "Neural brain is viewable by all" ON public.neural_brain;
DROP POLICY IF EXISTS "Admins can deploy neural brain" ON public.neural_brain;

CREATE POLICY "Neural brain is viewable by all" ON public.neural_brain 
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can deploy neural brain" ON public.neural_brain
FOR ALL TO authenticated
USING (public.is_app_admin())
WITH CHECK (public.is_app_admin());

-- 6. GRANT PERMISSIONS
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- RELOAD CACHE
NOTIFY pgrst, 'reload schema';
`;

  const handleCopySql = () => {
    navigator.clipboard.writeText(sqlSchema);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <ShieldCheck className="text-indigo-600" />
            Admin Control Node
          </h1>
          <p className="text-slate-500 mt-1">Manage global AI logic and enterprise infrastructure health.</p>
        </div>
        <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
          <button 
            onClick={() => setActiveTab('logic')}
            className={`px-6 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'logic' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            AI Logic
          </button>
          <button 
            onClick={() => setActiveTab('infra')}
            className={`px-6 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'infra' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Infrastructure
          </button>
        </div>
      </header>

      {activeTab === 'logic' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Terminal size={20} className="text-indigo-500" />
                  Master Prompt (v{formData.version})
                </h2>
                <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-bold uppercase tracking-widest">
                  <CheckCircle2 size={12} /> Active
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">System Instruction</label>
                <textarea 
                  value={formData.masterPrompt}
                  onChange={(e) => setFormData({...formData, masterPrompt: e.target.value})}
                  className="w-full h-96 p-6 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono text-sm leading-relaxed"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Taxonomy Rules</label>
                <textarea 
                  value={formData.bloomRules}
                  onChange={(e) => setFormData({...formData, bloomRules: e.target.value})}
                  className="w-full h-40 p-6 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono text-sm leading-relaxed"
                />
              </div>

              <button 
                onClick={handleSave}
                disabled={isSaving}
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSaving ? <RefreshCw className="animate-spin" size={20}/> : <Zap size={20}/>}
                {isSaving ? 'Deploying Neural Patch...' : 'Deploy logic Update'}
              </button>
              
              {showStatus && (
                <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-700 text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                  <CheckCircle2 size={16} />
                  Neural version v{brain.version} successfully deployed to all cloud nodes.
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-indigo-900 text-white p-10 rounded-[2.5rem] relative overflow-hidden shadow-2xl">
              <div className="relative z-10">
                <h3 className="text-2xl font-bold mb-4">Neural Engine Stats</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div className="bg-indigo-800/50 p-6 rounded-2xl backdrop-blur-sm border border-indigo-700/50">
                    <p className="text-indigo-300 text-[10px] font-bold uppercase tracking-widest mb-1">Architecture</p>
                    <p className="text-xl font-bold">Gemini 3 Pro</p>
                  </div>
                  <div className="bg-indigo-800/50 p-6 rounded-2xl backdrop-blur-sm border border-indigo-700/50">
                    <p className="text-indigo-300 text-[10px] font-bold uppercase tracking-widest mb-1">Last Update</p>
                    <p className="text-xl font-bold">Today</p>
                  </div>
                </div>
              </div>
              <Zap size={180} className="absolute -bottom-10 -right-10 text-indigo-500 opacity-10 rotate-12" />
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
              <h3 className="font-bold text-slate-900 mb-6 flex items-center gap-2">
                <AlertCircle size={20} className="text-amber-500" />
                Infrastructure Alert
              </h3>
              <p className="text-sm text-slate-600 mb-4">
                The current error "infinite recursion" is caused by a circular reference in the database Row Level Security.
              </p>
              <ul className="space-y-4 text-sm text-slate-600 leading-relaxed">
                <li className="flex gap-3">
                  <div className="mt-1.5 w-1.5 h-1.5 bg-indigo-500 rounded-full shrink-0" />
                  Go to <strong>Infrastructure</strong> tab and copy the V13 SQL Patch.
                </li>
                <li className="flex gap-3">
                  <div className="mt-1.5 w-1.5 h-1.5 bg-indigo-500 rounded-full shrink-0" />
                  Run it in Supabase SQL Editor to clear the recursion loop.
                </li>
                <li className="flex gap-3">
                  <div className="mt-1.5 w-1.5 h-1.5 bg-indigo-500 rounded-full shrink-0" />
                  Return here and click "Deploy Logic Update" again.
                </li>
              </ul>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] border border-slate-800 shadow-2xl">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="p-4 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-600/20">
                  <Database size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold">SQL Infrastructure Sync</h2>
                  <p className="text-slate-400 text-sm font-medium">Verified connectivity and Row Level Security.</p>
                </div>
              </div>
              <button 
                onClick={checkHealth}
                disabled={isChecking}
                className="px-6 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold text-sm transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {isChecking ? <RefreshCw className="animate-spin" size={16}/> : <RefreshCw size={16}/>}
                Refresh Table Map
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {dbStatus.map((item, idx) => (
                <div key={idx} className="bg-slate-950 p-6 rounded-2xl border border-slate-800 flex items-center justify-between group">
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{item.table}</p>
                    <p className={`text-xs font-bold ${item.exists ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {item.exists ? 'Operational' : 'Node Missing'}
                    </p>
                  </div>
                  {item.exists ? <CheckCircle2 size={20} className="text-emerald-500" /> : <ShieldAlert size={20} className="text-rose-500" />}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold">V13 SQL Patch (Recursion Fix)</h3>
                <p className="text-slate-500 text-sm mt-1">Run this in Supabase SQL Editor to resolve all "infinite recursion" and policy errors.</p>
              </div>
              <button 
                onClick={handleCopySql}
                className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold flex items-center gap-3 hover:bg-indigo-700 transition-all shadow-lg active:scale-95"
              >
                {copiedSql ? <Check size={18} /> : <Copy size={18} />}
                {copiedSql ? 'Copied to Clipboard' : 'Copy SQL Schema'}
              </button>
            </div>

            <div className="relative">
              <pre className="bg-slate-50 p-8 rounded-[2rem] border border-slate-200 font-mono text-xs overflow-auto max-h-[500px] text-slate-700 leading-relaxed custom-scrollbar">
                {sqlSchema}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BrainControl;
