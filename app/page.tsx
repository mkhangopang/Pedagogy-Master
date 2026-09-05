'use client';

import React, { useState, useEffect, Suspense, lazy, useCallback, useRef } from 'react';
import { supabase, getSupabaseHealth, getOrCreateProfile, isSupabaseConfigured, getCredentials, refreshSupabaseInstance } from '../lib/supabase';
import Landing from '../views/Landing';
import Policy from '../views/Policy';
import { ProviderStatusBar } from '../components/ProviderStatusBar';
import { UserRole, SubscriptionPlan, UserProfile, NeuralBrain, Document } from '../types';
import { DEFAULT_MASTER_PROMPT, DEFAULT_BLOOM_RULES } from '../constants';
import { Loader2, Menu, Cpu, AlertTriangle, Eye, EyeOff, RefreshCw, ArrowRight } from 'lucide-react';

// Code-split heavy views to keep the landing page bundle minimal
const Sidebar = lazy(() => import('../components/Sidebar'));
const Dashboard = lazy(() => import('../views/Dashboard'));
const Login = lazy(() => import('../views/Login'));
const DocumentsView = lazy(() => import('../views/Documents'));
const ChatView = lazy(() => import('../views/Chat'));
const ToolsView = lazy(() => import('../views/Tools'));
const BrainControlView = lazy(() => import('../views/BrainControl'));
const PricingView = lazy(() => import('../views/Pricing'));
const TrackerView = lazy(() => import('../views/Tracker'));
const AuditView = lazy(() => import('../views/AuditDashboard'));
const MissionView = lazy(() => import('../views/MissionControl'));
const OnboardingView = lazy(() => import('../views/Onboarding'));
const StandardsBrowserView = lazy(() => import('../views/StandardsBrowser'));

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [isAuthResolving, setIsAuthResolving] = useState(true);
  const [currentView, setCurrentView] = useState('landing');
  const [infraError, setInfraError] = useState<string | null>(null);
  const [showRuntimeDebug, setShowRuntimeDebug] = useState(false);
  const [bypassHandshake, setBypassHandshake] = useState(false);
  const initStarted = useRef(false);
  
  const [documents, setDocuments] = useState<Document[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [healthStatus, setHealthStatus] = useState({ status: 'checking', message: 'Syncing...' });
  const [brain, setBrain] = useState<NeuralBrain>({
    id: 'system-brain', masterPrompt: DEFAULT_MASTER_PROMPT,
    bloomRules: DEFAULT_BLOOM_RULES, version: 1, isActive: true,
    updatedAt: '2024-01-01T00:00:00.000Z'
  });

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isViewHydrated, setIsViewHydrated] = useState(false);

  useEffect(() => {
    // Consolidated client-side hydration for theme and saved view
    try {
      const savedTheme = localStorage.getItem('theme') as 'light' | 'dark';
      if (savedTheme) {
        setTheme(savedTheme);
        document.documentElement.classList.toggle('dark', savedTheme === 'dark');
      }

      // Try cookie first, then localStorage
      const cookies = document.cookie.split('; ');
      const cookie = cookies.find(c => c.startsWith('currentView='));
      let saved = cookie ? decodeURIComponent(cookie.split('=')[1]) : null;
      if (!saved) {
        saved = localStorage.getItem('currentView');
      }
      if (saved && saved !== 'login' && saved !== 'landing') {
        setCurrentView(saved);
      }
    } catch (e) {}

    setIsViewHydrated(true);
  }, []);

  useEffect(() => {
    if (isViewHydrated && currentView !== 'login' && currentView !== 'landing') {
      try {
        localStorage.setItem('currentView', currentView);
        const expires = new Date();
        expires.setFullYear(expires.getFullYear() + 1);
        document.cookie = `currentView=${encodeURIComponent(currentView)}; expires=${expires.toUTCString()}; path=/; SameSite=None; Secure`;
      } catch (e) {}
    }
  }, [currentView, isViewHydrated]);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  const fetchAppData = useCallback(async (userId: string, email?: string, providedSession?: any) => {
    getSupabaseHealth().then(setHealthStatus);
    
    // 1. Fetch Brain / System Prompt from DB
    const currentSession = providedSession || (await supabase.auth.getSession()).data.session;
    if (currentSession) {
      fetch('/api/brain/get', {
        headers: { 'Authorization': `Bearer ${currentSession.access_token}` }
      })
      .then(res => res.json())
      .then(data => {
        if (data.brain) {
          setBrain({
            id: data.brain.id,
            masterPrompt: data.brain.master_prompt,
            bloomRules: DEFAULT_BLOOM_RULES,
            version: data.brain.version || 1,
            isActive: data.brain.is_active,
            updatedAt: data.brain.updated_at
          });
        }
      })
      .catch(e => console.error("Neural Brain Fetch Error:", e));
    }

    // 2. Fetch Profile
    getOrCreateProfile(userId, email).then(profile => {
      if (profile) {
        const mappedProfile: UserProfile = {
          id: profile.id, email: profile.email || '',
          name: profile.name || email?.split('@')[0] || 'Educator',
          role: profile.role as UserRole, plan: profile.plan as SubscriptionPlan,
          queriesUsed: profile.queries_used || 0, queriesLimit: profile.queries_limit || 30,
          generationCount: profile.generation_count || 0, successRate: profile.success_rate || 0,
          onboarding_completed: profile.onboarding_completed
        };
        setUserProfile(mappedProfile);
        
        if (!profile.onboarding_completed) {
          setCurrentView('onboarding');
        }
      }
    });

    // 3. Fetch Documents
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
            createdAt: d.created_at, isApproved: d.is_approved,
            documentSummary: d.document_summary,
            errorMessage: d.error_message
          })));
        }
      });
  }, []);

  useEffect(() => {
    if (!isViewHydrated) return;
    
    let authSubscription: { unsubscribe: () => void } | null = null;

    const initializeAuth = async () => {
      try {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, currentSession) => {
          console.log(`📡 [Auth] Event: ${event}`, currentSession ? "Session Active" : "No Session");
          
          if (currentSession) {
            setSession(currentSession);
            fetchAppData(currentSession.user.id, currentSession.user.email, currentSession);
            setCurrentView(prev => (prev === 'landing' || prev === 'login') ? 'dashboard' : prev);
          } else if (event === 'SIGNED_OUT') {
            console.warn("📡 [Auth] Explicit SIGNED_OUT event received");
            setSession(null);
            setCurrentView('landing');
            localStorage.removeItem('currentView');
          } else if (event === 'INITIAL_SESSION' && !currentSession) {
            setSession((prev: any) => prev || null);
          }
        });
        authSubscription = subscription;

        const { data: { session: existingSession } } = await supabase.auth.getSession();
        if (existingSession) {
          console.log("📡 [Auth] Existing session found via getSession");
          setSession(existingSession);
          fetchAppData(existingSession.user.id, existingSession.user.email, existingSession);
          setCurrentView(prev => (prev === 'landing' || prev === 'login') ? 'dashboard' : prev);
        }
      } catch (err) {
        console.error('📡 [System] Auth initialization failed:', err);
      } finally {
        setIsAuthResolving(false);
      }
    };

    if (!initStarted.current) {
      initStarted.current = true;
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        (window as any).requestIdleCallback(() => initializeAuth(), { timeout: 800 });
      } else {
        setTimeout(initializeAuth, 50);
      }
    }

    return () => {
      if (authSubscription) authSubscription.unsubscribe();
    };
  }, [fetchAppData, isViewHydrated]);

  // Only show full-screen auth resolving if the user is trying to view a protected workspace view
  const isProtectedView = currentView !== 'landing' && currentView !== 'login';
  if (isAuthResolving && isProtectedView && !bypassHandshake) return (
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
    if (currentView === 'login') {
      return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950"><Loader2 className="animate-spin text-indigo-600" size={32} /></div>}>
          <Login onSession={setSession} onBack={() => setCurrentView('landing')} />
        </Suspense>
      );
    }
    return <Landing onStart={() => setCurrentView('login')} />;
  }

  const safeProfile = userProfile || {
    id: session.user.id, email: session.user.email || '', name: 'Educator',
    role: UserRole.TEACHER, plan: SubscriptionPlan.FREE, queriesUsed: 0, queriesLimit: 30,
    generationCount: 0, successRate: 0
  };

  return (
    <div className={`flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden print:h-auto print:overflow-visible ${theme === 'dark' ? 'dark' : ''}`}>
      {isSidebarOpen && <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[90] lg:hidden" onClick={() => setIsSidebarOpen(false)} />}
      <div className={`fixed inset-y-0 left-0 z-[100] transform lg:relative lg:translate-x-0 transition-all duration-300 ease-in-out no-print ${isSidebarOpen ? 'translate-x-0 w-72' : '-translate-x-full lg:translate-x-0'} ${isCollapsed ? 'lg:w-20' : 'lg:w-64'}`}>
        <Suspense fallback={<div className="w-64 h-full bg-white dark:bg-slate-900 border-r dark:border-slate-800" />}>
          <Sidebar currentView={currentView} onViewChange={v => { setCurrentView(v); setIsSidebarOpen(false); }} userProfile={safeProfile} isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} theme={theme} toggleTheme={toggleTheme} />
        </Suspense>
      </div>
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden print:overflow-visible">
        {safeProfile.role === UserRole.APP_ADMIN && <ProviderStatusBar />}
        <header className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 border-b dark:border-slate-800 shadow-sm z-40 no-print">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 text-slate-600 hover:bg-slate-50 rounded-xl"><Menu size={24} /></button>
            <span className="font-black text-indigo-950 dark:text-white tracking-tight text-sm uppercase">{currentView.replace('-', ' ')}</span>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar print:overflow-visible print:p-0">
          <div className="max-w-6xl mx-auto w-full">
            <Suspense fallback={<div className="flex justify-center p-20"><Loader2 className="animate-spin text-indigo-600" size={32} /></div>}>
              {(() => {
                const props = { 
                  user: safeProfile, documents, onProfileUpdate: setUserProfile, health: healthStatus as any, 
                  onCheckHealth: () => getSupabaseHealth().then(setHealthStatus).then(() => true), onViewChange: setCurrentView 
                };
                switch (currentView) {
                  case 'dashboard': return <Dashboard {...props} />;
                  case 'chat': return <ChatView user={safeProfile} brain={brain} documents={documents} onQuery={() => setUserProfile(p => p ? {...p, queriesUsed: p.queriesUsed + 1} : null)} canQuery={safeProfile.queriesUsed < safeProfile.queriesLimit} />;
                  case 'documents': return <DocumentsView documents={documents} userProfile={safeProfile} onAddDocument={async () => fetchAppData(safeProfile.id, safeProfile.email)} onUpdateDocument={async(id, u) => setDocuments(d => d.map(x => x.id === id ? {...x,...u}:x))} onDeleteDocument={async (id) => setDocuments(d => d.filter(x => x.id !== id))} isConnected={healthStatus.status === 'connected'} />;
                  case 'tools': return <ToolsView user={safeProfile} brain={brain} documents={documents} onQuery={() => setUserProfile(p => p ? {...p, queriesUsed: p.queriesUsed + 1} : null)} canQuery={safeProfile.queriesUsed < safeProfile.queriesLimit} onViewChange={setCurrentView} />;
                  case 'tracker': return <TrackerView user={safeProfile} documents={documents} />;
                  case 'standards': return <StandardsBrowserView user={safeProfile} documents={documents} />;
                  case 'onboarding': return <OnboardingView user={safeProfile} onComplete={(p) => { setUserProfile(p); setCurrentView('dashboard'); }} />;
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
