
'use client';

import React, { useState, useEffect, Suspense, lazy, useCallback } from 'react';
import { supabase, isSupabaseConfigured, getSupabaseHealth } from '../lib/supabase.ts';
import Sidebar from '../components/Sidebar.tsx';
import Dashboard from '../views/Dashboard.tsx';
import Login from '../views/Login.tsx';
import { ProviderStatusBar } from '../components/ProviderStatusBar.tsx';
import { UserRole, SubscriptionPlan, UserProfile, NeuralBrain, Document } from '../types.ts';
import { DEFAULT_MASTER_PROMPT, DEFAULT_BLOOM_RULES, APP_NAME, ADMIN_EMAILS } from '../constants.ts';
import { paymentService } from '../services/paymentService.ts';
import { Loader2, Menu, AlertCircle, RefreshCw } from 'lucide-react';

const DocumentsView = lazy(() => import('../views/Documents.tsx'));
const ChatView = lazy(() => import('../views/Chat.tsx'));
const ToolsView = lazy(() => import('../views/Tools.tsx'));
const BrainControlView = lazy(() => import('../views/BrainControl.tsx'));
const PricingView = lazy(() => import('../views/Pricing.tsx'));
const TrackerView = lazy(() => import('../views/Tracker.tsx'));

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [healthStatus, setHealthStatus] = useState<{status: string, message: string}>({ 
    status: 'checking', 
    message: 'Verifying systems...' 
  });

  const isActuallyConnected = healthStatus.status === 'connected';

  useEffect(() => {
    const savedTheme = localStorage.getItem('pm-theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.classList.toggle('dark', savedTheme === 'dark');
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('pm-theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  const [brain, setBrain] = useState<NeuralBrain>({
    id: (typeof crypto !== 'undefined' && (crypto as any).randomUUID) 
      ? (crypto as any).randomUUID() 
      : Math.random().toString(36).substring(2),
    masterPrompt: DEFAULT_MASTER_PROMPT,
    bloomRules: DEFAULT_BLOOM_RULES,
    version: 1,
    isActive: true,
    updatedAt: new Date().toISOString()
  });

  const checkDb = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setHealthStatus({ status: 'disconnected', message: 'Cloud credentials missing.' });
      return false;
    }
    const health = await getSupabaseHealth();
    setHealthStatus(health);
    return health.status === 'connected';
  }, []);

  const fetchProfileAndDocs = useCallback(async (userId: string, email: string | undefined) => {
    if (!supabase) return;

    try {
      const isSystemAdmin = email && ADMIN_EMAILS.some(e => e.toLowerCase() === email.toLowerCase());
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      
      let activeProfile: UserProfile;

      // STRICT ROLE ENFORCEMENT: Only ADMIN_EMAILS get enterprise/admin by default
      const defaultRole = isSystemAdmin ? UserRole.APP_ADMIN : UserRole.TEACHER;
      const defaultPlan = isSystemAdmin ? SubscriptionPlan.ENTERPRISE : SubscriptionPlan.FREE;
      const defaultLimit = isSystemAdmin ? 999999 : 30;

      if (!profile) {
        activeProfile = {
          id: userId,
          name: email?.split('@')[0] || 'Educator',
          email: email || '',
          role: defaultRole,
          plan: defaultPlan,
          queriesUsed: 0,
          queriesLimit: defaultLimit,
          generationCount: 0,
          successRate: 0,
          editPatterns: { avgLengthChange: 0, examplesCount: 0, structureModifications: 0 }
        };
        
        supabase.from('profiles').insert([{
          id: userId,
          name: activeProfile.name,
          email: activeProfile.email,
          role: activeProfile.role,
          plan: activeProfile.plan,
          queries_used: 0,
          queries_limit: activeProfile.queriesLimit
        }]);
      } else {
        // Correct existing profiles if they aren't admins but somehow have enterprise access
        const needsCorrection = !isSystemAdmin && (profile.plan === SubscriptionPlan.ENTERPRISE || profile.role === UserRole.APP_ADMIN);
        
        activeProfile = {
          id: profile.id,
          name: profile.name || 'Educator',
          email: profile.email || '',
          role: isSystemAdmin ? UserRole.APP_ADMIN : (needsCorrection ? UserRole.TEACHER : profile.role as UserRole),
          plan: isSystemAdmin ? SubscriptionPlan.ENTERPRISE : (needsCorrection ? SubscriptionPlan.FREE : profile.plan as SubscriptionPlan),
          queriesUsed: profile.queries_used || 0,
          queriesLimit: isSystemAdmin ? 999999 : (needsCorrection ? 30 : profile.queries_limit || 30),
          gradeLevel: profile.grade_level || 'High School',
          subjectArea: profile.subject_area || 'General',
          teachingStyle: profile.teaching_style || 'balanced',
          pedagogicalApproach: profile.pedagogical_approach || 'direct-instruction',
          generationCount: profile.generation_count || 0,
          successRate: profile.success_rate || 0,
          editPatterns: profile.edit_patterns || { avgLengthChange: 0, examplesCount: 0, structureModifications: 0 }
        };

        if (needsCorrection) {
          await supabase.from('profiles').update({
            role: activeProfile.role,
            plan: activeProfile.plan,
            queries_limit: activeProfile.queriesLimit
          }).eq('id', userId);
        }
      }
      
      setUserProfile(activeProfile);

      const { data: docs } = await supabase.from('documents').select('*').eq('user_id', userId).order('created_at', { ascending: false });
      if (docs) {
        setDocuments(docs.map(d => ({
          id: d.id,
          userId: d.user_id,
          name: d.name,
          filePath: d.file_path,
          mimeType: d.mime_type,
          status: d.status as any,
          storageType: d.storage_type,
          isPublic: d.is_public,
          subject: d.subject || 'General',
          gradeLevel: d.grade_level || 'Auto',
          sloTags: d.slo_tags || [],
          createdAt: d.created_at
        })));
      }
    } catch (e: any) {}
  }, []);

  const fetchBrain = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data } = await supabase.from('neural_brain').select('*').eq('is_active', true).order('version', { ascending: false }).limit(1).maybeSingle();
      if (data) {
        setBrain({
          id: data.id,
          masterPrompt: data.master_prompt || DEFAULT_MASTER_PROMPT,
          bloomRules: data.bloom_rules || DEFAULT_BLOOM_RULES, 
          version: data.version || 1,
          isActive: data.is_active ?? true,
          updatedAt: data.updated_at || new Date().toISOString()
        });
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    paymentService.init();
    
    const initSession = async () => {
      if (!isSupabaseConfigured() || !supabase) {
        setLoading(false);
        return;
      }

      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession) {
          setSession(currentSession);
          checkDb();
          await Promise.allSettled([
            fetchProfileAndDocs(currentSession.user.id, currentSession.user.email),
            fetchBrain()
          ]);
        } else {
          checkDb();
        }
      } catch (err) {
      } finally {
        setLoading(false);
      }
    };

    initSession();

    let subscription: any = null;
    if (isSupabaseConfigured() && supabase) {
      const { data } = supabase.auth.onAuthStateChange(async (_event, currentSession) => {
        if (currentSession) {
          setSession(currentSession);
          fetchProfileAndDocs(currentSession.user.id, currentSession.user.email);
        } else {
          setSession(null);
          setUserProfile(null);
          setDocuments([]);
        }
      });
      subscription = data.subscription;
    }

    return () => {
      if (subscription) subscription.unsubscribe();
    };
  }, [checkDb, fetchBrain, fetchProfileAndDocs]);

  const incrementQueries = useCallback(async () => {
    if (!userProfile) return;
    const newCount = userProfile.queriesUsed + 1;
    setUserProfile(prev => prev ? { ...prev, queriesUsed: newCount } : null);
    if (isActuallyConnected && isSupabaseConfigured() && supabase) {
      await supabase.from('profiles').update({ queries_used: newCount }).eq('id', userProfile.id);
    }
  }, [userProfile, isActuallyConnected]);

  const renderView = () => {
    if (!userProfile) return null;
    
    return (
      <Suspense fallback={<div className="flex items-center justify-center p-20"><Loader2 className="animate-spin text-indigo-600 dark:text-indigo-400" size={32} /></div>}>
        {(() => {
          switch (currentView) {
            case 'dashboard':
              return <Dashboard user={userProfile} documents={documents} onProfileUpdate={setUserProfile} health={healthStatus} onCheckHealth={checkDb} />;
            case 'documents':
              return (
                <DocumentsView 
                  documents={documents} 
                  userProfile={userProfile}
                  onAddDocument={async (doc) => setDocuments(prev => [doc, ...prev])} 
                  onUpdateDocument={async (id, updates) => {
                    setDocuments(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
                    if (isActuallyConnected && isSupabaseConfigured() && supabase) {
                      await supabase.from('documents').update(updates as any).eq('id', id);
                    }
                  }}
                  onDeleteDocument={async (id) => {
                    const { data: { session } } = await supabase.auth.getSession();
                    const response = await fetch('/api/docs/delete', {
                      method: 'DELETE',
                      headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session?.access_token}`
                      },
                      body: JSON.stringify({ id })
                    });
                    if (response.ok) {
                      setDocuments(prev => prev.filter(d => d.id !== id));
                    }
                  }}
                  isConnected={isActuallyConnected}
                />
              );
            case 'chat':
              return <ChatView user={userProfile} brain={brain} documents={documents} onQuery={incrementQueries} canQuery={userProfile.queriesUsed < userProfile.queriesLimit || userProfile.role === UserRole.APP_ADMIN} />;
            case 'tools':
              return <ToolsView user={userProfile} brain={brain} documents={documents} onQuery={incrementQueries} canQuery={userProfile.queriesUsed < userProfile.queriesLimit || userProfile.role === UserRole.APP_ADMIN} />;
            case 'tracker':
              return <TrackerView user={userProfile} documents={documents} />;
            case 'brain':
              return userProfile.role === UserRole.APP_ADMIN ? <BrainControlView brain={brain} onUpdate={setBrain} /> : <Dashboard user={userProfile} documents={documents} onProfileUpdate={setUserProfile} health={healthStatus} onCheckHealth={checkDb} />;
            case 'pricing':
              return <PricingView currentPlan={userProfile.plan} onUpgrade={(plan) => {
                const limit = plan === SubscriptionPlan.FREE ? 30 : 1000;
                setUserProfile(prev => prev ? { ...prev, plan, queriesLimit: limit } : null);
                if (isActuallyConnected && isSupabaseConfigured() && supabase) {
                  supabase.from('profiles').update({ plan, queries_limit: limit }).eq('id', userProfile.id);
                }
                setCurrentView('dashboard');
              }} />;
            default:
              return <Dashboard user={userProfile} documents={documents} onProfileUpdate={setUserProfile} health={healthStatus} onCheckHealth={checkDb} />;
          }
        })()}
      </Suspense>
    );
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950"><Loader2 className="animate-spin text-indigo-600" /></div>;
  if (!session || !userProfile) return <Login onSession={setSession} />;

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden text-slate-900 dark:text-slate-100">
      <div className={`hidden lg:block transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64'}`}>
        <Sidebar 
          currentView={currentView} 
          onViewChange={setCurrentView} 
          userProfile={userProfile} 
          isCollapsed={isCollapsed} 
          setIsCollapsed={setIsCollapsed} 
          theme={theme}
          toggleTheme={toggleTheme}
        />
      </div>

      {isSidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-[500] flex">
          <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setIsSidebarOpen(false)} />
          <div className="relative w-[280px] h-full shadow-2xl animate-in slide-in-from-left duration-300">
            <Sidebar 
              currentView={currentView} 
              onViewChange={setCurrentView} 
              userProfile={userProfile} 
              isCollapsed={false} 
              setIsCollapsed={() => {}} 
              onClose={() => setIsSidebarOpen(false)} 
              theme={theme}
              toggleTheme={toggleTheme}
            />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {userProfile.role === UserRole.APP_ADMIN && <ProviderStatusBar />}
        <header className="lg:hidden flex items-center justify-between p-4 bg-white dark:bg-slate-900 border-b dark:border-slate-800 shadow-sm">
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors">
            <Menu size={24} />
          </button>
          <span className="font-bold text-indigo-950 dark:text-white">{APP_NAME}</span>
          <div className="w-10" />
        </header>

        {healthStatus.status !== 'connected' && (
          <div className="bg-rose-100 dark:bg-rose-900/30 border-b border-rose-200 dark:border-rose-800 px-4 py-2 flex items-center justify-center gap-3 text-rose-900 dark:text-rose-200 text-xs font-bold shrink-0">
            <AlertCircle size={14} />
            <span>Sync Warning: {healthStatus.message}</span>
            <button onClick={checkDb} className="bg-rose-200 dark:bg-rose-800 hover:bg-rose-300 dark:hover:bg-rose-700 px-2 py-1 rounded-md flex items-center gap-1 transition-colors">
              <RefreshCw size={10} /> Re-verify Cloud
            </button>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
          <div className="max-w-6xl mx-auto">{renderView()}</div>
        </main>
      </div>
    </div>
  );
}
