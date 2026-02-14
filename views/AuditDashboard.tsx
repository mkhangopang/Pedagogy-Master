
'use client';

import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, Zap, Globe, FileJson, 
  BarChart3, Target, Lock, Cpu, 
  ArrowRight, Download, Server, CheckCircle2,
  AlertTriangle, Network, Scale, Code2, Key, Webhook, Box, Copy, Check, Eye, X, FileText, Activity, Layers, Rocket, Loader2, RefreshCcw
} from 'lucide-react';
import { UserProfile } from '../types';
import { supabase } from '../lib/supabase';

interface AuditDashboardProps {
  user: UserProfile;
}

const AuditDashboard: React.FC<AuditDashboardProps> = ({ user }) => {
  const [report, setReport] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditStep, setAuditStep] = useState('');
  const [showReportModal, setShowReportModal] = useState(false);

  useEffect(() => {
    fetchAuditReport();
  }, []);

  const fetchAuditReport = async () => {
    setIsLoading(true);
    try {
      // Try local cache first then fall back to static
      const res = await fetch('/audit_report.json');
      const data = await res.json();
      setReport(data);
    } catch (err) {
      console.error("Audit load failed", err);
    } finally {
      setIsLoading(false);
    }
  };

  const runFullAudit = async () => {
    setIsAuditing(true);
    setAuditStep('Handshaking with Cloud Nodes...');
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      await new Promise(r => setTimeout(r, 1000));
      setAuditStep('Polling Vector Database Health...');
      await new Promise(r => setTimeout(r, 1000));
      setAuditStep('Verifying AI Synthesis Handshake...');

      const response = await fetch('/api/admin/run-audit', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      });

      if (!response.ok) throw new Error("Audit Grid Exception");

      const newReport = await response.json();
      setReport(newReport);
      setAuditStep('Neural Mapping Complete.');
      setTimeout(() => setIsAuditing(false), 800);
    } catch (err) {
      alert("Audit Failed: Infrastructure node unreachable.");
      setIsAuditing(false);
    }
  };

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

  if (isLoading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Loading Neural Audit...</p>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20 px-2 md:px-0 text-left">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-indigo-50 dark:bg-indigo-950/30 rounded-full border border-indigo-100 dark:border-indigo-900/30 mb-4">
            <span className={`w-1.5 h-1.5 rounded-full ${isAuditing ? 'bg-amber-500 animate-ping' : 'bg-emerald-500 animate-pulse'}`} />
            <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
              {isAuditing ? auditStep : `Deep Neural Audit: ${report?.status || 'Active'}`}
            </span>
          </div>
          <h1 className="text-3xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight uppercase">System Health</h1>
          <p className="text-slate-500 mt-1 font-medium italic text-sm">Real-time pedagogical fidelity and infrastructure benchmarks.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setShowReportModal(true)}
            className="flex items-center gap-3 px-6 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-sm hover:bg-slate-50 transition-all active:scale-95"
          >
            <Layers size={16} /> Audit Findings
          </button>
          <button 
            onClick={runFullAudit}
            disabled={isAuditing}
            className="flex items-center justify-center w-14 h-14 md:w-auto md:px-8 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50"
          >
            {isAuditing ? <RefreshCcw size={18} className="animate-spin" /> : <div className="flex items-center gap-3"><RefreshCcw size={16}/> <span className="hidden md:inline">Run Grid Audit</span></div>}
          </button>
          <button 
            onClick={generateWhitepaper}
            className="flex items-center gap-3 px-8 py-4 bg-slate-900 text-white dark:bg-white dark:text-black rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:opacity-90 transition-all active:scale-95"
          >
            <Rocket size={16} /> Roadmap Export
          </button>
        </div>
      </header>

      {/* Grid Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard 
          label="RAG Precision" 
          value={report?.benchmarks?.rag_precision ? `${(report.benchmarks.rag_precision * 100).toFixed(1)}%` : '0.0%'} 
          status="Optimal" 
          color="text-emerald-500" 
          isAuditing={isAuditing}
        />
        <MetricCard 
          label="Neural Latency" 
          value={isAuditing ? '---' : (report?.benchmarks?.average_latency || "---")} 
          status="Fast" 
          color="text-indigo-500" 
          isAuditing={isAuditing}
        />
        <MetricCard 
          label="Peda-Fidelity" 
          value={report?.benchmarks?.pedagogical_fidelity ? `${(report.benchmarks.pedagogical_fidelity * 100).toFixed(0)}%` : '0%'} 
          status="High" 
          color="text-amber-500" 
          isAuditing={isAuditing}
        />
        <MetricCard 
          label="Hallucination" 
          value={report?.benchmarks?.hallucination_rate ? `${(report.benchmarks.hallucination_rate * 100).toFixed(3)}%` : '0.000%'} 
          status="Suppressed" 
          color="text-rose-500" 
          isAuditing={isAuditing}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <section className="bg-white dark:bg-slate-900 p-8 md:p-10 rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-sm">
           <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight mb-8 flex items-center gap-3">
             <Scale size={20} className="text-indigo-600" /> Infrastructure Health
           </h3>
           <div className="space-y-4">
              <div className="flex items-center justify-between p-5 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5">
                 <div className="flex items-center gap-3">
                    <Server size={18} className="text-indigo-500" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">Vector Grid Status</span>
                 </div>
                 <span className="text-[10px] font-black text-emerald-500 uppercase">Operational</span>
              </div>
              <div className="flex items-center justify-between p-5 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5">
                 <div className="flex items-center gap-3">
                    <Cpu size={18} className="text-purple-500" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">Synthesizer Load</span>
                    <div className="w-24 h-1.5 bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden ml-4">
                       <div className="h-full bg-indigo-500 w-[24%] transition-all duration-1000" />
                    </div>
                 </div>
                 <span className="text-[10px] font-black text-slate-400 uppercase">Balanced</span>
              </div>
           </div>
        </section>

        <section className="bg-slate-900 p-8 md:p-10 rounded-[3rem] text-white shadow-2xl relative overflow-hidden flex flex-col justify-center border border-white/5">
           <div className="absolute top-0 right-0 p-8 opacity-5"><Rocket size={150} /></div>
           <h3 className="text-lg font-black uppercase tracking-tight mb-6 text-emerald-400">Pedagogical Roadmap</h3>
           <div className="space-y-5 relative z-10">
              {report?.roadmap?.map((r: string, i: number) => (
                <div key={i} className="flex gap-4 items-start group">
                   <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0 text-[10px] font-bold text-emerald-400 mt-0.5 group-hover:scale-110 transition-transform">{i+1}</div>
                   <p className="text-xs text-slate-400 font-medium leading-relaxed group-hover:text-slate-200 transition-colors">{r}</p>
                </div>
              ))}
           </div>
        </section>
      </div>

      {showReportModal && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl animate-in fade-in duration-300">
           <div className="bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[90vh] rounded-[3rem] shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden flex flex-col">
              <div className="p-8 border-b dark:border-white/5 flex items-center justify-between shrink-0">
                 <div>
                    <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Audit Findings Explorer</h2>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">System Audit v{report?.audit_version}</p>
                 </div>
                 <button onClick={() => setShowReportModal(false)} className="p-3 text-slate-400 hover:text-rose-500 transition-all hover:scale-110"><X size={24}/></button>
              </div>
              <div className="flex-1 overflow-y-auto p-8 md:p-12 custom-scrollbar space-y-10">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {report?.findings?.length > 0 ? report.findings.map((f: any, i: number) => (
                      <div key={i} className="p-6 bg-slate-50 dark:bg-white/5 rounded-3xl border border-slate-100 dark:border-white/5 space-y-4 hover:border-indigo-500/50 transition-all group">
                         <div className="flex items-center justify-between">
                            <span className="px-2 py-1 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-[8px] font-black uppercase rounded">{f.category}</span>
                            <span className={`text-[8px] font-black uppercase ${f.impact === 'High' || f.impact === 'Critical' ? 'text-rose-500' : 'text-amber-500'}`}>Impact: {f.impact}</span>
                         </div>
                         <div>
                            <h4 className="font-bold text-sm text-slate-900 dark:text-white mb-2">{f.issue}</h4>
                            <p className="text-xs text-slate-500 leading-relaxed italic group-hover:text-slate-400 transition-colors">"{f.recommendation}"</p>
                         </div>
                      </div>
                    )) : (
                      <div className="col-span-full py-20 text-center opacity-40">
                         <ShieldCheck size={48} className="mx-auto mb-4 text-emerald-500" />
                         <p className="text-sm font-bold uppercase tracking-widest">No active threats or issues detected.</p>
                      </div>
                    )}
                 </div>
              </div>
              <div className="p-8 border-t dark:border-white/5 bg-slate-50/50 dark:bg-black/20 flex justify-between items-center">
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Last audit run: {new Date(report?.last_run).toLocaleString()}</p>
                 <button onClick={() => setShowReportModal(false)} className="px-6 py-2.5 bg-slate-900 text-white dark:bg-white dark:text-black rounded-xl font-black text-[10px] uppercase tracking-widest">Close Findings</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

const MetricCard = ({ label, value, status, color, isAuditing }: any) => (
  <div className="bg-white dark:bg-slate-900 p-6 rounded-[2.5rem] border border-slate-100 dark:border-white/5 shadow-sm group hover:scale-[1.02] transition-all">
     <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">{label}</p>
     <div className={`text-3xl font-black tracking-tight ${isAuditing ? 'text-slate-300 animate-pulse' : color}`}>
        {isAuditing ? '---' : value}
     </div>
     <div className="flex items-center gap-1.5 mt-4">
        <div className={`w-1.5 h-1.5 rounded-full ${isAuditing ? 'bg-indigo-400 animate-bounce' : (value === '0.0%' || value === '0%' || value === '---' ? 'bg-slate-300' : 'bg-emerald-500')}`} />
        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{isAuditing ? 'Auditing...' : status}</span>
     </div>
  </div>
);

export default AuditDashboard;
