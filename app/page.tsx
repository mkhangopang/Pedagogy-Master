'use client';

import React, { useState, useEffect, Suspense, lazy, useCallback } from 'react';
import { supabase, isSupabaseConfigured, getSupabaseHealth, getOrCreateProfile } from '../lib/supabase';
import Sidebar from '../components/Sidebar';
import Dashboard from '../views/Dashboard';
import Login from '../views/Login';
import Policy from '../views/Policy';
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
const AuditView = lazy(() => import('../views/AuditDashboard'));
const MissionView = lazy(() => import('../views/MissionControl'));

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Initializing Core Infrastructure...');
  const [currentView, setCurrentView] = useState('dashboard');
  
  // Data States
  const [documents, setDocuments] = useState<Document[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [brain, setBrain] = useState<NeuralBrain>({
    id: 'system-brain',
    masterPrompt: DEFAULT_MASTER_PROMPT,
    bloomRules: DEFAULT_BLOOM_RULES,
    version: 1,
    isActive: true,
    updatedAt: new Date().toISOString()
  });

  // UI States
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [healthStatus, setHealthStatus] = useState({ status: 'checking', message: 'Connecting...' });

  const checkDb = useCallback(async () => {
    try {
      const health: any = await getSupabaseHealth();
      setHealthStatus(health);
      return health.status === 'connected';
    } catch {
      setHealthStatus({ status: 'disconnected', message: 'Link Lost' });
      return false;
    }
  }, []);

  const fetchContextualData = useCallback(async (userId: string) => {
    try {
      // Load background data without blocking main UI
      const [docsResponse, brainResponse] = await Promise.all([
        supabase.from('documents').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        supabase.from('neural_brain').select('*').eq('is_active', true).order('version', { ascending: false }).limit(1).maybeSingle()
      ]);

      if (docsResponse.data) {
        setDocuments(docsResponse.data.map(d => ({
          id: d.id, userId: d.user_id, name: d.name, status: d.status as any,
          curriculumName: d.curriculum_name || d.name, authority: d.authority || 'General',
          subject: d.subject || 'General', gradeLevel: d.grade_level || 'Auto',
          versionYear: d.version_year || '2024', version: d.version || 1,
          geminiProcessed: d.rag_indexed, isSelected: d.is_selected,
          sourceType: d.source_type as any || 'markdown', isApproved: d.is_approved || false,
          extractedText: d.extracted_text, createdAt: d.created_at
        })));
      }

      if (brainResponse.data) {
        setBrain({
          id: brainResponse.data.id,
          masterPrompt: brainResponse.data.master_prompt,
          bloomRules: brainResponse.data.bloom_rules || DEFAULT_BLOOM_RULES,
          version: brainResponse.data.version,
          isActive: true,
          updatedAt: brainResponse.data.updated_at
        });
      }
    } catch (e) {
      console.warn("📡 [System] Contextual data lag.");
    }
  }, []);

  const initializeIdentity = useCallback(async (userId: string, email?: string) => {
    setLoadingMessage('Synchronizing Identity Node...');
    try {
      const profileData = await getOrCreateProfile(userId, email);
      if (profileData) {
        setUserProfile({
          id: profileData.id,
          name: profileData.name || email?.split('@')[0] || 'Educator',
          email: profileData.email || email || '',
          role: profileData.role as UserRole || UserRole.TEACHER,
          plan: profileData.plan as SubscriptionPlan || SubscriptionPlan.FREE,
          queriesUsed: profileData.queries_used || 0,
          queriesLimit: profileData.queries_limit || 30,
          generationCount: profileData.generation_count || 0,
          successRate: profileData.success_rate || 0,
          editPatterns: profileData.edit_patterns || { avgLengthChange: 0, examplesCount: 0, structureModifications: 0 }
        });
      }
      // Release UI block immediately after profile is ready
      setLoading(false);
      // Kick off background tasks
      checkDb();
      fetchContextualData(userId);
    } catch (e) {
      console.error("Fatal initialization error:", e);
      setLoading(false); // Safety fallback
    }
  }, [checkDb, fetchContextualData]);

  useEffect(() => {
    const bootstrap = async () => {
      paymentService.init();
      const { data: { session: initialSession } } = await supabase.auth.getSession();
      
      if (initialSession) {
        setSession(initialSession);
        await initializeIdentity(initialSession.user.id, initialSession.user.email);
      } else {
        setLoading(false);
      }
    };

    bootstrap();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (currentSession) {
          setSession(currentSession);
          await initializeIdentity(currentSession.user.id, currentSession.user.email);
        }
      } else if (event === 'SIGNED_OUT') {
        setSession(null);
        setUserProfile(null);
        setDocuments([]);
        setLoading(false);
      }
    });

    return () => subscription?.unsubscribe();
  }, [initializeIdentity]);

  if (loading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-6 text-center">
      <div className="relative mb-12">
        <div className="absolute inset-0 bg-indigo-500 rounded-full blur-[100px] opacity-10 animate-pulse" />
        <div className="relative bg-white dark:bg-slate-900 p-10 rounded-[3rem] shadow-2xl border dark:border-white/5 flex flex-col items-center justify-center min-w-[200px] min-h-[200px]">
          <Cpu className="text-indigo-600 w-16 h-16 animate-spin-slow mb-6" />
          <div className="flex gap-1.5">
             <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.3s]" />
             <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.15s]" />
             <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce" />
          </div>
        </div>
      </div>
      <p className="text-indigo-600 font-black uppercase tracking-[0.4em] text-[10px] mb-2">Neural Handshake</p>
      <p className="text-slate-400 font-bold text-xs italic animate-pulse px-10 max-w-sm">{loadingMessage}</p>
    </div>
  );
  
  if (!session) return <Login onSession={() => {}} />;

  const isActuallyConnected = healthStatus.status === 'connected';
  const isChecking = healthStatus.status === 'checking';

  return (
    <div className={`flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden text-slate-900 dark:text-slate-100 ${theme === 'dark' ? 'dark' : ''}`}>
      {isSidebarOpen && <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[90] lg:hidden" onClick={() => setIsSidebarOpen(false)} />}
      <div className={`fixed inset-y-0 left-0 z-[100] transform lg:relative lg:translate-x-0 transition-all duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0 w-72' : '-translate-x-full lg:translate-x-0'} ${isCollapsed ? 'lg:w-20' : 'lg:w-64'}`}>
        <Sidebar currentView={currentView} onViewChange={(v) => { setCurrentView(v); setIsSidebarOpen(false); }} userProfile={userProfile!} isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} onClose={() => setIsSidebarOpen(false)} theme={theme} toggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')} />
      </div>
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {userProfile?.role === UserRole.APP_ADMIN && <ProviderStatusBar />}
        <header className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 border-b dark:border-slate-800 shadow-sm z-40">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-50 rounded-xl"><Menu size={24} /></button>
            <span className="font-black text-indigo-950 dark:text-white tracking-tight text-sm uppercase">{currentView.replace('-', ' ')}</span>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1 bg-slate-50 dark:bg-slate-800 rounded-full border dark:border-white/5`}>
            <div className={`w-2 h-2 rounded-full ${isChecking ? 'bg-amber-400 animate-pulse' : isActuallyConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500'}`} />
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-tight">
              {isChecking ? 'Syncing...' : isActuallyConnected ? 'Linked' : 'Offline'}
            </span>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar bg-slate-50 dark:bg-slate-950">
          <div className="max-w-6xl mx-auto w-full">
            <Suspense fallback={<div className="flex flex-col items-center justify-center p-20"><Loader2 className="animate-spin text-indigo-600" size={32} /></div>}>
              {(() => {
                const props = { user: userProfile!, documents, onProfileUpdate: setUserProfile, health: healthStatus as any, onCheckHealth: checkDb };
                switch (currentView) {
                  case 'dashboard': return <Dashboard {...props} />;
                  case 'documents': return <DocumentsView documents={documents} userProfile={userProfile!} onAddDocument={async () => fetchContextualData(userProfile!.id)} onUpdateDocument={async(id, u) => setDocuments(d => d.map(x => x.id === id ? {...x,...u}:x))} onDeleteDocument={async (id) => setDocuments(d => d.filter(x => x.id !== id))} isConnected={isActuallyConnected} />;
                  case 'tools': return <ToolsView user={userProfile!} brain={brain} documents={documents} onQuery={() => {}} canQuery={userProfile!.queriesUsed < userProfile!.queriesLimit} />;
                  case 'tracker': return <TrackerView user={userProfile!} documents={documents} />;
                  case 'brain': return userProfile?.role === UserRole.APP_ADMIN ? <BrainControlView brain={brain} onUpdate={setBrain} /> : <Dashboard {...props} />;
                  case 'audit': return userProfile?.role === UserRole.APP_ADMIN ? <AuditView user={userProfile!} /> : <Dashboard {...props} />;
                  case 'mission': return userProfile?.role === UserRole.APP_ADMIN ? <MissionView /> : <Dashboard {...props} />;
                  case 'pricing': return <PricingView currentPlan={userProfile!.plan} onUpgrade={() => setCurrentView('dashboard')} onShowPolicy={() => setCurrentView('policy')} />;
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