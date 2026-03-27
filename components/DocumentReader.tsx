'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { 
  X, Copy, Check, Search, LayoutList, 
  BrainCircuit, History, RefreshCw, Layers, 
  BookOpen, Hash, ArrowRight, ShieldCheck,
  FileCode, Terminal, AlertTriangle, Zap, Loader2
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
  cognitive_complexity?: string;
  keywords?: string[];
  created_at: string;
  grade_level?: string;
  domain_tag?: string;
  domain_name?: string;
}

interface DocumentReaderProps {
  document: Document;
  onClose: () => void;
}

export const DocumentReader: React.FC<DocumentReaderProps> = ({ document: activeDoc, onClose }) => {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'ledger' | 'raw'>('ledger');
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [slos, setSlos] = useState<SloRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isReindexing, setIsReindexing] = useState(false);
  const [jobStatus, setJobStatus] = useState<string | null>(null);

  const fetchSlos = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      const res = await fetch(`/api/docs/status/${activeDoc.id}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error("Status Fetch Fault:", errData);
        throw new Error(`Status Fetch Fault (Status: ${res.status})`);
      }
      
      const data = await res.json();
      console.log("Fetched SLO data:", data);
      setSlos(data.slos || []);
      setExtractedText(data.extracted_text || null);
      setJobStatus(data.status);
    } catch (e) {
      console.error("Ledger Fetch Error:", e);
    } finally {
      setLoading(false);
    }
  }, [activeDoc.id]);

  const handleReindex = useCallback(async (isAutoArg: any = false, isDeep: boolean = false) => {
    const isAuto = typeof isAutoArg === 'boolean' ? isAutoArg : false;
    if (jobStatus === 'processing' || jobStatus === 'indexing') {
      if (!isAuto) alert("A background task is already active for this document.");
      return;
    }

    setIsReindexing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/docs/process/${activeDoc.id}${isDeep ? '?deep=true' : ''}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      if (res.ok) {
        if (!isAuto) alert(isDeep ? "Deep Scan initiated. The neural grid is performing a recursive pedagogical audit." : "Re-indexing started. The neural grid is extracting surgical artifacts.");
        setJobStatus('processing');
      } else {
        const err = await res.json();
        if (!isAuto) alert(err.error || "Extraction refused.");
      }
    } catch (e) {
      if (!isAuto) alert("Connectivity error.");
    } finally {
      setIsReindexing(false);
    }
  }, [activeDoc.id, jobStatus]);

  useEffect(() => {
    fetchSlos();
  }, [activeDoc.id, fetchSlos]);

  const isWorking = jobStatus === 'processing' || jobStatus === 'indexing' || jobStatus === 'draft';

  // Automatic polling when processing
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isWorking) {
      interval = setInterval(() => {
        fetchSlos();
      }, 5000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isWorking, fetchSlos]);

  const isLedger = useMemo(() => {
    const t = extractedText?.trim();
    return t?.startsWith('Board:') || t?.startsWith('```json') || t?.startsWith('{');
  }, [extractedText]);

  // Auto-trigger extraction if empty and not working
  useEffect(() => {
    const timer = setTimeout(() => {
      // If we have no SLOs and we are not working, we should check if we need to start
      // Case 1: Fresh document (no extractedText, no jobStatus)
      // Case 2: Stuck document (jobStatus complete/null but slos.length 0)
      // Case 3: Raw text exists but no SLOs in DB
      const isFresh = !extractedText && (!jobStatus || jobStatus === 'pending');
      const isStuck = slos.length === 0 && (jobStatus === 'complete' || !jobStatus);
      const needsRepair = !loading && !isWorking && !isReindexing && (isFresh || isStuck);
      
      if (needsRepair) {
        console.log("Auto-triggering extraction: Empty ledger or fresh document detected.");
        handleReindex(true);
      }
    }, 2000); // 2s delay to ensure initial load is stable
    return () => clearTimeout(timer);
  }, [loading, slos.length, isWorking, isReindexing, jobStatus, extractedText, handleReindex]);

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

    const groups: Record<string, Record<string, SloRecord[]>> = {};
    filtered.forEach(slo => {
      const grade = slo.grade_level || 'Ungraded';
      const domain = slo.domain_name || slo.domain_tag || 'Core Curriculum';
      
      if (!groups[grade]) groups[grade] = {};
      if (!groups[grade][domain]) groups[grade][domain] = [];
      groups[grade][domain].push(slo);
    });

    return groups;
  }, [slos, searchTerm]);

  return (
    <div className="fixed inset-0 z-[500] bg-white dark:bg-[#020202] flex flex-col animate-in fade-in duration-300 overflow-hidden text-left">
      <header className="h-16 md:h-20 border-b dark:border-white/5 bg-white dark:bg-[#080808] flex items-center justify-between px-4 md:px-8 shrink-0 z-50 shadow-sm">
        <div className="flex items-center gap-2 md:gap-5 min-w-0">
          <div className="w-8 h-8 md:w-10 md:h-10 bg-indigo-600 rounded-lg md:rounded-2xl flex items-center justify-center text-white shadow-xl shrink-0">
            <LayoutList size={16} className="md:hidden"/>
            <LayoutList size={22} className="hidden md:block"/>
          </div>
          <div className="min-w-0">
            <h2 className="text-[9px] md:text-xs font-black uppercase tracking-[0.1em] md:tracking-[0.2em] dark:text-white truncate max-w-[120px] md:max-w-sm">{activeDoc.name}</h2>
            <div className="flex items-center gap-1 md:gap-2 mt-0.5 md:mt-1">
              <span className="text-[6px] md:text-[8px] font-bold text-slate-400 uppercase tracking-widest px-1 md:px-2 py-0.5 bg-slate-100 dark:bg-white/5 rounded">Node</span>
              <span className={`text-[6px] md:text-[8px] font-bold uppercase tracking-widest px-1 md:px-2 py-0.5 rounded ${isWorking ? 'bg-amber-50 text-amber-500 animate-pulse' : 'bg-emerald-50 text-emerald-500'}`}>
                {isWorking ? 'Syncing' : 'Verified'}
              </span>
              {isWorking && <span className="text-[6px] md:text-[8px] font-black text-indigo-500 uppercase tracking-widest ml-1">{slos.length} Found</span>}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-1.5 md:gap-6">
          <div className="relative hidden lg:block">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Search Ledger..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-6 py-2.5 bg-slate-50 dark:bg-white/5 border-none rounded-2xl text-[11px] font-black uppercase tracking-widest outline-none focus:ring-2 focus:ring-indigo-500 w-48 xl:w-64 transition-all dark:text-white"
            />
          </div>

          <div className="bg-slate-100 dark:bg-white/5 p-0.5 md:p-1 rounded-lg md:rounded-2xl flex gap-0.5 md:gap-1 border dark:border-white/5 shadow-inner">
             <button 
               onClick={() => setViewMode('ledger')} 
               className={`flex items-center gap-1.5 md:gap-2 px-2 md:px-6 py-1 md:py-2 rounded-md md:rounded-xl text-[8px] md:text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'ledger' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm md:shadow-md scale-105' : 'text-slate-500'}`}
             >
               <BookOpen size={10} className="md:hidden"/>
               <BookOpen size={14} className="hidden md:block"/>
               <span className="hidden sm:inline">Clean Ledger</span>
               <span className="sm:hidden">Ledger</span>
             </button>
             <button 
               onClick={() => setViewMode('raw')} 
               className={`flex items-center gap-1.5 md:gap-2 px-2 md:px-6 py-1 md:py-2 rounded-md md:rounded-xl text-[8px] md:text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'raw' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm md:shadow-md scale-105' : 'text-slate-500'}`}
             >
               <Terminal size={10} className="md:hidden"/>
               <Terminal size={14} className="hidden md:block"/>
               <span className="hidden sm:inline">Universal JSON</span>
               <span className="sm:hidden">JSON</span>
             </button>
          </div>
          
          <button onClick={onClose} className="p-1.5 md:p-3 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-lg md:rounded-2xl transition-all">
            <X size={18} className="md:hidden"/>
            <X size={24} className="hidden md:block"/>
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/20 dark:bg-[#020202]">
        <div className="max-w-6xl mx-auto p-6 md:p-12 lg:p-20">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-40 md:py-60 text-center opacity-40">
               <RefreshCw size={32} className="animate-spin text-indigo-600 mb-6 md:mb-8 md:w-12 md:h-12" />
               <p className="text-[10px] md:text-xs font-black uppercase tracking-[0.2em] md:tracking-[0.4em] text-indigo-500 px-4">Retrieving Neural Artifacts...</p>
            </div>
          ) : viewMode === 'raw' ? (
            <div className="bg-white dark:bg-[#080808] p-4 md:p-10 lg:p-20 rounded-2xl md:rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-2xl animate-in slide-in-from-bottom-4 overflow-hidden">
               <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 md:mb-12 gap-4">
                 <div className="flex items-center gap-3 opacity-40">
                   <FileCode size={16} className="text-indigo-500" />
                   <span className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.3em]">Universal JSON Schema</span>
                 </div>
                 <button 
                   onClick={() => {
                     const cleanJson = extractedText?.includes('```json') 
                       ? extractedText.split('```json')[1].split('```')[0].trim()
                       : extractedText;
                     handleCopy(cleanJson || "");
                   }}
                   className="w-full sm:w-auto flex items-center justify-center gap-2 text-[9px] md:text-[10px] font-black uppercase tracking-widest hover:text-indigo-600 transition-all bg-slate-50 dark:bg-white/5 px-4 py-2.5 rounded-xl border dark:border-white/5"
                 >
                   {copiedCode === (extractedText?.includes('```json') ? extractedText.split('```json')[1].split('```')[0].trim() : extractedText) ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                   {copiedCode === (extractedText?.includes('```json') ? extractedText.split('```json')[1].split('```')[0].trim() : extractedText) ? 'Copied' : 'Copy JSON'}
                 </button>
               </div>
               <div className="relative group">
                 <div className="absolute -inset-4 bg-indigo-500/5 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                 <pre className="font-mono text-[10px] md:text-sm leading-relaxed overflow-x-auto custom-scrollbar dark:text-slate-300 bg-slate-50 dark:bg-black/20 p-4 md:p-8 rounded-xl md:rounded-2xl border dark:border-white/5">
                    {extractedText ? (
                      extractedText.includes('```json') 
                        ? extractedText.split('```json')[1].split('```')[0].trim()
                        : extractedText
                    ) : "<!-- Vault Empty -->"}
                 </pre>
               </div>
            </div>
          ) : slos.length > 0 ? (
            <div className="space-y-12 md:space-y-24">
              {isWorking && (
                <div className="bg-amber-500/10 border border-amber-500/20 p-4 md:p-6 rounded-2xl md:rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-pulse">
                  <div className="flex items-center gap-4">
                    <RefreshCw className="w-4 h-4 md:w-5 md:h-5 text-amber-500 animate-spin" />
                    <p className="text-[10px] md:text-sm font-bold text-amber-600 uppercase tracking-widest">Neural Grid Syncing: {slos.length} Found...</p>
                  </div>
                  <div className="text-[8px] md:text-[10px] font-black text-amber-400 uppercase tracking-[0.2em]">Live Stream Active</div>
                </div>
              )}
              {Object.entries(groupedSlos).sort().map(([grade, domains]) => (
                <div key={grade} className="space-y-8 md:space-y-12">
                  <h2 className="text-xl md:text-3xl font-black text-indigo-900 dark:text-indigo-300 uppercase tracking-tighter border-b border-indigo-100 dark:border-indigo-900 pb-4">
                    Grade {grade}
                  </h2>
                  {Object.entries(domains).sort().map(([domain, items]) => (
                    <section key={`${grade}-${domain}`} className="animate-in fade-in slide-in-from-bottom-4 duration-700 md:ml-8">
                       <div className="flex items-center gap-4 md:gap-6 mb-6 md:mb-8">
                          <div className="p-2 md:p-3 bg-indigo-600 text-white rounded-xl md:rounded-2xl shadow-xl shadow-indigo-500/20">
                            <Layers size={18} className="md:hidden"/>
                            <Layers size={22} className="hidden md:block"/>
                          </div>
                          <div>
                            <h3 className="text-base md:text-xl font-black uppercase tracking-[0.1em] text-slate-900 dark:text-white">{domain}</h3>
                            <p className="text-[8px] md:text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">{items.length} Standards Anchored</p>
                          </div>
                          <div className="h-px bg-slate-200 dark:bg-white/5 flex-1 ml-2 md:ml-4" />
                       </div>

                       <div className="grid grid-cols-1 gap-3 md:gap-4">
                          {items.map((slo) => (
                            <div key={slo.id} className="group relative flex flex-col lg:flex-row gap-4 md:gap-6 p-4 md:p-6 bg-white dark:bg-[#080808] rounded-2xl md:rounded-[2rem] border border-slate-100 dark:border-white/5 hover:border-indigo-400 hover:shadow-2xl transition-all duration-300">
                               <div className="lg:w-48 shrink-0 space-y-3 md:space-y-4">
                                 <button 
                                   onClick={() => handleCopy(slo.slo_code)}
                                   className="w-full flex items-center justify-between gap-3 px-4 md:px-5 py-2 md:py-3 bg-slate-50 dark:bg-white/5 rounded-xl md:rounded-2xl border border-slate-200 dark:border-white/10 hover:bg-indigo-600 hover:text-white transition-all group-hover:scale-[1.02]"
                                 >
                                    <span className="text-[10px] md:text-[11px] font-black tracking-widest uppercase truncate">{slo.slo_code}</span>
                                    {copiedCode === slo.slo_code ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} className="opacity-20 group-hover:opacity-100" />}
                                 </button>
                                 <div className="flex flex-wrap gap-2">
                                   <span className="text-[7px] md:text-[8px] font-black uppercase tracking-widest text-slate-500 bg-slate-100 dark:bg-white/10 px-2 py-1 rounded-lg border dark:border-white/5">{slo.bloom_level || 'Understand'}</span>
                                   {slo.cognitive_complexity && (
                                     <span className="text-[7px] md:text-[8px] font-black uppercase tracking-widest text-amber-500 bg-amber-50 dark:bg-amber-500/10 px-2 py-1 rounded-lg border border-amber-100 dark:border-amber-500/20">{slo.cognitive_complexity}</span>
                                   )}
                                 </div>
                                 {slo.keywords && slo.keywords.length > 0 && (
                                   <div className="flex flex-wrap gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
                                     {slo.keywords.slice(0, 3).map((kw, idx) => (
                                       <span key={idx} className="text-[6px] md:text-[7px] font-bold text-slate-400 uppercase tracking-tighter bg-slate-50 dark:bg-white/5 px-1.5 py-0.5 rounded-md">#{kw}</span>
                                     ))}
                                   </div>
                                 )}
                               </div>
                               <div className="flex-1 min-w-0 lg:pt-1">
                                  <p className="text-sm md:text-[15px] font-medium text-slate-800 dark:text-slate-200 leading-relaxed selection:bg-indigo-500 selection:text-white" 
                                     dangerouslySetInnerHTML={{ __html: renderSTEM(slo.slo_full_text) }} />
                               </div>
                            </div>
                          ))}
                       </div>
                    </section>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 md:py-40 text-center animate-in zoom-in-95 duration-700">
               <div className="w-16 h-16 md:w-24 md:h-24 bg-amber-50 dark:bg-amber-950/20 rounded-2xl md:rounded-[2.5rem] flex items-center justify-center mb-6 md:mb-10 text-amber-600">
                 {isWorking ? <Loader2 size={32} className="animate-spin md:hidden" /> : <AlertTriangle size={32} className="md:hidden" />}
                 {isWorking ? <Loader2 size={48} className="animate-spin hidden md:block" /> : <AlertTriangle size={48} className="hidden md:block" />}
               </div>
               <h3 className="text-xl md:text-2xl font-black uppercase tracking-[0.2em] text-slate-900 dark:text-white px-4">
                 {isWorking ? 'Extraction in Progress' : 'Sync Protocol Interrupted'}
               </h3>
               <p className="text-xs md:text-sm font-medium text-slate-500 max-w-xs md:max-w-sm mt-4 leading-relaxed italic px-4">
                 {isWorking 
                   ? 'The neural grid is currently linearizing your document. Artifacts will appear here as they are decrypted.' 
                   : 'The curriculum ledger for this document is currently empty. This happens if the document was uploaded before the database migration.'}
               </p>
               
               {/* Show raw stream preview if available during extraction */}
               {isWorking && extractedText && !isLedger && (
                 <div className="mt-8 md:mt-16 w-full max-w-2xl bg-white dark:bg-[#080808] p-4 md:p-8 rounded-2xl md:rounded-3xl border dark:border-white/5 text-left opacity-50 scale-90 md:scale-100">
                   <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Raw Stream Preview</h4>
                   <div className="text-[11px] md:text-sm text-slate-500 font-mono line-clamp-6 whitespace-pre-wrap">
                     {extractedText}
                   </div>
                 </div>
               )}

               <div className="flex flex-col sm:flex-row gap-4 mt-8 md:mt-12 w-full sm:w-auto px-8">
                 <button 
                   onClick={fetchSlos}
                   className="flex items-center justify-center gap-3 px-8 py-4 md:py-5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl md:rounded-[2rem] font-black text-[10px] md:text-xs uppercase tracking-widest shadow-sm hover:bg-slate-200 transition-all"
                 >
                   <RefreshCw size={14} className="md:hidden" /> 
                   <RefreshCw size={16} className="hidden md:block" /> 
                   {isWorking ? 'Poll Node' : 'Refresh Grid'}
                 </button>
                 {!isWorking && (
                   <button 
                     onClick={() => handleReindex(false, false)}
                     disabled={isReindexing}
                     className="flex items-center justify-center gap-3 px-8 md:px-10 py-4 md:py-5 bg-indigo-600 text-white rounded-xl md:rounded-[2rem] font-black text-[10px] md:text-xs uppercase tracking-widest shadow-2xl hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
                   >
                     {isReindexing ? <RefreshCw className="animate-spin" size={14}/> : <Zap size={14} className="md:hidden" />} 
                     {isReindexing ? <RefreshCw className="animate-spin" size={16}/> : <Zap size={16} className="hidden md:block" />} 
                     {isReindexing ? 'Analyzing...' : 'Repair & Re-Index'}
                   </button>
                 )}
               </div>
            </div>
          )}
        </div>
      </main>

      <footer className="h-12 border-t dark:border-white/5 bg-white dark:bg-[#080808] flex items-center justify-between px-10 shrink-0 z-50">
         <div className="flex items-center gap-3">
           <div className={`w-2 h-2 rounded-full ${isWorking ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500 animate-pulse'}`} />
           <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.3em]">
             {isWorking ? 'Grid Orchestration Active' : 'Master Protocol Active'}
           </span>
         </div>
         <span className="text-[8px] font-black text-slate-300 uppercase tracking-[0.2em]">Institutional Alignment Verified</span>
      </footer>
    </div>
  );
};