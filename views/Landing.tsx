
'use client';

import React, { useEffect, useState } from 'react';
import { 
  ArrowRight, BrainCircuit, ShieldCheck, 
  Zap, FileText, Globe, GraduationCap, 
  CheckCircle2, Target, Cpu, Lock, Sparkles, 
  Database, ArrowUpRight, MessageSquare, Layers,
  ChevronDown, MousePointer2, Activity, Play,
  BookOpen, ClipboardCheck
} from 'lucide-react';
import { APP_NAME } from '../constants';

interface LandingProps {
  onStart: () => void;
}

/**
 * Modern Scroll Reveal Hook
 * Animates nodes as they enter the viewport
 */
const useScrollReveal = () => {
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setRevealed((prev) => new Set([...Array.from(prev), entry.target.id]));
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -100px 0px' }
    );

    document.querySelectorAll('.reveal-node').forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return (id: string) => revealed.has(id) 
    ? 'opacity-100 translate-y-0 scale-100' 
    : 'opacity-0 translate-y-16 scale-[0.97]';
};

const Landing: React.FC<LandingProps> = ({ onStart }) => {
  const reveal = useScrollReveal();

  return (
    <div className="min-h-screen bg-white dark:bg-[#030303] overflow-x-hidden selection:bg-indigo-600 selection:text-white font-sans scroll-smooth">
      {/* Background Aurora Nodes */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] bg-indigo-500/5 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[30%] h-[30%] bg-emerald-500/5 rounded-full blur-[120px]" />
        <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]" 
             style={{ backgroundImage: 'radial-gradient(#4f46e5 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-[150] bg-white/80 dark:bg-[#030303]/80 backdrop-blur-2xl border-b border-slate-200/50 dark:border-white/5 px-4 md:px-8">
        <div className="max-w-7xl mx-auto h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer group">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg group-hover:rotate-12 transition-all">
              <GraduationCap size={24} />
            </div>
            <span className="text-xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">{APP_NAME}</span>
          </div>

          <div className="hidden lg:flex items-center gap-10">
            {['Vault', 'Synthesis', 'Audit'].map((item) => (
              <a key={item} href={`#${item.toLowerCase()}`} className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-indigo-600 transition-colors">
                {item}
              </a>
            ))}
            <button 
              onClick={onStart}
              className="px-8 py-3 bg-slate-900 dark:bg-white text-white dark:text-black rounded-full font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all"
            >
              Get Started
            </button>
          </div>
          
          <button onClick={onStart} className="lg:hidden p-2 text-slate-900 dark:text-white">
            <MousePointer2 size={24} />
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center pt-24 px-4 md:px-8">
        <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <div className="space-y-8 md:space-y-12 z-10 text-center lg:text-left">
            <div className={`reveal-node inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-500/20 rounded-full transition-all duration-1000 ${reveal('h-badge')}`} id="h-badge">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400">Deterministic Curriculum AI</span>
            </div>

            <h1 className={`reveal-node text-5xl md:text-7xl lg:text-[8rem] font-black text-slate-900 dark:text-white tracking-tighter leading-[0.85] transition-all duration-1000 delay-100 ${reveal('h-title')}`} id="h-title">
              Precision <br /> 
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-purple-500 to-indigo-600 animate-gradient-x">Pedagogy.</span>
            </h1>

            <p className={`reveal-node text-lg md:text-xl text-slate-500 dark:text-slate-400 leading-relaxed font-medium max-w-2xl mx-auto lg:mx-0 transition-all duration-1000 delay-200 ${reveal('h-desc')}`} id="h-desc">
              Ground your instructional design in verified standards. Sync your curriculum PDFs, generate 5E lesson plans, and track student mastery with zero AI hallucination.
            </p>

            <div className={`reveal-node flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-6 transition-all duration-1000 delay-300 ${reveal('h-cta')}`} id="h-cta">
              <button 
                onClick={onStart}
                className="w-full sm:w-auto px-12 py-6 bg-indigo-600 text-white rounded-[2rem] font-black text-lg shadow-2xl shadow-indigo-600/30 hover:bg-indigo-700 hover:-translate-y-1 transition-all flex items-center justify-center gap-4 group"
              >
                Launch Workspace
                <ArrowRight className="group-hover:translate-x-1.5 transition-transform" />
              </button>
              <div className="flex items-center gap-4 px-6 py-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl">
                 <ShieldCheck className="text-emerald-500" size={20} />
                 <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Verified RAG Infrastructure</span>
              </div>
            </div>
          </div>

          {/* Interactive Feature Visual */}
          <div className={`reveal-node relative transition-all duration-1000 delay-500 ${reveal('h-vis')}`} id="h-vis">
             <div className="absolute inset-0 bg-indigo-600/10 blur-[80px] rounded-full animate-pulse" />
             <div className="relative bg-white dark:bg-[#0a0a0a] p-1.5 rounded-[3.5rem] border border-slate-200 dark:border-white/5 shadow-2xl overflow-hidden group">
                <div className="bg-slate-50 dark:bg-[#111] p-6 md:p-10 rounded-[3rem] space-y-8">
                   <div className="flex items-center justify-between">
                      <div className="flex gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-rose-500/30" />
                        <div className="w-2.5 h-2.5 rounded-full bg-amber-500/30" />
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/30" />
                      </div>
                      <div className="px-3 py-1 bg-emerald-50 dark:bg-emerald-900/20 rounded-full text-[9px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1.5">
                        <Activity size={10} className="animate-pulse" /> Neural Sync Active
                      </div>
                   </div>

                   <div className="space-y-6">
                      <div className="flex gap-5">
                        <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl animate-spin-slow"><BrainCircuit size={24}/></div>
                        <div className="flex-1 space-y-2.5">
                           <div className="h-3.5 bg-slate-200 dark:bg-white/10 rounded-full w-full" />
                           <div className="h-3.5 bg-slate-200 dark:bg-white/10 rounded-full w-3/4" />
                        </div>
                      </div>

                      <div className="p-6 bg-white dark:bg-white/5 rounded-[2rem] border border-slate-100 dark:border-white/5 space-y-4 shadow-inner">
                         {[1,2,3].map(i => (
                           <div key={i} className="flex items-center gap-3">
                              <div className="p-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-full"><CheckCircle2 size={12}/></div>
                              <div className="h-2 bg-slate-100 dark:bg-white/5 rounded-full flex-1" />
                           </div>
                         ))}
                      </div>

                      <div className="flex items-center justify-between pt-2">
                         <div className="space-y-0.5">
                            <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest">Alignment Confidence</span>
                            <span className="block text-sm font-black text-indigo-600">99.8% Deterministic</span>
                         </div>
                         <button onClick={onStart} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:scale-105 transition-all">
                           Synthesize
                         </button>
                      </div>
                   </div>
                </div>
             </div>
          </div>
        </div>
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 animate-bounce opacity-40">
           <ChevronDown size={24} className="text-slate-400" />
        </div>
      </section>

      {/* Feature Bento Grid */}
      <section id="vault" className="py-32 px-4 md:px-8">
        <div className="max-w-7xl mx-auto space-y-20">
           <div className={`reveal-node text-center space-y-4 transition-all duration-1000 ${reveal('b-header')}`} id="b-header">
              <h2 className="text-4xl md:text-6xl font-black text-slate-900 dark:text-white tracking-tighter">Real Infrastructure.</h2>
              <p className="text-base md:text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto font-medium">
                The multi-provider AI grid designed for high-stakes institutional pedagogy.
              </p>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8">
              <BentoNode 
                id="bn1"
                span="md:col-span-4"
                icon={<Database className="text-indigo-500" />}
                title="Permanent Vault"
                desc="Upload PDFs once. They become a permanent context node for all future lesson synthesis."
                reveal={reveal}
              />
              <BentoNode 
                id="bn2"
                span="md:col-span-8"
                icon={<Zap className="text-emerald-500" />}
                title="Synthesis Engine"
                desc="Generate 5E Lesson Plans, Rubrics, and Assessments in under 30 seconds. Fully aligned with Bloom's Taxonomy."
                reveal={reveal}
                accent="bg-emerald-500/5"
              />
              <BentoNode 
                id="bn3"
                span="md:col-span-7"
                icon={<Target className="text-amber-500" />}
                title="SLO Tracker"
                desc="Audit coverage across Student Learning Objectives. Mark mastery and visualize curriculum progress in real-time."
                reveal={reveal}
                accent="bg-amber-500/5"
              />
              <BentoNode 
                id="bn4"
                span="md:col-span-5"
                icon={<Cpu className="text-purple-500" />}
                title="Multi-LLM Grid"
                desc="Switch between Gemini 3 Pro and Groq for optimized pedagogical reasoning and instant performance."
                reveal={reveal}
              />
           </div>
        </div>
      </section>

      {/* Synthesis Showcase */}
      <section id="synthesis" className="py-32 px-4 md:px-8 bg-slate-50 dark:bg-[#080808] relative overflow-hidden">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 md:gap-24 items-center">
           <div className={`reveal-node space-y-10 transition-all duration-1000 ${reveal('net-content')}`} id="net-content">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 dark:bg-indigo-900/20 rounded-full text-[10px] font-black text-indigo-600 uppercase tracking-widest">Synthesis Hub</div>
              <h2 className="text-5xl md:text-6xl font-black tracking-tighter text-slate-900 dark:text-white leading-[1]">Your Neural Teaching Assistant.</h2>
              <p className="text-lg text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                Stop starting from zero. Ground your designs in official Sindh Board, KSA Vision 2030, or Cambridge IGCSE standards.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-8">
                 <FeaturePoint text="PDF to Markdown Mapping" />
                 <FeaturePoint text="Bloom-Scaled Assessments" />
                 <FeaturePoint text="Neural Visual Aid Synthesis" />
                 <FeaturePoint text="Differentiated Learning Tiers" />
              </div>
              
              <button onClick={onStart} className="flex items-center gap-4 text-indigo-600 font-black uppercase tracking-[0.2em] text-[11px] group transition-all">
                 Explore Synthesis Node <ArrowUpRight className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
              </button>
           </div>

           <div className={`reveal-node grid grid-cols-1 sm:grid-cols-2 gap-6 transition-all duration-1000 delay-300 ${reveal('net-visual')}`} id="net-visual">
              <AppCard label="Neural Vault" icon={<FileText size={20}/>} desc="High-fidelity storage" />
              <AppCard label="5E Planner" icon={<BookOpen size={20}/>} desc="Pedagogical flow" />
              <AppCard label="Audit Engine" icon={<ClipboardCheck size={20}/>} desc="Standards validation" />
              <AppCard label="Vision Node" icon={<Cpu size={20}/>} desc="Diagram synthesis" />
           </div>
        </div>
      </section>

      {/* Call to Action */}
      <section id="enterprise" className="py-32 px-4 md:px-8">
        <div className={`reveal-node max-w-7xl mx-auto bg-indigo-600 rounded-[3rem] md:rounded-[5rem] p-10 md:p-24 text-white relative overflow-hidden shadow-2xl transition-all duration-1000 ${reveal('e-cta')}`} id="e-cta">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-white opacity-[0.08] rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2" />
          
          <div className="relative z-10 flex flex-col lg:flex-row items-center gap-16 md:gap-24">
            <div className="flex-1 space-y-8 text-center lg:text-left">
               <h2 className="text-5xl md:text-7xl font-black tracking-tighter leading-[0.9]">Elevate Your <br />Instruction.</h2>
               <p className="text-xl md:text-2xl text-indigo-100 font-medium leading-relaxed opacity-90 max-w-xl mx-auto lg:mx-0">
                 Join educators standardizing quality across classrooms. Reduce planning time by 70% with high-fidelity automation.
               </p>
               <div className="flex flex-wrap justify-center lg:justify-start gap-10 pt-4">
                  <div className="flex items-center gap-3"><Lock size={18} className="text-indigo-200" /><span className="text-[10px] font-black uppercase tracking-widest">Secured Node</span></div>
                  <div className="flex items-center gap-3"><ShieldCheck size={18} className="text-indigo-200" /><span className="text-[10px] font-black uppercase tracking-widest">ISO Standards</span></div>
               </div>
            </div>

            <div className="shrink-0 flex flex-col items-center gap-8">
               <button 
                onClick={onStart}
                className="w-full sm:w-auto px-16 py-8 bg-white text-indigo-950 rounded-[2.5rem] font-black text-2xl shadow-3xl hover:scale-105 active:scale-95 transition-all duration-500"
               >
                 Get Started Free
               </button>
               <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">No payment required for basic nodes</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-24 px-4 md:px-8 border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-[#050505]">
        <div className="max-w-7xl mx-auto space-y-16">
          <div className="flex flex-col lg:flex-row justify-between gap-12">
             <div className="space-y-6 max-w-sm">
                <div className="flex items-center gap-3">
                  <GraduationCap size={32} className="text-indigo-600" />
                  <span className="text-2xl font-black tracking-tighter uppercase">{APP_NAME}</span>
                </div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400 leading-relaxed">
                  Institutional RAG engine dedicated to curriculum intelligence and high-fidelity pedagogical engineering.
                </p>
             </div>

             <div className="grid grid-cols-2 md:grid-cols-3 gap-12 md:gap-20">
                <FooterGroup title="Platform" links={['Neural Vault', 'Synthesis Node', 'Progress Tracker']} />
                <FooterGroup title="Resources" links={['Documentation', 'API Sandbox', 'Security Protocol']} />
                <FooterGroup title="Legal" links={['Privacy Policy', 'Terms of Use']} className="hidden md:block" />
             </div>
          </div>

          <div className="pt-8 border-t border-slate-200 dark:border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
             <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.4em]">© 2024 {APP_NAME.toUpperCase()} • ALL SYSTEMS OPERATIONAL</p>
             <div className="flex items-center gap-6">
                <div className="flex items-center gap-2 text-[9px] font-black text-slate-500 uppercase"><Cpu size={12}/> Vercel Production Node</div>
                <div className="flex items-center gap-2 text-[9px] font-black text-emerald-600 uppercase"><CheckCircle2 size={12}/> Verified Architecture</div>
             </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

const BentoNode = ({ id, span, icon, title, desc, reveal, accent }: any) => (
  <div 
    id={id}
    className={`reveal-node ${span} p-8 md:p-10 bg-white dark:bg-[#0c0c0c] border border-slate-200 dark:border-white/5 rounded-[2.5rem] md:rounded-[3.5rem] shadow-sm hover:shadow-2xl hover:border-indigo-500/40 transition-all duration-1000 ${reveal(id)} group cursor-pointer overflow-hidden relative`}
  >
    {accent && <div className={`absolute inset-0 ${accent} opacity-40`} />}
    <div className="w-14 h-14 bg-slate-50 dark:bg-white/5 rounded-2xl flex items-center justify-center mb-8 group-hover:scale-110 group-hover:rotate-6 transition-all duration-500 relative z-10">
      {React.cloneElement(icon, { size: 28 })}
    </div>
    <h3 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white mb-4 tracking-tight uppercase leading-none relative z-10">{title}</h3>
    <p className="text-slate-500 dark:text-slate-400 leading-relaxed font-medium text-sm relative z-10">{desc}</p>
  </div>
);

const FeaturePoint = ({ text }: { text: string }) => (
  <div className="flex items-center gap-3.5 group">
    <div className="p-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-full group-hover:scale-110 transition-transform">
      <CheckCircle2 size={16} />
    </div>
    <span className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">{text}</span>
  </div>
);

const AppCard = ({ label, desc, icon }: any) => (
  <div className="bg-white dark:bg-[#0c0c0c] p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] border border-slate-200 dark:border-white/5 shadow-lg group hover:-translate-y-1.5 transition-all duration-500">
    <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 rounded-xl flex items-center justify-center mb-6 group-hover:rotate-12 transition-transform">
      {icon}
    </div>
    <div className="text-xl font-black text-slate-900 dark:text-white mb-1 uppercase tracking-tight">{label}</div>
    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{desc}</div>
  </div>
);

const FooterGroup = ({ title, links, className }: any) => (
  <div className={`space-y-6 ${className || ''}`}>
    <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-900 dark:text-white">{title}</h4>
    <ul className="space-y-4">
      {links.map((l: string) => (
        <li key={l} className="text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer">{l}</li>
      ))}
    </ul>
  </div>
);

export default Landing;
