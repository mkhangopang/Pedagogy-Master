
'use client';

import React, { useState, useEffect, Suspense, lazy, useCallback } from 'react';
import { supabase, isSupabaseConfigured, getSupabaseHealth } from '../lib/supabase';
import Sidebar from '../components/Sidebar';
import Dashboard from '../views/Dashboard';
import Login from '../views/Login';
import { UserRole, SubscriptionPlan, UserProfile, NeuralBrain, Document } from '../types';
import { DEFAULT_MASTER_PROMPT, DEFAULT_BLOOM_RULES, APP_NAME, ADMIN_EMAILS } from '../constants';
import { paymentService } from '../services/paymentService';
import { Loader2, Menu, AlertCircle, RefreshCw } from 'lucide-react';

const DocumentsView = lazy(() => import('../views/Documents'));
const ChatView = lazy(() => import('../views/Chat'));
const ToolsView = lazy(() => import('../views/Tools'));
const BrainControlView = lazy(() => import('../views/BrainControl'));
const PricingView = lazy(() => import('../views/Pricing'));

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [healthStatus, setHealthStatus] = useState<{status: string, message: string}>({ 
    status: 'checking', 
    message: 'Verifying systems...' 
  });

  const isActuallyConnected = healthStatus.status === 'connected';

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
    if (!isSupabaseConfigured) {
      setHealthStatus({ status: 'disconnected', message: 'Cloud credentials missing.' });
      return false;
    }
    const health = await getSupabaseHealth();
    setHealthStatus(health);
    return health.status === 'connected';
  }, []);

  const fetchProfileAndDocs = useCallback(async (userId: string, email: string | undefined, connected: boolean) => {
    if (!connected || !supabase) return;

    try {
      const isSystemAdmin = email && ADMIN_EMAILS.some(e => e.toLowerCase() === email.toLowerCase());
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      
      let activeProfile: UserProfile;

      if (!profile) {
        activeProfile = {
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
        await supabase.from('profiles').insert([{
          id: userId,
          name: activeProfile.name,
          email: activeProfile.email,
          role: activeProfile.role,
          plan: activeProfile.plan,
          queries_used: 0,
          queries_limit: activeProfile.queriesLimit
        }]);
      } else {
        activeProfile = {
          id: profile.id,
          name: profile.name || 'Educator',
          email: profile.email || '',
          role: isSystemAdmin ? UserRole.APP_ADMIN : (profile.role as UserRole),
          plan: isSystemAdmin ? SubscriptionPlan.ENTERPRISE : (profile.plan as SubscriptionPlan),
          queriesUsed: profile.queries_used || 0,
          queriesLimit: isSystemAdmin ? 999999 : (profile.queries_limit || 30),
          gradeLevel: profile.grade_level,
          subjectArea: profile.subject_area,
          teachingStyle: profile.teaching_style,
          pedagogicalApproach: profile.pedagogical_approach,
          generationCount: profile.generation_count || 0,
          successRate: profile.success_rate || 0,
          editPatterns: profile.edit_patterns || { avgLengthChange: 0, examplesCount: 0, structureModifications: 0 }
        };
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
          subject: d.subject,
          gradeLevel: d.grade_level,
          sloTags: d.slo_tags || [],
          createdAt: d.created_at
        })));
      }
    } catch (e: any) {
      console.error("Profile Fetch Failure:", e.message);
    }
  }, []);

  const fetchBrain = useCallback(async (connected: boolean) => {
    if (!connected || !supabase) return;
    try {
      const { data } = await supabase.from('neural_brain').select('*').eq('is_active', true).order('version', { ascending: false }).limit(1).maybeSingle();
      if (data) {
        setBrain({
          id: data.id,
          masterPrompt: data.master_prompt,
          bloomRules: data.bloom_rules, 
          version: data.version,
          isActive: data.is_active,
          updatedAt: data.updated_at
        });
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    paymentService.init();
    
    const initSession = async () => {
      setLoading(true);
      if (!isSupabaseConfigured || !supabase) {
        setLoading(false);
        return;
      }

      try {
        const isConnected = await checkDb();
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        
        if (currentSession) {
          setSession(currentSession);
          await fetchProfileAndDocs(currentSession.user.id, currentSession.user.email, isConnected);
          await fetchBrain(isConnected);
        }
      } catch (err) {
        console.error("Init Session Error:", err);
      } finally {
        setLoading(false);
      }
    };

    initSession();

    let subscription: any = null;
    if (isSupabaseConfigured && supabase) {
      const { data } = supabase.auth.onAuthStateChange(async (_event, currentSession) => {
        if (currentSession) {
          setSession(currentSession);
          const isConnected = await checkDb();
          await fetchProfileAndDocs(currentSession.user.id, currentSession.user.email, isConnected);
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
    if (isActuallyConnected && isSupabaseConfigured && supabase) {
      await supabase.from('profiles').update({ queries_used: newCount }).eq('id', userProfile.id);
    }
  }, [userProfile, isActuallyConnected]);

  const renderView = () => {
    if (!userProfile) return null;
    
    return (
      <Suspense fallback={<div className="flex items-center justify-center p-20"><Loader2 className="animate-spin text-indigo-600" size={32} /></div>}>
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
                    if (isActuallyConnected && isSupabaseConfigured && supabase) {
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
            case 'brain':
              return userProfile.role === UserRole.APP_ADMIN ? <BrainControlView brain={brain} onUpdate={setBrain} /> : <Dashboard user={userProfile} documents={documents} onProfileUpdate={setUserProfile} health={healthStatus} onCheckHealth={checkDb} />;
            case 'pricing':
              return <PricingView currentPlan={userProfile.plan} onUpgrade={(plan) => {
                const limit = plan === SubscriptionPlan.FREE ? 30 : 1000;
                setUserProfile(prev => prev ? { ...prev, plan, queriesLimit: limit } : null);
                if (isActuallyConnected && isSupabaseConfigured && supabase) {
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

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-indigo-600" /></div>;
  if (!session || !userProfile) return <Login onSession={setSession} />;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <div className={`hidden lg:block transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64'}`}>
        <Sidebar currentView={currentView} onViewChange={setCurrentView} userProfile={userProfile} isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />
      </div>

      {isSidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-[500] flex">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setIsSidebarOpen(false)} />
          <div className="relative w-[280px] h-full shadow-2xl animate-in slide-in-from-left duration-300">
            <Sidebar currentView={currentView} onViewChange={setCurrentView} userProfile={userProfile} isCollapsed={false} setIsCollapsed={() => {}} onClose={() => setIsSidebarOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="lg:hidden flex items-center justify-between p-4 bg-white border-b shadow-sm">
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors">
            <Menu size={24} />
          </button>
          <span className="font-bold text-indigo-950">{APP_NAME}</span>
          <div className="w-10" />
        </header>

        {healthStatus.status !== 'connected' && (
          <div className="bg-rose-100 border-b border-rose-200 px-4 py-2 flex items-center justify-center gap-3 text-rose-900 text-xs font-bold shrink-0">
            <AlertCircle size={14} />
            <span>Sync Warning: {healthStatus.message}</span>
            <button onClick={checkDb} className="bg-rose-200 hover:bg-rose-300 px-2 py-1 rounded-md flex items-center gap-1 transition-colors">
              <RefreshCw size={10} /> Re-verify Cloud
            </button>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-6xl mx-auto">{renderView()}</div>
        </main>
      </div>
    </div>
  );
}
