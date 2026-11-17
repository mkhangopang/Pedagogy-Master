'use client';

import React, { useState } from 'react';
import { MessageSquarePlus, X, Send, CheckCircle2, Loader2, Star } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { trackProductEvent } from '../lib/analytics';

interface PilotFeedbackDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentView: string;
}

const CATEGORIES = [
  'Feature Request',
  'Urdu / Sindhi Translation',
  'Lesson Quality',
  'Bug / Speed Issue',
  'Paid Plan Feedback',
];

export const PilotFeedbackDrawer: React.FC<PilotFeedbackDrawerProps> = ({
  isOpen,
  onClose,
  currentView,
}) => {
  const [category, setCategory] = useState('Feature Request');
  const [rating, setRating] = useState<number>(5);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      setError('Please add a brief comment so we know how to improve.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError('Please sign in again to submit feedback.');
        return;
      }

      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          kind: 'pilot_feedback',
          category,
          rating,
          message: message.trim(),
          view: currentView,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || 'Could not submit feedback right now.');
        return;
      }

      trackProductEvent({
        action: 'pilot_feedback_submitted',
        category: 'feedback',
        label: category,
        value: rating,
        toolType: currentView,
      });

      setSent(true);
      setMessage('');
      setTimeout(() => {
        setSent(false);
        onClose();
      }, 1500);
    } catch {
      setError('Network error while sending feedback.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl p-6 md:p-8 border border-slate-200 dark:border-white/10 shadow-2xl space-y-5 text-left">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <MessageSquarePlus size={18} />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight">
                Share Educator Feedback
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Help shape the free public release &amp; upcoming tools
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close feedback dialog"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <X size={18} />
          </button>
        </div>

        {sent ? (
          <div className="py-10 text-center space-y-3">
            <CheckCircle2 size={36} className="text-emerald-500 mx-auto" />
            <p className="font-bold text-slate-900 dark:text-white">
              Feedback received — thank you!
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Every educator note directly guides our next improvements.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Topic
              </label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap border ${
                      category === cat
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Experience Rating
              </label>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className={`p-2 rounded-xl border transition-all ${
                      rating >= star
                        ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-700/40 text-amber-500'
                        : 'border-slate-200 dark:border-white/10 text-slate-300 dark:text-slate-600'
                    }`}
                    aria-label={`Rate ${star} out of 5`}
                  >
                    <Star size={16} fill={rating >= star ? 'currentColor' : 'none'} />
                  </button>
                ))}
                <span className="ml-2 text-xs font-bold text-slate-500 dark:text-slate-400 tabular-nums">
                  {rating}/5
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Your Note
              </label>
              <textarea
                rows={4}
                maxLength={1000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What worked well? What curriculum feature or language fix would help your classroom most?"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/10 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>

            {error && (
              <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              Submit Feedback
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
