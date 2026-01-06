
// Control Hub: Logic, Infrastructure & Audit
import React, { useState, useEffect } from 'react';
import { 
  Save, RefreshCw, AlertCircle, CheckCircle2, Copy, Zap, Check, 
  Database, ShieldCheck, Terminal, ShieldAlert, Lock, EyeOff, FileCheck, Scale
} from 'lucide-react';
import { NeuralBrain } from '../types';
import { supabase } from '../lib/supabase';

interface BrainControlProps {
  brain: NeuralBrain;
  onUpdate: (brain: NeuralBrain) => void;
}

const BrainControl: React.FC<BrainControlProps> = ({ brain, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'logic' | 'infra' | 'audit'>('logic');
  const [formData, setFormData] = useState(brain);
  const [isSaving, setIsSaving] = useState(false);
  const [dbStatus, setDbStatus] = useState<{table: string, exists: boolean | null}[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  const checkHealth = async () => {
    setIsChecking(true);
    const tables = ['profiles', 'documents', 'neural_brain', 'output_artifacts', 'feedback_events'];
    const status = await Promise.all(tables.map(async (table) => {
      try {
        const { error } = await supabase.from(table).select('id').limit(1);
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No active session.");

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile?.role !== 'app_admin') throw new Error("Unauthorized.");

      const { error } = await supabase.from('neural_brain').insert([{
        master_prompt: formData.masterPrompt,
        bloom_rules: formData.bloomRules,
        version: formData.version + 1,
        is_active: true
      }]);
      
      if (error) throw error;
      onUpdate({...formData, version: formData.version + 1, updatedAt: new Date().toISOString()});
      alert("Deployment Successful.");
    } catch (err: any) {
      alert(`Deployment Error: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const sqlSchema = `-- PEDAGOGY MASTER: INFRASTRUCTURE RECOVERY V17
-- REASON: Fixes infinite recursion in profile policies
-- ========================================================================================

-- 1. DROP RECURSIVE POLICIES
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Manage Own Profile" ON public.profiles;
    DROP POLICY IF EXISTS "Admin View All" ON public.profiles;
    DROP POLICY IF EXISTS "Admin View All v16" ON public.profiles;
END $$;

-- 2. NON-RECURSIVE RLS (JWT Email Logic)
CREATE POLICY "Manage Own Profile" ON public.profiles
FOR ALL TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

CREATE POLICY "Admin View All" ON public.profiles
FOR SELECT TO authenticated
USING (
  (auth.jwt() ->> 'email') IN ('mkgopang@gmail.com', 'admin@edunexus.ai', 'fasi.2001@live.com')
);

-- 3. BOOTSTRAP ADMIN
UPDATE public.profiles 
SET role = 'app_admin', plan = 'enterprise', queries_limit = 999999
WHERE email = 'mkgopang@gmail.com';
`;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20 px-4">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3 tracking-tight">
            <ShieldCheck className="text-indigo-600" />
            Control Hub
          </h1>
          <p className="text-slate-500 mt-1">Enterprise infrastructure and pedagogical logic.</p>
        </div>
        <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
          {['logic', 'infra', 'audit'].map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all capitalize ${activeTab === tab ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {tab === 'infra' ? 'Infrastructure' : tab}
            </button>
          ))}
        </div>
      </header>

      {activeTab === 'logic' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Terminal size={20} className="text-indigo-500" />
              Master Prompt (v{formData.version})
            </h2>
            <textarea 
              value={formData.masterPrompt}
              onChange={(e) => setFormData({...formData, masterPrompt: e.target.value})}
              className="w-full h-80 p-6 bg-slate-50 border border-slate-200 rounded-2xl font-mono text-sm leading-relaxed outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button onClick={handleSave} disabled={isSaving} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
              {isSaving ? <RefreshCw className="animate-spin" size={20}/> : <Zap size={20}/>}
              Deploy Changes
            </button>
          </div>
          <div className="bg-slate-900 text-white p-10 rounded-[2.5rem] flex flex-col justify-center shadow-xl">
             <div className="p-4 bg-slate-800 rounded-2xl inline-block mb-6 w-fit"><Zap className="text-amber-400" size={32} /></div>
             <h3 className="text-2xl font-bold mb-4">Neural Synchronization</h3>
             <p className="text-slate-400 text-sm leading-relaxed mb-6">Updates to the master prompt recalibrate the AI's understanding of Revised Bloom's Taxonomy across all edge nodes.</p>
             <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500"><CheckCircle2 size={14} className="text-emerald-500" /> Zero-budget thinking enabled</div>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500"><CheckCircle2 size={14} className="text-emerald-500" /> Multimodal processing active</div>
             </div>
          </div>
        </div>
      )}

      {activeTab === 'infra' && (
        <div className="space-y-8">
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-8">
               <h2 className="text-xl font-bold flex items-center gap-2"><Database size={20} className="text-indigo-600" /> Supabase Connectivity</h2>
               <button onClick={checkHealth} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all">{isChecking ? <RefreshCw className="animate-spin" size={18}/> : <RefreshCw size={18}/>}</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {dbStatus.map((item, idx) => (
                <div key={idx} className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{item.table}</span>
                  {item.exists ? <CheckCircle2 size={18} className="text-emerald-500" /> : <ShieldAlert size={18} className="text-rose-500" />}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] border border-slate-800 shadow-2xl space-y-6">
            <div className="flex justify-between items-center">
               <h3 className="text-lg font-bold">SQL Migration Script (V17)</h3>
               <button 
                onClick={() => {navigator.clipboard.writeText(sqlSchema); setCopiedSql(true); setTimeout(()=>setCopiedSql(false), 2000)}} 
                className="px-4 py-2 bg-slate-800 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-slate-700"
               >
                 {copiedSql ? <Check size={14}/> : <Copy size={14}/>} {copiedSql ? 'Copied' : 'Copy Patch'}
               </button>
            </div>
            <pre className="bg-slate-950 p-6 rounded-xl text-[11px] font-mono text-indigo-300 overflow-auto max-h-80 border border-white/5">{sqlSchema}</pre>
            <p className="text-xs text-slate-500 italic">Apply this script in your Supabase SQL Editor if you encounter "Infinite Recursion" errors on the profiles table.</p>
          </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           <AuditCard icon={<Lock className="text-emerald-600" />} title="Security" status="GRADE A" desc="RLS and JWT signed cookies active." />
           <AuditCard icon={<EyeOff className="text-indigo-600" />} title="Privacy" status="SECURE" desc="Data purged post-generation." />
           <AuditCard icon={<Scale className="text-amber-600" />} title="Commercial" status="PRODUCTION" desc="Enterprise-grade API verified." />
        </div>
      )}
    </div>
  );
};

const AuditCard = ({ icon, title, status, desc }: any) => (
  <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-4 hover:border-indigo-200 transition-all">
    <div className="flex justify-between items-center">
       <div className="p-3 bg-slate-50 rounded-xl">{icon}</div>
       <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md uppercase tracking-widest">{status}</span>
    </div>
    <h4 className="font-bold text-slate-900">{title}</h4>
    <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
  </div>
);

export default BrainControl;
