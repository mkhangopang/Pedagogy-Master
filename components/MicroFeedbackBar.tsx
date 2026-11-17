'use client';

import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown, Check, Send, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { trackProductEvent } from '../lib/analytics';

interface MicroFeedbackBarProps {
  toolType: string;
  language?: string;
  targetType?: 'artifact' | 'chat';
  preview?: string;
}

const FEEDBACK_TAGS = [
  'SLO Alignment',
  'Urdu / Sindhi',
  'Formatting',
  'Curriculum Fit',
  'Needs More Detail',
];

export const MicroFeedbackBar: React.FC<MicroFeedbackBarProps> = ({
  toolType,
  language = 'en',
  targetType = 'artifact',
  preview = '',
}) => {
  const [rating, setRating] = useState<'up' | 'down' | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const sendFeedback = async (
    nextRating: 'up' | 'down',
    tags: string[],
    note: string
  ) => {
    setIsSubmitting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          kind: 'micro_feedback',
          rating: nextRating,
          tags,
          comment: note,
          language,
          targetType,
          toolType,
          preview: preview.slice(0, 140),
        }),
      });

      if (res.ok) {
        setSubmitted(true);
        trackProductEvent({
          action: 'micro_feedback_submitted',
          category: 'feedback',
          label: `${toolType}:${nextRating}`,
          toolType,
          metadata: { language, targetType, tagCount: tags.length },
        });
      }
    } catch {
      // Fail silently — never disrupt educator flow
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRate = async (choice: 'up' | 'down') => {
    if (isSubmitting) return;
    setRating(choice);
    setSubmitted(false);

    if (choice === 'up') {
      setShowDetails(false);
      await sendFeedback('up', selectedTags, comment);
    } else {
      setShowDetails(true);
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag].slice(0, 5)
    );
  };

  const handleSubmitDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating || isSubmitting) return;
    await sendFeedback(rating, selectedTags, comment);
    setShowDetails(false);
  };

  return (
    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/5 no-print">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Was this output helpful?
          </span>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleRate('up')}
            aria-label="Helpful output"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all whitespace-nowrap shrink-0 ${
              rating === 'up'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-700/50 text-emerald-700 dark:text-emerald-300'
                : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
          >
            <ThumbsUp size={12} />
            Helpful
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleRate('down')}
            aria-label="Output needs improvement"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all whitespace-nowrap shrink-0 ${
              rating === 'down'
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-700/50 text-rose-700 dark:text-rose-300'
                : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
          >
            <ThumbsDown size={12} />
            Needs work
          </button>
        </div>

        {submitted && !showDetails && (
          <div className="flex items-center gap-2 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            <Check size={13} />
            <span>Thanks for the feedback</span>
            {rating === 'up' && (
              <button
                type="button"
                onClick={() => setShowDetails(true)}
                className="text-slate-400 hover:text-indigo-600 underline text-[10px] font-medium ml-1 whitespace-nowrap"
              >
                Add note
              </button>
            )}
          </div>
        )}
      </div>

      {showDetails && (
        <form
          onSubmit={handleSubmitDetails}
          className="mt-3 p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-2.5"
        >
          <div className="flex flex-wrap gap-1.5">
            {FEEDBACK_TAGS.map((tag) => {
              const active = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap shrink-0 border ${
                    active
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-indigo-400'
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={400}
              placeholder="Optional quick note (what should be improved?)"
              className="flex-1 min-w-0 px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              Send
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
