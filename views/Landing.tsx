
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { 
  ArrowRight, BrainCircuit, ShieldCheck, 
  Zap, FileText, Globe, GraduationCap, 
  CheckCircle2, Target, BarChart3, Users,
  Network, Cpu, Scale, Lock, Sparkles, Database,
  ArrowUpRight, Layout, MessageSquare, Layers
} from 'lucide-react';
import { APP_NAME } from '../constants';

interface LandingProps {
  onStart: () => void;
}

/**
 * Modern Reveal Hook for Scroll Interactivity
 */
const useReveal = () => {
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
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    );

    document.querySelectorAll('.reveal-node').forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return (id: string) => revealed.has(id) ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12';
};

const Landing: React.FC<LandingProps> = ({ onStart }) => {
  const revealClass = useReveal();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#050505] overflow-x-hidden selection:bg-indigo-500 selection:text-white font-sans">
      {/* Dynamic Background Grid */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-[0.03] dark:opacity-[0.07]">
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(#4f46e5 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-[100] bg-white/70 dark:bg-[#050505]/70 backdrop-blur-2xl border-b border-slate-200/50 dark:border-white/5 h-20">
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-3 group cursor-pointer">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-600/20 group-hover:rotate-12 transition-transform">
              <GraduationCap size={24} />
            </div>
            <span className="text-xl font-black text-slate-900 dark:text-white tracking-tight">{APP_NAME}</span>
          </div>
          
          <div className="hidden md:flex items-center gap-10">
            {['Technology', 'Global', 'Enterprise'].map((item) => (
              <a key={item} href={`#${item.toLowerCase()}`} className="text-xs font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 transition-colors">
                {item}
              </a>
            ))}
            <button 
              onClick={onStart}
              className="px-8 py-3 bg-slate-900 dark:bg-white text-white dark:text-black rounded-full font-black text-[11px] uppercase tracking-widest hover:scale-105 transition-all active:scale-95 shadow-xl shadow-black/10 dark:shadow-white/5"
            >
              Enter Workspace
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-48 pb-32 px-6 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-7xl pointer-events-none">
           <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/20 rounded-full blur-[120px] animate-pulse" />
           <div className="absolute bottom-[10%] right-[-5%] w-[30%] h-[30%] bg-emerald-500/10 rounded-full blur-[100px]" />
        </div>

        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-10 z-10">
            <div className="reveal-node inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-500/20 rounded-full transition-all duration-700" id="hero-badge">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400">v9.0 Neural Engine Live</span>
            </div>
            
            <h1 className={`reveal-node text-6xl lg:text-8xl font-black text-slate-900 dark:text-white tracking-tighter leading-[0.85] transition-all duration-1000 delay-100 ${revealClass('hero-title')}`} id="hero-title">
              Standardized <br /> 
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-purple-500 to-indigo-600 animate-gradient-x">Intelligence.</span>
            </h1>
            
            <p className={`reveal-node text-xl text-slate-500 dark:text-slate-400 leading-relaxed font-medium max-w-xl transition-all duration-1000 delay-200 ${revealClass('hero-desc')}`} id="hero-desc">
              Deterministic curriculum alignment for high-stakes pedagogy. 
              Ground every lesson plan, rubric, and assessment in verified standards with zero hallucination.
            </p>

            <div className={`reveal-node flex flex-col sm:flex-row items-center gap-6 transition-all duration-1000 delay-300 ${revealClass('hero-cta')}`} id="hero-cta">
              <button 
                onClick={onStart}
                className="w-full sm:w-auto px-12 py-6 bg-indigo-600 text-white rounded-[2rem] font-black text-lg shadow-2xl shadow-indigo-600/40 hover:bg-indigo-700 hover:-translate-y-1 transition-all flex items-center justify-center gap-4 group"
              >
                Launch Workspace
                <ArrowRight className="group-hover:translate-x-1.5 transition-transform" />
              </button>
              
              <div className="flex flex-col gap-2">
                <div className="flex -space-x-3">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="w-10 h-10 rounded-full border-4 border-slate-50 dark:border-[#050505] bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-[8px] font-black">EDU</div>
                  ))}
                </div>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Trusted by 500+ Schools</div>
              </div>
            </div>
          </div>

          {/* Hero Visual Card */}
          <div className={`reveal-node relative transition-all duration-1000 delay-500 ${revealClass('hero-visual')}`} id="hero-visual">
            <div className="absolute inset-0 bg-indigo-600 rounded-[4rem] blur-[80px] opacity-10" />
            <div className="relative bg-white dark:bg-[#0d0d0d] p-10 rounded-[4rem] shadow-2xl border border-slate-200 dark:border-white/5 rotate-1 hover:rotate-0 transition-transform duration-700 group">
              <div className="flex items-center justify-between mb-10">
                <div className="flex gap-2">
                   <div className="w-3 h-3 rounded-full bg-rose-500/20 group-hover:bg-rose-500 transition-colors" />
                   <div className="w-3 h-3 rounded-full bg-amber-500/20 group-hover:bg-amber-500 transition-colors" />
                   <div className="w-3 h-3 rounded-full bg-emerald-500/20 group-hover:bg-emerald-500 transition-colors" />
                </div>
                <div className="px-4 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 rounded-full text-[9px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2">
                   <div className="w-1 h-1 rounded-full bg-emerald-500 animate-ping" />
                   Neural Sync Active
                </div>
              </div>
              
              <div className="space-y-8">
                <div className="flex gap-5">
                   <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl group-hover:scale-110 transition-transform"><BrainCircuit size={28}/></div>
                   <div className="flex-1 space-y-3">
                      <div className="h-4 bg-slate-100 dark:bg-white/5 rounded-full w-full" />
                      <div className="h-4 bg-slate-100 dark:bg-white/5 rounded-full w-2/3" />
                   </div>
                </div>
                
                <div className="p-8 bg-slate-50/50 dark:bg-white/5 rounded-[2.5rem] border border-slate-100 dark:border-white/5 space-y-4">
                   {[1, 2, 3].map(i => (
                     <div key={i} className="flex items-center gap-4">
                        <div className="p-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded-full"><CheckCircle2 size={16}/></div>
                        <div className="h-2 bg-slate-200 dark:bg-white/10 rounded-full flex-1" />
                     </div>
                   ))}
                </div>

                <div className="flex justify-between items-center pt-4">
                   <div className="flex flex-col gap-1">
                      <span className="text-[9px] font-black text-slate-400 uppercase">Context Precision</span>
                      <span className="text-xs font-black text-indigo-600">99.8% ALIGNED</span>
                   </div>
                   <button onClick={onStart} className="px-8 py-4 bg-indigo-600 text-white rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-600/20 hover:scale-105 active:scale-95 transition-all">
                      Synthesize
                   </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bento Features Grid */}
      <section id="technology" className="py-32 px-6 bg-white dark:bg-[#080808]">
        <div className="max-w-7xl mx-auto space-y-20">
          <div className={`reveal-node text-center space-y-6 transition-all duration-1000 ${revealClass('tech-header')}`} id="tech-header">
            <h2 className="text-5xl lg:text-6xl font-black text-slate-900 dark:text-white tracking-tight">Institutional Precision.</h2>
            <p className="text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto font-medium">EduNexus AI redefines instructional design by merging RAG architecture with world-class pedagogical frameworks.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-6 lg:grid-cols-12 gap-8">
            <BentoCard 
              id="b1"
              colSpan="md:col-span-3 lg:col-span-4"
              icon={<ShieldCheck className="text-emerald-500" />}
              title="Zero Hallucination"
              desc="Our retrieval node anchors every generated response in your uploaded curriculum documents."
              delay="delay-0"
              revealClass={revealClass}
            />
            <BentoCard 
              id="b2"
              colSpan="md:col-span-3 lg:col-span-8"
              icon={<Database className="text-indigo-500" />}
              title="Multimodal Ingestion"
              desc="Scale your library with instant extraction from PDFs, Government portals, and Institutional archives. Our engine auto-maps standards to a searchable vector grid."
              delay="delay-100"
              revealClass={revealClass}
              featured
            />
            <BentoCard 
              id="b3"
              colSpan="md:col-span-4 lg:col-span-8"
              icon={<Target className="text-amber-500" />}
              title="Deterministic SLO Alignment"
              desc="Every generated artifact includes a neural verification link back to the specific Student Learning Objective (SLO). Maintain 100% compliance across your school chain."
              delay="delay-200"
              revealClass={revealClass}
              featured
            />
            <BentoCard 
              id="b4"
              colSpan="md:col-span-2 lg:col-span-4"
              icon={<Zap className="text-purple-500" />}
              title="Flash Synthesis"
              desc="Complex lesson planning in under 30 seconds."
              delay="delay-300"
              revealClass={revealClass}
            />
          </div>
        </div>
      </section>

      {/* Global Reach Section */}
      <section id="global" className="py-32 px-6 bg-slate-50 dark:bg-[#050505]">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-24 items-center">
           <div className={`reveal-node grid grid-cols-2 gap-6 transition-all duration-1000 ${revealClass('global-grid')}`} id="global-grid">
              <CountryNode title="Pakistan" code="PK" color="bg-emerald-600" delay="delay-0" />
              <CountryNode title="GCC Nodes" code="ME" color="bg-indigo-600" delay="delay-100" />
              <CountryNode title="International" code="UK" color="bg-amber-600" delay="delay-200" />
              <CountryNode title="Development" code="UN" color="bg-rose-600" delay="delay-300" />
           </div>
           
           <div className={`reveal-node space-y-10 transition-all duration-1000 delay-400 ${revealClass('global-content')}`} id="global-content">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 dark:bg-indigo-900/20 rounded-full text-[10px] font-black text-indigo-600 uppercase tracking-widest">Global Interoperability</div>
              <h2 className="text-5xl font-black tracking-tight text-slate-900 dark:text-white leading-[1.1]">Localized Intelligence for Borderless Education.</h2>
              <p className="text-lg text-slate-500 dark:text-slate-400 font-medium">Whether you are aligning with the Sindh Board, KSA Vision 2030, or Cambridge IGCSE, our neural logic adapts to your specific pedagogical DNA.</p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4">
                 <FeatureCheck text="Sovereign Cloud Support" />
                 <FeatureCheck text="Multi-tenant Isolation" />
                 <FeatureCheck text="Regional Data Residency" />
                 <FeatureCheck text="SLO Boosting Factor: 50.0" />
              </div>
              
              <button onClick={onStart} className="flex items-center gap-4 text-indigo-600 font-black uppercase tracking-widest text-sm group">
                 Explore Deployment Map <ArrowUpRight className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
              </button>
           </div>
        </div>
      </section>

      {/* Impact Section */}
      <section id="enterprise" className="py-32 px-6">
        <div className={`reveal-node max-w-7xl mx-auto bg-indigo-600 rounded-[5rem] p-12 lg:p-24 text-white relative overflow-hidden shadow-[0_50px_100px_-20px_rgba(79,70,229,0.3)] transition-all duration-1000 ${revealClass('impact-card')}`} id="impact-card">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-white opacity-5 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2" />
          
          <div className="relative z-10 flex flex-col lg:flex-row gap-20 items-center">
            <div className="flex-1 space-y-8">
              <h2 className="text-5xl lg:text-6xl font-black tracking-tight leading-[1]">Institutional Scale. <br />Personal Accuracy.</h2>
              <p className="text-xl text-indigo-100 font-medium leading-relaxed">
                Empower your department heads to standardize quality across entire school chains. Reduce teacher burnout by 70% with high-fidelity automation.
              </p>
              <div className="grid grid-cols-2 gap-12 pt-6">
                <div>
                  <div className="text-5xl font-black mb-2">94%</div>
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Accuracy Rating</div>
                </div>
                <div>
                  <div className="text-5xl font-black mb-2">12M+</div>
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">SLOs Indexed</div>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col items-center gap-10 shrink-0">
              <button 
                onClick={onStart}
                className="px-16 py-8 bg-white text-indigo-950 rounded-[2.5rem] font-black text-2xl shadow-2xl hover:scale-105 active:scale-95 transition-all"
              >
                Join the Network
              </button>
              <div className="flex items-center gap-6">
                 <div className="flex items-center gap-2">
                    <ShieldCheck size={18} className="text-indigo-200" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-100">ISO Verified</span>
                 </div>
                 <div className="w-px h-4 bg-indigo-400/30" />
                 <div className="flex items-center gap-2">
                    <Lock size={18} className="text-indigo-200" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-100">AES-256 Storage</span>
                 </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-32 px-6 border-t border-slate-200 dark:border-white/5">
        <div className="max-w-7xl mx-auto flex flex-col gap-20">
          <div className="flex flex-col md:flex-row justify-between items-start gap-12">
            <div className="space-y-6 max-w-xs">
              <div className="flex items-center gap-3">
                <GraduationCap size={32} className="text-indigo-600" />
                <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{APP_NAME}</span>
              </div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400 leading-relaxed">
                The world's first multi-provider RAG engine dedicated exclusively to curriculum intelligence.
              </p>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-16">
               <div className="space-y-6">
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white">Technology</h4>
                  <ul className="space-y-4 text-xs font-bold text-slate-400">
                    <li className="hover:text-indigo-600 cursor-pointer transition-colors">Neural RAG v3</li>
                    <li className="hover:text-indigo-600 cursor-pointer transition-colors">Hybrid Indexer</li>
                    <li className="hover:text-indigo-600 cursor-pointer transition-colors">Vision Nodes</li>
                  </ul>
               </div>
               <div className="space-y-6">
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white">Company</h4>
                  <ul className="space-y-4 text-xs font-bold text-slate-400">
                    <li className="hover:text-indigo-600 cursor-pointer transition-colors">Whitepaper</li>
                    <li className="hover:text-indigo-600 cursor-pointer transition-colors">Audit Protocol</li>
                    <li className="hover:text-indigo-600 cursor-pointer transition-colors">Global Node Map</li>
                  </ul>
               </div>
               <div className="space-y-6">
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white">Legal</h4>
                  <ul className="space-y-4 text-xs font-bold text-slate-400">
                    <li className="hover:text-indigo-600 cursor-pointer transition-colors">Privacy</li>
                    <li className="hover:text-indigo-600 cursor-pointer transition-colors">Terms</li>
                    <li className="hover:text-indigo-600 cursor-pointer transition-colors">SLA</li>
                  </ul>
               </div>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row justify-between items-center gap-8 pt-10 border-t border-slate-100 dark:border-white/5">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">© 2024 EDUNEXUS AI • ALL NODES OPERATIONAL</p>
            <div className="flex items-center gap-6">
               <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 dark:bg-white/5 rounded-full text-[9px] font-black text-slate-500 uppercase">
                  <Cpu size={10}/> Grid Node: US-EAST-1
               </div>
               <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/30 rounded-full text-[9px] font-black text-emerald-600 uppercase">
                  <ShieldCheck size={10}/> Verified Production
               </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

