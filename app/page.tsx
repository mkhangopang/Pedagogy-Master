
'use client';

import React, { useState, useEffect, Suspense, lazy } from 'react';
import { supabase, isSupabaseConfigured, getSupabaseHealth } from '../lib/supabase';
import Sidebar from '../components/Sidebar';
import Dashboard from '../views/Dashboard';
import Login from '../views/Login';
import { UserRole, SubscriptionPlan, UserProfile, NeuralBrain, Document } from '../types';
import { DEFAULT_MASTER_PROMPT, DEFAULT_BLOOM_RULES, APP_NAME, ADMIN_EMAILS } from '../constants';
import { paymentService } from '../services/paymentService';
import { Loader2, Menu, AlertCircle, RefreshCw } from 'lucide-react';

const Documents = lazy(() => import('../views/Documents'));
const Chat = lazy(() => import('../views/Chat'));
const Tools = lazy(() => import('../views/Tools'));
const BrainControl = lazy(() => import('../views/BrainControl'));
const Pricing = lazy(() => import('../views/Pricing'));

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [healthStatus, setHealthStatus] = useState<{status: string, message: string}>({ status: 'checking', message: 'Verifying systems...' });

  const isActuallyConnected = healthStatus.status === 'connected';

  const [brain, setBrain] = useState<NeuralBrain>({
    id: typeof crypto !== 'undefined' ? crypto.randomUUID() : 'initial-brain-id',
    masterPrompt: DEFAULT_MASTER_PROMPT,
    bloomRules: DEFAULT_BLOOM_RULES,
    version: 1,
    isActive: true,
    updatedAt: new Date().toISOString()
  });

  const checkDb = async () => {
    const health = await getSupabaseHealth();
    setHealthStatus(health);
    return health.status === 'connected';
  };

  useEffect(() => {
    paymentService.init();
    
    const initSession = async () => {
      try {
        const isConnected = await checkDb();
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        
        if (currentSession) {
          setSession(currentSession);
          await fetchProfileAndDocs(currentSession.user.id, currentSession.user.email, isConnected);
          await fetchBrain(isConnected);
        } else {
          setSession(null);
        }
      } catch (err) {
        console.error("Critical Session Init Error:", err);
      } finally {
        setLoading(false);
      }
    };

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, currentSession) => {
      if (currentSession) {
        setSession(currentSession);
        const isConnected = await checkDb();
        await fetchProfileAndDocs(currentSession.user.id, currentSession.user.email, isConnected);
        await fetchBrain(isConnected);
      } else {
        setSession(null);
        setUserProfile(null);
        setDocuments([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchBrain = async (connected: boolean) => {
    if (!connected) return;
    try {
      const { data } = await supabase
        .from('neural_brain')
        .select('*')
        .eq('is_active', true)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
      
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
    } catch (e) {
      console.warn("Database error while fetching brain logic.");
    }
  };

  const fetchProfileAndDocs = async (userId: string, email: string | undefined, connected: boolean) => {
    try {
      let activeProfile: UserProfile;
      const isSystemAdmin = email && ADMIN_EMAILS.some(e => e.toLowerCase() === email.toLowerCase());

      if (connected) {
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
        
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
          const forcedRole = isSystemAdmin ? UserRole.APP_ADMIN : (profile.role as UserRole);
          const forcedPlan = isSystemAdmin ? SubscriptionPlan.ENTERPRISE : (profile.plan as SubscriptionPlan);

          if (isSystemAdmin && profile.role !== UserRole.APP_ADMIN) {
             await supabase.from('profiles').update({ role: UserRole.APP_ADMIN, plan: SubscriptionPlan.ENTERPRISE }).eq('id', userId);
          }

          activeProfile = {
            id: profile.id,
            name: profile.name || 'Educator',
            email: profile.email || '',
            role: forcedRole,
            plan: forcedPlan,
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
        
        const { data: docs, error: docError } = await supabase.from('documents').select('*').eq('user_id', userId).order('created_at', { ascending: false });
        if (docError) throw docError;
        
        if (docs) {
          setDocuments(docs.map(d => ({
            id: d.id,
            userId: d.user_id,
            name: d.name,
            base64Data: d.base64_data,
            filePath: d.file_path,
            mimeType: d.mime_type,
            status: d.status as any,
            subject: d.subject,
            gradeLevel: d.grade_level,
            sloTags: d.slo_tags || [],
            createdAt: d.created_at
          })));
        }
      } else {
        activeProfile = {
          id: userId,
          name: email?.split('@')[0] || 'Educator',
          email: email || '',
          role: isSystemAdmin ? UserRole.APP_ADMIN : UserRole.TEACHER,
          plan: isSystemAdmin ? SubscriptionPlan.ENTERPRISE : SubscriptionPlan.FREE,
          queriesUsed: 0,
          queriesLimit: 30,
          generationCount: 0,
          successRate: 0,
          editPatterns: { avgLengthChange: 0, examplesCount: 0, structureModifications: 0 }
        };
      }
      setUserProfile(activeProfile);
    } catch (e: any) {
      console.error("Profile/Doc Fetch Failure:", e.message);
      setHealthStatus({ status: 'error', message: 'Failed to sync documents with cloud.' });
    }
  };

  const incrementQueries = async () => {
    if (!userProfile) return;
    const newCount = userProfile.queriesUsed + 1;
    setUserProfile({ ...userProfile, queriesUsed: newCount });
    if (isActuallyConnected) {
      await supabase.from('profiles').update({ queries_used: newCount }).eq('id', userProfile.id);
    }
  };

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
                <Documents 
                  documents={documents} 
                  onAddDocument={async (doc) => {
                    // Update state immediately. DB persistence is now handled by RPC in the view.
                    setDocuments(prev => {
                      // Avoid duplicates on recovery
                      if (prev.find(p => p.id === doc.id)) return prev;
                      return [doc, ...prev];
                    });
                  }} 
                  onUpdateDocument={async (id, updates) => {
                    setDocuments(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
                    if (isActuallyConnected) {
                      const dbUpdates: any = {};
                      if (updates.status) dbUpdates.status = updates.status;
                      if (updates.sloTags) dbUpdates.slo_tags = updates.sloTags;
                      if (updates.subject) dbUpdates.subject = updates.subject;
                      if (updates.filePath) dbUpdates.file_path = updates.filePath;
                      await supabase.from('documents').update(dbUpdates).eq('id', id);
                    }
                  }}
                  onDeleteDocument={async (id) => {
                    setDocuments(prev => prev.filter(d => d.id !== id));
                    if (isActuallyConnected) {
                      await supabase.from('documents').delete().eq('id', id);
                    }
                  }}
                  brain={brain}
                  onQuery={incrementQueries}
                  canQuery={userProfile.queriesUsed < userProfile.queriesLimit || userProfile.role === UserRole.APP_ADMIN}
                  userPlan={userProfile.plan}
                />
              );
            case 'chat':
              return <Chat user={userProfile} brain={brain} documents={documents} onQuery={incrementQueries} canQuery={userProfile.queriesUsed < userProfile.queriesLimit || userProfile.role === UserRole.APP_ADMIN} />;
            case 'tools':
              return <Tools user={userProfile} brain={brain} documents={documents} onQuery={incrementQueries} canQuery={userProfile.queriesUsed < userProfile.queriesLimit || userProfile.role === UserRole.APP_ADMIN} />;
            case 'brain':
              return userProfile.role === UserRole.APP_ADMIN ? <BrainControl brain={brain} onUpdate={setBrain} /> : <Dashboard user={userProfile} documents={documents} onProfileUpdate={setUserProfile} health={healthStatus} onCheckHealth={checkDb} />;
            case 'pricing':
              return <Pricing currentPlan={userProfile.plan} onUpgrade={(plan) => {
                const limit = plan === SubscriptionPlan.FREE ? 30 : 1000;
                setUserProfile({ ...userProfile, plan, queriesLimit: limit });
                if (isActuallyConnected) {
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
      {isSidebarOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => setIsSidebarOpen(false)} />
          <div className="fixed inset-y-0 left-0 w-72 bg-indigo-950 shadow-2xl animate-in slide-in-from-left duration-300">
            <Sidebar currentView={currentView} onViewChange={(view) => { setCurrentView(view); setIsSidebarOpen(false); }} userProfile={userProfile} isCollapsed={false} setIsCollapsed={() => {}} onClose={() => setIsSidebarOpen(false)} />
          </div>
        </div>
      )}

      <div className={`hidden lg:block transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64'}`}>
        <Sidebar currentView={currentView} onViewChange={setCurrentView} userProfile={userProfile} isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden flex items-center justify-between p-4 bg-white border-b shadow-sm">
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <Menu size={24} />
          </button>
          <span className="font-bold text-indigo-950 tracking-tight text-lg">{APP_NAME}</span>
          <div className="w-10" />
        </header>

        {healthStatus.status !== 'connected' && (
          <div className="bg-rose-100 border-b border-rose-200 px-4 py-3 flex items-center justify-center gap-3 text-rose-900 text-[11px] font-bold">
            <AlertCircle size={14} className="shrink-0" />
            <span className="uppercase tracking-tight">Sync Warning: {healthStatus.message}</span>
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
