
'use client';

import React, { useEffect, useState, useRef } from 'react';
import { 
  ArrowRight, BrainCircuit, ShieldCheck, 
  Zap, FileText, Globe, GraduationCap, 
  CheckCircle2, Target, BarChart3, Users,
  Network, Cpu, Scale, Lock, Sparkles, Database,
  ArrowUpRight, Layout, MessageSquare, Layers,
  ChevronDown, MousePointer2, Activity, Play
} from 'lucide-react';
import { APP_NAME } from '../constants';

interface LandingProps {
  onStart: () => void;
}

/**
 * Enhanced Reveal Hook with Stagger Support
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
      { threshold: 0.15, rootMargin: '0px 0px -100px 0px' }
    );

    document.querySelectorAll('.reveal-node').forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return (id: string) => revealed.has(id) 
    ? 'opacity-100 translate-y-0 scale-100' 
    : 'opacity-0 translate-y-20 scale-[0.98]';
};

const Landing: React.FC<LandingProps> = ({ onStart }) => {
  const reveal = useScrollReveal();
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = (window.scrollY / totalHeight) * 100;
      setScrollProgress(progress);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-[#030303] overflow-x-hidden selection:bg-indigo-600 selection:text-white font-sans scroll-smooth">
      {/* Scroll Progress Bar */}
      <div className="fixed top-0 left-0 h-[3px] bg-indigo-600 z-[200] transition-all duration-300 ease-out" style={{ width: `${scrollProgress}%` }} />

      {/* Aurora Background Nodes */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 dark:bg-indigo-600/5 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-500/10 dark:bg-emerald-600/5 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full opacity-[0.03] dark:opacity-[0.08]" 
             style={{ backgroundImage: 'radial-gradient(#4f46e5 0.5px, transparent 0.5px)', backgroundSize: '30px 30px' }} />
      </div>

      {/* Modern Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-[150] transition-all duration-500 bg-white/80 dark:bg-[#030303]/80 backdrop-blur-2xl border-b border-slate-200/50 dark:border-white/5 px-6">
        <div className="max-w-7xl mx-auto h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-xl shadow-indigo-600/20 group-hover:rotate-[15deg] transition-all duration-500">
              <GraduationCap size={24} />
            </div>
            <span className="text-xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">{APP_NAME}</span>
          </div>

          <div className="hidden lg:flex items-center gap-12">
            {['Technology', 'Network', 'Enterprise'].map((item) => (
              <a key={item} href={`#${item.toLowerCase()}`} className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 hover:text-indigo-600 transition-colors">
                {item}
              </a>
            ))}
            <button 
              onClick={onStart}
              className="group relative px-8 py-3 bg-slate-900 dark:bg-white text-white dark:text-black rounded-full font-black text-[10px] uppercase tracking-widest overflow-hidden transition-all hover:scale-105 active:scale-95"
            >
              <span className="relative z-10">Workspace</span>
              <div className="absolute inset-0 bg-indigo-600 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
            </button>
          </div>
          
          <button onClick={onStart} className="lg:hidden p-2 text-slate-900 dark:text-white"><MousePointer2 size={24} /></button>
        </div>
      </nav>

      {/* Hero Section: The Neural Gateway */}
      <section className="relative min-h-screen flex items-center pt-20 px-6">
        <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
          <div className="space-y-12 z-10">
            <div className={`reveal-node inline-flex items-center gap-3 px-5 py-2 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-500/20 rounded-full transition-all duration-1000 ${reveal('h-badge')}`} id="h-badge">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
              </span>
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-600 dark:text-indigo-400">Node Sync: 100% Operational</span>
            </div>

            <h1 className={`reveal-node text-7xl lg:text-[10rem] font-black text-slate-900 dark:text-white tracking-[1.5%] leading-[0.82] transition-all duration-1000 delay-100 ${reveal('h-title')}`} id="h-title">
              Curriculum <br /> 
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-purple-500 to-indigo-600 animate-gradient-x italic">Neuralized.</span>
            </h1>

            <p className={`reveal-node text-xl md:text-2xl text-slate-500 dark:text-slate-400 leading-relaxed font-medium max-w-xl transition-all duration-1000 delay-200 ${reveal('h-desc')}`} id="h-desc">
              Deterministic alignment for high-stakes pedagogy. Ground your instructional design in verified standards with zero-latency synthesis.
            </p>

            <div className={`reveal-node flex flex-col sm:flex-row items-center gap-8 transition-all duration-1000 delay-300 ${reveal('h-cta')}`} id="h-cta">
              <button 
                onClick={onStart}
                className="w-full sm:w-auto px-14 py-7 bg-indigo-600 text-white rounded-[2.5rem] font-black text-xl shadow-[0_20px_50px_-10px_rgba(79,70,229,0.5)] hover:bg-indigo-700 hover:-translate-y-1.5 transition-all flex items-center justify-center gap-4 group"
              >
                Launch Workspace
                <ArrowRight className="group-hover:translate-x-2 transition-transform" />
              </button>
              
              <div className="flex flex-col items-center sm:items-start gap-3">
                 <div className="flex -space-x-4">
                    {[1,2,3,4].map(i => (
                      <div key={i} className="w-12 h-12 rounded-full border-4 border-white dark:border-[#030303] bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[8px] font-black shadow-lg">EDU</div>
                    ))}
                 </div>
                 <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Institutional Powerhouse</p>
              </div>
            </div>
          </div>

          {/* Interactive Hero Visual */}
          <div className={`reveal-node relative transition-all duration-1000 delay-500 ${reveal('h-vis')}`} id="h-vis">
             <div className="absolute inset-0 bg-indigo-600/10 blur-[100px] rounded-full animate-pulse" />
             <div className="relative bg-white dark:bg-[#0a0a0a] p-1.5 rounded-[4rem] border border-slate-200 dark:border-white/5 shadow-2xl group overflow-hidden">
                <div className="bg-slate-50 dark:bg-[#0f0f0f] p-10 rounded-[3.5rem] space-y-10">
                   <div className="flex items-center justify-between">
                      <div className="flex gap-2">
                        <div className="w-3 h-3 rounded-full bg-rose-500/40" />
                        <div className="w-3 h-3 rounded-full bg-amber-500/40" />
                        <div className="w-3 h-3 rounded-full bg-emerald-500/40" />
                      </div>
                      <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                        <Activity size={12} className="text-indigo-500" /> Latency: 420ms
                      </div>
                   </div>

                   <div className="space-y-6">
                      <div className="flex gap-6">
                        <div className="w-16 h-16 bg-indigo-600 rounded-3xl flex items-center justify-center text-white shadow-2xl animate-spin-slow"><BrainCircuit size={32}/></div>
                        <div className="flex-1 space-y-3 pt-2">
                           <div className="h-4 bg-slate-200 dark:bg-white/5 rounded-full w-full" />
                           <div className="h-4 bg-slate-200 dark:bg-white/5 rounded-full w-4/5" />
                        </div>
                      </div>

                      <div className="p-8 bg-white dark:bg-white/5 rounded-[2.5rem] border border-slate-100 dark:border-white/5 space-y-5">
                         {[1,2,3].map(i => (
                           <div key={i} className="flex items-center gap-4">
                              <div className="p-1.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 rounded-full"><CheckCircle2 size={14}/></div>
                              <div className="h-2.5 bg-slate-100 dark:bg-white/5 rounded-full flex-1" />
                           </div>
                         ))}
                      </div>

                      <div className="flex items-center justify-between pt-4">
                         <div className="space-y-1">
                            <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Alignment Score</span>
                            <span className="block text-xl font-black text-indigo-600">99.8% Precise</span>
                         </div>
                         <button onClick={onStart} className="px-10 py-5 bg-indigo-600 text-white rounded-[1.8rem] font-black text-[11px] uppercase tracking-widest shadow-xl hover:scale-105 transition-all flex items-center gap-2">
                           <Zap size={14} /> Synthesize
                         </button>
                      </div>
                   </div>
                </div>
                {/* Background Glass Layer */}
                <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
             </div>
          </div>
        </div>
        
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce">
           <ChevronDown size={24} className="text-slate-300" />
        </div>
      </section>

      {/* Bento Grid: Core Infrastructure */}
      <section id="technology" className="py-40 px-6">
        <div className="max-w-7xl mx-auto space-y-24">
           <div className={`reveal-node text-center space-y-6 transition-all duration-1000 ${reveal('b-header')}`} id="b-header">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/30 rounded-full text-[10px] font-black text-emerald-600 uppercase tracking-widest">The Multi-Provider Grid</div>
              <h2 className="text-5xl lg:text-7xl font-black text-slate-900 dark:text-white tracking-tighter leading-none">Institutional Precision.</h2>
              <p className="text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto font-medium leading-relaxed">
                EduNexus AI redefines instructional design by merging RAG architecture with world-class pedagogical frameworks and multi-LLM orchestration.
              </p>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-12 gap-8 h-full">
              <BentoNode 
                id="bn1"
                span="md:col-span-4"
                icon={<ShieldCheck className="text-indigo-500" />}
                title="Context Lock"
                desc="Our retrieval node anchors every response in your uploaded curriculum documents. Hallucinations are filtered at the gate."
                reveal={reveal}
              />
              <BentoNode 
                id="bn2"
                span="md:col-span-8"
                icon={<Database className="text-emerald-500" />}
                title="Multimodal Ingestion"
                desc="Scale your institutional library with high-fidelity extraction from legacy PDFs and official MoE archives. Auto-indexed into a semantic vector grid."
                reveal={reveal}
                accent="bg-emerald-500/5"
              />
              <BentoNode 
                id="bn3"
                span="md:col-span-7"
                icon={<Target className="text-amber-500" />}
                title="SLO-First Architecture"
                desc="Every generated lesson includes neural verification links back to specific Student Learning Objectives (SLOs). Maintain 100% policy compliance across school chains."
                reveal={reveal}
                accent="bg-amber-500/5"
              />
              <BentoNode 
                id="bn4"
                span="md:col-span-5"
                icon={<Layers className="text-purple-500" />}
                title="Hybrid Synthesis"
                desc="Dynamic orchestration between Gemini 3 Pro and Llama 3 for optimized pedagogical reasoning."
                reveal={reveal}
              />
           </div>
        </div>
      </section>

      {/* Global Network Section */}
      <section id="network" className="py-40 px-6 bg-slate-50 dark:bg-[#080808] relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent" />
        
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-24 items-center">
           <div className={`reveal-node space-y-12 transition-all duration-1000 ${reveal('net-content')}`} id="net-content">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 dark:bg-indigo-900/20 rounded-full text-[10px] font-black text-indigo-600 uppercase tracking-widest">Global Interoperability</div>
              <h2 className="text-6xl font-black tracking-tighter text-slate-900 dark:text-white leading-[0.9]">Localized Intelligence. <br />Global Standards.</h2>
              <p className="text-xl text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                Whether aligning with Sindh Board (DCAR), KSA Vision 2030, or Cambridge IGCSE, our neural logic adapts to your specific pedagogical DNA instantly.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                 <NetworkPoint text="Sovereign Cloud Residency" />
                 <NetworkPoint text="Multi-tenant Isolation" />
                 <NetworkPoint text="Official Portal Scrapers" />
                 <NetworkPoint text="ISO 27001 Data Handling" />
              </div>
              
              <button onClick={onStart} className="flex items-center gap-4 text-indigo-600 font-black uppercase tracking-[0.2em] text-[11px] group transition-all">
                 Explore Cluster Map <ArrowUpRight className="group-hover:translate-x-2 group-hover:-translate-y-2 transition-transform" />
              </button>
           </div>

           <div className={`reveal-node grid grid-cols-2 gap-6 transition-all duration-1000 delay-300 ${reveal('net-visual')}`} id="net-visual">
              <StatCard label="Indexed SLOs" value="12M+" icon={<Database size={16}/>} />
              <StatCard label="Global Nodes" value="24" icon={<Globe size={16}/>} />
              <StatCard label="Avg Synthesis" value="28s" icon={<Zap size={16}/>} />
              <StatCard label="Accuracy" value="99.8%" icon={<CheckCircle2 size={16}/>} />
           </div>
        </div>
      </section>

      {/* Impact & Enterprise Call to Action */}
      <section id="enterprise" className="py-40 px-6">
        <div className={`reveal-node max-w-7xl mx-auto bg-indigo-600 rounded-[5rem] p-12 lg:p-32 text-white relative overflow-hidden shadow-2xl transition-all duration-1000 ${reveal('e-cta')}`} id="e-cta">
          <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-white opacity-[0.08] rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2" />
          
          <div className="relative z-10 flex flex-col lg:flex-row items-center gap-24">
            <div className="flex-1 space-y-10">
               <h2 className="text-6xl lg:text-8xl font-black tracking-tighter leading-[0.85]">Empower <br />Institutions.</h2>
               <p className="text-2xl text-indigo-100 font-medium leading-relaxed opacity-90 max-w-xl">
                 Centralize standards across entire school chains. Reduce teacher burnout by 70% with high-fidelity instructional automation.
               </p>
               <div className="flex flex-wrap gap-10 pt-6">
                  <div><p className="text-4xl font-black mb-1">94%</p><p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Success Rate</p></div>
                  <div className="w-px h-12 bg-white/20" />
                  <div><p className="text-4xl font-black mb-1">500+</p><p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Verified Hubs</p></div>
               </div>
            </div>

            <div className="shrink-0 flex flex-col items-center gap-10">
               <button 
                onClick={onStart}
                className="px-16 py-9 bg-white text-indigo-950 rounded-[3rem] font-black text-2xl shadow-3xl hover:scale-105 active:scale-95 transition-all duration-500"
               >
                 Join the Network
               </button>
               <div className="flex items-center gap-6 opacity-60">
                  <div className="flex items-center gap-2"><Lock size={16}/><span className="text-[9px] font-black uppercase tracking-widest">Secure AES-256</span></div>
                  <div className="flex items-center gap-2"><ShieldCheck size={16}/><span className="text-[9px] font-black uppercase tracking-widest">SOC2 Framework</span></div>
               </div>
            </div>
          </div>
        </div>
      </section>

      {/* Modern Footer */}
      <footer className="py-32 px-6 border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-[#050505]">
        <div className="max-w-7xl mx-auto space-y-24">
          <div className="flex flex-col lg:flex-row justify-between gap-20">
             <div className="space-y-8 max-w-sm">
                <div className="flex items-center gap-3">
                  <GraduationCap size={40} className="text-indigo-600" />
                  <span className="text-3xl font-black tracking-tighter uppercase">{APP_NAME}</span>
                </div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400 leading-relaxed">
                  The world's first multi-provider RAG engine dedicated exclusively to curriculum intelligence and pedagogical engineering.
                </p>
                <div className="flex gap-4">
                   <button onClick={onStart} className="p-3 bg-white dark:bg-white/5 rounded-2xl shadow-sm hover:scale-110 transition-all border border-slate-200 dark:border-white/5"><Play size={18} fill="currentColor"/></button>
                   <button onClick={onStart} className="p-3 bg-white dark:bg-white/5 rounded-2xl shadow-sm hover:scale-110 transition-all border border-slate-200 dark:border-white/5"><Globe size={18}/></button>
                </div>
             </div>

             <div className="grid grid-cols-2 md:grid-cols-3 gap-20">
                <FooterGroup title="Platform" links={['Neural Engine', 'RAG Visualizer', 'Institutional Vault']} />
                <FooterGroup title="Resources" links={['Whitepaper', 'API Sandbox', 'Security Protocol']} />
                <FooterGroup title="Legal" links={['Data Privacy', 'Terms of Use', 'Audit SLA']} />
             </div>
          </div>

          <div className="pt-12 border-t border-slate-200 dark:border-white/5 flex flex-col md:flex-row justify-between items-center gap-8">
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">© 2024 EDUNEXUS AI • GRID SECURED • US-EAST-1</p>
             <div className="flex items-center gap-6">
                <div className="flex items-center gap-2 text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase"><Cpu size={12}/> Vercel Edge Node</div>
                <div className="flex items-center gap-2 text-[9px] font-black text-emerald-600 uppercase"><CheckCircle2 size={12}/> Verified Production</div>
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
    className={`reveal-node ${span} p-10 bg-white dark:bg-[#0c0c0c] border border-slate-200 dark:border-white/5 rounded-[3.5rem] shadow-sm hover:shadow-2xl hover:border-indigo-500/40 transition-all duration-1000 ${reveal(id)} group cursor-pointer overflow-hidden relative`}
  >
    {accent && <div className={`absolute inset-0 ${accent} opacity-40`} />}
    <div className="w-16 h-16 bg-slate-50 dark:bg-white/5 rounded-3xl flex items-center justify-center mb-8 group-hover:scale-110 group-hover:rotate-[10deg] transition-all duration-500 relative z-10">
      {React.cloneElement(icon, { size: 32 })}
    </div>
    <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-4 tracking-tight uppercase leading-none relative z-10">{title}</h3>
    <p className="text-slate-500 dark:text-slate-400 leading-relaxed font-medium text-sm relative z-10">{desc}</p>
  </div>
);

const NetworkPoint = ({ text }: { text: string }) => (
  <div className="flex items-center gap-4 group">
    <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-full group-hover:scale-125 transition-transform">
      <CheckCircle2 size={16} />
    </div>
    <span className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">{text}</span>
  </div>
);

const StatCard = ({ label, value, icon }: any) => (
  <div className="bg-white dark:bg-[#0c0c0c] p-8 rounded-[2.5rem] border border-slate-200 dark:border-white/5 shadow-lg group hover:-translate-y-2 transition-all duration-500">
    <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 rounded-xl flex items-center justify-center mb-6 group-hover:rotate-12 transition-transform">
      {icon}
    </div>
    <div className="text-3xl font-black text-slate-900 dark:text-white mb-1">{value}</div>
    <div className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">{label}</div>
  </div>
);

const FooterGroup = ({ title, links }: any) => (
  <div className="space-y-6">
    <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-900 dark:text-white">{title}</h4>
    <ul className="space-y-4">
      {links.map((l: string) => (
        <li key={l} className="text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer">{l}</li>
      ))}
    </ul>
  </div>
);

export default Landing;
