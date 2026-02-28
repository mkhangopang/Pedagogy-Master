'use client';

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, Copy, Check, Search, LayoutList, 
  BrainCircuit, History, RefreshCw, Layers, 
  BookOpen, Hash, ArrowRight, ShieldCheck,
  FileCode, Terminal, AlertTriangle, Zap, Loader2,
  CheckCircle2, Download, ClipboardCopy, ChevronDown,
  TrendingUp, Eye, Flag, BarChart3
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
  domain?: string;
  domain_name?: string;
  grade_level?: string;
  subject?: string;
  extraction_confidence?: number;
  page_number?: number;
  is_truncated?: boolean;
  is_orphan_domain?: boolean;
  created_at: string;
}

interface DocumentReaderProps {
  document: Document;
  onClose: () => void;
}

const STEPS = [
  { key: 'EXTRACT',   label: 'Extracting text from PDF...',             pct: 10 },
  { key: 'LINEARIZE', label: 'Parsing SLOs deterministically...',       pct: 45 },
  { key: 'ENRICH',    label: 'AI Bloom classification...',              pct: 65 },
  { key: 'EMBED',     label: 'Building vector index...',                pct: 85 },
  { key: 'COMPLETE',  label: 'Document ready!',                         pct: 100 },
];

// Bloom level → color mapping
const BLOOM_CONFIG: Record<string, { color: string; bg: string; border: string; dot: string }> = {
  'Remember':  { color: 'text-slate-600 dark:text-slate-300',  bg: 'bg-slate-100 dark:bg-slate-800',    border: 'border-slate-200 dark:border-slate-700', dot: 'bg-slate-400' },
  'Understand':{ color: 'text-blue-700 dark:text-blue-300',    bg: 'bg-blue-50 dark:bg-blue-950/40',    border: 'border-blue-200 dark:border-blue-800',   dot: 'bg-blue-500' },
  'Apply':     { color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50 dark:bg-emerald-950/40', border: 'border-emerald-200 dark:border-emerald-800', dot: 'bg-emerald-500' },
  'Analyze':   { color: 'text-amber-700 dark:text-amber-300',  bg: 'bg-amber-50 dark:bg-amber-950/40', border: 'border-amber-200 dark:border-amber-800',  dot: 'bg-amber-500' },
  'Evaluate':  { color: 'text-orange-700 dark:text-orange-300', bg: 'bg-orange-50 dark:bg-orange-950/40', border: 'border-orange-200 dark:border-orange-800', dot: 'bg-orange-500' },
  'Create':    { color: 'text-purple-700 dark:text-purple-300', bg: 'bg-purple-50 dark:bg-purple-950/40', border: 'border-purple-200 dark:border-purple-800', dot: 'bg-purple-500' },
};

function BloomBadge({ level }: { level?: string }) {
  const cfg = BLOOM_CONFIG[level || 'Understand'] || BLOOM_CONFIG['Understand'];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}/>
      {level || 'Understand'}
    </span>
  );
}

function ConfidencePip({ score }: { score?: number }) {
  const pct = Math.round((score || 0.75) * 100);
  const color = pct >= 85 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <div className="flex items-center gap-1.5 opacity-60">
      <div className="w-16 h-1 bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }}/>
      </div>
      <span className="text-[8px] font-black text-slate-400">{pct}%</span>
    </div>
  );
}

