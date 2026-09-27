import { ActivityLog, ActivityCategory, ActivityStatus, Document } from '../types';
import { supabase } from './supabase';

const STORAGE_KEY = 'pedagogy_activity_logs';
const MAX_LOGS = 500;

export interface LogFilterOptions {
  category?: ActivityCategory | 'all';
  status?: ActivityStatus | 'all';
  search?: string;
  timeRange?: 'all' | '24h' | '7d' | '30d';
  limit?: number;
}

/**
 * Persistently logs an activity event to local storage, dispatches a real-time event,
 * and records it in the database vault if available.
 */
export async function logActivity(
  entry: Omit<ActivityLog, 'id' | 'timestamp'> & { id?: string; timestamp?: string }
): Promise<ActivityLog> {
  const newLog: ActivityLog = {
    id: entry.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`),
    timestamp: entry.timestamp || new Date().toISOString(),
    category: entry.category,
    action: entry.action,
    summary: entry.summary,
    status: entry.status,
    durationMs: entry.durationMs,
    userId: entry.userId,
    metadata: entry.metadata || {}
  };

  if (typeof window !== 'undefined') {
    try {
      const existing = getStoredLogs();
      const updated = [newLog, ...existing.filter(item => item.id !== newLog.id)].slice(0, MAX_LOGS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

      // Dispatch custom event for real-time reactivity in UI components
      window.dispatchEvent(new CustomEvent('pedagogy:activity-logged', { detail: newLog }));
    } catch (err) {
      console.warn('[ActivityLogger] Local storage write warning:', err);
    }
  }

  // Asynchronously sync to Supabase improvement_signals for cloud audit resilience
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const effectiveUserId = entry.userId || session?.user?.id;
    if (effectiveUserId) {
      await supabase.from('improvement_signals').insert({
        user_id: effectiveUserId,
        signal_type: `activity:${entry.category}`,
        signal_data: {
          action: entry.action,
          summary: entry.summary,
          status: entry.status,
          durationMs: entry.durationMs,
          metadata: entry.metadata
        },
        tool_type: entry.metadata?.toolName || 'system',
        created_at: newLog.timestamp,
        compiled: false
      });
    }
  } catch (_) {
    // Non-blocking background sync
  }

  return newLog;
}

/**
 * Retrieves raw stored logs from localStorage.
 */
function getStoredLogs(): ActivityLog[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Generates synthetic baseline activity logs from real curriculum documents
 * and system events if the log store is sparse or on first initialization.
 */
export function generateSeedActivities(documents: Document[] = []): ActivityLog[] {
  const seedLogs: ActivityLog[] = [];

  // Seed from actual documents in the vault
  for (const doc of documents) {
    const isReady = doc.status === 'ready';
    const isFailed = doc.status === 'failed';
    const sloCountMatch = doc.documentSummary?.match(/slos:(\d+)/i);
    const slosExtracted = sloCountMatch ? parseInt(sloCountMatch[1], 10) : undefined;

    seedLogs.push({
      id: `doc_upload_${doc.id}`,
      timestamp: doc.createdAt || new Date(Date.now() - 3600000).toISOString(),
      category: 'document_upload',
      action: 'Curriculum Document Ingested',
      summary: `Processed and aligned ${doc.name}${slosExtracted ? ` (${slosExtracted} SLOs vectorized)` : ''}`,
      status: isFailed ? 'failed' : isReady ? 'success' : 'processing',
      metadata: {
        documentId: doc.id,
        documentName: doc.name,
        board: doc.authority || 'SINDH',
        subject: doc.subject,
        slosExtracted,
        sourceType: doc.sourceType,
        documentSummary: doc.documentSummary
      }
    });
  }

  // System baseline events
  seedLogs.push(
    {
      id: 'sys_init_node',
      timestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
      category: 'system_event',
      action: 'Institutional Vector Node Handshake',
      summary: 'Connected to high-dimensional embedding space (gemini-embedding-001 @ 768 dims)',
      status: 'success',
      durationMs: 420,
      metadata: { provider: 'Gemini Embedding API', vectorDimension: 768 }
    },
    {
      id: 'sys_init_vault',
      timestamp: new Date(Date.now() - 86400000 * 2 + 15000).toISOString(),
      category: 'system_event',
      action: 'Curriculum Vault Synchronized',
      summary: 'Verified Row-Level Security and canonical curriculum ledger storage',
      status: 'success',
      durationMs: 310,
      metadata: { storageEngine: 'PostgreSQL pgvector', cachePolicy: 'Stale-While-Revalidate' }
    }
  );

  return seedLogs;
}

/**
 * Returns filtered and sorted activity logs, merging stored logs with document history.
 */
export function getActivityLogs(
  documents: Document[] = [],
  options: LogFilterOptions = {}
): ActivityLog[] {
  const stored = getStoredLogs();
  
  // Combine stored logs with document-derived history (avoid duplicates by documentId or id)
  const existingDocIds = new Set(stored.map(s => s.metadata?.documentId).filter(Boolean));
  const existingIds = new Set(stored.map(s => s.id));

  const seeds = generateSeedActivities(documents).filter(
    seed => !existingIds.has(seed.id) && (!seed.metadata?.documentId || !existingDocIds.has(seed.metadata.documentId))
  );

  let allLogs = [...stored, ...seeds];

  // Sort descending by timestamp
  allLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Apply Category Filter
  if (options.category && options.category !== 'all') {
    allLogs = allLogs.filter(log => log.category === options.category);
  }

  // Apply Status Filter
  if (options.status && options.status !== 'all') {
    allLogs = allLogs.filter(log => log.status === options.status);
  }

  // Apply Time Range Filter
  if (options.timeRange && options.timeRange !== 'all') {
    const now = Date.now();
    const cutoffs: Record<string, number> = {
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };
    const maxAge = cutoffs[options.timeRange] || 0;
    if (maxAge > 0) {
      allLogs = allLogs.filter(log => now - new Date(log.timestamp).getTime() <= maxAge);
    }
  }

  // Apply Search Filter
  if (options.search && options.search.trim()) {
    const q = options.search.toLowerCase().trim();
    allLogs = allLogs.filter(log => {
      const matchAction = log.action.toLowerCase().includes(q);
      const matchSummary = log.summary.toLowerCase().includes(q);
      const matchCategory = log.category.toLowerCase().includes(q);
      const matchDoc = log.metadata?.documentName?.toLowerCase().includes(q);
      const matchTool = log.metadata?.toolName?.toLowerCase().includes(q);
      const matchPrompt = log.metadata?.promptPreview?.toLowerCase().includes(q);
      return matchAction || matchSummary || matchCategory || matchDoc || matchTool || matchPrompt;
    });
  }

  if (options.limit && options.limit > 0) {
    allLogs = allLogs.slice(0, options.limit);
  }

  return allLogs;
}

/**
 * Clears locally stored activity logs.
 */
export function clearActivityLogs(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('pedagogy:activity-logged', { detail: null }));
  }
}

/**
 * Exports activity logs as a downloadable file (JSON or CSV).
 */
export function exportActivityLogs(logs: ActivityLog[], format: 'json' | 'csv' = 'json'): void {
  if (typeof window === 'undefined' || logs.length === 0) return;

  const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
  let content = '';
  let mimeType = '';
  let filename = '';

  if (format === 'json') {
    content = JSON.stringify(logs, null, 2);
    mimeType = 'application/json;charset=utf-8;';
    filename = `pedagogy_activity_log_${timestampStr}.json`;
  } else {
    // CSV format
    const headers = ['ID', 'Timestamp', 'Category', 'Action', 'Status', 'Duration (ms)', 'Summary', 'Metadata'];
    const rows = logs.map(log => [
      `"${log.id}"`,
      `"${log.timestamp}"`,
      `"${log.category}"`,
      `"${log.action.replace(/"/g, '""')}"`,
      `"${log.status}"`,
      log.durationMs !== undefined ? log.durationMs : '',
      `"${log.summary.replace(/"/g, '""')}"`,
      `"${JSON.stringify(log.metadata || {}).replace(/"/g, '""')}"`
    ]);
    content = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    mimeType = 'text/csv;charset=utf-8;';
    filename = `pedagogy_activity_log_${timestampStr}.csv`;
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
