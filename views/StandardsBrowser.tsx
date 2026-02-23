'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search, Copy, Check, Filter, BookOpen, Zap, Target,
  ChevronDown, ChevronUp, X, Layers, Brain, Lightbulb,
  AlertTriangle, Tag, GraduationCap, BarChart3, Sparkles,
  RefreshCw, BookMarked, ArrowRight
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { UserProfile, Document } from '../types';

interface StandardsBrowserProps {
  user: UserProfile;
  documents: Document[];
  onViewChange?: (view: string) => void;
}

interface SLO {
  id: string;
  slo_code: string;
  slo_full_text: string;
  subject: string;
  grade_level: string;
  bloom_level: string;
  cognitive_complexity: string;
  teaching_strategies: string[];
  assessment_ideas: string[];
  prerequisite_concepts: string[];
  common_misconceptions: string[];
  keywords: string[];
  document_id: string;
  page_number: number;
  extraction_confidence: number;
}

const BLOOM_CONFIG: Record<string, { color: string; bg: string; emoji: string; order: number }> = {
  'Remember':   { color: 'text-slate-600',  bg: 'bg-slate-100',   emoji: '🔵', order: 1 },
  'Understand': { color: 'text-blue-600',   bg: 'bg-blue-50',     emoji: '🟦', order: 2 },
  'Apply':      { color: 'text-green-600',  bg: 'bg-green-50',    emoji: '🟩', order: 3 },
  'Analyze':    { color: 'text-yellow-600', bg: 'bg-yellow-50',   emoji: '🟨', order: 4 },
  'Evaluate':   { color: 'text-orange-600', bg: 'bg-orange-50',   emoji: '🟧', order: 5 },
  'Create':     { color: 'text-purple-600', bg: 'bg-purple-50',   emoji: '🟪', order: 6 },
};

const getBloomConfig = (level: string) =>
  BLOOM_CONFIG[level] || { color: 'text-slate-500', bg: 'bg-slate-50', emoji: '⚪', order: 0 };