export const DocumentReader: React.FC<DocumentReaderProps> = ({ document: activeDoc, onClose }) => {
  const [copiedCode, setCopiedCode]         = useState<string | null>(null);
  const [copiedMd, setCopiedMd]             = useState(false);
  const [searchTerm, setSearchTerm]         = useState('');
  const [viewMode, setViewMode]             = useState<'ledger' | 'raw' | 'stats'>('ledger');
  const [slos, setSlos]                     = useState<SloRecord[]>([]);
  const [loading, setLoading]               = useState(true);
  const [expandedSlo, setExpandedSlo]       = useState<string | null>(null);

  // Processing state
  const [isProcessing, setIsProcessing]     = useState(false);
  const [processStep, setProcessStep]       = useState('');
  const [processPct, setProcessPct]         = useState(0);
  const [processError, setProcessError]     = useState('');
  const [processDone, setProcessDone]       = useState(false);
  const abortRef = useRef(false);

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

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // ── Copy full raw MD ─────────────────────────────────────────────────────
  const handleCopyRawMd = useCallback(() => {
    const text = activeDoc.extractedText || '';
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedMd(true);
    setTimeout(() => setCopiedMd(false), 2500);
  }, [activeDoc.extractedText]);

  // ── Download raw MD as file ───────────────────────────────────────────────
  const handleDownloadMd = useCallback(() => {
    const text = activeDoc.extractedText || '';
    if (!text) return;
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeDoc.name?.replace(/\.[^/.]+$/, '') || 'curriculum'}-slos.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeDoc.extractedText, activeDoc.name]);

  // ── GRADE-FIRST hierarchy: Grade 09 → [Domain A, B, C...] → Grade 10 → ...
  // Pedagogically correct: teachers plan per grade, not per domain across grades
  const gradeHierarchy = useMemo(() => {
    const filtered = slos.filter(s =>
      s.slo_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.slo_full_text.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.domain_name || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Grade → Domain → SLOs
    const hierarchy: Record<string, Record<string, SloRecord[]>> = {};

    filtered.forEach(slo => {
      const parsed = parseSLOCode(slo.slo_code);
      // Grade key: use stored grade_level, fall back to parsed, fall back to 'Ungraded'
      const gradeRaw = slo.grade_level || parsed?.grade || 'Ungraded';
      const gradeKey = gradeRaw === 'Ungraded' ? 'Ungraded' : `Grade ${gradeRaw}`;

      // Domain key: use stored domain + name
      const domainKey = slo.domain
        ? `Domain ${slo.domain}${slo.domain_name ? ` — ${slo.domain_name}` : ''}`
        : parsed ? `Domain ${parsed.domain}` : 'Core';

      if (!hierarchy[gradeKey]) hierarchy[gradeKey] = {};
      if (!hierarchy[gradeKey][domainKey]) hierarchy[gradeKey][domainKey] = [];
      hierarchy[gradeKey][domainKey].push(slo);
    });

    // Sort grades numerically (09, 10, 11, 12), domains alphabetically within
    const sorted: Array<{ grade: string; domains: Array<{ domain: string; slos: SloRecord[] }> }> = [];
    const gradeOrder = Object.keys(hierarchy).sort((a, b) => {
      if (a === 'Ungraded') return 1;
      if (b === 'Ungraded') return -1;
      const na = parseInt(a.replace('Grade ', '')) || 99;
      const nb = parseInt(b.replace('Grade ', '')) || 99;
      return na - nb;
    });

    gradeOrder.forEach(grade => {
      const domainsSorted = Object.keys(hierarchy[grade]).sort();
      sorted.push({
        grade,
        domains: domainsSorted.map(d => ({ domain: d, slos: hierarchy[grade][d] })),
      });
    });

    return sorted;
  }, [slos, searchTerm]);

  // Legacy flat groupedSlos for stats tab compatibility
  const groupedSlos = useMemo(() => {
    const flat: Record<string, SloRecord[]> = {};
    gradeHierarchy.forEach(({ grade, domains }) => {
      domains.forEach(({ domain, slos: items }) => {
        const key = `${grade} / ${domain}`;
        flat[key] = items;
      });
    });
    return flat;
  }, [gradeHierarchy]);

  const totalFiltered = useMemo(() =>
    gradeHierarchy.reduce((sum, g) => sum + g.domains.reduce((s, d) => s + d.slos.length, 0), 0),
  [gradeHierarchy]);

  // ── Stats summary ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const bloomCounts: Record<string, number> = {};
    let orphans = 0, truncated = 0, highConf = 0;
    slos.forEach(s => {
      const b = s.bloom_level || 'Understand';
      bloomCounts[b] = (bloomCounts[b] || 0) + 1;
      if (s.is_orphan_domain) orphans++;
      if (s.is_truncated) truncated++;
      if ((s.extraction_confidence || 0) >= 0.85) highConf++;
    });
    return { bloomCounts, orphans, truncated, highConf, total: slos.length };
  }, [slos]);

  // ── Re-Index with full 5-stage pipeline ────────────────────────────────────
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

      await supabase.from('documents').update({ status: 'pending', document_summary: null }).eq('id', activeDoc.id);
      await supabase.from('document_processing_jobs').delete().eq('document_id', activeDoc.id).neq('status', 'complete');

      const callRoute = async (body: any = {}) => {
        const res = await fetch(`/api/docs/process/${activeDoc.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || `Server error ${res.status}`);
        return data;
      };

      // Stage 1
      setProcessStep('Stage 1 — Extracting document...');
      setProcessPct(10);
      const extractData = await callRoute();
      if (extractData.progress) setProcessPct(extractData.progress);

      // Stage 2 — chunk loop
      setProcessStep('Stage 2 — Parsing SLOs deterministically...');
      setProcessPct(32);
      let chunkIndex = 0;
      let declaredDomains: any = extractData.declaredDomains || {};
      while (true) {
        if (abortRef.current) break;
        const data = await callRoute({ chunkIndex, declaredDomains });
        if (data.progress) setProcessPct(data.progress);
        if (data.declaredDomains) declaredDomains = { ...declaredDomains, ...data.declaredDomains };
        if (data.totalChunks) setProcessStep(`Stage 2 — Chunk ${chunkIndex + 1}/${data.totalChunks} — ${data.slosThisChunk || 0} SLOs`);
        if (data.nextStep === 'ENRICH') { setProcessPct(60); break; }
        if (data.nextStep === 'EMBED') { setProcessPct(65); break; }
        if (data.nextStep === 'LINEARIZE' && data.chunkIndex !== undefined) { chunkIndex = data.chunkIndex; await new Promise(r => setTimeout(r, 150)); continue; }
        break;
      }

      // Stage 3 — Bloom enrichment
      setProcessStep('Stage 3 — AI Bloom classification...');
      setProcessPct(61);
      let enrichBatch = 0;
      while (true) {
        if (abortRef.current) break;
        const data = await callRoute({ enrichBatch });
        if (data.progress) setProcessPct(data.progress);
        if (data.totalBatches) setProcessStep(`Stage 3 — Bloom batch ${enrichBatch + 1}/${data.totalBatches}`);
        if (data.nextStep === 'EMBED') { setProcessPct(65); break; }
        if (data.nextStep === 'ENRICH' && data.enrichBatch !== undefined) { enrichBatch = data.enrichBatch; await new Promise(r => setTimeout(r, 400)); continue; }
        break;
      }

      // Stage 4 — Embed
      setProcessStep('Stage 4 — Building vector index...');
      setProcessPct(70);
      const embedData = await callRoute({ embedStep: true });
      if (embedData.progress) setProcessPct(embedData.progress);

      setProcessPct(100);
      setProcessStep(`✅ Complete — ${embedData.chunkCount || 0} vectors`);
      setProcessDone(true);

      setTimeout(() => { fetchSlos(); setIsProcessing(false); }, 1500);

    } catch (err: any) {
      setProcessError(err.message || 'Processing failed.');
      setIsProcessing(false);
    }
  }, [activeDoc.id, fetchSlos]);

  // ── Processing overlay ─────────────────────────────────────────────────────
  if (isProcessing || processDone) {
    const currentStepIndex = STEPS.findIndex(s => s.pct >= processPct) || 0;
    return (
      <div className="fixed inset-0 z-[500] bg-[#020202] flex items-center justify-center p-6 animate-in fade-in duration-300">
        <div className="w-full max-w-lg bg-[#0d0d0d] rounded-[2.5rem] border border-white/5 p-10 shadow-2xl">
          <div className="flex items-center justify-between mb-10">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-xl">
              <BrainCircuit size={24} className="text-white"/>
            </div>
            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-950/30 px-3 py-1.5 rounded-full border border-emerald-800/30">
              ⚡ GRID SYNC ACTIVE
            </span>
          </div>
          <h2 className="text-3xl font-black text-white uppercase tracking-tight mb-1">
            {processDone ? 'SYNC COMPLETE' : 'RE-INDEX ASSET'}
          </h2>
          <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-10">
            5-STAGE CURRICULUM ENGINE v4.1
          </p>
          <div className="w-full bg-white/5 rounded-full h-2 mb-4 overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${processDone ? 'bg-emerald-500' : 'bg-indigo-600'}`} style={{ width: `${processPct}%` }}/>
          </div>
          <div className="flex items-center justify-between mb-8">
            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{processStep}</p>
            <span className="text-[10px] text-slate-500 font-black">{processPct}%</span>
          </div>
          {processError ? (
            <div className="p-4 bg-rose-950/30 border border-rose-800/30 rounded-2xl text-rose-400 text-xs mb-6">{processError}</div>
          ) : null}
          <div className="space-y-2">
            {STEPS.slice(0, 4).map((step, i) => {
              const done = processPct >= step.pct;
              const active = currentStepIndex === i;
              return (
                <div key={step.key} className={`flex items-center gap-3 text-[9px] font-black uppercase tracking-widest ${done ? 'text-emerald-500' : active ? 'text-indigo-400' : 'text-white/15'}`}>
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${done ? 'bg-emerald-500 border-emerald-500' : active ? 'border-indigo-500' : 'border-white/10'}`}>
                    {done && <Check size={9} className="text-white"/>}
                    {active && !done && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"/>}
                  </div>
                  Stage {i + 1}: {step.key}
                </div>
              );
            })}
          </div>
          {processDone && (
            <button onClick={() => setIsProcessing(false)} className="mt-8 w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all flex items-center justify-center gap-2">
              <ArrowRight size={14}/> View Results
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[500] bg-white dark:bg-[#020202] flex flex-col animate-in fade-in duration-200">
      
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="h-16 border-b dark:border-white/5 bg-white dark:bg-[#080808] flex items-center gap-4 px-6 shrink-0 shadow-sm">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 bg-indigo-600 text-white rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-indigo-500/20">
            <BookOpen size={16}/>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black text-slate-900 dark:text-white truncate uppercase tracking-tight">{activeDoc.name}</p>
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{slos.length} SLOs · {Object.keys(groupedSlos).length} domains</p>
          </div>
        </div>

        {/* View tabs */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/5 rounded-xl p-1">
          {[
            { key: 'ledger', icon: <LayoutList size={12}/>, label: 'Ledger' },
            { key: 'stats',  icon: <BarChart3 size={12}/>,  label: 'Stats' },
            { key: 'raw',    icon: <Terminal size={12}/>,   label: 'Raw MD' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setViewMode(tab.key as any)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${viewMode === tab.key ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        <button onClick={onClose} className="p-2.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-xl transition-all">
          <X size={20}/>
        </button>
      </header>

      {/* ── Search bar (ledger only) ─────────────────────────────────────── */}
      {viewMode === 'ledger' && (
        <div className="border-b dark:border-white/5 bg-white dark:bg-[#080808] px-6 py-3 flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search SLO codes, text, domain..."
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 text-slate-900 dark:text-white placeholder-slate-400"
            />
          </div>
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
            {totalFiltered} results
          </span>
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto bg-slate-50/30 dark:bg-[#020202]">
        <div className="max-w-6xl mx-auto p-6 md:p-10">

          {loading ? (
            <div className="flex flex-col items-center justify-center py-60 text-center opacity-40">
              <RefreshCw size={40} className="animate-spin text-indigo-600 mb-6"/>
              <p className="text-xs font-black uppercase tracking-[0.4em] text-indigo-500">Retrieving Neural Artifacts...</p>
            </div>

          ) : viewMode === 'raw' ? (
            /* ── RAW MD VIEW ─────────────────────────────────────────────── */
            <div className="bg-white dark:bg-[#080808] rounded-[2rem] border border-slate-200 dark:border-white/5 shadow-xl overflow-hidden animate-in slide-in-from-bottom-4">
              {/* Raw MD toolbar */}
              <div className="flex items-center justify-between px-8 py-4 border-b dark:border-white/5 bg-slate-50 dark:bg-white/3">
                <div className="flex items-center gap-3 opacity-60">
                  <History size={14} className="text-indigo-500"/>
                  <span className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-500">Master Linearized Archive</span>
                  <span className="text-[8px] font-black text-slate-400 bg-slate-200 dark:bg-white/10 px-2 py-0.5 rounded-md">
                    {(activeDoc.extractedText || '').length.toLocaleString()} chars
                  </span>
                </div>
                {/* ── COPY + DOWNLOAD BUTTONS ── */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyRawMd}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${
                      copiedMd
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white dark:bg-white/5 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:border-indigo-400 hover:text-indigo-600'
                    }`}
                  >
                    {copiedMd ? <Check size={12}/> : <ClipboardCopy size={12}/>}
                    {copiedMd ? 'Copied!' : 'Copy All'}
                  </button>
                  <button
                    onClick={handleDownloadMd}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-600 transition-all"
                  >
                    <Download size={12}/> Download .md
                  </button>
                </div>
              </div>
              {/* Raw content */}
              <div className="p-8 md:p-12 font-mono text-sm leading-relaxed whitespace-pre-wrap dark:text-slate-300 text-slate-700 max-h-[70vh] overflow-y-auto">
                {activeDoc.extractedText || '<!-- Vault Empty — No extracted text found -->'}
              </div>
            </div>

          ) : viewMode === 'stats' ? (
            /* ── STATS VIEW ──────────────────────────────────────────────── */
            <div className="space-y-6 animate-in slide-in-from-bottom-4">
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Total SLOs', value: stats.total, icon: <Hash size={18}/>, color: 'indigo' },
                  { label: 'High Confidence', value: stats.highConf, icon: <ShieldCheck size={18}/>, color: 'emerald' },
                  { label: 'Orphan Domains', value: stats.orphans, icon: <Flag size={18}/>, color: stats.orphans > 0 ? 'amber' : 'slate' },
                  { label: 'Truncated', value: stats.truncated, icon: <AlertTriangle size={18}/>, color: stats.truncated > 0 ? 'rose' : 'slate' },
                ].map(card => (
                  <div key={card.label} className="bg-white dark:bg-[#080808] rounded-2xl border border-slate-100 dark:border-white/5 p-6">
                    <div className={`text-${card.color}-500 mb-3`}>{card.icon}</div>
                    <div className="text-3xl font-black text-slate-900 dark:text-white">{card.value}</div>
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">{card.label}</div>
                  </div>
                ))}
              </div>

              {/* Bloom distribution */}
              <div className="bg-white dark:bg-[#080808] rounded-2xl border border-slate-100 dark:border-white/5 p-8">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-900 dark:text-white mb-6">Bloom Taxonomy Distribution</h3>
                <div className="space-y-3">
                  {Object.entries(BLOOM_CONFIG).map(([level, cfg]) => {
                    const count = stats.bloomCounts[level] || 0;
                    const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
                    return (
                      <div key={level} className="flex items-center gap-4">
                        <span className={`w-20 text-[9px] font-black uppercase tracking-widest ${cfg.color}`}>{level}</span>
                        <div className="flex-1 h-2 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${cfg.dot}`} style={{ width: `${pct}%`, transition: 'width 0.8s ease' }}/>
                        </div>
                        <span className="w-12 text-right text-[9px] font-black text-slate-400">{count} <span className="text-slate-300">({pct}%)</span></span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Domain breakdown */}
              <div className="bg-white dark:bg-[#080808] rounded-2xl border border-slate-100 dark:border-white/5 p-8">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-900 dark:text-white mb-6">Domain Breakdown</h3>
                <div className="space-y-2">
                  {Object.entries(groupedSlos).sort().map(([domain, items]) => (
                    <div key={domain} className="flex items-center justify-between py-2 border-b dark:border-white/5 last:border-0">
                      <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate max-w-xs">{domain}</span>
                      <span className="text-[9px] font-black text-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 px-2.5 py-1 rounded-lg">{items.length} SLOs</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          ) : slos.length > 0 ? (
            /* ── LEDGER VIEW — Grade-first, Domain-second ────────────────── */
            <div className="space-y-20">
              {gradeHierarchy.map(({ grade, domains }) => (
                <div key={grade} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {/* ── Grade header ── */}
                  <div className="flex items-center gap-4 mb-8 sticky top-0 z-10 bg-slate-50/95 dark:bg-[#020202]/95 backdrop-blur py-3 -mx-2 px-2 rounded-xl">
                    <div className="p-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl shadow-lg">
                      <Hash size={18}/>
                    </div>
                    <div>
                      <h2 className="text-lg font-black uppercase tracking-[0.12em] text-slate-900 dark:text-white">{grade}</h2>
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                        {domains.length} Domains · {domains.reduce((s, d) => s + d.slos.length, 0)} SLOs
                      </p>
                    </div>
                    <div className="h-px bg-slate-200 dark:bg-white/10 flex-1"/>
                    <span className="text-[9px] font-black text-slate-400 bg-slate-100 dark:bg-white/5 px-3 py-1 rounded-lg">
                      {domains.reduce((s, d) => s + d.slos.length, 0)} total
                    </span>
                  </div>

                  {/* ── Domains within this grade ── */}
                  <div className="space-y-10 pl-4 border-l-2 border-slate-100 dark:border-white/5">
                    {domains.map(({ domain, slos: items }) => (
                <section key={domain} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {/* Domain header */}
                  <div className="flex items-center gap-4 mb-6">
                    <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-500/20">
                      <Layers size={18}/>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-black uppercase tracking-[0.08em] text-slate-900 dark:text-white truncate">{domain}</h3>
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{items.length} Standards Anchored</p>
                    </div>
                    <div className="h-px bg-slate-200 dark:bg-white/5 flex-1"/>
                  </div>

                  {/* SLO cards */}
                  <div className="space-y-3">
                    {items.map(slo => {
                      const isExpanded = expandedSlo === slo.id;
                      return (
                        <div
                          key={slo.id}
                          className={`group bg-white dark:bg-[#080808] rounded-2xl border transition-all duration-200 ${
                            slo.is_orphan_domain
                              ? 'border-amber-200 dark:border-amber-800/40'
                              : slo.is_truncated
                              ? 'border-rose-100 dark:border-rose-900/30'
                              : 'border-slate-100 dark:border-white/5 hover:border-indigo-300 dark:hover:border-indigo-700'
                          } hover:shadow-lg`}
                        >
                          <div className="flex items-start gap-4 p-5">
                            {/* SLO code + copy */}
                            <div className="shrink-0 space-y-2">
                              <button
                                onClick={() => handleCopy(slo.slo_code)}
                                className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all group/copy"
                              >
                                <span className="text-[10px] font-black tracking-widest uppercase">{slo.slo_code}</span>
                                {copiedCode === slo.slo_code
                                  ? <Check size={11} className="text-emerald-400"/>
                                  : <Copy size={11} className="opacity-30 group-hover/copy:opacity-100"/>
                                }
                              </button>
                              <BloomBadge level={slo.bloom_level}/>
                              {slo.extraction_confidence !== undefined && (
                                <ConfidencePip score={slo.extraction_confidence}/>
                              )}
                            </div>

                            {/* SLO text */}
                            <div className="flex-1 min-w-0">
                              <p
                                className="text-[14px] font-medium text-slate-800 dark:text-slate-200 leading-relaxed"
                                dangerouslySetInnerHTML={{ __html: renderSTEM(slo.slo_full_text) }}
                              />
                              {/* Metadata row */}
                              <div className="flex items-center gap-3 mt-3 flex-wrap">
                                {slo.grade_level && (
                                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Grade {slo.grade_level}</span>
                                )}
                                {slo.page_number && (
                                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">~p.{slo.page_number}</span>
                                )}
                                {slo.is_truncated && (
                                  <span className="text-[8px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-1">
                                    <AlertTriangle size={9}/> Possibly truncated
                                  </span>
                                )}
                                {slo.is_orphan_domain && (
                                  <span className="text-[8px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-1">
                                    <Flag size={9}/> Orphan domain
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Expand toggle */}
                            <button
                              onClick={() => setExpandedSlo(isExpanded ? null : slo.id)}
                              className="shrink-0 p-2 text-slate-300 hover:text-slate-600 transition-all"
                            >
                              <ChevronDown size={14} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}/>
                            </button>
                          </div>

                          {/* Expanded detail */}
                          {isExpanded && (
                            <div className="border-t dark:border-white/5 px-5 pb-5 pt-4 grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50/50 dark:bg-white/2 rounded-b-2xl">
                              {[
                                ['Subject', slo.subject || '—'],
                                ['Grade', slo.grade_level || '—'],
                                ['Domain', slo.domain || '—'],
                                ['Confidence', slo.extraction_confidence ? `${Math.round(slo.extraction_confidence * 100)}%` : '—'],
                              ].map(([label, value]) => (
                                <div key={label}>
                                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
                                  <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300">{value}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
                    </section>
                  ))}
                  </div>
                </div>
              ))}
            </div>

          ) : (
            /* ── Empty state ─────────────────────────────────────────────── */
            <div className="flex flex-col items-center justify-center py-40 text-center animate-in zoom-in-95 duration-500">
              <div className="w-20 h-20 bg-amber-50 dark:bg-amber-950/20 rounded-[2rem] flex items-center justify-center mb-8 text-amber-500">
                <AlertTriangle size={40}/>
              </div>
              <h3 className="text-xl font-black uppercase tracking-[0.15em] text-slate-900 dark:text-white">No SLOs Extracted</h3>
              <p className="text-sm text-slate-500 max-w-sm mt-3 leading-relaxed">
                This document hasn't been processed yet, or was indexed before the v4.1 engine update.
              </p>
              <div className="flex gap-3 mt-10">
                <button onClick={fetchSlos} className="flex items-center gap-2 px-6 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all">
                  <RefreshCw size={14}/> Refresh
                </button>
                <button onClick={runProcessing} className="flex items-center gap-2 px-8 py-4 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-indigo-700 active:scale-95 transition-all">
                  <Zap size={14}/> Repair & Re-Index
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="h-10 border-t dark:border-white/5 bg-white dark:bg-[#080808] flex items-center justify-between px-8 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/>
          <span className="text-[7px] font-black text-slate-400 uppercase tracking-[0.3em]">Engine v4.1 Active</span>
        </div>
        <div className="flex items-center gap-4">
          {slos.length > 0 && (
            <button onClick={runProcessing} className="text-[8px] font-black text-slate-400 hover:text-indigo-500 uppercase tracking-widest transition-all flex items-center gap-1">
              <RefreshCw size={9}/> Re-Index
            </button>
          )}
          <span className="text-[7px] font-black text-slate-300 uppercase tracking-[0.2em]">Pedagogical Alignment Verified</span>
        </div>
      </footer>
    </div>
  );
};
