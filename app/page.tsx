'use client';

import React, { useState, useEffect, Suspense, lazy, useCallback, useRef } from 'react';
import { supabase, getSupabaseHealth, getOrCreateProfile, isSupabaseConfigured, getCredentials } from '../lib/supabase';
import Sidebar from '../components/Sidebar';
import Dashboard from '../views/Dashboard';
import Login from '../views/Login';
import Landing from '../views/Landing';
import Policy from '../views/Policy';
import { ProviderStatusBar } from '../components/ProviderStatusBar';
import { UserRole, SubscriptionPlan, UserProfile, NeuralBrain, Document } from '../types';
import { DEFAULT_MASTER_PROMPT, DEFAULT_BLOOM_RULES } from '../constants';
import { Loader2, Menu, Cpu, AlertTriangle, Eye, EyeOff } from 'lucide-react';

const DocumentsView = lazy(() => import('../views/Documents'));
const ToolsView = lazy(() => import('../views/Tools'));
const BrainControlView = lazy(() => import('../views/BrainControl'));
const PricingView = lazy(() => import('../views/Pricing'));
const TrackerView = lazy(() => import('../views/Tracker'));
const AuditView = lazy(() => import('../views/AuditDashboard'));
const MissionView = lazy(() => import('../views/MissionControl'));

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [isAuthResolving, setIsAuthResolving] = useState(true);
  const [currentView, setCurrentView] = useState('landing');
  const [infraError, setInfraError] = useState<string | null>(null);
  const [showRuntimeDebug, setShowRuntimeDebug] = useState(false);
  const initStarted = useRef(false);
  
  const [documents, setDocuments] = useState<Document[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [healthStatus, setHealthStatus] = useState({ status: 'checking', message: 'Syncing...' });
  const [brain, setBrain] = useState<NeuralBrain>({
    id: 'system-brain', masterPrompt: DEFAULT_MASTER_PROMPT,
    bloomRules: DEFAULT_BLOOM_RULES, version: 1, isActive: true,
    updatedAt: new Date().toISOString()
  });

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark';
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.classList.toggle('dark', savedTheme === 'dark');
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  const fetchAppData = useCallback(async (userId: string, email?: string) => {
    getSupabaseHealth().then(setHealthStatus);
    
    getOrCreateProfile(userId, email).then(profile => {
      if (profile) {
        setUserProfile({
          id: profile.id, email: profile.email || '',
          name: profile.name || email?.split('@')[0] || 'Educator',
          role: profile.role as UserRole, plan: profile.plan as SubscriptionPlan,
          queriesUsed: profile.queries_used || 0, queriesLimit: profile.queries_limit || 30,
          generationCount: profile.generation_count || 0, successRate: profile.success_rate || 0
        });
      }
    });

    supabase.from('documents').select('*').eq('user_id', userId).order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) {
          setDocuments(data.map(d => ({
            id: d.id, userId: d.user_id, name: d.name, status: d.status as any,
            curriculumName: d.curriculum_name || d.name, authority: d.authority || 'General',
            subject: d.subject || 'General', gradeLevel: d.grade_level || 'Auto',
            versionYear: d.version_year || '2024', version: d.version || 1,
            geminiProcessed: d.rag_indexed, isSelected: d.is_selected,
            sourceType: d.source_type as any || 'markdown', extractedText: d.extracted_text,
            createdAt: d.created_at, isApproved: d.is_approved
          })));
        }
      });
  }, []);

  useEffect(() => {
    if (initStarted.current) return;
    initStarted.current = true;

    const initializeAuth = async () => {
      console.log('📡 [System] Infrastructure Handshake: INITIATED');
      
      let retries = 0;
      const maxRetries = 15; 
      
      while (retries < maxRetries) {
        if (isSupabaseConfigured()) break;
        const { url, key } = getCredentials();
        console.warn(`📡 [System] Handshake attempt ${retries + 1}/${maxRetries}. URL: ${url ? 'Found' : 'Missing'}, Key: ${key ? 'Found' : 'Missing'}`);
        await new Promise(r => setTimeout(r, 600));
        retries++;
      }

      if (!isSupabaseConfigured()) {
        console.error('📡 [System] Handshake Failed: Pulse discovery exhausted.');
        setInfraError("Infrastructure Handshake Failed: Supabase keys not detected in runtime environment. Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are correctly mapped.");
        setIsAuthResolving(false);
        return;
      }

      console.log('📡 [System] Infrastructure Handshake: VERIFIED');
      try {
        const { data: { session: existingSession } } = await supabase.auth.getSession();
        if (existingSession) {
          setSession(existingSession);
          fetchAppData(existingSession.user.id, existingSession.user.email);
          setCurrentView('dashboard');
        }
      } catch (err) {
        console.error('📡 [System] Auth initialization failed:', err);
      }
      setIsAuthResolving(false);
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, currentSession) => {
      if (currentSession) {
        setSession(currentSession);
        fetchAppData(currentSession.user.id, currentSession.user.email);
        if (currentView === 'landing' || currentView === 'login') setCurrentView('dashboard');
      } else {
        setSession(null);
        if (currentView !== 'landing' && currentView !== 'login') setCurrentView('landing');
      }
    });

    return () => subscription?.unsubscribe();
  }, [fetchAppData, currentView]);

  if (infraError) {
    const creds = getCredentials();
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6 text-left">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 p-10 rounded-[3rem] shadow-2xl border border-rose-100 dark:border-rose-900/30 text-center space-y-6">
          <div className="w-20 h-20 bg-rose-50 dark:bg-rose-900/20 rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle className="w-12 h-12 text-rose-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Handshake Fault</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm">{infraError}</p>
          </div>
          
          <div className="p-4 bg-slate-50 dark:bg-black/20 rounded-2xl text-left space-y-4">
             <div>
               <p className="text-[10px] font-black uppercase text-slate-400 mb-2">Diagnostic Resolution</p>
               <ul className="text-[11px] text-slate-500 space-y-1 font-medium list-disc ml-4">
                 <li>Confirm keys are set in <b>Secrets</b> dashboard.</li>
                 <li>Verify <b>NEXT_PUBLIC_</b> prefix for all keys.</li>
                 <li>Restart development server or redeploy.</li>
               </ul>
             </div>

             <div className="pt-2 border-t dark:border-white/5">
                <button 
                  onClick={() => setShowRuntimeDebug(!showRuntimeDebug)}
                  className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-indigo-500"
                >
                  {showRuntimeDebug ? <EyeOff size={10}/> : <Eye size={10}/>} {showRuntimeDebug ? 'Hide' : 'Inspect'} Scavenger Results
                </button>
                {showRuntimeDebug && (
                  <div className="mt-3 p-3 bg-black rounded-xl font-mono text-[9px] text-emerald-400 overflow-x-auto text-left">
                    <div>RESOLVED_URL: {creds.url ? 'FOUND' : 'NULL'}</div>
                    <div>RESOLVED_KEY: {creds.key ? 'FOUND' : 'NULL'}</div>
                    <div className="mt-2 text-slate-500">// Discovery v14.0 Deep Pulse active</div>
                  </div>
                )}
             </div>
          </div>

          <button onClick={() => window.location.reload()} className="w-full py-4 bg-slate-900 text-white dark:bg-white dark:text-black rounded-2xl font-bold uppercase tracking-widest text-xs shadow-xl hover:scale-[1.02] transition-all">Retry Discovery</button>
        </div>
      </div>
    );
  }

  if (isAuthResolving) return (
    <div className="h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="bg-white dark:bg-slate-900 p-12 rounded-[4rem] shadow-2xl border dark:border-white/5 flex flex-col items-center">
        <Cpu className="text-indigo-600 w-16 h-16 animate-pulse mb-6" />
        <div className="flex gap-2">
          <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.3s]" />
          <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.15s]" />
          <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" />
        </div>
      </div>
      <p className="mt-8 text-indigo-600 font-black uppercase tracking-[0.4em] text-[10px] opacity-50">Syncing Grid</p>
    </div>
  );
  
  if (!session) {
    if (currentView === 'login') return <Login onSession={setSession} onBack={() => setCurrentView('landing')} />;
    return <Landing onStart={() => setCurrentView('login')} />;
  }

  const safeProfile = userProfile || {
    id: session.user.id, email: session.user.email || '', name: 'Educator',
    role: UserRole.TEACHER, plan: SubscriptionPlan.FREE, queriesUsed: 0, queriesLimit: 30,
    generationCount: 0, successRate: 0
  };

  return (
    <div className={`flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden ${theme === 'dark' ? 'dark' : ''}`}>
      {isSidebarOpen && <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[90] lg:hidden" onClick={() => setIsSidebarOpen(false)} />}
      <div className={`fixed inset-y-0 left-0 z-[100] transform lg:relative lg:translate-x-0 transition-all duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0 w-72' : '-translate-x-full lg:translate-x-0'} ${isCollapsed ? 'lg:w-20' : 'lg:w-64'}`}>
        <Sidebar currentView={currentView} onViewChange={v => { setCurrentView(v); setIsSidebarOpen(false); }} userProfile={safeProfile} isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} theme={theme} toggleTheme={toggleTheme} />
      </div>
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {safeProfile.role === UserRole.APP_ADMIN && <ProviderStatusBar />}
        <header className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 border-b dark:border-slate-800 shadow-sm z-40">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 text-slate-600 hover:bg-slate-50 rounded-xl"><Menu size={24} /></button>
            <span className="font-black text-indigo-950 dark:text-white tracking-tight text-sm uppercase">{currentView.replace('-', ' ')}</span>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
          <div className="max-w-6xl mx-auto w-full">
            <Suspense fallback={<div className="flex justify-center p-20"><Loader2 className="animate-spin text-indigo-600" size={32} /></div>}>
              {(() => {
                const props = { 
                  user: safeProfile, documents, onProfileUpdate: setUserProfile, health: healthStatus as any, 
                  onCheckHealth: () => getSupabaseHealth().then(setHealthStatus).then(() => true), onViewChange: setCurrentView 
                };
                switch (currentView) {
                  case 'dashboard': return <Dashboard {...props} />;
                  case 'documents': return <DocumentsView documents={documents} userProfile={safeProfile} onAddDocument={async () => fetchAppData(safeProfile.id, safeProfile.email)} onUpdateDocument={async(id, u) => setDocuments(d => d.map(x => x.id === id ? {...x,...u}:x))} onDeleteDocument={async (id) => setDocuments(d => d.filter(x => x.id !== id))} isConnected={healthStatus.status === 'connected'} />;
                  case 'tools': return <ToolsView user={safeProfile} brain={brain} documents={documents} onQuery={() => setUserProfile(p => p ? {...p, queriesUsed: p.queriesUsed + 1} : null)} canQuery={safeProfile.queriesUsed < safeProfile.queriesLimit} />;
                  case 'tracker': return <TrackerView user={safeProfile} documents={documents} />;
                  case 'brain': return safeProfile.role === UserRole.APP_ADMIN ? <BrainControlView brain={brain} onUpdate={setBrain} /> : <Dashboard {...props} />;
                  case 'audit': return safeProfile.role === UserRole.APP_ADMIN ? <AuditView user={safeProfile} /> : <Dashboard {...props} />;
                  case 'mission': return safeProfile.role === UserRole.APP_ADMIN ? <MissionView /> : <Dashboard {...props} />;
                  case 'pricing': return <PricingView currentPlan={safeProfile.plan} onUpgrade={() => setCurrentView('dashboard')} />;
                  case 'policy': return <Policy onBack={() => setCurrentView('pricing')} />;
                  default: return <Dashboard {...props} />;
                }
              })()}
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}