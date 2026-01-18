// Control Hub: Production Infrastructure
import React, { useState, useEffect } from 'react';
import { 
  RefreshCw, CheckCircle2, Copy, Zap, Check, 
  Database, ShieldCheck, Terminal, ShieldAlert, AlertTriangle, Activity, Server, Search, Code, AlertCircle, Cpu, Layers, Rocket
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

  const diagnosticSql = `-- SUPABASE RAG DIAGNOSTIC SUITE
-- 1. Check if vector extension is active
SELECT * FROM pg_extension WHERE extname = 'vector';

-- 2. Check chunk dimensions (Must be 768)
SELECT vector_dims(embedding), count(*) 
FROM document_chunks 
GROUP BY 1;

-- 3. Check Hybrid Search Performance
EXPLAIN ANALYZE SELECT * FROM hybrid_search_chunks_v3(
  array_fill(0, array[768])::vector, 5, 
  (SELECT array_agg(id) FROM documents LIMIT 5)
);`;

  const performanceSql = `-- NEURAL SPEED OPTIMIZATION SUITE
-- 1. CREATE HNSW INDEX (Ultra-fast Vector Search)
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_hnsw 
ON public.document_chunks USING hnsw (embedding vector_cosine_ops);

-- 2. CREATE METADATA GIN INDEXES
CREATE INDEX IF NOT EXISTS idx_chunks_slo_codes_gin ON document_chunks USING GIN (slo_codes);
CREATE INDEX IF NOT EXISTS idx_chunks_topics_gin ON document_chunks USING GIN (topics);

-- 3. MAINTENANCE: Reclaim Stale Storage (Fix Sync Hangs)
VACUUM ANALYZE document_chunks;
VACUUM ANALYZE documents;`;

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
      const res = await fetch('/api/admin/rag-health', {
        headers: { 'Authorization': `Bearer ${session?.access_token}` }
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || "Failed to fetch RAG health metrics.");
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
    if (!window.confirm("Initialize global neural synchronization?")) return;
    setIsIndexing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/admin/index-all-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` }
      });
      const data = await response.json();
      setIndexStatus(`✅ Success: ${data.message}`);
      fetchRagHealth();
    } catch (err: any) { setIndexStatus(`❌ Error: ${err.message}`); } finally { setIsIndexing(false); }
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
      alert("Deployed Core Logic successfully.");
    } catch (err: any) { alert(`Error: ${err.message}`); } finally { setIsSaving(false); }
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
              {tab === 'rag' ? 'RAG Diagnostics' : tab === 'infra' ? 'Stack' : tab}
            </button>
          ))}
        </div>
      </header>

      {activeTab === 'logic' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] border border-slate-200 dark:border-white/10 shadow-sm space-y-6">
            <h2 className="text-xl font-bold flex items-center gap-2 dark:text-white">
              <Terminal size={20} className="text-indigo-500" /> Neural Logic (v{formData.version})
            </h2>
            <textarea 
              value={formData.masterPrompt}
              onChange={(e) => setFormData({...formData, masterPrompt: e.target.value})}
              className="w-full h-96 p-8 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-3xl font-mono text-xs leading-loose outline-none focus:ring-2 focus:ring-indigo-500 dark:text-indigo-300"
            />
            <button onClick={handleSave} disabled={isSaving} className="w-full py-5 bg-indigo-600 text-white rounded-[1.5rem] font-bold shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
              {isSaving ? <RefreshCw className="animate-spin" size={20}/> : <Zap size={20}/>} Deploy Core Logic
            </button>
          </div>
          <div className="bg-slate-900 text-white p-12 rounded-[3rem] flex flex-col justify-center shadow-2xl relative overflow-hidden">
             <div className="absolute top-0 right-0 p-12 opacity-10"><Cpu size={200} /></div>
             <h3 className="text-2xl font-bold mb-4 tracking-tight text-emerald-400">RAG High Precision Active</h3>
             <p className="text-slate-400 text-sm leading-relaxed mb-8 font-medium">Authoritative Vault system is forcing AI synthesis over summarization using Gemini 3 thinking protocols.</p>
             <div className="grid grid-cols-2 gap-4 relative z-10">
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                   <p className="text-[10px] font-bold text-slate-500 uppercase">Embedding Node</p>
                   <p className="text-sm font-bold text-indigo-400">text-embedding-004</p>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                   <p className="text-[10px] font-bold text-slate-500 uppercase">Vector Dims</p>
                   <p className="text-sm font-bold text-indigo-400">768-Wide</p>
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
                      <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed font-medium"><b>Ghost Documents</b>: If chunks are 0, the ingestion likely timed out. Use "Global Neural Refresh".</p>
                    </li>
                    <li className="flex gap-3">
                      <div className="w-5 h-5 bg-amber-200 dark:bg-amber-800 rounded-full flex items-center justify-center text-[10px] font-bold text-amber-800 dark:text-amber-200 shrink-0 mt-0.5">2</div>
                      <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed font-medium"><b>Selection Filter</b>: RAG only queries documents with <code>is_selected = true</code>. Ensure context is active.</p>
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
                    <h2 className="text-2xl font-black tracking-tight">Performance Tuning Suite</h2>
                    <p className="text-slate-400 text-sm font-medium">Execute these scripts in Supabase SQL Editor to fix lag and slow sync.</p>
                 </div>
              </div>

              <div className="space-y-6">
                 <div className="p-6 bg-black/40 rounded-3xl border border-white/5 space-y-4">
                    <div className="flex items-center justify-between">
                       <h3 className="text-xs font-black uppercase tracking-widest text-emerald-400 flex items-center gap-2">
                          <Zap size={14} /> Optimized Indexing (HNSW)
                       </h3>
                       <button onClick={() => copySql(performanceSql, 'perf')} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all">
                          {copiedSql === 'perf' ? 'Copied!' : 'Copy Script'}
                       </button>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">Implementing HNSW (Hierarchical Navigable Small Worlds) indexes on vector columns speeds up retrieval by 10x for large curriculum libraries.</p>
                    <div className="bg-slate-950 p-4 rounded-xl relative overflow-hidden">
                       <pre className="text-[10px] font-mono text-emerald-300/80 overflow-x-auto scrollbar-hide">
                          {performanceSql}
                       </pre>
                    </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-6 bg-white/5 rounded-3xl border border-white/5">
                       <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-2">Sync Timeout Fix</h4>
                       <p className="text-xs text-slate-400 leading-relaxed italic">"Sync failures usually happen when the Document Ingester takes too long to generate embeddings. Use the VACUUM script above to reclaim database memory."</p>
                    </div>
                    <div className="p-6 bg-white/5 rounded-3xl border border-white/5">
                       <h4 className="text-[10px] font-black uppercase tracking-widest text-amber-400 mb-2">Metadata Boosting</h4>
                       <p className="text-xs text-slate-400 leading-relaxed">The Hybrid Search v3 now weights SLO Code matches higher than pure semantic similarity, fixing "irrelevant result" errors in the AI Tutor.</p>
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