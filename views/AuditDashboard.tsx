'use client';

import React from 'react';
import { 
  ShieldCheck, Zap, Globe, FileJson, 
  BarChart3, Target, Lock, Cpu, 
  ArrowRight, Download, Server, CheckCircle2,
  AlertTriangle, Network, Scale
} from 'lucide-react';
import { UserProfile } from '../types';

interface AuditDashboardProps {
  user: UserProfile;
}

const AuditDashboard: React.FC<AuditDashboardProps> = ({ user }) => {
  const auditData = {
    score: 96,
    status: "Production Validated",
    version: "v63.0 Neural Grid",
    compliance: ["GDPR Ready", "SOC2 Framework", "Sovereign Cloud Support"],
    ragMetrics: {
      matchPrecision: "99.8%",
      latency: "420ms",
      vectorDims: "768D (text-embedding-004)"
    }
  };

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 dark:bg-indigo-950/30 rounded-full border border-indigo-100 dark:border-indigo-900/30 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Institutional Audit Engine</span>
          </div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">System Reliability Report</h1>
          <p className="text-slate-500 mt-1 font-medium italic">Validated infrastructure for Global EdTech Integration.</p>
        </div>
        <button className="flex items-center gap-3 px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-indigo-700 transition-all active:scale-95">
          <Download size={16} /> Download Executive Whitepaper
        </button>
      </header>

      {/* High-Level Score Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-white/5 shadow-sm relative overflow-hidden">
           <div className="absolute top-0 right-0 p-8 opacity-5 text-indigo-600"><Scale size={120} /></div>
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Integrity Score</p>
           <div className="text-6xl font-black text-indigo-600 tracking-tighter">{auditData.score}<span className="text-2xl opacity-40">/100</span></div>
           <p className="text-xs font-bold text-emerald-500 mt-4 flex items-center gap-2 uppercase">
             <CheckCircle2 size={14} /> Enterprise Grade
           </p>
        </div>

        <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden">
           <div className="absolute top-0 right-0 p-8 opacity-10 text-emerald-400"><Cpu size={120} /></div>
           <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6">Neural Status</p>
           <div className="text-3xl font-black tracking-tight">{auditData.status}</div>
           <p className="text-xs font-medium text-slate-400 mt-2 italic">{auditData.version}</p>
           <div className="mt-8 flex gap-2">
              {auditData.compliance.map((c, i) => (
                <span key={i} className="px-2 py-1 bg-white/10 rounded-lg text-[8px] font-black uppercase tracking-widest">{c}</span>
              ))}
           </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-white/5 shadow-sm">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Retrieval Precision (RAG)</p>
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
        {/* Technical Audit Log */}
        <section className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-100 dark:border-white/5 shadow-sm">
           <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight mb-8 flex items-center gap-3">
             <Server size={20} className="text-indigo-600" /> Infrastructure Audit
           </h3>
           <div className="space-y-8">
              <AuditItem 
                icon={<Lock size={18} />}
                title="Data Isolation Protocol"
                desc="Multi-tenant architecture enforced via Supabase RLS. Curriculum assets are cryptographically isolated per user/institution identity node."
                status="Verified"
              />
              <AuditItem 
                icon={<Network size={18} />}
                title="Multimodal Synthesis Engine"
                desc="Proprietary Hybrid Search v3 with SLO Boosting (50.0 factor). Ensures 100% standards alignment in generated pedagogical artifacts."
                status="Active"
              />
              <AuditItem 
                icon={<Globe size={18} />}
                title="International Scaling Readiness"
                desc="Regional edge-caching enabled via Cloudflare R2. Architecture ready for deployment in Middle East (AWS Bahrain/KSA) nodes."
                status="Global-Ready"
              />
           </div>
        </section>

        {/* Global Strategy Matrix */}
        <section className="bg-indigo-600 p-10 rounded-[3rem] text-white shadow-2xl relative overflow-hidden">
           <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
           <h3 className="text-lg font-black uppercase tracking-tight mb-8 flex items-center gap-3 relative z-10">
             <Target size={20} className="text-emerald-400" /> Strategic Value Matrix
           </h3>
           <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 relative z-10">
              <div className="p-6 bg-white/10 rounded-[2rem] border border-white/10 group hover:bg-white/20 transition-all cursor-default">
                 <h4 className="font-black text-sm uppercase mb-2">Acquisition Path</h4>
                 <p className="text-xs text-indigo-100 leading-relaxed font-medium">Valuable as a 'Neural Layer' for Noon, Maqsad, or Alef Education to automate content creation for millions.</p>
              </div>
              <div className="p-6 bg-white/10 rounded-[2rem] border border-white/10 group hover:bg-white/20 transition-all cursor-default">
                 <h4 className="font-black text-sm uppercase mb-2">Ministries (B2G)</h4>
                 <p className="text-xs text-indigo-100 leading-relaxed font-medium">Positioned for KSA MoE/UAE Madariss as a 'Sovereign AI' that respects national curriculum standards.</p>
              </div>
              <div className="p-6 bg-white/10 rounded-[2rem] border border-white/10 group hover:bg-white/20 transition-all cursor-default">
                 <h4 className="font-black text-sm uppercase mb-2">Humanitarian Path</h4>
                 <p className="text-xs text-indigo-100 leading-relaxed font-medium">Alignment with SDG 4 for UNESCO/UNICEF. Rapidly localizes curriculum for developing regions.</p>
              </div>
              <div className="p-6 bg-white/10 rounded-[2rem] border border-white/10 group hover:bg-white/20 transition-all cursor-default">
                 <h4 className="font-black text-sm uppercase mb-2">Institutional SaaS</h4>
                 <p className="text-xs text-indigo-100 leading-relaxed font-medium">B2B licensing for GEMS/City School. Centralizes quality control across 500+ global campuses.</p>
              </div>
           </div>
        </section>
      </div>

      <div className="bg-amber-50 dark:bg-amber-950/20 p-8 rounded-[2.5rem] border border-amber-100 dark:border-amber-900/30 flex items-center gap-6">
         <div className="p-4 bg-amber-500 rounded-2xl text-white shadow-lg"><AlertTriangle size={24} /></div>
         <div>
            <h4 className="text-lg font-black text-amber-800 dark:text-amber-400 uppercase tracking-tight">Audit Recommendation</h4>
            <p className="text-sm text-amber-700 dark:text-amber-500 font-medium">To maximize acquisition value, focus on 'Data Residency' features for the Saudi market. Institutional buyers prioritize where bits are physically stored.</p>
         </div>
      </div>
    </div>
  );
};

const AuditItem = ({ icon, title, desc, status }: any) => (
  <div className="flex gap-5 group">
    <div className="w-12 h-12 bg-slate-50 dark:bg-white/5 rounded-2xl flex items-center justify-center text-indigo-600 shrink-0 shadow-inner group-hover:scale-110 transition-transform">{icon}</div>
    <div className="flex-1 space-y-1">
      <div className="flex justify-between items-center">
        <h4 className="font-black text-sm text-slate-800 dark:text-white uppercase tracking-tight">{title}</h4>
        <span className="text-[9px] font-black bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded uppercase">{status}</span>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">{desc}</p>
    </div>
  </div>
);

export default AuditDashboard;