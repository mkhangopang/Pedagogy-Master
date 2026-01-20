'use client';

import React, { useState, useEffect, Suspense, lazy, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured, getSupabaseHealth, getOrCreateProfile, getCredentials } from '../lib/supabase';
import Sidebar from '../components/Sidebar';
import Dashboard from '../views/Dashboard';
import Login from '../views/Login';
import { ProviderStatusBar } from '../components/ProviderStatusBar';
import { UserRole, SubscriptionPlan, UserProfile, NeuralBrain, Document } from '../types';
import { DEFAULT_MASTER_PROMPT, DEFAULT_BLOOM_RULES } from '../constants';
import { paymentService } from '../services/paymentService';
import { Loader2, Menu, Cpu, RefreshCw, AlertTriangle, ShieldCheck } from 'lucide-react';

const DocumentsView = lazy(() => import('../views/Documents'));
const ToolsView = lazy(() => import('../views/Tools'));
const BrainControlView = lazy(() => import('../views/BrainControl'));
const PricingView = lazy(() => import('../views/Pricing'));
const TrackerView = lazy(() => import('../views/Tracker'));

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [showRescueOptions, setShowRescueOptions] = useState(false);
  
  const [healthStatus, setHealthStatus] = useState<{status: string, message: string}>({ 
    status: 'checking', 
    message: 'Initializing neural grid...' 
  });

  const initializationRef = useRef(false);
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
    try {
      const health = await getSupabaseHealth();
      setHealthStatus(health);
      return health.status === 'connected';
    } catch (e) {
      setHealthStatus({ status: 'disconnected', message: 'Handshake timeout' });
      return false;
    }
  }, []);

  const fetchProfileAndDocs = useCallback(async (userId: string, email: string | undefined) => {
    setIsBackgroundSyncing(true);
    try {
      await checkDb();
      const profile: any = await getOrCreateProfile(userId, email);
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
      }

      const { data: docs } = await supabase
        .from('documents')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

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
    } catch (e: any) {
      console.warn("⚠️ [Sync] Handshake jitter:", e.message);
    } finally {
      setIsBackgroundSyncing(false);
      setLoading(false);
    }
  }, [checkDb]);

  useEffect(() => {
    if (initializationRef.current) return;
    initializationRef.current = true;

    // RESCUE WATCHDOG: Show recovery options if handshake stalls
    const watchdogTimer = setTimeout(() => {
      if (loading && !session) setShowRescueOptions(true);
    }, 10000);

    const initialize = async () => {
      let retries = 0;
      const maxRetries = 12; // Poll for 12 seconds to allow Vercel hydration

      const bootLoop = async () => {
        if (isSupabaseConfigured()) {
          try {
            paymentService.init();
            await checkDb();
            const { data: { session: initialSession } } = await supabase.auth.getSession();
            if (initialSession) {
              setSession(initialSession);
              await fetchProfileAndDocs(initialSession.user.id, initialSession.user.email);
            } else {
              setLoading(false);
            }
            clearTimeout(watchdogTimer);
          } catch (e: any) {
            setBootError(e.message || "Primary node unreachable.");
            setLoading(false);
          }
        } else if (retries < maxRetries) {
          retries++;
          console.debug(`📡 [System] Handshake Attempt ${retries}/12...`);
          setTimeout(bootLoop, 1000); 
        } else {
          const { url, key } = getCredentials();
          setBootError(`Fatal: Critical keys missing in browser bundle. URL Detected: ${!!url}, Key Detected: ${!!key}. Ensure NEXT_PUBLIC_ prefixes are correct in Vercel.`);
          setLoading(false);
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

    return () => {
      clearTimeout(watchdogTimer);
      if (subscription) subscription.unsubscribe();
    };
  }, [checkDb, fetchProfileAndDocs]);

  const handleUpdateDocument = async (id: string, updates: Partial<Document>) => {
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
    try {
      const dbUpdates: any = {};
      if (updates.status) dbUpdates.status = updates.status;
      if (updates.geminiProcessed !== undefined) dbUpdates.rag_indexed = updates.geminiProcessed;
      if (updates.isSelected !== undefined) dbUpdates.is_selected = updates.isSelected;
      await supabase.from('documents').update(dbUpdates).eq('id', id);
    } catch (e) {
      console.error("Sync failure:", e);
    }
  };

  if (loading && !session) return (
    <div className="h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 space-y-8 px-6 text-center">
      <div className="relative">
        <div className="absolute inset-0 bg-indigo-500 rounded-full blur-3xl opacity-20 animate-pulse" />
        <div className="relative bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl border border-slate-100 dark:border-white/5">
          <Cpu className="text-indigo-600 w-16 h-16 animate-spin-slow" />
        </div>
      </div>
      <div className="space-y-4 max-w-sm">
        <p className="text-indigo-600 font-black uppercase tracking-[0.4em] text-xs">Neural Handshake</p>
        <p className="text-slate-400 font-medium text-sm italic">Synchronizing institutional nodes...</p>
        
        {showRescueOptions && (
          <div className="pt-6 animate-in fade-in slide-in-from-bottom-2 duration-500 space-y-3">
             <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-dashed border-amber-200 dark:border-amber-900/30 rounded-2xl">
               <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase leading-tight mb-1">Latency Detected</p>
               <p className="text-[9px] text-slate-500">The browser is still waiting for environment variables from Vercel.</p>
             </div>
             <button onClick={() => setLoading(false)} className="w-full py-3 bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-900 transition-all">Bypass Handshake (Recovery Mode)</button>
          </div>
        )}
      </div>
    </div>
  );

  if (bootError && !session) return (
    <div className="h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
       <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] shadow-2xl border border-rose-100 dark:border-rose-900/20 max-w-md text-center space-y-6">
          <div className="w-20 h-20 bg-rose-50 dark:bg-rose-950/30 rounded-3xl flex items-center justify-center mx-auto text-rose-500">
             <AlertTriangle size={40} />
          </div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Sync Failed</h2>
          <div className="p-5 bg-slate-50 dark:bg-black/40 rounded-2xl border border-slate-100 dark:border-white/5 text-left">
            <p className="text-slate-500 text-[11px] leading-relaxed font-mono break-words">{bootError}</p>
          </div>
          <button onClick={() => window.location.reload()} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-xl hover:bg-indigo-700 transition-all uppercase tracking-widest text-xs">Retry Handshake</button>
          <p className="text-[9px] text-slate-400 font-bold uppercase">TIP: Ensure you redeployed with "Clear Cache" in Vercel after adding keys.</p>
       </div>
    </div>
  );
  
  if (!session) return <Login onSession={() => {}} />;

  return (
    <div className={`flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden text-slate-900 dark:text-slate-100 ${theme === 'dark' ? 'dark' : ''}`}>
      
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[90] lg:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      <div className={`
        fixed inset-y-0 left-0 z-[100] transform lg:relative lg:translate-x-0 transition-all duration-300 ease-in-out
        ${isSidebarOpen ? 'translate-x-0 w-72' : '-translate-x-full lg:translate-x-0'}
        ${isCollapsed ? 'lg:w-20' : 'lg:w-64'}
      `}>
        <Sidebar 
          currentView={currentView} 
          onViewChange={(v) => { setCurrentView(v); setIsSidebarOpen(false); }} 
          userProfile={userProfile!} 
          isCollapsed={isCollapsed} 
          setIsCollapsed={(c) => { setIsCollapsed(c); localStorage.setItem('sidebar_collapsed', String(c)); }} 
          onClose={() => setIsSidebarOpen(false)}
          theme={theme} 
          toggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')} 
        />
      </div>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {userProfile?.role === UserRole.APP_ADMIN && <ProviderStatusBar />}
        
        {isBackgroundSyncing && (
          <div className="bg-indigo-600 text-white px-4 py-1 flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-widest z-50">
            <RefreshCw size={10} className="animate-spin" />
            <span>Neural Grid Syncing...</span>
          </div>
        )}

        <header className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 border-b dark:border-slate-800 shadow-sm z-40">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-50 rounded-xl">
              <Menu size={24} />
            </button>
            <span className="font-bold text-indigo-950 dark:text-white tracking-tight flex items-center gap-2 text-sm uppercase">
               {currentView.replace('-', ' ')}
            </span>
          </div>
          
          <div className="flex items-center gap-3">
             <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 dark:bg-slate-800 rounded-full border dark:border-white/5">
                <div className={`w-2 h-2 rounded-full ${isActuallyConnected ? 'bg-emerald-50 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse' : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'}`} />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{isActuallyConnected ? 'Node: Linked' : 'Node: Offline'}</span>
             </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar bg-slate-50 dark:bg-slate-950">
          <div className="max-w-6xl mx-auto w-full">
            <Suspense fallback={<div className="flex flex-col items-center justify-center p-20"><Loader2 className="animate-spin text-indigo-600" size={32} /></div>}>
              {(() => {
                if (!userProfile) return null;
                const props = { user: userProfile, documents, onProfileUpdate: setUserProfile, health: healthStatus, onCheckHealth: checkDb };
                switch (currentView) {
                  case 'dashboard': return <Dashboard {...props} />;
                  case 'documents': return <DocumentsView documents={documents} userProfile={userProfile} onAddDocument={async () => fetchProfileAndDocs(userProfile.id, userProfile.email)} onUpdateDocument={handleUpdateDocument} onDeleteDocument={async (id) => setDocuments(d => d.filter(x => x.id !== id))} isConnected={isActuallyConnected} />;
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