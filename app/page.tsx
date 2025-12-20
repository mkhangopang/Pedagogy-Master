
'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import Sidebar from '../components/Sidebar';
import Dashboard from '../views/Dashboard';
import Documents from '../views/Documents';
import Chat from '../views/Chat';
import Tools from '../views/Tools';
import BrainControl from '../views/BrainControl';
import Pricing from '../views/Pricing';
import Login from '../views/Login';
import { UserRole, SubscriptionPlan, UserProfile, NeuralBrain, Document } from '../types';
import { DEFAULT_MASTER_PROMPT, DEFAULT_BLOOM_RULES, ROLE_LIMITS, APP_NAME, ADMIN_EMAILS } from '../constants';
import { paymentService } from '../services/paymentService';
import { Loader2, Menu } from 'lucide-react';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const [brain, setBrain] = useState<NeuralBrain>({
    id: typeof crypto !== 'undefined' ? crypto.randomUUID() : 'initial-brain-id',
    masterPrompt: DEFAULT_MASTER_PROMPT,
    bloomRules: DEFAULT_BLOOM_RULES,
    version: 1,
    isActive: true,
    updatedAt: new Date().toISOString()
  });

  useEffect(() => {
    paymentService.init();
    
    const initSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        if (session) {
          await fetchProfileAndDocs(session.user.id, session.user.email);
          await fetchBrain();
        }
      } catch (err) {
        console.error("Session initialization failed:", err);
      } finally {
        setLoading(false);
      }
    };

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session) {
        await fetchProfileAndDocs(session.user.id, session.user.email);
        await fetchBrain();
      } else {
        setUserProfile(null);
        setDocuments([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchBrain = async () => {
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
      } as any);
    }
  };

  const fetchProfileAndDocs = async (userId: string, email?: string) => {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    
    // Critical: Admin Whitelist Check
    const isSystemAdmin = email && ADMIN_EMAILS.some(e => e.toLowerCase() === email.toLowerCase());
    
    let activeProfile: UserProfile;

    if (!profile) {
      activeProfile = {
        id: userId,
        name: email?.split('@')[0] || 'Educator',
        email: email || '',
        role: isSystemAdmin ? UserRole.APP_ADMIN : UserRole.TEACHER,
        plan: isSystemAdmin ? SubscriptionPlan.ENTERPRISE : SubscriptionPlan.FREE,
        queriesUsed: 0,
        queriesLimit: isSystemAdmin ? 999999 : 30
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
        queriesLimit: isSystemAdmin ? 999999 : (profile.queries_limit || 30)
      };

      // Always sync admin status if email matches whitelist
      if (isSystemAdmin && (profile.role !== UserRole.APP_ADMIN || profile.plan !== SubscriptionPlan.ENTERPRISE)) {
        await supabase.from('profiles').update({ 
          role: UserRole.APP_ADMIN, 
          plan: SubscriptionPlan.ENTERPRISE,
          queries_limit: 999999 
        }).eq('id', userId);
      }
    }

    setUserProfile(activeProfile);

    const { data: docs } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (docs) {
      const mappedDocs: Document[] = docs.map(d => ({
        id: d.id,
        userId: d.user_id,
        name: d.name,
        base64Data: d.base64_data,
        mimeType: d.mime_type,
        status: d.status as any,
        subject: d.subject,
        gradeLevel: d.grade_level,
        sloTags: d.slo_tags || [],
        createdAt: d.created_at
      }));
      setDocuments(mappedDocs);
    }
  };

  const incrementQueries = async () => {
    if (!userProfile) return;
    if (userProfile.role === UserRole.APP_ADMIN) return; // Admin queries don't count towards limit
    
    const newCount = userProfile.queriesUsed + 1;
    setUserProfile({ ...userProfile, queriesUsed: newCount });
    await supabase.from('profiles').update({ queries_used: newCount }).eq('id', userProfile.id);
  };

  const addDocument = async (doc: Document) => {
    if (!userProfile) return;
    const maxDocs = ROLE_LIMITS[userProfile.plan].docs;
    if (documents.length >= maxDocs && userProfile.role !== UserRole.APP_ADMIN) {
      alert(`Limit reached: Your current plan supports up to ${maxDocs} documents.`);
      return;
    }

    setDocuments(prev => [doc, ...prev]);

    await supabase.from('documents').insert([{
      id: doc.id,
      user_id: userProfile.id,
      name: doc.name,
      base64_data: doc.base64Data,
      mime_type: doc.mimeType,
      status: doc.status,
      subject: doc.subject,
      grade_level: doc.gradeLevel,
      slo_tags: doc.sloTags,
      created_at: doc.createdAt
    }]);
  };

  const deleteDocument = async (id: string) => {
    if (userProfile?.plan === SubscriptionPlan.FREE && userProfile.role !== UserRole.APP_ADMIN) {
      alert("Upgrade to Pro to manage and delete library assets.");
      return;
    }
    setDocuments(prev => prev.filter(d => d.id !== id));
    await supabase.from('documents').delete().eq('id', id);
  };

  const updateDocument = async (id: string, updates: Partial<Document>) => {
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
    const dbUpdates: any = {};
    if (updates.status) dbUpdates.status = updates.status;
    if (updates.sloTags) dbUpdates.slo_tags = updates.sloTags;
    if (updates.subject) dbUpdates.subject = updates.subject;
    await supabase.from('documents').update(dbUpdates).eq('id', id);
  };

  const updatePlan = async (plan: SubscriptionPlan) => {
    if (!userProfile) return;
    const limit = plan === SubscriptionPlan.FREE ? 30 : plan === SubscriptionPlan.PRO ? 1000 : 999999;
    const updated = { ...userProfile, plan, queriesLimit: limit };
    setUserProfile(updated);
    await supabase.from('profiles').update({ plan, queries_limit: limit }).eq('id', userProfile.id);
    setCurrentView('dashboard');
  };

  const renderView = () => {
    if (!userProfile) return null;
    switch (currentView) {
      case 'dashboard':
        return <Dashboard user={userProfile} documents={documents} />;
      case 'documents':
        return (
          <Documents 
            documents={documents} 
            onAddDocument={addDocument} 
            onUpdateDocument={updateDocument}
            onDeleteDocument={deleteDocument}
            brain={brain}
            onQuery={incrementQueries}
            canQuery={userProfile.queriesUsed < userProfile.queriesLimit || userProfile.role === UserRole.APP_ADMIN}
            userPlan={userProfile.plan}
          />
        );
      case 'chat':
        return (
          <Chat 
            brain={brain} 
            documents={documents} 
            onQuery={incrementQueries} 
            canQuery={userProfile.queriesUsed < userProfile.queriesLimit || userProfile.role === UserRole.APP_ADMIN} 
          />
        );
      case 'tools':
        return (
          <Tools 
            brain={brain} 
            documents={documents} 
            onQuery={incrementQueries} 
            canQuery={userProfile.queriesUsed < userProfile.queriesLimit || userProfile.role === UserRole.APP_ADMIN} 
          />
        );
      case 'brain':
        return userProfile.role === UserRole.APP_ADMIN ? <BrainControl brain={brain} onUpdate={setBrain} /> : <Dashboard user={userProfile} documents={documents} />;
      case 'pricing':
        return <Pricing currentPlan={userProfile.plan} onUpgrade={updatePlan} />;
      default:
        return <Dashboard user={userProfile} documents={documents} />;
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-indigo-600" /></div>;
  if (!session || !userProfile) return <Login onSession={setSession} />;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <div className={`hidden lg:block transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64'}`}>
        <Sidebar 
          currentView={currentView} 
          onViewChange={setCurrentView} 
          userProfile={userProfile} 
          isCollapsed={isCollapsed}
          setIsCollapsed={setIsCollapsed}
        />
      </div>

      {isSidebarOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 lg:hidden" onClick={() => setIsSidebarOpen(false)}>
          <div className="w-64 h-full bg-white animate-in slide-in-from-left duration-300" onClick={e => e.stopPropagation()}>
            <Sidebar 
              currentView={currentView} 
              onViewChange={(v) => { setCurrentView(v); setIsSidebarOpen(false); }} 
              userProfile={userProfile} 
              isCollapsed={false}
              setIsCollapsed={() => {}}
            />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden flex items-center justify-between p-4 bg-white border-b shadow-sm">
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg">
            <Menu size={24} />
          </button>
          <span className="font-bold text-indigo-950 tracking-tight">{APP_NAME}</span>
          <div className="w-10" />
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-6xl mx-auto">{renderView()}</div>
        </main>
      </div>
    </div>
  );
}
