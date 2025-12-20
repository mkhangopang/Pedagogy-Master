
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
import { UserRole, SubscriptionPlan, UserProfile, NeuralBrain, Document, ChatMessage } from '../types';
import { DEFAULT_MASTER_PROMPT, DEFAULT_BLOOM_RULES, ROLE_LIMITS, APP_NAME } from '../constants';
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
    const initSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        if (session) {
          await fetchProfileAndDocs(session.user.id);
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
        await fetchProfileAndDocs(session.user.id);
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

  const fetchProfileAndDocs = async (userId: string) => {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    
    const initialProfile: UserProfile = profile ? {
      id: profile.id,
      name: profile.name || 'Educator',
      email: profile.email || '',
      role: profile.role as UserRole,
      plan: profile.plan as SubscriptionPlan,
      queriesUsed: profile.queries_used || 0,
      queriesLimit: profile.queries_limit || 50
    } : {
      id: userId,
      name: 'Educator',
      email: '',
      role: UserRole.TEACHER,
      plan: SubscriptionPlan.FREE,
      queriesUsed: 0,
      queriesLimit: 50
    };

    setUserProfile(initialProfile);

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

  const handleToggleAdmin = () => {
    if (!userProfile) return;
    let newRole: UserRole;
    if (userProfile.role === UserRole.TEACHER) newRole = UserRole.ENTERPRISE_ADMIN;
    else if (userProfile.role === UserRole.ENTERPRISE_ADMIN) newRole = UserRole.APP_ADMIN;
    else newRole = UserRole.TEACHER;
    setUserProfile({ ...userProfile, role: newRole });
    if (newRole !== UserRole.APP_ADMIN && currentView === 'brain') setCurrentView('dashboard');
  };

  const incrementQueries = async () => {
    if (!userProfile) return;
    const newCount = userProfile.queriesUsed + 1;
    setUserProfile({ ...userProfile, queriesUsed: newCount });
    await supabase.from('profiles').update({ queries_used: newCount }).eq('id', userProfile.id);
  };

  const addDocument = async (doc: Document) => {
    if (!userProfile) return;
    const maxDocs = ROLE_LIMITS[userProfile.plan].docs;
    if (documents.length >= maxDocs) {
      alert(`Limit reached: ${userProfile.plan} plan supports max ${maxDocs} docs.`);
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
    if (userProfile?.plan === SubscriptionPlan.FREE) {
      alert("Free plan users cannot delete documents. Upgrade to manage library.");
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
    const limit = plan === SubscriptionPlan.FREE ? 50 : plan === SubscriptionPlan.PRO ? 500 : 999999;
    const updated = { ...userProfile, plan, queriesLimit: limit };
    setUserProfile(updated);
    await supabase.from('profiles').update({ plan, queries_limit: limit }).eq('id', userProfile.id);
    setCurrentView('dashboard');
  };

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard user={userProfile!} documents={documents} />;
      case 'documents':
        return (
          <Documents 
            documents={documents} 
            onAddDocument={addDocument} 
            onUpdateDocument={updateDocument}
            onDeleteDocument={deleteDocument}
            brain={brain}
            onQuery={incrementQueries}
            canQuery={userProfile!.queriesUsed < userProfile!.queriesLimit}
            userPlan={userProfile!.plan}
          />
        );
      case 'chat':
        return <Chat brain={brain} documents={documents} onQuery={incrementQueries} canQuery={userProfile!.queriesUsed < userProfile!.queriesLimit} />;
      case 'tools':
        return <Tools brain={brain} documents={documents} onQuery={incrementQueries} canQuery={userProfile!.queriesUsed < userProfile!.queriesLimit} />;
      case 'brain':
        return <BrainControl brain={brain} onUpdate={setBrain} />;
      case 'pricing':
        return <Pricing currentPlan={userProfile!.plan} onUpgrade={updatePlan} />;
      default:
        return <Dashboard user={userProfile!} documents={documents} />;
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
          onToggleAdmin={handleToggleAdmin}
          isCollapsed={isCollapsed}
          setIsCollapsed={setIsCollapsed}
        />
      </div>

      {isSidebarOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 lg:hidden" onClick={() => setIsSidebarOpen(false)}>
          <div className="w-64 h-full bg-white" onClick={e => e.stopPropagation()}>
            <Sidebar 
              currentView={currentView} 
              onViewChange={(v) => { setCurrentView(v); setIsSidebarOpen(false); }} 
              userProfile={userProfile} 
              onToggleAdmin={handleToggleAdmin}
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
