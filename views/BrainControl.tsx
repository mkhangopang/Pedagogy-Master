// Control Hub: Production Infrastructure
import React, { useState, useEffect } from 'react';
import { 
  RefreshCw, CheckCircle2, Copy, Zap, Check, 
  Database, ShieldCheck, Terminal, ShieldAlert, AlertTriangle, Activity, Server, Search
} from 'lucide-react';
import { NeuralBrain } from '../types';
import { supabase } from '../lib/supabase';

interface BrainControlProps {
  brain: NeuralBrain;
  onUpdate: (brain: NeuralBrain) => void;
}

const BrainControl: React.FC<BrainControlProps> = ({ brain, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'logic' | 'infra' | 'rag'>('logic');
  const [formData, setFormData] = useState(brain);
  const [isSaving, setIsSaving] = useState(false);
  const [dbStatus, setDbStatus] = useState<{table: string, exists: boolean | null}[]>([]);
  const [ragHealth, setRagHealth] = useState<any>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexStatus, setIndexStatus] = useState<string | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);

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
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/rag-health', {
        headers: { 'Authorization': `Bearer ${session?.access_token}` }
      });
      const data = await res.json();
      setRagHealth(data);
    } catch (e) {
      console.error("RAG health fetch failed", e);
    } finally {
      setIsChecking(false);
    }
  };

  const handleBulkIndex = async () => {
    if (!window.confirm("Initialize global neural synchronization?")) return;
    setIsIndexing(true);
    setIndexStatus("Syncing neural nodes...");
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
      alert("Deployed.");
    } catch (err: any) { alert(`Error: ${err.message}`); } finally { setIsSaving(false); }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24 px-4">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 text-slate-900 dark:text-white">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3 tracking-tight">
            <ShieldCheck className="text-indigo-600" /> Control Hub
          </h1>
          <p className="text-slate-500 mt-1 font-medium italic">Neural Network Monitoring.</p>
        </div>
        <div className="flex bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-inner">
          {['logic', 'infra', 'rag'].map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500'}`}
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
          <div className="bg-slate-900 text-white p-12 rounded-[3rem] flex flex-col justify-center shadow-2xl">
             <h3 className="text-2xl font-bold mb-4 tracking-tight text-emerald-400">RAG High Precision Active</h3>
             <p className="text-slate-400 text-sm leading-relaxed mb-8 font-medium">Authoritative Vault system is forcing AI synthesis over summarization.</p>
             <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                   <p className="text-[10px] font-bold text-slate-500 uppercase">Embedding Node</p>
                   <p className="text-sm font-bold">text-embedding-004</p>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                   <p className="text-[10px] font-bold text-slate-500 uppercase">Vector Dims</p>
                   <p className="text-sm font-bold">768</p>
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
               <button onClick={checkHealth} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-all">{isChecking ? <RefreshCw className="animate-spin" /> : <RefreshCw />}</button>
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
          <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-sm">
            <div className="flex items-center justify-between mb-8">
               <h2 className="text-2xl font-bold flex items-center gap-3 dark:text-white"><Activity size={24} className="text-indigo-600" /> RAG Health Dashboard</h2>
               <button onClick={fetchRagHealth} disabled={isChecking} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-all">
                 {isChecking ? <RefreshCw className="animate-spin" /> : <Search />}
               </button>
            </div>

            {ragHealth && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                <HealthCard 
                  label="Healthy Assets" 
                  value={ragHealth.summary.healthy} 
                  total={ragHealth.summary.totalDocs} 
                  status={ragHealth.summary.healthy === ragHealth.summary.totalDocs ? 'good' : 'warning'}
                />
                <HealthCard 
                  label="Broken Links" 
                  value={ragHealth.summary.broken} 
                  status={ragHealth.summary.broken > 0 ? 'critical' : 'good'}
                />
                <HealthCard 
                  label="Orphaned Nodes" 
                  value={ragHealth.summary.orphanedChunks} 
                  status={ragHealth.summary.orphanedChunks > 0 ? 'warning' : 'good'}
                />
              </div>
            )}

            <div className="bg-slate-50 dark:bg-black/20 rounded-3xl overflow-hidden border border-slate-100 dark:border-white/5">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-100 dark:bg-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <tr>
                    <th className="p-4">Document</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Chunks</th>
                    <th className="p-4">Health Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {ragHealth?.report.map((doc: any) => (
                    <tr key={doc.id} className="dark:text-slate-300">
                      <td className="p-4 font-bold">{doc.name}</td>
                      <td className="p-4"><span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${doc.status === 'ready' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{doc.status}</span></td>
                      <td className="p-4 font-mono">{doc.chunk_count}</td>
                      <td className={`p-4 font-bold text-xs ${doc.health_status === 'HEALTHY' ? 'text-emerald-500' : 'text-rose-500 animate-pulse'}`}>
                        {doc.health_status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-8 flex gap-4">
               <button onClick={handleBulkIndex} disabled={isIndexing} className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all flex items-center gap-3 shadow-xl">
                 {isIndexing ? <RefreshCw className="animate-spin" size={18} /> : <Zap size={18} />} Re-Sync Neural Grid
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const HealthCard = ({ label, value, total, status }: any) => (
  <div className={`p-6 rounded-[2rem] border flex flex-col gap-2 ${
    status === 'good' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
    status === 'critical' ? 'bg-rose-50 border-rose-100 text-rose-700' :
    'bg-amber-50 border-amber-100 text-amber-700'
  }`}>
    <span className="text-[10px] font-black uppercase tracking-widest opacity-60">{label}</span>
    <div className="text-3xl font-black">
      {value}{total ? <span className="text-sm opacity-40 ml-1">/ {total}</span> : ''}
    </div>
  </div>
);

export default BrainControl;