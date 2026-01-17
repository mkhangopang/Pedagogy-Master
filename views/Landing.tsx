
'use client';

import React from 'react';
import { 
  ArrowRight, BrainCircuit, ShieldCheck, 
  Zap, FileText, Globe, GraduationCap, 
  CheckCircle2, Target, BarChart3, Users
} from 'lucide-react';
import { APP_NAME } from '../constants';

interface LandingProps {
  onStart: () => void;
}

const Landing: React.FC<LandingProps> = ({ onStart }) => {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0a0a0a] overflow-x-hidden selection:bg-indigo-500 selection:text-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-[100] bg-white/80 dark:bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-slate-200 dark:border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-600/20">
              <GraduationCap size={24} />
            </div>
            <span className="text-xl font-black text-slate-900 dark:text-white tracking-tight">{APP_NAME}</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors">Features</a>
            <a href="#impact" className="text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors">Impact</a>
            <button 
              onClick={onStart}
              className="px-6 py-2.5 bg-slate-900 dark:bg-indigo-600 text-white rounded-xl font-bold text-sm hover:scale-105 transition-all active:scale-95 shadow-lg shadow-indigo-600/20"
            >
              Sign In
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-40 pb-20 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
          <div className="space-y-8 animate-in slide-in-from-left duration-700">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-500/20 rounded-full">
              <SparkleIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Next-Gen Pedagogical Engine</span>
            </div>
            <h1 className="text-6xl lg:text-7xl font-black text-slate-900 dark:text-white tracking-tighter leading-[0.9]">
              Synthesize <span className="text-indigo-600">Intelligence</span> into every Lesson.
            </h1>
            <p className="text-xl text-slate-500 dark:text-slate-400 leading-relaxed font-medium max-w-xl">
              Upload your curriculum documents and let our Neural AI ground your instructional design in verified standards. 
              The ultimate workspace for the modern educator.
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <button 
                onClick={onStart}
                className="w-full sm:w-auto px-10 py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black text-lg shadow-2xl shadow-indigo-600/30 hover:bg-indigo-700 transition-all flex items-center justify-center gap-3 group"
              >
                Launch Workspace
                <ArrowRight className="group-hover:translate-x-1 transition-transform" />
              </button>
              <div className="flex -space-x-3">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="w-10 h-10 rounded-full border-4 border-slate-50 dark:border-[#0a0a0a] bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold">EDU</div>
                ))}
                <div className="pl-6 text-sm font-bold text-slate-400">+500 educators</div>
              </div>
            </div>
          </div>

          <div className="relative animate-in zoom-in duration-1000">
            <div className="absolute inset-0 bg-indigo-600 rounded-[3rem] blur-[100px] opacity-10 animate-pulse" />
            <div className="relative bg-white dark:bg-[#1a1a1a] p-8 rounded-[3rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.15)] border border-slate-200 dark:border-white/5">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-3 h-3 rounded-full bg-rose-500" />
                <div className="w-3 h-3 rounded-full bg-amber-500" />
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <div className="ml-auto px-4 py-1.5 bg-slate-50 dark:bg-slate-900 rounded-full text-[10px] font-bold text-slate-400 uppercase tracking-widest">Neural Link Active</div>
              </div>
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="w-10 h-10 bg-indigo-600 rounded-xl shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-slate-100 dark:bg-white/5 rounded-lg w-3/4" />
                    <div className="h-4 bg-slate-100 dark:bg-white/5 rounded-lg w-1/2" />
                  </div>
                </div>
                <div className="p-6 bg-slate-50 dark:bg-white/5 rounded-3xl border border-slate-100 dark:border-white/5 space-y-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 size={16} className="text-emerald-500" />
                    <div className="h-2 bg-emerald-500/20 rounded-full w-1/2" />
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 size={16} className="text-emerald-500" />
                    <div className="h-2 bg-emerald-500/20 rounded-full w-2/3" />
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 size={16} className="text-emerald-500" />
                    <div className="h-2 bg-emerald-500/20 rounded-full w-1/3" />
                  </div>
                </div>
                <div className="flex justify-end">
                   <div className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold text-xs shadow-xl shadow-indigo-600/20">Synthesize Lesson Plan</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20 px-6 bg-white dark:bg-[#0d0d0d]">
        <div className="max-w-7xl mx-auto space-y-20">
          <div className="text-center space-y-4">
            <h2 className="text-4xl lg:text-5xl font-black text-slate-900 dark:text-white tracking-tight">Built for Institutional Excellence</h2>
            <p className="text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto font-medium">EduNexus AI combines high-fidelity RAG with world-class pedagogical models to deliver unmatched instructional precision.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureCard 
              icon={<ShieldCheck className="text-emerald-500" />}
              title="Strict Grounding"
              description="Our AI doesn't hallucinate. It anchors every response in your uploaded curriculum standards and SLOs."
            />
            <FeatureCard 
              icon={<BrainCircuit className="text-indigo-500" />}
              title="Adaptive Learning"
              description="The neural brain learns your teaching style and success patterns to generate increasingly relevant content."
            />
            <FeatureCard 
              icon={<Target className="text-amber-500" />}
              title="SLO Tracking"
              description="Monitor curriculum coverage in real-time. Link every lesson to specific departmental outcomes."
            />
            <FeatureCard 
              icon={<Zap className="text-purple-500" />}
              title="Flash Synthesis"
              description="Generate full lesson plans, rubrics, and assessments in seconds, not hours."
            />
            <FeatureCard 
              icon={<FileText className="text-rose-500" />}
              title="Multimodal Ingestion"
              description="Upload PDFs, Docs, or Markdown. Our engine audits and standardizes all content for indexing."
            />
            <FeatureCard 
              icon={<Globe className="text-cyan-500" />}
              title="Universal Standards"
              description="Compatible with Sindh Board, Cambridge, IB, and Federal frameworks out of the box."
            />
          </div>
        </div>
      </section>

      {/* Impact Section */}
      <section id="impact" className="py-20 px-6">
        <div className="max-w-7xl mx-auto bg-indigo-600 rounded-[4rem] p-12 lg:p-20 text-white relative overflow-hidden shadow-2xl shadow-indigo-600/30">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white opacity-10 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
            <div className="space-y-8">
              <h2 className="text-5xl font-black tracking-tight leading-[1]">Empower your Department to lead.</h2>
              <p className="text-xl text-indigo-100 font-medium">
                Standardize pedagogical quality across your entire institution. 
                Reduce burnout by automating the heavy lifting of curriculum alignment.
              </p>
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <div className="text-4xl font-black">75%</div>
                  <div className="text-sm font-bold uppercase tracking-widest opacity-60">Time Saved</div>
                </div>
                <div>
                  <div className="text-4xl font-black">100%</div>
                  <div className="text-sm font-bold uppercase tracking-widest opacity-60">Alignment</div>
                </div>
              </div>
            </div>
            <div className="flex justify-center">
              <button 
                onClick={onStart}
                className="px-12 py-6 bg-white text-indigo-950 rounded-[2rem] font-black text-xl shadow-2xl hover:scale-105 transition-all active:scale-95"
              >
                Join the Network
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer className="py-20 px-6 border-t border-slate-200 dark:border-white/5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-10">
          <div className="flex items-center gap-3">
            <GraduationCap size={24} className="text-indigo-600" />
            <span className="text-xl font-black text-slate-900 dark:text-white tracking-tight">{APP_NAME}</span>
          </div>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">© 2024 EduNexus AI. All nodes operational.</p>
        </div>
      </footer>
    </div>
  );
};

const FeatureCard = ({ icon, title, description }: any) => (
  <div className="p-10 bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/5 rounded-[2.5rem] shadow-sm hover:shadow-2xl transition-all group">
    <div className="w-14 h-14 bg-slate-50 dark:bg-white/5 rounded-2xl flex items-center justify-center mb-8 group-hover:scale-110 transition-transform">
      {React.cloneElement(icon, { size: 28 })}
    </div>
    <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-4 tracking-tight">{title}</h3>
    <p className="text-slate-500 dark:text-slate-400 leading-relaxed font-medium">{description}</p>
  </div>
);

const SparkleIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-7.714 2.143L11 21l-2.286-6.857L1 12l7.714-2.143L11 3z" />
  </svg>
);

export default Landing;
