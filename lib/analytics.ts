/**
 * EduNexus / Pedagogy Master Telemetry & Analytics Utility
 * Supports Google Analytics (via NEXT_PUBLIC_GA_ID) and internal event logging.
 */

export interface AnalyticsEvent {
  action: string;
  category: string;
  label?: string;
  value?: number;
  metadata?: Record<string, any>;
}

export const trackEvent = ({ action, category, label, value, metadata }: AnalyticsEvent) => {
  if (typeof window === 'undefined') return;

  // Google Analytics 4 event dispatch
  const win = window as any;
  if (typeof win.gtag === 'function') {
    win.gtag('event', action, {
      event_category: category,
      event_label: label,
      value: value,
      ...metadata,
    });
  }

  // Internal debug trace (development only)
  if (process.env.NODE_ENV === 'development') {
    console.log(`📊 [Analytics] ${category} -> ${action}:`, { label, value, metadata });
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
