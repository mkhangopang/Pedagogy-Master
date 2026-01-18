'use client';

import React, { useState, useEffect, Suspense, lazy, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured, getSupabaseHealth, getOrCreateProfile, isAppAdmin } from '../lib/supabase';
import Sidebar from '../components/Sidebar';
import Dashboard from '../views/Dashboard';
import Login from '../views/Login';
import { ProviderStatusBar } from '../components/ProviderStatusBar';
import { UserRole, SubscriptionPlan, UserProfile, NeuralBrain, Document } from '../types';
import { DEFAULT_MASTER_PROMPT, DEFAULT_BLOOM_RULES, APP_NAME } from '../constants';
import { paymentService } from '../services/paymentService';
import { Loader2, Menu, Cpu, RefreshCw, X } from 'lucide-react';

const DocumentsView = lazy(() => import('../views/Documents'));
const ChatView = lazy(() => import('../views/Chat'));
const ToolsView = lazy(() => import('../views/Tools'));
const BrainControlView = lazy(() => import('../views/BrainControl'));
const PricingView = lazy(() => import('../views/Pricing'));
const TrackerView = lazy(() => import('../views/Tracker'));

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  
  // Responsive States
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Mobile Drawer
  const [isCollapsed, setIsCollapsed] = useState(false);     // Desktop Mini-mode
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  
  const [healthStatus, setHealthStatus] = useState<{status: string, message: string}>({ 
    status: 'checking', 
    message: 'Verifying systems...' 
  });

  const isActuallyConnected = healthStatus.status === 'connected';
  const initializationRef = useRef(false);
  
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
    setHealthStatus(health);
    return health.status === 'connected';
  }, []);

  // Handle Desktop Sidebar Persistence & Window Resizing
  useEffect(() => {
    const savedCollapse = localStorage.getItem('sidebar_collapsed');
    if (savedCollapse === 'true') setIsCollapsed(true);

    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsSidebarOpen(false); // Hide mobile drawer on desktop
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleToggleCollapse = (collapsed: boolean) => {
    setIsCollapsed(collapsed);
    localStorage.setItem('sidebar_collapsed', String(collapsed));
  };

  const fetchProfileAndDocs = useCallback(async (userId: string, email: string | undefined) => {
    if (!isSupabaseConfigured()) {
      setIsBackgroundSyncing(false);
      setLoading(false);
      return;
    }
    
    setIsBackgroundSyncing(true);
    const isSystemAdmin = isAppAdmin(email);
    
    const optimistic: UserProfile = {
      id: userId,
      name: email?.split('@')[0] || 'Educator',
      email: email || '',
      role: isSystemAdmin ? UserRole.APP_ADMIN : UserRole.TEACHER,
      plan: isSystemAdmin ? SubscriptionPlan.ENTERPRISE : SubscriptionPlan.FREE,
      queriesUsed: 0,
      queriesLimit: isSystemAdmin ? 999999 : 30,
      generationCount: 0,
      successRate: 0,
      editPatterns: { avgLengthChange: 0, examplesCount: 0, structureModifications: 0 }
    };

    if (!userProfile) setUserProfile(optimistic);

    try {
      const profile: any = await getOrCreateProfile(userId, email);
      if (profile) {
        setUserProfile({
          id: profile.id,
          name: profile.name || optimistic.name,
          email: profile.email || email || '',
          role: isSystemAdmin ? UserRole.APP_ADMIN : (profile.role as UserRole || UserRole.TEACHER),
          plan: isSystemAdmin ? SubscriptionPlan.ENTERPRISE : (profile.plan as SubscriptionPlan || SubscriptionPlan.FREE),
          queriesUsed: profile.queries_used || 0,
          queriesLimit: isSystemAdmin ? 999999 : (profile.queries_limit || 30),
          generationCount: profile.generation_count || 0,
          successRate: profile.success_rate || 0,
          editPatterns: profile.edit_patterns || optimistic.editPatterns
        });
      }

      const { data: docs, error: docError } = await supabase
        .from('documents')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (docError) {
        console.warn("Documents load failure:", docError.message);
      }

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
      console.warn("Background data sync degraded:", e);
    } finally {
      setIsBackgroundSyncing(false);
      setLoading(false);
    }
  }, [userProfile]);

  useEffect(() => {
    if (initializationRef.current) return;
    initializationRef.current = true;

    const initialize = async () => {
      try {
        paymentService.init();
        const connected = await checkDb();
        
        const bootTimeout = setTimeout(() => {
          setLoading(false);
        }, 5000);

        const { data: { session: initialSession }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) throw sessionError;

        if (initialSession) {
          setSession(initialSession);
          if (connected) {
            await fetchProfileAndDocs(initialSession.user.id, initialSession.user.email);
          }
        }
        
        clearTimeout(bootTimeout);
      } catch (e) {
        console.error("Auth boot sequence interrupted:", e);
      } finally {
        setLoading(false);
      }
    };

    initialize();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (currentSession) {
          setSession(currentSession);
          if (isSupabaseConfigured()) {
             await checkDb();
             await fetchProfileAndDocs(currentSession.user.id, currentSession.user.email);
          }
        }
        setLoading(false);
      } else if (event === 'SIGNED_OUT') {
        setSession(null);
        setUserProfile(null);
        setDocuments([]);
        setLoading(false);
      }
    });

    return () => {
      if (subscription) subscription.unsubscribe();
    };
  }, [checkDb, fetchProfileAndDocs]);

  const handleUpdateDocument = async (id: string, updates: Partial<Document>) => {
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
    if (isActuallyConnected && isSupabaseConfigured()) {
      const dbUpdates: any = {};
      if (updates.status) dbUpdates.status = updates.status;
      if (updates.geminiProcessed !== undefined) dbUpdates.rag_indexed = updates.geminiProcessed;
      if (updates.isSelected !== undefined) dbUpdates.is_selected = updates.isSelected;
      try {
        await supabase.from('documents').update(dbUpdates).eq('id', id);
      } catch (e) {
        console.error("Document update sync failed:", e);
      }
    }
  };

  if (loading && !session) return (
    <div className="h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 space-y-6">
      <div className="relative">
        <div className="absolute inset-0 bg-indigo-500 rounded-full blur-2xl opacity-20 animate-pulse" />
        <div className="relative bg-white dark:bg-slate-900 p-6 rounded-[2rem] shadow-2xl border border-slate-100 dark:border-white/5">
          <Cpu className="text-indigo-600 w-12 h-12 animate-spin-slow" />
        </div>
      </div>
      <div className="text-center space-y-2">
        <p className="text-indigo-600 font-black uppercase tracking-[0.3em] text-[10px]">Neural Handshake</p>
        <p className="text-slate-400 font-medium text-xs">Synchronizing environment nodes...</p>
      </div>
    </div>
  );
  
  if (!session) return <Login onSession={() => {}} />;

  return (
    <div className={`flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden text-slate-900 dark:text-slate-100 ${theme === 'dark' ? 'dark' : ''}`}>
      
      {/* MOBILE SIDEBAR OVERLAY */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[90] lg:hidden transition-opacity duration-300"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR CONTAINER */}
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
          setIsCollapsed={handleToggleCollapse} 
          onClose={() => setIsSidebarOpen(false)}
          theme={theme} 
          toggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')} 
        />
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {userProfile?.role === UserRole.APP_ADMIN && <ProviderStatusBar />}
        
        {isBackgroundSyncing && (
          <div className="bg-indigo-600 text-white px-4 py-1 flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-widest animate-in slide-in-from-top duration-300 z-50">
            <RefreshCw size={10} className="animate-spin" />
            <span>Neural Sync Active...</span>
          </div>
        )}

        {/* TOP NAVBAR (MOBILE & DESKTOP HEADER) */}
        <header className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 border-b dark:border-slate-800 shadow-sm z-40">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(true)} 
              className="lg:hidden p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-all"
              aria-label="Open Menu"
            >
              <Menu size={24} />
            </button>
            <span className="font-bold text-indigo-950 dark:text-white tracking-tight flex items-center gap-2">
              <span className="lg:hidden">{APP_NAME}</span>
              <span className="hidden lg:inline text-xs font-black uppercase tracking-widest text-slate-400">{currentView.replace('-', ' ')}</span>
            </span>
          </div>
          
          <div className="flex items-center gap-3">
             {/* User Quick Switch / Status or Desktop Tools could go here */}
             <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-slate-50 dark:bg-slate-800 rounded-full border dark:border-white/5">
                <div className={`w-2 h-2 rounded-full ${isActuallyConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Node: {isActuallyConnected ? 'Stable' : 'Offline'}</span>
             </div>
          </div>
        </header>

        {/* VIEW RENDERER */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar bg-slate-50 dark:bg-slate-950">
          <div className="max-w-6xl mx-auto w-full">
            <Suspense fallback={<div className="flex flex-col items-center justify-center p-20"><Loader2 className="animate-spin text-indigo-600" size={32} /></div>}>
              {(() => {
                if (!userProfile) return null;
                const props = { user: userProfile, documents, onProfileUpdate: setUserProfile, health: healthStatus, onCheckHealth: checkDb };
                switch (currentView) {
                  case 'dashboard': return <Dashboard {...props} />;
                  case 'documents': return <DocumentsView documents={documents} userProfile={userProfile} onAddDocument={async () => fetchProfileAndDocs(userProfile.id, userProfile.email)} onUpdateDocument={handleUpdateDocument} onDeleteDocument={async (id) => setDocuments(d => d.filter(x => x.id !== id))} isConnected={isActuallyConnected} />;
                  case 'chat': return <ChatView user={userProfile} brain={brain} documents={documents} onQuery={() => {}} canQuery={true} />;
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