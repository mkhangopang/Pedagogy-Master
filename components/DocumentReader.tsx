'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { X, Copy, Check, Search, FileText, LayoutList, BookOpen, BrainCircuit, Hash, History, RefreshCw, Layers } from 'lucide-react';
import { Document, SLO } from '../types';
import { renderSTEM } from '../lib/math-renderer';
import { supabase } from '../lib/supabase';
import { parseSLOCode } from '../lib/rag/slo-parser';

// Fix: Added explicit interface for SLO data from status endpoint to resolve "type unknown" issues
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
  // Fix: Explicitly typed state to SloRecord[] instead of any[]
  const [slos, setSlos] = useState<SloRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSlos = async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        
        const res = await fetch(`/api/docs/status/${activeDoc.id}`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        const data = await res.json();
        setSlos(data.slos || []);
      } catch (e) {
        console.error("Ledger Fetch Error:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchSlos();
  }, [activeDoc.id]);

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Fix: Explicitly typed the groups record to Record<string, SloRecord[]>
  const groupedSlos = useMemo(() => {
    const filtered = slos.filter(s => 
      s.slo_code.toLowerCase().includes(searchTerm.toLowerCase()) || 
      s.slo_full_text.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const groups: Record<string, SloRecord[]> = {};
    filtered.forEach(slo => {
      const parsed = parseSLOCode(slo.slo_code);
      const domain = parsed ? `Domain ${parsed.domain}` : 'Core Objectives';
      if (!groups[domain]) groups[domain] = [];
      groups[domain].push(slo);
    });

    return groups;
  }, [slos, searchTerm]);

  return (
    <div className="fixed inset-0 z-[500] bg-white dark:bg-[#050505] flex flex-col animate-in fade-in duration-300 overflow-hidden text-left">
      <header className="h-16 border-b dark:border-white/5 bg-white dark:bg-[#0a0a0a] flex items-center justify-between px-6 shrink-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white"><LayoutList size={18}/></div>
          <div>
            <h2 className="text-[10px] font-black uppercase tracking-widest dark:text-white truncate max-w-xs">{activeDoc.name}</h2>
            <p className="text-[7px] font-bold text-slate-400 uppercase tracking-[0.2em]">Surgical Ledger Node v5.0</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
            <input 
              type="text" 
              placeholder="Search SLOs..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-4 py-1.5 bg-slate-50 dark:bg-white/5 border-none rounded-full text-[10px] font-bold outline-none focus:ring-1 focus:ring-indigo-500 w-48 transition-all"
            />
          </div>
          <div className="bg-slate-100 dark:bg-white/5 p-1 rounded-lg flex gap-1">
             <button onClick={() => setViewMode('ledger')} className={`px-4 py-1.5 rounded-md text-[9px] font-black uppercase transition-all ${viewMode === 'ledger' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-400'}`}>Ledger</button>
             <button onClick={() => setViewMode('raw')} className={`px-4 py-1.5 rounded-md text-[9px] font-black uppercase transition-all ${viewMode === 'raw' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-400'}`}>Full MD</button>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 transition-colors"><X size={20}/></button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/30 dark:bg-[#050505]">
        <div className="max-w-4xl mx-auto p-6 md:p-12">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-40 text-center opacity-40">
               <RefreshCw size={40} className="animate-spin text-indigo-600 mb-6" />
               <p className="text-[10px] font-black uppercase tracking-[0.3em]">Synching Neural Records...</p>
            </div>
          ) : viewMode === 'raw' ? (
            <div className="bg-white dark:bg-[#0a0a0a] p-10 rounded-[2.5rem] border border-slate-200 dark:border-white/5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap dark:text-slate-300 shadow-inner">
               <div className="flex items-center gap-2 mb-8 opacity-30 uppercase text-[9px] font-black tracking-widest"><History size={12} /> Master Markdown Archive</div>
               {activeDoc.extractedText}
            </div>
          ) : slos.length > 0 ? (
            <div className="space-y-16">
              {/* Fix: Added explicit sorting function to resolve "unknown" map property error on line 119 */}
              {Object.entries(groupedSlos).sort((a, b) => a[0].localeCompare(b[0])).map(([domain, items]) => (
                <div key={domain} className="space-y-6">
                   <div className="flex items-center gap-4">
                      <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 rounded-xl"><Layers size={18}/></div>
                      <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-900 dark:text-white">{domain}</h3>
                      <div className="h-px bg-slate-100 dark:bg-white/5 flex-1" />
                   </div>

                   <div className="grid grid-cols-1 gap-3">
                      {items.map((slo) => (
                        <div key={slo.id} className="flex gap-4 p-5 bg-white dark:bg-[#0a0a0a] rounded-2xl border border-slate-100 dark:border-white/5 hover:border-indigo-500 group transition-all shadow-sm">
                           <button 
                             onClick={() => handleCopy(slo.slo_code)}
                             className="shrink-0 h-fit flex items-center justify-between gap-4 px-4 py-2 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-indigo-600 hover:text-white group-hover:border-indigo-500 transition-all min-w-[130px]"
                           >
                              <span className="text-[10px] font-black tracking-wider uppercase">{slo.slo_code}</span>
                              {copiedCode === slo.slo_code ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} className="opacity-30" />}
                           </button>
                           <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-[8px] font-black text-slate-400 uppercase bg-slate-100 dark:bg-white/10 px-2 py-0.5 rounded tracking-tighter">{slo.bloom_level || 'Understand'}</span>
                              </div>
                              <p className="text-[13px] font-medium text-slate-700 dark:text-slate-300 leading-relaxed" dangerouslySetInnerHTML={{ __html: renderSTEM(slo.slo_full_text) }} />
                           </div>
                        </div>
                      ))}
                   </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-40 text-center opacity-30">
               <BrainCircuit size={64} className="mb-6 text-slate-300" />
               <h3 className="text-lg font-black uppercase tracking-[0.2em]">Ledger Offline</h3>
               <p className="text-xs font-medium max-w-xs mt-3 leading-relaxed">No surgical SLOs detected in the vault index. Use 'Mission Control' to re-index this asset.</p>
            </div>
          )}
        </div>
      </main>

      <footer className="h-10 border-t dark:border-white/5 bg-white dark:bg-[#0a0a0a] flex items-center justify-between px-8 shrink-0">
         <div className="flex items-center gap-2">
           <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
           <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Click code to auto-copy for Synthesis Hub refinement</span>
         </div>
         <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">A-Z Sequence Map Active</span>
      </footer>
    </div>
  );
};
