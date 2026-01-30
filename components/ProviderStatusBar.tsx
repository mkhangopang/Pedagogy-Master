import React, { useEffect, useState } from 'react';
import { Activity, ShieldCheck, Zap, Server, Cpu, Layers, AlertCircle } from 'lucide-react';

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
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  if (!show || status.length === 0) return null;

  return (
    <div className="bg-slate-950/95 backdrop-blur-xl border-b border-white/5 px-4 py-3 flex flex-col gap-2 animate-in slide-in-from-top duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
           <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_#10b981]" />
           <span className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">7-Node Neural Grid v10.0</span>
        </div>
        <button onClick={() => setShow(false)} className="text-slate-500 hover:text-white transition-colors">✕</button>
      </div>

      <div className="flex items-center gap-6 overflow-x-auto no-scrollbar pb-1">
        {status.map(p => (
          <div key={p.id} className="flex items-center gap-2.5 shrink-0 group">
             <div className={`w-1.5 h-1.5 rounded-full ${
               p.status === 'active' ? 'bg-emerald-500' :
               p.status === 'rate-limited' ? 'bg-amber-500' :
               p.status === 'failed' ? 'bg-rose-500' : 'bg-slate-700'
             }`} />
             <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-black uppercase tracking-tight ${p.status === 'disabled' ? 'text-slate-600' : 'text-slate-200'}`}>
                    {p.name}
                  </span>
                  {p.tier === 1 && <Zap size={8} className="text-amber-400" />}
                </div>
                <div className="flex items-center gap-2">
                   <span className="text-[8px] font-bold text-slate-500 uppercase">{p.status}</span>
                   {p.status === 'active' && <span className="text-[8px] font-black text-indigo-400">{p.remaining} REQ LEFT</span>}
                </div>
             </div>
          </div>
        ))}
      </div>
    </div>
  );
};