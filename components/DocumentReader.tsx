'use client';

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, Copy, Check, Search, LayoutList, 
  BrainCircuit, History, RefreshCw, Layers, 
  BookOpen, Hash, ArrowRight, ShieldCheck,
  FileCode, Terminal, AlertTriangle, Zap, Loader2,
  CheckCircle2
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

// ── Step config ─────────────────────────────────────────────────────────────
const STEPS = [
  { key: 'EXTRACT',   label: 'Extracting text from PDF...',          pct: 10 },
  { key: 'LINEARIZE', label: 'AI is processing curriculum structure...', pct: 45 },
  { key: 'EMBED',     label: 'Building vector index...',              pct: 85 },
  { key: 'COMPLETE',  label: 'Document ready!',                       pct: 100 },
];

export const DocumentReader: React.FC<DocumentReaderProps> = ({ document: activeDoc, onClose }) => {
  const [copiedCode, setCopiedCode]     = useState<string | null>(null);
  const [searchTerm, setSearchTerm]     = useState('');
  const [viewMode, setViewMode]         = useState<'ledger' | 'raw'>('ledger');
  const [slos, setSlos]                 = useState<SloRecord[]>([]);
  const [loading, setLoading]           = useState(true);

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStep, setProcessStep]   = useState('');
  const [processPct, setProcessPct]     = useState(0);
  const [processError, setProcessError] = useState('');
  const [processDone, setProcessDone]   = useState(false);
  const abortRef = useRef(false);

  // ── Fetch SLOs ─────────────────────────────────────────────────────────────
  const fetchSlos = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/docs/status/${activeDoc.id}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (!res.ok) throw new Error('Status Fetch Fault');
      const data = await res.json();
      setSlos(data.slos || []);
    } catch (e) {
      console.error('Ledger Fetch Error:', e);
    } finally {
      setLoading(false);
    }
  }, [activeDoc.id]);

  useEffect(() => { fetchSlos(); }, [fetchSlos]);

  // ── Core: run all 3 processing steps sequentially ─────────────────────────
  // This is the KEY fix — we call the API 3 times, one per step.
  // The old code called it once and stopped, causing the 98% stuck bug.
  const runProcessing = useCallback(async () => {
    abortRef.current = false;
    setIsProcessing(true);
    setProcessDone(false);
    setProcessError('');
    setProcessPct(5);
    setProcessStep('Initialising...');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const token = session.access_token;

      // Reset stuck document in Supabase before starting
      await supabase
        .from('documents')
        .update({ status: 'pending', document_summary: null })
        .eq('id', activeDoc.id);

      // Delete any stuck job so the route creates a fresh one
      await supabase
        .from('document_processing_jobs')
        .delete()
        .eq('document_id', activeDoc.id)
        .neq('status', 'complete');

      // ── Call the route up to 3 times (once per step) ──
      let done = false;
      let attempts = 0;
      const MAX_STEPS = 3;

      while (!done && attempts < MAX_STEPS && !abortRef.current) {
        attempts++;

        // Find which step we're on from UI state
        const stepCfg = STEPS[Math.min(attempts - 1, STEPS.length - 2)];
        setProcessStep(stepCfg.label);
        setProcessPct(stepCfg.pct);

        const res = await fetch(`/api/docs/process/${activeDoc.id}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        });

        const data = await res.json();

        if (!res.ok || data.error) {
          throw new Error(data.error || `Step ${attempts} failed`);
        }

        // Update progress from server
        if (data.progress) setProcessPct(data.progress);
        if (data.message)  setProcessStep(data.message);

        if (data.done) {
          done = true;
        } else {
          // Small pause between steps so Vercel fully releases the function
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      if (abortRef.current) {
        setProcessError('Processing cancelled.');
        return;
      }

      // All steps complete
      setProcessPct(100);
      setProcessStep('✅ Document ready! Loading standards...');
      setProcessDone(true);

      // Refresh SLOs after 1.5s
      setTimeout(() => {
        fetchSlos();
        setIsProcessing(false);
      }, 1500);

    } catch (err: any) {
      setProcessError(err.message || 'Processing failed. Please try again.');
      setIsProcessing(false);
    }
  }, [activeDoc.id, fetchSlos]);

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
      const domainLabel = parsed ? `Domain ${parsed.domain}` : 'Core Curriculum';
      if (!groups[domainLabel]) groups[domainLabel] = [];
      groups[domainLabel].push(slo);
    });
    return groups;
  }, [slos, searchTerm]);

  // ── Processing overlay ─────────────────────────────────────────────────────
  if (isProcessing || processDone) {
    const currentStepIndex = STEPS.findIndex(s => s.pct >= processPct) || 0;
    return (
      <div className="fixed inset-0 z-[500] bg-[#020202] flex items-center justify-center p-6 animate-in fade-in duration-300">
        <div className="w-full max-w-lg bg-[#0d0d0d] rounded-[2.5rem] border border-white/5 p-10 shadow-2xl">
          {/* App icon + version */}
          <div className="flex items-center justify-between mb-10">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-xl">
              <BrainCircuit size={24} className="text-white"/>
            </div>
            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-950/30 px-3 py-1.5 rounded-full border border-emerald-800/30">
              ⚡ GRID SYNC ACTIVE
            </span>
          </div>

          <h2 className="text-3xl font-black text-white uppercase tracking-tight mb-1">
            {processDone ? 'SYNC COMPLETE' : 'INGEST ASSET'}
          </h2>
          <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-10">
            FOUNDATIONAL CURRICULUM ORCHESTRATOR
          </p>

          {/* Progress bar */}
          <div className="w-full bg-white/5 rounded-full h-2 mb-4 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all duration-700 ${processDone ? 'bg-emerald-500' : 'bg-indigo-500'}`}
              style={{ width: `${processPct}%` }}
            />
          </div>

          {/* Step label + pct */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              {processDone
                ? <CheckCircle2 size={14} className="text-emerald-500"/>
                : <Loader2 size={14} className="animate-spin text-indigo-400"/>
              }
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">
                {processStep}
              </span>
            </div>
            <span className="text-[10px] font-black text-slate-400">{processPct}%</span>
          </div>

          {/* Step indicators */}
          <div className="space-y-2 mb-8">
            {STEPS.slice(0, 3).map((s, i) => {
              const done = processPct > s.pct;
              const active = !done && processPct >= (STEPS[i - 1]?.pct || 0);
              return (
                <div key={s.key} className={`flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest transition-all ${done ? 'text-emerald-400' : active ? 'text-indigo-300' : 'text-white/20'}`}>
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${done ? 'bg-emerald-500 border-emerald-500' : active ? 'border-indigo-500' : 'border-white/10'}`}>
                    {done && <Check size={10} className="text-white"/>}
                    {active && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"/>}
                  </div>
                  Step {i + 1}: {s.key}
                </div>
              );
            })}
          </div>

          {processError && (
            <div className="bg-red-900/20 border border-red-800/30 rounded-2xl p-4 mb-6">
              <p className="text-red-400 text-xs font-bold">{processError}</p>
              <button
                onClick={runProcessing}
                className="mt-3 px-4 py-2 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wide hover:bg-red-700 transition-all"
              >
                Retry
              </button>
            </div>
          )}

          <p className="text-[9px] text-slate-600 italic">
            {processDone
              ? 'All neural context nodes established successfully.'
              : 'Establishing neural context nodes. Do not close this window.'}
          </p>
        </div>
      </div>
    );
  }

  // ── Main reader UI ─────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[500] bg-white dark:bg-[#020202] flex flex-col animate-in fade-in duration-300 overflow-hidden text-left">
      <header className="h-20 border-b dark:border-white/5 bg-white dark:bg-[#080808] flex items-center justify-between px-8 shrink-0 z-50 shadow-sm">
        <div className="flex items-center gap-5">
          <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl">
            <LayoutList size={22}/>
          </div>
          <div>
            <h2 className="text-xs font-black uppercase tracking-[0.2em] dark:text-white truncate max-w-sm">{activeDoc.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest px-2 py-0.5 bg-slate-100 dark:bg-white/5 rounded">Surgical Ledger Node</span>
              <span className="text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-emerald-50 text-emerald-500">
                {slos.length > 0 ? `${slos.length} standards` : 'Verified Grid'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative hidden md:block">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={14}/>
            <input
              type="text"
              placeholder="Search Ledger Codes..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-10 pr-6 py-2.5 bg-slate-50 dark:bg-white/5 border-none rounded-2xl text-[11px] font-black uppercase tracking-widest outline-none focus:ring-2 focus:ring-indigo-500 w-64 dark:text-white"
            />
          </div>
          <div className="bg-slate-100 dark:bg-white/5 p-1 rounded-2xl flex gap-1 border dark:border-white/5 shadow-inner">
            <button onClick={() => setViewMode('ledger')} className={`flex items-center gap-2 px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'ledger' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-md' : 'text-slate-500'}`}>
              <BookOpen size={13}/> Ledger
            </button>
            <button onClick={() => setViewMode('raw')} className={`flex items-center gap-2 px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'raw' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-md' : 'text-slate-500'}`}>
              <Terminal size={13}/> Raw MD
            </button>
          </div>
          <button onClick={onClose} className="p-3 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-2xl transition-all">
            <X size={24}/>
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/20 dark:bg-[#020202]">
        <div className="max-w-6xl mx-auto p-6 md:p-12 lg:p-20">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-60 text-center opacity-40">
              <RefreshCw size={48} className="animate-spin text-indigo-600 mb-8"/>
              <p className="text-xs font-black uppercase tracking-[0.4em] text-indigo-500">Retrieving Neural Artifacts...</p>
            </div>
          ) : viewMode === 'raw' ? (
            <div className="bg-white dark:bg-[#080808] p-10 md:p-20 rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-2xl animate-in slide-in-from-bottom-4">
              <div className="flex items-center gap-3 mb-12 opacity-40">
                <History size={16} className="text-indigo-500"/>
                <span className="text-[10px] font-black uppercase tracking-[0.3em]">Master Linearized Archive</span>
              </div>
              <div className="prose dark:prose-invert max-w-none font-mono text-sm leading-relaxed whitespace-pre-wrap dark:text-slate-300">
                {activeDoc.extractedText || '<!-- Vault Empty -->'}
              </div>
            </div>
          ) : slos.length > 0 ? (
            <div className="space-y-24">
              {(Object.entries(groupedSlos) as [string, SloRecord[]][]).sort().map(([domain, items]) => (
                <section key={domain} className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                  <div className="flex items-center gap-6 mb-8">
                    <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-xl shadow-indigo-500/20">
                      <Layers size={22}/>
                    </div>
                    <div>
                      <h3 className="text-xl font-black uppercase tracking-[0.1em] text-slate-900 dark:text-white">{domain}</h3>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">{items.length} Standards Anchored</p>
                    </div>
                    <div className="h-px bg-slate-200 dark:bg-white/5 flex-1 ml-4"/>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    {items.map(slo => (
                      <div key={slo.id} className="group relative flex flex-col md:flex-row gap-6 p-6 bg-white dark:bg-[#080808] rounded-[2rem] border border-slate-100 dark:border-white/5 hover:border-indigo-400 hover:shadow-2xl transition-all duration-300">
                        <div className="md:w-48 shrink-0 space-y-3">
                          <button
                            onClick={() => handleCopy(slo.slo_code)}
                            className="w-full flex items-center justify-between gap-3 px-5 py-3 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/10 hover:bg-indigo-600 hover:text-white transition-all"
                          >
                            <span className="text-[11px] font-black tracking-widest uppercase truncate">{slo.slo_code}</span>
                            {copiedCode === slo.slo_code ? <Check size={14} className="text-emerald-500"/> : <Copy size={14} className="opacity-20"/>}
                          </button>
                          <span className="text-[8px] font-black uppercase tracking-widest text-slate-500 bg-slate-100 dark:bg-white/10 px-2 py-1 rounded-lg border dark:border-white/5 block text-center">
                            {slo.bloom_level || 'Understand'}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0 md:pt-1">
                          <p className="text-[15px] font-medium text-slate-800 dark:text-slate-200 leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: renderSTEM(slo.slo_full_text) }}/>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            // ── Empty state: no SLOs yet ──
            <div className="flex flex-col items-center justify-center py-40 text-center animate-in zoom-in-95 duration-700">
              <div className="w-24 h-24 bg-amber-50 dark:bg-amber-950/20 rounded-[2.5rem] flex items-center justify-center mb-10 text-amber-600">
                <AlertTriangle size={48}/>
              </div>
              <h3 className="text-2xl font-black uppercase tracking-[0.2em] text-slate-900 dark:text-white">
                Sync Protocol Interrupted
              </h3>
              <p className="text-sm font-medium text-slate-500 max-w-sm mt-4 leading-relaxed italic">
                This document has not been fully processed yet, or was uploaded before the latest neural grid update.
              </p>
              <div className="flex gap-4 mt-12">
                <button
                  onClick={fetchSlos}
                  className="flex items-center gap-3 px-8 py-5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-[2rem] font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
                >
                  <RefreshCw size={16}/> Refresh Grid
                </button>
                <button
                  onClick={runProcessing}
                  className="flex items-center gap-3 px-10 py-5 bg-indigo-600 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-2xl hover:bg-indigo-700 active:scale-95 transition-all"
                >
                  <Zap size={16}/> Repair & Re-Index
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="h-12 border-t dark:border-white/5 bg-white dark:bg-[#080808] flex items-center justify-between px-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"/>
          <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.3em]">Master Protocol Active</span>
        </div>
        <span className="text-[8px] font-black text-slate-300 uppercase tracking-[0.2em]">Institutional Alignment Verified</span>
      </footer>
    </div>
  );
};
