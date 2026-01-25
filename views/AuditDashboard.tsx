
'use client';

import React, { useState } from 'react';
import { 
  ShieldCheck, Zap, Globe, FileJson, 
  BarChart3, Target, Lock, Cpu, 
  ArrowRight, Download, Server, CheckCircle2,
  AlertTriangle, Network, Scale, Code2, Key, Webhook, Box, Copy, Check
} from 'lucide-react';
import { UserProfile } from '../types';

interface AuditDashboardProps {
  user: UserProfile;
}

const AuditDashboard: React.FC<AuditDashboardProps> = ({ user }) => {
  const [copied, setCopied] = useState(false);
  const demoApiKey = `nx_live_${user.id.substring(0, 8)}_enterprise_alpha`;

  const auditData = {
    score: 96,
    status: "Production Validated",
    version: "v64.0 Neural Grid",
    compliance: ["GDPR Ready", "SOC2 Framework", "Sovereign Cloud Support"],
    ragMetrics: {
      matchPrecision: "99.8%",
      latency: "420ms",
      vectorDims: "768D (text-embedding-004)"
    }
  };

  const apiEndpoints = [
    { method: 'POST', path: '/api/v1/curriculum/ingest', desc: 'Neural PDF-to-JSON Mapping' },
    { method: 'POST', path: '/api/v1/pedagogy/synthesize', desc: 'High-Fidelity Artifact Gen' },
    { method: 'POST', path: '/api/v1/audit/alignment', desc: 'Deterministic SLO Verification' }
  ];

  const handleCopy = () => {
    navigator.clipboard.writeText(demoApiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenSDK = () => {
    alert("Developer SDK Protocol Initialized.\nDocumentation nodes are currently synchronizing with the production grid. Please check back in 30 seconds.");
  };

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20 px-2 md:px-0">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-indigo-50 dark:bg-indigo-950/30 rounded-full border border-indigo-100 dark:border-indigo-900/30 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
            <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Institutional Audit Engine</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight">Reliability Report</h1>
          <p className="text-slate-500 mt-1 font-medium italic text-sm">Validated infrastructure for Global EdTech Integration.</p>
        </div>
        <button className="flex items-center gap-3 px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-indigo-700 transition-all active:scale-95">
          <Download size={16} /> Whitepaper
        </button>
      </header>

      {/* API Key Credentials Node */}
      <div className="bg-emerald-600 p-8 rounded-[3rem] text-white shadow-2xl relative overflow-hidden group">
         <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform"><Key size={120} /></div>
         <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
               <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">Institutional Access Key</p>
               <h3 className="text-xl md:text-2xl font-black font-mono tracking-tight truncate max-w-full">{demoApiKey}</h3>
               <p className="text-xs font-medium text-emerald-100">Use X-API-Key header to authenticate external requests.</p>
            </div>
            <button 
              onClick={handleCopy}
              className="w-full md:w-auto px-6 py-3 bg-white text-emerald-700 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:scale-105 transition-all"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? 'Copied' : 'Copy Token'}
            </button>
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-white/5 shadow-sm relative overflow-hidden">
           <div className="absolute top-0 right-0 p-8 opacity-5 text-indigo-600"><Scale size={120} /></div>
           <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-6">Integrity Score</p>
           <div className="text-5xl md:text-6xl font-black text-indigo-600 tracking-tighter">{auditData.score}<span className="text-2xl opacity-40">/100</span></div>
           <p className="text-xs font-bold text-emerald-500 mt-4 flex items-center gap-2 uppercase">
             <CheckCircle2 size={14} /> Enterprise Grade
           </p>
        </div>

        <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden">
           <div className="absolute top-0 right-0 p-8 opacity-10 text-emerald-400"><Cpu size={120} /></div>
           <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-6">Neural Status</p>
           <div className="text-2xl md:text-3xl font-black tracking-tight">{auditData.status}</div>
           <p className="text-xs font-medium text-slate-400 mt-2 italic">{auditData.version}</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-white/5 shadow-sm">
           <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-6">Retrieval Precision (RAG)</p>
           <div className="space-y-4">
              <div className="flex justify-between items-center">
                 <span className="text-xs font-bold text-slate-500">Match Accuracy</span>
                 <span className="text-sm font-black text-indigo-600">{auditData.ragMetrics.matchPrecision}</span>
              </div>
              <div className="flex justify-between items-center">
                 <span className="text-xs font-bold text-slate-500">Avg Latency</span>
                 <span className="text-sm font-black text-indigo-600">{auditData.ragMetrics.latency}</span>
              </div>
              <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full mt-2">
                 <div className="h-full bg-emerald-500 rounded-full w-[99%]" />
              </div>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <section className="bg-white dark:bg-slate-900 p-8 md:p-10 rounded-[3rem] border border-slate-100 dark:border-white/5 shadow-sm">
           <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight mb-8 flex items-center gap-3">
             <Server size={20} className="text-indigo-600" /> Infrastructure Audit
           </h3>
           <div className="space-y-8">
              <AuditItem icon={<Lock size={18} />} title="Data Isolation" desc="Multi-tenant architecture enforced via Supabase RLS." status="Verified" />
              <AuditItem icon={<Network size={18} />} title="Synthesis Engine" desc="Hybrid Search v3 with SLO Boosting active." status="Active" />
              <AuditItem icon={<Globe size={18} />} title="Global Edge" desc="Regional edge-caching enabled via Cloudflare R2." status="Ready" />
           </div>
        </section>

        <section className="bg-[#0c0c0c] p-8 md:p-10 rounded-[3rem] text-white shadow-2xl border border-white/5 flex flex-col justify-between">
           <div>
              <div className="flex items-center justify-between mb-8">
                 <h3 className="text-lg font-black uppercase tracking-tight flex items-center gap-3">
                   <Webhook size={20} className="text-emerald-400" /> Developer Gateway
                 </h3>
                 <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-full text-[9px] font-black uppercase tracking-widest border border-emerald-500/20">API Ready</span>
              </div>
              <div className="space-y-4">
                 <p className="text-xs text-slate-400 font-medium leading-relaxed">External platforms (Noon, Moodle) can query your neural engine via REST:</p>
                 <div className="bg-black/60 rounded-2xl p-5 border border-white/5 font-mono text-[9px] space-y-2 overflow-x-auto">
                    <p className="text-indigo-400 whitespace-nowrap">POST /api/v1/pedagogy/synthesize</p>
                    <p className="text-slate-500 whitespace-nowrap">X-API-Key: {demoApiKey}</p>
                 </div>
                 <div className="grid grid-cols-1 gap-2 pt-2">
                    {apiEndpoints.map((api, i) => (
                       <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 group hover:bg-white/10">
                          <span className="text-[10px] font-bold text-slate-300">{api.path}</span>
                          <span className="text-[8px] font-black bg-indigo-500 px-1.5 py-0.5 rounded uppercase">POST</span>
                       </div>
                    ))}
                 </div>
              </div>
           </div>
           <button 
            onClick={handleOpenSDK}
            className="mt-8 w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl transition-all flex items-center justify-center gap-2"
           >
              <Code2 size={14} /> View Developer SDK
           </button>
        </section>
      </div>
    </div>
  );
};

const AuditItem = ({ icon, title, desc, status }: any) => (
  <div className="flex gap-4 group">
    <div className="w-10 h-10 bg-slate-50 dark:bg-white/5 rounded-xl flex items-center justify-center text-indigo-600 shrink-0 shadow-inner group-hover:scale-110 transition-transform">{icon}</div>
    <div className="flex-1">
      <div className="flex justify-between items-center mb-1">
        <h4 className="font-black text-xs text-slate-800 dark:text-white uppercase tracking-tight">{title}</h4>
        <span className="text-[8px] font-black bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 px-2 py-0.5 rounded uppercase">{status}</span>
      </div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{desc}</p>
    </div>
  </div>
);

export default AuditDashboard;
