'use client';

import React, { useState, useEffect, Suspense, lazy, useCallback, useRef } from 'react';
import { supabase, getSupabaseHealth, getOrCreateProfile, isSupabaseConfigured, getCredentials, refreshSupabaseInstance } from '../lib/supabase';
import Landing from '../views/Landing';
import Policy from '../views/Policy';
import { ProviderStatusBar } from '../components/ProviderStatusBar';
import { UserRole, SubscriptionPlan, UserProfile, NeuralBrain, Document } from '../types';
import { DEFAULT_MASTER_PROMPT, DEFAULT_BLOOM_RULES } from '../constants';
import { Loader2, Menu, MessageSquarePlus, Share2, Check } from 'lucide-react';
import { PilotFeedbackDrawer } from '../components/PilotFeedbackDrawer';
import { trackProductEvent } from '../lib/analytics';
import { normalizeAuthEntryMode } from '../lib/auth/auth-mode';
import { formatAuthError } from '../lib/auth/auth-error';
import { BlinkingRobot } from '../components/BlinkingRobot';

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
const ActivityLogView = lazy(() => import('../views/ActivityLog'));
import { logActivity } from '../lib/activity-logger';

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
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'forgot-password' | 'update-password'>('login');
  const [urlAuthError, setUrlAuthError] = useState<string | null>(null);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const authModeRef = useRef(authMode);
  authModeRef.current = authMode;

  useEffect(() => {
    // Consolidated client-side hydration for theme, saved view, and auth URL parameters
    try {
      const savedTheme = localStorage.getItem('theme') as 'light' | 'dark';
      if (savedTheme) {
        setTheme(savedTheme);
        document.documentElement.classList.toggle('dark', savedTheme === 'dark');
      }

      // Check for password recovery or auth tokens/errors in URL
      if (typeof window !== 'undefined') {
        const hash = window.location.hash || '';
        const search = window.location.search || '';
        const combined = hash + '&' + search;
        const params = new URLSearchParams(search);

        const cleanAuthUrlParams = () => {
          try {
            window.history.replaceState({}, '', window.location.pathname);
          } catch {
            // ignore history restriction
          }
        };

        // 1. Check for error parameters (e.g. link expired, already used)
        if (combined.includes('error=')) {
          const errMatch = combined.match(/error_description=([^&]+)/);
          const rawErr = errMatch ? errMatch[1] : (params.get('error_description') || params.get('error') || 'Authentication link failed');
          const desc = formatAuthError(decodeURIComponent(rawErr.replace(/\+/g, ' ')), 'Authentication link failed.');
          setUrlAuthError(desc);
          setCurrentView('login');
        }

        // 2. Check for password recovery flow or tokens
        const isRecovery = 
          combined.includes('type=recovery') || 
          combined.includes('recovery=true') ||
          search.includes('mode=update-password');

        if (isRecovery) {
          console.log("🔑 [Auth] Detected password recovery URL parameters.");
          setAuthMode('update-password');
          authModeRef.current = 'update-password';
          setCurrentView('login');
        }

        // 3. Extract access_token if provided in hash
        const tokenMatch = hash.match(/access_token=([^&]+)/);
        const refreshMatch = hash.match(/refresh_token=([^&]+)/);
        if (tokenMatch) {
          supabase.auth.setSession({
            access_token: tokenMatch[1],
            refresh_token: refreshMatch ? refreshMatch[1] : ''
          }).then(({ data, error }) => {
            if (data?.session) {
              setSession(data.session);
              cleanAuthUrlParams();
              if (!isRecovery) {
                fetchAppData(data.session.user.id, data.session.user.email, data.session);
                setCurrentView('dashboard');
              }
            }
            if (error) console.warn("Hash setSession notice:", error.message);
          }).catch(e => console.warn("Hash setSession error:", e));
        }

        // 4. PKCE code in query params (guard against double-exchange with detectSessionInUrl)
        const codeParam = params.get('code');
        if (codeParam) {
          (async () => {
            try {
              const { data: existingData } = await supabase.auth.getSession();
              let activeSession = existingData?.session || null;
              let exchangeErr: any = null;

              if (!activeSession) {
                const { data, error } = await supabase.auth.exchangeCodeForSession(codeParam);
                activeSession = data?.session || null;
                exchangeErr = error;
              }

              if (activeSession) {
                setSession(activeSession);
                cleanAuthUrlParams();
                if (isRecovery || params.get('type') === 'recovery') {
                  setAuthMode('update-password');
                  authModeRef.current = 'update-password';
                  setCurrentView('login');
                } else {
                  fetchAppData(activeSession.user.id, activeSession.user.email, activeSession);
                  setCurrentView('dashboard');
                }
              } else if (exchangeErr) {
                console.warn("Code exchange notice:", exchangeErr.message);
                setUrlAuthError(formatAuthError(exchangeErr, 'Verification link expired or already used.'));
                setCurrentView('login');
              }
            } catch (e: any) {
              console.warn("Code exchange error:", e);
            }
          })();
        }

        // 5. Token hash in query params (supports signup confirmation, email change, magiclink, and recovery)
        const tokenHashParam = params.get('token_hash');
        if (tokenHashParam) {
          const otpType = params.get('type') || 'recovery';
          const isTokenRecovery = otpType === 'recovery' || isRecovery;
          supabase.auth.verifyOtp({
            token_hash: tokenHashParam,
            type: otpType as any
          }).then(({ data, error }) => {
            if (data?.session) {
              setSession(data.session);
              cleanAuthUrlParams();
              if (isTokenRecovery) {
                setAuthMode('update-password');
                authModeRef.current = 'update-password';
                setCurrentView('login');
              } else {
                setAuthMode('login');
                authModeRef.current = 'login';
                fetchAppData(data.session.user.id, data.session.user.email, data.session);
                setCurrentView('dashboard');
              }
            } else if (error) {
              console.warn("Token hash notice:", error.message);
              setUrlAuthError(formatAuthError(error, 'Email verification link is invalid or expired.'));
              setCurrentView('login');
            }
          }).catch(e => console.warn("Token hash error:", e));
        }
      }

      // Try cookie first, then localStorage
      const cookies = document.cookie.split('; ');
      const cookie = cookies.find(c => c.startsWith('currentView='));
      let saved = cookie ? decodeURIComponent(cookie.split('=')[1]) : null;
      if (!saved) {
        saved = localStorage.getItem('currentView');
      }
      if (saved && saved !== 'login' && saved !== 'landing' && authModeRef.current !== 'update-password') {
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
        const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
        const sameSiteAttr = isHttps ? 'SameSite=None; Secure' : 'SameSite=Lax';
        document.cookie = `currentView=${encodeURIComponent(currentView)}; expires=${expires.toUTCString()}; path=/; ${sameSiteAttr}`;
      } catch (e) {}
      if (session) {
        trackProductEvent({
          action: 'view_opened',
          category: 'navigation',
          label: currentView,
          toolType: currentView,
        });
      }
    }
  }, [currentView, isViewHydrated, session]);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
    logActivity({
      category: 'setting_adjustment',
      action: 'Platform Theme Toggled',
      summary: `Switched visual appearance to ${newTheme} mode`,
      status: 'success',
      metadata: { settingKey: 'theme', previousValue: theme, newValue: newTheme }
    });
  };

  const fetchAppData = useCallback(async (userId: string, email?: string, providedSession?: any) => {
    // 0. Instant sessionStorage hydration so reload renders profile/quota at 0ms
    if (typeof window !== 'undefined') {
      try {
        const cachedRaw = sessionStorage.getItem(`pm_profile_v1_${userId}`);
        if (cachedRaw) {
          const cachedProfile = JSON.parse(cachedRaw) as UserProfile;
          setUserProfile(prev => prev || cachedProfile);
        }
      } catch {
        // ignore storage errors
      }
    }

    getSupabaseHealth().then(setHealthStatus);

    const currentSession = providedSession || (await supabase.auth.getSession()).data.session;

    // 1. Fetch Profile, Quota, and Documents in parallel (Brain config loaded only for APP_ADMIN)
    const quotaPromise = currentSession?.access_token
      ? fetch('/api/quota', {
          headers: { Authorization: `Bearer ${currentSession.access_token}` },
        })
          .then((res) => (res.ok ? res.json() : null))
          .catch(() => null)
      : Promise.resolve(null);

    Promise.all([getOrCreateProfile(userId, email), quotaPromise]).then(([profile, qData]) => {
      if (profile) {
        let dailyUsed = profile.queries_used || 0;
        let dailyLimit = profile.queries_limit || 25;

        if (qData?.quota) {
          dailyUsed = qData.quota.isDeveloper ? 0 : qData.quota.used;
          dailyLimit = qData.quota.isDeveloper ? 999999 : (qData.quota.limit || 25);
        }

        const mappedProfile: UserProfile = {
          id: profile.id, email: profile.email || '',
          name: profile.name || email?.split('@')[0] || 'Educator',
          role: profile.role as UserRole, plan: profile.plan as SubscriptionPlan,
          queriesUsed: dailyUsed, queriesLimit: dailyLimit,
          generationCount: profile.generation_count || 0, successRate: profile.success_rate || 0,
          onboarding_completed: profile.onboarding_completed
        };
        setUserProfile(mappedProfile);
        if (mappedProfile.role === UserRole.APP_ADMIN && currentSession?.access_token) {
          fetch('/api/brain/get', {
            headers: { 'Authorization': `Bearer ${currentSession.access_token}` }
          })
          .then(res => (res.ok ? res.json() : null))
          .then(data => {
            if (data?.brain) {
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
        if (typeof window !== 'undefined') {
          try {
            sessionStorage.setItem(`pm_profile_v1_${userId}`, JSON.stringify(mappedProfile));
          } catch {
            // ignore quota errors
          }
        }

        if (!profile.onboarding_completed) {
          setCurrentView('onboarding');
        }
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
          
          if (event === 'PASSWORD_RECOVERY' || authModeRef.current === 'update-password') {
            console.log("🔑 [Auth] PASSWORD_RECOVERY event active. Staying in update-password mode.");
            setSession(currentSession);
            setAuthMode('update-password');
            authModeRef.current = 'update-password';
            setCurrentView('login');
            return;
          }

          if (currentSession) {
            setSession(currentSession);
            fetchAppData(currentSession.user.id, currentSession.user.email, currentSession);
            // If in password recovery flow, do not auto-route to dashboard
            setCurrentView(prev => {
              if (authModeRef.current === 'update-password') return 'login';
              return (prev === 'landing' || prev === 'login') ? 'dashboard' : prev;
            });
          } else if (event === 'SIGNED_OUT') {
            console.warn("📡 [Auth] Explicit SIGNED_OUT event received");
            setSession(null);
            setAuthMode('login');
            authModeRef.current = 'login';
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
          setCurrentView(prev => {
            if (authModeRef.current === 'update-password') return 'login';
            return (prev === 'landing' || prev === 'login') ? 'dashboard' : prev;
          });
        }
      } catch (err) {
        console.error('📡 [System] Auth initialization failed:', err);
      } finally {
        setIsAuthResolving(false);
      }
    };

    if (!initStarted.current) {
      initStarted.current = true;
      // Execute immediately without idle callback throttling for instant initial load
      initializeAuth().then(() => {
        // Prefetch core workspace views after initial session check for 0ms tab switches
        if (typeof window !== 'undefined') {
          const prefetchCore = () => {
            void import('../views/Dashboard');
            void import('../views/Tools');
            void import('../views/Chat');
            void import('../views/Documents');
          };
          if ('requestIdleCallback' in window) {
            (window as any).requestIdleCallback(prefetchCore, { timeout: 600 });
          } else {
            setTimeout(prefetchCore, 150);
          }
        }
      });
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
        <BlinkingRobot size="lg" isThinking className="mb-6" />
        <div className="flex gap-2">
          <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.3s]" />
          <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.15s]" />
          <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" />
        </div>
      </div>
      <p className="mt-8 text-indigo-700 dark:text-indigo-300 font-black uppercase tracking-[0.4em] text-[10px]">Syncing Grid</p>
    </div>
  );
  
  if (!session || authMode === 'update-password' || currentView === 'login') {
    if (currentView === 'login' || authMode === 'update-password') {
      return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950"><Loader2 className="animate-spin text-indigo-600" size={32} /></div>}>
          <Login 
            initialMode={authMode} 
            initialError={urlAuthError}
            onSession={(newSession) => {
              setSession(newSession);
              setAuthMode('login');
              authModeRef.current = 'login';
              setUrlAuthError(null);
              fetchAppData(newSession.user.id, newSession.user.email, newSession);
              setCurrentView('dashboard');
            }} 
            onBack={() => {
              setAuthMode('login');
              authModeRef.current = 'login';
              setUrlAuthError(null);
              setCurrentView(session ? 'dashboard' : 'landing');
            }} 
          />
        </Suspense>
      );
    }
    return (
      <Landing 
        onStart={(mode?: 'login' | 'signup') => { 
          const safeMode = normalizeAuthEntryMode(mode, 'login');
          setAuthMode(safeMode); 
          authModeRef.current = safeMode;
          setUrlAuthError(null);
          setCurrentView('login'); 
        }} 
      />
    );
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
        <header className="flex items-center justify-between gap-3 px-4 py-3 bg-white dark:bg-slate-900 border-b dark:border-slate-800 shadow-sm z-40 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl"><Menu size={22} /></button>
            <span className="font-black text-indigo-950 dark:text-white tracking-tight text-sm uppercase truncate">{currentView.replace('-', ' ')}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {safeProfile.role !== UserRole.APP_ADMIN && (
              <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 tabular-nums whitespace-nowrap">
                {Math.max(0, safeProfile.queriesLimit - safeProfile.queriesUsed)}/{safeProfile.queriesLimit} free today
              </span>
            )}
            <button
              type="button"
              onClick={async () => {
                if (typeof window === 'undefined') return;
                try {
                  await navigator.clipboard.writeText(window.location.origin);
                  setShareCopied(true);
                  setTimeout(() => setShareCopied(false), 2200);
                  trackProductEvent({
                    action: 'share_link_copied',
                    category: 'growth',
                    label: currentView,
                    toolType: currentView,
                  });
                } catch {
                  // ignore clipboard restriction
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold whitespace-nowrap"
              title="Copy link to invite fellow educators"
            >
              {shareCopied ? <Check size={14} className="text-emerald-600 dark:text-emerald-400" /> : <Share2 size={14} />}
              <span className="hidden sm:inline">{shareCopied ? 'Copied!' : 'Share'}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsFeedbackOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold whitespace-nowrap shadow-sm"
            >
              <MessageSquarePlus size={14} />
              <span>Feedback</span>
            </button>
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
                  case 'chat': return <ChatView user={safeProfile} brain={brain} documents={documents} onQuery={() => setUserProfile(p => p ? {...p, queriesUsed: p.queriesUsed + 1} : null)} canQuery={safeProfile.queriesUsed < safeProfile.queriesLimit} onViewChange={setCurrentView} />;
                  case 'documents': return <DocumentsView documents={documents} userProfile={safeProfile} onAddDocument={async () => fetchAppData(safeProfile.id, safeProfile.email)} onUpdateDocument={async(id, u) => setDocuments(d => d.map(x => x.id === id ? {...x,...u}:x))} onDeleteDocument={async (id) => setDocuments(d => d.filter(x => x.id !== id))} isConnected={healthStatus.status === 'connected'} />;
                  case 'tools': return <ToolsView user={safeProfile} brain={brain} documents={documents} onQuery={() => setUserProfile(p => p ? {...p, queriesUsed: p.queriesUsed + 1} : null)} canQuery={safeProfile.queriesUsed < safeProfile.queriesLimit} onViewChange={setCurrentView} />;
                  case 'tracker': return <TrackerView user={safeProfile} documents={documents} />;
                  case 'standards': return <StandardsBrowserView user={safeProfile} documents={documents} />;
                  case 'activity_log': return <ActivityLogView user={safeProfile} documents={documents} onViewChange={setCurrentView} />;
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
      <PilotFeedbackDrawer
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
        currentView={currentView}
      />
    </div>
  );
}
