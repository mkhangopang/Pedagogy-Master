'use client';

import React, { useState, useEffect, Suspense, lazy, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured, getSupabaseHealth, getOrCreateProfile } from '../lib/supabase';
import Sidebar from '../components/Sidebar';
import Dashboard from '../views/Dashboard';
import Login from '../views/Login';
import { ProviderStatusBar } from '../components/ProviderStatusBar';
import { UserRole, SubscriptionPlan, UserProfile, NeuralBrain, Document } from '../types';
import { DEFAULT_MASTER_PROMPT, DEFAULT_BLOOM_RULES } from '../constants';
import { paymentService } from '../services/paymentService';
import { Loader2, Menu, Cpu, RefreshCw, Terminal, Zap, AlertTriangle } from 'lucide-react';

const DocumentsView = lazy(() => import('../views/Documents'));
const ToolsView = lazy(() => import('../views/Tools'));
const BrainControlView = lazy(() => import('../views/BrainControl'));
const PricingView = lazy(() => import('../views/Pricing'));
const TrackerView = lazy(() => import('../views/Tracker'));

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [bootAttempt, setBootAttempt] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('Initializing Core Infrastructure...');
  const [currentView, setCurrentView] = useState('dashboard');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  
  const [healthStatus, setHealthStatus] = useState({ status: 'checking', message: 'Connecting to neural grid...' });
  const isActuallyConnected = healthStatus.status === 'connected';

  const [brain, setBrain] = useState<NeuralBrain>({
    id: 'system-brain',
    masterPrompt: DEFAULT_MASTER_PROMPT,
    bloomRules: DEFAULT_BLOOM_RULES,
    version: 1,
    isActive: true,
    updatedAt: new Date().toISOString()
  });

  const checkDb = useCallback(async () => {
    const health = await getSupabaseHealth();
    setHealthStatus(health as any);
    return health.status === 'connected';
  }, []);

  const fetchProfileAndDocs = useCallback(async (userId: string, email: string | undefined) => {
    setLoadingMessage('Hydrating Identity Nodes...');
    try {
      // Parallel execution for faster boot
      const profilePromise = getOrCreateProfile(userId, email);
      const docsPromise = supabase.from('documents').select('*').eq('user_id', userId).order('created_at', { ascending: false });
      
      // Watchdog for profile sync (8 seconds timeout for better UX)
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Hydration Timeout')), 8000)
      );

      const profile: any = await Promise.race([profilePromise, timeoutPromise]).catch(err => {
        console.warn("📡 [System] Hydration lag detected, using adaptive local state.", err);
        return null;
      });

      if (profile) {
        setUserProfile({
          id: profile.id,
          name: profile.name || email?.split('@')[0] || 'Educator',
          email: profile.email || email || '',
          role: profile.role as UserRole || UserRole.TEACHER,
          plan: profile.plan as SubscriptionPlan || SubscriptionPlan.FREE,
          queriesUsed: profile.queries_used || 0,
          queriesLimit: profile.queries_limit || 30,
          generationCount: profile.generation_count || 0,
          successRate: profile.success_rate || 0,
          editPatterns: profile.edit_patterns || { avgLengthChange: 0, examplesCount: 0, structureModifications: 0 }
        });
      } else {
        // Fallback for timeout or failure
        setUserProfile({
          id: userId,
          name: email?.split('@')[0] || 'Educator',
          email: email || '',
          role: UserRole.TEACHER,
          plan: SubscriptionPlan.FREE,
          queriesUsed: 0,
          queriesLimit: 30,
          generationCount: 0,
          successRate: 0,
          editPatterns: { avgLengthChange: 0, examplesCount: 0, structureModifications: 0 }
        });
      }

      setLoadingMessage('Loading Curriculum Vault...');
      const { data: docs } = await docsPromise;
      if (docs) {
        setDocuments(docs.map(d => ({
          id: d.id,
          userId: d.user_id,
          name: d.name,
          status: d.status as any,
          curriculumName: d.curriculum_name || d.name,
          authority: d.authority || 'General',
          subject: d.subject || 'General',
          gradeLevel: d.grade_level || 'Auto',
          versionYear: d.version_year || '2024',
          version: d.version || 1,
          geminiProcessed: d.rag_indexed,
          isSelected: d.is_selected,
          sourceType: d.source_type as any || 'markdown',
          isApproved: d.is_approved || false,
          createdAt: d.created_at
        })));
      }
    } catch (e) {
      console.error("❌ [System] Fatal Infrastructure Sync:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialize = async () => {
      let attempts = 0;
      const bootLoop = async () => {
        setBootAttempt(attempts);
        // Faster timeout logic: proceed if configured OR after 4 seconds total
        if (isSupabaseConfigured() || attempts > 3) {
          setLoadingMessage('Authenticating Session...');
          paymentService.init();
          await checkDb();
          const { data: { session: initialSession } } = await supabase.auth.getSession();
          if (initialSession) {
            setSession(initialSession);
            await fetchProfileAndDocs(initialSession.user.id, initialSession.user.email);
          } else {
            setLoading(false);
          }
        } else {
          attempts++;
          setLoadingMessage(`Awaiting Cloud Handshake... (${attempts})`);
          setTimeout(bootLoop, 1000);
        }
      };
      bootLoop();
    };

    initialize();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (currentSession) {
          setSession(currentSession);
          await fetchProfileAndDocs(currentSession.user.id, currentSession.user.email);
        }
      } else if (event === 'SIGNED_OUT') {
        setSession(null);
        setUserProfile(null);
        setDocuments([]);
        setLoading(false);
      }
    });

    return () => subscription?.unsubscribe();
  }, [checkDb, fetchProfileAndDocs]);

  if (loading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 space-y-8 px-6 text-center">
      <div className="relative">
        <div className="absolute inset-0 bg-indigo-500 rounded-full blur-3xl opacity-20 animate-pulse" />
        <div className="relative bg-white dark:bg-slate-900 p-10 rounded-[3rem] shadow-2xl border dark:border-white/5">
          <Cpu className="text-indigo-600 w-16 h-16 animate-spin-slow" />
        </div>
      </div>
      <div className="space-y-4 max-w-sm">
        <p className="text-indigo-600 font-black uppercase tracking-[0.4em] text-xs">Neural Sync</p>
        <p className="text-slate-400 font-medium text-sm italic min-h-[1.5rem]">{loadingMessage}</p>
        <div className="w-48 h-1 bg-slate-200 dark:bg-slate-800 rounded-full mx-auto overflow-hidden">
           <div className="h-full bg-indigo-600 transition-all duration-1000" style={{ width: `${Math.min(100, (bootAttempt / 4) * 100)}%` }} />
        </div>
        {(bootAttempt > 3 || loadingMessage.includes('Timeout')) && (
           <div className="pt-6 animate-in fade-in slide-in-from-bottom-2">
             <button 
               onClick={() => setLoading(false)} 
               className="flex items-center gap-2 mx-auto px-4 py-2 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-[10px] font-bold uppercase tracking-widest border border-amber-200 dark:border-amber-900 rounded-xl hover:bg-amber-100 transition-all shadow-sm"
             >
               <AlertTriangle size={12} /> Force Enter Workspace
             </button>
             <p className="mt-2 text-[9px] text-slate-400 italic">Institutional sync is lagging. Using adaptive local nodes.</p>
           </div>
        )}
      </div>
    </div>
  );
  
  if (!session) return <Login onSession={() => {}} />;

  if (!userProfile) return (
    <div className="h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950">
      <Loader2 className="animate-spin text-indigo-600" size={32} />
      <p className="mt-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Constructing Workspace...</p>
    </div>
  );

  return (
    <div className={`flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden text-slate-900 dark:text-slate-100 ${theme === 'dark' ? 'dark' : ''}`}>
      
      {isSidebarOpen && <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[90] lg:hidden" onClick={() => setIsSidebarOpen(false)} />}

      <div className={`fixed inset-y-0 left-0 z-[100] transform lg:relative lg:translate-x-0 transition-all duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0 w-72' : '-translate-x-full lg:translate-x-0'} ${isCollapsed ? 'lg:w-20' : 'lg:w-64'}`}>
        <Sidebar 
          currentView={currentView} 
          onViewChange={(v) => { setCurrentView(v); setIsSidebarOpen(false); }} 
          userProfile={userProfile} 
          isCollapsed={isCollapsed} 
          setIsCollapsed={(c) => { setIsCollapsed(c); localStorage.setItem('sidebar_collapsed', String(c)); }} 
          onClose={() => setIsSidebarOpen(false)} 
          theme={theme} 
          toggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')} 
        />
      </div>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {userProfile.role === UserRole.APP_ADMIN && <ProviderStatusBar />}
        
        <header className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 border-b dark:border-slate-800 shadow-sm z-40">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-50 rounded-xl"><Menu size={24} /></button>
            <span className="font-black text-indigo-950 dark:text-white tracking-tight text-sm uppercase">{currentView.replace('-', ' ')}</span>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1 bg-slate-50 dark:bg-slate-800 rounded-full border dark:border-white/5`}>
            <div className={`w-2 h-2 rounded-full ${isActuallyConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{isActuallyConnected ? 'Linked' : 'Offline'}</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar bg-slate-50 dark:bg-slate-950">
          <div className="max-w-6xl mx-auto w-full">
            <Suspense fallback={<div className="flex flex-col items-center justify-center p-20"><Loader2 className="animate-spin text-indigo-600" size={32} /></div>}>
              {(() => {
                const props = { user: userProfile, documents, onProfileUpdate: setUserProfile, health: healthStatus as any, onCheckHealth: checkDb };
                switch (currentView) {
                  case 'dashboard': return <Dashboard {...props} />;
                  case 'documents': return <DocumentsView documents={documents} userProfile={userProfile} onAddDocument={async () => fetchProfileAndDocs(userProfile.id, userProfile.email)} onUpdateDocument={async(id, u) => setDocuments(d => d.map(x => x.id === id ? {...x,...u}:x))} onDeleteDocument={async (id) => setDocuments(d => d.filter(x => x.id !== id))} isConnected={isActuallyConnected} />;
                  case 'tools': return <ToolsView user={userProfile} brain={brain} documents={documents} onQuery={() => {}} canQuery={true} />;
                  case 'tracker': return <TrackerView user={userProfile} documents={documents} />;
                  case 'brain': return userProfile.role === UserRole.APP_ADMIN ? <BrainControlView brain={brain} onUpdate={setBrain} /> : <Dashboard {...props} />;
                  case 'pricing': return <PricingView currentPlan={userProfile.plan} onUpgrade={() => setCurrentView('dashboard')} />;
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