// FIXED: components/DocumentUploader.tsx — Pedagogy Master AI
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { BrainCircuit, UploadCloud, AlertCircle, ShieldCheck, Database, Zap, Loader2, RefreshCw, Clock, AlertTriangle, WifiOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import * as pdfjs from 'pdfjs-dist';

if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

export default function DocumentUploader({ userId, onComplete, onCancel }: any) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [mode, setMode] = useState<'upload' | 'manual'>('upload');
  const [manualText, setManualText] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [isStorageOffline, setIsStorageOffline] = useState(false);

  useEffect(() => {
    fetch('/api/docs/upload', { method: 'OPTIONS' })
      .then(res => res.json())
      .then(data => setIsStorageOffline(!data.storageActive))
      .catch(() => setIsStorageOffline(true));
  }, []);

  const isPolling = useRef(false);
  const progressRef = useRef(0);
  const lastTriggerRef = useRef<number>(0);

  const updateProgress = (value: number) => {
    progressRef.current = value;
    setProgress(value);
  };

  const notFoundCountRef = useRef(0);

  // ── Polling loop ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (docId && isUploading && !isPolling.current) {
      isPolling.current = true;
      notFoundCountRef.current = 0;

      const poller = setInterval(async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) return;

          const res = await fetch(`/api/docs/status/${docId}`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
          });

          if (!res.ok) {
            if (res.status === 404) {
              notFoundCountRef.current += 1;
              if (notFoundCountRef.current > 5) throw new Error('Document node not found after retries.');
              console.warn(`[Poller] Document not found (attempt ${notFoundCountRef.current}/5). Retrying...`);
            }
            return;
          }

          notFoundCountRef.current = 0;
          const data = await res.json();

          if (data.status === 'ready' || data.status === 'complete') {
            clearInterval(poller);
            isPolling.current = false;
            updateProgress(100);
            setStatus('Neural Alignment Verified!');
            setTimeout(() => onComplete(data), 1000);

          } else if (data.status === 'failed') {
            clearInterval(poller);
            isPolling.current = false;

            let rawErr = data.summary || data.error || 'Extraction Node Fault.';
            let cleanErr = rawErr;
            if (rawErr.startsWith('slo_extraction_failed')) {
              cleanErr = 'Curriculum Extraction Failed. No SLOs were detected. Ensure the PDF has clear text and follows a standard curriculum format.';
            } else if (rawErr.includes('SCANNED_PDF')) {
              cleanErr = 'This appears to be a scanned (image-only) PDF. Please use a text-based PDF or try Manual Entry mode.';
            } else if (rawErr.includes('API_KEY_MISSING')) {
              cleanErr = 'AI processing unavailable: API key not configured. Contact your administrator.';
            } else if (rawErr.includes('{\"error\"')) {
              try {
                const match = rawErr.match(/\{.*\}/);
                if (match) cleanErr = JSON.parse(match[0]).error?.message || cleanErr;
              } catch (_) {}
            }

            setError(cleanErr);
            setIsUploading(false);

          } else {
            const backendProgress = data.progress || 0;
            if (backendProgress > progressRef.current) {
              updateProgress(backendProgress);
            } else {
              updateProgress(Math.min(99, progressRef.current + 0.1));
            }
            setStatus(data.summary || 'Unrolling Curriculum Domains...');

            // Heartbeat: re-trigger processing if stuck (serverless functions can be killed)
            const now = Date.now();
            if (now - lastTriggerRef.current > 30000) {
              lastTriggerRef.current = now;
              console.log(`[Heartbeat] Retriggering at ${progressRef.current.toFixed(0)}%`);
              triggerProcessing(docId, session.access_token);
            }
          }
        } catch (e: any) {
          console.error('[Poller] Error:', e);
          if (e.message?.includes('not found')) {
            clearInterval(poller);
            setError('Document was lost during processing. Please try again.');
            setIsUploading(false);
          }
        }
      }, 2000);

      return () => {
        clearInterval(poller);
        isPolling.current = false;
      };
    }
  }, [docId, isUploading, onComplete]);

  // ── Fire-and-forget trigger (does NOT block the upload UX) ─────────────────
  function triggerProcessing(documentId: string, token: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 290000);

    fetch(`/api/docs/process/${documentId}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      signal: controller.signal
    }).then(async res => {
      clearTimeout(timeout);
      if (!res.ok && res.status >= 500) {
        const errData = await res.json().catch(() => ({}));
        console.error('[Trigger] Processing fault:', errData);
        const errMsg = errData.details || errData.error || 'Processing engine fault.';
        setError(errMsg);
        setIsUploading(false);
      }
    }).catch(e => {
      clearTimeout(timeout);
      if (e.name !== 'AbortError') {
        console.warn('[Trigger] Network warning (non-fatal):', e.message);
        // Don't kill the UI — the poller heartbeat will retry
      }
    });
  }

  // ── PDF text extraction (client-side fast-start) ────────────────────────────
  const extractTextFromPDF = async (file: File): Promise<string> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      const totalPages = pdf.numPages;
      const batchSize = 10;
      let fullText = '';

      for (let i = 1; i <= totalPages; i += batchSize) {
        const endPage = Math.min(i + batchSize - 1, totalPages);
        const pagePromises = [];
        for (let j = i; j <= endPage; j++) {
          pagePromises.push(
            pdf.getPage(j).then(page =>
              page.getTextContent().then(tc =>
                tc.items.map((item: any) => item.str).join(' ')
              )
            )
          );
        }
        const pageTexts = await Promise.all(pagePromises);
        fullText += pageTexts.join('\n') + '\n';
        updateProgress(10 + (endPage / totalPages) * 10);
      }

      // BUG FIX C1: Cap extracted text at 1.5MB before sending.
      // Server-side pdf-parse is the authoritative source; this is just
      // a fast-start optimization. Capping prevents request body issues.
      const MAX_CHARS = 1_500_000; // 1.5MB
      if (fullText.length > MAX_CHARS) {
        console.warn(`[LocalExtract] Truncating ${fullText.length} → ${MAX_CHARS} chars`);
        fullText = fullText.substring(0, MAX_CHARS);
      }

      return fullText;
    } catch (e) {
      console.error('[LocalExtract] Failed:', e);
      return ''; // Server-side extraction is the fallback
    }
  };

  // ── Handshake helper ────────────────────────────────────────────────────────
  async function handshakeWithGateway(
    name: string,
    contentType: string,
    extractedText: string,
    token: string
  ) {
    // BUG FIX C2: The main "Failed to fetch" cause.
    // Previously: extractedText sent inline in the handshake body.
    // For large PDFs the total body approached or exceeded Vercel's 4.5MB limit,
    // causing a TCP-level rejection with NO response — "Failed to fetch".
    //
    // Fix: Send ONLY metadata in the handshake (name + contentType).
    // extractedText is stored separately via a direct Supabase client update
    // AFTER we get the documentId. This keeps the handshake tiny (~200 bytes).
    const res = await fetch('/api/docs/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, contentType })
      // extractedText intentionally REMOVED from this call
    });

    if (!res.ok) {
      let errorMessage = `Upload gateway error (${res.status}).`;
      try {
        const err = await res.json();
        errorMessage = err.error || errorMessage;
      } catch (_) {}
      throw new Error(errorMessage);
    }

    const handshakeData = await res.json();

    // BUG FIX C2 continued: Store extractedText directly via Supabase client
    // AFTER the handshake, only if we have text to store.
    if (extractedText && extractedText.length > 100 && handshakeData.documentId) {
      try {
        await supabase
          .from('documents')
          .update({ extracted_text: extractedText })
          .eq('id', handshakeData.documentId);
      } catch (textUpdateErr) {
        // Non-fatal: server-side Stage 1 will extract the text from R2 anyway
        console.warn('[Handshake] Could not store client-extracted text:', textUpdateErr);
      }
    }

    return handshakeData;
  }

  // ── Manual entry handler ────────────────────────────────────────────────────
  const handleManualSubmit = async () => {
    if (!manualText.trim() || !manualTitle.trim()) {
      setError('Please provide both a title and curriculum text.');
      return;
    }

    setError(null);
    setIsUploading(true);
    lastTriggerRef.current = Date.now();
    updateProgress(10);
    setStatus('Initializing Neural Context...');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expired. Please sign in again.');

      const handshake = await handshakeWithGateway(
        manualTitle, 'text/plain', manualText, session.access_token
      );
      setDocId(handshake.documentId);
      updateProgress(40);
      setStatus('Initializing Neural Orchestrator...');
      triggerProcessing(handshake.documentId, session.access_token);

    } catch (err: any) {
      setError(err.message || 'Manual sync failed. Please try again.');
      setIsUploading(false);
    }
  };

  // ── File upload handler ─────────────────────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // File size guard: warn for very large files
    const MAX_FILE_SIZE_MB = 50;
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setError(`File too large (${(file.size / 1024 / 1024).toFixed(0)}MB). Maximum is ${MAX_FILE_SIZE_MB}MB. Try splitting the PDF into smaller sections.`);
      return;
    }

    setError(null);
    setIsUploading(true);
    lastTriggerRef.current = Date.now();
    updateProgress(5);
    setStatus('Handshaking with Grid...');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expired. Please sign in again.');

      // Extract text client-side for fast-start (server will also extract from R2 in Stage 1)
      let extractedText = '';
      if (file.type === 'application/pdf') {
        setStatus('Extracting Text Locally...');
        updateProgress(10);
        extractedText = await extractTextFromPDF(file);
      } else if (file.type === 'text/plain' || file.name.endsWith('.md')) {
        extractedText = await file.text();
      }

      // Handshake — now sends ONLY name + contentType (small payload)
      setStatus('Handshaking with Grid...');
      const handshake = await handshakeWithGateway(
        file.name, file.type || 'application/pdf', extractedText, session.access_token
      );
      const { uploadUrl, documentId } = handshake;
      setDocId(documentId);
      updateProgress(25);

      // Upload binary to R2 if we got a signed URL
      if (uploadUrl) {
        setStatus('Streaming Binary Payload to Vault...');
        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type || 'application/pdf' }
        });
        if (!uploadRes.ok) {
          // R2 failure is non-fatal if we have extractedText
          console.error(`[R2 Upload] Failed: ${uploadRes.status}`);
          if (!extractedText) {
            throw new Error(`Cloud storage rejected the file (${uploadRes.status}). Please try Manual Entry mode.`);
          }
          console.warn('[R2 Upload] Binary upload failed but extractedText is available — continuing.');
        }
      } else {
        setStatus('Storage offline — using extracted text path...');
      }

      updateProgress(40);
      setStatus('Initializing Neural Orchestrator...');
      triggerProcessing(documentId, session.access_token);

    } catch (err: any) {
      // BUG FIX C3: Show the actual error message, not just "Failed to fetch".
      // Provide actionable guidance based on error type.
      let userMessage = err.message || 'Upload failed. Please try again.';

      if (userMessage === 'Failed to fetch' || userMessage.includes('network')) {
        userMessage = 'Network error: Could not connect to the server. Check your internet connection and try again. If the problem persists, try Manual Entry mode.';
      } else if (userMessage.includes('413') || userMessage.includes('too large')) {
        userMessage = 'File too large for upload. Please try Manual Entry mode or split the PDF into smaller sections.';
      } else if (userMessage.includes('401') || userMessage.includes('Identity')) {
        userMessage = 'Session expired. Please sign out and sign in again.';
      }

      setError(userMessage);
      setIsUploading(false);
    }
  };

  const isQuotaError = error?.toLowerCase().includes('quota') || error?.toLowerCase().includes('429');
  const isNetworkError = error?.toLowerCase().includes('network') || error?.toLowerCase().includes('connection');

  return (
    <div className="bg-white dark:bg-[#080808] rounded-[3rem] p-6 md:p-12 w-full max-w-xl shadow-2xl border border-slate-100 dark:border-white/5 relative overflow-hidden text-left">
      <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-600 via-purple-500 to-emerald-500" />
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div className="w-14 h-14 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-2xl">
            {isUploading ? <BrainCircuit size={28} className="animate-pulse" /> : <UploadCloud size={28} />}
          </div>
          <div className="px-4 py-1.5 bg-emerald-50 dark:bg-emerald-950/30 rounded-full border border-emerald-100 dark:border-emerald-500/20 flex items-center gap-2">
            <Zap size={12} className="text-emerald-500" />
            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Grid Sync v165.0</span>
          </div>
        </div>

        <div>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Ingest Asset</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Foundational Curriculum Orchestrator</p>
        </div>

        {!isUploading && !error && (
          <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-2xl">
            <button
              onClick={() => setMode('upload')}
              className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mode === 'upload' ? 'bg-white dark:bg-slate-800 shadow-sm text-indigo-600' : 'text-slate-400'}`}
            >
              File Upload
            </button>
            <button
              onClick={() => setMode('manual')}
              className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mode === 'manual' ? 'bg-white dark:bg-slate-800 shadow-sm text-indigo-600' : 'text-slate-400'}`}
            >
              Manual Entry
            </button>
          </div>
        )}

        {isStorageOffline && mode === 'upload' && !isUploading && (
          <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-2xl flex items-center gap-3">
            <AlertTriangle size={18} className="text-amber-500 shrink-0" />
            <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-tight">
              Cloud Storage Offline: For best results use{' '}
              <button onClick={() => setMode('manual')} className="underline decoration-2">
                Manual Entry
              </button>.
            </p>
          </div>
        )}

        {error ? (
          <div className="p-8 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-[2rem] space-y-4 animate-in slide-in-from-top-2">
            <div className="flex items-start gap-4 text-rose-600">
              {isNetworkError
                ? <WifiOff size={24} className="shrink-0 mt-1" />
                : isQuotaError
                  ? <Clock size={24} className="shrink-0 mt-1" />
                  : <AlertCircle size={24} className="shrink-0 mt-1" />
              }
              <div className="space-y-1">
                <p className="text-sm font-black uppercase tracking-tight">
                  {isNetworkError ? 'Connection Error' : isQuotaError ? 'Grid Saturated' : 'Sync Handshake Fault'}
                </p>
                <p className="text-xs font-medium leading-relaxed opacity-90">{error}</p>
              </div>
            </div>

            {/* Suggest Manual Entry for network/large file errors */}
            {(isNetworkError || error.includes('large') || error.includes('split')) && (
              <button
                onClick={() => { setError(null); setIsUploading(false); updateProgress(0); setDocId(null); setMode('manual'); }}
                className="w-full py-3 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Database size={14} /> Try Manual Entry
              </button>
            )}

            <button
              onClick={() => { setError(null); setIsUploading(false); updateProgress(0); setDocId(null); }}
              className={`w-full py-4 ${isQuotaError ? 'bg-indigo-600' : 'bg-rose-600'} text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2`}
            >
              <RefreshCw size={14} /> {isQuotaError ? 'Wait and Retry' : 'Re-Initialize Node'}
            </button>
          </div>

        ) : isUploading ? (
          <div className="space-y-6 py-4">
            <div className="h-3 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden shadow-inner">
              <div className="h-full bg-indigo-600 rounded-full transition-all duration-1000 ease-out" style={{ width: `${progress}%` }} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Loader2 size={16} className="text-indigo-600 animate-spin" />
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">{status}</p>
              </div>
              <span className="text-[10px] font-black text-slate-400">{Math.round(progress)}%</span>
            </div>
            <p className="text-[9px] text-slate-400 font-medium italic">
              Establishing neural context nodes. Do not sever the connection.
            </p>
          </div>

        ) : mode === 'manual' ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Document Title</label>
              <input
                type="text"
                value={manualTitle}
                onChange={e => setManualTitle(e.target.value)}
                placeholder="e.g. Grade 10 Mathematics — Sindh Board"
                className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl px-6 py-4 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Curriculum Text (Paste Content)</label>
              <textarea
                value={manualText}
                onChange={e => setManualText(e.target.value)}
                placeholder="Paste the SLOs or curriculum content here..."
                className="w-full h-48 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl px-6 py-4 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none"
              />
            </div>
            <button
              onClick={handleManualSubmit}
              className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-3"
            >
              <Zap size={16} /> Sync Manual Asset
            </button>
          </div>

        ) : (
          <label className="group relative cursor-pointer block">
            <input
              type="file"
              className="hidden"
              accept=".pdf,.txt,.md"
              onChange={handleFileUpload}
            />
            <div className="py-20 md:py-24 border-2 border-dashed border-slate-200 dark:border-white/10 rounded-[3rem] group-hover:border-indigo-500 hover:bg-slate-50/50 dark:hover:bg-white/5 transition-all text-center">
              <UploadCloud size={64} className="text-slate-300 group-hover:text-indigo-600 transition-all mx-auto mb-6" />
              <p className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Select Curriculum</p>
              <p className="text-[9px] font-bold text-slate-400 uppercase mt-2 tracking-[0.2em] opacity-60">PDF, TXT or MD • Max 50MB</p>
            </div>
          </label>
        )}
      </div>
    </div>
  );
}
