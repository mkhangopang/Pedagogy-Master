
import React, { useEffect, useState } from 'react';
import { Activity, AlertCircle, Zap } from 'lucide-react';

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

  return (
    <div className="bg-slate-900/50 backdrop-blur-md border-b border-white/5 px-4 py-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-slate-400">
      <div className="flex items-center gap-6">
        <span className="flex items-center gap-1.5"><Activity size={10} className="text-indigo-400" /> Neural Grid</span>
        <div className="flex items-center gap-4">
          {status.map(p => {
            const isOperational = p.enabled && p.remaining.minute > 0;
            const isUnconfigured = !p.enabled;
            const isThrottled = p.enabled && p.remaining.minute <= 0;

            return (
              <div key={p.name} className="flex items-center gap-2" title={isUnconfigured ? "Key missing (Checked API_KEY/GEMINI_API_KEY)" : ""}>
                <div className={`w-1.5 h-1.5 rounded-full ${
                  isOperational ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 
                  isThrottled ? 'bg-amber-500' : 'bg-rose-500'
                }`} />
                <span className={p.enabled ? 'text-slate-300' : 'text-slate-600'}>
                  {p.name} 
                  {isUnconfigured ? (
                    <span className="ml-1 opacity-50 text-[8px] font-black text-rose-400">(MISSING KEY)</span>
                  ) : (
                    <span className="opacity-50">({p.remaining.minute}/{p.limits.rpm})</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <button onClick={() => setShow(false)} className="hover:text-white transition-colors">Dismiss</button>
    </div>
  );
};