const BentoCard = ({ id, colSpan, icon, title, desc, delay, revealClass, featured }: any) => (
  <div 
    id={id}
    className={`reveal-node ${colSpan} p-10 bg-white dark:bg-[#0d0d0d] border border-slate-200 dark:border-white/5 rounded-[3rem] shadow-sm hover:shadow-2xl hover:border-indigo-500/50 transition-all duration-1000 ${delay} ${revealClass(id)} group cursor-pointer overflow-hidden relative`}
  >
    {featured && <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-[60px] -translate-y-1/2 translate-x-1/2" />}
    <div className="w-16 h-16 bg-slate-50 dark:bg-white/5 rounded-2xl flex items-center justify-center mb-8 group-hover:scale-110 group-hover:rotate-6 transition-all duration-500">
      {React.cloneElement(icon, { size: 32 })}
    </div>
    <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-4 tracking-tight uppercase leading-none">{title}</h3>
    <p className="text-slate-500 dark:text-slate-400 leading-relaxed font-medium">{desc}</p>
  </div>
);

const CountryNode = ({ title, code, color, delay }: any) => (
  <div className={`p-8 bg-white dark:bg-[#0d0d0d] rounded-[2.5rem] shadow-lg border border-slate-100 dark:border-white/5 space-y-4 hover:-translate-y-2 transition-all duration-500 ${delay} group`}>
    <div className={`w-12 h-12 ${color} rounded-xl flex items-center justify-center text-white font-black text-sm shadow-xl group-hover:rotate-12 transition-transform`}>{code}</div>
    <h4 className="font-black text-slate-900 dark:text-white uppercase tracking-tight">{title}</h4>
    <p className="text-[10px] text-slate-500 leading-relaxed font-bold uppercase tracking-widest opacity-60">Verified Cluster</p>
  </div>
);

const FeatureCheck = ({ text }: { text: string }) => (
  <div className="flex items-center gap-4 group">
    <div className="p-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-full group-hover:scale-125 transition-transform"><CheckCircle2 size={16}/></div>
    <span className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-tight">{text}</span>
  </div>
);

export default Landing;
