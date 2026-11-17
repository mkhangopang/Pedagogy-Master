/**
 * Pedagogy Master AI Telemetry & Product Analytics Utility
 * Supports Google Analytics (via NEXT_PUBLIC_GA_ID) and non-blocking server event logging.
 */

import { supabase } from './supabase';

export interface AnalyticsEvent {
  action: string;
  category: string;
  label?: string;
  value?: number;
  toolType?: string;
  metadata?: Record<string, any>;
}

export const trackEvent = ({ action, category, label, value, metadata }: AnalyticsEvent) => {
  if (typeof window === 'undefined') return;

  const win = window as any;
  if (typeof win.gtag === 'function') {
    win.gtag('event', action, {
      event_category: category,
      event_label: label,
      value: value,
      ...metadata,
    });
  }
};

export const trackPageView = (url: string) => {
  if (typeof window === 'undefined') return;
  const win = window as any;
  if (typeof win.gtag === 'function' && process.env.NEXT_PUBLIC_GA_ID) {
    win.gtag('config', process.env.NEXT_PUBLIC_GA_ID, {
      page_path: url,
    });
  }
};

/**
 * Fires both GA4 event (if configured) and a silent authenticated backend analytics signal
 * so product usage can be aggregated inside Developer Pilot Analytics without slowing UI.
 */
export const trackProductEvent = async (event: AnalyticsEvent): Promise<void> => {
  trackEvent(event);
  if (typeof window === 'undefined') return;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;

    await fetch('/api/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      keepalive: true,
      body: JSON.stringify({
        kind: 'analytics_event',
        action: event.action,
        category: event.category,
        label: event.label,
        value: event.value,
        toolType: event.toolType,
        metadata: event.metadata,
      }),
    });
  } catch {
    // Analytics must never interrupt educator workflow
  }
};
