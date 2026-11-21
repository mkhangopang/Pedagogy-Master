'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ShieldCheck,
  RefreshCw,
  ArrowRight,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { BlinkingRobot } from './BlinkingRobot';

export interface VerifiedGuestSession {
  guestToken: string;
  guestId: string;
  expiresAt: number;
  limit: number;
  used: number;
}

interface GuestCaptchaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerified: (session: VerifiedGuestSession) => void;
  onSwitchToSignup: () => void;
}

export const GuestCaptchaModal: React.FC<GuestCaptchaModalProps> = ({
  isOpen,
  onClose,
  onVerified,
  onSwitchToSignup,
}) => {
  const [challengeToken, setChallengeToken] = useState<string>('');
  const [imageDataUrl, setImageDataUrl] = useState<string>('');
  const [answer, setAnswer] = useState<string>('');
  const [honeypot, setHoneypot] = useState<string>('');
  const [isLoadingChallenge, setIsLoadingChallenge] = useState<boolean>(false);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadChallenge = useCallback(async () => {
    setIsLoadingChallenge(true);
    setError(null);
    setAnswer('');
    try {
      const res = await fetch('/api/auth/guest-captcha', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.challengeToken || !data?.imageDataUrl) {
        setError(data?.error || 'Could not load human verification challenge.');
        return;
      }
      setChallengeToken(data.challengeToken);
      setImageDataUrl(data.imageDataUrl);
      setTimeout(() => inputRef.current?.focus(), 60);
    } catch {
      setError('Connection interrupted while loading verification challenge.');
    } finally {
      setIsLoadingChallenge(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadChallenge();
    }
  }, [isOpen, loadChallenge]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (honeypot) return;
    if (!answer.trim()) {
      setError('Please enter the number answer shown above.');
      return;
    }

    setIsVerifying(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/guest-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeToken,
          answer: answer.trim(),
          hp: honeypot,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.guestToken) {
        setError(data?.error || 'Incorrect verification answer. Please try again.');
        // Refresh challenge if token expired or replay detected
        if (
          typeof data?.error === 'string' &&
          (data.error.toLowerCase().includes('expired') ||
            data.error.toLowerCase().includes('already used'))
        ) {
          await loadChallenge();
        }
        return;
      }

      onVerified({
        guestToken: data.guestToken,
        guestId: data.guestId,
        expiresAt: data.expiresAt,
        limit: data?.quota?.limit ?? 5,
        used: data?.quota?.used ?? 0,
      });
    } catch {
      setError('Unable to verify right now. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[700] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guest-captcha-title"
    >
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl p-6 md:p-8 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5 text-left">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <BlinkingRobot size="sm" />
            <div>
              <h2
                id="guest-captcha-title"
                className="text-lg font-extrabold text-slate-900 dark:text-slate-100 tracking-tight"
              >
                Human Security Check
              </h2>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Quick check to keep Guest Preview fast for real educators
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
            aria-label="Close Guest Verification"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scope disclosure */}
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
          <div className="flex items-start gap-2 text-slate-800 dark:text-slate-200 font-semibold">
            <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <span>
              Included: 5 AI tool runs &amp; Neural Chat turns + Standards Browser
            </span>
          </div>
          <div className="flex items-start gap-2 text-slate-600 dark:text-slate-300">
            <Lock size={14} className="text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" />
            <span>
              Free Account unlocks 25 runs/day, PDF Vault uploads &amp; Urdu/Sindhi exports
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Honeypot */}
          <div className="hidden" aria-hidden="true">
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="guest-captcha-answer"
                className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200"
              >
                Solve to Enter Guest Mode
              </label>
              <button
                type="button"
                onClick={loadChallenge}
                disabled={isLoadingChallenge || isVerifying}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-300 hover:underline disabled:opacity-50 whitespace-nowrap"
              >
                <RefreshCw size={13} className={isLoadingChallenge ? 'animate-spin' : ''} />
                New Puzzle
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-16 rounded-2xl border border-slate-300 dark:border-slate-700 bg-indigo-50/70 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                {isLoadingChallenge || !imageDataUrl ? (
                  <Loader2 size={20} className="animate-spin text-indigo-600 dark:text-indigo-400" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageDataUrl}
                    alt="Simple arithmetic CAPTCHA verification challenge"
                    className="h-14 w-auto select-none pointer-events-none"
                  />
                )}
              </div>

              <input
                ref={inputRef}
                id="guest-captcha-answer"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Answer"
                value={answer}
                onChange={(e) => setAnswer(e.target.value.replace(/[^\d-]/g, '').slice(0, 4))}
                disabled={isLoadingChallenge || isVerifying}
                className="w-24 h-16 text-center text-xl font-extrabold rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none tabular-nums"
                required
              />
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-start gap-2">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoadingChallenge || isVerifying || !challengeToken}
            className="w-full py-3.5 px-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            {isVerifying ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <>
                <ShieldCheck size={18} />
                <span>Verify &amp; Enter Preview</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 text-center">
          <button
            type="button"
            onClick={() => {
              onClose();
              onSwitchToSignup();
            }}
            className="text-xs font-bold text-indigo-700 dark:text-indigo-300 hover:underline"
          >
            Want unlimited Vault &amp; 25 daily runs? Create Free Account
          </button>
        </div>
      </div>
    </div>
  );
};
