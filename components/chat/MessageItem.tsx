'use client';

import React, { useState, useMemo } from 'react';
import {
  User,
  Bot,
  Copy,
  Check,
  Sparkles,
  ExternalLink,
  AlertTriangle,
  BookOpen,
  Search,
  Languages,
  Loader2,
  FileDown,
  Download,
  Lock,
  X,
} from 'lucide-react';
import { renderSTEM } from '../../lib/math-renderer';
import { markdownToHtml } from '../../lib/markdown-renderer';
import { supabase } from '../../lib/supabase';
import {
  ArtifactLanguage,
  exportArtifactAsDocx,
  exportArtifactAsPdf,
} from '../../lib/export/artifact-exporter';

interface MessageItemProps {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  id: string;
  isLatest?: boolean;
  metadata?: any;
  enableTranslateExport?: boolean;
  canExport?: boolean;
  userName?: string;
  onUpgradeClick?: () => void;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  role,
  content,
  timestamp,
  metadata,
  enableTranslateExport = false,
  canExport = false,
  userName,
  onUpgradeClick,
}) => {
  const isAi = role === 'assistant';
  const [copied, setCopied] = useState(false);
  const [selectedLang, setSelectedLang] = useState<ArtifactLanguage>('en');
  const [translatingLang, setTranslatingLang] = useState<'ur' | 'sd' | null>(null);
  const [translations, setTranslations] = useState<Partial<Record<'ur' | 'sd', string>>>({});
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<'docx' | 'pdf' | null>(null);
  const [showUpgradeHint, setShowUpgradeHint] = useState(false);

  const isGlitch = content.includes('Neural Glitch Guard');
  const cleanEnglish = content.split('--- Synthesis Node:')[0].trim();
  const displayedContent =
    selectedLang === 'en'
      ? cleanEnglish
      : translations[selectedLang] || cleanEnglish;
  const isRtl = selectedLang !== 'en' && Boolean(translations[selectedLang]);
  const rtlFontClass =
    isRtl && selectedLang === 'ur'
      ? 'font-urdu artifact-rtl'
      : isRtl && selectedLang === 'sd'
        ? 'font-sindhi artifact-rtl'
        : '';

  const handleSelectLanguage = async (lang: ArtifactLanguage) => {
    if (isTranslating || !cleanEnglish) return;
    setTranslationError(null);

    if (lang === 'en') {
      setSelectedLang('en');
      return;
    }

    if (translations[lang]) {
      setSelectedLang(lang);
      return;
    }

    setIsTranslating(true);
    setTranslatingLang(lang);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        throw new Error('Authentication session required to translate.');
      }

      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          text: cleanEnglish,
          targetLanguage: lang,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data?.translatedText) {
        throw new Error(data?.error || 'Translation failed.');
      }

      setTranslations((prev) => ({
        ...prev,
        [lang]: data.translatedText,
      }));
      setSelectedLang(lang);
    } catch (err: any) {
      setTranslationError(err?.message || 'Unable to translate message.');
    } finally {
      setIsTranslating(false);
      setTranslatingLang(null);
    }
  };

  const handleCopy = async () => {
    const textToCopy = displayedContent || cleanEnglish;
    if (!textToCopy) return;
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        const htmlContent = `<div dir="${isRtl ? 'rtl' : 'ltr'}">${markdownToHtml(textToCopy, isRtl ? 'rtl' : 'ltr')}</div>`;
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': new Blob([textToCopy], { type: 'text/plain' }),
            'text/html': new Blob([htmlContent], { type: 'text/html' }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(textToCopy);
      }
    } catch {
      await navigator.clipboard.writeText(textToCopy);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = async (format: 'docx' | 'pdf') => {
    const targetText = displayedContent || cleanEnglish;
    if (!targetText || isTranslating || isExporting) return;

    if (!canExport) {
      setShowUpgradeHint(true);
      return;
    }

    setIsExporting(format);
    try {
      const payload = {
        markdown: targetText,
        toolName: 'Neural Chat Output',
        userName,
        language: selectedLang,
      };
      if (format === 'docx') {
        await exportArtifactAsDocx(payload);
      } else {
        await exportArtifactAsPdf(payload);
      }
    } catch (err: any) {
      setTranslationError(err?.message || `Failed to export ${format.toUpperCase()}.`);
    } finally {
      setIsExporting(null);
    }
  };

  const renderedHtml = useMemo(() => {
    if (isRtl) {
      return markdownToHtml(displayedContent, 'rtl');
    }
    return renderSTEM(content);
  }, [content, displayedContent, isRtl]);

  return (
    <div className={`w-full animate-chat-turn mb-10 ${isAi ? 'bg-transparent' : ''}`}>
      <div className={`flex flex-col gap-4 mx-auto max-w-full px-4 md:px-8`}>
        {/* Header: Persona Label */}
        <div className={`flex items-center gap-3 flex-wrap ${isAi ? 'flex-row' : 'flex-row-reverse'}`}>
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-xl border-2 transition-all ${
              isAi
                ? isGlitch
                  ? 'bg-rose-600 border-rose-400 text-white'
                  : 'bg-indigo-600 border-indigo-400 text-white'
                : 'bg-indigo-950 border-indigo-700 text-white'
            }`}
          >
            {isAi ? isGlitch ? <AlertTriangle size={16} /> : <Bot size={16} /> : <User size={16} />}
          </div>
          <span
            className={`text-[10px] font-black uppercase tracking-[0.2em] ${
              isGlitch ? 'text-rose-600' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            {isAi ? (isGlitch ? 'System Override' : 'Pedagogy Master') : 'Educator Node'}
          </span>
          {isAi && content && !isGlitch && (
            <button onClick={handleCopy} className="p-1.5 text-slate-400 hover:text-indigo-600 transition-all" title="Copy response">
              {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
            </button>
          )}
        </div>

        {/* Translation & Export Bar (Neural Chat AI outputs) */}
        {isAi && enableTranslateExport && cleanEnglish && !isGlitch && (
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Translate response"
              className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10"
            >
              <span className="px-2 text-slate-400 inline-flex items-center">
                {isTranslating ? <Loader2 size={12} className="animate-spin text-indigo-600" /> : <Languages size={12} />}
              </span>
              {(
                [
                  { id: 'en', label: 'English' },
                  { id: 'ur', label: 'اردو' },
                  { id: 'sd', label: 'سنڌي' },
                ] as const
              ).map((langOpt) => (
                <button
                  key={langOpt.id}
                  type="button"
                  disabled={isTranslating}
                  onClick={() => handleSelectLanguage(langOpt.id)}
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap shrink-0 ${
                    selectedLang === langOpt.id
                      ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {langOpt.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleCopy}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
              {copied ? 'Copied' : 'Copy'}
            </button>

            <button
              type="button"
              disabled={isTranslating || isExporting !== null}
              onClick={() => handleDownload('docx')}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 flex items-center gap-1 whitespace-nowrap shrink-0 disabled:opacity-40"
            >
              {isExporting === 'docx' ? <Loader2 size={12} className="animate-spin" /> : canExport ? <FileDown size={12} /> : <Lock size={11} className="text-amber-500" />}
              DOCX
            </button>

            <button
              type="button"
              disabled={isTranslating || isExporting !== null}
              onClick={() => handleDownload('pdf')}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 flex items-center gap-1 whitespace-nowrap shrink-0 disabled:opacity-40"
            >
              {isExporting === 'pdf' ? <Loader2 size={12} className="animate-spin" /> : canExport ? <Download size={12} /> : <Lock size={11} className="text-amber-500" />}
              PDF
            </button>
            {isTranslating && (
              <span className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                {translatingLang === 'sd' ? 'Verifying Sindhi QA...' : 'Translating...'}
              </span>
            )}
          </div>
        )}

        {(translationError || showUpgradeHint) && (
          <div className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
            {showUpgradeHint ? (
              <>
                <span className="text-slate-700 dark:text-slate-200">
                  Free users can copy &amp; paste translated text. Paid plans unlock DOCX &amp; PDF downloads.
                </span>
                <div className="flex items-center gap-2">
                  {onUpgradeClick && (
                    <button
                      type="button"
                      onClick={onUpgradeClick}
                      className="px-2.5 py-1 bg-indigo-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider"
                    >
                      Upgrade
                    </button>
                  )}
                  <button type="button" onClick={() => setShowUpgradeHint(false)} className="text-slate-400 hover:text-slate-700">
                    <X size={13} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className="text-rose-600 dark:text-rose-400">{translationError}</span>
                <button type="button" onClick={() => setTranslationError(null)} className="text-slate-400 hover:text-slate-700">
                  <X size={13} />
                </button>
              </>
            )}
          </div>
        )}

        {/* Message Bubble */}
        <div className={`w-full ${isAi ? '' : 'flex justify-end'}`}>
          <div
            className={`relative transition-all duration-500 overflow-hidden ${
              isAi
                ? isGlitch
                  ? 'w-full bg-rose-50 dark:bg-rose-950/20 border-2 border-rose-200 dark:border-rose-900/40 p-6 rounded-[2rem]'
                  : 'w-full text-slate-900 dark:text-slate-100'
                : 'bg-indigo-700 text-white px-7 py-5 rounded-[2.5rem] rounded-tr-none shadow-2xl max-w-[95%] md:max-w-[80%] border border-white/10'
            }`}
          >
            {isAi ? (
              <div
                dir={isRtl ? 'rtl' : 'ltr'}
                className={`prose dark:prose-invert max-w-full text-sm md:text-base leading-relaxed md:leading-[1.8] break-words ${rtlFontClass}`}
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
              />
            ) : (
              <div className="text-sm md:text-[16px] font-black leading-relaxed text-white tracking-tight selection:bg-indigo-400">
                {content}
              </div>
            )}

            {isAi && metadata?.sources?.length > 0 && (
              <div className="mt-8 pt-8 border-t border-slate-200 dark:border-white/10">
                <div className="flex items-center gap-2 mb-4">
                  <BookOpen size={14} className="text-indigo-500" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Teacher Reference Pack</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {metadata.sources.map((source: any, i: number) => (
                    <a
                      key={i}
                      href={source.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col p-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl transition-all hover:bg-indigo-600 group"
                    >
                      <span className="text-[10px] font-black text-slate-900 dark:text-white group-hover:text-white line-clamp-1 mb-1 uppercase tracking-tight">
                        {source.title}
                      </span>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Search size={10} className="text-slate-400 group-hover:text-indigo-200" />
                          <span className="text-[8px] font-bold text-slate-400 group-hover:text-indigo-100 truncate max-w-[85%]">
                            {new URL(source.uri).hostname}
                          </span>
                        </div>
                        <ExternalLink size={10} className="text-slate-400 group-hover:text-white" />
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer: Metadata */}
        <div className={`flex items-center gap-3 ${isAi ? 'justify-start' : 'justify-end opacity-70'}`}>
          {isAi && (
            <div
              className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border shadow-sm ${
                isGlitch
                  ? 'text-rose-600 bg-rose-50 border-rose-200'
                  : 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 border-indigo-100 dark:border-indigo-800/50'
              }`}
            >
              <Sparkles size={8} />
              {isGlitch ? 'Sanity Intercept' : metadata?.isGrounded ? 'Standard Anchored' : 'Neural Grid'}
            </div>
          )}
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
            {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </div>
  );
};

