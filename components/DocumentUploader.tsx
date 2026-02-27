'use client';

import React, { useState } from 'react';
import {
  BrainCircuit, UploadCloud, AlertCircle,
  Zap, Loader2, RefreshCw, Clock, Check
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// ── Step definitions matching the backend ─────────────────────────────────
const STEPS = [
  { key: 'EXTRACT',   label: 'Extracting document content...',      pct: 30 },
  { key: 'LINEARIZE', label: 'AI is structuring curriculum...',     pct: 65 },
  { key: 'EMBED',     label: 'Building vector search index...',     pct: 90 },
  { key: 'COMPLETE',  label: 'Document ready!',                     pct: 100 },
];

export default function DocumentUploader({ userId, onComplete, onCancel }: any) {
  const [isUploading, setIsUploading]   = useState(false);
  const [progress, setProgress]         = useState(0);
  const [status, setStatus]             = useState('');
  const [currentStep, setCurrentStep]   = useState(0);
  const [error, setError]               = useState<string | null>(null);
  const [isDone, setIsDone]             = useState(false);

  // ── Drive all 3 processing steps sequentially ────────────────────────────
  // This is the KEY fix — old code fired once and never called steps 2 & 3.
  const driveProcessing = async (documentId: string, token: string) => {
    const callRoute = async (body: any = {}) => {
      const res = await fetch(`/api/docs/process/${documentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const rawText = await res.text();
        const match = rawText.match(/Error:\s*(.+?)(?:\n|<|$)/);
        throw new Error(match?.[1] || rawText.substring(0, 200) || `Server error ${res.status}`);
      }

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Server error ${res.status}`);
      return data;
    };

    // ── STEP 1: EXTRACT ──────────────────────────────────────
    setCurrentStep(0);
    setStatus('Extracting document content...');
    setProgress(35);
    const extractData = await callRoute();
    if (extractData.progress) setProgress(extractData.progress);

    // ── STEP 2: LINEARIZE (chunk loop with state machine) ────────
    setCurrentStep(1);
    setStatus('Pakistan Curriculum Engine — extracting SLOs...');
    setProgress(38);

    let chunkIndex = 0;
    let chunkState: any = null; // State machine context passed between chunks

    while (true) {
      const body: any = { chunkIndex };
      if (chunkState) body.state = chunkState; // Pass state machine forward

      const data = await callRoute(body);

      if (data.progress) setProgress(data.progress);

      if (data.totalChunks) {
        setStatus(`[${data.state?.board || 'PKR'}] Chunk ${chunkIndex + 1}/${data.totalChunks} — ${data.slosThisChunk || 0} SLOs`);
      }

      // Carry state to next chunk
      if (data.state) chunkState = data.state;

      if (data.nextStep === 'EMBED' || (data.done && data.step === 'LINEARIZE')) {
        if (data.sloCount) setStatus(`✅ ${data.sloCount} SLOs extracted. Building vectors...`);
        break;
      }

      if (data.nextStep === 'LINEARIZE' && data.chunkIndex !== undefined) {
        chunkIndex = data.chunkIndex;
        await new Promise(r => setTimeout(r, 300));
        continue;
      }

      break;
    }

    // ── STEP 3: EMBED ─────────────────────────────────────────
    setCurrentStep(2);
    setStatus('Building vector search index...');
    setProgress(65);

    const embedData = await callRoute();
    if (embedData.progress) setProgress(embedData.progress);

    if (embedData.done) {
      setProgress(100);
      setCurrentStep(3);
      setStatus(`✅ Complete — ${embedData.chunkCount || 0} vectors indexed`);
      setIsDone(true);
      setTimeout(() => onComplete({ id: documentId, status: 'ready' }), 1500);
      return;
    }

    throw new Error('Processing incomplete after EMBED step.');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setIsUploading(true);
    setIsDone(false);
    setProgress(5);
    setStatus('Connecting to storage...');
    setCurrentStep(-1);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expired. Please sign in again.');

      // ── Step 0: Get presigned upload URL ──────────────────────────────
      setProgress(10);
      setStatus('Preparing upload...');

      const handshakeRes = await fetch('/api/docs/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name:        file.name,
          contentType: file.type || 'application/pdf',
          extractedText: '',
        }),
      });

      if (!handshakeRes.ok) {
        const err = await handshakeRes.json();
        throw new Error(err.error || 'Upload gateway refused connection.');
      }

      const { uploadUrl, documentId } = await handshakeRes.json();

      // ── Step 0b: Upload file directly to R2 ───────────────────────────
      setProgress(20);
      setStatus('Uploading to secure storage...');

      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/pdf' },
      });

      if (!uploadRes.ok) {
        throw new Error(`R2 upload failed (${uploadRes.status}). Check CORS settings in Cloudflare R2.`);
      }

      setProgress(30);
      setStatus('Upload complete. Starting extraction...');

      // ── Steps 1-3: Drive the 3-step processing pipeline ───────────────
      await driveProcessing(documentId, session.access_token);

    } catch (err: any) {
      const msg = err.message || 'Upload failed.';
      console.error('[Uploader] Error:', msg);

      // Clean up JSON error objects if they appear in message
      let cleanMsg = msg;
      try {
        const match = msg.match(/\{.*\}/s);
        if (match) {
          const parsed = JSON.parse(match[0]);
          cleanMsg = parsed.error?.message || parsed.message || msg;
        }
      } catch (_) {}

      setError(cleanMsg);
      setIsUploading(false);
    }
  };

  const reset = () => {
    setError(null);
    setIsUploading(false);
    setIsDone(false);
    setProgress(0);
    setStatus('');
    setCurrentStep(-1);
  };

  const isQuotaError = error?.toLowerCase().includes('quota') ||
                       error?.toLowerCase().includes('429') ||
                       error?.toLowerCase().includes('rate');

  const isCorsError = error?.toLowerCase().includes('cors') ||
                      error?.toLowerCase().includes('r2') ||
                      error?.toLowerCase().includes('failed to fetch');

  return (
    <div className="bg-white dark:bg-[#080808] rounded-[3rem] p-6 md:p-12 w-full max-w-xl shadow-2xl border border-slate-100 dark:border-white/5 relative overflow-hidden text-left">
      <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-600 via-purple-500 to-emerald-500" />

      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="w-14 h-14 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-2xl">
            {isUploading ? <BrainCircuit size={28} className="animate-pulse" /> : <UploadCloud size={28} />}
          </div>
          <div className="px-4 py-1.5 bg-emerald-50 dark:bg-emerald-950/30 rounded-full border border-emerald-100 dark:border-emerald-500/20 flex items-center gap-2">
            <Zap size={12} className="text-emerald-500" />
            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Grid Sync v17.0</span>
          </div>
        </div>

        <div>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Ingest Asset</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Foundational Curriculum Orchestrator</p>
        </div>

        {/* Error state */}
        {error ? (
          <div className="p-8 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-[2rem] space-y-6 animate-in slide-in-from-top-2">
            <div className="flex items-start gap-4 text-rose-600">
              {isQuotaError ? <Clock size={24} className="shrink-0 mt-1" /> : <AlertCircle size={24} className="shrink-0 mt-1" />}
              <div className="space-y-2">
                <p className="text-sm font-black uppercase tracking-tight">
                  {isQuotaError ? 'Grid Saturated — Rate Limited'
                    : isCorsError ? 'R2 Storage Connection Failed'
                    : 'Processing Fault'}
                </p>
                <p className="text-xs font-medium leading-relaxed opacity-90">{error}</p>
                {isCorsError && (
                  <p className="text-[10px] text-rose-500 mt-2">
                    → Check Cloudflare R2 CORS: AllowedOrigins must include https://pedagogy-master.vercel.app
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={reset}
              className={`w-full py-4 ${isQuotaError ? 'bg-indigo-600' : 'bg-rose-600'} text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2`}
            >
              <RefreshCw size={14} />
              {isQuotaError ? 'Wait 60s and Retry' : 'Try Again'}
            </button>
          </div>

        /* Processing state */
        ) : isUploading ? (
          <div className="space-y-6 py-4">
            {/* Progress bar */}
            <div className="h-3 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden shadow-inner">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${isDone ? 'bg-emerald-500' : 'bg-indigo-600'}`}
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Status + percentage */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isDone
                  ? <Check size={16} className="text-emerald-500" />
                  : <Loader2 size={16} className="text-indigo-600 animate-spin" />
                }
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-indigo-600">{status}</p>
              </div>
              <span className="text-[10px] font-black text-slate-400">{Math.round(progress)}%</span>
            </div>

            {/* Step indicators */}
            <div className="space-y-2">
              {STEPS.slice(0, 3).map((step, i) => {
                const done   = currentStep > i || isDone;
                const active = currentStep === i && !isDone;
                return (
                  <div
                    key={step.key}
                    className={`flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest transition-all ${
                      done ? 'text-emerald-500' : active ? 'text-indigo-400' : 'text-white/20'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                      done ? 'bg-emerald-500 border-emerald-500' : active ? 'border-indigo-500' : 'border-white/10'
                    }`}>
                      {done  && <Check size={10} className="text-white" />}
                      {active && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />}
                    </div>
                    Step {i + 1}: {step.key}
                  </div>
                );
              })}
            </div>

            <p className="text-[9px] text-slate-400 font-medium italic">
              {isDone
                ? 'All neural context nodes established successfully.'
                : 'Establishing neural context nodes. Do not close this window.'}
            </p>
          </div>

        /* Upload state */
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
              <p className="text-[9px] font-bold text-slate-400 uppercase mt-2 tracking-[0.2em] opacity-60">
                PDF, TXT, or Markdown — Max 20MB
              </p>
            </div>
          </label>
        )}
      </div>
    </div>
  );
}
