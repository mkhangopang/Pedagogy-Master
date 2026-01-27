'use client';

import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, Zap, Globe, FileJson, 
  BarChart3, Target, Lock, Cpu, 
  ArrowRight, Download, Server, CheckCircle2,
  AlertTriangle, Network, Scale, Code2, Key, Webhook, Box, Copy, Check, Eye, X, FileText, Activity, Layers, Rocket
} from 'lucide-react';
import { UserProfile } from '../types';

interface AuditDashboardProps {
  user: UserProfile;
}

const AuditDashboard: React.FC<AuditDashboardProps> = ({ user }) => {
  const [report, setReport] = useState<any>(null);
  const [showReportModal, setShowReportModal] = useState(false);

  useEffect(() => {
    fetch('/audit_report.json')
      .then(res => res.json())
      .then(data => setReport(data))
      .catch(err => console.error("Audit load failed", err));
  }, []);

  const generateWhitepaper = () => {
    if (!report) return;
    const roadmapText = report.roadmap.map((item: string) => `- ${item}`).join('\n');
    const content = `# EDUNEXUS AI: SYSTEM AUDIT v${report.audit_version}
Generated: ${new Date().toLocaleString()}

## 1. PERFORMANCE METRICS
- RAG Precision: ${(report.benchmarks.rag_precision * 100).toFixed(1)}%
- Hallucination Rate: ${(report.benchmarks.hallucination_rate * 100).toFixed(3)}%
- Latency: ${report.benchmarks.average_latency}

## 2. WORLD-CLASS ROADMAP
${roadmapText}

STATUS: ${report.benchmarks.infrastructure_health}
`;
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `EduNexus_Whitepaper_${Date.now()}.md`;
    link.click();
  };

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20 px-2 md:px-0 text-left">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-indigo-50 dark:bg-indigo-950/30 rounded-full border border-indigo-100 dark:border-indigo-900/30 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Deep Neural Audit: Operational</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight uppercase">System Health</h1>
          <p className="text-slate-500 mt-1 font-medium italic text-sm">Real-time pedagogical fidelity and infrastructure benchmarks.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setShowReportModal(true)}
            className="flex items-center gap-3 px-6 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-sm hover:bg-slate-50 transition-all"
          >
            <Layers size={16} /> Audit Findings
          </button>
          <button 
            onClick={generateWhitepaper}
            className="flex items-center gap-3 px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-indigo-700 transition-all active:scale-95"
          >
            <Rocket size={16} /> Roadmap Export
          </button>
        </div>
      </header>

      {/* Grid Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard label="RAG Precision" value={`${((report?.benchmarks?.rag_precision || 0) * 100).toFixed(1)}%`} status="Optimal" color="text-emerald-500" />
        <MetricCard label="Neural Latency" value={report?.benchmarks?.average_latency || "..."} status="Fast" color="text-indigo-500" />
        <MetricCard label="Peda-Fidelity" value={`${((report?.benchmarks?.pedagogical_fidelity || 0) * 100).toFixed(0)}%`} status="High" color="text-amber-500" />
        <MetricCard label="Hallucination" value={`${((report?.benchmarks?.hallucination_rate || 0) * 100).toFixed(3)}%`} status="Suppressed" color="text-rose-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <section className="bg-white dark:bg-slate-900 p-8 md:p-10 rounded-[3rem] border border-slate-100 dark:border-white/5 shadow-sm">
           <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight mb-8 flex items-center gap-3">
             <Scale size={20} className="text-indigo-600" /> Compliance Frameworks
           </h3>
           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {report?.compliance?.map((c: string) => (
                <div key={c} className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl flex items-center gap-3 border border-slate-100 dark:border-white/5">
                   <ShieldCheck size={18} className="text-emerald-500" />
                   <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">{c}</span>
                </div>
              ))}
           </div>
        </section>

        <section className="bg-slate-900 p-8 md:p-10 rounded-[3rem] text-white shadow-2xl relative overflow-hidden flex flex-col justify-center">
           <div className="absolute top-0 right-0 p-8 opacity-5"><Rocket size={150} /></div>
           <h3 className="text-lg font-black uppercase tracking-tight mb-4 text-emerald-400">Assistant Roadmap</h3>
           <div className="space-y-4 relative z-10">
              {report?.roadmap?.slice(0, 3).map((r: string, i: number) => (
                <div key={i} className="flex gap-4 items-start">
                   <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0 text-[10px] font-bold text-emerald-400 mt-0.5">{i+1}</div>
                   <p className="text-xs text-slate-400 font-medium leading-relaxed">{r}</p>
                </div>
              ))}
           </div>
        </section>
      </div>

      {showReportModal && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl animate-in fade-in duration-300">
           <div className="bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[90vh] rounded-[3rem] shadow-2xl border border-white/10 overflow-hidden flex flex-col">
              <div className="p-8 border-b dark:border-white/5 flex items-center justify-between shrink-0">
                 <div>
                    <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Audit Findings Explorer</h2>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">System Audit v{report?.audit_version}</p>
                 </div>
                 <button onClick={() => setShowReportModal(false)} className="p-3 text-slate-400 hover:text-rose-500 transition-all"><X size={24}/></button>
              </div>
              <div className="flex-1 overflow-y-auto p-12 custom-scrollbar space-y-10">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {report?.findings?.map((f: any, i: number) => (
                      <div key={i} className="p-6 bg-slate-50 dark:bg-white/5 rounded-3xl border border-slate-100 dark:border-white/5 space-y-4">
                         <div className="flex items-center justify-between">
                            <span className="px-2 py-1 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-[8px] font-black uppercase rounded">{f.category}</span>
                            <span className={`text-[8px] font-black uppercase ${f.impact === 'High' ? 'text-rose-500' : 'text-amber-500'}`}>Impact: {f.impact}</span>
                         </div>
                         <div>
                            <h4 className="font-bold text-sm text-slate-900 dark:text-white mb-1">{f.issue}</h4>
                            <p className="text-xs text-slate-500 leading-relaxed italic">"{f.recommendation}"</p>
                         </div>
                      </div>
                    ))}
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

const MetricCard = ({ label, value, status, color }: any) => (
  <div className="bg-white dark:bg-slate-900 p-6 rounded-[2.5rem] border border-slate-100 dark:border-white/5 shadow-sm group hover:scale-[1.02] transition-all">
     <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">{label}</p>
     <div className={`text-3xl font-black tracking-tight ${color}`}>{value}</div>
     <div className="flex items-center gap-1.5 mt-4">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{status}</span>
     </div>
  </div>
);

export default AuditDashboard;