function SLOCard({ slo, docName, onCopy, onUseInTool }: {
  slo: SLO;
  docName: string;
  onCopy: (code: string) => void;
  onUseInTool: (slo: SLO) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const bloom = getBloomConfig(slo.bloom_level);
  const confidence = Math.round((slo.extraction_confidence || 0.8) * 100);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(slo.slo_code);
    setCopied(true);
    onCopy(slo.slo_code);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="bg-white dark:bg-[#111] border border-slate-200 dark:border-white/5 rounded-2xl overflow-hidden transition-all hover:shadow-lg hover:border-indigo-300 dark:hover:border-indigo-500 cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      {/* Card Header */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* SLO Code Badge */}
            <div className="shrink-0 px-3 py-1.5 bg-indigo-600 text-white rounded-xl font-black text-xs tracking-widest uppercase">
              {slo.slo_code}
            </div>
            {/* Bloom Badge */}
            <div className={`shrink-0 px-2.5 py-1 ${bloom.bg} ${bloom.color} rounded-lg font-bold text-[10px] uppercase tracking-wide`}>
              {bloom.emoji} {slo.bloom_level || 'N/A'}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleCopy}
              title="Copy SLO code"
              className={`p-2 rounded-lg transition-all ${copied ? 'bg-green-100 text-green-600' : 'hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400'}`}
            >
              {copied ? <Check size={14}/> : <Copy size={14}/>}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onUseInTool(slo); }}
              title="Use in Tools"
              className="p-2 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-indigo-600 transition-all"
            >
              <Zap size={14}/>
            </button>
            <button className="p-2 rounded-lg text-slate-300 transition-all">
              {expanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
            </button>
          </div>
        </div>

        {/* SLO Full Text */}
        <p className="mt-3 text-sm text-slate-700 dark:text-slate-200 font-medium leading-relaxed line-clamp-2">
          {slo.slo_full_text || 'No description available.'}
        </p>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {slo.subject && (
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide bg-slate-50 dark:bg-white/5 px-2 py-1 rounded-lg">
              📚 {slo.subject}
            </span>
          )}
          {slo.grade_level && (
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide bg-slate-50 dark:bg-white/5 px-2 py-1 rounded-lg">
              🎓 {slo.grade_level}
            </span>
          )}
          {slo.cognitive_complexity && (
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide bg-slate-50 dark:bg-white/5 px-2 py-1 rounded-lg">
              🧠 {slo.cognitive_complexity}
            </span>
          )}
          {confidence > 0 && (
            <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-lg ${confidence >= 90 ? 'bg-green-50 text-green-600' : confidence >= 70 ? 'bg-yellow-50 text-yellow-600' : 'bg-red-50 text-red-500'}`}>
              ✓ {confidence}% match
            </span>
          )}
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-slate-100 dark:border-white/5 p-5 bg-slate-50/50 dark:bg-white/2 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">

          {slo.teaching_strategies?.length > 0 && (
            <div>
              <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-2 flex items-center gap-1.5">
                <Lightbulb size={11}/> Teaching Strategies
              </h4>
              <div className="flex flex-wrap gap-2">
                {slo.teaching_strategies.map((s, i) => (
                  <span key={i} className="text-xs bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 px-3 py-1 rounded-full font-medium">{s}</span>
                ))}
              </div>
            </div>
          )}

          {slo.assessment_ideas?.length > 0 && (
            <div>
              <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-2 flex items-center gap-1.5">
                <Target size={11}/> Assessment Ideas
              </h4>
              <div className="flex flex-wrap gap-2">
                {slo.assessment_ideas.map((a, i) => (
                  <span key={i} className="text-xs bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 px-3 py-1 rounded-full font-medium">{a}</span>
                ))}
              </div>
            </div>
          )}

          {slo.prerequisite_concepts?.length > 0 && (
            <div>
              <h4 className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-2 flex items-center gap-1.5">
                <Layers size={11}/> Prerequisites
              </h4>
              <div className="flex flex-wrap gap-2">
                {slo.prerequisite_concepts.map((p, i) => (
                  <span key={i} className="text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 px-3 py-1 rounded-full font-medium">{p}</span>
                ))}
              </div>
            </div>
          )}

          {slo.common_misconceptions?.length > 0 && (
            <div>
              <h4 className="text-[10px] font-black uppercase tracking-widest text-red-500 mb-2 flex items-center gap-1.5">
                <AlertTriangle size={11}/> Common Misconceptions
              </h4>
              <div className="flex flex-wrap gap-2">
                {slo.common_misconceptions.map((m, i) => (
                  <span key={i} className="text-xs bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 px-3 py-1 rounded-full font-medium">{m}</span>
                ))}
              </div>
            </div>
          )}

          {slo.keywords?.length > 0 && (
            <div>
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5">
                <Tag size={11}/> Keywords
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {slo.keywords.map((k, i) => (
                  <span key={i} className="text-[10px] bg-slate-100 dark:bg-white/5 text-slate-500 px-2 py-0.5 rounded font-medium">{k}</span>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2 flex items-center justify-between text-[10px] text-slate-400">
            <span>📄 {docName} {slo.page_number ? `· Page ${slo.page_number}` : ''}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onUseInTool(slo); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-bold text-[10px] uppercase tracking-wide hover:bg-indigo-700 transition-all"
            >
              <Zap size={10}/> Use in Tools <ArrowRight size={10}/>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StandardsBrowser({ user, documents, onViewChange }: StandardsBrowserProps) {
  const [slos, setSlos] = useState<SLO[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedGrade, setSelectedGrade] = useState('');
  const [selectedBloom, setSelectedBloom] = useState('');
  const [selectedDoc, setSelectedDoc] = useState('');
  const [copiedCode, setCopiedCode] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<'code' | 'bloom' | 'confidence'>('code');

  const fetchSLOs = useCallback(async () => {
    setLoading(true);
    try {
      const docIds = documents.map(d => d.id);
      if (docIds.length === 0) { setLoading(false); return; }

      const { data, error } = await supabase
        .from('slo_database')
        .select('*')
        .in('document_id', docIds)
        .order('slo_code', { ascending: true });

      if (error) throw error;
      setSlos(data || []);
    } catch (e) {
      console.error('SLO fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [documents]);

  useEffect(() => { fetchSLOs(); }, [fetchSLOs]);

  // Unique filter options derived from data
  const subjects = useMemo(() => [...new Set(slos.map(s => s.subject).filter(Boolean))].sort(), [slos]);
  const grades = useMemo(() => [...new Set(slos.map(s => s.grade_level).filter(Boolean))].sort(), [slos]);
  const blooms = useMemo(() => Object.keys(BLOOM_CONFIG), []);

  const docMap = useMemo(() =>
    Object.fromEntries(documents.map(d => [d.id, d.name])), [documents]);

  // Filter + search
  const filtered = useMemo(() => {
    let result = [...slos];
    const q = searchQuery.toLowerCase().trim();

    if (q) {
      result = result.filter(s =>
        s.slo_code?.toLowerCase().includes(q) ||
        s.slo_full_text?.toLowerCase().includes(q) ||
        s.keywords?.some(k => k.toLowerCase().includes(q)) ||
        s.subject?.toLowerCase().includes(q)
      );
    }
    if (selectedSubject) result = result.filter(s => s.subject === selectedSubject);
    if (selectedGrade) result = result.filter(s => s.grade_level === selectedGrade);
    if (selectedBloom) result = result.filter(s => s.bloom_level === selectedBloom);
    if (selectedDoc) result = result.filter(s => s.document_id === selectedDoc);

    // Sort
    if (sortBy === 'bloom') {
      result.sort((a, b) => (getBloomConfig(a.bloom_level).order) - (getBloomConfig(b.bloom_level).order));
    } else if (sortBy === 'confidence') {
      result.sort((a, b) => (b.extraction_confidence || 0) - (a.extraction_confidence || 0));
    }

    return result;
  }, [slos, searchQuery, selectedSubject, selectedGrade, selectedBloom, selectedDoc, sortBy]);

  const activeFilterCount = [selectedSubject, selectedGrade, selectedBloom, selectedDoc].filter(Boolean).length;

  const clearFilters = () => {
    setSelectedSubject(''); setSelectedGrade('');
    setSelectedBloom(''); setSelectedDoc('');
    setSearchQuery('');
  };

  const handleUseInTool = (slo: SLO) => {
    // Copy to clipboard with context then navigate to tools
    navigator.clipboard.writeText(`SLO ${slo.slo_code}: ${slo.slo_full_text}`);
    if (onViewChange) onViewChange('tools');
  };

  // Stats
  const bloomStats = useMemo(() => {
    const counts: Record<string, number> = {};
    slos.forEach(s => { if (s.bloom_level) counts[s.bloom_level] = (counts[s.bloom_level] || 0) + 1; });
    return counts;
  }, [slos]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"/>
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Loading Standards...</p>
      </div>
    </div>
  );

  if (documents.length === 0) return (
    <div className="max-w-2xl mx-auto text-center py-24 px-6">
      <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/20 rounded-3xl flex items-center justify-center mx-auto mb-6">
        <BookMarked size={36} className="text-indigo-600"/>
      </div>
      <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-3">No Curriculum Documents Yet</h2>
      <p className="text-slate-500 mb-8">Upload a curriculum document first. The AI will automatically extract and index all learning standards (SLO codes) for you to browse here.</p>
      <button
        onClick={() => onViewChange?.('documents')}
        className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-wide hover:bg-indigo-700 transition-all inline-flex items-center gap-2"
      >
        <BookOpen size={18}/> Upload First Document
      </button>
    </div>
  );

  if (slos.length === 0) return (
    <div className="max-w-2xl mx-auto text-center py-24 px-6">
      <div className="w-20 h-20 bg-amber-50 dark:bg-amber-900/20 rounded-3xl flex items-center justify-center mx-auto mb-6">
        <Sparkles size={36} className="text-amber-600"/>
      </div>
      <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-3">No Standards Indexed Yet</h2>
      <p className="text-slate-500 mb-8">Your documents are uploaded but haven't been processed yet. Process them to extract SLO codes.</p>
      <button
        onClick={() => onViewChange?.('documents')}
        className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-wide hover:bg-indigo-700 transition-all inline-flex items-center gap-2"
      >
        <RefreshCw size={18}/> Go to Documents
      </button>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto w-full pb-20 animate-in fade-in duration-300">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-5">
          <div className="p-4 bg-indigo-600 rounded-[1.5rem] text-white shadow-xl shrink-0">
            <BookMarked size={28}/>
          </div>
          <div>
            <h1 className="text-2xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">
              Standards Browser
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">
              {slos.length} learning standards indexed across {documents.length} document{documents.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <button
          onClick={fetchSLOs}
          className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-slate-500 hover:text-indigo-600 hover:border-indigo-300 transition-all text-xs font-bold uppercase tracking-wide"
        >
          <RefreshCw size={14}/> Refresh
        </button>
      </div>

      {/* ── Bloom Distribution Stats ── */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
        {Object.entries(BLOOM_CONFIG).map(([level, cfg]) => {
          const count = bloomStats[level] || 0;
          const pct = slos.length > 0 ? Math.round((count / slos.length) * 100) : 0;
          return (
            <button
              key={level}
              onClick={() => setSelectedBloom(selectedBloom === level ? '' : level)}
              className={`p-3 rounded-2xl border transition-all text-center ${selectedBloom === level ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 shadow-md' : 'bg-white dark:bg-[#111] border-slate-200 dark:border-white/5 hover:border-indigo-300'}`}
            >
              <div className="text-lg mb-1">{cfg.emoji}</div>
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">{level}</div>
              <div className={`text-lg font-black ${cfg.color}`}>{count}</div>
              <div className="text-[9px] text-slate-400">{pct}%</div>
            </button>
          );
        })}
      </div>

      {/* ── Search + Filter Bar ── */}
      <div className="bg-white dark:bg-[#111] border border-slate-200 dark:border-white/5 rounded-2xl p-4 mb-6 shadow-sm">
        <div className="flex items-center gap-3">
          {/* Search input */}
          <div className="flex-1 flex items-center gap-3 bg-slate-50 dark:bg-white/5 rounded-xl px-4 py-2.5">
            <Search size={16} className="text-slate-400 shrink-0"/>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by code, topic, keyword... e.g. BIO09, photosynthesis"
              className="flex-1 bg-transparent text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-600">
                <X size={14}/>
              </button>
            )}
          </div>

          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border font-bold text-xs uppercase tracking-wide transition-all ${showFilters || activeFilterCount > 0 ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-50 dark:bg-white/5 text-slate-500 border-slate-200 dark:border-white/10 hover:border-indigo-300'}`}
          >
            <Filter size={14}/>
            Filters {activeFilterCount > 0 && <span className="bg-white text-indigo-600 rounded-full w-4 h-4 text-[9px] flex items-center justify-center font-black">{activeFilterCount}</span>}
          </button>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
            className="px-3 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-xs font-bold text-slate-500 outline-none cursor-pointer"
          >
            <option value="code">Sort: Code</option>
            <option value="bloom">Sort: Bloom</option>
            <option value="confidence">Sort: Confidence</option>
          </select>
        </div>

        {/* Filter dropdowns */}
        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-white/5 animate-in fade-in slide-in-from-top-1 duration-200">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Subject</label>
              <select
                value={selectedSubject}
                onChange={e => setSelectedSubject(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-700 dark:text-slate-200 outline-none"
              >
                <option value="">All Subjects</option>
                {subjects.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Grade</label>
              <select
                value={selectedGrade}
                onChange={e => setSelectedGrade(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-700 dark:text-slate-200 outline-none"
              >
                <option value="">All Grades</option>
                {grades.map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Bloom Level</label>
              <select
                value={selectedBloom}
                onChange={e => setSelectedBloom(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-700 dark:text-slate-200 outline-none"
              >
                <option value="">All Levels</option>
                {blooms.map(b => <option key={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Document</label>
              <select
                value={selectedDoc}
                onChange={e => setSelectedDoc(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-700 dark:text-slate-200 outline-none"
              >
                <option value="">All Documents</option>
                {documents.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="col-span-2 md:col-span-4 flex items-center justify-center gap-2 py-2 text-xs font-bold text-red-500 hover:text-red-600 transition-all"
              >
                <X size={12}/> Clear all filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Results count ── */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
          {filtered.length === slos.length
            ? `${slos.length} standards`
            : `${filtered.length} of ${slos.length} standards`}
        </p>
        {copiedCode && (
          <div className="flex items-center gap-2 text-xs font-bold text-green-600 bg-green-50 px-3 py-1.5 rounded-full animate-in fade-in duration-200">
            <Check size={12}/> Copied: {copiedCode}
          </div>
        )}
      </div>

      {/* ── SLO Cards Grid ── */}
      {filtered.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-4xl mb-4">🔍</div>
          <h3 className="text-lg font-black text-slate-400 uppercase tracking-wide mb-2">No Standards Match</h3>
          <p className="text-slate-400 text-sm">Try a different search term or clear your filters.</p>
          <button onClick={clearFilters} className="mt-4 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl font-bold text-sm hover:bg-indigo-100 transition-all">
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(slo => (
            <SLOCard
              key={slo.id}
              slo={slo}
              docName={docMap[slo.document_id] || 'Unknown Document'}
              onCopy={code => { setCopiedCode(code); setTimeout(() => setCopiedCode(''), 3000); }}
              onUseInTool={handleUseInTool}
            />
          ))}
        </div>
      )}
    </div>
  );
}
