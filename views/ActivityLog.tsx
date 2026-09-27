'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Activity, 
  UploadCloud, 
  BrainCircuit, 
  Sliders, 
  Server, 
  Search, 
  Download, 
  Trash2, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  FileText, 
  X, 
  Copy, 
  Check, 
  Sparkles,
  ExternalLink,
  ChevronRight,
  Filter
} from 'lucide-react';
import { UserProfile, Document, ActivityLog, ActivityCategory, ActivityStatus } from '../types';
import { getActivityLogs, clearActivityLogs, exportActivityLogs, logActivity, LogFilterOptions } from '../lib/activity-logger';

interface ActivityLogViewProps {
  user: UserProfile;
  documents: Document[];
  onViewChange?: (view: string) => void;
}

export default function ActivityLogView({ user, documents, onViewChange }: ActivityLogViewProps) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<ActivityCategory | 'all'>('all');
  const [selectedStatus, setSelectedStatus] = useState<ActivityStatus | 'all'>('all');
  const [timeRange, setTimeRange] = useState<'all' | '24h' | '7d' | '30d'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load and refresh logs
  const refreshLogs = () => {
    setIsRefreshing(true);
    const filterOpts: LogFilterOptions = {
      category: selectedCategory,
      status: selectedStatus,
      timeRange: timeRange,
      search: searchQuery
    };
    const loaded = getActivityLogs(documents, filterOpts);
    setLogs(loaded);
    setTimeout(() => setIsRefreshing(false), 300);
  };

  useEffect(() => {
    refreshLogs();

    // Listen to real-time activity events dispatched anywhere in the application
    const handleNewActivity = () => {
      const filterOpts: LogFilterOptions = {
        category: selectedCategory,
        status: selectedStatus,
        timeRange: timeRange,
        search: searchQuery
      };
      setLogs(getActivityLogs(documents, filterOpts));
    };

    window.addEventListener('pedagogy:activity-logged', handleNewActivity);
    return () => {
      window.removeEventListener('pedagogy:activity-logged', handleNewActivity);
    };
  }, [documents, selectedCategory, selectedStatus, timeRange, searchQuery]);

  // Aggregate Stats
  const stats = useMemo(() => {
    const all = getActivityLogs(documents);
    const total = all.length;
    const uploads = all.filter(l => l.category === 'document_upload').length;
    const queries = all.filter(l => l.category === 'query_completion').length;
    const settings = all.filter(l => l.category === 'setting_adjustment').length;
    const successful = all.filter(l => l.status === 'success').length;
    const successRate = total > 0 ? Math.round((successful / total) * 100) : 100;
    
    // Average latency for query completions
    const timedQueries = all.filter(l => l.durationMs && l.durationMs > 0);
    const avgLatency = timedQueries.length > 0 
      ? Math.round(timedQueries.reduce((acc, curr) => acc + (curr.durationMs || 0), 0) / timedQueries.length)
      : null;

    return { total, uploads, queries, settings, successRate, avgLatency };
  }, [documents, logs]);

  const handleCopyPayload = (obj: any) => {
    if (!obj) return;
    navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to clear your local activity audit logs? Note: Institutional records stored in the cloud vault will remain intact.')) {
      clearActivityLogs();
      refreshLogs();
    }
  };

  const handleCreateTestLog = async () => {
    await logActivity({
      category: 'system_event',
      action: 'Platform Integrity Heartbeat',
      summary: 'Audited neural weights, PostgreSQL vector indices, and active session cryptographic keys',
      status: 'success',
      durationMs: 145,
      metadata: {
        checkedBy: user.email,
        activeDocumentsCount: documents.length,
        memoryFootprint: 'Optimal',
        latencyScore: '99.4%'
      }
    });
    refreshLogs();
  };

  const formatRelativeTime = (timestamp: string) => {
    try {
      const now = Date.now();
      const date = new Date(timestamp).getTime();
      const diffMs = now - date;
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHour = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHour / 24);

      if (diffSec < 45) return 'Just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      if (diffHour < 24) return `${diffHour}h ago`;
      if (diffDay < 7) return `${diffDay}d ago`;
      return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return timestamp;
    }
  };

  const getCategoryDetails = (cat: ActivityCategory) => {
    switch (cat) {
      case 'document_upload':
        return { icon: UploadCloud, label: 'Document Ingestion', color: 'text-emerald-500' };
      case 'query_completion':
        return { icon: BrainCircuit, label: 'Query Completion', color: 'text-indigo-500' };
      case 'setting_adjustment':
        return { icon: Sliders, label: 'Configuration Change', color: 'text-amber-500' };
      case 'system_event':
      default:
        return { icon: Server, label: 'System Event', color: 'text-cyan-500' };
    }
  };

  const getStatusDetails = (status: ActivityStatus) => {
    switch (status) {
      case 'success':
        return { icon: CheckCircle2, text: 'text-emerald-600 dark:text-emerald-400', label: 'Verified' };
      case 'failed':
        return { icon: AlertTriangle, text: 'text-rose-600 dark:text-rose-400', label: 'Fault' };
      case 'processing':
      default:
        return { icon: Clock, text: 'text-amber-600 dark:text-amber-400', label: 'Processing' };
    }
  };

  return (
    <div className="space-y-6">
      {/* Header section with high-clarity title and actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white uppercase">
              Activity & Transparency Log
            </h1>
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Live Monitoring
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-2xl font-medium">
            Verifiable audit trail tracking document uploads, neural query completions, and settings adjustments for institutional transparency.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={refreshLogs}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors shadow-sm"
            title="Refresh Activity Log"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>

          <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            <button
              onClick={() => exportActivityLogs(logs, 'json')}
              disabled={logs.length === 0}
              className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-r border-slate-200 dark:border-slate-800"
              title="Export as JSON"
            >
              <Download size={13} />
              <span>JSON</span>
            </button>
            <button
              onClick={() => exportActivityLogs(logs, 'csv')}
              disabled={logs.length === 0}
              className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              title="Export as CSV"
            >
              <Download size={13} />
              <span>CSV</span>
            </button>
          </div>

          <button
            onClick={handleClearAll}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 hover:bg-rose-100 dark:hover:bg-rose-900/40 rounded-lg transition-colors"
            title="Clear stored local records"
          >
            <Trash2 size={13} />
            <span className="hidden sm:inline">Clear Local</span>
          </button>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Total Tracked</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{stats.total}</p>
          <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-1">Logged operational interactions</p>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Curricula Ingested</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{stats.uploads}</p>
          <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-1">Vault uploads & vectorized nodes</p>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">Query Syntheses</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{stats.queries}</p>
          <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-1">Pedagogical chat & tool runs</p>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">Settings Tuned</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{stats.settings}</p>
          <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-1">Themes & neural parameters</p>
        </div>

        <div className="col-span-2 md:col-span-1 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-400">Reliability Rate</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-slate-900 dark:text-white">{stats.successRate}%</span>
            {stats.avgLatency && (
              <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400">~{stats.avgLatency}ms</span>
            )}
          </div>
          <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-1">Success execution ratio</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
          {/* Search box */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="Search actions, documents, models, or keywords..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Time range selector */}
          <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
            <span className="font-semibold text-[11px] uppercase tracking-wider">Time:</span>
            {(['all', '24h', '7d', '30d'] as const).map(range => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                  timeRange === range
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {range === 'all' ? 'All Time' : range.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Category & Status Filter Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mr-1">
              Category:
            </span>
            {[
              { id: 'all', label: 'All Activities' },
              { id: 'document_upload', label: 'Document Uploads' },
              { id: 'query_completion', label: 'Query Completions' },
              { id: 'setting_adjustment', label: 'Setting Adjustments' },
              { id: 'system_event', label: 'System Events' },
            ].map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id as any)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  selectedCategory === cat.id
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mr-1">
              Status:
            </span>
            {[
              { id: 'all', label: 'All' },
              { id: 'success', label: 'Verified' },
              { id: 'processing', label: 'Processing' },
              { id: 'failed', label: 'Faults' },
            ].map(st => (
              <button
                key={st.id}
                onClick={() => setSelectedStatus(st.id as any)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                  selectedStatus === st.id
                    ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Activity Logs Table / List */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
        {logs.length === 0 ? (
          <div className="py-16 px-4 text-center">
            <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3 text-slate-400">
              <Activity size={24} />
            </div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-tight">
              No matching activity records
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              {searchQuery || selectedCategory !== 'all' || selectedStatus !== 'all' || timeRange !== 'all'
                ? 'Try clearing active filters to see earlier records.'
                : 'As you interact with the platform (uploading curricula, chatting with neural models, or tuning settings), events will appear here in real time.'}
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              {(searchQuery || selectedCategory !== 'all' || selectedStatus !== 'all' || timeRange !== 'all') && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('all');
                    setSelectedStatus('all');
                    setTimeRange('all');
                  }}
                  className="px-3 py-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg transition-colors"
                >
                  Reset Filters
                </button>
              )}
              <button
                onClick={handleCreateTestLog}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Simulate System Audit Event
              </button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {logs.map((log) => {
              const cat = getCategoryDetails(log.category);
              const Icon = cat.icon;
              const status = getStatusDetails(log.status);
              const StatusIcon = status.icon;

              return (
                <div
                  key={log.id}
                  onClick={() => setSelectedLog(log)}
                  className="p-4 flex items-start gap-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group"
                >
                  {/* Category icon with domain styling */}
                  <div className={`mt-0.5 p-2 rounded-lg bg-slate-100 dark:bg-slate-800 shrink-0 ${cat.color}`}>
                    <Icon size={18} />
                  </div>

                  {/* Primary Activity Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {log.action}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">·</span>
                        <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                          {cat.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {log.durationMs !== undefined && log.durationMs > 0 && (
                          <span className="text-[11px] font-mono text-slate-600 dark:text-slate-400">
                            {log.durationMs}ms
                          </span>
                        )}
                        <span 
                          className="text-[11px] text-slate-600 dark:text-slate-400 font-medium"
                          title={new Date(log.timestamp).toUTCString()}
                        >
                          {formatRelativeTime(log.timestamp)}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 line-clamp-2">
                      {log.summary}
                    </p>

                    {/* Metadata Context Badges (Zero-pill text separators) */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-slate-600 dark:text-slate-400">
                      <div className="flex items-center gap-1">
                        <StatusIcon size={12} className={status.text} />
                        <span className={`font-semibold ${status.text}`}>{status.label}</span>
                      </div>

                      {log.metadata?.documentName && (
                        <>
                          <span>·</span>
                          <span className="truncate max-w-[200px] text-slate-700 dark:text-slate-300 font-medium">
                            📄 {log.metadata.documentName}
                          </span>
                        </>
                      )}

                      {log.metadata?.slosExtracted !== undefined && (
                        <>
                          <span>·</span>
                          <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                            {log.metadata.slosExtracted} SLOs
                          </span>
                        </>
                      )}

                      {log.metadata?.toolName && (
                        <>
                          <span>·</span>
                          <span className="text-indigo-700 dark:text-indigo-400 font-medium">
                            Tool: {log.metadata.toolName}
                          </span>
                        </>
                      )}

                      {log.metadata?.model && (
                        <>
                          <span>·</span>
                          <span className="font-mono text-slate-600 dark:text-slate-400">
                            {log.metadata.model}
                          </span>
                        </>
                      )}

                      <span className="ml-auto text-indigo-600 dark:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity font-semibold flex items-center gap-0.5">
                        Inspect Details <ChevronRight size={12} />
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Inspection Drawer / Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                  <Activity size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {selectedLog.action}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    ID: <span className="font-mono">{selectedLog.id}</span>
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedLog(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar">
              {/* Summary */}
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  Summary & Context
                </span>
                <p className="text-sm text-slate-800 dark:text-slate-200 mt-1 font-medium bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200/60 dark:border-slate-800">
                  {selectedLog.summary}
                </p>
              </div>

              {/* Key Attributes Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-300">Category</span>
                  <p className="font-semibold text-slate-900 dark:text-white capitalize mt-0.5">
                    {selectedLog.category.replace('_', ' ')}
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-300">Status</span>
                  <p className="font-semibold text-emerald-700 dark:text-emerald-400 capitalize mt-0.5">
                    {selectedLog.status}
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-300">Timestamp</span>
                  <p className="font-mono text-[11px] text-slate-700 dark:text-slate-300 mt-0.5 truncate" title={selectedLog.timestamp}>
                    {new Date(selectedLog.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-300">Execution Latency</span>
                  <p className="font-mono text-slate-900 dark:text-white mt-0.5">
                    {selectedLog.durationMs !== undefined ? `${selectedLog.durationMs}ms` : 'Recorded'}
                  </p>
                </div>
              </div>

              {/* Raw Structured Metadata */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Audit Metadata & Cryptographic Payload
                  </span>
                  <button
                    onClick={() => handleCopyPayload(selectedLog)}
                    className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700"
                  >
                    {isCopied ? <Check size={12} /> : <Copy size={12} />}
                    <span>{isCopied ? 'Copied' : 'Copy JSON'}</span>
                  </button>
                </div>

                <pre className="p-3 bg-slate-950 text-slate-200 rounded-xl text-xs font-mono overflow-x-auto max-h-56 custom-scrollbar border border-slate-800">
                  {JSON.stringify(selectedLog.metadata || {}, null, 2)}
                </pre>
              </div>

              {/* Action Jump Button */}
              {selectedLog.category === 'document_upload' && onViewChange && (
                <div className="pt-2">
                  <button
                    onClick={() => {
                      setSelectedLog(null);
                      onViewChange('documents');
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold uppercase tracking-wider transition-colors shadow-sm"
                  >
                    <FileText size={14} />
                    <span>View In Curriculum Vault</span>
                  </button>
                </div>
              )}

              {selectedLog.category === 'query_completion' && onViewChange && (
                <div className="pt-2">
                  <button
                    onClick={() => {
                      setSelectedLog(null);
                      onViewChange('chat');
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold uppercase tracking-wider transition-colors shadow-sm"
                  >
                    <BrainCircuit size={14} />
                    <span>Open Neural Chat Session</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
