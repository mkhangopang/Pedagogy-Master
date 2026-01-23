// Control Hub: Production Infrastructure
import React, { useState, useEffect } from 'react';
import { 
  RefreshCw, CheckCircle2, Copy, Zap, Check, 
  Database, ShieldCheck, Terminal, ShieldAlert, AlertTriangle, Activity, Server, Search, Code, AlertCircle, Cpu, Layers, Rocket, Download, History, Sparkles, HeartPulse
} from 'lucide-react';
import { NeuralBrain } from '../types';
import { supabase } from '../lib/supabase';

interface BrainControlProps {
  brain: NeuralBrain;
  onUpdate: (brain: NeuralBrain) => void;
}

const BrainControl: React.FC<BrainControlProps> = ({ brain, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'logic' | 'infra' | 'rag' | 'performance'>('logic');
  const [formData, setFormData] = useState(brain);
  const [isSaving, setIsSaving] = useState(false);
  const [dbStatus, setDbStatus] = useState<{table: string, exists: boolean | null}[]>([]);
  const [ragHealth, setRagHealth] = useState<any>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexStatus, setIndexStatus] = useState<string | null>(null);
  const [copiedSql, setCopiedSql] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const diagnosticSql = `-- EDUNEXUS AI: INFRASTRUCTURE AUDIT (v46.0)
-- 1. Check Extensions & Dimensions
SELECT 
    extname, 
    installed_version 
FROM pg_extension 
WHERE extname = 'vector';

-- 2. Verify Vector Health (Must be 768)
SELECT 
    vector_dims(embedding) as dims, 
    count(*) as node_count 
FROM public.document_chunks 
GROUP BY 1;

-- 3. Check System Sync Logic
SELECT 
    'Auth Trigger' as component,
    CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') 
         THEN '✅ LINKED' ELSE '⚠️ DISCONNECTED' END as status;`;

  const performanceSql = `-- EDUNEXUS AI: MASTER REPAIR & OPTIMIZATION (v46.0)
-- 🎯 Target: Fix "Profile Already Exists" errors and Neural Sync hangs.

-- 1. REPAIR AUTH TRIGGER (UPSERT PATTERN)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role, plan, queries_limit)
  VALUES (
    NEW.id, 
    NEW.email, 
    split_part(NEW.email, '@', 1), 
    'teacher', 
    'free', 
    30
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. ACCELERATE RETRIEVAL (HNSW Indexing)
-- Speeds up vector search by 10x for large libraries
CREATE INDEX IF NOT EXISTS idx_chunks_vector_hnsw 
ON public.document_chunks USING hnsw (embedding vector_cosine_ops);

-- 3. METADATA BOOSTING (GIN Indexing)
CREATE INDEX IF NOT EXISTS idx_chunks_slo_codes_gin ON document_chunks USING GIN (slo_codes);

-- 4. MAINTENANCE: Reclaim Stale Storage
VACUUM ANALYZE public.document_chunks;
VACUUM ANALYZE public.documents;`;

  const copySql = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSql(id);
    setTimeout(() => setCopiedSql(null), 2000);
  };

  const checkHealth = async () => {
    setIsChecking(true);
    const tables = ['profiles', 'documents', 'document_chunks', 'neural_brain', 'output_artifacts', 'slo_database', 'teacher_progress'];
    const status = await Promise.all(tables.map(async (table) => {
      try {
        const { error } = await supabase.from(table).select('id').limit(1);
        return { table, exists: !error || error.code !== '42P01' };
      } catch (e) { return { table, exists: false }; }
    }));
    setDbStatus(status);
    setIsChecking(false);
  };

  const fetchRagHealth = async () => {
    setIsChecking(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError("Neural link expired. Please re-authenticate.");
        return;
      }

      const res = await fetch('/api/admin/rag-health', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || "Failed to fetch RAG health metrics.");
        if (data.error === 'Invalid Session') {
           // Force reload or logout could happen here if critical
        }
        return;
      }
      
      setRagHealth(data);
    } catch (e) {
      setError("Network error connecting to diagnostic node.");
    } finally {
      setIsChecking(false);
    }
  };

  const handleBulkIndex = async () => {
    if (!window.confirm("Initialize global neural synchronization? This will heal broken links and refresh embeddings.")) return;
    setIsIndexing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Session expired.");
      
      const response = await fetch('/api/admin/index-all-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Indexer failed.");
      setIndexStatus(`✅ Grid Healed: ${data.message}`);
      fetchRagHealth();
    } catch (err: any) { setIndexStatus(`❌ Indexer Failed: ${err.message}`); } finally { setIsIndexing(false); }
  };

  const handleCreateSnapshot = () => {
    const snapshot = {
      system_id: "edunexus-ai-v2",
      timestamp: new Date().toISOString(),
      brain_version: formData.version,
      logic_prompt: formData.masterPrompt,
      infrastructure: {
        vector_dims: 768,
        search_engine: "hybrid_search_v3",
        specialization: "pedagogy_master_grid"
      }
    };
    
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `edunexus_v${formData.version}_snapshot.json`;
    a.click();
    alert("SYSTEM STATE CAPTURED: Snapshot file generated. Keep this file to restore logic if the grid malfunctions.");
  };

  useEffect(() => { 
    if (activeTab === 'infra') checkHealth(); 
    if (activeTab === 'rag') fetchRagHealth();
  }, [activeTab]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase.from('neural_brain').insert([{
        master_prompt: formData.masterPrompt,
        version: formData.version + 1,
        is_active: true
      }]);
      if (error) throw error;
      onUpdate({...formData, version: formData.version + 1, updatedAt: new Date().toISOString()});
      alert("DEPLOYMENT SUCCESSFUL: Core Logic synchronized across all nodes. Behavioral grid is now persistent.");
    } catch (err: any) { alert(`Deployment Error: ${err.message}`); } finally { setIsSaving(false); }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24 px-4">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 text-slate-900 dark:text-white">
        <div>
          <h1 className="text-3xl font-black flex items-center gap-3 tracking-tight">
            <ShieldCheck className="text-indigo-600" /> Control Hub
          </h1>
          <p className="text-slate-500 mt-1 font-medium italic">Neural Network Infrastructure Monitoring.</p>
        </div>
        <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-inner overflow-x-auto scrollbar-hide">
          {['logic', 'infra', 'rag', 'performance'].map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0 ${activeTab === tab ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500'}`}
            >
              {tab === 'rag' ? 'RAG Diagnostics' : tab === 'infra' ? 'Stack' : tab === 'performance' ? 'Repair' : tab}
            </button>
          ))}
        </div>
      </header>

      {activeTab === 'logic' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] border border-slate-200 dark:border-white/10 shadow-sm space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold flex items-center gap-2 dark:text-white">
                <Terminal size={20} className="text-indigo-500" /> Neural Logic (v{formData.version})
              </h2>
              <button 
                onClick={handleCreateSnapshot}
                title="Capture stable configuration for recovery"
                className="flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-all border border-indigo-100 dark:border-indigo-800"
              >
                <History size={12} /> Favorite Snapshot
              </button>
            </div>
            <textarea 
              value={formData.masterPrompt}
              onChange={(e) => setFormData({...formData, masterPrompt: e.target.value})}
              className="w-full h-96 p-8 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-3xl font-mono text-xs leading-loose outline-none focus:ring-2 focus:ring-indigo-500 dark:text-indigo-300 shadow-inner"
              placeholder="Inject custom system instructions here..."
            />
            <button onClick={handleSave} disabled={isSaving} className="w-full py-5 bg-indigo-600 text-white rounded-[1.5rem] font-bold shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95">
              {isSaving ? <RefreshCw className="animate-spin" size={20}/> : <Zap size={20}/>} Deploy Core Logic
            </button>
          </div>
          <div className="bg-slate-900 text-white p-12 rounded-[3rem] flex flex-col justify-center shadow-2xl relative overflow-hidden">
             <div className="absolute top-0 right-0 p-12 opacity-10"><Cpu size={200} /></div>
             <h3 className="text-2xl font-bold mb-4 tracking-tight text-emerald-400 flex items-center gap-2"><Sparkles size={24}/> Persistence Guard</h3>
             <p className="text-slate-400 text-sm leading-relaxed mb-8 font-medium">Neural logic edits are persistent. Once deployed, the orchestrator updates its behavior grid globally. Use the snapshot feature to archive stable configurations.</p>
             <div className="grid grid-cols-2 gap-4 relative z-10">
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                   <p className="text-[10px] font-bold text-slate-500 uppercase">Embedding Node</p>
                   <p className="text-sm font-bold text-indigo-400">text-embedding-004</p>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                   <p className="text-[10px] font-bold text-slate-500 uppercase">Sync Mode</p>
                   <p className="text-sm font-bold text-indigo-400">Atomic Persistence</p>
                </div>
             </div>
          </div>
        </div>
      )}

      {activeTab === 'infra' && (
        <div className="space-y-8 animate-in slide-in-from-bottom-2">
          <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-sm">
            <div className="flex items-center justify-between mb-10">
               <h2 className="text-2xl font-bold flex items-center gap-3 dark:text-white"><Database size={24} className="text-indigo-600" /> Infrastructure</h2>
               <button onClick={checkHealth} className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all">{isChecking ? <RefreshCw className="animate-spin" /> : <RefreshCw />}</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {dbStatus.map((item, idx) => (
                <div key={idx} className={`p-6 rounded-2xl border flex flex-col gap-3 transition-all ${item.exists ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900 text-emerald-700 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-950/30 border-rose-100 dark:border-rose-900 text-rose-700 dark:text-rose-400 animate-pulse'}`}>
                  <span className="text-[10px] font-black uppercase tracking-widest">{item.table}</span>
                  {item.exists ? <CheckCircle2 size={24} /> : <ShieldAlert size={24} />}
                  <span className="font-bold text-sm">{item.exists ? 'SYNCED' : 'ERR_404'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'rag' && (
        <div className="space-y-8 animate-in slide-in-from-bottom-2">
          <div className="bg-white dark:bg-slate-900 p-8 md:p-10 rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-sm">
            <div className="flex items-center justify-between mb-8">
               <h2 className="text-xl md:text-2xl font-bold flex items-center gap-3 dark:text-white"><Activity size={24} className="text-indigo-600" /> RAG Diagnostics</h2>
               <div className="flex gap-2">
                 <button onClick={handleBulkIndex} disabled={isIndexing} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg disabled:opacity-50">
                   {isIndexing ? <RefreshCw className="animate-spin" size={14} /> : <HeartPulse size={14} />} Heal Grid
                 </button>
                 <button onClick={fetchRagHealth} disabled={isChecking} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-all">
                   {isChecking ? <RefreshCw className="animate-spin" /> : <Search size={20} />}
                 </button>
               </div>
            </div>

            {error && (
              <div className="p-4 bg-rose-50 border border-rose-100 text-rose-700 rounded-2xl mb-8 flex items-center gap-3 font-medium text-sm">
                <AlertCircle size={18} />
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
              <HealthCard 
                label="Healthy Assets" 
                value={ragHealth?.summary?.healthy} 
                total={ragHealth?.summary?.totalDocs} 
                status={ragHealth?.summary?.healthy === ragHealth?.summary?.totalDocs ? 'good' : 'warning'}
                icon={<CheckCircle2 size={16} />}
              />
              <HealthCard 
                label="Broken Links" 
                value={ragHealth?.summary?.broken} 
                status={ragHealth?.summary?.broken > 0 ? 'critical' : 'good'}
                icon={<ShieldAlert size={16} />}
              />
              <HealthCard 
                label="Orphaned Chunks" 
                value={ragHealth?.summary?.orphanedChunks} 
                status={ragHealth?.summary?.orphanedChunks > 0 ? 'warning' : 'good'}
                icon={<Layers size={16} />}
              />
              <div className={`p-6 rounded-[2rem] border flex flex-col gap-2 ${ragHealth?.extensionActive ? 'bg-indigo-50 border-indigo-100 text-indigo-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
                <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Vector Grid</span>
                <div className="text-xl font-black flex items-center gap-2">
                  <Cpu size={20} /> {ragHealth?.actualDimensions || 768}D {ragHealth?.extensionActive ? 'ONLINE' : 'OFFLINE'}
                </div>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-black/20 rounded-3xl overflow-x-auto border border-slate-100 dark:border-white/5 mb-8 scrollbar-hide">
              <table className="w-full text-left text-sm min-w-[600px]">
                <thead className="bg-slate-100 dark:bg-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <tr>
                    <th className="p-4">Document</th>
                    <th className="p-4">Selection</th>
                    <th className="p-4">Chunks</th>
                    <th className="p-4">Health Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {ragHealth?.report?.map((doc: any) => (
                    <tr key={doc.id} className="dark:text-slate-300">
                      <td className="p-4 font-bold">{doc.name}</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${doc.is_selected ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
                          {doc.is_selected ? 'ACTIVE' : 'IDLE'}
                        </span>
                      </td>
                      <td className="p-4 font-mono">{doc.chunk_count}</td>
                      <td className={`p-4 font-bold text-xs ${doc.health_status === 'HEALTHY' ? 'text-emerald-500' : 'text-rose-500 animate-pulse'}`}>
                        {doc.health_status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
               <div className="p-8 bg-indigo-50 dark:bg-indigo-950/20 rounded-[2.5rem] border border-indigo-100 dark:border-indigo-900/30">
                  <h3 className="font-bold flex items-center gap-2 text-indigo-700 dark:text-indigo-400 mb-4">
                    <Code size={18} /> Diagnostic SQL
                  </h3>
                  <div className="bg-slate-950 p-6 rounded-2xl relative group mb-6 overflow-hidden">
                    <pre className="text-[10px] font-mono text-indigo-300 overflow-x-auto custom-scrollbar">
                      {diagnosticSql}
                    </pre>
                    <button onClick={() => copySql(diagnosticSql, 'diagnostic')} className="absolute top-4 right-4 p-2 bg-indigo-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all shadow-xl">
                      {copiedSql === 'diagnostic' ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                  <button onClick={handleBulkIndex} disabled={isIndexing} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-3 shadow-xl disabled:opacity-50">
                    {isIndexing ? <RefreshCw className="animate-spin" size={18} /> : <Zap size={18} />} Global Neural Refresh
                  </button>
                  {indexStatus && <p className="mt-4 text-center text-xs font-bold text-indigo-500 animate-pulse">{indexStatus}</p>}
               </div>

               <div className="p-8 bg-amber-50 dark:bg-amber-950/20 rounded-[2.5rem] border border-amber-100 dark:border-amber-900/30">
                  <h3 className="font-bold flex items-center gap-2 text-amber-700 dark:text-amber-400 mb-4">
                    <AlertCircle size={18} /> RAG Troubleshooting
                  </h3>
                  <ul className="space-y-4">
                    <li className="flex gap-3">
                      <div className="w-5 h-5 bg-amber-200 dark:bg-amber-800 rounded-full flex items-center justify-center text-[10px] font-bold text-amber-800 dark:text-amber-200 shrink-0 mt-0.5">1</div>
                      <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed font-medium"><b>Broken Links</b>: This means metadata exists but vector chunks are missing (often due to ingestion timeouts). Use <b>Heal Grid</b> to fix these documents automatically.</p>
                    </li>
                    <li className="flex gap-3">
                      <div className="w-5 h-5 bg-amber-200 dark:bg-amber-800 rounded-full flex items-center justify-center text-[10px] font-bold text-amber-800 dark:text-amber-200 shrink-0 mt-0.5">2</div>
                      <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed font-medium"><b>Ingestion Lag</b>: Heavy documents (&gt;100 pages) can timeout. Re-run manual indexing for individual assets from the Curriculum Library view if healing fails.</p>
                    </li>
                  </ul>
               </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'performance' && (
        <div className="space-y-8 animate-in slide-in-from-bottom-2">
           <div className="bg-slate-900 text-white p-10 rounded-[3rem] border border-white/10 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-12 opacity-5"><Rocket size={250} /></div>
              <div className="flex items-center gap-4 mb-8">
                 <div className="p-3 bg-emerald-500 rounded-2xl text-white shadow-lg"><Rocket size={24} /></div>
                 <div>
                    <h2 className="text-2xl font-black tracking-tight">Master Infrastructure Repair (v46.0)</h2>
                    <p className="text-slate-400 text-sm font-medium">Execute this script in Supabase SQL Editor to resolve "Profile Already Exists" errors and sync hangs.</p>
                 </div>
              </div>

              <div className="space-y-6">
                 <div className="p-6 bg-black/40 rounded-3xl border border-white/5 space-y-4">
                    <div className="flex items-center justify-between">
                       <h3 className="text-xs font-black uppercase tracking-widest text-emerald-400 flex items-center gap-2">
                          <Zap size={14} /> Critical Repair & HNSW Tuning
                       </h3>
                       <button onClick={() => copySql(performanceSql, 'perf')} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all">
                          {copiedSql === 'perf' ? 'Copied!' : 'Copy Script'}
                       </button>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">This script implements an UPSERT pattern for profile synchronization and adds HNSW vector indexing for ultra-fast retrieval.</p>
                    <div className="bg-slate-950 p-4 rounded-xl relative overflow-hidden">
                       <pre className="text-[10px] font-mono text-emerald-300/80 overflow-x-auto scrollbar-hide">
                          {performanceSql}
                       </pre>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

const HealthCard = ({ label, value, total, status, icon }: any) => (
  <div className={`p-6 rounded-[2rem] border flex flex-col gap-2 ${
    status === 'good' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
    status === 'critical' ? 'bg-rose-50 border-rose-100 text-rose-700' :
    'bg-amber-50 border-amber-100 text-amber-700'
  }`}>
    <span className="text-[10px] font-black uppercase tracking-widest opacity-60 flex items-center gap-1.5">{icon} {label}</span>
    <div className="text-3xl font-black">
      {value || 0}{total ? <span className="text-sm opacity-40 ml-1">/ {total}</span> : ''}
    </div>
  </div>
);

export default BrainControl;