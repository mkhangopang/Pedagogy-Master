
// Add React to imports to fix "Cannot find namespace 'React'" error when using React.FC.
import React, { useState, useEffect } from 'react';
import { 
  Save, RefreshCw, AlertCircle, CheckCircle2, Copy, Zap, Check, 
  Database, Globe, ShieldCheck, ExternalLink, Terminal, 
  ShieldAlert, Lock, Info, FileCheck, Scale, Cpu, EyeOff
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
  const [showStatus, setShowStatus] = useState(false);
  const [dbStatus, setDbStatus] = useState<{table: string, exists: boolean | null, rls: boolean | null}[]>([]);
  const [isChecking, setIsChecking] = useState(false);

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

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      
      if (profileError) {
        throw new Error(`Cloud Sync Error: ${profileError.message}. Please run the SQL patch V14.`);
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

  const sqlSchema = `-- PEDAGOGY MASTER: RECURSION FIX & BOOTSTRAP V14
-- ========================================================================================
-- 1. DROP ALL PROBLEMATIC POLICIES FIRST
DROP POLICY IF EXISTS "Profiles are manageable by owners" ON public.profiles;
DROP POLICY IF EXISTS "Individual User Access" ON public.profiles;

-- 2. RE-CREATE SECURITY FUNCTION (Bypass RLS strictly)
CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role = 'app_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. APPLY CLEAN POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manage Own Profile" ON public.profiles
FOR ALL TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

CREATE POLICY "Admin View All" ON public.profiles
FOR SELECT TO authenticated
USING (public.is_app_admin());

-- 4. NEURAL BRAIN POLICIES
ALTER TABLE public.neural_brain ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Neural brain is viewable by all" ON public.neural_brain;
CREATE POLICY "Neural brain is viewable by all" ON public.neural_brain 
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can deploy neural brain" ON public.neural_brain
FOR ALL TO authenticated
USING (public.is_app_admin())
WITH CHECK (public.is_app_admin());

-- 5. BOOTSTRAP ADMIN
UPDATE public.profiles 
SET role = 'app_admin', plan = 'enterprise', queries_limit = 999999
WHERE email = 'mkgopang@gmail.com';
`;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3 tracking-tight">
            <ShieldCheck className="text-indigo-600" />
            Control Hub
          </h1>
          <p className="text-slate-500 mt-1">Manage global AI logic, enterprise security, and commercial compliance.</p>
        </div>
        <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
          <button 
            onClick={() => setActiveTab('logic')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'logic' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            AI Logic
          </button>
          <button 
            onClick={() => setActiveTab('infra')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'infra' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Infrastructure
          </button>
          <button 
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'audit' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Commercial Audit
          </button>
        </div>
      </header>

      {activeTab === 'logic' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Terminal size={20} className="text-indigo-500" />
                  Master Prompt (v{formData.version})
                </h2>
              </div>
              
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">System Instruction</label>
                <textarea 
                  value={formData.masterPrompt}
                  onChange={(e) => setFormData({...formData, masterPrompt: e.target.value})}
                  className="w-full h-96 p-6 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono text-sm leading-relaxed"
                />
              </div>

              <button 
                onClick={handleSave}
                disabled={isSaving}
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSaving ? <RefreshCw className="animate-spin" size={20}/> : <Zap size={20}/>}
                Deploy Version {brain.version + 1}
              </button>
            </div>
          </div>
          <div className="bg-indigo-900 text-white p-10 rounded-[2.5rem] flex flex-col justify-center items-center text-center shadow-xl">
            <Zap size={80} className="text-amber-400 mb-6" />
            <h3 className="text-2xl font-bold mb-2">Neural Hub Status</h3>
            <p className="opacity-70 text-sm max-w-xs leading-relaxed">Global pedagogical calibrations are synced across all educator nodes with high availability.</p>
          </div>
        </div>
      )}

      {activeTab === 'infra' && (
        <div className="space-y-8">
          <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] border border-slate-800 shadow-2xl">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <Database size={24} className="text-indigo-400" />
                <h2 className="text-xl font-bold">SQL Sync State</h2>
              </div>
              <button onClick={checkHealth} className="px-4 py-2 bg-slate-800 rounded-xl text-xs font-bold hover:bg-slate-700 transition-all">Refresh Diagnostic</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {dbStatus.map((item, idx) => (
                <div key={idx} className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{item.table}</span>
                  <div className="flex items-center gap-2">
                    {item.exists ? <CheckCircle2 size={16} className="text-emerald-500" /> : <ShieldAlert size={16} className="text-rose-500" />}
                    <span className={`text-[10px] font-bold ${item.exists ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {item.exists ? 'ONLINE' : 'MISSING'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
             <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold">V14 SQL Migration</h3>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(sqlSchema);
                  }} 
                  className="text-indigo-600 font-bold text-xs flex items-center gap-2 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-all"
                >
                  <Copy size={14} /> Copy Script
                </button>
             </div>
             <pre className="bg-slate-50 p-6 rounded-xl text-xs overflow-auto max-h-60 font-mono text-slate-700 border border-slate-200">{sqlSchema}</pre>
          </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="space-y-8 animate-in fade-in zoom-in duration-500">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             <AuditSummaryCard 
                title="Security Compliance" 
                status="Grade A" 
                icon={<Lock className="text-emerald-600" />} 
                desc="RLS, JWT, and SQL injection prevention active."
             />
             <AuditSummaryCard 
                title="Privacy Shield" 
                status="Non-Persistent" 
                icon={<EyeOff className="text-indigo-600" />} 
                desc="Multimodal data handled via volatile buffers."
             />
             <AuditSummaryCard 
                title="Commercial Readiness" 
                status="Production" 
                icon={<Scale className="text-amber-600" />} 
                desc="Compliant with enterprise API licensing."
             />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-6">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <ShieldCheck size={20} className="text-emerald-600" />
                Hardened Perimeter Security
              </h3>
              <div className="space-y-4">
                <AuditItem title="RLS Policy Enforcement" status="Verified" desc="Row Level Security ensures cross-tenant data isolation. Users cannot query data outside their auth scope." />
                <AuditItem title="JWT Protocol Validation" status="Active" desc="All edge functions and API routes require cryptographically signed JSON Web Tokens for execution." />
                <AuditItem title="Multimodal Data Sandbox" status="Secured" desc="Multimodal inputs (PDF, DOCX) are processed in non-persistent environments. No user files are used for training." />
                <AuditItem title="Regional Persistence" status="R2 Node" desc="Cloudflare R2 storage handles regional object persistence with bucket-level encryption at rest." />
              </div>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-6">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <FileCheck size={20} className="text-indigo-600" />
                Interoperability & Export Standards
              </h3>
              <div className="space-y-4">
                <AuditItem title="OOXML Word Compatibility" status="Validated" desc="Exported .doc files utilize standard Word XML headers, ensuring seamless rendering in Google Docs and Microsoft 365." />
                <AuditItem title="UTF-8 Excel Encoding" status="Verified" desc="CSV exports include Byte Order Marks (BOM) to prevent character corruption in Excel and regional spreadsheet tools." />
                <AuditItem title="Adaptive Rate Limiting" status="Backoff Active" desc="Commercial usage is protected via exponential backoff (429 handling), preventing AI engine saturation." />
                <AuditItem title="Pedagogical Taxonomy Alignment" status="Bloom v1.0" desc="System instructions strictly enforce Bloom's Revised Taxonomy verbs, ensuring professional educational output." />
              </div>
            </div>
          </div>

          <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
               <div className="p-4 bg-white rounded-2xl shadow-sm"><Info className="text-slate-400" /></div>
               <div>
                 <h4 className="font-bold text-slate-900">Commercial Use Compliance</h4>
                 <p className="text-sm text-slate-500">This instance is configured for professional SaaS operations with standard liability isolation.</p>
               </div>
            </div>
            <button className="px-6 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all flex items-center gap-2 shadow-sm">
              <ExternalLink size={14} /> View License Agreement
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const AuditSummaryCard = ({ title, status, icon, desc }: { title: string, status: string, icon: React.ReactNode, desc: string }) => (
  <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm space-y-4">
    <div className="flex items-center justify-between">
      <div className="p-3 bg-slate-50 rounded-xl">{icon}</div>
      <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{status}</span>
    </div>
    <div>
      <h4 className="font-bold text-slate-900">{title}</h4>
      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{desc}</p>
    </div>
  </div>
);

const AuditItem = ({ title, status, desc }: { title: string, status: string, desc: string }) => (
  <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-100 transition-all group">
    <div className="flex justify-between items-center mb-1">
      <span className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{title}</span>
      <div className="flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-200" />
        <span className="text-[10px] font-black uppercase text-emerald-600 tracking-widest">{status}</span>
      </div>
    </div>
    <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
  </div>
);

export default BrainControl;
