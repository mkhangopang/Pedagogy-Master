'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { 
  X, Copy, Check, Search, LayoutList, 
  BrainCircuit, History, RefreshCw, Layers, 
  BookOpen, Hash, ArrowRight, ShieldCheck,
  FileCode, Terminal
} from 'lucide-react';
import { Document } from '../types';
import { renderSTEM } from '../lib/math-renderer';
import { supabase } from '../lib/supabase';
import { parseSLOCode } from '../lib/rag/slo-parser';

interface SloRecord {
  id: string;
  document_id: string;
  slo_code: string;
  slo_full_text: string;
  bloom_level?: string;
  created_at: string;
}

interface DocumentReaderProps {
  document: Document;
  onClose: () => void;
}

export const DocumentReader: React.FC<DocumentReaderProps> = ({ document: activeDoc, onClose }) => {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'ledger' | 'raw'>('ledger');
  const [slos, setSlos] = useState<SloRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSlos = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      const res = await fetch(`/api/docs/status/${activeDoc.id}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      
      if (!res.ok) throw new Error("Status Fetch Fault");
      
      const data = await res.json();
      setSlos(data.slos || []);
    } catch (e) {
      console.error("Ledger Fetch Error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSlos();
  }, [activeDoc.id]);

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const groupedSlos = useMemo(() => {
    const filtered = slos.filter(s => 
      s.slo_code.toLowerCase().includes(searchTerm.toLowerCase()) || 
      s.slo_full_text.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const groups: Record<string, SloRecord[]> = {};
    filtered.forEach(slo => {
      const parsed = parseSLOCode(slo.slo_code);
      const domainLabel = parsed ? `Domain ${parsed.domain}` : 'General Curriculum';
      if (!groups[domainLabel]) groups[domainLabel] = [];
      groups[domainLabel].push(slo);
    });

    return groups;
  }, [slos, searchTerm]);

  return (
    <div className="fixed inset-0 z-[500] bg-white dark:bg-[#020202] flex flex-col animate-in fade-in duration-300 overflow-hidden text-left">
      {/* Header Layer */}
      <header className="h-20 border-b dark:border-white/5 bg-white dark:bg-[#080808] flex items-center justify-between px-8 shrink-0 z-50 shadow-sm">
        <div className="flex items-center gap-5">
          <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl">
            <LayoutList size={22}/>
          </div>
          <div>
            <h2 className="text-xs font-black uppercase tracking-[0.2em] dark:text-white truncate max-w-sm">{activeDoc.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest px-2 py-0.5 bg-slate-100 dark:bg-white/5 rounded">Surgical Ledger Node</span>
              <span className="text-[8px] font-bold text-emerald-500 uppercase tracking-widest px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/20 rounded">Verified Grid</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="relative hidden md:block">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Filter SLO Codes..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-6 py-2.5 bg-slate-50 dark:bg-white/5 border-none rounded-2xl text-[11px] font-black uppercase tracking-widest outline-none focus:ring-2 focus:ring-indigo-500 w-64 transition-all"
            />
          </div>

          <div className="bg-slate-100 dark:bg-white/5 p-1 rounded-2xl flex gap-1 border dark:border-white/5 shadow-inner">
             <button 
               onClick={() => setViewMode('ledger')} 
               className={`flex items-center gap-2 px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'ledger' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-md scale-105' : 'text-slate-500'}`}
             >
               <BookOpen size={14}/> Ledger
             </button>
             <button 
               onClick={() => setViewMode('raw')} 
               className={`flex items-center gap-2 px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'raw' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-md scale-105' : 'text-slate-500'}`}
             >
               <Terminal size={14}/> Master MD
             </button>
          </div>

          <div className="w-px h-8 bg-slate-200 dark:bg-white/5" />
          
          <button onClick={onClose} className="p-3 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-2xl transition-all">
            <X size={24}/>
          </button>
        </div>
      </header>

      {/* Content Layer */}
      <main className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/20 dark:bg-[#020202]">
        <div className="max-w-6xl mx-auto p-6 md:p-12 lg:p-20">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-60 text-center opacity-40">
               <RefreshCw size={48} className="animate-spin text-indigo-600 mb-8" />
               <p className="text-xs font-black uppercase tracking-[0.4em] text-indigo-500">Synchronizing Neural Records...</p>
            </div>
          ) : viewMode === 'raw' ? (
            <div className="bg-white dark:bg-[#080808] p-10 md:p-20 rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-2xl animate-in slide-in-from-bottom-4">
               <div className="flex items-center justify-between mb-12 opacity-40">
                 <div className="flex items-center gap-3">
                   <History size={16} className="text-indigo-500" />
                   <span className="text-[10px] font-black uppercase tracking-[0.3em]">Master Linearized Archive</span>
                 </div>
                 <div className="text-[8px] font-bold uppercase tracking-widest px-3 py-1 bg-slate-100 dark:bg-white/5 rounded-full">MD v112.0</div>
               </div>
               <div className="prose dark:prose-invert max-w-none font-mono text-sm leading-relaxed whitespace-pre-wrap dark:text-slate-300">
                  {activeDoc.extractedText || "<!-- Vault Error: Extraction layer empty. -->"}
               </div>
            </div>
          ) : slos.length > 0 ? (
            <div className="space-y-24">
              {/* Add comment above each fix */}
              {/* Fix: Explicitly typecast Object.entries result to ensure 'items' is recognized as SloRecord[] instead of unknown */}
              {(Object.entries(groupedSlos) as [string, SloRecord[]][]).sort().map(([domain, items]) => (
                <section key={domain} className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                   <div className="flex items-center gap-6 mb-8">
                      <div className="p-3 bg-indigo-600 text-white rounded-2xl flex items-center justify-center text-white shadow-xl">
                        <Layers size={22}/>
                      </div>
                      <div>
                        <h3 className="text-xl font-black uppercase tracking-[0.1em] text-slate-900 dark:text-white">{domain}</h3>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">{items.length} Surgical Standards Indexed</p>
                      </div>
                      <div className="h-px bg-slate-200 dark:bg-white/5 flex-1 ml-4" />
                   </div>

                   <div className="grid grid-cols-1 gap-4">
                      {items.map((slo) => (
                        <div key={slo.id} className="group relative flex flex-col md:flex-row gap-6 p-6 bg-white dark:bg-[#080808] rounded-[2rem] border border-slate-100 dark:border-white/5 hover:border-indigo-400 hover:shadow-2xl transition-all duration-300">
                           <div className="md:w-48 shrink-0 space-y-4">
                             <button 
                               onClick={() => handleCopy(slo.slo_code)}
                               className="w-full flex items-center justify-between gap-3 px-5 py-3 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/10 hover:bg-indigo-600 hover:text-white transition-all group-hover:scale-[1.02]"
                             >
                                <span className="text-[11px] font-black tracking-widest uppercase">{slo.slo_code}</span>
                                {copiedCode === slo.slo_code ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} className="opacity-20 group-hover:opacity-100" />}
                             </button>
                             <div className="flex flex-wrap gap-2">
                               <span className="text-[8px] font-black uppercase tracking-widest text-slate-500 bg-slate-100 dark:bg-white/10 px-2 py-1 rounded-lg border dark:border-white/5">{slo.bloom_level || 'Understand'}</span>
                             </div>
                           </div>

                           <div className="flex-1 min-w-0 md:pt-1">
                              <p className="text-[15px] font-medium text-slate-800 dark:text-slate-200 leading-relaxed selection:bg-indigo-500 selection:text-white" 
                                 dangerouslySetInnerHTML={{ __html: renderSTEM(slo.slo_full_text) }} />
                           </div>

                           <button 
                             onClick={() => handleCopy(slo.slo_code)}
                             className="absolute right-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-full hover:scale-110 transition-all hidden md:flex"
                             title="Copy Code to Synthesis Hub"
                           >
                             <ArrowRight size={20} />
                           </button>
                        </div>
                      ))}
                   </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-40 text-center animate-in zoom-in-95 duration-700">
               <div className="w-24 h-24 bg-slate-100 dark:bg-white/5 rounded-[2.5rem] flex items-center justify-center mb-10 text-slate-300">
                 <BrainCircuit size={48} />
               </div>
               <h3 className="text-2xl font-black uppercase tracking-[0.2em] text-slate-900 dark:text-white">Ledger Fragmented</h3>
               <p className="text-sm font-medium text-slate-500 max-w-sm mt-4 leading-relaxed italic">
                 No surgical SLOs detected in the neural grid. The document might still be unrolling or requires a manual re-index.
               </p>
               <button 
                 onClick={fetchSlos}
                 className="mt-12 flex items-center gap-3 px-10 py-5 bg-indigo-600 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-2xl hover:bg-indigo-700 active:scale-95 transition-all"
               >
                 <RefreshCw size={16} /> Force Handshake
               </button>
            </div>
          )}
        </div>
      </main>

      {/* Sticky Bottom Layer */}
      <footer className="h-12 border-t dark:border-white/5 bg-white dark:bg-[#080808] flex items-center justify-between px-10 shrink-0 z-50">
         <div className="flex items-center gap-3">
           <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]" />
           <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.3em]">Institutional Standard Protocol v14 Active</span>
         </div>
         <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <ShieldCheck size={12} className="text-indigo-500" />
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Grounded Synthesis Hub</span>
            </div>
            <span className="text-[8px] font-black text-slate-300 uppercase tracking-[0.2em]">SINDH-FEDERAL-CAMBRIDGE COMPLIANT</span>
         </div>
      </footer>
    </div>
  );
};