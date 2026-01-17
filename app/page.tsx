'use client';

import React, { useState, useEffect, Suspense, lazy, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured, getSupabaseHealth } from '../lib/supabase';
import Sidebar from '../components/Sidebar';
import Dashboard from '../views/Dashboard';
import Login from '../views/Login';
import { ProviderStatusBar } from '../components/ProviderStatusBar';
import { UserRole, SubscriptionPlan, UserProfile, NeuralBrain, Document } from '../types';
import { DEFAULT_MASTER_PROMPT, DEFAULT_BLOOM_RULES, APP_NAME, ADMIN_EMAILS } from '../constants';
import { paymentService } from '../services/paymentService';
import { Loader2, Menu, AlertCircle, RefreshCw, X } from 'lucide-react';

const DocumentsView = lazy(() => import('../views/Documents'));
const ChatView = lazy(() => import('../views/Chat'));
const ToolsView = lazy(() => import('../views/Tools'));
const BrainControlView = lazy(() => import('../views/BrainControl'));
const PricingView = lazy(() => import('../views/Pricing'));
const TrackerView = lazy(() => import('../views/Tracker'));

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
  
  const authInitialized = useRef(false);

  const isActuallyConnected = healthStatus.status === 'connected';

  useEffect(() => {
    const savedTheme = localStorage.getItem('pm-theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.classList.toggle('dark', savedTheme === 'dark');
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
      const defaultRole = isSystemAdmin ? UserRole.APP_ADMIN : UserRole.TEACHER;
      const defaultPlan = isSystemAdmin ? SubscriptionPlan.ENTERPRISE : SubscriptionPlan.FREE;
      const defaultLimit = isSystemAdmin ? 999999 : 30;

      if (!profile) {
        // Fallback for edge cases where trigger hasn't fired yet
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
        
        await supabase.from('profiles').upsert([{
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
          role: isSystemAdmin ? UserRole.APP_ADMIN : profile.role as UserRole,
          plan: isSystemAdmin ? SubscriptionPlan.ENTERPRISE : profile.plan as SubscriptionPlan,
          queriesUsed: profile.queries_used || 0,
          queriesLimit: isSystemAdmin ? 999999 : profile.queries_limit || 30,
          gradeLevel: profile.grade_level,
          subjectArea: profile.subject_area,
          generationCount: profile.generation_count || 0,
          successRate: profile.success_rate || 0
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
          subject: d.subject || 'General',
          gradeLevel: d.grade_level || 'Auto',
          sloTags: d.slo_tags || [],
          createdAt: d.created_at,
          sourceType: d.source_type || 'markdown',
          isApproved: d.is_approved ?? false,
          curriculumName: d.curriculum_name || d.name,
          authority: d.authority || 'General',
          versionYear: d.version_year || '2024',
          version: d.version || 1,
          generatedJson: d.generated_json,
          documentSummary: d.document_summary,
          difficultyLevel: d.difficulty_level,
          geminiProcessed: d.rag_indexed ?? false,
          isSelected: d.is_selected ?? false
        })));
      }
    } catch (e: any) {
      console.error("Profile Fetch Error:", e);
    }
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

  // MASTER AUTH LISTENER (Fix 401 and refresh state)
  useEffect(() => {
    if (authInitialized.current) return;
    authInitialized.current = true;
    
    paymentService.init();
    checkDb();

    // Set initial session
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      if (currentSession) {
        fetchProfileAndDocs(currentSession.user.id, currentSession.user.email);
        fetchBrain();
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        console.log(`📡 [Auth Sync] Event: ${event}`);
        
        setSession(currentSession);
        
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          if (currentSession) {
            await fetchProfileAndDocs(currentSession.user.id, currentSession.user.email);
            await fetchBrain();
          }
        }
        
        if (event === 'SIGNED_OUT') {
          setUserProfile(null);
          setDocuments([]);
          setCurrentView('dashboard');
        }
        
        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [checkDb, fetchBrain, fetchProfileAndDocs]);

  const handleUpdateDocument = async (id: string, updates: Partial<Document>) => {
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
    
    if (isActuallyConnected && isSupabaseConfigured() && supabase) {
      const dbUpdates: any = {};
      if (updates.status) dbUpdates.status = updates.status;
      if (updates.geminiProcessed !== undefined) dbUpdates.rag_indexed = updates.geminiProcessed;
      if (updates.isSelected !== undefined) dbUpdates.is_selected = updates.isSelected;
      if (updates.isApproved !== undefined) dbUpdates.is_approved = updates.isApproved;
      if (updates.documentSummary !== undefined) dbUpdates.document_summary = updates.documentSummary;
      if (updates.difficultyLevel !== undefined) dbUpdates.difficulty_level = updates.difficultyLevel;
      
      const { error } = await supabase.from('documents').update(dbUpdates).eq('id', id);
      if (error) console.error("Persistence failed:", error.message);
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
              return <DocumentsView documents={documents} userProfile={userProfile} onAddDocument={async (d) => { await fetchProfileAndDocs(userProfile.id, userProfile.email); }} onUpdateDocument={handleUpdateDocument} onDeleteDocument={async (id) => { setDocuments(prev => prev.filter(d => d.id !== id)); }} isConnected={isActuallyConnected} />;
            case 'chat':
              return <ChatView user={userProfile} brain={brain} documents={documents} onQuery={() => {}} canQuery={true} />;
            case 'tools':
              return <ToolsView user={userProfile} brain={brain} documents={documents} onQuery={() => {}} canQuery={true} />;
            case 'tracker':
              return <TrackerView user={userProfile} documents={documents} />;
            case 'brain':
              return userProfile.role === UserRole.APP_ADMIN ? <BrainControlView brain={brain} onUpdate={setBrain} /> : <Dashboard user={userProfile} documents={documents} onProfileUpdate={setUserProfile} health={healthStatus} onCheckHealth={checkDb} />;
            case 'pricing':
              return <PricingView currentPlan={userProfile.plan} onUpgrade={() => setCurrentView('dashboard')} />;
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
      {/* Desktop Sidebar */}
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

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <div 
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm animate-in fade-in duration-300" 
            onClick={() => setIsSidebarOpen(false)} 
          />
          <div className="fixed inset-y-0 left-0 w-72 bg-indigo-950 shadow-2xl animate-in slide-in-from-left duration-300 border-r border-indigo-800/20">
            <Sidebar 
              currentView={currentView} 
              onViewChange={(view) => {
                setCurrentView(view);
                setIsSidebarOpen(false);
              }} 
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
        <header className="lg:hidden flex items-center justify-between p-4 bg-white dark:bg-slate-900 border-b dark:border-slate-800">
          <button 
            onClick={() => setIsSidebarOpen(true)} 
            className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-all"
          >
            <Menu size={24} />
          </button>
          <span className="font-bold text-indigo-950 dark:text-white tracking-tight">{APP_NAME}</span>
          <div className="w-10" />
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
          <div className="max-w-6xl mx-auto">{renderView()}</div>
        </main>
      </div>
    </div>
  );
}