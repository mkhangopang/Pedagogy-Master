'use client';

import React, { useState, useEffect } from 'react';
import { X, FileText, CheckCircle2, AlertCircle, Loader2, FileCode, ArrowRight, ShieldCheck, Database, BrainCircuit, Sparkles, ArrowLeft, AlertTriangle, Lock } from 'lucide-react';
import { validateCurriculumMarkdown } from '../lib/curriculum/validator';
import { marked } from 'marked';
import { SubscriptionPlan } from '../types';
import { ROLE_LIMITS } from '../constants';
import { supabase } from '../lib/supabase';
import { GoogleGenAI } from '@google/genai';

import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  const version = '4.4.168';
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
}

interface DocumentUploaderProps {
  userId: string;
  userPlan: SubscriptionPlan;
  docCount: number;
  onComplete: (doc: any) => void;
  onCancel: () => void;
}

export default function DocumentUploader({ userId, userPlan, docCount, onComplete, onCancel }: DocumentUploaderProps) {
  const [mode, setMode] = useState<'selection' | 'transition'>('selection');
  const [isProcessing, setIsProcessing] = useState(false);
  const [procStage, setProcStage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [draftMarkdown, setDraftMarkdown] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');

  const limits = ROLE_LIMITS[userPlan] || ROLE_LIMITS[SubscriptionPlan.FREE];

  useEffect(() => {
    if (draftMarkdown) {
      try {
        setPreviewHtml(marked.parse(draftMarkdown) as string);
      } catch (e) { console.error(e); }
    }
  }, [draftMarkdown]);

  const extractRawTextAndPageCount = async (file: File, type: 'pdf' | 'docx'): Promise<{ text: string, pages: number }> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      let pageCount = 0;
      let fullText = '';
      
      if (type === 'pdf') {
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
        const pdf = await loadingTask.promise;
        pageCount = pdf.numPages;

        let allowedPages = 0;
        if (userPlan === SubscriptionPlan.ENTERPRISE) {
          const entLimits = limits as { maxPagesSME_1: number; maxPagesSME_2: number };
          allowedPages = docCount < 100 ? entLimits.maxPagesSME_1 : entLimits.maxPagesSME_2;
        } else {
          allowedPages = (limits as { maxPages: number }).maxPages;
        }

        if (pageCount > allowedPages) {
          throw new Error(`TIER EXCEEDED: Your ${userPlan} node allows max ${allowedPages} pages. This file has ${pageCount} pages.`);
        }
        
        for (let i = 1; i <= pdf.numPages; i++) {
          setProcStage(`Extracting Intelligence: Page ${i} of ${pdf.numPages}...`);
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
        }
      } else {
        const result = await mammoth.extractRawText({ arrayBuffer });
        fullText = result.value;
        pageCount = Math.ceil(fullText.split(/\s+/).length / 500);
        
        let allowedPages = 0;
        if (userPlan === SubscriptionPlan.ENTERPRISE) {
          const entLimits = limits as { maxPagesSME_1: number; maxPagesSME_2: number };
          allowedPages = docCount < 100 ? entLimits.maxPagesSME_1 : entLimits.maxPagesSME_2;
        } else {
          allowedPages = (limits as { maxPages: number }).maxPages;
        }

        if (pageCount > allowedPages) {
          throw new Error(`WORD COUNT LIMIT: Estimated ${pageCount} pages exceeds your ${userPlan} limit of ${allowedPages}.`);
        }
      }
      
      return { text: fullText, pages: pageCount };
    } catch (e: any) {
      throw e;
    }
  };

  const synthesizeMasterMarkdown = async (rawText: string, fileName: string) => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Convert this raw curriculum text into high-fidelity markdown with sections for Metadata, Units, and SLOs. FILE: ${fileName}\n\nTEXT: ${rawText.substring(0, 150000)}`;
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });
      return response.text || "";
    } catch (e: any) {
      throw new Error(`AI Mapping Failed: ${e.message}`);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'md' | 'pdf' | 'docx') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setIsProcessing(true);
    setProcStage(`Analyzing Metadata...`);

    try {
      if (type === 'md') {
        const text = await file.text();
        const pages = Math.ceil(text.split(/\s+/).length / 500);
        
        let allowedPages = 0;
        if (userPlan === SubscriptionPlan.ENTERPRISE) {
          const entLimits = limits as { maxPagesSME_1: number; maxPagesSME_2: number };
          allowedPages = docCount < 100 ? entLimits.maxPagesSME_1 : entLimits.maxPagesSME_2;
        } else {
          allowedPages = (limits as { maxPages: number }).maxPages;
        }

        if (pages > allowedPages) throw new Error(`Markdown length exceeds ${allowedPages} page equivalent.`);

        setDraftMarkdown(text);
        setMode('transition');
      } else {
        setMode('transition');
        const { text, pages } = await extractRawTextAndPageCount(file, type);
        setProcStage('Neural Ingestion: Standardizing curriculum grid...');
        const masterMd = await synthesizeMasterMarkdown(text, file.name);
        setDraftMarkdown(masterMd);
      }
    } catch (err: any) {
      setError(err.message);
      setMode('selection');
    } finally {
      setIsProcessing(false);
      setProcStage('');
    }
  };

  const handleFinalApproval = async () => {
    setIsProcessing(true);
    setProcStage('Committing to Cloud Vault...');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const v = validateCurriculumMarkdown(draftMarkdown);
      const response = await fetch('/api/docs/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ name: "Curriculum_Asset_" + Date.now(), sourceType: 'markdown', extractedText: draftMarkdown, ...v.metadata })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      onComplete(result);
    } catch (err: any) {
      setError