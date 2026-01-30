import React, { useEffect, useState } from 'react';
import { Activity, ShieldCheck, Zap, Server, Cpu, Layers } from 'lucide-react';

export const ProviderStatusBar: React.FC = () => {
  const [status, setStatus] = useState<any[]>([]);
  const [show, setShow] = useState(true);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/ai-status');
      const data = await res.json();
      setStatus(data.providers);
    } catch (e) {}
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!show || status.length === 0) return null;

  const getNodeIcon = (name: string) => {
    switch(name) {
      case 'gemini': return <Layers size={10} className="text-indigo-400" />;
      case 'cerebras': return <Zap size={10} className="text-amber-400" />;
      case 'groq': return <Cpu size={10} className="text-emerald-400" />;
      default: return <Server size={10} className="text-slate-400" />;
    }
  };

  const getNodeTooltip = (name: string) => {
    const tools: Record<string, string> = {
      gemini: "Primary Node: 1M Token Context (Curriculum Logic)",
      cerebras: "Speed Node: Instant Response (<2s)",
      groq: "Logic Node: Optimized Pedagogy Reasoning",
      sambanova: "Throughput Node: Bulk SLO Extraction",
      deepseek: "Analytical Node: Standards Mapping",
      hyperbolic: "Resilience Node: Secondary Fallback",
      openrouter: "Gateway Node: Multi-Model Failover"
    };
    return tools[name] || "General Neural Node";
  };

  return (
    <div className="bg-slate-950/90 backdrop-blur-xl border-b border-white/5 px-4 py-2 flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-slate-500 animate-in slide-in-from-top duration-500">
      <div className="flex items-center gap-4 md:gap-8 overflow-x-auto no-scrollbar">
        <span className="flex items-center gap-1.5 shrink-0 text-white opacity-40"><Activity size={10} /> 7-Node Grid</span>
        <div className="flex items-center gap-5">
          {status.map(p => {
            const isOperational = p.enabled && (p.remaining?.minute > 0 || !p.remaining);
            const isUnconfigured = !p.enabled;
            const isThrottled = p.enabled && p.remaining?.minute <= 0;

            return (
              <div 
                key={p.name} 
                className="flex items-center gap-2 group transition-all" 
                title={isUnconfigured ? "Key missing in Vercel Env" : getNodeTooltip(p.name)}
              >
                <div className={`w-1.5 h-1.5 rounded-full transition-all ${
                  isOperational ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 
                  isThrottled ? 'bg-amber-500 animate-pulse' : 'bg-rose-500 opacity-30'
                }`} />
                <div className="flex items-center gap-1 hover:text-white cursor-help">
                  {getNodeIcon(p.name)}
                  <span className={p.enabled ? 'text-slate-300' : 'text-slate-600'}>
                    {p.name} 
                    {p.remaining && <span className="ml-1 opacity-30 group-hover:opacity-100">({p.remaining.minute})</span>}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <button onClick={() => setShow(false)} className="ml-4 hover:text-rose-400 transition-colors shrink-0">✕</button>
    </div>
  );
};