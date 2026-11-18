'use client';

import React from 'react';
import { ShieldCheck, Lock, Eye, FileText, ArrowLeft, Globe, Scale } from 'lucide-react';

interface PolicyProps {
  onBack: () => void;
}

const Policy: React.FC<PolicyProps> = ({ onBack }) => {
  return (
    <div className="max-w-4xl mx-auto py-12 px-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors mb-10"
      >
        <ArrowLeft size={14} /> Back to Pricing
      </button>

      <header className="mb-16">
        <h1 className="text-4xl font-black text-slate-900 dark:text-slate-100 tracking-tight mb-4">Privacy &amp; Trust Protocol</h1>
        <p className="text-slate-600 dark:text-slate-300 text-lg font-medium">Last Updated: October 2024 • Version 1.0</p>
      </header>

      <div className="space-y-12">
        <section className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 rounded-2xl"><ShieldCheck size={24}/></div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 uppercase tracking-tight">Institutional Data Privacy</h2>
          </div>
          <div className="prose pm-prose max-w-none leading-relaxed">
            <p>EduNexus AI (Pedagogy Master) is built with <b>Isolation-First</b> architecture. Your curriculum documents are stored in encrypted Cloudflare R2 buckets and indexed in private vector namespaces.</p>
            <ul className="mt-4 space-y-2">
              <li><b>Zero Training:</b> We do NOT use your curriculum data to train global AI models (Gemini, Llama, etc).</li>
              <li><b>Ownership:</b> You retain 100% intellectual property rights over all uploaded assets and generated artifacts.</li>
              <li><b>Retention:</b> Deleting a document removes all associated vector chunks permanently from our grid.</li>
            </ul>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="p-8 bg-slate-50 dark:bg-slate-900/80 rounded-[2.5rem] border border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-900 dark:text-slate-100"><Lock size={18} className="text-emerald-600 dark:text-emerald-400"/> Security Nodes</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">All connections are secured via TLS 1.3. Authentication is managed via Supabase Auth with Row Level Security (RLS) enforcement on every database query.</p>
          </div>
          <div className="p-8 bg-slate-50 dark:bg-slate-900/80 rounded-[2.5rem] border border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-900 dark:text-slate-100"><Eye size={18} className="text-amber-600 dark:text-amber-400"/> Transparency</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">We use cookies only for session persistence. No third-party trackers or advertising scripts are permitted within the pedagogical workspace.</p>
          </div>
        </section>

        <section className="p-8 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-4 mb-6">
            <Scale size={20} className="text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 uppercase tracking-tight">Terms of Synthesis</h2>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4">By using Pedagogy Master, you agree that AI-generated content should be reviewed by a qualified educator before classroom implementation. While our RAG engine maximizes accuracy, the final instructional responsibility lies with the user.</p>
          <div className="flex items-center gap-4 pt-4">
             <div className="text-[10px] font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-widest border border-indigo-200 dark:border-indigo-800/60 px-3 py-1 rounded-full">Compliance Active</div>
             <div className="text-[10px] font-black text-emerald-700 dark:text-emerald-300 uppercase tracking-widest border border-emerald-200 dark:border-emerald-800/60 px-3 py-1 rounded-full">GDPR Ready</div>
          </div>
        </section>
      </div>
      
      <div className="mt-20 text-center text-slate-600 dark:text-slate-400 text-xs font-bold uppercase tracking-[0.2em]">
        Powered by EduNexus Secure Infrastructure Grid
      </div>
    </div>
  );
};

export default Policy;